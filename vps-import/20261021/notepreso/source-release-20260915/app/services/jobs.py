from __future__ import annotations

import logging
import threading
import time
import traceback
from pathlib import Path

from app.core.job_store import FileJobStore
from app.domain.models import JobStatus
from app.services.integrity import IntegrityCheckError
from app.services.notes.openai_generator import AIConfigurationError, AIResponseValidationError
from app.services.pipeline import PresentationPipeline
from app.services.preflight import AICostGuardrailError, AIInputGuardrailError

logger = logging.getLogger("speaker_notes.jobs")


class JobProcessor:
    """Run jobs with bounded concurrency and per-job idempotency inside one process."""

    def __init__(
        self,
        store: FileJobStore,
        pipeline: PresentationPipeline,
        *,
        max_concurrent_jobs: int = 2,
    ) -> None:
        self.store = store
        self.pipeline = pipeline
        self._slots = threading.BoundedSemaphore(max_concurrent_jobs)
        self._registry_lock = threading.Lock()
        self._job_locks: dict[str, threading.Lock] = {}

    def _lock_for(self, job_id: str) -> threading.Lock:
        with self._registry_lock:
            return self._job_locks.setdefault(job_id, threading.Lock())

    def run(self, job_id: str) -> None:
        job_lock = self._lock_for(job_id)
        if not job_lock.acquire(blocking=False):
            logger.warning("duplicate_job_run_ignored job_id=%s", job_id)
            return

        try:
            job = self.store.get(job_id)
            if job.status == JobStatus.completed:
                logger.info("completed_job_run_ignored job_id=%s", job_id)
                return
            if job.status == JobStatus.processing:
                logger.info("already_processing_job_run_ignored job_id=%s", job_id)
                return
            if job.status not in {JobStatus.queued, JobStatus.failed}:
                logger.warning("job_not_runnable job_id=%s status=%s", job_id, job.status)
                return

            with self._slots:
                job = self.store.get(job_id)
                job.status = JobStatus.processing
                job.message = "Processing"
                job.error = None
                job.attempt_count += 1
                self.store.save(job)

                input_path = Path(job.input_path)
                output_path = input_path.parent / "result-with-notes.pptx"

                def update(current: int, total: int, message: str) -> None:
                    current_job = self.store.get(job_id)
                    current_job.progress_current = current
                    current_job.progress_total = total
                    current_job.message = message
                    self.store.save(current_job)

                result = None
                max_internal_retries = int(self.pipeline.settings.job_internal_retries)
                for internal_attempt in range(max_internal_retries + 1):
                    try:
                        result = self.pipeline.process(
                            input_path, output_path, job.options, update
                        )
                        break
                    except (AIConfigurationError, AICostGuardrailError, AIInputGuardrailError):
                        raise
                    except Exception as exc:
                        if internal_attempt >= max_internal_retries:
                            raise
                        logger.warning(
                            "job_auto_recovery job_id=%s attempt=%s/%s error_type=%s error=%s",
                            job_id,
                            internal_attempt + 1,
                            max_internal_retries,
                            type(exc).__name__,
                            exc,
                        )
                        current_job = self.store.get(job_id)
                        current_job.message = (
                            "Automatic recovery in progress; completed AI checkpoints are being reused."
                        )
                        self.store.save(current_job)
                        output_path.unlink(missing_ok=True)
                        output_path.with_suffix(".working.pptx").unlink(missing_ok=True)
                        output_path.with_suffix(".notes-template.pptx").unlink(missing_ok=True)
                        time.sleep(min(8.0, 1.5 * (2**internal_attempt)))

                assert result is not None
                job = self.store.get(job_id)
                job.status = JobStatus.completed
                job.output_path = str(output_path)
                job.existing_notes_count = result.existing_notes_count
                job.generated_notes_count = result.generated_notes_count
                job.preserved_existing_notes_count = result.preserved_existing_notes_count
                job.provider = result.provider
                job.model = result.model
                job.input_tokens = result.input_tokens
                job.cached_input_tokens = result.cached_input_tokens
                job.output_tokens = result.output_tokens
                job.total_tokens = result.total_tokens
                job.estimated_cost_usd = result.estimated_cost_usd
                job.request_count = result.request_count
                job.used_vision = result.used_vision
                job.vision_renderer = result.vision_renderer
                job.preflight_estimated_cost_usd = result.preflight_estimated_cost_usd
                job.resumed_slide_count = result.resumed_slide_count
                job.recovered_slide_count = result.recovered_slide_count
                job.warnings = result.warnings
                job.vision_target_count = result.vision_target_count
                job.vision_rendered_count = result.vision_rendered_count
                job.hidden_slide_count = result.hidden_slide_count
                job.image_dominant_slide_count = result.image_dominant_slide_count
                job.external_image_count = result.external_image_count
                suffix = ""
                if result.provider == "openai":
                    vision = (
                        f" vision: on via {result.vision_renderer};"
                        if result.used_vision
                        else " vision: off;"
                    )
                    recovery = ""
                    if result.resumed_slide_count or result.recovered_slide_count:
                        recovery = (
                            f" resumed: {result.resumed_slide_count};"
                            f" recovered: {result.recovered_slide_count};"
                        )
                    coverage = ""
                    if result.vision_target_count:
                        coverage = (
                            f" visual coverage: {result.vision_rendered_count}/{result.vision_target_count};"
                        )
                    suffix = (
                        f" Model: {result.model}; tokens: {result.total_tokens};{vision}{coverage}{recovery} "
                        f"estimated API cost: ${result.estimated_cost_usd or 0:.4f}."
                    )
                warning_suffix = ""
                if result.warnings:
                    warning_suffix = " Warning: " + result.warnings[0]
                job.message = (
                    "Completed. "
                    f"Existing notes: {result.existing_notes_count}; "
                    f"generated: {result.generated_notes_count}; "
                    f"preserved: {result.preserved_existing_notes_count}."
                    + suffix
                    + warning_suffix
                )
                self.store.save(job)
        except Exception as exc:
            job = self.store.get(job_id)
            error_log = Path(job.input_path).parent / "error.log"
            error_log.write_text(traceback.format_exc(), encoding="utf-8")

            # Detailed stack traces remain in error.log/server logs. End users should
            # never have to understand RuntimeError/token/parser internals.
            if isinstance(exc, AIConfigurationError):
                public_error = "AI processing is temporarily unavailable because the server is not fully configured."
            elif isinstance(exc, (AICostGuardrailError, AIInputGuardrailError)):
                public_error = str(exc)
            else:
                public_error = (
                    "Automatic processing could not finish this presentation after recovery attempts. "
                    "You can retry without losing completed AI checkpoints."
                )

            logger.exception(
                "job_failed job_id=%s error_type=%s error=%s error_log=%s",
                job_id,
                type(exc).__name__,
                exc,
                error_log,
            )

            job.status = JobStatus.failed
            job.error = public_error
            job.message = "Automatic processing stopped after multiple recovery attempts; AI checkpoints are preserved for retry."
            self.store.save(job)
        finally:
            job_lock.release()
