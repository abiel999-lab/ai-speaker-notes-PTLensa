from __future__ import annotations

import hashlib
import json
from calendar import monthrange
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import Settings
from app.core.database import DatabaseManager
from app.core.entitlements import EntitlementService
from app.services.payments.paddle import PaddlePaymentClient
from app.services.payments.stripe import StripePaymentClient
from app.services.payments.xendit import XenditPaymentClient


class BillingError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return _aware(value)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(UTC)
    except (TypeError, ValueError):
        return None


def _add_month(value: datetime) -> datetime:
    value = value.astimezone(UTC)
    year = value.year + (1 if value.month == 12 else 0)
    month = 1 if value.month == 12 else value.month + 1
    day = min(value.day, monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _event_key(payload: dict[str, Any]) -> str:
    event = str(payload.get("event") or "unknown")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    object_id = (
        data.get("id")
        or data.get("payment_session_id")
        or data.get("plan_id")
        or data.get("recurring_plan_id")
        or data.get("reference_id")
    )
    status = data.get("status") or ""
    if object_id:
        return f"xendit:{event}:{object_id}:{status}"[:255]
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return f"xendit:{hashlib.sha256(canonical.encode()).hexdigest()}"


def _stripe_event_key(payload: dict[str, Any]) -> str:
    event_id = str(payload.get("id") or "").strip()
    if event_id:
        return f"stripe:{event_id}"[:255]
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return f"stripe:{hashlib.sha256(canonical.encode()).hexdigest()}"


def _paddle_event_key(payload: dict[str, Any]) -> str:
    event_id = str(payload.get("event_id") or "").strip()
    if event_id:
        return f"paddle:{event_id}"[:255]
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return f"paddle:{hashlib.sha256(canonical.encode()).hexdigest()}"


class BillingService:
    """Maps payment-provider events into NotePreso's internal subscription state."""

    def __init__(
        self,
        db: DatabaseManager,
        settings: Settings,
        *,
        xendit: XenditPaymentClient | None = None,
        stripe: StripePaymentClient | None = None,
        paddle: PaddlePaymentClient | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.xendit = xendit
        self.stripe = stripe
        self.paddle = paddle

    @property
    def provider(self) -> str:
        # Backward-compatible default provider for callers that do not choose one.
        return self.settings.default_payment_provider

    @property
    def enabled_providers(self) -> list[str]:
        result: list[str] = []
        if self.xendit is not None and self.settings.xendit_available:
            result.append("xendit")
        if self.stripe is not None and self.settings.stripe_available:
            result.append("stripe")
        if self.paddle is not None and self.settings.paddle_available:
            result.append("paddle")
        return result

    @property
    def checkout_enabled(self) -> bool:
        return bool(self.enabled_providers)

    def checkout_mode_for(
        self,
        provider: str,
        product: str = "pro",
    ) -> str:
        product = str(product or "pro").strip().lower()

        if provider == "xendit":
            mode = str(
                self.settings.xendit_checkout_mode or "one_time"
            ).strip().lower()
            return "subscription" if mode == "subscription" else "one_time"

        if provider == "stripe":
            return "one_time"

        if provider == "paddle":
            return "subscription" if product == "pro" else "one_time"

        return "disabled"

    def _topup_pack_for(self, product: str) -> dict[str, Any]:
        product = str(product or "").strip().lower()

        packs: dict[str, dict[str, Any]] = {
            "topup_250": {
                "product": "topup_250",
                "credits": int(self.settings.topup_250_slide_credits),
                "price_id": self.settings.paddle_topup_250_price_id.strip(),
                "price_minor": int(self.settings.paddle_topup_250_price_minor),
            },
            "topup_500": {
                "product": "topup_500",
                "credits": int(self.settings.topup_500_slide_credits),
                "price_id": self.settings.paddle_topup_500_price_id.strip(),
                "price_minor": int(self.settings.paddle_topup_500_price_minor),
            },
            "topup_750": {
                "product": "topup_750",
                "credits": int(self.settings.topup_750_slide_credits),
                "price_id": (
                    self.settings.paddle_topup_750_price_id.strip()
                    or self.settings.paddle_topup_price_id.strip()
                ),
                "price_minor": int(
                    self.settings.paddle_topup_750_price_minor
                    or self.settings.paddle_topup_price_minor
                ),
            },
        }

        pack = packs.get(product)

        if pack is None:
            raise BillingError(
                "Unsupported AI Slide Credit top-up pack.",
                status_code=400,
            )

        return pack

    def checkout_price_for(
        self,
        provider: str,
        product: str = "pro",
    ) -> int:
        product = str(product or "pro").strip().lower()

        if provider == "xendit":
            return self.settings.xendit_pro_price_idr

        if provider == "stripe":
            return self.settings.stripe_pro_price_idr

        if provider == "paddle":
            if product.startswith("topup_"):
                return int(self._topup_pack_for(product)["price_minor"])
            return self.settings.paddle_pro_price_minor

        return 0

    def checkout_access_days_for(self, provider: str) -> int:
        if provider == "xendit":
            return self.settings.xendit_pro_access_days
        if provider == "stripe":
            return self.settings.stripe_pro_access_days
        if provider == "paddle":
            return self.settings.paddle_pro_access_days
        return 0

    def checkout_currency_for(self, provider: str) -> str:
        if provider in {"xendit", "stripe"}:
            return "IDR"
        if provider == "paddle":
            return self.settings.paddle_pro_currency.strip().upper()
        return ""

    def create_checkout(
        self,
        *,
        owner: str,
        username: str,
        email: str | None,
        display_name: str | None,
        provider: str | None = None,
        product: str = "pro",
    ) -> dict[str, Any]:
        selected_provider = str(
            provider or self.provider or ""
        ).strip().lower()

        selected_product = str(
            product or "pro"
        ).strip().lower()

        supported_products = {
            "pro",
            "topup_250",
            "topup_500",
            "topup_750",
        }

        if selected_product not in supported_products:
            raise BillingError(
                "Unsupported billing product.",
                status_code=400,
            )

        if selected_provider not in self.enabled_providers:
            raise BillingError(
                "Selected payment provider is not available.",
                status_code=400,
            )

        # Credit top-ups are currently a Paddle-only product.
        is_topup = selected_product.startswith("topup_")

        if is_topup and selected_provider != "paddle":
            raise BillingError(
                "AI Credit top-ups are currently available through Paddle.",
                status_code=400,
            )

        subscription = self.db.get_subscription(owner)
        now = datetime.now(UTC)
        period_end = _aware(subscription.get("current_period_end"))

        active_pro = (
            str(subscription.get("plan") or "free").lower() == "pro"
            and str(subscription.get("status") or "").lower()
            in {"active", "trialing"}
            and (period_end is None or period_end > now)
        )

        if is_topup:
            # Use the same effective access rules as account/plan and generation.
            # An active manual Pro grant is independent of a paid subscription.
            access = EntitlementService(self.db, self.settings)
            effective, _, _ = access._effective_access_source(
                owner, now=now, subscription=subscription,
            )
            active_pro = access._effective_plan(effective, now=now) == "pro"

        if selected_product == "pro" and active_pro:
            raise BillingError(
                "This account already has an active Pro subscription.",
                status_code=409,
            )

        if is_topup and not active_pro:
            raise BillingError(
                "An active Pro subscription is required to buy AI Credit top-ups.",
                status_code=409,
            )

        provider = selected_provider

        # Paddle sessions are product-specific. Do not reuse an older Paddle
        # checkout because a Pro transaction and a top-up transaction have
        # different prices and fulfillment rules.
        existing = None
        if provider != "paddle":
            existing = self.db.get_reusable_payment_checkout(
                owner,
                provider=provider,
                now=now,
            )

        if existing and existing.get("checkout_url"):
            return existing

        prefix = (
            f"np-{selected_product.replace('_', '-')}"
            if is_topup
            else "np-pro"
        )
        reference_id = self.db.new_payment_reference(prefix=prefix)

        self.db.create_payment_checkout(
            reference_id=reference_id,
            owner=owner,
            provider=provider,
            amount=self.checkout_price_for(provider, selected_product),
            currency=self.checkout_currency_for(provider),
            status="CREATING",
        )

        try:
            checkout_kwargs = {
                "reference_id": reference_id,
                "owner": owner,
                "email": email,
                "display_name": display_name,
                "username": username,
                "existing_customer_id": (
                    subscription.get("provider_customer_id")
                    if subscription.get("provider") == provider
                    else None
                ),
            }

            if provider == "xendit":
                if selected_product != "pro":
                    raise BillingError(
                        "This billing product is not available through Xendit.",
                        status_code=400,
                    )

                assert self.xendit is not None

                if self.checkout_mode_for(provider, selected_product) == "subscription":
                    result = self.xendit.create_pro_subscription_session(
                        **checkout_kwargs
                    )
                else:
                    result = self.xendit.create_pro_one_time_session(
                        **checkout_kwargs
                    )

            elif provider == "stripe":
                if selected_product != "pro":
                    raise BillingError(
                        "This billing product is not available through Stripe.",
                        status_code=400,
                    )

                assert self.stripe is not None
                result = self.stripe.create_pro_one_time_session(
                    **checkout_kwargs
                )

            elif provider == "paddle":
                assert self.paddle is not None

                if selected_product == "pro":
                    result = self.paddle.create_pro_subscription_session(
                        **checkout_kwargs
                    )
                else:
                    pack = self._topup_pack_for(selected_product)

                    result = self.paddle.create_topup_session(
                        **checkout_kwargs,
                        product=selected_product,
                        price_id=str(pack["price_id"]),
                        credits=int(pack["credits"]),
                    )

            else:
                raise BillingError(
                    "Payment checkout is not configured yet.",
                    status_code=503,
                )

        except Exception:
            self.db.update_payment_checkout(
                reference_id,
                status="FAILED",
            )
            raise

        checkout = self.db.update_payment_checkout(
            reference_id,
            provider_session_id=(
                str(result.get("payment_session_id") or "") or None
            ),
            provider_plan_id=(
                str(result.get("recurring_plan_id") or "") or None
            ),
            provider_customer_id=(
                str(result.get("customer_id") or "") or None
            ),
            status=str(result.get("status") or "ACTIVE"),
            checkout_url=(
                str(result.get("payment_link_url") or "") or None
            ),
            expires_at=_parse_dt(result.get("expires_at")),
        )

        customer_id = checkout.get("provider_customer_id")

        if (
            customer_id
            and provider == "xendit"
            and selected_product == "pro"
            and self.checkout_mode_for(provider, selected_product)
            == "subscription"
        ):
            current = self.db.get_subscription(owner)

            self.db.set_subscription(
                owner,
                plan=str(current.get("plan") or "free"),
                status=str(current.get("status") or "active"),
                provider="xendit",
                provider_customer_id=customer_id,
                provider_subscription_id=current.get(
                    "provider_subscription_id"
                ),
                current_period_start=current.get(
                    "current_period_start"
                ),
                current_period_end=current.get("current_period_end"),
                cancel_at_period_end=bool(
                    current.get("cancel_at_period_end", False)
                ),
            )

        self.db.audit(
            "billing_checkout_created",
            owner=owner,
            resource_type="payment_checkout",
            resource_id=reference_id,
            metadata={
                "provider": provider,
                "product": selected_product,
                "mode": self.checkout_mode_for(
                    provider,
                    selected_product,
                ),
                "amount": self.checkout_price_for(
                    provider,
                    selected_product,
                ),
                "currency": self.checkout_currency_for(provider),
            },
        )

        return checkout

    def cancel_subscription(self, owner: str) -> dict[str, Any]:
        subscription = self.db.get_subscription(owner)
        provider = str(subscription.get("provider") or "").lower()
        subscription_id = str(
            subscription.get("provider_subscription_id") or ""
        )

        if not subscription_id:
            raise BillingError(
                "There is no renewable subscription to cancel.",
                status_code=409,
            )

        if subscription.get("cancel_at_period_end"):
            return subscription

        if provider == "paddle":
            if self.paddle is None or not self.settings.paddle_available:
                raise BillingError(
                    "Paddle billing is not configured.",
                    status_code=409,
                )

            self.paddle.cancel_subscription(subscription_id)

        elif provider == "xendit":
            if self.xendit is None or not self.settings.xendit_available:
                raise BillingError(
                    "Xendit billing is not configured.",
                    status_code=409,
                )

            self.xendit.deactivate_subscription(subscription_id)

        else:
            raise BillingError(
                "There is no renewable subscription to cancel.",
                status_code=409,
            )

        updated = self.db.set_subscription(
            owner,
            plan=str(subscription.get("plan") or "pro"),
            status=str(subscription.get("status") or "active"),
            provider=provider,
            provider_customer_id=subscription.get(
                "provider_customer_id"
            ),
            provider_subscription_id=subscription_id,
            current_period_start=subscription.get(
                "current_period_start"
            ),
            current_period_end=subscription.get(
                "current_period_end"
            ),
            cancel_at_period_end=True,
        )

        self.db.audit(
            "subscription_cancellation_requested",
            owner=owner,
            resource_type="subscription",
            resource_id=subscription_id,
            metadata={"provider": provider},
        )

        return updated

    def handle_xendit_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        event = str(payload.get("event") or "")
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        event_key = _event_key(payload)

        if self.db.payment_event_processed(event_key):
            return {"processed": False, "duplicate": True, "event": event}

        reference_id = str(data.get("reference_id") or "")
        checkout = self.db.get_payment_checkout(reference_id) if reference_id else None
        plan_id = str(data.get("plan_id") or data.get("recurring_plan_id") or data.get("id") or "")
        if checkout is None and plan_id:
            checkout = self.db.get_payment_checkout_by_plan(plan_id)

        if checkout is None:
            # Ignore unrelated Xendit events safely; this endpoint can share a business account.
            self.db.record_payment_event(
                event_key=event_key,
                provider="xendit",
                event_type=event or "unknown",
                reference_id=reference_id or None,
                provider_object_id=plan_id or None,
                payload=payload,
            )
            return {"processed": False, "ignored": True, "event": event}

        owner = str(checkout["owner"])
        expected_amount = int(checkout["amount"])
        event_amount = data.get("amount")
        if event_amount is not None and int(float(event_amount)) != expected_amount:
            raise BillingError("Xendit webhook amount did not match the checkout record.", status_code=400)
        event_currency = str(data.get("currency") or checkout.get("currency") or "IDR")
        if event_currency != str(checkout.get("currency") or "IDR"):
            raise BillingError("Xendit webhook currency did not match the checkout record.", status_code=400)

        if event == "payment_session.completed":
            provider_session_id = str(data.get("payment_session_id") or "") or checkout.get("provider_session_id")
            if checkout.get("provider_session_id") and provider_session_id != checkout.get("provider_session_id"):
                raise BillingError("Xendit webhook session did not match the checkout record.", status_code=400)

            completed_at = _parse_dt(data.get("updated")) or _parse_dt(data.get("created")) or datetime.now(UTC)
            session_type = str(data.get("session_type") or "").upper()
            customer_id = str(data.get("customer_id") or "") or checkout.get("provider_customer_id")
            recurring_plan_id = str(data.get("recurring_plan_id") or "") or checkout.get("provider_plan_id")

            self.db.update_payment_checkout(
                str(checkout["reference_id"]),
                provider_session_id=provider_session_id,
                provider_plan_id=recurring_plan_id,
                provider_customer_id=customer_id,
                status="COMPLETED",
                completed_at=completed_at,
            )

            if session_type == "PAY":
                if str(data.get("status") or "COMPLETED").upper() != "COMPLETED":
                    raise BillingError("Xendit one-time payment was not completed.", status_code=400)
                access_start = completed_at
                access_end = access_start + timedelta(days=self.settings.xendit_pro_access_days)
                self.db.set_subscription(
                    owner,
                    plan="pro",
                    status="active",
                    provider="xendit",
                    provider_customer_id=customer_id,
                    provider_subscription_id=None,
                    current_period_start=access_start,
                    current_period_end=access_end,
                    cancel_at_period_end=False,
                )
                self.db.update_payment_checkout(
                    str(checkout["reference_id"]),
                    status="PAID",
                    completed_at=completed_at,
                )
                self.db.audit(
                    "one_time_pro_payment_paid",
                    owner=owner,
                    resource_type="payment_checkout",
                    resource_id=str(checkout["reference_id"]),
                    metadata={
                        "provider": "xendit",
                        "payment_id": data.get("payment_id"),
                        "payment_request_id": data.get("payment_request_id"),
                        "amount": expected_amount,
                        "currency": event_currency,
                        "access_days": self.settings.xendit_pro_access_days,
                    },
                )

        elif event == "payment_session.expired":
            self.db.update_payment_checkout(str(checkout["reference_id"]), status="EXPIRED")

        elif event == "recurring.plan.activated":
            actual_plan_id = str(data.get("id") or plan_id or "") or None
            customer_id = str(data.get("customer_id") or "") or checkout.get("provider_customer_id")
            self.db.update_payment_checkout(
                str(checkout["reference_id"]),
                provider_plan_id=actual_plan_id,
                provider_customer_id=customer_id,
                status="PLAN_ACTIVE",
            )
            current = self.db.get_subscription(owner)
            self.db.set_subscription(
                owner,
                plan=str(current.get("plan") or "free"),
                status="pending_payment" if str(current.get("plan") or "free") != "pro" else str(current.get("status") or "active"),
                provider="xendit",
                provider_customer_id=customer_id,
                provider_subscription_id=actual_plan_id,
                current_period_start=current.get("current_period_start"),
                current_period_end=current.get("current_period_end"),
                cancel_at_period_end=False,
            )

        elif event == "recurring.cycle.succeeded":
            scheduled = _parse_dt(data.get("scheduled_timestamp")) or _parse_dt(data.get("created")) or datetime.now(UTC)
            actual_plan_id = str(data.get("plan_id") or checkout.get("provider_plan_id") or "") or None
            customer_id = str(data.get("customer_id") or "") or checkout.get("provider_customer_id")
            self.db.set_subscription(
                owner,
                plan="pro",
                status="active",
                provider="xendit",
                provider_customer_id=customer_id,
                provider_subscription_id=actual_plan_id,
                current_period_start=scheduled,
                current_period_end=_add_month(scheduled),
                cancel_at_period_end=False,
            )
            self.db.update_payment_checkout(
                str(checkout["reference_id"]),
                provider_plan_id=actual_plan_id,
                provider_customer_id=customer_id,
                status="PAID",
                completed_at=datetime.now(UTC),
            )
            self.db.audit(
                "subscription_cycle_paid",
                owner=owner,
                resource_type="subscription",
                resource_id=actual_plan_id,
                metadata={"provider": "xendit", "cycle_id": data.get("id"), "amount": expected_amount, "currency": event_currency},
            )

        elif event == "recurring.cycle.retrying":
            current = self.db.get_subscription(owner)
            if str(current.get("plan") or "free") == "pro":
                self.db.set_subscription(
                    owner,
                    plan="pro",
                    status="past_due",
                    provider="xendit",
                    provider_customer_id=current.get("provider_customer_id"),
                    provider_subscription_id=current.get("provider_subscription_id") or checkout.get("provider_plan_id"),
                    current_period_start=current.get("current_period_start"),
                    current_period_end=current.get("current_period_end"),
                    cancel_at_period_end=bool(current.get("cancel_at_period_end", False)),
                )

        elif event == "recurring.cycle.failed":
            current = self.db.get_subscription(owner)
            if str(current.get("plan") or "free") == "pro":
                self.db.set_subscription(
                    owner,
                    plan="pro",
                    status="past_due",
                    provider="xendit",
                    provider_customer_id=current.get("provider_customer_id"),
                    provider_subscription_id=current.get("provider_subscription_id") or checkout.get("provider_plan_id"),
                    current_period_start=current.get("current_period_start"),
                    current_period_end=current.get("current_period_end"),
                    cancel_at_period_end=bool(current.get("cancel_at_period_end", False)),
                )

        elif event == "recurring.plan.inactivated":
            current = self.db.get_subscription(owner)
            end = _aware(current.get("current_period_end"))
            now = datetime.now(UTC)
            if str(current.get("plan") or "free") == "pro" and end is not None and end > now:
                self.db.set_subscription(
                    owner,
                    plan="pro",
                    status="active",
                    provider="xendit",
                    provider_customer_id=current.get("provider_customer_id"),
                    provider_subscription_id=current.get("provider_subscription_id") or checkout.get("provider_plan_id"),
                    current_period_start=current.get("current_period_start"),
                    current_period_end=end,
                    cancel_at_period_end=True,
                )
            else:
                self.db.set_subscription(
                    owner,
                    plan="free",
                    status="canceled",
                    provider="xendit",
                    provider_customer_id=current.get("provider_customer_id"),
                    provider_subscription_id=current.get("provider_subscription_id") or checkout.get("provider_plan_id"),
                    current_period_start=current.get("current_period_start"),
                    current_period_end=current.get("current_period_end"),
                    cancel_at_period_end=True,
                )

        self.db.record_payment_event(
            event_key=event_key,
            provider="xendit",
            event_type=event or "unknown",
            reference_id=str(checkout.get("reference_id") or "") or None,
            provider_object_id=plan_id or str(data.get("payment_session_id") or "") or None,
            payload=payload,
        )
        return {"processed": True, "duplicate": False, "event": event}


    def handle_stripe_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        event_type = str(payload.get("type") or "")
        event_key = _stripe_event_key(payload)
        if self.db.payment_event_processed(event_key):
            return {"processed": False, "duplicate": True, "event": event_type}

        obj = payload.get("data", {}).get("object") if isinstance(payload.get("data"), dict) else {}
        if not isinstance(obj, dict):
            obj = {}
        metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        reference_id = str(obj.get("client_reference_id") or metadata.get("notepreso_reference") or "")
        session_id = str(obj.get("id") or "")
        checkout = self.db.get_payment_checkout(reference_id) if reference_id else None

        if checkout is None or str(checkout.get("provider") or "").lower() != "stripe":
            self.db.record_payment_event(
                event_key=event_key,
                provider="stripe",
                event_type=event_type or "unknown",
                reference_id=reference_id or None,
                provider_object_id=session_id or None,
                payload=payload,
            )
            return {"processed": False, "ignored": True, "event": event_type}

        if checkout.get("provider_session_id") and session_id != checkout.get("provider_session_id"):
            raise BillingError("Stripe webhook session did not match the checkout record.", status_code=400)

        if event_type in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
            mode = str(obj.get("mode") or "").lower()
            if mode and mode != "payment":
                raise BillingError("Stripe Checkout session was not a one-time payment.", status_code=400)

            payment_status = str(obj.get("payment_status") or "").lower()
            if event_type == "checkout.session.completed" and payment_status not in {"paid", "no_payment_required"}:
                # Some asynchronous methods complete Checkout before funds settle.
                # Wait for checkout.session.async_payment_succeeded instead.
                self.db.record_payment_event(
                    event_key=event_key,
                    provider="stripe",
                    event_type=event_type,
                    reference_id=reference_id,
                    provider_object_id=session_id or None,
                    payload=payload,
                )
                self.db.update_payment_checkout(reference_id, status="PENDING")
                return {"processed": True, "pending": True, "event": event_type}

            expected_amount = int(checkout["amount"])
            amount_total = obj.get("amount_total")
            if amount_total is not None and int(amount_total) != expected_amount * 100:
                raise BillingError("Stripe webhook amount did not match the checkout record.", status_code=400)
            currency = str(obj.get("currency") or "idr").upper()
            if currency != str(checkout.get("currency") or "IDR").upper():
                raise BillingError("Stripe webhook currency did not match the checkout record.", status_code=400)

            created = payload.get("created")
            if isinstance(created, (int, float)):
                paid_at = datetime.fromtimestamp(created, tz=UTC)
            else:
                paid_at = datetime.now(UTC)
            access_end = paid_at + timedelta(days=self.settings.stripe_pro_access_days)
            customer_id = str(obj.get("customer") or "") or checkout.get("provider_customer_id")

            self.db.set_subscription(
                str(checkout["owner"]),
                plan="pro",
                status="active",
                provider="stripe",
                provider_customer_id=customer_id,
                provider_subscription_id=None,
                current_period_start=paid_at,
                current_period_end=access_end,
                cancel_at_period_end=False,
            )
            self.db.update_payment_checkout(
                reference_id,
                provider_session_id=session_id or None,
                provider_customer_id=customer_id or None,
                status="PAID",
                completed_at=paid_at,
            )
            self.db.audit(
                "one_time_pro_payment_paid",
                owner=str(checkout["owner"]),
                resource_type="payment_checkout",
                resource_id=reference_id,
                metadata={
                    "provider": "stripe",
                    "payment_intent": obj.get("payment_intent"),
                    "amount": expected_amount,
                    "currency": currency,
                    "access_days": self.settings.stripe_pro_access_days,
                },
            )

        elif event_type == "checkout.session.expired":
            self.db.update_payment_checkout(reference_id, status="EXPIRED")

        elif event_type == "checkout.session.async_payment_failed":
            self.db.update_payment_checkout(reference_id, status="FAILED")

        recorded = self.db.record_payment_event(
            event_key=event_key,
            provider="stripe",
            event_type=event_type or "unknown",
            reference_id=reference_id or None,
            provider_object_id=session_id or None,
            payload=payload,
        )
        return {"processed": recorded, "event": event_type}

    def handle_paddle_webhook(
        self,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        event_type = str(payload.get("event_type") or "")
        event_key = _paddle_event_key(payload)

        supported_events = {
            "transaction.completed", "transaction.canceled", "transaction.past_due",
            "subscription.created", "subscription.updated", "subscription.canceled",
            "subscription.paused", "subscription.resumed", "subscription.activated",
            "subscription.past_due", "subscription.trialing",
        }
        if event_type not in supported_events:
            return {"processed": False, "ignored": True, "event": event_type}

        data = (
            payload.get("data")
            if isinstance(payload.get("data"), dict)
            else {}
        )

        custom_data = (
            data.get("custom_data")
            if isinstance(data.get("custom_data"), dict)
            else {}
        )

        reference_id = str(
            custom_data.get("notepreso_reference") or ""
        )

        product = str(
            custom_data.get("notepreso_product") or ""
        ).strip().lower()

        object_id = str(data.get("id") or "")

        is_transaction = event_type.startswith("transaction.")
        is_subscription = event_type.startswith("subscription.")

        transaction_id = (
            object_id
            if is_transaction
            else str(data.get("transaction_id") or "")
        )

        subscription_id = (
            object_id
            if is_subscription
            else str(data.get("subscription_id") or "")
        )

        checkout = (
            self.db.get_payment_checkout(reference_id)
            if reference_id
            else None
        )

        if checkout is None and subscription_id:
            checkout = self.db.get_payment_checkout_by_plan(
                subscription_id
            )

        if (
            checkout is None
            or str(checkout.get("provider") or "").lower() != "paddle"
        ):
            # A subscription event may arrive before the related completed
            # transaction. Do not permanently acknowledge an unmatched event.
            # Paddle will retry; operators should investigate persistent 503s.
            raise BillingError(
                "Paddle webhook checkout correlation is not ready.",
                status_code=503,
            )

        owner = str(checkout["owner"])
        reference_id = str(checkout["reference_id"])

        with self.db.paddle_event_transaction(owner) as db:
            if db.has_payment_event(event_key):
                return {"processed": False, "duplicate": True, "event": event_type}
            # Do not allow a signed old subscription event to revert current state.
            stale_status = db.is_stale_subscription_event(
                reference_id, payload,
                terminal_only=(event_type == "transaction.completed"),
            )
            status_applied = False

            # Legacy records do not have an explicit product column.
            # Reference prefix and custom_data together safely distinguish them.
            supported_products = {
                "pro",
                "topup_250",
                "topup_500",
                "topup_750",
            }

            if product not in supported_products:
                if reference_id.startswith("np-topup-250-"):
                    product = "topup_250"
                elif reference_id.startswith("np-topup-500-"):
                    product = "topup_500"
                elif reference_id.startswith("np-topup-750-"):
                    product = "topup_750"
                else:
                    product = "pro"

            topup_pack = (
                self._topup_pack_for(product)
                if product.startswith("topup_")
                else None
            )

            expected_price_id = (
                str(topup_pack["price_id"])
                if topup_pack is not None
                else self.settings.paddle_pro_price_id.strip()
            )

            expected_amount = (
                int(topup_pack["price_minor"])
                if topup_pack is not None
                else int(self.settings.paddle_pro_price_minor)
            )

            expected_credits = (
                int(topup_pack["credits"])
                if topup_pack is not None
                else int(self.settings.pro_monthly_slide_credits)
            )

            expected_currency = str(
                checkout.get("currency")
                or self.settings.paddle_pro_currency
            ).upper()

            if event_type == "transaction.completed":
                if str(data.get("status") or "").lower() != "completed":
                    raise BillingError(
                        "Paddle transaction was not completed.",
                        status_code=400,
                    )

                items = (
                    data.get("items")
                    if isinstance(data.get("items"), list)
                    else []
                )

                matches: list[
                    tuple[dict[str, Any], dict[str, Any]]
                ] = []

                for item in items:
                    if not isinstance(item, dict):
                        continue

                    price = (
                        item.get("price")
                        if isinstance(item.get("price"), dict)
                        else {}
                    )

                    if str(price.get("id") or "") == expected_price_id:
                        matches.append((item, price))

                if (
                    len(matches) != 1
                    or int(matches[0][0].get("quantity") or 0) != 1
                ):
                    raise BillingError(
                        "Paddle webhook price did not match the configured NotePreso product.",
                        status_code=400,
                    )

                price = matches[0][1]
                unit_price = (
                    price.get("unit_price")
                    if isinstance(price.get("unit_price"), dict)
                    else {}
                )

                raw_amount = unit_price.get("amount")

                if (
                    raw_amount is not None
                    and int(raw_amount) != expected_amount
                ):
                    raise BillingError(
                        "Paddle webhook price amount did not match the checkout record.",
                        status_code=400,
                    )

                currency = str(
                    data.get("currency_code")
                    or unit_price.get("currency_code")
                    or ""
                ).upper()

                if currency and currency != expected_currency:
                    raise BillingError(
                        "Paddle webhook currency did not match the checkout record.",
                        status_code=400,
                    )

                paid_at = PaddlePaymentClient.parse_event_time(payload)
                customer_id = (
                    str(data.get("customer_id") or "")
                    or checkout.get("provider_customer_id")
                )

                if product.startswith("topup_"):
                    # A top-up is intentionally a non-recurring Paddle price.
                    if subscription_id:
                        raise BillingError(
                            "Paddle top-up unexpectedly created a subscription.",
                            status_code=400,
                        )

                    db.grant_topup_credits(
                        owner,
                        credits=expected_credits,
                        idempotency_key=(
                            f"paddle-topup:{transaction_id}"
                        ),
                        payment_reference=reference_id,
                        metadata={
                            "provider": "paddle",
                            "transaction_id": transaction_id,
                            "price_id": expected_price_id,
                            "amount_minor": expected_amount,
                            "currency": expected_currency,
                        },
                    )

                    db.update_payment_checkout(
                        reference_id,
                        provider_customer_id=customer_id or None,
                        status="PAID",
                        completed_at=paid_at,
                    )

                    db.audit(
                        "topup_credits_payment_paid",
                        owner=owner,
                        resource_type="payment_checkout",
                        resource_id=reference_id,
                        metadata={
                            "provider": "paddle",
                            "transaction_id": transaction_id,
                            "product": product,
                            "credits": expected_credits,
                            "amount_minor": expected_amount,
                            "currency": expected_currency,
                        },
                    )

                else:
                    # A completed transaction with the recurring Pro price must
                    # resolve to a Paddle subscription.
                    if not subscription_id.startswith("sub_"):
                        raise BillingError(
                            "Paddle Pro transaction did not create a subscription.",
                            status_code=400,
                        )

                    billing_period = (
                        data.get("billing_period")
                        if isinstance(data.get("billing_period"), dict)
                        else {}
                    )

                    period_start = (
                        _parse_dt(billing_period.get("starts_at"))
                        or paid_at
                    )

                    period_end = (
                        _parse_dt(billing_period.get("ends_at"))
                        or _add_month(period_start)
                    )

                    current_subscription = db.get_subscription(owner)
                    current_start = _aware(current_subscription.get("current_period_start"))
                    if current_start is not None and period_start < current_start:
                        stale_status = True
                    if not stale_status:
                        db.set_subscription(
                            owner,
                            plan="pro",
                            status="active",
                            provider="paddle",
                            provider_customer_id=customer_id,
                            provider_subscription_id=subscription_id,
                            current_period_start=period_start,
                            current_period_end=period_end,
                            cancel_at_period_end=(
                                bool(current_subscription.get("cancel_at_period_end", False))
                                if current_subscription.get("provider") == "paddle"
                                and current_subscription.get("provider_subscription_id") == subscription_id
                                else False
                            ),
                        )

                        status_applied = True

                    # Reset rather than accumulate monthly allowance.
                    # Top-up balance remains untouched.
                    db.reset_monthly_credits(
                        owner,
                        credits=self.settings.pro_monthly_slide_credits,
                        period_start=period_start,
                        period_end=period_end,
                        idempotency_key=(
                            f"paddle-monthly:{transaction_id}"
                        ),
                        metadata={
                            "provider": "paddle",
                            "transaction_id": transaction_id,
                            "subscription_id": subscription_id,
                            "price_id": expected_price_id,
                        },
                    )

                    db.update_payment_checkout(
                        reference_id,
                        provider_plan_id=subscription_id,
                        provider_customer_id=customer_id or None,
                        status="PAID",
                        completed_at=paid_at,
                    )

                    db.audit(
                        "subscription_cycle_paid",
                        owner=owner,
                        resource_type="subscription",
                        resource_id=subscription_id,
                        metadata={
                            "provider": "paddle",
                            "transaction_id": transaction_id,
                            "credits": (
                                self.settings.pro_monthly_slide_credits
                            ),
                            "amount_minor": expected_amount,
                            "currency": expected_currency,
                        },
                    )

            elif event_type in {
                "transaction.canceled",
                "transaction.past_due",
            }:
                db.update_payment_checkout(
                    reference_id,
                    status=(
                        "PAST_DUE"
                        if event_type == "transaction.past_due"
                        else "FAILED"
                    ),
                )

                if product == "pro" and not stale_status:
                    current = db.get_subscription(owner)

                    if str(current.get("plan") or "") == "pro":
                        db.set_subscription(
                            owner,
                            plan="pro",
                            status=(
                                "past_due"
                                if event_type == "transaction.past_due"
                                else str(
                                    current.get("status")
                                    or "active"
                                )
                            ),
                            provider="paddle",
                            provider_customer_id=current.get(
                                "provider_customer_id"
                            ),
                            provider_subscription_id=(
                                current.get("provider_subscription_id")
                                or subscription_id
                                or None
                            ),
                            current_period_start=current.get(
                                "current_period_start"
                            ),
                            current_period_end=current.get(
                                "current_period_end"
                            ),
                            cancel_at_period_end=bool(
                                current.get(
                                    "cancel_at_period_end",
                                    False,
                                )
                            ),
                        )
                        status_applied = True

            elif event_type in {
                "subscription.created",
                "subscription.updated",
                "subscription.canceled",
                "subscription.paused",
                "subscription.resumed",
                "subscription.activated",
                "subscription.past_due",
                "subscription.trialing",
            }:
                subscription_id = object_id or subscription_id

                status = str(
                    data.get("status") or "active"
                ).lower()

                current_period = (
                    data.get("current_billing_period")
                    if isinstance(
                        data.get("current_billing_period"),
                        dict,
                    )
                    else {}
                )

                period_start = _parse_dt(
                    current_period.get("starts_at")
                )

                period_end = _parse_dt(
                    current_period.get("ends_at")
                )

                current = db.get_subscription(owner)

                if period_start is None:
                    period_start = _aware(
                        current.get("current_period_start")
                    )

                if period_end is None:
                    period_end = _aware(
                        current.get("current_period_end")
                    )

                scheduled_change = (
                    data.get("scheduled_change")
                    if isinstance(
                        data.get("scheduled_change"),
                        dict,
                    )
                    else {}
                )

                scheduled_cancel = (
                    str(
                        scheduled_change.get("action") or ""
                    ).lower()
                    == "cancel"
                )

                canceled = status in {"canceled", "paused"}

                # Subscription notifications alone are not proof of paid checkout.
                # Initial entitlement is granted by transaction.completed only.
                prior_paid = (
                    current.get("provider") == "paddle"
                    and current.get("plan") == "pro"
                ) or str(checkout.get("status") or "") in {"PAID", "SUBSCRIPTION_ACTIVE"}
                # Paddle may deliver subscription.updated for a *future* billing
                # period before the corresponding transaction.completed. Do not
                # let entitlement reads mint a new credit cycle without payment.
                paid_period_start = _aware(current.get("current_period_start"))
                if (
                    prior_paid and not canceled and paid_period_start is not None
                    and period_start is not None and period_start > paid_period_start
                ):
                    period_start = paid_period_start
                    period_end = _aware(current.get("current_period_end"))

                should_update = not stale_status and (canceled or prior_paid)
                if should_update:
                    db.set_subscription(
                        owner,
                        plan="free" if canceled else "pro",
                        status=status,
                        provider="paddle",
                        provider_customer_id=(
                            str(data.get("customer_id") or "")
                            or current.get("provider_customer_id")
                        ),
                        provider_subscription_id=(
                            subscription_id
                            or current.get("provider_subscription_id")
                        ),
                        current_period_start=period_start,
                        current_period_end=period_end,
                        cancel_at_period_end=(
                            True
                            if canceled
                            else scheduled_cancel
                        ),
                    )

                    status_applied = True

                if subscription_id and not stale_status:
                    db.update_payment_checkout(
                        reference_id,
                        provider_plan_id=subscription_id,
                        provider_customer_id=(
                            str(data.get("customer_id") or "")
                            or None
                        ),
                        status=(
                            "CANCELED" if canceled
                            else "SUBSCRIPTION_ACTIVE" if prior_paid
                            else "SUBSCRIPTION_PENDING"
                        ),
                    )

            recorded = db.record_payment_event(
                event_key=event_key,
                provider="paddle",
                event_type=event_type or "unknown",
                reference_id=reference_id or None,
                provider_object_id=object_id or None,
                payload=payload,
                status_applied=status_applied,
            )

            return {
                "processed": recorded,
                "event": event_type,
            }
