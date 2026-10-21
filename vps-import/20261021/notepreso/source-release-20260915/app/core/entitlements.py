from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings
from app.core.database import DatabaseManager


_ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due"}


class PlanLimitError(RuntimeError):
    def __init__(self, message: str, *, code: str, upgrade_required: bool = True) -> None:
        super().__init__(message)
        self.code = code
        self.upgrade_required = upgrade_required


@dataclass(frozen=True)
class PlanPolicy:
    code: str
    name: str
    monthly_presentations: int
    monthly_chat_messages: int
    vision_enabled: bool

    @staticmethod
    def _remaining(limit: int, used: int) -> int | None:
        if limit <= 0:
            return None
        return max(0, limit - used)

    def public_limits(self) -> dict[str, Any]:
        return {
            "presentations": self.monthly_presentations,
            "chat_messages": self.monthly_chat_messages,
            "vision_enabled": self.vision_enabled,
        }

    def remaining(self, usage: dict[str, Any]) -> dict[str, int | None]:
        return {
            "presentations": self._remaining(
                self.monthly_presentations,
                int(usage.get("presentation_jobs", 0)),
            ),
            "chat_messages": self._remaining(
                self.monthly_chat_messages,
                int(usage.get("chat_messages", 0)),
            ),
        }


class EntitlementService:
    """Internal Free/Pro source of truth, independent of payment providers.

    Payment integrations should only update the subscription record. Feature checks and
    quota enforcement stay here, so Stripe/Xendit/Paddle can be swapped without changing
    the job or chat APIs.
    """

    def __init__(self, db: DatabaseManager | None, settings: Settings) -> None:
        self.db = db
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return self.db is not None

    def policy(self, plan: str) -> PlanPolicy:
        if plan == "pro":
            return PlanPolicy(
                code="pro",
                name="Pro",
                monthly_presentations=self.settings.pro_monthly_presentations,
                monthly_chat_messages=self.settings.pro_monthly_chat_messages,
                vision_enabled=self.settings.pro_vision_enabled,
            )
        return PlanPolicy(
            code="free",
            name="Free",
            monthly_presentations=self.settings.free_monthly_presentations,
            monthly_chat_messages=self.settings.free_monthly_chat_messages,
            vision_enabled=self.settings.free_vision_enabled,
        )

    @staticmethod
    def _aware(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _effective_plan(self, subscription: dict[str, Any], *, now: datetime) -> str:
        if str(subscription.get("plan") or "free").lower() != "pro":
            return "free"
        if str(subscription.get("status") or "").lower() not in _ACTIVE_SUBSCRIPTION_STATUSES:
            return "free"
        period_end = self._aware(subscription.get("current_period_end"))
        if period_end is not None and period_end <= now:
            return "free"
        return "pro"

    def account_snapshot(self, owner: str, *, now: datetime | None = None) -> dict[str, Any]:
        current_time = (now or datetime.now(UTC)).astimezone(UTC)

        if self.db is None:
            policy = self.policy("free")
            start = datetime(current_time.year, current_time.month, 1, tzinfo=UTC)
            if current_time.month == 12:
                end = datetime(current_time.year + 1, 1, 1, tzinfo=UTC)
            else:
                end = datetime(current_time.year, current_time.month + 1, 1, tzinfo=UTC)
            usage = {
                "period_start": start,
                "period_end": end,
                "presentation_jobs": 0,
                "vision_jobs": 0,
                "chat_messages": 0,
            }
            return self._public_snapshot(
                subscription={
                    "plan": "free",
                    "status": "active",
                    "provider": None,
                    "current_period_start": None,
                    "current_period_end": None,
                    "cancel_at_period_end": False,
                },
                effective_plan="free",
                policy=policy,
                usage=usage,
            )

        subscription = self.db.get_subscription(owner)
        usage = self.db.get_monthly_usage(owner, now=current_time)
        effective_plan = self._effective_plan(subscription, now=current_time)
        policy = self.policy(effective_plan)
        return self._public_snapshot(
            subscription=subscription,
            effective_plan=effective_plan,
            policy=policy,
            usage=usage,
        )

    def _public_snapshot(
        self,
        *,
        subscription: dict[str, Any],
        effective_plan: str,
        policy: PlanPolicy,
        usage: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "plan": effective_plan,
            "plan_name": policy.name,
            "subscription_status": str(subscription.get("status") or "active"),
            "provider": subscription.get("provider"),
            "current_period_start": subscription.get("current_period_start"),
            "current_period_end": subscription.get("current_period_end"),
            "cancel_at_period_end": bool(subscription.get("cancel_at_period_end", False)),
            "usage_period_start": usage.get("period_start"),
            "usage_period_end": usage.get("period_end"),
            "limits": policy.public_limits(),
            "usage": {
                "presentations": int(usage.get("presentation_jobs", 0)),
                "vision_presentations": int(usage.get("vision_jobs", 0)),
                "chat_messages": int(usage.get("chat_messages", 0)),
            },
            "remaining": policy.remaining(usage),
            "entitlements": {
                "vision": policy.vision_enabled,
            },
            "billing": self._billing_snapshot(subscription=subscription, effective_plan=effective_plan),
        }

    def _billing_snapshot(
        self,
        *,
        subscription: dict[str, Any],
        effective_plan: str,
    ) -> dict[str, Any]:
        def provider_snapshot(provider: str) -> dict[str, Any]:
            if provider == "xendit":
                checkout_mode = (
                    "subscription"
                    if self.settings.xendit_checkout_mode.lower() == "subscription"
                    else "one_time"
                )
                return {
                    "provider": "xendit",
                    "checkout_enabled": self.settings.xendit_available,
                    "currency": "IDR",
                    "price": self.settings.xendit_pro_price_idr,
                    "interval": "month" if checkout_mode == "subscription" else "30_days",
                    "checkout_mode": checkout_mode,
                    "access_days": self.settings.xendit_pro_access_days,
                    "cancel_enabled": bool(
                        effective_plan == "pro"
                        and subscription.get("provider") == "xendit"
                        and subscription.get("provider_subscription_id")
                        and not subscription.get("cancel_at_period_end", False)
                        and self.settings.xendit_available
                    ),
                }
            if provider == "stripe":
                return {
                    "provider": "stripe",
                    "checkout_enabled": self.settings.stripe_available,
                    "currency": "IDR",
                    "price": self.settings.stripe_pro_price_idr,
                    "interval": "30_days",
                    "checkout_mode": "one_time",
                    "access_days": self.settings.stripe_pro_access_days,
                    "cancel_enabled": False,
                }
            if provider == "paddle":
                return {
                    "provider": "paddle",
                    "checkout_enabled": self.settings.paddle_available,
                    "currency": self.settings.paddle_pro_currency.strip().upper(),
                    "price": self.settings.paddle_pro_price_minor,
                    "price_minor_units": True,
                    "interval": "30_days",
                    "checkout_mode": "one_time",
                    "access_days": self.settings.paddle_pro_access_days,
                    "cancel_enabled": False,
                }
            return {
                "provider": provider or "disabled",
                "checkout_enabled": False,
                "currency": None,
                "price": None,
                "interval": None,
                "checkout_mode": None,
                "access_days": None,
                "cancel_enabled": False,
            }

        providers = [
            provider_snapshot(provider)
            for provider in self.settings.enabled_payment_providers
            if getattr(self.settings, f"{provider}_available", False)
        ]
        default_provider = self.settings.default_payment_provider
        default_snapshot = provider_snapshot(default_provider)
        default_snapshot["providers"] = providers
        default_snapshot["active_provider"] = subscription.get("provider")
        default_snapshot["checkout_enabled"] = bool(providers)
        default_snapshot["cancel_enabled"] = any(bool(item.get("cancel_enabled")) for item in providers)
        return default_snapshot

    def check_presentation(self, owner: str, *, use_vision: bool) -> dict[str, Any]:
        snapshot = self.account_snapshot(owner)
        if self.db is None:
            return snapshot
        policy = self.policy(snapshot["plan"])
        if use_vision and not policy.vision_enabled:
            raise PlanLimitError(
                "Text + Vision is a Pro feature. Upgrade to Pro or switch AI Analysis Mode to Text-only.",
                code="vision_requires_pro",
            )
        remaining = snapshot.get("remaining", {}).get("presentations")
        if remaining is not None and int(remaining) <= 0:
            raise PlanLimitError(
                f"Your {policy.name} plan has reached its monthly presentation limit. "
                "Upgrade to Pro or wait for the next monthly usage period.",
                code="presentation_quota_exhausted",
            )
        return snapshot

    def reserve_presentation(self, owner: str, *, use_vision: bool) -> dict[str, Any]:
        snapshot = self.check_presentation(owner, use_vision=use_vision)
        policy = self.policy(snapshot["plan"])
        if self.db is None:
            return snapshot

        allowed, _ = self.db.reserve_monthly_usage(
            owner,
            counter="presentation_jobs",
            limit=policy.monthly_presentations,
            vision_increment=1 if use_vision else 0,
        )
        if not allowed:
            raise PlanLimitError(
                f"Your {policy.name} plan has reached its monthly presentation limit. "
                "Upgrade to Pro or wait for the next monthly usage period.",
                code="presentation_quota_exhausted",
            )
        return self.account_snapshot(owner)

    def release_presentation(self, owner: str, *, use_vision: bool) -> None:
        if self.db is None:
            return
        self.db.release_monthly_usage(
            owner,
            counter="presentation_jobs",
            vision_decrement=1 if use_vision else 0,
        )

    def reserve_chat_message(self, owner: str) -> dict[str, Any]:
        snapshot = self.account_snapshot(owner)
        policy = self.policy(snapshot["plan"])
        if self.db is None:
            return snapshot

        allowed, _ = self.db.reserve_monthly_usage(
            owner,
            counter="chat_messages",
            limit=policy.monthly_chat_messages,
        )
        if not allowed:
            raise PlanLimitError(
                f"Your {policy.name} plan has reached its monthly AI chat limit. "
                "Upgrade to Pro or wait for the next monthly usage period.",
                code="chat_quota_exhausted",
            )
        return self.account_snapshot(owner)

    def release_chat_message(self, owner: str) -> None:
        if self.db is None:
            return
        self.db.release_monthly_usage(owner, counter="chat_messages")
