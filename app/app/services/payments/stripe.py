from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import Settings


class StripeError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class StripeSignatureError(StripeError):
    def __init__(self, message: str = "Invalid Stripe webhook signature.") -> None:
        super().__init__(message, status_code=401)


class StripePaymentClient:
    """Minimal server-side Stripe Checkout client.

    NotePreso keeps entitlement state internally. Stripe is used only to create a
    hosted one-time Checkout Session and to notify NotePreso about payment events.
    Secret keys never leave the backend.
    """

    def __init__(self, settings: Settings, *, http: httpx.Client | None = None) -> None:
        if not settings.stripe_configured:
            raise ValueError("Stripe billing is not fully configured.")
        assert settings.stripe_secret_key is not None
        self.settings = settings
        self.base_url = settings.stripe_api_base_url.rstrip("/")
        self.secret_key = settings.stripe_secret_key.get_secret_value()
        self.http = http or httpx.Client(
            timeout=httpx.Timeout(settings.stripe_timeout_seconds, connect=5.0),
            headers={"Authorization": f"Bearer {self.secret_key}"},
        )

    @staticmethod
    def _minor_units_idr(amount_idr: int) -> int:
        # Stripe treats IDR as a two-decimal presentment currency, so Rp50,000 is
        # sent as 5,000,000 minor units. NotePreso stores human-readable rupiah.
        return int(amount_idr) * 100

    def _request(self, method: str, path: str, *, data: dict[str, str]) -> dict[str, Any]:
        try:
            response = self.http.request(
                method,
                f"{self.base_url}{path}",
                data=data,
                headers={"Authorization": f"Bearer {self.secret_key}"},
            )
        except httpx.HTTPError as exc:
            raise StripeError("Unable to reach Stripe. Please try again.", status_code=503) from exc

        if response.status_code >= 400:
            detail = f"Stripe returned HTTP {response.status_code}."
            try:
                payload = response.json()
                message = payload.get("error", {}).get("message") if isinstance(payload, dict) else None
                if message:
                    detail = str(message)
            except (ValueError, TypeError):
                pass
            raise StripeError(detail, status_code=502)

        try:
            payload = response.json()
        except ValueError as exc:
            raise StripeError("Stripe returned an invalid response.") from exc
        if not isinstance(payload, dict):
            raise StripeError("Stripe returned an invalid response.")
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
        del owner, display_name, username, existing_customer_id
        base = self.settings.public_base_url.rstrip("/")
        access_days = self.settings.stripe_pro_access_days
        data: dict[str, str] = {
            "mode": "payment",
            "success_url": f"{base}/?billing=success",
            "cancel_url": f"{base}/?billing=cancelled",
            "client_reference_id": reference_id,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": "idr",
            "line_items[0][price_data][unit_amount]": str(
                self._minor_units_idr(self.settings.stripe_pro_price_idr)
            ),
            "line_items[0][price_data][product_data][name]": f"NotePreso Pro - {access_days} days",
            "line_items[0][price_data][product_data][description]": (
                f"One-time NotePreso Pro access for {access_days} days"
            ),
            "metadata[notepreso_reference]": reference_id,
            "metadata[notepreso_plan]": "pro",
            "metadata[notepreso_access_days]": str(access_days),
            "payment_intent_data[metadata][notepreso_reference]": reference_id,
        }
        if email:
            data["customer_email"] = email[:254]

        result = self._request("POST", "/v1/checkout/sessions", data=data)
        if not result.get("id") or not result.get("url"):
            raise StripeError("Stripe did not return a Checkout URL.")

        expires_at = result.get("expires_at")
        if isinstance(expires_at, (int, float)):
            expires_at = datetime.fromtimestamp(expires_at, tz=UTC).isoformat()
        return {
            "payment_session_id": result.get("id"),
            "payment_link_url": result.get("url"),
            "customer_id": result.get("customer"),
            "status": "ACTIVE" if str(result.get("status") or "open").lower() == "open" else str(result.get("status") or "ACTIVE").upper(),
            "expires_at": expires_at,
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
            raise StripeSignatureError()

        timestamp: int | None = None
        signatures: list[str] = []
        for item in signature_header.split(","):
            key, sep, value = item.strip().partition("=")
            if not sep:
                continue
            if key == "t":
                try:
                    timestamp = int(value)
                except ValueError:
                    raise StripeSignatureError() from None
            elif key == "v1" and value:
                signatures.append(value)

        if timestamp is None or not signatures:
            raise StripeSignatureError()

        current = int(time.time() if now is None else now)
        if tolerance_seconds > 0 and abs(current - timestamp) > tolerance_seconds:
            raise StripeSignatureError("Stripe webhook signature timestamp is outside the allowed tolerance.")

        signed_payload = str(timestamp).encode("ascii") + b"." + raw_body
        expected = hmac.new(endpoint_secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
        if not any(hmac.compare_digest(expected, candidate) for candidate in signatures):
            raise StripeSignatureError()

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise StripeError("Invalid Stripe webhook JSON.", status_code=400) from exc
        if not isinstance(payload, dict):
            raise StripeError("Invalid Stripe webhook payload.", status_code=400)
        return payload
