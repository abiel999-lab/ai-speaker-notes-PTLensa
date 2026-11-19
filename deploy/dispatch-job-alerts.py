"""Drain the three private spools and retry deliveries that SMTP did not accept."""

import fcntl
import json
import os
import re
import subprocess
from pathlib import Path

STATE = Path("/var/lib/notepreso-job-alerts")
CONTAINER = "actia-notepreso-app-live-rotated"
MAILER = "notepreso-contact-ui-20261026t050754z"
MOUNTS = (
    (CONTAINER, "/data/jobs", "NotePreso"),
    ("actia-presentation-app", "/app/data", "Presentation"),
    ("actia-translation-app", "/data", "Translator"),
)


def spool(container, mount):
    output = subprocess.check_output(
        ["docker", "inspect", "--format", "{{json .Mounts}}", container], timeout=10
    )
    root = next(item["Source"] for item in json.loads(output) if item["Destination"] == mount)
    return Path(root) / ".job-alerts"


def drain():
    failures = 0
    sender = Path(__file__).with_name("send-job-alert.py").read_text()
    for container, mount, product in MOUNTS:
        try:
            directory = spool(container, mount)
            for event in sorted(directory.glob("*.json"), key=lambda item: item.stat().st_mtime)[:12]:
                if event.is_symlink() or event.stat().st_size > 16384:
                    raise ValueError("Invalid spool file")
                raw = event.read_bytes()
                data = json.loads(raw)
                if (not re.fullmatch(r"[0-9a-f-]{36}", event.stem)
                        or data.get("incident") != event.stem or data.get("product") != product):
                    raise ValueError("Invalid spool incident")
                result = subprocess.run(
                    ["docker", "exec", "-i", MAILER, "python", "-c", sender],
                    input=raw, capture_output=True, timeout=35,
                )
                if result.returncode:
                    print(f"SMTP delivery pending for {product} incident {event.stem}", flush=True)
                    failures += 1
                    break
                event.unlink()
                print(f"SMTP accepted {product} incident {event.stem}", flush=True)
        except (OSError, ValueError, StopIteration, subprocess.SubprocessError):
            print(f"Could not drain {product} spool. Pending records retained.", flush=True)
            failures += 1
    return failures


if __name__ == "__main__":
    STATE.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(STATE / "dispatcher.lock", os.O_CREAT | os.O_RDWR, 0o600)
    with os.fdopen(fd, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        raise SystemExit(bool(drain()))
