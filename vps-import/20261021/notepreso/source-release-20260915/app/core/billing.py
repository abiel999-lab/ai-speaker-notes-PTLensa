from __future__ import annotations

import hashlib
import json
from calendar import monthrange
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import Settings
from app.core.database import DatabaseManager
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

    def checkout_mode_for(self, provider: str) -> str:
        if provider == "xendit":
            mode = str(self.settings.xendit_checkout_mode or "one_time").strip().lower()
            return "subscription" if mode == "subscription" else "one_time"
        if provider in {"stripe", "paddle"}:
            return "one_time"
        return "disabled"

    def checkout_price_for(self, provider: str) -> int:
        if provider == "xendit":
            return self.settings.xendit_pro_price_idr
        if provider == "stripe":
            return self.settings.stripe_pro_price_idr
        if provider == "paddle":
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
    ) -> dict[str, Any]:
        selected_provider = str(provider or self.provider or "").strip().lower()
        if selected_provider not in self.enabled_providers:
            raise BillingError("Selected payment provider is not available.", status_code=400)

        subscription = self.db.get_subscription(owner)
        now = datetime.now(UTC)
        period_end = _aware(subscription.get("current_period_end"))
        if (
            str(subscription.get("plan") or "free").lower() == "pro"
            and str(subscription.get("status") or "").lower() in {"active", "trialing", "past_due"}
            and (period_end is None or period_end > now)
        ):
            raise BillingError("This account already has an active Pro plan.", status_code=409)

        provider = selected_provider
        existing = self.db.get_reusable_payment_checkout(owner, provider=provider, now=now)
        if existing and existing.get("checkout_url"):
            return existing

        reference_id = self.db.new_payment_reference(prefix="np-pro")
        self.db.create_payment_checkout(
            reference_id=reference_id,
            owner=owner,
            provider=provider,
            amount=self.checkout_price_for(provider),
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
                "existing_customer_id": subscription.get("provider_customer_id")
                if subscription.get("provider") == provider
                else None,
            }
            if provider == "xendit":
                assert self.xendit is not None
                if self.checkout_mode_for(provider) == "subscription":
                    result = self.xendit.create_pro_subscription_session(**checkout_kwargs)
                else:
                    result = self.xendit.create_pro_one_time_session(**checkout_kwargs)
            elif provider == "stripe":
                assert self.stripe is not None
                result = self.stripe.create_pro_one_time_session(**checkout_kwargs)
            elif provider == "paddle":
                assert self.paddle is not None
                result = self.paddle.create_pro_one_time_session(**checkout_kwargs)
            else:
                raise BillingError("Payment checkout is not configured yet.", status_code=503)
        except Exception:
            self.db.update_payment_checkout(reference_id, status="FAILED")
            raise

        checkout = self.db.update_payment_checkout(
            reference_id,
            provider_session_id=str(result.get("payment_session_id") or "") or None,
            provider_plan_id=str(result.get("recurring_plan_id") or "") or None,
            provider_customer_id=str(result.get("customer_id") or "") or None,
            status=str(result.get("status") or "ACTIVE"),
            checkout_url=str(result.get("payment_link_url") or "") or None,
            expires_at=_parse_dt(result.get("expires_at")),
        )

        # Only Xendit subscription mode needs to link the provider customer before
        # payment. One-time providers become authoritative only after a paid event.
        customer_id = checkout.get("provider_customer_id")
        if customer_id and provider == "xendit" and self.checkout_mode_for(provider) == "subscription":
            current = self.db.get_subscription(owner)
            self.db.set_subscription(
                owner,
                plan=str(current.get("plan") or "free"),
                status=str(current.get("status") or "active"),
                provider="xendit",
                provider_customer_id=customer_id,
                provider_subscription_id=current.get("provider_subscription_id"),
                current_period_start=current.get("current_period_start"),
                current_period_end=current.get("current_period_end"),
                cancel_at_period_end=bool(current.get("cancel_at_period_end", False)),
            )

        self.db.audit(
            "billing_checkout_created",
            owner=owner,
            resource_type="payment_checkout",
            resource_id=reference_id,
            metadata={
                "provider": provider,
                "mode": self.checkout_mode_for(provider),
                "amount": self.checkout_price_for(provider),
                "currency": self.checkout_currency_for(provider),
            },
        )
        return checkout

    def cancel_subscription(self, owner: str) -> dict[str, Any]:
        if self.xendit is None or not self.settings.xendit_available:
            raise BillingError("There is no renewable subscription to cancel.", status_code=409)
        subscription = self.db.get_subscription(owner)
        if subscription.get("provider") != "xendit" or not subscription.get("provider_subscription_id"):
            raise BillingError("There is no Xendit subscription to cancel.", status_code=409)
        if subscription.get("cancel_at_period_end"):
            return subscription

        self.xendit.deactivate_subscription(str(subscription["provider_subscription_id"]))
        updated = self.db.set_subscription(
            owner,
            plan=str(subscription.get("plan") or "pro"),
            status=str(subscription.get("status") or "active"),
            provider="xendit",
            provider_customer_id=subscription.get("provider_customer_id"),
            provider_subscription_id=subscription.get("provider_subscription_id"),
            current_period_start=subscription.get("current_period_start"),
            current_period_end=subscription.get("current_period_end"),
            cancel_at_period_end=True,
        )
        self.db.audit(
            "subscription_cancellation_requested",
            owner=owner,
            resource_type="subscription",
            resource_id=str(subscription.get("provider_subscription_id")),
            metadata={"provider": "xendit"},
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

    def handle_paddle_webhook(self, payload: dict[str, Any]) -> dict[str, Any]:
        event_type = str(payload.get("event_type") or "")
        event_key = _paddle_event_key(payload)
        if self.db.payment_event_processed(event_key):
            return {"processed": False, "duplicate": True, "event": event_type}

        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        custom_data = data.get("custom_data") if isinstance(data.get("custom_data"), dict) else {}
        reference_id = str(custom_data.get("notepreso_reference") or "")
        transaction_id = str(data.get("id") or "")
        checkout = self.db.get_payment_checkout(reference_id) if reference_id else None

        if checkout is None or str(checkout.get("provider") or "").lower() != "paddle":
            self.db.record_payment_event(
                event_key=event_key,
                provider="paddle",
                event_type=event_type or "unknown",
                reference_id=reference_id or None,
                provider_object_id=transaction_id or None,
                payload=payload,
            )
            return {"processed": False, "ignored": True, "event": event_type}

        if checkout.get("provider_session_id") and transaction_id != checkout.get("provider_session_id"):
            raise BillingError("Paddle webhook transaction did not match the checkout record.", status_code=400)

        if event_type == "transaction.completed":
            if str(data.get("status") or "").lower() != "completed":
                raise BillingError("Paddle transaction was not completed.", status_code=400)
            if data.get("subscription_id"):
                raise BillingError("Paddle transaction unexpectedly created a subscription.", status_code=400)

            expected_currency = str(checkout.get("currency") or self.settings.paddle_pro_currency).upper()
            currency = str(data.get("currency_code") or "").upper()
            if currency and currency != expected_currency:
                raise BillingError("Paddle webhook currency did not match the checkout record.", status_code=400)

            expected_price_id = self.settings.paddle_pro_price_id.strip()
            items = data.get("items") if isinstance(data.get("items"), list) else []
            matches: list[tuple[dict[str, Any], dict[str, Any]]] = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                price = item.get("price") if isinstance(item.get("price"), dict) else {}
                if str(price.get("id") or "") == expected_price_id:
                    matches.append((item, price))
            if len(matches) != 1 or int(matches[0][0].get("quantity") or 0) != 1:
                raise BillingError("Paddle webhook price did not match the configured Pro product.", status_code=400)

            price = matches[0][1]
            unit_price = price.get("unit_price") if isinstance(price.get("unit_price"), dict) else {}
            raw_amount = unit_price.get("amount")
            if raw_amount is not None and int(raw_amount) != int(checkout["amount"]):
                raise BillingError("Paddle webhook price amount did not match the checkout record.", status_code=400)
            price_currency = str(unit_price.get("currency_code") or currency or "").upper()
            if price_currency and price_currency != expected_currency:
                raise BillingError("Paddle webhook price currency did not match the checkout record.", status_code=400)

            paid_at = PaddlePaymentClient.parse_event_time(payload)
            access_end = paid_at + timedelta(days=self.settings.paddle_pro_access_days)
            customer_id = str(data.get("customer_id") or "") or checkout.get("provider_customer_id")

            self.db.set_subscription(
                str(checkout["owner"]),
                plan="pro",
                status="active",
                provider="paddle",
                provider_customer_id=customer_id,
                provider_subscription_id=None,
                current_period_start=paid_at,
                current_period_end=access_end,
                cancel_at_period_end=False,
            )
            self.db.update_payment_checkout(
                reference_id,
                provider_session_id=transaction_id or None,
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
                    "provider": "paddle",
                    "transaction_id": transaction_id,
                    "price_id": expected_price_id,
                    "amount_minor": int(checkout["amount"]),
                    "currency": expected_currency,
                    "access_days": self.settings.paddle_pro_access_days,
                },
            )
        elif event_type in {"transaction.canceled", "transaction.past_due"}:
            self.db.update_payment_checkout(reference_id, status="FAILED")

        recorded = self.db.record_payment_event(
            event_key=event_key,
            provider="paddle",
            event_type=event_type or "unknown",
            reference_id=reference_id or None,
            provider_object_id=transaction_id or None,
            payload=payload,
        )
        return {"processed": recorded, "event": event_type}

