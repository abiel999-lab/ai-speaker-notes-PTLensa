from __future__ import annotations

import json
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.domain.models import JobRecord


class JobNotFoundError(KeyError):
    pass


class FileJobStore:
    """Small durable MVP store. Replaceable with PostgreSQL/Redis later."""

    def __init__(self, base_dir: Path) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    def _job_dir(self, job_id: str) -> Path:
        return self.base_dir / job_id

    def _record_path(self, job_id: str) -> Path:
        return self._job_dir(job_id) / "job.json"

    def save(self, job: JobRecord) -> None:
        job.touch()
        path = self._record_path(job.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        payload = job.model_dump(mode="json")
        with self._lock:
            tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            tmp.replace(path)

    def get(self, job_id: str) -> JobRecord:
        path = self._record_path(job_id)
        if not path.exists():
            raise JobNotFoundError(job_id)
        with self._lock:
            return JobRecord.model_validate_json(path.read_text(encoding="utf-8"))


    def list_recent(self, *, limit: int = 20, owner: str | None = None) -> list[JobRecord]:
        jobs: list[JobRecord] = []
        for child in self.base_dir.iterdir():
            if not child.is_dir():
                continue
            record = child / "job.json"
            if not record.exists():
                continue
            try:
                job = JobRecord.model_validate_json(record.read_text(encoding="utf-8"))
            except Exception:
                continue
            if owner is not None and job.owner not in {None, owner}:
                continue
            jobs.append(job)
        jobs.sort(key=lambda item: item.updated_at, reverse=True)
        return jobs[: max(1, min(limit, 100))]

    def delete(self, job_id: str) -> None:
        import shutil

        path = self._job_dir(job_id)
        if not path.exists():
            raise JobNotFoundError(job_id)
        shutil.rmtree(path)

    def recover_interrupted(self) -> int:
        """Mark queued/processing jobs as retryable after an unclean server restart."""
        from app.domain.models import JobStatus

        recovered = 0
        for job in self.list_recent(limit=100):
            if job.status not in {JobStatus.queued, JobStatus.processing}:
                continue
            job.status = JobStatus.failed
            job.error = "Job was interrupted by a server restart before completion."
            job.message = "Interrupted job is safe to retry; existing AI checkpoints are preserved."
            self.save(job)
            recovered += 1
        return recovered

    def cleanup_expired(self, retention_hours: int) -> int:
        cutoff = datetime.now(UTC) - timedelta(hours=retention_hours)
        removed = 0
        for child in self.base_dir.iterdir():
            if not child.is_dir():
                continue
            record = child / "job.json"
            if not record.exists():
                continue
            try:
                job = JobRecord.model_validate_json(record.read_text(encoding="utf-8"))
            except Exception:
                continue
            if job.updated_at < cutoff:
                import shutil

                shutil.rmtree(child, ignore_errors=True)
                removed += 1
        return removed
