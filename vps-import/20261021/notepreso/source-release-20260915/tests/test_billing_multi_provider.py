from __future__ import annotations

from pathlib import Path

from app.core.billing import BillingService
from app.core.config import Settings
from app.core.database import DatabaseManager
from app.core.entitlements import EntitlementService


class FakeXendit:
    def create_pro_one_time_session(self, **kwargs):
        return {
            "payment_session_id": "ps-multi-xendit",
            "payment_link_url": "https://xendit.test/checkout",
            "status": "ACTIVE",
        }


class FakePaddle:
    def create_pro_one_time_session(self, **kwargs):
        return {
            "payment_session_id": "txn_multi_paddle",
            "payment_link_url": "https://notepreso.com/paddle/checkout?_ptxn=txn_multi_paddle",
            "status": "draft",
        }


def settings() -> Settings:
    return Settings(
        _env_file=None,
        payment_provider="xendit",
        payment_providers="xendit,paddle",
        public_base_url="https://notepreso.com",
        xendit_secret_key="xnd-test",
        xendit_webhook_token="xnd-hook",
        xendit_pro_price_idr=50000,
        xendit_checkout_mode="one_time",
        xendit_pro_access_days=30,
        paddle_api_base_url="https://sandbox-api.paddle.com",
        paddle_environment="sandbox",
        paddle_api_key="pdl-api",
        paddle_client_token="test-client",
        paddle_webhook_secret="pdl-hook",
        paddle_pro_price_id="pri_01multi",
        paddle_pro_price_minor=279,
        paddle_pro_currency="USD",
        paddle_pro_access_days=30,
    )


def make_service(tmp_path: Path):
    cfg = settings()
    db = DatabaseManager(f"sqlite:///{tmp_path / 'multi.db'}")
    db.init_schema()
    service = BillingService(db, cfg, xendit=FakeXendit(), paddle=FakePaddle())
    return db, cfg, service


def test_multi_provider_settings_enable_xendit_and_paddle():
    cfg = settings()
    assert cfg.enabled_payment_providers == ["xendit", "paddle"]
    assert cfg.xendit_available is True
    assert cfg.paddle_available is True
    assert cfg.default_payment_provider == "xendit"
    assert cfg.billing_configured is True


def test_checkout_can_choose_each_enabled_provider(tmp_path: Path):
    db, _, service = make_service(tmp_path)
    xendit = service.create_checkout(
        owner="owner-x",
        username="user-x",
        email="x@example.com",
        display_name="X",
        provider="xendit",
    )
    paddle = service.create_checkout(
        owner="owner-p",
        username="user-p",
        email="p@example.com",
        display_name="P",
        provider="paddle",
    )
    assert xendit["provider"] == "xendit"
    assert xendit["amount"] == 50000
    assert xendit["currency"] == "IDR"
    assert paddle["provider"] == "paddle"
    assert paddle["amount"] == 279
    assert paddle["currency"] == "USD"
    assert db.get_payment_checkout(xendit["reference_id"])["provider"] == "xendit"
    assert db.get_payment_checkout(paddle["reference_id"])["provider"] == "paddle"


def test_account_snapshot_exposes_provider_choices(tmp_path: Path):
    db, cfg, _ = make_service(tmp_path)
    snapshot = EntitlementService(db, cfg).account_snapshot("owner-free")
    providers = snapshot["billing"]["providers"]
    assert [item["provider"] for item in providers] == ["xendit", "paddle"]
    assert providers[0]["price"] == 50000
    assert providers[1]["price"] == 279
    assert snapshot["billing"]["checkout_enabled"] is True
