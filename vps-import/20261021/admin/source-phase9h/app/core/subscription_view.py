from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Iterable

_ACTIVE_STATUSES = {"active", "trialing", "past_due"}


def _as_utc(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def subscription_view(raw: dict[str, Any] | None, *, now: datetime | None = None) -> dict[str, Any]:
    """Normalize billing rows into the access state the admin UI should display.

    The user application remains the source of truth. This helper mirrors the
    user-app entitlement rule: Pro is effective only while the raw subscription
    says Pro, its status remains access-bearing, and the paid period has not
    expired. No mutation is performed here.
    """

    current_time = (now or datetime.now(UTC)).astimezone(UTC)
    source = dict(raw or {})

    raw_plan = str(source.get("subscription_plan") or source.get("plan") or "free").strip().lower()
    status = str(source.get("subscription_status") or source.get("status") or "active").strip().lower()
    provider = source.get("provider") or source.get("billing_provider")
    provider_subscription_id = source.get("provider_subscription_id")
    period_start = _as_utc(source.get("current_period_start"))
    period_end = _as_utc(source.get("current_period_end") or source.get("valid_until"))
    cancel_at_period_end = bool(source.get("cancel_at_period_end", False))

    pro_is_effective = (
        raw_plan == "pro"
        and status in _ACTIVE_STATUSES
        and (period_end is None or period_end > current_time)
    )
    effective_plan = "pro" if pro_is_effective else "free"

    if status == "pending_payment":
        state = "pending"
    elif raw_plan == "pro" and period_end is not None and period_end <= current_time:
        state = "expired"
    elif raw_plan != "pro":
        state = "free"
    elif status == "past_due" and pro_is_effective:
        state = "past_due"
    elif status not in _ACTIVE_STATUSES:
        state = "inactive"
    elif cancel_at_period_end and pro_is_effective:
        state = "expiring"
    elif pro_is_effective:
        state = "active"
    else:
        state = "free"

    auto_renew = bool(
        pro_is_effective
        and provider_subscription_id
        and not cancel_at_period_end
    )

    return {
        "plan": effective_plan,
        "plan_name": "Pro" if effective_plan == "pro" else "Free",
        "subscription_plan": raw_plan,
        "subscription_status": status,
        "billing_provider": str(provider).strip().lower() if provider else None,
        "provider_subscription_id": str(provider_subscription_id).strip() if provider_subscription_id else None,
        "current_period_start": period_start,
        "current_period_end": period_end,
        "valid_until": period_end,
        "cancel_at_period_end": cancel_at_period_end,
        "auto_renew": auto_renew,
        "billing_state": state,
        "is_paid": effective_plan == "pro",
        "has_subscription_record": bool(raw),
    }


def billing_counts(
    subscriptions: Iterable[dict[str, Any]],
    *,
    total_users: int,
    now: datetime | None = None,
) -> dict[str, int]:
    current_time = (now or datetime.now(UTC)).astimezone(UTC)
    views = [subscription_view(item, now=current_time) for item in subscriptions]

    pro_users = sum(1 for item in views if item["plan"] == "pro")
    expiring_pro = sum(
        1
        for item in views
        if item["plan"] == "pro"
        and (
            item["billing_state"] == "expiring"
            or (
                item["valid_until"] is not None
                and current_time < item["valid_until"] <= current_time + timedelta(days=7)
            )
        )
    )
    expired = sum(1 for item in views if item["billing_state"] == "expired")
    pending = sum(1 for item in views if item["billing_state"] == "pending")
    past_due = sum(1 for item in views if item["billing_state"] == "past_due")

    # An account without a subscription row is Free by definition.
    free_users = max(0, int(total_users) - pro_users)

    return {
        "free_users": free_users,
        "pro_users": pro_users,
        "expiring_pro": expiring_pro,
        "expired_subscriptions": expired,
        "pending_payments": pending,
        "past_due_subscriptions": past_due,
    }
