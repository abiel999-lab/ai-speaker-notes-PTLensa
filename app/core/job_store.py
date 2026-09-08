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
