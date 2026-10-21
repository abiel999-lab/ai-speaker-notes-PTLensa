from __future__ import annotations

from app.core.config import get_settings
from app.core.database import DatabaseManager


DDL = [
    """
    CREATE TABLE IF NOT EXISTS subscriptions (
        owner VARCHAR(255) PRIMARY KEY,
        plan VARCHAR(32) NOT NULL DEFAULT 'free',
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        provider VARCHAR(32),
        provider_customer_id VARCHAR(255),
        provider_subscription_id VARCHAR(255),
        current_period_start TIMESTAMPTZ,
        current_period_end TIMESTAMPTZ,
        cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS usage_periods (
        owner VARCHAR(255) NOT NULL,
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        presentation_jobs INTEGER NOT NULL DEFAULT 0 CHECK (presentation_jobs >= 0),
        vision_jobs INTEGER NOT NULL DEFAULT 0 CHECK (vision_jobs >= 0),
        chat_messages INTEGER NOT NULL DEFAULT 0 CHECK (chat_messages >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (owner, period_start)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_usage_periods_owner_period
    ON usage_periods (owner, period_start DESC)
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
    print("PASS: Free/Pro schema is ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
