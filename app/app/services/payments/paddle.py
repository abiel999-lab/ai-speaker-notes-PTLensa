from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import Settings


class PaddleError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class PaddleSignatureError(PaddleError):
    def __init__(self, message: str = "Invalid Paddle webhook signature.") -> None:
        super().__init__(message, status_code=401)


class PaddlePaymentClient:
    """Minimal Paddle Billing adapter for one-time NotePreso Pro purchases."""

    def __init__(self, settings: Settings, *, http: httpx.Client | None = None) -> None:
        if not settings.paddle_configured:
            raise ValueError("Paddle billing is not fully configured.")
        assert settings.paddle_api_key is not None
        self.settings = settings
        self.base_url = settings.paddle_api_base_url.rstrip("/")
        self.api_key = settings.paddle_api_key.get_secret_value()
        self.http = http or httpx.Client(
            timeout=httpx.Timeout(settings.paddle_timeout_seconds, connect=5.0),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )

    def _request(self, method: str, path: str, *, json_body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = self.http.request(
                method,
                f"{self.base_url}{path}",
                json=json_body,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        except httpx.HTTPError as exc:
            raise PaddleError("Unable to reach Paddle. Please try again.", status_code=503) from exc

        if response.status_code >= 400:
            detail = f"Paddle returned HTTP {response.status_code}."
            try:
                payload = response.json()
                if isinstance(payload, dict):
                    error = payload.get("error")
                    if isinstance(error, dict):
                        detail = str(error.get("detail") or error.get("code") or detail)
            except (ValueError, TypeError):
                pass
            raise PaddleError(detail, status_code=502)

        try:
            payload = response.json()
        except ValueError as exc:
            raise PaddleError("Paddle returned an invalid response.") from exc
        if not isinstance(payload, dict):
            raise PaddleError("Paddle returned an invalid response.")
        return payload

    def create_pro_one_time_session(
        self,
        *,
        reference_id: str,
        owner: str,
        email: str | None,
        display_name: str | None,
        username: str,
        existing_customer_id: str | None = None,
    ) -> dict[str, Any]:
        del owner, email, display_name, username, existing_customer_id
        base = self.settings.public_base_url.rstrip("/")
        body: dict[str, Any] = {
            "items": [
                {
                    "price_id": self.settings.paddle_pro_price_id.strip(),
                    "quantity": 1,
                }
            ],
            "collection_mode": "automatic",
            "custom_data": {
                "notepreso_reference": reference_id,
                "notepreso_plan": "pro",
                "notepreso_access_days": self.settings.paddle_pro_access_days,
            },
            "checkout": {"url": f"{base}/paddle/checkout"},
        }
        payload = self._request("POST", "/transactions", json_body=body)
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        transaction_id = str(data.get("id") or "")
        checkout = data.get("checkout") if isinstance(data.get("checkout"), dict) else {}
        checkout_url = str(checkout.get("url") or "")
        if not transaction_id or not checkout_url:
            raise PaddleError("Paddle did not return a transaction checkout URL.")

        return {
            "payment_session_id": transaction_id,
            "payment_link_url": checkout_url,
            "customer_id": data.get("customer_id"),
            "status": "ACTIVE",
            "expires_at": None,
        }

    @staticmethod
    def verify_webhook_signature(
        raw_body: bytes,
        signature_header: str,
        endpoint_secret: str,
        *,
        tolerance_seconds: int = 300,
        now: int | None = None,
    ) -> dict[str, Any]:
        if not signature_header or not endpoint_secret:
            raise PaddleSignatureError()

        timestamp: int | None = None
        signatures: list[str] = []
        for part in signature_header.split(";"):
            key, sep, value = part.strip().partition("=")
            if not sep:
                continue
            if key == "ts":
                try:
                    timestamp = int(value)
                except ValueError:
                    raise PaddleSignatureError() from None
            elif key == "h1" and value:
                signatures.append(value)

        if timestamp is None or not signatures:
            raise PaddleSignatureError()

        current = int(time.time() if now is None else now)
        if tolerance_seconds > 0 and abs(current - timestamp) > tolerance_seconds:
            raise PaddleSignatureError("Paddle webhook signature timestamp is outside the allowed tolerance.")

        signed_payload = str(timestamp).encode("ascii") + b":" + raw_body
        expected = hmac.new(endpoint_secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, candidate) for candidate in signatures):
            raise PaddleSignatureError()

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise PaddleError("Invalid Paddle webhook JSON.", status_code=400) from exc
        if not isinstance(payload, dict):
            raise PaddleError("Invalid Paddle webhook payload.", status_code=400)
        return payload

    @staticmethod
    def parse_event_time(payload: dict[str, Any]) -> datetime:
        raw = payload.get("occurred_at")
        if isinstance(raw, str) and raw:
            try:
                return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(UTC)
            except ValueError:
                pass
        return datetime.now(UTC)
