from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest

from app.core.billing import BillingService
from app.core.config import Settings
from app.core.database import DatabaseManager
from app.core.entitlements import EntitlementService
from app.services.payments.stripe import StripePaymentClient, StripeSignatureError


def stripe_settings(**overrides) -> Settings:
    base = dict(
        _env_file=None,
        payment_provider="stripe",
        stripe_secret_key="sk_test_notepreso_secret",
        stripe_webhook_secret="whsec_notepreso_test",
        stripe_pro_price_idr=50000,
        stripe_pro_access_days=30,
        public_base_url="https://notepreso.com",
        free_monthly_presentations=3,
        free_monthly_chat_messages=20,
        pro_monthly_presentations=50,
        pro_monthly_chat_messages=500,
    )
    base.update(overrides)
    return Settings(**base)


def test_stripe_checkout_payload_uses_hosted_one_time_payment_and_idr_minor_units():
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["authorization"] = request.headers.get("authorization")
        seen["body"] = request.content.decode()
        return httpx.Response(
            200,
            json={
                "id": "cs_test_notepreso_001",
                "url": "https://checkout.stripe.com/c/pay/cs_test_notepreso_001",
                "status": "open",
                "customer": None,
                "expires_at": 1790244000,
            },
        )

    settings = stripe_settings()
    client = StripePaymentClient(settings, http=httpx.Client(transport=httpx.MockTransport(handler)))
    result = client.create_pro_one_time_session(
        reference_id="np-pro-stripe-001",
        owner="owner-001",
        email="buyer@example.com",
        display_name="Buyer",
        username="buyer",
    )

    assert seen["url"] == "https://api.stripe.com/v1/checkout/sessions"
    assert seen["authorization"] == "Bearer sk_test_notepreso_secret"
    body = parse_qs(str(seen["body"]))
    assert body["mode"] == ["payment"]
    assert body["client_reference_id"] == ["np-pro-stripe-001"]
    assert body["line_items[0][price_data][currency]"] == ["idr"]
    # IDR is sent to Stripe in minor units. Rp50,000 -> 5,000,000.
    assert body["line_items[0][price_data][unit_amount]"] == ["5000000"]
    assert body["line_items[0][quantity]"] == ["1"]
    assert body["metadata[notepreso_reference]"] == ["np-pro-stripe-001"]
    assert body["customer_email"] == ["buyer@example.com"]
    assert "sk_test_notepreso_secret" not in str(seen["body"])
    assert result["payment_session_id"] == "cs_test_notepreso_001"
    assert result["status"] == "ACTIVE"


def _signed_event(payload: dict, *, secret: str, timestamp: int) -> tuple[bytes, str]:
    raw = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(
        secret.encode(),
        str(timestamp).encode() + b"." + raw,
        hashlib.sha256,
    ).hexdigest()
    return raw, f"t={timestamp},v1={signature}"


def test_stripe_webhook_signature_verification_accepts_valid_and_rejects_invalid():
    payload = {"id": "evt_test_001", "type": "checkout.session.completed", "data": {"object": {}}}
    raw, signature = _signed_event(payload, secret="whsec_test", timestamp=1_800_000_000)
    parsed = StripePaymentClient.verify_webhook_signature(
        raw,
        signature,
        "whsec_test",
        tolerance_seconds=300,
        now=1_800_000_100,
    )
    assert parsed["id"] == "evt_test_001"

    with pytest.raises(StripeSignatureError):
        StripePaymentClient.verify_webhook_signature(
            raw,
            signature.replace("v1=", "v1=bad"),
            "whsec_test",
            tolerance_seconds=300,
            now=1_800_000_100,
        )

    with pytest.raises(StripeSignatureError):
        StripePaymentClient.verify_webhook_signature(
            raw,
            signature,
            "whsec_test",
            tolerance_seconds=300,
            now=1_800_001_000,
        )


def make_stripe_billing(tmp_path: Path):
    settings = stripe_settings()
    db = DatabaseManager(f"sqlite:///{tmp_path / 'billing-stripe.db'}")
    db.init_schema()

    class FakeStripe:
        def create_pro_one_time_session(self, **kwargs):
            return {
                "payment_session_id": "cs_test_notepreso_001",
                "payment_link_url": "https://checkout.stripe.com/c/pay/cs_test_notepreso_001",
                "customer_id": None,
                "status": "ACTIVE",
                "expires_at": "2026-09-24T13:00:00Z",
            }

    service = BillingService(db, settings, stripe=FakeStripe())  # type: ignore[arg-type]
    return db, settings, service


def test_stripe_paid_checkout_activates_pro_for_30_days_and_is_idempotent(tmp_path: Path):
    db, settings, billing = make_stripe_billing(tmp_path)
    checkout = billing.create_checkout(
        owner="owner-stripe",
        username="buyer",
        email="buyer@example.com",
        display_name="Buyer",
    )
    assert checkout["provider"] == "stripe"
    assert checkout["status"] == "ACTIVE"
    assert EntitlementService(db, settings).account_snapshot("owner-stripe")["plan"] == "free"

    paid_at = datetime(2026, 9, 24, 5, 15, tzinfo=UTC)
    event = {
        "id": "evt_checkout_paid_001",
        "type": "checkout.session.completed",
        "created": int(paid_at.timestamp()),
        "data": {
            "object": {
                "id": "cs_test_notepreso_001",
                "mode": "payment",
                "client_reference_id": checkout["reference_id"],
                "metadata": {"notepreso_reference": checkout["reference_id"]},
                "payment_status": "paid",
                "amount_total": 5_000_000,
                "currency": "idr",
                "payment_intent": "pi_test_001",
                "customer": "cus_test_001",
            }
        },
    }

    first = billing.handle_stripe_webhook(event)
    second = billing.handle_stripe_webhook(event)
    assert first["processed"] is True
    assert second["duplicate"] is True

    snapshot = EntitlementService(db, settings).account_snapshot(
        "owner-stripe", now=paid_at + timedelta(minutes=1)
    )
    assert snapshot["plan"] == "pro"
    assert snapshot["provider"] == "stripe"
    assert snapshot["billing"]["provider"] == "stripe"
    assert snapshot["billing"]["checkout_mode"] == "one_time"
    assert snapshot["billing"]["access_days"] == 30
    assert snapshot["billing"]["cancel_enabled"] is False
    period_end = snapshot["current_period_end"]
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=UTC)
    assert period_end == paid_at + timedelta(days=30)

    stored = db.get_payment_checkout(checkout["reference_id"])
    assert stored is not None
    assert stored["status"] == "PAID"


def test_stripe_async_checkout_waits_for_settlement_before_pro(tmp_path: Path):
    db, settings, billing = make_stripe_billing(tmp_path)
    checkout = billing.create_checkout(
        owner="owner-async",
        username="async",
        email="async@example.com",
        display_name="Async Buyer",
    )
    base_object = {
        "id": "cs_test_notepreso_001",
        "mode": "payment",
        "client_reference_id": checkout["reference_id"],
        "metadata": {"notepreso_reference": checkout["reference_id"]},
        "amount_total": 5_000_000,
        "currency": "idr",
    }
    completed = {
        "id": "evt_async_pending_001",
        "type": "checkout.session.completed",
        "created": 1_800_000_000,
        "data": {"object": {**base_object, "payment_status": "unpaid"}},
    }
    result = billing.handle_stripe_webhook(completed)
    assert result["pending"] is True
    assert EntitlementService(db, settings).account_snapshot("owner-async")["plan"] == "free"

    succeeded = {
        "id": "evt_async_paid_001",
        "type": "checkout.session.async_payment_succeeded",
        "created": 1_800_000_100,
        "data": {"object": {**base_object, "payment_status": "paid", "payment_intent": "pi_async"}},
    }
    billing.handle_stripe_webhook(succeeded)
    assert EntitlementService(
        db, settings
    ).account_snapshot("owner-async", now=datetime.fromtimestamp(1_800_000_110, tz=UTC))["plan"] == "pro"
