from __future__ import annotations

import re
import shutil
import tempfile
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse

from app.core.job_store import JobNotFoundError
from app.core.security import UploadValidationError, validate_pptx_package
from app.core.version import get_app_version
from app.domain.models import (
    Audience,
    Depth,
    GenerationEngine,
    GenerationOptions,
    JobPublic,
    JobRecord,
    JobStatus,
    Language,
    NotesMode,
)

router = APIRouter(prefix="/api/v1")
health_router = APIRouter()

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._ -]+")


def _safe_display_name(filename: str | None) -> str:
    name = Path(filename or "presentation.pptx").name
    cleaned = _SAFE_NAME.sub("_", name).strip(" .")
    return cleaned[:120] or "presentation.pptx"


def _reject_cross_site_browser_request(request: Request) -> None:
    """Block browser cross-site job creation while keeping CLI/API clients usable."""
    fetch_site = request.headers.get("sec-fetch-site", "").lower()
    if fetch_site == "cross-site":
        raise HTTPException(status_code=403, detail="Cross-site uploads are not allowed.")

    origin = request.headers.get("origin")
    if not origin:
        return

    expected = f"{request.url.scheme}://{request.url.netloc}"
    if origin.rstrip("/") != expected.rstrip("/"):
        raise HTTPException(status_code=403, detail="Origin is not allowed.")


def _readiness_payload(request: Request) -> tuple[dict[str, object], bool]:
    store = request.app.state.store
    settings = request.app.state.settings
    renderer = request.app.state.renderer

    checks: dict[str, object] = {}
    ready = True

    try:
        store.base_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=store.base_dir, prefix=".health-", delete=True):
            pass
        checks["storage"] = "ok"
    except OSError:
        checks["storage"] = "unavailable"
        ready = False

    renderer_available = renderer.available()
    checks["renderer"] = {
        "available": renderer_available,
        "provider": renderer.name,
        "executable": bool(renderer.executable()),
    }
    checks["openai"] = {
        "configured": settings.openai_configured,
        "model": settings.openai_model,
        "vision_enabled": settings.openai_use_vision,
        "vision_ready": (not settings.openai_use_vision) or renderer_available,
    }

    return (
        {
            "status": "ready" if ready else "not_ready",
            "service": settings.app_name,
            "version": get_app_version(),
            "checks": checks,
        },
        ready,
    )


@router.get("/health/live")
def live(request: Request) -> dict[str, str]:
    return {
        "status": "ok",
        "service": request.app.state.settings.app_name,
        "version": get_app_version(),
    }


@router.get("/health/ready")
def ready(request: Request) -> JSONResponse:
    payload, is_ready = _readiness_payload(request)
    return JSONResponse(payload, status_code=200 if is_ready else 503)


@health_router.get("/health", include_in_schema=False)
def health_alias(request: Request) -> dict[str, str]:
    return live(request)


@health_router.get("/health/live", include_in_schema=False)
def live_alias(request: Request) -> dict[str, str]:
    return live(request)


@health_router.get("/health/ready", include_in_schema=False)
def ready_alias(request: Request) -> JSONResponse:
    return ready(request)


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED, response_model=JobPublic)
async def create_job(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: Language = Form(Language.id),
    audience: Audience = Form(Audience.general),
    depth: Depth = Form(Depth.standard),
    notes_mode: NotesMode = Form(NotesMode.missing_only),
    engine: GenerationEngine = Form(GenerationEngine.dummy),
    use_vision: bool = Form(False),
) -> JobPublic:
    _reject_cross_site_browser_request(request)

    settings = request.app.state.settings
    store = request.app.state.store
    processor = request.app.state.processor

    if engine == GenerationEngine.openai:
        if not settings.openai_configured:
            raise HTTPException(
                status_code=503,
                detail="OpenAI is not configured. Add OPENAI_API_KEY to .env and restart.",
            )
        if use_vision and not settings.openai_use_vision:
            raise HTTPException(
                status_code=503,
                detail="Vision is disabled by server configuration (OPENAI_USE_VISION=false).",
            )
        if use_vision and not request.app.state.renderer.available():
            raise HTTPException(
                status_code=503,
                detail=(
                    "Vision was requested but no slide renderer is available. On Windows, install "
                    "Microsoft PowerPoint or LibreOffice; for server deployment use LibreOffice."
                ),
            )

    filename = _safe_display_name(file.filename)
    if Path(filename).suffix.lower() != ".pptx":
        raise HTTPException(status_code=415, detail="Only .pptx files are accepted.")

    job_id = str(uuid.uuid4())
    job_dir = store.base_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    input_path = job_dir / "input.pptx"

    total = 0
    try:
        with input_path.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {settings.max_upload_mb} MB upload limit.",
                    )
                target.write(chunk)

        validate_pptx_package(
            input_path,
            max_entries=settings.max_zip_entries,
            max_uncompressed_bytes=settings.max_uncompressed_bytes,
        )
    except UploadValidationError as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    finally:
        await file.close()

    options = GenerationOptions(
        language=language,
        audience=audience,
        depth=depth,
        notes_mode=notes_mode,
        engine=engine,
        use_vision=use_vision,
    )
    job = JobRecord(
        id=job_id,
        original_filename=filename,
        options=options,
        input_path=str(input_path),
    )
    store.save(job)
    background_tasks.add_task(processor.run, job_id)
    return JobPublic.from_record(store.get(job_id))


@router.post("/jobs/{job_id}/retry", status_code=status.HTTP_202_ACCEPTED, response_model=JobPublic)
def retry_job(
    request: Request,
    background_tasks: BackgroundTasks,
    job_id: UUID,
) -> JobPublic:
    """Retry a failed job while preserving recoverable AI checkpoints."""
    _reject_cross_site_browser_request(request)
    job_key = str(job_id)
    store = request.app.state.store
    processor = request.app.state.processor
    try:
        job = store.get(job_key)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc

    if job.status == JobStatus.completed:
        raise HTTPException(status_code=409, detail="Completed jobs do not need retrying.")
    if job.status == JobStatus.processing:
        raise HTTPException(status_code=409, detail="Job is still processing.")
    if job.status != JobStatus.failed:
        raise HTTPException(status_code=409, detail="Only failed jobs can be retried.")

    job.status = JobStatus.queued
    job.progress_current = 0
    job.progress_total = 0
    job.message = "Queued for retry; compatible AI checkpoint data will be reused."
    job.error = None
    job.output_path = None
    store.save(job)
    background_tasks.add_task(processor.run, job_key)
    return JobPublic.from_record(store.get(job_key))


@router.get("/jobs/{job_id}", response_model=JobPublic)
def get_job(request: Request, job_id: UUID) -> JobPublic:
    job_key = str(job_id)
    try:
        job = request.app.state.store.get(job_key)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc
    return JobPublic.from_record(job)


@router.get("/jobs/{job_id}/download")
def download_job(request: Request, job_id: UUID) -> FileResponse:
    job_key = str(job_id)
    try:
        job = request.app.state.store.get(job_key)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc

    if not job.output_path or job.status.value != "completed":
        raise HTTPException(status_code=409, detail="Output is not ready yet.")

    output_path = Path(job.output_path)
    if not output_path.exists():
        raise HTTPException(status_code=410, detail="Output file has expired or is unavailable.")

    stem = Path(job.original_filename).stem[:80] or "presentation"
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"{stem}-with-speaker-notes.pptx",
    )
