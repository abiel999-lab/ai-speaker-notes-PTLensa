from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

from app.core.billing import BillingService
from app.core.config import Settings
from app.core.database import DatabaseManager
from app.core.entitlements import EntitlementService
from app.services.payments.xendit import XenditPaymentClient


def billing_settings(**overrides) -> Settings:
    base = dict(
        _env_file=None,
        payment_provider="xendit",
        xendit_secret_key="xnd_test_secret",
        xendit_webhook_token="callback-secret",
        xendit_pro_price_idr=99000,
        public_base_url="https://notepreso.com",
        free_monthly_presentations=3,
        free_monthly_chat_messages=20,
        pro_monthly_presentations=50,
        pro_monthly_chat_messages=500,
    )
    base.update(overrides)
    return Settings(**base)


def test_xendit_one_time_session_payload_uses_pay_and_does_not_save_payment_method():
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = request.content.decode()
        return httpx.Response(
            200,
            json={
                "payment_session_id": "ps-123456789012345678901234",
                "payment_link_url": "https://dev.xen.to/test-pay",
                "customer_id": "cust-123",
                "status": "ACTIVE",
                "expires_at": "2026-09-24T10:30:00Z",
            },
        )

    http = httpx.Client(transport=httpx.MockTransport(handler))
    settings = billing_settings(xendit_checkout_mode="one_time", xendit_pro_access_days=30)
    client = XenditPaymentClient(settings, http=http)
    result = client.create_pro_one_time_session(
        reference_id="np-pro-123",
        owner="owner-123",
        email="user@example.com",
        display_name="Test User",
        username="test.user",
    )

    assert result["payment_link_url"].startswith("https://")
    assert seen["url"] == "https://api.xendit.co/sessions"
    body = str(seen["body"])
    assert '"session_type":"PAY"' in body
    assert '"mode":"PAYMENT_LINK"' in body
    assert '"allow_save_payment_method":"DISABLED"' in body
    assert '"currency":"IDR"' in body
    assert '"amount":99000' in body
    assert '"subscription"' not in body
    assert "xnd_test_secret" not in body


def test_xendit_subscription_session_payload_uses_hosted_checkout_and_no_secret_in_body():
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["api_version"] = request.headers.get("api-version")
        seen["authorization"] = request.headers.get("authorization")
        seen["body"] = request.content.decode()
        return httpx.Response(
            200,
            json={
                "payment_session_id": "ps-123456789012345678901234",
                "payment_link_url": "https://dev.xen.to/test-checkout",
                "customer_id": "cust-123",
                "recurring_plan_id": "repl-123",
                "status": "ACTIVE",
                "expires_at": "2026-09-23T10:00:00Z",
            },
        )

    http = httpx.Client(transport=httpx.MockTransport(handler))
    settings = billing_settings()
    client = XenditPaymentClient(settings, http=http)
    result = client.create_pro_subscription_session(
        reference_id="np-pro-123",
        owner="owner-123",
        email="user@example.com",
        display_name="Test User",
        username="test.user",
        now=datetime(2026, 9, 23, 9, 0, tzinfo=UTC),
    )

    assert result["payment_link_url"].startswith("https://")
    assert seen["url"] == "https://api.xendit.co/sessions"
    assert seen["api_version"] == "2026-01-01"
    body = str(seen["body"])
    assert '"session_type":"SUBSCRIPTION"' in body
    assert '"mode":"PAYMENT_LINK"' in body
    assert '"immediate_payment":true' in body
    assert '"currency":"IDR"' in body
    assert '"amount":99000' in body
    assert "xnd_test_secret" not in body
    assert str(seen["authorization"]).startswith("Basic ")


def make_billing(tmp_path: Path, *, checkout_mode: str = "one_time"):
    settings = billing_settings(xendit_checkout_mode=checkout_mode, xendit_pro_access_days=30)
    db = DatabaseManager(f"sqlite:///{tmp_path / 'billing-xendit.db'}")
    db.init_schema()

    class FakeXendit:
        def __init__(self):
            self.deactivated: list[str] = []

        def create_pro_one_time_session(self, **kwargs):
            return {
                "payment_session_id": "ps-pay-test-001",
                "payment_link_url": "https://dev.xen.to/test-pay",
                "customer_id": "cust-test-001",
                "status": "ACTIVE",
                "expires_at": "2026-09-24T10:30:00Z",
            }

        def create_pro_subscription_session(self, **kwargs):
            return {
                "payment_session_id": "ps-test-001",
                "payment_link_url": "https://dev.xen.to/test-checkout",
                "customer_id": "cust-test-001",
                "recurring_plan_id": "repl-test-001",
                "status": "ACTIVE",
                "expires_at": "2026-09-23T10:30:00Z",
            }

        def deactivate_subscription(self, plan_id: str):
            self.deactivated.append(plan_id)
            return {"id": plan_id, "status": "INACTIVE"}

    fake = FakeXendit()
    service = BillingService(db, settings, xendit=fake)  # type: ignore[arg-type]
    return db, settings, fake, service


def test_one_time_checkout_completed_activates_pro_for_30_days(tmp_path: Path):
    db, settings, _, billing = make_billing(tmp_path, checkout_mode="one_time")
    checkout = billing.create_checkout(
        owner="owner-pay",
        username="buyer",
        email="buyer@example.com",
        display_name="Buyer User",
    )
    assert checkout["status"] == "ACTIVE"
    assert checkout["provider_plan_id"] is None
    assert EntitlementService(db, settings).account_snapshot("owner-pay")["plan"] == "free"

    paid_at = datetime(2026, 9, 24, 4, 30, tzinfo=UTC)
    event = {
        "event": "payment_session.completed",
        "data": {
            "payment_session_id": "ps-pay-test-001",
            "reference_id": checkout["reference_id"],
            "customer_id": "cust-test-001",
            "session_type": "PAY",
            "amount": 99000,
            "currency": "IDR",
            "status": "COMPLETED",
            "updated": paid_at.isoformat().replace("+00:00", "Z"),
            "payment_id": "py-test-001",
            "payment_request_id": "pr-test-001",
        },
    }
    first = billing.handle_xendit_webhook(event)
    second = billing.handle_xendit_webhook(event)
    assert first["processed"] is True
    assert second["duplicate"] is True

    snapshot = EntitlementService(db, settings).account_snapshot(
        "owner-pay", now=paid_at + timedelta(minutes=1)
    )
    assert snapshot["plan"] == "pro"
    assert snapshot["subscription_status"] == "active"
    assert snapshot["provider"] == "xendit"
    assert snapshot["billing"]["checkout_mode"] == "one_time"
    assert snapshot["billing"]["cancel_enabled"] is False
    period_end = snapshot["current_period_end"]
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=UTC)
    assert period_end == paid_at + timedelta(days=30)

    stored = db.get_payment_checkout(checkout["reference_id"])
    assert stored is not None
    assert stored["status"] == "PAID"


def test_checkout_then_successful_cycle_activates_pro(tmp_path: Path):
    db, settings, _, billing = make_billing(tmp_path, checkout_mode="subscription")
    checkout = billing.create_checkout(
        owner="owner-1",
        username="alice",
        email="alice@example.com",
        display_name="Alice User",
    )
    assert checkout["status"] == "ACTIVE"
    assert checkout["checkout_url"].startswith("https://")

    # Linking/plan activation alone does not grant Pro before a paid cycle succeeds.
    billing.handle_xendit_webhook(
        {
            "event": "recurring.plan.activated",
            "data": {
                "id": "repl-test-001",
                "reference_id": checkout["reference_id"],
                "customer_id": "cust-test-001",
                "amount": 99000,
                "currency": "IDR",
                "status": "ACTIVE",
            },
        }
    )
    assert EntitlementService(db, settings).account_snapshot("owner-1")["plan"] == "free"

    event = {
        "event": "recurring.cycle.succeeded",
        "data": {
            "id": "recy-test-001",
            "reference_id": checkout["reference_id"],
            "plan_id": "repl-test-001",
            "customer_id": "cust-test-001",
            "amount": 99000,
            "currency": "IDR",
            "status": "SUCCEEDED",
            "scheduled_timestamp": "2026-09-23T09:00:00Z",
        },
    }
    first = billing.handle_xendit_webhook(event)
    second = billing.handle_xendit_webhook(event)
    assert first["processed"] is True
    assert second["duplicate"] is True

    snapshot = EntitlementService(db, settings).account_snapshot(
        "owner-1", now=datetime(2026, 9, 23, 9, 1, tzinfo=UTC)
    )
    assert snapshot["plan"] == "pro"
    assert snapshot["subscription_status"] == "active"
    period_end = snapshot["current_period_end"]
    if period_end.tzinfo is None:
        period_end = period_end.replace(tzinfo=UTC)
    assert period_end == datetime(2026, 10, 23, 9, 0, tzinfo=UTC)


def test_cancel_renewal_keeps_current_paid_period(tmp_path: Path):
    db, settings, fake, billing = make_billing(tmp_path)
    now = datetime.now(UTC)
    db.set_subscription(
        "owner-1",
        plan="pro",
        status="active",
        provider="xendit",
        provider_customer_id="cust-test-001",
        provider_subscription_id="repl-test-001",
        current_period_start=now,
        current_period_end=now + timedelta(days=20),
    )

    result = billing.cancel_subscription("owner-1")
    assert fake.deactivated == ["repl-test-001"]
    assert result["cancel_at_period_end"] is True
    snapshot = EntitlementService(db, settings).account_snapshot("owner-1", now=now + timedelta(days=1))
    assert snapshot["plan"] == "pro"
    assert snapshot["billing"]["cancel_enabled"] is False


def test_past_due_remains_pro_until_paid_period_expires(tmp_path: Path):
    db, settings, _, _ = make_billing(tmp_path)
    now = datetime.now(UTC)
    db.set_subscription(
        "owner-1",
        plan="pro",
        status="past_due",
        provider="xendit",
        current_period_start=now - timedelta(days=20),
        current_period_end=now + timedelta(days=5),
    )
    service = EntitlementService(db, settings)
    assert service.account_snapshot("owner-1", now=now)["plan"] == "pro"
    assert service.account_snapshot("owner-1", now=now + timedelta(days=6))["plan"] == "free"
