from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest

from app.core.billing import BillingError, BillingService
from app.core.config import Settings
from app.core.database import DatabaseManager
from app.core.entitlements import EntitlementService
from app.services.payments.paddle import PaddlePaymentClient, PaddleSignatureError


def paddle_settings(**overrides) -> Settings:
    base = dict(
        _env_file=None,
        payment_provider="paddle",
        paddle_api_base_url="https://sandbox-api.paddle.com",
        paddle_environment="sandbox",
        paddle_api_key="pdl_sdbx_apikey_notepreso",
        paddle_client_token="test_notepreso_client",
        paddle_webhook_secret="pdl_ntfset_notepreso_secret",
        paddle_pro_price_id="pri_01notepresotestprice000000",
        paddle_pro_price_minor=500,
        paddle_pro_currency="USD",
        paddle_pro_access_days=30,
        public_base_url="https://notepreso.com",
        free_monthly_presentations=3,
        free_monthly_chat_messages=20,
        pro_monthly_presentations=50,
        pro_monthly_chat_messages=500,
    )
    base.update(overrides)
    return Settings(**base)


def test_paddle_transaction_payload_uses_one_time_catalog_price_and_checkout_page():
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["authorization"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content.decode())
        return httpx.Response(
            201,
            json={
                "data": {
                    "id": "txn_01notepresotest0000000000",
                    "status": "draft",
                    "customer_id": None,
                    "checkout": {
                        "url": "https://notepreso.com/paddle/checkout?_ptxn=txn_01notepresotest0000000000"
                    },
                }
            },
        )

    settings = paddle_settings()
    client = PaddlePaymentClient(settings, http=httpx.Client(transport=httpx.MockTransport(handler)))
    result = client.create_pro_one_time_session(
        reference_id="np-pro-paddle-001",
        owner="owner-001",
        email="buyer@example.com",
        display_name="Buyer",
        username="buyer",
    )

    assert seen["url"] == "https://sandbox-api.paddle.com/transactions"
    assert seen["authorization"] == "Bearer pdl_sdbx_apikey_notepreso"
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["collection_mode"] == "automatic"
    assert body["items"] == [{"price_id": settings.paddle_pro_price_id, "quantity": 1}]
    assert body["custom_data"]["notepreso_reference"] == "np-pro-paddle-001"
    assert body["checkout"]["url"] == "https://notepreso.com/paddle/checkout"
    assert "pdl_sdbx_apikey_notepreso" not in json.dumps(body)
    assert result["payment_session_id"].startswith("txn_")
    assert "_ptxn=" in result["payment_link_url"]


def _signed_event(payload: dict, *, secret: str, timestamp: int) -> tuple[bytes, str]:
    raw = json.dumps(payload, separators=(",", ":")).encode()
    signature = hmac.new(
        secret.encode(),
        str(timestamp).encode() + b":" + raw,
        hashlib.sha256,
    ).hexdigest()
    return raw, f"ts={timestamp};h1={signature}"


def test_paddle_webhook_signature_verification_accepts_valid_and_rejects_replay():
    payload = {"event_id": "evt_01paddle", "event_type": "transaction.completed", "data": {}}
    raw, signature = _signed_event(payload, secret="endpoint-secret", timestamp=1_800_000_000)
    parsed = PaddlePaymentClient.verify_webhook_signature(
        raw,
        signature,
        "endpoint-secret",
        tolerance_seconds=300,
        now=1_800_000_100,
    )
    assert parsed["event_id"] == "evt_01paddle"

    with pytest.raises(PaddleSignatureError):
        PaddlePaymentClient.verify_webhook_signature(
            raw,
            signature.replace("h1=", "h1=bad"),
            "endpoint-secret",
            tolerance_seconds=300,
            now=1_800_000_100,
        )

    with pytest.raises(PaddleSignatureError):
        PaddlePaymentClient.verify_webhook_signature(
            raw,
            signature,
            "endpoint-secret",
            tolerance_seconds=300,
            now=1_800_001_000,
        )


def make_paddle_billing(tmp_path: Path):
    settings = paddle_settings()
    db = DatabaseManager(f"sqlite:///{tmp_path / 'billing-paddle.db'}")
    db.init_schema()

    class FakePaddle:
        def create_pro_one_time_session(self, **kwargs):
            return {
                "payment_session_id": "txn_01notepresotest0000000000",
                "payment_link_url": "https://notepreso.com/paddle/checkout?_ptxn=txn_01notepresotest0000000000",
                "customer_id": None,
                "status": "ACTIVE",
                "expires_at": None,
            }

    service = BillingService(db, settings, paddle=FakePaddle())  # type: ignore[arg-type]
    return db, settings, service


def completed_event(reference_id: str, *, amount: str = "500", price_id: str | None = None) -> dict:
    return {
        "event_id": "evt_01notepresopaddlecompleted",
        "event_type": "transaction.completed",
        "occurred_at": "2026-09-24T06:00:00Z",
        "data": {
            "id": "txn_01notepresotest0000000000",
            "status": "completed",
            "customer_id": "ctm_01notepresocustomer000000",
            "subscription_id": None,
            "currency_code": "USD",
            "custom_data": {"notepreso_reference": reference_id},
            "items": [
                {
                    "quantity": 1,
                    "price": {
                        "id": price_id or "pri_01notepresotestprice000000",
                        "billing_cycle": None,
                        "unit_price": {"amount": amount, "currency_code": "USD"},
                    },
                }
            ],
        },
    }


def test_paddle_completed_transaction_activates_pro_for_30_days_and_is_idempotent(tmp_path: Path):
    db, settings, billing = make_paddle_billing(tmp_path)
    checkout = billing.create_checkout(
        owner="owner-paddle",
        username="buyer",
        email="buyer@example.com",
        display_name="Buyer",
    )
    assert checkout["provider"] == "paddle"
    assert checkout["amount"] == 500
    assert checkout["currency"] == "USD"
    assert EntitlementService(db, settings).account_snapshot("owner-paddle")["plan"] == "free"

    event = completed_event(checkout["reference_id"])
    first = billing.handle_paddle_webhook(event)
    second = billing.handle_paddle_webhook(event)
    assert first["processed"] is True
    assert second["duplicate"] is True

    paid_at = datetime(2026, 9, 24, 6, 0, tzinfo=UTC)
    snapshot = EntitlementService(db, settings).account_snapshot(
        "owner-paddle", now=paid_at + timedelta(minutes=1)
    )
    assert snapshot["plan"] == "pro"
    assert snapshot["provider"] == "paddle"
    assert snapshot["billing"]["provider"] == "paddle"
    assert snapshot["billing"]["currency"] == "USD"
    assert snapshot["billing"]["price"] == 500
    assert snapshot["billing"]["price_minor_units"] is True
    assert snapshot["billing"]["access_days"] == 30
    period_end = snapshot["current_period_end"]
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=UTC)
    assert period_end == paid_at + timedelta(days=30)

    stored = db.get_payment_checkout(checkout["reference_id"])
    assert stored is not None
    assert stored["status"] == "PAID"
    assert stored["provider_customer_id"] == "ctm_01notepresocustomer000000"


def test_paddle_rejects_wrong_price_or_amount(tmp_path: Path):
    _, _, billing = make_paddle_billing(tmp_path)
    checkout = billing.create_checkout(
        owner="owner-paddle-bad",
        username="buyer",
        email=None,
        display_name=None,
    )

    with pytest.raises(BillingError, match="price did not match"):
        billing.handle_paddle_webhook(
            completed_event(checkout["reference_id"], price_id="pri_wrong")
        )

    event = completed_event(checkout["reference_id"], amount="999")
    event["event_id"] = "evt_01differentamount"
    with pytest.raises(BillingError, match="price amount did not match"):
        billing.handle_paddle_webhook(event)
