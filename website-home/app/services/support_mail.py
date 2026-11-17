from __future__ import annotations

import re
import smtplib
import threading
import time
from dataclasses import dataclass
from email.message import EmailMessage
from urllib.parse import quote, urlencode

from app.core.config import Settings


REQUEST_TYPES = {
    "technical": "Technical support",
    "billing": "Billing question",
    "refund": "Refund request",
    "other": "Other request",
}

_EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,63}$")


@dataclass(frozen=True)
class SupportRequest:
    request_type: str
    name: str
    email: str
    transaction_id: str
    message: str
    reference: str
    account_email: str = ""

    @property
    def request_label(self) -> str:
        return REQUEST_TYPES[self.request_type]


def clean_text(value: str, *, max_length: int) -> str:
    return " ".join((value or "").replace("\x00", "").strip().split())[:max_length]


def clean_message(value: str, *, max_length: int = 5000) -> str:
    value = (value or "").replace("\x00", "").strip()
    return value[:max_length]


def valid_email(value: str) -> bool:
    return bool(_EMAIL_RE.fullmatch((value or "").strip()))


def build_mailto(support_email: str, payload: SupportRequest | None = None) -> str:
    if payload is None:
        subject = "Notepreso Support Request"
        body = "Hello Notepreso Support,\n\nI need help with: \n\nDetails: \n"
    else:
        subject = f"Notepreso {payload.request_label} [{payload.reference}]"
        transaction = payload.transaction_id or "Not provided"
        body = (
            "Hello Notepreso Support,\n\n"
            f"Reference: {payload.reference}\n"
            f"Request type: {payload.request_label}\n"
            f"Name: {payload.name}\n"
            f"Email: {payload.email}\n"
            f"Transaction / invoice ID: {transaction}\n\n"
            f"Message:\n{payload.message}\n"
        )
    query = urlencode({"subject": subject, "body": body}, quote_via=quote)
    return f"mailto:{support_email}?{query}"


class SupportRateLimiter:
    def __init__(self, *, max_requests: int = 5, window_seconds: int = 900) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._events: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            recent = [stamp for stamp in self._events.get(key, []) if stamp >= cutoff]
            if len(recent) >= self.max_requests:
                self._events[key] = recent
                return False
            recent.append(now)
            self._events[key] = recent
            return True


class SupportMailer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send(self, payload: SupportRequest) -> None:
        if not self.settings.support_smtp_configured:
            raise RuntimeError("SMTP is not configured.")

        password = self.settings.smtp_password
        assert password is not None
        username = self.settings.smtp_username.strip()
        from_email = self.settings.smtp_from_email.strip() or username
        support_email = self.settings.support_email.strip()

        msg = EmailMessage()
        msg["From"] = from_email
        msg["To"] = support_email
        msg["Reply-To"] = payload.email
        msg["Subject"] = f"Notepreso {payload.request_label} [{payload.reference}]"
        transaction = payload.transaction_id or "Not provided"
        account_email = payload.account_email or "Not available"
        msg.set_content(
            "Notepreso Support Request\n\n"
            f"Reference: {payload.reference}\n"
            f"Request type: {payload.request_label}\n"
            f"Name: {payload.name}\n"
            f"Reply email: {payload.email}\n"
            f"Signed-in account email: {account_email}\n"
            f"Transaction / invoice ID: {transaction}\n\n"
            f"Message:\n{payload.message}\n"
        )

        security = self.settings.smtp_security.strip().lower()
        timeout = self.settings.smtp_timeout_seconds
        if security == "ssl":
            with smtplib.SMTP_SSL(self.settings.smtp_host, self.settings.smtp_port, timeout=timeout) as smtp:
                smtp.login(username, password.get_secret_value())
                smtp.send_message(msg)
            return

        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=timeout) as smtp:
            smtp.ehlo()
            if security == "starttls":
                smtp.starttls()
                smtp.ehlo()
            elif security != "none":
                raise RuntimeError("SMTP_SECURITY must be starttls, ssl, or none.")
            smtp.login(username, password.get_secret_value())
            smtp.send_message(msg)
