from __future__ import annotations

import hashlib
import re
import secrets
import shutil
import tempfile
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, Response

from app.core.auth import require_identity, verify_csrf
from app.core.entitlements import PlanLimitError
from app.core.job_store import JobNotFoundError
from app.core.security import UploadValidationError, validate_pptx_package
from app.services.ppt_normalizer import (
    SUPPORTED_POWERPOINT_EXTENSIONS,
    PowerPointNormalizationError,
    PowerPointNormalizer,
)
from app.core.version import get_app_version
from app.domain.models import (
    Audience,
    Depth,
    GenerationEngine,
    OpenAIModel,
    GenerationOptions,
    JobPublic,
    JobRecord,
    JobStatus,
    Language,
    NoteLength,
    NotesMode,
)

router = APIRouter(prefix="/api/v1")
health_router = APIRouter()

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._ -]+")


def _safe_display_name(filename: str | None) -> str:
    name = Path(filename or "presentation.pptx").name
    cleaned = _SAFE_NAME.sub("_", name).strip(" .")
    return cleaned[:120] or "presentation.pptx"


def _allowed_origin(request: Request, origin: str) -> bool:
    allowed = request.app.state.settings.allowed_frontend_origins
    return origin.rstrip("/") in allowed


def _require_demo_access(request: Request) -> None:
    settings = request.app.state.settings
    if not settings.demo_access_configured:
        return
    supplied = request.headers.get("x-demo-key", "")
    expected = settings.demo_access_key.get_secret_value() if settings.demo_access_key else ""
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing demo access code.")


def _require_api_access(request: Request, *, mutate: bool = False):
    _require_demo_access(request)
    identity = require_identity(request)
    if mutate:
        verify_csrf(request, identity)
    return identity


def _owned_job(request: Request, job_id: str):
    identity = require_identity(request)
    try:
        job = request.app.state.store.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc
    if request.app.state.settings.auth_enabled and job.owner != identity.owner_key:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


def _reject_cross_site_browser_request(request: Request) -> None:
    """Allow only same-origin or explicitly configured browser frontends.

    Non-browser clients without an Origin header remain usable, while an optional
    X-Demo-Key can protect the public demo API from arbitrary callers.
    """
    origin = request.headers.get("origin")
    if not origin:
        return
    if not _allowed_origin(request, origin):
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

    db = getattr(request.app.state, "db", None)
    if settings.database_url:
        db_ok = bool(db and db.healthcheck())
        checks["database"] = "ok" if db_ok else "unavailable"
        ready = ready and db_ok

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


@router.get("/capabilities")
def capabilities(request: Request) -> dict[str, object]:
    settings = request.app.state.settings
    renderer = request.app.state.renderer
    renderer_available = renderer.available()
    return {
        "service": settings.app_name,
        "version": get_app_version(),
        "max_upload_mb": settings.max_upload_mb,
        "openai_configured": settings.openai_configured,
        "openai_model": settings.openai_model,
        "vision_enabled": settings.openai_use_vision,
        "vision_ready": settings.openai_use_vision and renderer_available,
        "renderer": renderer.name if renderer_available else None,
        "demo_access_required": settings.demo_access_configured,
        "auth_enabled": settings.auth_enabled,
        "max_ai_slides": None,
        "max_vision_slides": None,
        "slide_count_policy": "automatic_batching",
        "openai_batch_size": settings.openai_batch_size,
        "chat_model": settings.openai_chat_model,
        "chat_max_message_chars": settings.chat_max_message_chars,
        "chat_max_turns_per_job": settings.chat_max_turns_per_job,
    }


@router.post("/jobs", status_code=status.HTTP_202_ACCEPTED, response_model=JobPublic)
async def create_job(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: Language = Form(Language.id),
    audience: Audience = Form(Audience.general),
    depth: Depth = Form(Depth.medium),
    note_length: NoteLength = Form(NoteLength.words_100_250),
    custom_word_limit: int | None = Form(None, ge=30, le=500),
    custom_instructions: str = Form(""),
    notes_mode: NotesMode = Form(NotesMode.missing_only),
    engine: GenerationEngine = Form(GenerationEngine.dummy),
    model: OpenAIModel = Form(OpenAIModel.gpt_6_luna),
    use_vision: bool = Form(False),
) -> JobPublic:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)

    settings = request.app.state.settings
    store = request.app.state.store
    processor = request.app.state.processor

    try:
        request.app.state.entitlements.check_presentation(
            identity.owner_key,
            use_vision=use_vision,
        )
    except PlanLimitError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    active = [
        job for job in store.list_recent(limit=100, owner=identity.owner_key if settings.auth_enabled else None)
        if job.status in {JobStatus.queued, JobStatus.processing}
    ]
    if len(active) >= settings.max_active_jobs_per_user:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many active jobs ({len(active)}). Wait for one to finish before starting another; "
                f"limit is {settings.max_active_jobs_per_user}."
            ),
        )

    if engine == GenerationEngine.openai:
        if not settings.openai_configured:
            raise HTTPException(
                status_code=503,
                detail="OpenAI is not configured. Add OPENAI_API_KEY to .env and restart.",
            )
        # Vision availability is a runtime capability, not a reason to reject the
        # entire job. The pipeline automatically falls back to text/structure context
        # when rendering is unavailable. Plan entitlements are still enforced above.

    if note_length == NoteLength.custom and custom_word_limit is None:
        raise HTTPException(
            status_code=422,
            detail="Custom word count requires a maximum between 30 and 500 words per slide.",
        )
    if note_length != NoteLength.custom:
        custom_word_limit = None
    custom_instructions = (
        custom_instructions
        .replace("\r\n", "\n")
        .replace("\r", "\n")
        .strip()
    )
    if len(custom_instructions) > 1500:
        raise HTTPException(
            status_code=422,
            detail="Additional instructions must be 1500 characters or fewer.",
        )

    filename = _safe_display_name(file.filename)
    source_suffix = Path(filename).suffix.lower()
    if source_suffix not in SUPPORTED_POWERPOINT_EXTENSIONS:
        source_suffix = ".bin"

    job_id = str(uuid.uuid4())
    if settings.database_url and settings.auth_enabled:
        owner_bucket = hashlib.sha256(identity.owner_key.encode("utf-8")).hexdigest()[:24]
        job_dir = store.base_dir / owner_bucket / job_id
    else:
        job_dir = store.base_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    source_path = job_dir / f"original-upload{source_suffix}"
    input_path = job_dir / "input.pptx"

    total = 0
    try:
        with source_path.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {settings.max_upload_mb} MB upload limit.",
                    )
                target.write(chunk)

        normalizer = PowerPointNormalizer(
            libreoffice_bin=settings.libreoffice_bin,
            timeout_seconds=settings.powerpoint_render_timeout_seconds,
        )
        normalizer.normalize(source_path, input_path)

        validate_pptx_package(
            input_path,
            max_entries=settings.max_zip_entries,
            max_uncompressed_bytes=settings.max_uncompressed_bytes,
            allow_embedded_objects=True,
        )
        # The normalized working copy is all downstream processing needs.
        source_path.unlink(missing_ok=True)
    except (UploadValidationError, PowerPointNormalizationError) as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    finally:
        await file.close()

    try:
        plan_snapshot = request.app.state.entitlements.reserve_presentation(
            identity.owner_key,
            use_vision=use_vision,
        )
    except PlanLimitError as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    options = GenerationOptions(
        language=language,
        audience=audience,
        depth=depth,
        note_length=note_length,
        custom_word_limit=custom_word_limit,
        custom_instructions=custom_instructions,
        notes_mode=notes_mode,
        engine=engine,
        model=model,
        use_vision=use_vision,
    )
    job = JobRecord(
        id=job_id,
        original_filename=filename,
        owner=identity.owner_key,
        options=options,
        input_path=str(input_path),
    )
    try:
        store.save(job)
        if request.app.state.db is not None:
            request.app.state.db.audit(
                "job_created",
                owner=identity.owner_key,
                resource_type="presentation_job",
                resource_id=job_id,
                metadata={
                    "filename": filename,
                    "engine": engine.value,
                    "model": model.value,
                    "vision": use_vision,
                    "notes_mode": notes_mode.value,
                    "plan": plan_snapshot.get("plan", "free"),
                },
            )
        background_tasks.add_task(processor.run, job_id)
        return JobPublic.from_record(store.get(job_id))
    except Exception:
        request.app.state.entitlements.release_presentation(
            identity.owner_key,
            use_vision=use_vision,
        )
        shutil.rmtree(job_dir, ignore_errors=True)
        raise


@router.post("/jobs/{job_id}/retry", status_code=status.HTTP_202_ACCEPTED, response_model=JobPublic)
def retry_job(
    request: Request,
    background_tasks: BackgroundTasks,
    job_id: UUID,
) -> JobPublic:
    """Retry a failed job while preserving recoverable AI checkpoints."""
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    job_key = str(job_id)
    store = request.app.state.store
    processor = request.app.state.processor
    try:
        job = store.get(job_key)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Job not found.") from exc
    if request.app.state.settings.auth_enabled and job.owner != identity.owner_key:
        raise HTTPException(status_code=404, detail="Job not found.")

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


@router.get("/jobs", response_model=list[JobPublic])
def list_jobs(request: Request, limit: int = 20) -> list[JobPublic]:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request)
    owner = identity.owner_key if request.app.state.settings.auth_enabled else None
    jobs = request.app.state.store.list_recent(limit=max(1, min(limit, 50)), owner=owner)
    return [JobPublic.from_record(job) for job in jobs]


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(request: Request, job_id: UUID):
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    job = _owned_job(request, str(job_id))
    if job.status == JobStatus.processing:
        raise HTTPException(status_code=409, detail="A running job cannot be deleted. Wait for it to finish first.")
    request.app.state.store.delete(str(job_id))
    if request.app.state.db is not None:
        request.app.state.db.audit(
            "job_deleted", owner=identity.owner_key, resource_type="presentation_job", resource_id=str(job_id)
        )
    return Response(status_code=204)


@router.get("/jobs/{job_id}", response_model=JobPublic)
def get_job(request: Request, job_id: UUID) -> JobPublic:
    _reject_cross_site_browser_request(request)
    _require_api_access(request)
    job = _owned_job(request, str(job_id))
    return JobPublic.from_record(job)


@router.get("/jobs/{job_id}/download")
def download_job(request: Request, job_id: UUID) -> FileResponse:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request)
    job = _owned_job(request, str(job_id))

    if not job.output_path or job.status.value != "completed":
        raise HTTPException(status_code=409, detail="Output is not ready yet.")

    output_path = Path(job.output_path)
    if not output_path.exists():
        raise HTTPException(status_code=410, detail="Output file has expired or is unavailable.")

    stem = Path(job.original_filename).stem[:80] or "presentation"
    suffix = "-with-speaker-notes"
    while stem.lower().endswith(suffix):
        stem = stem[: -len(suffix)]
    if request.app.state.db is not None:
        request.app.state.db.audit(
            "job_downloaded", owner=identity.owner_key, resource_type="presentation_job", resource_id=str(job_id)
        )
    return FileResponse(
        output_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"{stem or 'presentation'}{suffix}.pptx",
    )
