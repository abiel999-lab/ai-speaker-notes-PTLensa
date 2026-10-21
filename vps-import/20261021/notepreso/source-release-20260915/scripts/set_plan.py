from __future__ import annotations

import argparse
from datetime import UTC, datetime, timedelta

from app.core.config import get_settings
from app.core.database import DatabaseManager


def main() -> int:
    parser = argparse.ArgumentParser(description="Set a NotePreso user's internal subscription plan.")
    parser.add_argument("--owner", required=True, help="Keycloak subject / owner key")
    parser.add_argument("--plan", choices=("free", "pro"), required=True)
    parser.add_argument("--days", type=int, default=30, help="Pro period length for manual testing")
    parser.add_argument("--status", default="active")
    args = parser.parse_args()

    settings = get_settings()
    if not settings.database_url:
        raise SystemExit("DATABASE_URL is required.")

    db = DatabaseManager(settings.database_url)
    db.init_schema()
    now = datetime.now(UTC)
    if args.plan == "pro":
        start = now
        end = now + timedelta(days=max(1, args.days))
        provider = "manual"
    else:
        start = None
        end = None
        provider = None

    sub = db.set_subscription(
        args.owner,
        plan=args.plan,
        status=args.status,
        provider=provider,
        current_period_start=start,
        current_period_end=end,
    )
    print("owner=", sub["owner"])
    print("plan=", sub["plan"])
    print("status=", sub["status"])
    print("provider=", sub["provider"])
    print("current_period_end=", sub["current_period_end"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
