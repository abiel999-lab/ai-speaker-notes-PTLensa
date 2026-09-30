from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine, text

from app.api.admin_routes import _user_payload
from app.core.application_data import ApplicationDataReader
from app.core.subscription_view import billing_counts, subscription_view


def test_subscription_view_matches_user_app_expiry_rules():
    now = datetime(2026, 9, 24, 3, 0, tzinfo=UTC)
    active = subscription_view(
        {
            "plan": "pro",
            "status": "active",
            "provider": "xendit",
            "provider_subscription_id": "plan-123",
            "current_period_end": now + timedelta(days=30),
            "cancel_at_period_end": False,
        },
        now=now,
    )
    assert active["plan"] == "pro"
    assert active["billing_state"] == "active"
    assert active["auto_renew"] is True

    expiring = subscription_view(
        {
            "plan": "pro",
            "status": "active",
            "provider": "stripe",
            "provider_subscription_id": "sub-123",
            "current_period_end": now + timedelta(days=7),
            "cancel_at_period_end": True,
        },
        now=now,
    )
    assert expiring["plan"] == "pro"
    assert expiring["billing_state"] == "expiring"
    assert expiring["auto_renew"] is False

    expired = subscription_view(
        {
            "plan": "pro",
            "status": "active",
            "provider": "paddle",
            "current_period_end": now - timedelta(seconds=1),
        },
        now=now,
    )
    assert expired["plan"] == "free"
    assert expired["billing_state"] == "expired"

    counts = billing_counts([active, expiring, expired], total_users=5, now=now)
    assert counts["pro_users"] == 2
    assert counts["free_users"] == 3
    assert counts["expiring_pro"] == 1
    assert counts["expired_subscriptions"] == 1


def test_application_reader_adds_billing_visibility(tmp_path: Path):
    url = f"sqlite+pysqlite:///{tmp_path / 'billing.db'}"
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE users (subject TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT, "
            "display_name TEXT, created_at TIMESTAMP NOT NULL, last_login_at TIMESTAMP NOT NULL, "
            "is_banned BOOLEAN NOT NULL DEFAULT 0, deleted_at TIMESTAMP NULL)"
        )
        conn.exec_driver_sql(
            "CREATE TABLE subscriptions (owner TEXT PRIMARY KEY, plan TEXT NOT NULL, status TEXT NOT NULL, "
            "provider TEXT, provider_customer_id TEXT, provider_subscription_id TEXT, "
            "current_period_start TIMESTAMP, current_period_end TIMESTAMP, "
            "cancel_at_period_end BOOLEAN NOT NULL DEFAULT 0, created_at TIMESTAMP, updated_at TIMESTAMP)"
        )
        conn.execute(text("INSERT INTO users VALUES ('pro','pro.user','pro@example.com','Pro User',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL)"))
        conn.execute(text("INSERT INTO users VALUES ('free','free.user','free@example.com','Free User',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL)"))
        conn.execute(text("INSERT INTO users VALUES ('expired','expired.user','expired@example.com','Expired User',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,0,NULL)"))
        conn.execute(
            text(
                "INSERT INTO subscriptions(owner,plan,status,provider,provider_subscription_id,current_period_end,cancel_at_period_end) "
                "VALUES ('pro','pro','active','xendit','x-plan','2099-01-01T00:00:00+00:00',0)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO subscriptions(owner,plan,status,provider,current_period_end,cancel_at_period_end) "
                "VALUES ('expired','pro','active','stripe','2000-01-01T00:00:00+00:00',0)"
            )
        )

    reader = ApplicationDataReader(url)
    assert reader.healthcheck() is True
    rows = {row["subject"]: row for row in reader.list_users(limit=5000)}
    assert rows["pro"]["plan"] == "pro"
    assert rows["pro"]["billing_provider"] == "xendit"
    assert rows["pro"]["auto_renew"] is True
    assert rows["free"]["plan"] == "free"
    assert rows["free"]["billing_state"] == "free"
    assert rows["expired"]["plan"] == "free"
    assert rows["expired"]["billing_state"] == "expired"

    counts = reader.admin_counts()
    assert counts["users"] == 3
    assert counts["pro_users"] == 1
    assert counts["free_users"] == 2
    assert counts["expired_subscriptions"] == 1

    detail = reader.get_subscription_for_owner("pro")
    assert detail["plan"] == "pro"
    assert detail["billing_provider"] == "xendit"


def test_admin_user_payload_returns_plan_provider_and_valid_until():
    future = datetime(2099, 1, 1, tzinfo=UTC)
    payload = _user_payload(
        None,
        {
            "subject": "user-1",
            "username": "user.one",
            "email": "one@example.com",
            "display_name": "User One",
            "created_at": datetime(2026, 1, 1, tzinfo=UTC),
            "last_login_at": datetime(2026, 9, 24, tzinfo=UTC),
            "is_banned": False,
        },
        subscription={
            "plan": "pro",
            "status": "active",
            "provider": "xendit",
            "current_period_end": future,
            "cancel_at_period_end": False,
        },
    )
    assert payload["plan"] == "pro"
    assert payload["billing_provider"] == "xendit"
    assert payload["valid_until"] == future.isoformat()
    assert payload["billing_state"] == "active"
