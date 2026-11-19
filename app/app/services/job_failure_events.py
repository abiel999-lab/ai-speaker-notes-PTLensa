"""Write operational diagnostics for the internal job alert sender."""

import json
import logging
import os
import tempfile
import traceback
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

logger = logging.getLogger("notepreso.job_alerts")


def safe_token(value):
    if not isinstance(value, str) or len(value) > 120:
        return None
    return value if all(c.isascii() and (c.isalnum() or c in "-_.:") for c in value) else None


def record_failure(root, product, job_id, owner, code, *, error=None, **details):
    directory = Path(root) / ".job-alerts"
    temporary = None
    try:
        directory.mkdir(mode=0o700, exist_ok=True)
        incident = str(uuid4())
        trace = traceback.extract_tb(error.__traceback__) if error else []
        event = {
            "incident": incident, "product": product, "jobId": safe_token(job_id),
            "ownerId": safe_token(owner), "code": safe_token(code) or "UNCLASSIFIED",
            "timestamp": datetime.now(UTC).isoformat(), **details,
        }
        if error:
            event["exceptionType"] = type(error).__name__
            event["stack"] = [
                f"{Path(frame.filename).name}:{frame.lineno} ({frame.name})"
                for frame in trace[-12:]
            ]
            status = getattr(error, "status_code", None)
            if isinstance(status, int) and 100 <= status <= 599:
                event["providerStatus"] = status
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory, delete=False) as file:
            temporary = Path(file.name)
            json.dump(event, file)
            file.flush()
            os.fsync(file.fileno())
        temporary.replace(directory / f"{incident}.json")
    except (OSError, ValueError, TypeError):
        logger.exception("job_alert_spool_failed product=%s", product)
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass
