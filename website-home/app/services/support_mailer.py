from __future__ import annotations

import logging
import smtplib
import ssl
import threading
import time
import uuid
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formatdate

from app.core.config import Settings

logger = logging.getLogger("speaker_notes.support")


@dataclass(frozen=True)
class SupportAttachment:
    filename: str
    content_type: str
    data: bytes


class SupportRateLimiter:
    """Small per-account limiter for support form submissions."""

    def __init__(self, *, max_requests: int = 6, window_seconds: int = 3600) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._lock = threading.Lock()
        self._events: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            events = [item for item in self._events.get(key, []) if item >= cutoff]
            if len(events) >= self.max_requests:
                self._events[key] = events
                return False
            events.append(now)
            self._events[key] = events
            return True


class SupportMailer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def configured(self) -> bool:
        return self.settings.support_smtp_configured

    def _connect(self):
        host = self.settings.smtp_host.strip()
        port = self.settings.smtp_port
        timeout = self.settings.smtp_timeout_seconds
        if self.settings.smtp_use_ssl:
            return smtplib.SMTP_SSL(
                host,
                port,
                timeout=timeout,
                context=ssl.create_default_context(),
            )
        smtp = smtplib.SMTP(host, port, timeout=timeout)
        smtp.ehlo()
        if self.settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        return smtp

    def probe(self) -> None:
        if not self.configured:
            raise RuntimeError("SMTP support belum dikonfigurasi.")
        assert self.settings.smtp_password is not None
        with self._connect() as smtp:
            smtp.login(
                self.settings.smtp_username.strip(),
                self.settings.smtp_password.get_secret_value(),
            )
            smtp.noop()

    def send_request(
        self,
        *,
        request_type: str,
        name: str,
        account_email: str,
        subject: str,
        message: str,
        provider: str = "",
        transaction_id: str = "",
        payment_date: str = "",
        amount: str = "",
        attachment: SupportAttachment | None = None,
    ) -> str:
        if not self.configured:
            raise RuntimeError("SMTP support belum dikonfigurasi.")

        request_id = f"SUP-{uuid.uuid4().hex[:10].upper()}"
        from_email = self.settings.smtp_from_email.strip() or self.settings.smtp_username.strip()
        inbox = self.settings.support_inbox_email.strip()
        clean_type = request_type.strip().lower()

        internal = EmailMessage()
        internal["Date"] = formatdate(localtime=True)
        internal["From"] = f"NotePreso Support <{from_email}>"
        internal["To"] = inbox
        internal["Reply-To"] = account_email
        internal["Subject"] = f"[NotePreso {clean_type.upper()}] {request_id} - {subject}"
        internal.set_content(
            "\n".join(
                [
                    f"Request ID: {request_id}",
                    f"Jenis: {clean_type}",
                    f"Nama: {name}",
                    f"Email akun: {account_email}",
                    f"Provider pembayaran: {provider or '-'}",
                    f"Invoice/Transaction ID: {transaction_id or '-'}",
                    f"Tanggal pembayaran: {payment_date or '-'}",
                    f"Jumlah pembayaran: {amount or '-'}",
                    "",
                    "Pesan / alasan:",
                    message,
                ]
            )
        )
        if attachment is not None:
            maintype, _, subtype = attachment.content_type.partition("/")
            if not maintype or not subtype:
                maintype, subtype = "application", "octet-stream"
            internal.add_attachment(
                attachment.data,
                maintype=maintype,
                subtype=subtype,
                filename=attachment.filename,
            )

        assert self.settings.smtp_password is not None
        with self._connect() as smtp:
            smtp.login(
                self.settings.smtp_username.strip(),
                self.settings.smtp_password.get_secret_value(),
            )
            smtp.send_message(internal)

            if self.settings.support_send_ack:
                ack = EmailMessage()
                ack["Date"] = formatdate(localtime=True)
                ack["From"] = f"NotePreso Support <{from_email}>"
                ack["To"] = account_email
                ack["Subject"] = f"Permintaan diterima - {request_id}"
                ack.set_content(
                    "\n".join(
                        [
                            f"Halo {name},",
                            "",
                            "Permintaan Anda sudah diterima oleh NotePreso.",
                            f"Nomor referensi: {request_id}",
                            f"Jenis: {clean_type}",
                            f"Subjek: {subject}",
                            "",
                            "Balas email ini jika perlu menambahkan informasi.",
                            "Untuk keamanan, jangan kirim password, OTP, CVV, atau nomor kartu lengkap.",
                            "",
                            "NotePreso Support",
                        ]
                    )
                )
                smtp.send_message(ack)

        logger.info("support_request_sent request_id=%s type=%s", request_id, clean_type)
        return request_id
