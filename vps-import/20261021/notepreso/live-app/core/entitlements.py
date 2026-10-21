from __future__ import annotations

import hashlib

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings
from app.core.database import DatabaseManager


_ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due"}


class PlanLimitError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str,
        upgrade_required: bool = True,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.upgrade_required = upgrade_required
        self.metadata = metadata or {}

    def public_detail(self) -> dict[str, Any]:
        return {
            "message": str(self),
            "code": self.code,
            "upgrade_required": self.upgrade_required,
            **self.metadata,
        }


@dataclass(frozen=True)
class PlanPolicy:
    code: str
    name: str
    monthly_presentations: int
    monthly_chat_messages: int
    vision_enabled: bool
    preview_slide_limit: int | None = None
    one_time_preview: bool = False
    weekly_presentations: int | None = None

    @staticmethod
    def _remaining(limit: int, used: int) -> int | None:
        if limit <= 0:
            return None
        return max(0, limit - used)

    def public_limits(self) -> dict[str, Any]:
        return {
            "presentations": self.weekly_presentations or self.monthly_presentations,
            "weekly_presentations": self.weekly_presentations,
            "presentation_period": "weekly" if self.weekly_presentations else "monthly",
            "chat_messages": self.monthly_chat_messages,
            "vision_enabled": self.vision_enabled,
            "preview_slides": self.preview_slide_limit,
            "one_time_preview": self.one_time_preview,
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

    Free presentation access uses a recurring weekly account quota.
    Paid plans keep the existing slide-credit model.
    Payment integrations only update subscription state; job and chat APIs enforce
    entitlements here.
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
                preview_slide_limit=None,
                one_time_preview=False,
            )
        return PlanPolicy(
            code="free",
            name="Free",
            monthly_presentations=0,
            weekly_presentations=self.settings.free_weekly_presentations,
            monthly_chat_messages=self.settings.free_monthly_chat_messages,
            vision_enabled=self.settings.free_vision_enabled,
            preview_slide_limit=self.settings.free_preview_slide_limit,
            one_time_preview=False,
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
                free_preview_used=False,
            )

        subscription = self.db.get_subscription(owner)
        usage = self.db.get_monthly_usage(owner, now=current_time)
        effective_plan = self._effective_plan(subscription, now=current_time)
        policy = self.policy(effective_plan)
        weekly = self.db.get_free_weekly_usage(owner, now=current_time) if effective_plan == "free" else None
        free_preview_used = bool(weekly and weekly["presentations"] >= self.settings.free_weekly_presentations)
        return self._public_snapshot(
            subscription=subscription,
            effective_plan=effective_plan,
            policy=policy,
            usage=usage,
            free_preview_used=free_preview_used,
            weekly=weekly,
        )

    def _public_snapshot(
        self,
        *,
        subscription: dict[str, Any],
        effective_plan: str,
        policy: PlanPolicy,
        usage: dict[str, Any],
        free_preview_used: bool,
        weekly: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        remaining = policy.remaining(usage)
        if effective_plan == "free":
            from app.core.free_quota import week_bounds
            start, end = week_bounds()
            weekly = weekly or {"presentations": 0, "period_start": start, "period_end": end}
            remaining["presentations"] = max(0, self.settings.free_weekly_presentations - weekly["presentations"])
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
                "presentations": int(weekly["presentations"] if weekly else usage.get("presentation_jobs", 0)),
                "vision_presentations": int(usage.get("vision_jobs", 0)),
                "chat_messages": int(usage.get("chat_messages", 0)),
            },
            "remaining": remaining,
            "weekly_usage": weekly,
            "presentation_period_start": weekly["period_start"] if weekly else usage.get("period_start"),
            "presentation_period_end": weekly["period_end"] if weekly else usage.get("period_end"),
            "entitlements": {
                "vision": policy.vision_enabled,
                "free_preview_used": free_preview_used,
                "welcome_credits": False,
                "free_preview_slide_limit": self.settings.free_preview_slide_limit,
            },
            "billing": self._billing_snapshot(subscription=subscription, effective_plan=effective_plan),
        }

    def public_pricing(self) -> dict[str, Any]:
        anonymous_subscription = {
            "provider": None,
            "provider_subscription_id": None,
            "cancel_at_period_end": False,
        }
        billing = self._billing_snapshot(
            subscription=anonymous_subscription,
            effective_plan="free",
        )

        topup_packs = [
            {
                "product": "topup_250",
                "credits": int(self.settings.topup_250_slide_credits),
                "price_minor": int(self.settings.paddle_topup_250_price_minor),
                "currency": self.settings.paddle_pro_currency.strip().upper(),
                "best_value": False,
            },
            {
                "product": "topup_500",
                "credits": int(self.settings.topup_500_slide_credits),
                "price_minor": int(self.settings.paddle_topup_500_price_minor),
                "currency": self.settings.paddle_pro_currency.strip().upper(),
                "best_value": False,
            },
            {
                "product": "topup_750",
                "credits": int(self.settings.topup_750_slide_credits),
                "price_minor": int(
                    self.settings.paddle_topup_750_price_minor
                    or self.settings.paddle_topup_price_minor
                ),
                "currency": self.settings.paddle_pro_currency.strip().upper(),
                "best_value": True,
            },
        ]

        return {
            "free_preview_slides": self.settings.free_preview_slide_limit,
            "free_weekly_presentations": self.settings.free_weekly_presentations,
            "free_signup_credits": 0,
            "pro_presentations": self.settings.pro_monthly_presentations,
            "pro_monthly_slide_credits": self.settings.pro_monthly_slide_credits,
            "topup_slide_credits": self.settings.topup_slide_credits,
            "topup_packs": topup_packs,
            "pro_chat_messages": self.settings.pro_monthly_chat_messages,
            "pro_vision_enabled": self.settings.pro_vision_enabled,
            "providers": billing.get("providers", []),
            "checkout_enabled": bool(billing.get("checkout_enabled")),
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
                    "interval": "month",
                    "checkout_mode": "subscription",
                    "access_days": None,
                    "topup_price": self.settings.paddle_topup_price_minor,
                    "topup_credits": self.settings.topup_slide_credits,
                    "cancel_enabled": bool(
                        effective_plan == "pro"
                        and subscription.get("provider") == "paddle"
                        and subscription.get("provider_subscription_id")
                        and not subscription.get("cancel_at_period_end", False)
                        and self.settings.paddle_available
                    ),
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

    def _weekly_limit_error(self, snapshot: dict[str, Any]) -> PlanLimitError:
        return PlanLimitError(
            f"You have used all {self.settings.free_weekly_presentations} free presentations this week. "
            "Wait until Monday 00:00 WIB or upgrade to Pro.",
            code="free_weekly_limit",
            metadata={"limit": self.settings.free_weekly_presentations,
                      "remaining": 0, "resets_at": (snapshot["presentation_period_end"].isoformat()
                                    if snapshot.get("presentation_period_end") else None),
                      "timezone": "Asia/Jakarta"},
        )

    def check_presentation(self, owner: str, *, use_vision: bool,
                           check_quota: bool = True) -> dict[str, Any]:
        snapshot = self.account_snapshot(owner)
        if self.db is None:
            raise PlanLimitError("Account quota storage is unavailable. Please try again later.",
                                 code="quota_unavailable", upgrade_required=False)
        policy = self.policy(snapshot["plan"])
        if use_vision and not policy.vision_enabled:
            raise PlanLimitError(
                "Text + Vision is a Pro feature. Upgrade to Pro or use Text-only for the free preview.",
                code="vision_requires_pro",
            )
        if check_quota and snapshot["plan"] == "free" and snapshot["remaining"]["presentations"] <= 0:
            raise self._weekly_limit_error(snapshot)
        return snapshot

    def reserve_presentation(self, owner: str, *, use_vision: bool,
                             job_id: str) -> dict[str, Any]:
        # The DB reservation, rather than a stale snapshot, is authoritative.
        # A retry of the same accepted job remains allowed at the weekly limit.
        snapshot = self.check_presentation(owner, use_vision=use_vision, check_quota=False)
        if snapshot["plan"] == "free":
            assert self.db is not None
            if not self.db.reserve_free_presentation(
                owner, job_id=job_id, limit=self.settings.free_weekly_presentations,
            ):
                raise self._weekly_limit_error(snapshot)
        return self.account_snapshot(owner)

    def release_presentation(self, owner: str, *, use_vision: bool,
                             plan: str | None = None, job_id: str | None = None) -> None:
        if self.db is not None and plan == "free" and job_id:
            self.db.release_free_presentation(owner, job_id=job_id)

    @staticmethod
    def _credit_cycle_key(
        owner: str,
        period_start: datetime,
        period_end: datetime,
    ) -> str:
        owner_hash = hashlib.sha256(owner.encode("utf-8")).hexdigest()[:24]
        return (
            f"monthly-credit:{owner_hash}:"
            f"{period_start.isoformat()}:{period_end.isoformat()}"
        )[:255]

    def _subscription_credit_period(
        self,
        owner: str,
        *,
        now: datetime | None = None,
    ) -> tuple[datetime, datetime]:
        """Resolve the credit reset period from the active subscription.

        Paddle/Xendit subscription dates are authoritative. A UTC calendar-month
        fallback exists only for legacy Pro rows that predate explicit periods.
        """
        current_time = (now or datetime.now(UTC)).astimezone(UTC)

        if self.db is None:
            start = datetime(
                current_time.year,
                current_time.month,
                1,
                tzinfo=UTC,
            )
            if current_time.month == 12:
                end = datetime(current_time.year + 1, 1, 1, tzinfo=UTC)
            else:
                end = datetime(
                    current_time.year,
                    current_time.month + 1,
                    1,
                    tzinfo=UTC,
                )
            return start, end

        subscription = self.db.get_subscription(owner)

        start = self._aware(subscription.get("current_period_start"))
        end = self._aware(subscription.get("current_period_end"))

        if start is not None and end is not None and end > start:
            return start, end

        # Compatibility fallback for older/manual Pro entitlements.
        start = datetime(
            current_time.year,
            current_time.month,
            1,
            tzinfo=UTC,
        )
        if current_time.month == 12:
            end = datetime(current_time.year + 1, 1, 1, tzinfo=UTC)
        else:
            end = datetime(
                current_time.year,
                current_time.month + 1,
                1,
                tzinfo=UTC,
            )
        return start, end

    def ensure_pro_credit_cycle(
        self,
        owner: str,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        """Ensure an active Pro account has its current monthly allowance.

        This operation is idempotent. Calling it repeatedly during the same
        billing period does not grant credits twice.
        """
        snapshot = self.account_snapshot(owner, now=now)

        if snapshot.get("plan") != "pro":
            raise PlanLimitError(
                "An active Pro subscription is required to use AI Slide Credits.",
                code="pro_required",
            )

        if self.db is None:
            return {
                "owner": owner,
                "monthly_credits": self.settings.pro_monthly_slide_credits,
                "topup_credits": 0,
                "total_credits": self.settings.pro_monthly_slide_credits,
                "period_start": None,
                "period_end": None,
            }

        period_start, period_end = self._subscription_credit_period(
            owner,
            now=now,
        )

        wallet = self.db.get_credit_wallet(owner)

        wallet_start = self._aware(wallet.get("period_start"))
        wallet_end = self._aware(wallet.get("period_end"))

        if wallet_start != period_start or wallet_end != period_end:
            result = self.db.reset_monthly_credits(
                owner,
                credits=self.settings.pro_monthly_slide_credits,
                period_start=period_start,
                period_end=period_end,
                idempotency_key=self._credit_cycle_key(
                    owner,
                    period_start,
                    period_end,
                ),
                metadata={
                    "source": "pro_subscription_cycle",
                    "allowance": self.settings.pro_monthly_slide_credits,
                },
            )
            wallet = result["wallet"]

        return wallet

    def credit_snapshot(
        self,
        owner: str,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        snapshot = self.account_snapshot(owner, now=now)

        if self.db is None:
            if snapshot.get("plan") == "pro":
                monthly = self.settings.pro_monthly_slide_credits
                return {
                    "active": True,
                    "monthly": monthly,
                    "topup": 0,
                    "total": monthly,
                    "monthly_allowance": self.settings.pro_monthly_slide_credits,
                    "topup_pack_size": self.settings.topup_slide_credits,
                    "topup_pack_sizes": [
                        self.settings.topup_250_slide_credits,
                        self.settings.topup_500_slide_credits,
                        self.settings.topup_750_slide_credits,
                    ],
                    "period_start": None,
                    "period_end": None,
                }
            return {
                "active": False,
                "monthly": 0,
                "topup": 0,
                "total": 0,
                "monthly_allowance": 0,
                "topup_pack_size": self.settings.topup_slide_credits,
                    "topup_pack_sizes": [
                        self.settings.topup_250_slide_credits,
                        self.settings.topup_500_slide_credits,
                        self.settings.topup_750_slide_credits,
                    ],
                "period_start": None,
                "period_end": None,
            }

        # Preserve purchased top-up balance even if Pro is temporarily inactive,
        # but it is not spendable until Pro becomes active again.
        wallet = self.db.get_credit_wallet(owner)

        if snapshot.get("plan") == "pro":
            wallet = self.ensure_pro_credit_cycle(owner, now=now)
            active = True
        else:
            active = False

        monthly = int(wallet.get("monthly_credits", 0)) if active else 0
        topup = int(wallet.get("topup_credits", 0))

        return {
            "active": active,
            "monthly": monthly,
            "topup": topup,
            "total": monthly + (topup if active else 0),
            "stored_topup": topup,
            "monthly_allowance": (
                self.settings.pro_monthly_slide_credits if active else 0
            ),
            "topup_pack_size": self.settings.topup_slide_credits,
                    "topup_pack_sizes": [
                        self.settings.topup_250_slide_credits,
                        self.settings.topup_500_slide_credits,
                        self.settings.topup_750_slide_credits,
                    ],
            "period_start": wallet.get("period_start"),
            "period_end": wallet.get("period_end"),
        }

    def reserve_slide_credits(
        self,
        owner: str,
        *,
        credits: int,
        job_id: str,
        idempotency_key: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Reserve one customer-facing credit per target slide."""
        if credits <= 0:
            raise ValueError("Slide credit requirement must be positive.")

        snapshot = self.account_snapshot(owner)
        if snapshot.get("plan") != "pro":
            raise PlanLimitError("An active Pro subscription is required.", code="pro_required")

        if self.db is None:
            return {
                "allowed": True,
                "applied": False,
                "required": credits,
                "monthly_used": credits,
                "topup_used": 0,
                "wallet": {
                    "monthly_credits": self.settings.pro_monthly_slide_credits,
                    "topup_credits": 0,
                    "total_credits": self.settings.pro_monthly_slide_credits,
                },
            }

        # Lazy/idempotent cycle initialization ensures a successful renewal
        # immediately makes the month's allowance available.
        self.ensure_pro_credit_cycle(owner)

        result = self.db.reserve_slide_credits(
            owner,
            credits=credits,
            job_id=job_id,
            idempotency_key=idempotency_key,
            metadata=metadata,
        )

        if not result.get("allowed"):
            wallet = result.get("wallet", {})
            raise PlanLimitError(
                (
                    f"This presentation needs {credits} AI Slide Credits, "
                    f"but only {int(result.get('available', 0))} are available."
                ),
                code="slide_credits_insufficient",
                metadata={
                    "required_credits": int(credits),
                    "available_credits": int(result.get("available", 0)),
                    "shortfall_credits": int(result.get("shortfall", credits)),
                    "monthly_credits": int(wallet.get("monthly_credits", 0)),
                    "topup_credits": int(wallet.get("topup_credits", 0)),
                },
            )

        return result

    def refund_slide_credits(
        self,
        owner: str,
        *,
        reservation_key: str,
        idempotency_key: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        if self.db is None:
            return None

        return self.db.refund_slide_reservation(
            owner,
            reservation_key=reservation_key,
            idempotency_key=idempotency_key,
            metadata=metadata,
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
