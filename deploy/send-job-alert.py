"""Send one job incident on stdin using the existing support SMTP account."""

import json
import sys
from uuid import UUID

from app.services.support_mail import SupportRequest
from app.services.support_mail_ssh import SSHSupportMailer

RECIPIENT = "billing@actiacarbon.com"
PRODUCTS = {"NotePreso", "Presentation", "Translator"}


def send(event):
    product = event["product"]
    if product not in PRODUCTS:
        raise ValueError("Unknown job product")
    incident = str(UUID(event["incident"]))
    fields = (
        "product", "incident", "timestamp", "jobId", "ownerId", "projectId",
        "status", "stage", "code", "internalCode", "exceptionType", "providerStatus",
        "attempt", "durationMs", "model", "refunded", "slides", "completedSegments", "totalSegments",
    )
    rows = [f"{key}: {event[key]}" for key in fields if event.get(key) is not None]
    stacks = event.get("stack") or []
    rows.extend(["", "Technical log (stack frames):", *stacks, ""])
    rows.append("Use Job ID to look up the full server-side log. Uploaded content and credentials are omitted.")
    SSHSupportMailer().send(SupportRequest(
        request_type="technical",
        name=f"{product} · Job monitoring",
        email=RECIPIENT,
        transaction_id="",
        message="\n".join(rows),
        reference="SUP-" + UUID(incident).hex[:10].upper(),
    ))


if __name__ == "__main__":
    send(json.load(sys.stdin))
