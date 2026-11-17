from __future__ import annotations

from app.core.model_policy import credits_for_slides
from app.services.document_extract import extract_document, DocumentError, MAX_BYTES
import hashlib
import re
import secrets
import shutil
import tempfile
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile, status, Query
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


def _billable_slide_count(deck, notes_mode: NotesMode) -> int:
    """Return slides that will actually be targeted by the generation pipeline."""
    if notes_mode == NotesMode.missing_only:
        return sum(1 for slide in deck.slides if not slide.has_existing_notes)
    return len(deck.slides)


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
    language: Language = Form(Language.en),
    audience: Audience = Form(Audience.general),
    depth: Depth = Form(Depth.medium),
    note_length: NoteLength = Form(NoteLength.words_100_250),
    custom_word_limit: int | None = Form(None, ge=30, le=500),
    custom_instructions: str = Form(""),
    notes_mode: NotesMode = Form(NotesMode.missing_only),
    engine: GenerationEngine = Form(GenerationEngine.dummy),
    model: OpenAIModel = Form(OpenAIModel.gpt_6_luna),
    use_vision: bool = Form(False),
    reference_document: UploadFile | None = File(None),
) -> JobPublic:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)

    reference_context = ""
    reference_name = ""
    if reference_document is not None and reference_document.filename:
        try:
            raw = await reference_document.read(MAX_BYTES + 1)
            reference_context = extract_document(reference_document.filename, raw)["text"]
            reference_name = _safe_display_name(reference_document.filename)
        except DocumentError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        finally:
            await reference_document.close()
    settings = request.app.state.settings
    store = request.app.state.store
    processor = request.app.state.processor

    try:
        request.app.state.entitlements.check_presentation(
            identity.owner_key,
            use_vision=use_vision,
        )
    except PlanLimitError as exc:
        raise HTTPException(status_code=402, detail=exc.public_detail()) from exc

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
    if len(custom_instructions.split()) > 5000:
        raise HTTPException(
            status_code=422,
            detail="Additional instructions must be 5000 words or fewer.",
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

    # Parse once before queueing so billing is based on the same slide-selection
    # semantics as the processing pipeline.
    try:
        parsed_deck = request.app.state.parser.parse(input_path)
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(
            status_code=422,
            detail="The presentation could not be parsed for slide processing.",
        ) from exc

    eligible_slide_count = _billable_slide_count(parsed_deck, notes_mode)

    plan_snapshot = request.app.state.entitlements.account_snapshot(identity.owner_key)
    plan_code = str(plan_snapshot.get("plan") or "free")

    if plan_code == "free" and model == OpenAIModel.gpt_6_1_terra:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=402, detail="Terra requires an active Pro account")

    preview_slide_limit = None
    credit_required = 0
    credit_reservation_key = None
    credit_monthly_used = 0
    credit_topup_used = 0

    try:
        if plan_code == "free":
            # All Free accounts share the same weekly, per-account quota.
            plan_snapshot = request.app.state.entitlements.reserve_presentation(
                identity.owner_key,
                use_vision=use_vision,
                job_id=job_id,
            )
            preview_slide_limit = settings.free_preview_slide_limit
        else:
            # Reserve the selected model's rate for each eligible target slide.
            credit_required = credits_for_slides(model, int(eligible_slide_count))

            if credit_required > 0:
                credit_reservation_key = f"slide-reserve:{job_id}:initial"

                credit_result = request.app.state.entitlements.reserve_slide_credits(
                    identity.owner_key,
                    credits=credit_required,
                    job_id=job_id,
                    idempotency_key=credit_reservation_key,
                    metadata={
                        "phase": "initial_job",
                        "notes_mode": notes_mode.value,
                        "eligible_slides": int(eligible_slide_count),
                        "model": model.value,
                        "credits_per_slide": credits_for_slides(model, 1),
                    },
                )

                credit_monthly_used = int(credit_result.get("monthly_used", 0))
                credit_topup_used = int(credit_result.get("topup_used", 0))

    except PlanLimitError as exc:
        # Preserve a fully validated paid presentation when the only blocker is
        # insufficient AI Slide Credits. The user can buy credits and resume the
        # same stored job without uploading the PowerPoint again.
        if credit_required <= 0:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise HTTPException(
                status_code=402,
                detail=exc.public_detail(),
            ) from exc

        detail = exc.public_detail()

        if isinstance(detail, dict):
            message = str(
                detail.get("message")
                or detail.get("detail")
                or "Additional AI Slide Credits are required."
            )
        else:
            message = str(detail)

        pending_options = GenerationOptions(
            language=language,
            audience=audience,
            depth=depth,
            note_length=note_length,
            custom_word_limit=custom_word_limit,
            custom_instructions=custom_instructions,
            reference_context=reference_context,
            reference_name=reference_name,
            notes_mode=notes_mode,
            engine=engine,
            model=model,
            use_vision=use_vision,
            target_slide_limit=None,
        )

        pending_job = JobRecord(
            id=job_id,
            original_filename=filename,
            owner=identity.owner_key,
            options=pending_options,
            input_path=str(input_path),
            status=JobStatus.failed,
            message="Waiting for additional AI Slide Credits.",
            error=message,
            credit_required=credit_required,
            credit_reservation_key=None,
            credit_monthly_used=0,
            credit_topup_used=0,
            credit_refunded=False,
            credit_refund_key=None,
        )

        try:
            store.save(pending_job)
        except Exception:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise

        if request.app.state.db is not None:
            try:
                request.app.state.db.audit(
                    "job_waiting_for_credits",
                    owner=identity.owner_key,
                    resource_type="presentation_job",
                    resource_id=job_id,
                    metadata={
                        "filename": filename,
                        "credit_required": credit_required,
                        "eligible_slides": eligible_slide_count,
                        "engine": engine.value,
                        "model": model.value,
                    },
                )
            except Exception:
                pass

        pending_detail = (
            dict(detail)
            if isinstance(detail, dict)
            else {"message": message}
        )

        pending_detail.update(
            {
                "job_id": job_id,
                "credit_required": credit_required,
                "resume_mode": "retry",
            }
        )

        raise HTTPException(
            status_code=402,
            detail=pending_detail,
        ) from exc

    options = GenerationOptions(
        language=language,
        audience=audience,
        depth=depth,
        note_length=note_length,
        custom_word_limit=custom_word_limit,
        custom_instructions=custom_instructions,
            reference_context=reference_context,
            reference_name=reference_name,
        notes_mode=notes_mode,
        engine=engine,
        model=model,
        use_vision=use_vision,
        target_slide_limit=preview_slide_limit,
    )
    job = JobRecord(
        id=job_id,
        original_filename=filename,
        owner=identity.owner_key,
        options=options,
        input_path=str(input_path),
        credit_required=credit_required,
        credit_reservation_key=credit_reservation_key,
        credit_monthly_used=credit_monthly_used,
        credit_topup_used=credit_topup_used,
        credit_refunded=False,
        credit_refund_key=None,
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
                    "eligible_slides": eligible_slide_count,
                    "credit_required": credit_required,
                    "credit_monthly_used": credit_monthly_used,
                    "credit_topup_used": credit_topup_used,
                },
            )
        background_tasks.add_task(processor.run, job_id)
        return JobPublic.from_record(store.get(job_id))
    except Exception:
        if credit_reservation_key:
            try:
                request.app.state.entitlements.refund_slide_credits(
                    identity.owner_key,
                    reservation_key=credit_reservation_key,
                    idempotency_key=f"slide-refund:{job_id}:prequeue",
                    metadata={"reason": "job_queue_setup_failed"},
                )
            except Exception:
                # Preserve the original queue/setup exception. The immutable
                # ledger/idempotency key still allows reconciliation later.
                pass

        request.app.state.entitlements.release_presentation(
            identity.owner_key,
            use_vision=use_vision,
            plan=str(plan_snapshot.get("plan") or "free"),
            job_id=job_id,
        )
        shutil.rmtree(job_dir, ignore_errors=True)
        raise


@router.post("/jobs/{job_id}/continue", status_code=status.HTTP_202_ACCEPTED, response_model=JobPublic)
def continue_preview_job(
    request: Request,
    background_tasks: BackgroundTasks,
    job_id: UUID,
) -> JobPublic:
    """Continue a free-preview job after the owner has active Pro access."""
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    job_key = str(job_id)
    store = request.app.state.store
    processor = request.app.state.processor
    job = _owned_job(request, job_key)

    snapshot = request.app.state.entitlements.account_snapshot(identity.owner_key)
    if snapshot.get("plan") != "pro":
        exc = PlanLimitError(
            "An active Pro subscription is required to continue the complete presentation.",
            code="pro_required",
        )
        raise HTTPException(
            status_code=402,
            detail=exc.public_detail(),
        ) from exc

    if job.options.target_slide_limit is None:
        raise HTTPException(
            status_code=409,
            detail="This presentation is already configured for full processing.",
        )

    if job.status == JobStatus.processing:
        raise HTTPException(
            status_code=409,
            detail="This presentation is still processing.",
        )

    if job.status != JobStatus.completed:
        raise HTTPException(
            status_code=409,
            detail=(
                "The free preview must finish successfully before the remaining "
                "slides can be continued with Pro."
            ),
        )

    remaining_slides = int(job.remaining_unprocessed_slides or 0)
    remaining_credits = credits_for_slides(job.options.model, remaining_slides)

    if remaining_credits <= 0:
        raise HTTPException(
            status_code=409,
            detail="This preview has no remaining eligible slides to process.",
        )

    # A continuation is a new paid generation phase on the same presentation.
    # Only slides that remained locked after the free preview are billable.
    base_reservation_key = (
        f"slide-reserve:{job_key}:continue-{job.attempt_count + 1}"
    )

    # If a previous pre-queue continuation attempt was refunded, derive the next
    # deterministic reservation key from that refund state so a refunded ledger
    # reservation is never accidentally reused as a fresh debit.
    if job.credit_refunded and job.credit_refund_key:
        import hashlib

        refund_state = hashlib.sha256(
            job.credit_refund_key.encode("utf-8")
        ).hexdigest()[:12]

        reservation_key = (
            f"{base_reservation_key}:after-{refund_state}"
        )
    else:
        reservation_key = base_reservation_key

    try:
        credit_result = request.app.state.entitlements.reserve_slide_credits(
            identity.owner_key,
            credits=remaining_credits,
            job_id=job_key,
            idempotency_key=reservation_key,
            metadata={
                "phase": "continue_after_free_preview",
                "remaining_slides": remaining_slides,
                "model": job.options.model.value,
                "previous_preview_limit": job.options.target_slide_limit,
            },
        )
    except PlanLimitError as exc:
        raise HTTPException(
            status_code=402,
            detail=exc.public_detail(),
        ) from exc

    previous_target_limit = job.options.target_slide_limit
    previous_status = job.status
    previous_message = job.message
    previous_error = job.error
    previous_output_path = job.output_path
    previous_preview_limited = job.preview_limited
    previous_remaining = job.remaining_unprocessed_slides

    job.credit_required = remaining_credits
    job.credit_reservation_key = reservation_key
    job.credit_monthly_used = int(
        credit_result.get("monthly_used", 0)
    )
    job.credit_topup_used = int(
        credit_result.get("topup_used", 0)
    )
    job.credit_refunded = False
    job.credit_refund_key = None

    job.options.target_slide_limit = None
    job.status = JobStatus.queued
    job.progress_current = 0
    job.progress_total = 0
    job.message = (
        f"Pro activated. {remaining_slides} remaining slide(s) queued "
        "for complete processing."
    )
    job.error = None
    job.output_path = None
    job.preview_limited = False
    job.remaining_unprocessed_slides = 0

    try:
        store.save(job)

        if request.app.state.db is not None:
            request.app.state.db.audit(
                "preview_continued_after_upgrade",
                owner=identity.owner_key,
                resource_type="presentation_job",
                resource_id=job_key,
                metadata={
                    "credit_required": remaining_credits,
                    "credit_monthly_used": job.credit_monthly_used,
                    "credit_topup_used": job.credit_topup_used,
                    "reservation_phase": "continue_after_free_preview",
                },
            )

        background_tasks.add_task(processor.run, job_key)

    except Exception:
        refund_key = (
            f"slide-refund:{job_key}:continue-prequeue:"
            f"{reservation_key.rsplit(':', 1)[-1]}"
        )

        refund_succeeded = False

        try:
            request.app.state.entitlements.refund_slide_credits(
                identity.owner_key,
                reservation_key=reservation_key,
                idempotency_key=refund_key,
                metadata={
                    "reason": "continue_queue_setup_failed",
                    "credits": remaining_credits,
                },
            )
            refund_succeeded = True
        except Exception:
            pass

        # Restore the preview state so the user can safely try Continue again.
        job.options.target_slide_limit = previous_target_limit
        job.status = previous_status
        job.message = previous_message
        job.error = previous_error
        job.output_path = previous_output_path
        job.preview_limited = previous_preview_limited
        job.remaining_unprocessed_slides = previous_remaining

        # Keep the refunded reservation bookkeeping on the job. This lets the
        # next Continue request derive a fresh idempotency key and prevents a
        # refunded reservation from being treated as a new debit.
        if refund_succeeded:
            job.credit_required = remaining_credits
            job.credit_reservation_key = reservation_key
            job.credit_refunded = True
            job.credit_refund_key = refund_key

        try:
            store.save(job)
        except Exception:
            pass

        raise

    return JobPublic.from_record(store.get(job_key))


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

    new_reservation_key = None

    if job.credit_required == 0:
        try:
            snapshot = request.app.state.entitlements.reserve_presentation(
                identity.owner_key, use_vision=job.options.use_vision, job_id=job_key)
            if snapshot["plan"] == "free":
                job.options.target_slide_limit = min(
                    job.options.target_slide_limit or request.app.state.settings.free_preview_slide_limit,
                    request.app.state.settings.free_preview_slide_limit)
        except PlanLimitError as exc:
            raise HTTPException(status_code=402, detail=exc.public_detail()) from exc

    if job.credit_required > 0:
        snapshot = request.app.state.entitlements.account_snapshot(
            identity.owner_key
        )

        if snapshot.get("plan") != "pro":
            exc = PlanLimitError(
                "An active Pro subscription is required to retry this presentation.",
                code="pro_required",
            )
            raise HTTPException(
                status_code=402,
                detail=exc.public_detail(),
            ) from exc

        # Normal permanent failures refund the prior attempt. A retry therefore
        # needs a fresh reservation. If refund reconciliation failed, however,
        # credit_refunded remains False and the existing reservation is reused
        # instead of charging twice.
        if job.credit_refunded or not job.credit_reservation_key:
            new_reservation_key = (
                f"slide-reserve:{job_key}:retry-{job.attempt_count + 1}"
            )

            try:
                credit_result = (
                    request.app.state.entitlements.reserve_slide_credits(
                        identity.owner_key,
                        credits=job.credit_required,
                        job_id=job_key,
                        idempotency_key=new_reservation_key,
                        metadata={
                            "phase": "job_retry",
                            "previous_attempt_count": job.attempt_count,
                        },
                    )
                )
            except PlanLimitError as exc:
                raise HTTPException(
                    status_code=402,
                    detail=exc.public_detail(),
                ) from exc

            job.credit_reservation_key = new_reservation_key
            job.credit_monthly_used = int(
                credit_result.get("monthly_used", 0)
            )
            job.credit_topup_used = int(
                credit_result.get("topup_used", 0)
            )
            job.credit_refunded = False
            job.credit_refund_key = None

    job.status = JobStatus.queued
    job.progress_current = 0
    job.progress_total = 0
    job.message = (
        "Queued for retry; compatible AI checkpoint data will be reused."
    )
    job.error = None
    job.output_path = None

    try:
        store.save(job)
        background_tasks.add_task(processor.run, job_key)
    except Exception:
        # If retry setup fails after acquiring a fresh reservation, restore it
        # immediately. Existing unreconciled reservations are deliberately left
        # untouched because no new debit happened in this request.
        if new_reservation_key:
            try:
                refund_key = (
                    f"slide-refund:{job_key}:retry-prequeue-"
                    f"{job.attempt_count + 1}"
                )

                request.app.state.entitlements.refund_slide_credits(
                    identity.owner_key,
                    reservation_key=new_reservation_key,
                    idempotency_key=refund_key,
                    metadata={"reason": "retry_queue_setup_failed"},
                )

                job.credit_refunded = True
                job.credit_refund_key = refund_key
                job.status = JobStatus.failed

                try:
                    store.save(job)
                except Exception:
                    pass

            except Exception:
                pass

        raise

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
    identity = _require_api_access(request)
    job = _owned_job(request, str(job_id))
    result = JobPublic.from_record(job)
    result.can_verify_email = bool(
        request.app.state.settings.keycloak_enabled
        and identity.email and not identity.email_verified
        and job.status == JobStatus.completed and job.options.target_slide_limit is not None
    )
    return result


from functools import lru_cache


@lru_cache(maxsize=1)
def _deck_language_factory():
    import sys
    dependency_path = str(Path(__file__).resolve().parents[2] / "language-deps")
    if dependency_path not in sys.path:
        sys.path.insert(0, dependency_path)
    from langdetect.detector_factory import DetectorFactory, PROFILES_DIRECTORY
    factory = DetectorFactory()
    factory.seed = 0
    factory.load_profile(PROFILES_DIRECTORY)
    return factory


def _detect_deck_language(deck) -> dict:
    """Conservative offline text detection; never use old speaker notes."""
    texts = []
    for slide in deck.slides[:30]:
        if slide.hidden:
            continue
        parts = list(slide.texts)
        for table in slide.tables:
            parts.extend(cell for row in table for cell in row)
        texts.append(" ".join(parts)[:1500])
    sample = " ".join(texts)[:12000]
    if sum(char.isalpha() for char in sample) < 150:
        return {"detected_language": None, "language_detection": "insufficient_text"}
    try:
        factory = _deck_language_factory()
        def probabilities(text):
            detector = factory.create()
            detector.append(text)
            return detector.get_probabilities()
        ranked = probabilities(sample)
        if not ranked or ranked[0].prob < 0.98:
            return {"detected_language": None, "language_detection": "mixed_or_uncertain"}
        winner = ranked[0].lang
        candidates = [text for text in texts if sum(c.isalpha() for c in text) >= 100]
        indices = sorted({round(i * (len(candidates) - 1) / 5) for i in range(6)}) if candidates else []
        for index in indices:
            evidence = probabilities(candidates[index])
            if evidence and evidence[0].prob >= 0.95 and evidence[0].lang.split("-")[0] != winner.split("-")[0]:
                return {"detected_language": None, "language_detection": "mixed_or_uncertain"}
        key = {"tl": "fil"}.get(winner, winner.replace("-", "_"))
        try:
            language = Language[key]
        except KeyError:
            return {"detected_language": None, "language_detection": "unsupported"}
        return {"detected_language": language.value, "language_detection": "detected"}
    except Exception:
        return {"detected_language": None, "language_detection": "unavailable"}


from threading import BoundedSemaphore
_preflight_slots = BoundedSemaphore(2)


@router.post("/presentations/preflight")
async def presentation_preflight(request: Request, file: UploadFile = File(...)) -> JSONResponse:
    """Inspect a temporary upload; never create a job or reserve usage/credits."""
    from starlette.concurrency import run_in_threadpool
    import zipfile
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    settings = request.app.state.settings
    if not _preflight_slots.acquire(blocking=False):
        await file.close()
        raise HTTPException(status_code=429, detail="Presentation checks are busy. Please try again shortly.")
    try:
        snapshot = request.app.state.entitlements.account_snapshot(identity.owner_key)
        with tempfile.TemporaryDirectory(prefix="notepreso-preflight-") as directory:
            folder = Path(directory)
            suffix = Path(_safe_display_name(file.filename)).suffix.lower()
            source = folder / ("upload" + (suffix if suffix in SUPPORTED_POWERPOINT_EXTENSIONS else ".bin"))
            target = folder / "normalized.pptx"
            size = 0
            with source.open("wb") as stream:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > settings.max_upload_bytes:
                        raise HTTPException(status_code=413, detail="This file exceeds the upload size limit.")
                    stream.write(chunk)
            def inspect():
                if zipfile.is_zipfile(source):
                    validate_pptx_package(source, max_entries=settings.max_zip_entries, max_uncompressed_bytes=settings.max_uncompressed_bytes, allow_embedded_objects=True)
                PowerPointNormalizer(libreoffice_bin=settings.libreoffice_bin, timeout_seconds=settings.powerpoint_render_timeout_seconds).normalize(source, target)
                validate_pptx_package(target, max_entries=settings.max_zip_entries, max_uncompressed_bytes=settings.max_uncompressed_bytes, allow_embedded_objects=True)
                deck = request.app.state.parser.parse(target)
                return {"slide_count": len(deck.slides), "existing_notes_count": deck.existing_notes_count,
                        "empty_notes_count": _billable_slide_count(deck, NotesMode.missing_only),
                        **_detect_deck_language(deck)}
            try:
                result = await run_in_threadpool(inspect)
            except (PowerPointNormalizationError, UploadValidationError):
                raise HTTPException(status_code=422, detail="This PowerPoint could not be checked. Try a valid PPTX file.") from None
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=422, detail="The presentation could not be read.") from None
        pro = snapshot.get("plan") == "pro"
        result.update(plan="pro" if pro else "free",
                      preview_slide_limit=int(snapshot.get("limits", {}).get("preview_slides") or settings.free_preview_slide_limit),
                      credits_available=int(snapshot.get("credits", {}).get("total") or 0),
                      credits_per_slide={"gpt-6-luna": credits_for_slides(OpenAIModel.gpt_6_luna, 1),
                                         "gpt-6.1-terra": credits_for_slides(OpenAIModel.gpt_6_1_terra, 1)},
                      weekly_remaining=snapshot.get("remaining", {}).get("presentations"))
        return JSONResponse(result, headers={"Cache-Control": "private, no-store"})
    finally:
        await file.close()
        _preflight_slots.release()


@router.get("/jobs/{job_id}/notes-preview")
def notes_preview(
    request: Request, job_id: UUID,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=20),
) -> JSONResponse:
    """Read a bounded page of output notes after ownership and preview checks."""
    import json
    from pptx import Presentation

    _reject_cross_site_browser_request(request)
    _require_api_access(request)
    job = _owned_job(request, str(job_id))
    if job.status != JobStatus.completed or not job.output_path:
        raise HTTPException(status_code=409, detail="Notes are not ready yet.")
    folder = Path(job.input_path).resolve().parent
    output = Path(job.output_path).resolve()
    if output.parent != folder or not output.is_file():
        raise HTTPException(status_code=410, detail="The result has expired or is unavailable.")
    selected = None
    preserved = set()
    target_limit = job.options.target_slide_limit
    if job.preview_limited and target_limit is None:
        raise HTTPException(status_code=409, detail="Preview access could not be confirmed.")
    if target_limit is not None:
        metadata = folder / "presentation.json"
        try:
            if not metadata.is_file() or metadata.stat().st_size > 16 * 1024 * 1024:
                raise ValueError("Missing metadata")
            original = json.loads(metadata.read_text(encoding="utf-8"))
            entries = original["slides"]
            if not isinstance(entries, list):
                raise ValueError("Invalid metadata")
            numbers = [int(item["number"]) for item in entries]
            if numbers != list(range(1, len(entries) + 1)):
                raise ValueError("Invalid order")
            preserved = {int(item["number"]) for item in entries if item.get("has_existing_notes") is True} if job.options.notes_mode == NotesMode.missing_only else set()
            selected = set(number for number in numbers if number not in preserved)
            selected = set(sorted(selected)[:target_limit])
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(status_code=409, detail="Preview access could not be confirmed.") from None
    try:
        presentation = Presentation(output)
    except Exception:
        raise HTTPException(status_code=410, detail="The result could not be read. Try downloading it.") from None
    total = len(presentation.slides)
    if target_limit is not None and len(entries) != total:
        raise HTTPException(status_code=409, detail="Preview access could not be confirmed.")
    slides = []
    for index in range(offset, min(total, offset + limit)):
        number = index + 1
        locked = selected is not None and number not in selected and number not in preserved
        if locked:
            slides.append({"number": number, "locked": True})
            continue
        slide = presentation.slides[index]
        try:
            title = slide.shapes.title.text if slide.shapes.title is not None else ""
        except Exception:
            title = ""
        notes = ""
        try:
            if slide.has_notes_slide:
                frame = slide.notes_slide.notes_text_frame
                notes = frame.text if frame is not None else ""
        except Exception:
            slides.append({"number": number, "locked": False, "title": title[:500], "unavailable": True})
            continue
        slides.append({"number": number, "locked": False, "title": title[:500],
                       "notes": notes[:50000], "truncated": len(notes) > 50000,
                       "preserved": number in preserved})
    return JSONResponse({"job_id": job.id, "filename": job.original_filename,
                         "slide_count": total, "offset": offset,
                         "next_offset": offset + limit if offset + limit < total else None,
                         "preview_limited": bool(job.preview_limited), "slides": slides},
                        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


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
