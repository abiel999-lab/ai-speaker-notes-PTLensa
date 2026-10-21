from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.config import Settings
from app.core.database import DatabaseManager
from app.core.entitlements import EntitlementService, PlanLimitError


def make_service(tmp_path: Path, **overrides):
    settings = Settings(
        _env_file=None,
        free_monthly_presentations=2,
        free_monthly_chat_messages=3,
        free_vision_enabled=False,
        pro_monthly_presentations=10,
        pro_monthly_chat_messages=20,
        pro_vision_enabled=True,
        **overrides,
    )
    db = DatabaseManager(f"sqlite:///{tmp_path / 'billing.db'}")
    db.init_schema()
    return db, EntitlementService(db, settings)


def test_new_user_defaults_to_free_plan(tmp_path: Path):
    _, service = make_service(tmp_path)
    snapshot = service.account_snapshot("owner-1")
    assert snapshot["plan"] == "free"
    assert snapshot["limits"]["presentations"] == 2
    assert snapshot["limits"]["chat_messages"] == 3
    assert snapshot["entitlements"]["vision"] is False
    assert snapshot["usage"]["presentations"] == 0


def test_free_presentation_quota_is_enforced_and_release_works(tmp_path: Path):
    _, service = make_service(tmp_path)
    service.reserve_presentation("owner-1", use_vision=False)
    second = service.reserve_presentation("owner-1", use_vision=False)
    assert second["usage"]["presentations"] == 2
    assert second["remaining"]["presentations"] == 0

    with pytest.raises(PlanLimitError) as exc:
        service.reserve_presentation("owner-1", use_vision=False)
    assert exc.value.code == "presentation_quota_exhausted"

    service.release_presentation("owner-1", use_vision=False)
    after = service.reserve_presentation("owner-1", use_vision=False)
    assert after["usage"]["presentations"] == 2


def test_free_plan_blocks_vision(tmp_path: Path):
    _, service = make_service(tmp_path)
    with pytest.raises(PlanLimitError) as exc:
        service.check_presentation("owner-1", use_vision=True)
    assert exc.value.code == "vision_requires_pro"


def test_active_pro_plan_unlocks_larger_quota_and_vision(tmp_path: Path):
    db, service = make_service(tmp_path)
    now = datetime.now(UTC)
    db.set_subscription(
        "owner-1",
        plan="pro",
        status="active",
        provider="manual",
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
    )
    snapshot = service.reserve_presentation("owner-1", use_vision=True)
    assert snapshot["plan"] == "pro"
    assert snapshot["entitlements"]["vision"] is True
    assert snapshot["limits"]["presentations"] == 10
    assert snapshot["usage"]["vision_presentations"] == 1


def test_expired_pro_falls_back_to_free(tmp_path: Path):
    db, service = make_service(tmp_path)
    now = datetime.now(UTC)
    db.set_subscription(
        "owner-1",
        plan="pro",
        status="active",
        provider="manual",
        current_period_start=now - timedelta(days=60),
        current_period_end=now - timedelta(days=1),
    )
    snapshot = service.account_snapshot("owner-1", now=now)
    assert snapshot["plan"] == "free"
    assert snapshot["subscription_status"] == "active"
    assert snapshot["entitlements"]["vision"] is False


def test_chat_quota_and_release(tmp_path: Path):
    _, service = make_service(tmp_path)
    for _ in range(3):
        service.reserve_chat_message("owner-1")
    with pytest.raises(PlanLimitError) as exc:
        service.reserve_chat_message("owner-1")
    assert exc.value.code == "chat_quota_exhausted"
    service.release_chat_message("owner-1")
    snapshot = service.reserve_chat_message("owner-1")
    assert snapshot["usage"]["chat_messages"] == 3
