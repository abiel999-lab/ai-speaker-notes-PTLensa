from __future__ import annotations

from app.core.config import get_settings
from app.core.database import DatabaseManager


DDL = [
    """
    CREATE TABLE IF NOT EXISTS payment_checkouts (
        reference_id VARCHAR(64) PRIMARY KEY,
        owner VARCHAR(255) NOT NULL,
        provider VARCHAR(32) NOT NULL,
        provider_session_id VARCHAR(255) UNIQUE,
        provider_plan_id VARCHAR(255),
        provider_customer_id VARCHAR(255),
        amount INTEGER NOT NULL CHECK (amount >= 0),
        currency VARCHAR(8) NOT NULL,
        status VARCHAR(32) NOT NULL,
        checkout_url TEXT,
        expires_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_payment_checkouts_owner_created
    ON payment_checkouts (owner, created_at DESC)
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_payment_checkouts_provider_plan
    ON payment_checkouts (provider_plan_id)
    """,
    """
    CREATE TABLE IF NOT EXISTS payment_events (
        event_key VARCHAR(255) PRIMARY KEY,
        provider VARCHAR(32) NOT NULL,
        event_type VARCHAR(120) NOT NULL,
        reference_id VARCHAR(64),
        provider_object_id VARCHAR(255),
        payload JSONB NOT NULL,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_payment_events_type_processed
    ON payment_events (event_type, processed_at DESC)
    """,
]


def main() -> int:
    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is required.")
    db = DatabaseManager(settings.database_url)
    if db.engine.dialect.name != "postgresql":
        raise SystemExit(f"Production migration expects PostgreSQL, got {db.engine.dialect.name}.")
    with db.engine.begin() as conn:
        for statement in DDL:
            conn.exec_driver_sql(statement.strip())
    print("PASS: Xendit billing schema is ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
