from __future__ import annotations

from app.services.job_failure_events import record_failure

import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select

from app.core.database import DatabaseManager, JobRow
from app.core.job_store import JobNotFoundError
from app.domain.models import JobRecord, JobStatus


class PostgresJobStore:
    """PostgreSQL-backed job metadata with durable filesystem artifacts."""

    def __init__(self, base_dir: Path, db: DatabaseManager) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.db = db

    def _job_dir(self, job_id: str) -> Path:
        # Job input_path remains authoritative because production storage is owner-partitioned.
        return self.base_dir / job_id

    def save(self, job: JobRecord) -> None:
        job.touch()
        payload = job.model_dump(mode="json")
        with self.db.session() as session:
            row = session.get(JobRow, job.id)
            if row is None:
                row = JobRow(
                    id=job.id,
                    owner=job.owner,
                    status=job.status.value,
                    created_at=job.created_at,
                    updated_at=job.updated_at,
                    payload=payload,
                )
                session.add(row)
            else:
                row.owner = job.owner
                row.status = job.status.value
                row.created_at = job.created_at
                row.updated_at = job.updated_at
                row.payload = payload
            session.commit()

    def get(self, job_id: str) -> JobRecord:
        with self.db.session() as session:
            row = session.get(JobRow, job_id)
            if row is None:
                raise JobNotFoundError(job_id)
            return JobRecord.model_validate(row.payload)

    def list_recent(self, *, limit: int = 20, owner: str | None = None) -> list[JobRecord]:
        with self.db.session() as session:
            stmt = select(JobRow)
            if owner is not None:
                stmt = stmt.where(JobRow.owner == owner)
            stmt = stmt.order_by(JobRow.updated_at.desc()).limit(max(1, min(limit, 100)))
            return [JobRecord.model_validate(row.payload) for row in session.execute(stmt).scalars().all()]

    def delete(self, job_id: str) -> None:
        job = self.get(job_id)
        with self.db.session() as session:
            row = session.get(JobRow, job_id)
            if row is None:
                raise JobNotFoundError(job_id)
            session.delete(row)
            session.commit()
        try:
            shutil.rmtree(Path(job.input_path).parent, ignore_errors=True)
        except OSError:
            pass

    def recover_interrupted(self) -> int:
        recovered = 0
        for job in self.list_recent(limit=100):
            if job.status not in {JobStatus.queued, JobStatus.processing}:
                continue
            job.status = JobStatus.failed
            job.error = "Job was interrupted by a server restart before completion."
            job.message = "Interrupted job is safe to retry; existing AI checkpoints are preserved."
            self.save(job)
            record_failure(self.base_dir, "NotePreso", job.id, job.owner, "PROCESS_INTERRUPTED",
                           status="failed", stage="Restart recovery", attempt=job.attempt_count)
            recovered += 1
        return recovered

    def cleanup_expired(self, retention_hours: int) -> int:
        cutoff = datetime.now(UTC) - timedelta(hours=retention_hours)
        with self.db.session() as session:
            rows = session.execute(select(JobRow).where(JobRow.updated_at < cutoff)).scalars().all()
            expired = [JobRecord.model_validate(row.payload) for row in rows]
        removed = 0
        for job in expired:
            try:
                self.delete(job.id)
                removed += 1
            except JobNotFoundError:
                pass
        return removed
