from __future__ import annotations

import json
import secrets
import os

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.api.routes import _reject_cross_site_browser_request, _require_api_access
from app.core.billing import BillingError
from app.services.payments.paddle import PaddleError, PaddlePaymentClient
from app.services.payments.stripe import StripeError, StripePaymentClient
from app.services.payments.xendit import XenditError


router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    provider: str | None = None
    product: str = "pro"


class CheckoutResponse(BaseModel):
    checkout_url: str
    reference_id: str
    status: str
    provider: str


def sandbox_account_allowed(email: str | None) -> bool:
    """Allow only exact emails explicitly designated for Sandbox testing."""
    raw = ",".join((
        os.environ.get("NOTEPRESO_SANDBOX_TEST_EMAIL", ""),
        os.environ.get("NOTEPRESO_SANDBOX_TEST_EMAILS", ""),
    ))
    allowed = {value.strip().casefold() for value in raw.split(",") if value.strip()}
    return bool(email and email.strip().casefold() in allowed)


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout(request: Request, payload: CheckoutRequest | None = None) -> CheckoutResponse:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    settings = request.app.state.settings
    if settings.paddle_available and settings.paddle_environment.strip().lower() == "sandbox":
        provider = (payload.provider if payload else None)
        provider = (provider or settings.default_payment_provider or "").strip().lower()
        if provider == "paddle":
            if not sandbox_account_allowed(identity.email):
                raise HTTPException(status_code=403, detail="Sandbox checkout is limited to the designated test account.")
    billing = getattr(request.app.state, "billing", None)
    if billing is None:
        raise HTTPException(status_code=503, detail="Payment checkout is not configured yet.")
    try:
        checkout = billing.create_checkout(
            owner=identity.owner_key,
            username=identity.username,
            email=identity.email,
            display_name=identity.display_name,
            provider=payload.provider if payload else None,
            product=payload.product if payload else "pro",
        )
    except (BillingError, XenditError, StripeError, PaddleError) as exc:
        raise HTTPException(status_code=getattr(exc, "status_code", 502), detail=str(exc)) from exc
    url = str(checkout.get("checkout_url") or "")
    if not url:
        raise HTTPException(status_code=502, detail="Payment checkout URL is unavailable.")
    return CheckoutResponse(
        checkout_url=url,
        reference_id=str(checkout["reference_id"]),
        status=str(checkout.get("status") or "ACTIVE"),
        provider=str(checkout.get("provider") or ""),
    )


@router.post("/cancel")
def cancel_subscription(request: Request) -> dict[str, object]:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    billing = getattr(request.app.state, "billing", None)
    if billing is None:
        raise HTTPException(status_code=503, detail="Billing is not configured.")
    try:
        subscription = billing.cancel_subscription(identity.owner_key)
    except (BillingError, XenditError, StripeError, PaddleError) as exc:
        raise HTTPException(status_code=getattr(exc, "status_code", 502), detail=str(exc)) from exc
    return {
        "ok": True,
        "cancel_at_period_end": bool(subscription.get("cancel_at_period_end")),
        "current_period_end": subscription.get("current_period_end"),
    }


@router.post("/xendit/webhook")
async def xendit_webhook(request: Request) -> dict[str, object]:
    settings = request.app.state.settings
    billing = getattr(request.app.state, "billing", None)
    if billing is None or not settings.xendit_available:
        raise HTTPException(status_code=503, detail="Xendit billing is not configured.")

    assert settings.xendit_webhook_token is not None
    supplied = request.headers.get("x-callback-token", "")
    expected = settings.xendit_webhook_token.get_secret_value()
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid Xendit webhook token.")

    raw = await request.body()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook JSON.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid webhook payload.")

    try:
        result = billing.handle_xendit_webhook(payload)
    except BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return {"received": True, **result}

@router.post("/stripe/webhook")
async def stripe_webhook(request: Request) -> dict[str, object]:
    settings = request.app.state.settings
    billing = getattr(request.app.state, "billing", None)
    if billing is None or not settings.stripe_available:
        raise HTTPException(status_code=503, detail="Stripe billing is not configured.")

    assert settings.stripe_webhook_secret is not None
    raw = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        payload = StripePaymentClient.verify_webhook_signature(
            raw,
            signature,
            settings.stripe_webhook_secret.get_secret_value(),
            tolerance_seconds=settings.stripe_webhook_tolerance_seconds,
        )
        result = billing.handle_stripe_webhook(payload)
    except StripeError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return {"received": True, **result}

@router.post("/paddle/webhook")
async def paddle_webhook(request: Request) -> dict[str, object]:
    settings = request.app.state.settings
    billing = getattr(request.app.state, "billing", None)
    if billing is None or not settings.paddle_available:
        raise HTTPException(status_code=503, detail="Paddle billing is not configured.")

    assert settings.paddle_webhook_secret is not None
    raw = await request.body()
    signature = request.headers.get("paddle-signature", "")
    try:
        payload = PaddlePaymentClient.verify_webhook_signature(
            raw,
            signature,
            settings.paddle_webhook_secret.get_secret_value(),
            tolerance_seconds=settings.paddle_webhook_tolerance_seconds,
        )
        result = billing.handle_paddle_webhook(payload)
    except PaddleError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except BillingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return {"received": True, **result}

