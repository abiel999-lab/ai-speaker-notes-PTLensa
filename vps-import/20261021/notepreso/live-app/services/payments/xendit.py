from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.config import Settings


class XenditError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def _safe_customer_reference(owner: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]", "", owner)
    return (f"np{cleaned}" or "npcustomer")[:64]


def _safe_name(value: str | None, fallback: str) -> tuple[str, str | None]:
    raw = (value or fallback or "NotePreso User").strip()
    cleaned = re.sub(r"[^A-Za-z0-9 ]+", " ", raw)
    parts = [part for part in cleaned.split() if part]
    if not parts:
        return "NotePreso", "User"
    given = " ".join(parts[:-1] or parts[:1])[:80]
    surname = parts[-1][:80] if len(parts) > 1 else None
    return given, surname


def _next_month_anchor(now: datetime) -> datetime:
    current = now.astimezone(UTC)
    year = current.year + (1 if current.month == 12 else 0)
    month = 1 if current.month == 12 else current.month + 1
    # Xendit Subscription anchor day must be <= 28.
    day = min(current.day, 28)
    return current.replace(year=year, month=month, day=day, microsecond=0)


class XenditPaymentClient:
    """Small server-side client for Xendit Payment Sessions / Subscriptions.

    Secret keys never leave the backend. The integration uses Xendit's hosted
    PAYMENT_LINK flow and the 2026-01-01 Subscriptions API version.
    """

    def __init__(self, settings: Settings, *, http: httpx.Client | None = None) -> None:
        if not settings.xendit_configured:
            raise ValueError("Xendit billing is not fully configured.")
        assert settings.xendit_secret_key is not None
        self.settings = settings
        self.base_url = settings.xendit_api_base_url.rstrip("/")
        self.secret_key = settings.xendit_secret_key.get_secret_value()
        self._http = http or httpx.Client(
            timeout=httpx.Timeout(settings.xendit_timeout_seconds, connect=5.0),
            follow_redirects=False,
        )

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "api-version": self.settings.xendit_api_version,
        }

    def _request(self, method: str, path: str, *, json: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = self._http.request(
                method,
                f"{self.base_url}{path}",
                auth=(self.secret_key, ""),
                headers=self.headers,
                json=json,
            )
        except httpx.HTTPError as exc:
            raise XenditError("Unable to reach Xendit. Please try again.", status_code=503) from exc

        if response.status_code >= 400:
            detail = f"Xendit returned HTTP {response.status_code}."
            try:
                payload = response.json()
                detail = str(payload.get("message") or payload.get("error_code") or detail)
            except ValueError:
                pass
            raise XenditError(detail, status_code=502)

        try:
            payload = response.json()
        except ValueError as exc:
            raise XenditError("Xendit returned an invalid response.") from exc
        if not isinstance(payload, dict):
            raise XenditError("Xendit returned an invalid response.")
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
        base = self.settings.public_base_url.rstrip("/")
        payload: dict[str, Any] = {
            "reference_id": reference_id,
            "session_type": "PAY",
            "mode": "PAYMENT_LINK",
            "amount": self.settings.xendit_pro_price_idr,
            "currency": "IDR",
            "country": "ID",
            "locale": "en",
            "allow_save_payment_method": "DISABLED",
            "description": f"NotePreso Pro - {self.settings.xendit_pro_access_days} days",
            "success_return_url": f"{base}/pricing?billing=success",
            "cancel_return_url": f"{base}/pricing?billing=cancelled",
            "metadata": {
                "notepreso_owner": owner[:80],
                "notepreso_plan": "pro",
                "notepreso_access_days": str(self.settings.xendit_pro_access_days),
            },
        }

        if existing_customer_id:
            payload["customer_id"] = existing_customer_id
        else:
            given_names, surname = _safe_name(display_name, username)
            customer: dict[str, Any] = {
                "reference_id": _safe_customer_reference(owner),
                "type": "INDIVIDUAL",
                "individual_detail": {"given_names": given_names},
            }
            if surname:
                customer["individual_detail"]["surname"] = surname
            if email:
                customer["email"] = email[:50]
            payload["customer"] = customer

        result = self._request("POST", "/sessions", json=payload)
        if not result.get("payment_session_id") or not result.get("payment_link_url"):
            raise XenditError("Xendit did not return a checkout URL.")
        return result

    def create_pro_subscription_session(
        self,
        *,
        reference_id: str,
        owner: str,
        email: str | None,
        display_name: str | None,
        username: str,
        existing_customer_id: str | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        current = (now or datetime.now(UTC)).astimezone(UTC)
        anchor = _next_month_anchor(current)
        base = self.settings.public_base_url.rstrip("/")

        payload: dict[str, Any] = {
            "reference_id": reference_id,
            "session_type": "SUBSCRIPTION",
            "mode": "PAYMENT_LINK",
            "amount": self.settings.xendit_pro_price_idr,
            "currency": "IDR",
            "country": "ID",
            "locale": "en",
            "description": "NotePreso Pro monthly subscription",
            "subscription": {
                "schedule": {
                    "interval": "MONTH",
                    "interval_count": 1,
                    "anchor_date": anchor.isoformat().replace("+00:00", "Z"),
                    "retry_interval": "DAY",
                    "retry_interval_count": 1,
                    "total_retry": 3,
                    "failed_attempt_notifications": [1, 2, 3],
                },
                "immediate_payment": True,
                "failed_cycle_action": "RESUME",
            },
            "success_return_url": f"{base}/pricing?billing=success",
            "cancel_return_url": f"{base}/pricing?billing=cancelled",
            "metadata": {
                "notepreso_owner": owner[:80],
                "notepreso_plan": "pro",
            },
        }

        if existing_customer_id:
            payload["customer_id"] = existing_customer_id
        else:
            given_names, surname = _safe_name(display_name, username)
            customer: dict[str, Any] = {
                "reference_id": _safe_customer_reference(owner),
                "type": "INDIVIDUAL",
                "individual_detail": {"given_names": given_names},
            }
            if surname:
                customer["individual_detail"]["surname"] = surname
            if email:
                customer["email"] = email[:50]
            payload["customer"] = customer

        result = self._request("POST", "/sessions", json=payload)
        if not result.get("payment_session_id") or not result.get("payment_link_url"):
            raise XenditError("Xendit did not return a checkout URL.")
        return result

    def get_session(self, session_id: str) -> dict[str, Any]:
        return self._request("GET", f"/sessions/{session_id}")

    def deactivate_subscription(self, plan_id: str) -> dict[str, Any]:
        return self._request("POST", f"/recurring/plans/{plan_id}/deactivate")
