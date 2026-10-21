from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request, status


COOKIE_NAME = "asn_session"


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


@dataclass(frozen=True)
class SessionIdentity:
    username: str
    csrf: str
    terms_version: str
    expires_at: int
    subject: str | None = None
    email: str | None = None
    display_name: str | None = None

    @property
    def owner_key(self) -> str:
        return self.subject or self.username


class SessionManager:
    """Small signed-cookie session manager for the single-account MVP.

    No password or API secret is ever written into the cookie. The payload is signed
    with HMAC-SHA256 and has a short server-configured expiry.
    """

    def __init__(self, secret: str, *, max_age_seconds: int = 8 * 60 * 60) -> None:
        if len(secret) < 32:
            raise ValueError("APP_SESSION_SECRET must contain at least 32 characters.")
        self._secret = secret.encode("utf-8")
        self.max_age_seconds = max_age_seconds

    def issue(
        self,
        username: str,
        *,
        terms_version: str,
        subject: str | None = None,
        email: str | None = None,
        display_name: str | None = None,
    ) -> tuple[str, SessionIdentity]:
        now = int(time.time())
        identity = SessionIdentity(
            username=username,
            csrf=secrets.token_urlsafe(24),
            terms_version=terms_version,
            expires_at=now + self.max_age_seconds,
            subject=subject,
            email=email,
            display_name=display_name,
        )
        payload = {
            "u": identity.username,
            "c": identity.csrf,
            "t": identity.terms_version,
            "iat": now,
            "exp": identity.expires_at,
            "s": identity.subject,
            "e": identity.email,
            "n": identity.display_name,
        }
        encoded = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        signature = _b64url_encode(hmac.new(self._secret, encoded.encode("ascii"), hashlib.sha256).digest())
        return f"{encoded}.{signature}", identity

    def parse(self, token: str | None) -> SessionIdentity | None:
        if not token or "." not in token:
            return None
        encoded, signature = token.split(".", 1)
        expected = _b64url_encode(hmac.new(self._secret, encoded.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        try:
            payload: dict[str, Any] = json.loads(_b64url_decode(encoded))
            username = str(payload["u"])
            csrf = str(payload["c"])
            terms_version = str(payload["t"])
            expires_at = int(payload["exp"])
            subject = str(payload["s"]) if payload.get("s") else None
            email = str(payload["e"]) if payload.get("e") else None
            display_name = str(payload["n"]) if payload.get("n") else None
        except (KeyError, ValueError, TypeError, json.JSONDecodeError):
            return None
        if expires_at < int(time.time()):
            return None
        return SessionIdentity(username, csrf, terms_version, expires_at, subject, email, display_name)


class LoginRateLimiter:
    """In-memory brute-force limiter suitable for the single-process MVP."""

    def __init__(self, *, max_attempts: int = 5, window_seconds: int = 300, block_seconds: int = 900) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self._lock = threading.Lock()
        self._attempts: dict[str, list[float]] = {}
        self._blocked_until: dict[str, float] = {}

    def check(self, key: str) -> None:
        now = time.time()
        with self._lock:
            blocked = self._blocked_until.get(key, 0)
            if blocked > now:
                retry_after = max(1, int(blocked - now))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many login attempts. Try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )
            attempts = [item for item in self._attempts.get(key, []) if item >= now - self.window_seconds]
            self._attempts[key] = attempts

    def failure(self, key: str) -> None:
        now = time.time()
        with self._lock:
            attempts = [item for item in self._attempts.get(key, []) if item >= now - self.window_seconds]
            attempts.append(now)
            self._attempts[key] = attempts
            if len(attempts) >= self.max_attempts:
                self._blocked_until[key] = now + self.block_seconds
                self._attempts[key] = []

    def success(self, key: str) -> None:
        with self._lock:
            self._attempts.pop(key, None)
            self._blocked_until.pop(key, None)


def request_identity(request: Request) -> SessionIdentity | None:
    settings = request.app.state.settings
    if not settings.auth_enabled:
        return SessionIdentity("local-user", "", settings.terms_version, int(time.time()) + 3600, "local-user", None, "Local User")
    manager: SessionManager = request.app.state.session_manager
    return manager.parse(request.cookies.get(COOKIE_NAME))


def require_identity(request: Request) -> SessionIdentity:
    identity = request_identity(request)
    if identity is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    settings = request.app.state.settings
    if settings.require_terms_acceptance and identity.terms_version != settings.terms_version:
        raise HTTPException(status_code=403, detail="Please accept the current Terms of Use before continuing.")
    return identity


def verify_csrf(request: Request, identity: SessionIdentity) -> None:
    settings = request.app.state.settings
    if not settings.auth_enabled:
        return
    supplied = request.headers.get("x-csrf-token", "")
    if not supplied or not hmac.compare_digest(supplied, identity.csrf):
        raise HTTPException(status_code=403, detail="Invalid CSRF token.")
