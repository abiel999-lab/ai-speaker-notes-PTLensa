from __future__ import annotations

import re
import subprocess
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from app.services.support_mail import (
    REQUEST_TYPES,
    SupportRequest,
    valid_email,
)

DESTINATION = "billing@actiacarbon.com"
SSH_KEY = "/run/secrets/notepreso_mail_ed25519"
KNOWN_HOSTS = "/run/secrets/notepreso_mail_known_hosts"

class SSHSupportMailer:
    def send(self, payload: SupportRequest) -> None:
        if payload.request_type not in REQUEST_TYPES:
            raise ValueError("Invalid request type")

        if not valid_email(payload.email):
            raise ValueError("Invalid reply address")

        if not re.fullmatch(
            r"SUP-[A-F0-9]{10}", payload.reference
        ):
            raise ValueError("Invalid support reference")

        msg = EmailMessage()
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid(
            domain="actiacarbon.com"
        )
        msg["From"] = (
            "NotePreso Support <billing@actiacarbon.com>"
        )
        msg["To"] = DESTINATION
        msg["Reply-To"] = payload.email
        msg["Subject"] = (
            f"[NotePreso Support] {payload.request_label} "
            f"[{payload.reference}]"
        )

        msg.set_content(
            "NotePreso Support Request\n\n"
            f"Reference: {payload.reference}\n"
            f"Request type: {payload.request_label}\n"
            f"Name: {payload.name}\n"
            f"Reply email: {payload.email}\n"
            f"Account email: {payload.account_email or '-'}\n"
            f"Transaction ID: {payload.transaction_id or '-'}\n\n"
            f"Message:\n{payload.message}\n"
        )

        cmd = [
            "ssh",
            "-T",
            "-i", SSH_KEY,
            "-o", "BatchMode=yes",
            "-o", "PasswordAuthentication=no",
            "-o", "KbdInteractiveAuthentication=no",
            "-o", "IdentitiesOnly=yes",
            "-o", "StrictHostKeyChecking=yes",
            "-o", "UserKnownHostsFile=" + KNOWN_HOSTS,
            "-o", "ConnectTimeout=8",
            "-o", "ConnectionAttempts=1",
            "-o", "ServerAliveInterval=5",
            "-o", "ServerAliveCountMax=1",
            "cloudActia98@103.189.234.70",
        ]

        try:
            result = subprocess.run(
                cmd,
                input=msg.as_bytes(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=25,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RuntimeError(
                "SSH mail transport unavailable"
            ) from exc

        if result.returncode != 0:
            raise RuntimeError(
                "SSH mail transport rejected submission"
            )
