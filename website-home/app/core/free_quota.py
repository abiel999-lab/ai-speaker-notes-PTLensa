"""Calendar-week quota boundaries shared by API and persistence."""
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo


def week_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    local = current.astimezone(ZoneInfo("Asia/Jakarta"))
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    start -= timedelta(days=start.weekday())
    return start.astimezone(UTC), (start + timedelta(days=7)).astimezone(UTC)
