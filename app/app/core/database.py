from __future__ import annotations

from datetime import UTC, datetime
import hashlib
from contextlib import contextmanager
from typing import Any
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, delete, select, text, func, update
from sqlalchemy.dialects.postgresql import JSONB, insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


JsonType = JSON().with_variant(JSONB, "postgresql")


class UserRow(Base):
    __tablename__ = "users"

    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class JobRow(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)


class ChatThreadRow(Base):
    __tablename__ = "chat_threads"
    __table_args__ = (UniqueConstraint("owner", "scope_key", "mode", name="uq_chat_thread_scope"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    scope_key: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    job_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ChatMessageRow(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)




class SubscriptionRow(Base):
    __tablename__ = "subscriptions"

    owner: Mapped[str] = mapped_column(String(255), primary_key=True)
    plan: Mapped[str] = mapped_column(String(32), nullable=False, default="free")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    provider_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ManualAccessGrantRow(Base):
    """Admin-granted entitlement independent of external recurring billing."""
    __tablename__ = "manual_access_grants"

    owner: Mapped[str] = mapped_column(String(255), primary_key=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    monthly_credits: Mapped[int] = mapped_column(Integer, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UsagePeriodRow(Base):
    __tablename__ = "usage_periods"

    owner: Mapped[str] = mapped_column(String(255), primary_key=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    presentation_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    vision_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chat_messages: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FreeWeeklyUsageRow(Base):
    __tablename__ = "free_weekly_usage"
    owner: Mapped[str] = mapped_column(String(255), primary_key=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    presentation_jobs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class FreePresentationReservationRow(Base):
    __tablename__ = "free_presentation_reservations"
    job_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CreditWalletRow(Base):
    __tablename__ = "credit_wallets"

    owner: Mapped[str] = mapped_column(String(255), primary_key=True)
    monthly_credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    topup_credits: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CreditLedgerRow(Base):
    __tablename__ = "credit_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner: Mapped[str] = mapped_column(String(255), index=True, nullable=False)

    # Positive values grant credits; negative values consume/reverse credits.
    monthly_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    topup_delta: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Snapshot after this transaction, useful for support/audit reconciliation.
    monthly_balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    topup_balance_after: Mapped[int] = mapped_column(Integer, nullable=False)

    event_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)

    # Every external/internal credit operation must have a stable unique key.
    # This prevents Paddle retries, job retries, or duplicate callbacks from
    # granting/deducting credits more than once.
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    job_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)

    # Monthly credits expire with their subscription billing period.
    # These fields let refunds distinguish an active allowance from an expired one.
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JsonType,
        nullable=False,
        default=dict,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
        nullable=False,
    )


class PaymentCheckoutRow(Base):
    __tablename__ = "payment_checkouts"

    reference_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    provider_session_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    provider_plan_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    provider_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False)
    status: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    checkout_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PaymentEventRow(Base):
    __tablename__ = "payment_events"

    event_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    provider_object_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuditEventRow(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)


class PaddleEventUnitOfWork:
    """Database writes for one Paddle event in one SQLAlchemy transaction.

    The caller holds the owner's subscription row lock. This object must never
    commit independently: failures roll back events, credits and subscription.
    """

    def __init__(self, db: "DatabaseManager", session: Session, owner: str):
        self.db = db
        self.session = session
        self.owner = owner

    def get_subscription(self, owner: str) -> dict[str, Any]:
        assert owner == self.owner
        row = self.session.get(SubscriptionRow, owner)
        assert row is not None
        return self.db._subscription_dict(row)

    def set_subscription(
        self, owner: str, *, plan: str, status: str = "active",
        provider: str | None = None, provider_customer_id: str | None = None,
        provider_subscription_id: str | None = None,
        current_period_start: datetime | None = None,
        current_period_end: datetime | None = None,
        cancel_at_period_end: bool = False,
    ) -> dict[str, Any]:
        assert owner == self.owner
        row = self.session.get(SubscriptionRow, owner)
        assert row is not None
        row.plan = plan
        row.status = status
        row.provider = provider
        row.provider_customer_id = provider_customer_id
        row.provider_subscription_id = provider_subscription_id
        row.current_period_start = current_period_start
        row.current_period_end = current_period_end
        row.cancel_at_period_end = cancel_at_period_end
        row.updated_at = datetime.now(UTC)
        self.session.flush()
        return self.db._subscription_dict(row)

    def update_payment_checkout(self, reference_id: str, **changes: Any) -> dict[str, Any]:
        row = self.session.get(PaymentCheckoutRow, reference_id)
        if row is None or row.owner != self.owner:
            raise KeyError("Paddle checkout not found for owner")
        allowed = {
            "provider_session_id", "provider_plan_id", "provider_customer_id",
            "status", "checkout_url", "expires_at", "completed_at",
        }
        if set(changes) - allowed:
            raise ValueError("Unexpected checkout update")
        for name, value in changes.items():
            if value is not None:
                setattr(row, name, value)
        row.updated_at = datetime.now(UTC)
        self.session.flush()
        return self.db._payment_checkout_dict(row)

    def audit(self, action: str, *, owner: str | None = None,
              resource_type: str | None = None, resource_id: str | None = None,
              metadata: dict[str, Any] | None = None) -> None:
        if owner is not None and owner != self.owner:
            raise ValueError("Invalid audit owner")
        self.session.add(AuditEventRow(
            owner=owner, action=action, resource_type=resource_type,
            resource_id=resource_id, metadata_json=metadata or {},
            created_at=datetime.now(UTC),
        ))

    def _wallet(self) -> CreditWalletRow:
        return self.db._ensure_credit_wallet_locked(
            self.session, owner=self.owner, now=datetime.now(UTC)
        )

    def _existing_credit(self, key: str) -> CreditLedgerRow | None:
        return self.session.execute(select(CreditLedgerRow).where(
            CreditLedgerRow.idempotency_key == key
        )).scalars().first()

    def grant_topup_credits(self, owner: str, *, credits: int,
                            idempotency_key: str,
                            payment_reference: str | None = None,
                            metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        if owner != self.owner or credits <= 0 or not idempotency_key.strip():
            raise ValueError("Invalid top-up grant")
        wallet = self._wallet()
        exists = self._existing_credit(idempotency_key)
        if exists:
            if exists.owner != owner:
                raise ValueError("Credit key belongs to another owner")
            return {"applied": False, "wallet": self.db._credit_wallet_dict(wallet)}
        wallet.topup_credits += int(credits)
        wallet.updated_at = datetime.now(UTC)
        self.session.add(CreditLedgerRow(
            owner=owner, monthly_delta=0, topup_delta=int(credits),
            monthly_balance_after=int(wallet.monthly_credits),
            topup_balance_after=int(wallet.topup_credits), event_type="topup_grant",
            idempotency_key=idempotency_key, job_id=None,
            payment_reference=payment_reference, period_start=None,
            period_end=None, metadata_json=metadata or {},
            created_at=datetime.now(UTC),
        ))
        self.session.flush()
        return {"applied": True, "wallet": self.db._credit_wallet_dict(wallet)}

    def reset_monthly_credits(self, owner: str, *, credits: int,
                              period_start: datetime, period_end: datetime,
                              idempotency_key: str,
                              metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        if (owner != self.owner or credits < 0 or period_end <= period_start
                or not idempotency_key.strip()):
            raise ValueError("Invalid monthly credit reset")
        wallet = self._wallet()
        exists = self._existing_credit(idempotency_key)
        if exists:
            if exists.owner != owner:
                raise ValueError("Credit key belongs to another owner")
            return {"applied": False, "wallet": self.db._credit_wallet_dict(wallet)}
        # Prevent a delayed transaction or duplicate cycle from replenishing
        # consumed credits or rolling back a more recent billing period.
        old_start = wallet.period_start
        if old_start is not None:
            old_start_utc = old_start.replace(tzinfo=UTC) if old_start.tzinfo is None else old_start.astimezone(UTC)
            new_start_utc = period_start.replace(tzinfo=UTC) if period_start.tzinfo is None else period_start.astimezone(UTC)
            if new_start_utc <= old_start_utc:
                return {"applied": False, "stale_period": True,
                        "wallet": self.db._credit_wallet_dict(wallet)}
        old_amount = int(wallet.monthly_credits)
        wallet.monthly_credits = int(credits)
        wallet.period_start = period_start
        wallet.period_end = period_end
        wallet.updated_at = datetime.now(UTC)
        self.session.add(CreditLedgerRow(
            owner=owner, monthly_delta=int(credits)-old_amount, topup_delta=0,
            monthly_balance_after=int(wallet.monthly_credits),
            topup_balance_after=int(wallet.topup_credits), event_type="monthly_reset",
            idempotency_key=idempotency_key, job_id=None,
            payment_reference=None, period_start=period_start,
            period_end=period_end, metadata_json=metadata or {},
            created_at=datetime.now(UTC),
        ))
        self.session.flush()
        return {"applied": True, "wallet": self.db._credit_wallet_dict(wallet)}

    def is_stale_subscription_event(self, reference_id: str,
                                    payload: dict[str, Any], *,
                                    terminal_only: bool = False) -> bool:
        """Compare *applied* subscription status events by Paddle occurred_at.

        Events without reliable timestamps are not ordered; use only signed
        provider payloads and do not pretend ingestion time is event time.
        """
        current = payload.get("occurred_at")
        if not isinstance(current, str):
            return False
        try:
            incoming = datetime.fromisoformat(current.replace("Z", "+00:00"))
            if incoming.tzinfo is None:
                return False
        except ValueError:
            return False
        events = self.session.execute(select(PaymentEventRow.payload).where(
            PaymentEventRow.provider == "paddle",
            PaymentEventRow.reference_id == reference_id,
        )).scalars()
        for prior in events:
            if not isinstance(prior, dict) or not prior.get("_notepreso_status_applied"):
                continue
            if terminal_only:
                data = prior.get("data") or {}
                previous_status = str(data.get("status") or "").lower() if isinstance(data, dict) else ""
                if previous_status not in {"canceled", "paused", "past_due"}:
                    continue
            previous = prior.get("occurred_at")
            if not isinstance(previous, str):
                continue
            try:
                old = datetime.fromisoformat(previous.replace("Z", "+00:00"))
                if old.tzinfo is not None and old >= incoming:
                    return True
            except ValueError:
                continue
        return False

    def has_payment_event(self, event_key: str) -> bool:
        return self.session.get(PaymentEventRow, event_key) is not None

    def record_payment_event(self, *, event_key: str, provider: str,
                             event_type: str, reference_id: str | None,
                             provider_object_id: str | None,
                             payload: dict[str, Any],
                             status_applied: bool = False) -> bool:
        if self.session.get(PaymentEventRow, event_key) is not None:
            return False
        stored_payload = dict(payload)
        stored_payload["_notepreso_status_applied"] = bool(status_applied)
        self.session.add(PaymentEventRow(
            event_key=event_key, provider=provider, event_type=event_type,
            reference_id=reference_id, provider_object_id=provider_object_id,
            payload=stored_payload, processed_at=datetime.now(UTC),
        ))
        self.session.flush()
        return True


class DatabaseManager:
    def __init__(self, url: str) -> None:
        self.url = url
        self.engine = create_engine(url, pool_pre_ping=True, pool_recycle=1800)

    def init_schema(self) -> None:
        Base.metadata.create_all(self.engine)

    def healthcheck(self) -> bool:
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

    def session(self) -> Session:
        return Session(self.engine)

    @contextmanager
    def paddle_event_transaction(self, owner: str):
        """Serialize Paddle events for a single owner and commit once.

        PostgreSQL SELECT FOR UPDATE on the subscription row keeps duplicate
        callbacks and credit-spending operations serialized by account.
        Rollback occurs automatically if any operation raises.
        """
        with self.session() as session:
            self._lock_credit_owner(session, owner)
            unit = PaddleEventUnitOfWork(self, session, owner)
            yield unit
            session.commit()

    def upsert_user(
        self, *, subject: str, username: str, email: str | None,
        display_name: str | None, welcome_credits: int = 0,
        welcome_rollout_at: datetime | None = None,
    ) -> bool:
        """On Keycloak login, grant the one-time welcome allowance safely.

        The Admin/Keycloak sync may create UserRow before auth/callback. For
        accounts created after the first v1.8.7 release, recover a missed
        grant on a subsequent valid Keycloak callback. Earlier accounts are
        never backfilled. Grant ledger + wallet commit in one transaction.
        """
        if not 0 <= welcome_credits <= 1000:
            raise ValueError("Invalid welcome credit count")
        if not subject.strip():
            raise ValueError("Keycloak subject is required")
        now = datetime.now(UTC)
        normalized_email = str(email or "").strip().lower()
        values = dict(
            subject=subject, username=username, email=email,
            display_name=display_name, created_at=now, last_login_at=now,
        )
        with self.session() as session:
            if self.engine.dialect.name == "postgresql":
                # Psycopg's rowcount for INSERT ... ON CONFLICT is not a
                # portable indication of whether a new user row was inserted.
                # RETURNING yields a subject only on the successful insert.
                stmt = pg_insert(UserRow).values(**values).on_conflict_do_nothing(
                    index_elements=[UserRow.subject]
                ).returning(UserRow.subject)
                is_new = session.execute(stmt).scalar_one_or_none() == subject
            elif self.engine.dialect.name == "sqlite":
                stmt = sqlite_insert(UserRow).values(**values).on_conflict_do_nothing(
                    index_elements=[UserRow.subject]
                )
                is_new = session.execute(stmt).rowcount == 1
            else:
                is_new = session.get(UserRow, subject) is None
                if is_new:
                    session.add(UserRow(**values))
                    session.flush()

            row = session.get(UserRow, subject)
            if not is_new:
                row.username = username
                row.email = email
                row.display_name = display_name
                row.last_login_at = now

            # A preexisting row is eligible only if its creation occurred on
            # or after v1.8.7. Never give the new benefit to legacy accounts.
            eligible = is_new
            if not eligible and welcome_rollout_at is not None:
                created_at = row.created_at
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=UTC)
                rollout_at = welcome_rollout_at
                if rollout_at.tzinfo is None:
                    rollout_at = rollout_at.replace(tzinfo=UTC)
                eligible = created_at >= rollout_at

            if eligible and welcome_credits and normalized_email:
                self._lock_credit_owner(session, subject)
                subscription = session.get(SubscriptionRow, subject)

                # Do not grant retrospectively to paying or previously-used
                # accounts. Also prevent new subject IDs for the same known
                # email from earning a second bonus.
                plan_ok = (
                    subscription is not None
                    and subscription.plan == "free"
                    and subscription.provider is None
                )
                existing_ledger = session.execute(
                    select(CreditLedgerRow.id)
                    .where(CreditLedgerRow.owner == subject).limit(1)
                ).first() is not None
                existing_jobs = session.execute(
                    select(JobRow.id).where(JobRow.owner == subject).limit(1)
                ).first() is not None
                used_preview = session.execute(
                    select(AuditEventRow.id).where(
                        AuditEventRow.owner == subject,
                        AuditEventRow.action == "free_preview_claimed",
                    ).limit(1)
                ).first() is not None
                existing_email_grant = session.execute(
                    select(CreditLedgerRow.id)
                    .join(UserRow, CreditLedgerRow.owner == UserRow.subject)
                    .where(
                        CreditLedgerRow.event_type == "welcome_grant",
                        func.lower(UserRow.email) == normalized_email,
                    ).limit(1)
                ).first() is not None

                if plan_ok and not any((
                    existing_ledger, existing_jobs, used_preview,
                    existing_email_grant,
                )):
                    wallet = self._ensure_credit_wallet_locked(
                        session, owner=subject, now=now,
                    )
                    # Existing wallets may have been created by an unrelated
                    # read; no credits must be present for recovery.
                    if wallet.monthly_credits == 0 and wallet.topup_credits == 0:
                        email_hash = hashlib.sha256(
                            normalized_email.encode("utf-8")
                        ).hexdigest()
                        key = "signup-welcome-email:" + email_hash
                        values = dict(
                            owner=subject, monthly_delta=0,
                            topup_delta=welcome_credits,
                            monthly_balance_after=wallet.monthly_credits,
                            topup_balance_after=wallet.topup_credits + welcome_credits,
                            event_type="welcome_grant", idempotency_key=key,
                            job_id=None, payment_reference=None,
                            period_start=None, period_end=None,
                            metadata_json={
                                "source": "keycloak_first_signin_or_recovery",
                                "credits": welcome_credits,
                            }, created_at=now,
                        )
                        if self.engine.dialect.name == "postgresql":
                            inserted = session.execute(
                                pg_insert(CreditLedgerRow).values(**values)
                                .on_conflict_do_nothing(
                                    index_elements=[CreditLedgerRow.idempotency_key]
                                )
                            ).rowcount == 1
                        elif self.engine.dialect.name == "sqlite":
                            inserted = session.execute(
                                sqlite_insert(CreditLedgerRow).values(**values)
                                .on_conflict_do_nothing(
                                    index_elements=[CreditLedgerRow.idempotency_key]
                                )
                            ).rowcount == 1
                        else:
                            session.add(CreditLedgerRow(**values))
                            session.flush()
                            inserted = True
                        if inserted:
                            # Always persist the spendable balance in SQL; ledger and
                            # wallet are updated in the SAME database transaction.
                            changed = session.execute(
                                update(CreditWalletRow)
                                .where(
                                    CreditWalletRow.owner == subject,
                                    CreditWalletRow.monthly_credits == 0,
                                    CreditWalletRow.topup_credits == 0,
                                )
                                .values(topup_credits=welcome_credits, updated_at=now)
                            )
                            if changed.rowcount != 1:
                                raise RuntimeError("Welcome ledger and wallet update must be atomic")
                            session.flush()

            # Heal a previously committed welcome grant whose wallet failed to
            # reflect the +20 credit. Never insert a second grant, and never
            # restore an allowance that has been spent or otherwise modified.
            if eligible and welcome_credits and normalized_email:
                self._reconcile_missing_welcome_wallet(
                    session, subject=subject, email=normalized_email,
                    expected_credits=welcome_credits, now=now,
                )
            session.commit()
            return is_new

    def _reconcile_missing_welcome_wallet(
        self, session: Session, *, subject: str, email: str,
        expected_credits: int, now: datetime,
    ) -> bool:
        """Repair an unused orphaned grant under the per-owner transaction lock.

        Only the exact single +N signup grant can be reconciled. A consumed
        allowance, a different payer/plan, an existing job or any other ledger
        event prevents credit restoration. No second grant is ever written.
        """
        self._lock_credit_owner(session, subject)
        sub = session.get(SubscriptionRow, subject)
        if sub is None or sub.plan != "free" or sub.provider is not None or sub.status != "active":
            return False
        wallet = session.get(CreditWalletRow, subject)
        if wallet is None or int(wallet.monthly_credits) != 0 or int(wallet.topup_credits) != 0:
            return False
        grants = session.execute(
            select(CreditLedgerRow).where(
                CreditLedgerRow.owner == subject,
                CreditLedgerRow.event_type == "welcome_grant",
            )
        ).scalars().all()
        if len(grants) != 1:
            return False
        grant = grants[0]
        if (
            int(grant.topup_delta) != expected_credits
            or int(grant.monthly_delta) != 0
            or int(grant.topup_balance_after) != expected_credits
            or int(grant.monthly_balance_after) != 0
            or grant.payment_reference is not None
        ):
            return False
        user = session.get(UserRow, subject)
        if user is None or str(user.email or "").strip().lower() != email:
            return False
        if session.execute(
            select(CreditLedgerRow.id).where(
                CreditLedgerRow.owner == subject,
                CreditLedgerRow.id != grant.id,
            ).limit(1)
        ).first() is not None:
            return False
        if session.execute(
            select(JobRow.id).where(JobRow.owner == subject).limit(1)
        ).first() is not None:
            return False
        if session.execute(
            select(AuditEventRow.id).where(
                AuditEventRow.owner == subject,
                AuditEventRow.action == "free_preview_claimed",
            ).limit(1)
        ).first() is not None:
            return False
        changed = session.execute(
            update(CreditWalletRow)
            .where(
                CreditWalletRow.owner == subject,
                CreditWalletRow.monthly_credits == 0,
                CreditWalletRow.topup_credits == 0,
            )
            .values(topup_credits=expected_credits, updated_at=now)
        )
        if changed.rowcount != 1:
            return False
        session.add(AuditEventRow(
            owner=subject,
            action="welcome_wallet_reconciliation",
            resource_type="credit_wallet",
            resource_id=subject,
            metadata_json={"reason": "orphaned_welcome_grant", "credits": expected_credits},
            created_at=now,
        ))
        session.flush()
        return True

    def has_welcome_grant(self, owner: str) -> bool:
        with self.session() as session:
            return session.execute(
                select(CreditLedgerRow.id)
                .where(CreditLedgerRow.owner == owner,
                       CreditLedgerRow.event_type == "welcome_grant")
                .limit(1)
            ).first() is not None

    def audit(
        self,
        action: str,
        *,
        owner: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self.session() as session:
            session.add(
                AuditEventRow(
                    owner=owner,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    metadata_json=metadata or {},
                    created_at=datetime.now(UTC),
                )
            )
            session.commit()

    def has_audit_event(self, owner: str, action: str) -> bool:
        with self.session() as session:
            stmt = select(AuditEventRow.id).where(
                AuditEventRow.owner == owner,
                AuditEventRow.action == action,
            ).limit(1)
            return session.execute(stmt).first() is not None

    def claim_audit_once(
        self,
        owner: str,
        action: str,
        *,
        resource_type: str | None = None,
        resource_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        """Atomically claim a one-time entitlement for an owner.

        The subscription row is used as a stable per-user lock in PostgreSQL. This
        avoids granting two free previews when a user submits two requests at once,
        without introducing a production schema migration.
        """
        now = datetime.now(UTC)
        with self.session() as session:
            sub_stmt = select(SubscriptionRow).where(SubscriptionRow.owner == owner)
            if self.engine.dialect.name == "postgresql":
                sub_stmt = sub_stmt.with_for_update()
            subscription = session.execute(sub_stmt).scalars().first()
            if subscription is None:
                subscription = SubscriptionRow(
                    owner=owner,
                    plan="free",
                    status="active",
                    provider=None,
                    provider_customer_id=None,
                    provider_subscription_id=None,
                    current_period_start=None,
                    current_period_end=None,
                    cancel_at_period_end=False,
                    created_at=now,
                    updated_at=now,
                )
                session.add(subscription)
                session.flush()

            exists = session.execute(
                select(AuditEventRow.id).where(
                    AuditEventRow.owner == owner,
                    AuditEventRow.action == action,
                ).limit(1)
            ).first()
            if exists is not None:
                session.rollback()
                return False

            session.add(
                AuditEventRow(
                    owner=owner,
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    metadata_json=metadata or {},
                    created_at=now,
                )
            )
            session.commit()
            return True


    @staticmethod
    def new_payment_reference(*, prefix: str = "np") -> str:
        return f"{prefix}-{uuid.uuid4().hex}"[:64]

    @staticmethod
    def _payment_checkout_dict(row: PaymentCheckoutRow) -> dict[str, Any]:
        return {
            "reference_id": row.reference_id,
            "owner": row.owner,
            "provider": row.provider,
            "provider_session_id": row.provider_session_id,
            "provider_plan_id": row.provider_plan_id,
            "provider_customer_id": row.provider_customer_id,
            "amount": int(row.amount),
            "currency": row.currency,
            "status": row.status,
            "checkout_url": row.checkout_url,
            "expires_at": row.expires_at,
            "completed_at": row.completed_at,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    def create_payment_checkout(
        self,
        *,
        reference_id: str,
        owner: str,
        provider: str,
        amount: int,
        currency: str,
        status: str,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        with self.session() as session:
            row = PaymentCheckoutRow(
                reference_id=reference_id,
                owner=owner,
                provider=provider,
                provider_session_id=None,
                provider_plan_id=None,
                provider_customer_id=None,
                amount=amount,
                currency=currency,
                status=status,
                checkout_url=None,
                expires_at=None,
                completed_at=None,
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return self._payment_checkout_dict(row)

    def update_payment_checkout(
        self,
        reference_id: str,
        *,
        provider_session_id: str | None = None,
        provider_plan_id: str | None = None,
        provider_customer_id: str | None = None,
        status: str | None = None,
        checkout_url: str | None = None,
        expires_at: datetime | None = None,
        completed_at: datetime | None = None,
    ) -> dict[str, Any]:
        with self.session() as session:
            row = session.get(PaymentCheckoutRow, reference_id)
            if row is None:
                raise KeyError(f"Payment checkout {reference_id} was not found.")
            if provider_session_id is not None:
                row.provider_session_id = provider_session_id
            if provider_plan_id is not None:
                row.provider_plan_id = provider_plan_id
            if provider_customer_id is not None:
                row.provider_customer_id = provider_customer_id
            if status is not None:
                row.status = status
            if checkout_url is not None:
                row.checkout_url = checkout_url
            if expires_at is not None:
                row.expires_at = expires_at
            if completed_at is not None:
                row.completed_at = completed_at
            row.updated_at = datetime.now(UTC)
            session.commit()
            session.refresh(row)
            return self._payment_checkout_dict(row)

    def get_payment_checkout(self, reference_id: str) -> dict[str, Any] | None:
        with self.session() as session:
            row = session.get(PaymentCheckoutRow, reference_id)
            return self._payment_checkout_dict(row) if row else None

    def get_payment_checkout_by_session(self, session_id: str) -> dict[str, Any] | None:
        # Paddle transaction IDs are recorded as provider_session_id. This
        # lookup is only used for same-account checkout authorization.
        if not session_id or not session_id.startswith("txn_"):
            return None
        with self.session() as session:
            row = session.execute(
                select(PaymentCheckoutRow)
                .where(PaymentCheckoutRow.provider_session_id == session_id)
                .order_by(PaymentCheckoutRow.created_at.desc())
                .limit(1)
            ).scalars().first()
            return self._payment_checkout_dict(row) if row else None

    def get_payment_checkout_by_plan(self, provider_plan_id: str) -> dict[str, Any] | None:
        with self.session() as session:
            row = session.execute(
                select(PaymentCheckoutRow)
                .where(PaymentCheckoutRow.provider_plan_id == provider_plan_id)
                .order_by(PaymentCheckoutRow.created_at.desc())
                .limit(1)
            ).scalars().first()
            return self._payment_checkout_dict(row) if row else None

    def get_reusable_payment_checkout(
        self,
        owner: str,
        *,
        provider: str,
        now: datetime | None = None,
    ) -> dict[str, Any] | None:
        current = (now or datetime.now(UTC)).astimezone(UTC)
        with self.session() as session:
            rows = session.execute(
                select(PaymentCheckoutRow)
                .where(
                    PaymentCheckoutRow.owner == owner,
                    PaymentCheckoutRow.provider == provider,
                    PaymentCheckoutRow.status.in_(["ACTIVE", "CREATING"]),
                )
                .order_by(PaymentCheckoutRow.created_at.desc())
                .limit(5)
            ).scalars().all()
            for row in rows:
                if row.status == "CREATING":
                    continue
                if row.expires_at is None or row.expires_at > current:
                    return self._payment_checkout_dict(row)
            return None

    def payment_event_processed(self, event_key: str) -> bool:
        with self.session() as session:
            return session.get(PaymentEventRow, event_key) is not None

    def record_payment_event(
        self,
        *,
        event_key: str,
        provider: str,
        event_type: str,
        reference_id: str | None,
        provider_object_id: str | None,
        payload: dict[str, Any],
    ) -> bool:
        with self.session() as session:
            if session.get(PaymentEventRow, event_key) is not None:
                return False
            session.add(
                PaymentEventRow(
                    event_key=event_key,
                    provider=provider,
                    event_type=event_type,
                    reference_id=reference_id,
                    provider_object_id=provider_object_id,
                    payload=payload,
                    processed_at=datetime.now(UTC),
                )
            )
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                return False
            return True

    @staticmethod
    def _credit_wallet_dict(row: CreditWalletRow) -> dict[str, Any]:
        return {
            "owner": row.owner,
            "monthly_credits": int(row.monthly_credits),
            "topup_credits": int(row.topup_credits),
            "total_credits": int(row.monthly_credits) + int(row.topup_credits),
            "period_start": row.period_start,
            "period_end": row.period_end,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    def _lock_credit_owner(self, session: Session, owner: str) -> None:
        """Serialize credit operations for one account.

        Subscriptions already provide one stable row per authenticated owner, so
        locking it prevents concurrent generation/payment callbacks from racing
        the credit wallet.
        """
        stmt = select(SubscriptionRow).where(SubscriptionRow.owner == owner)
        if self.engine.dialect.name == "postgresql":
            stmt = stmt.with_for_update()

        subscription = session.execute(stmt).scalars().first()
        if subscription is None:
            now = datetime.now(UTC)
            subscription = SubscriptionRow(
                owner=owner,
                plan="free",
                status="active",
                provider=None,
                provider_customer_id=None,
                provider_subscription_id=None,
                current_period_start=None,
                current_period_end=None,
                cancel_at_period_end=False,
                created_at=now,
                updated_at=now,
            )
            session.add(subscription)
            session.flush()

    def _ensure_credit_wallet_locked(
        self,
        session: Session,
        *,
        owner: str,
        now: datetime,
    ) -> CreditWalletRow:
        wallet = session.get(CreditWalletRow, owner)
        if wallet is None:
            wallet = CreditWalletRow(
                owner=owner,
                monthly_credits=0,
                topup_credits=0,
                period_start=None,
                period_end=None,
                created_at=now,
                updated_at=now,
            )
            session.add(wallet)
            session.flush()
        return wallet

    def ensure_credit_wallet(self, owner: str) -> dict[str, Any]:
        now = datetime.now(UTC)
        with self.session() as session:
            self._lock_credit_owner(session, owner)
            wallet = self._ensure_credit_wallet_locked(
                session,
                owner=owner,
                now=now,
            )
            session.commit()
            return self._credit_wallet_dict(wallet)

    def get_credit_wallet(self, owner: str) -> dict[str, Any]:
        with self.session() as session:
            wallet = session.get(CreditWalletRow, owner)
            if wallet is not None:
                return self._credit_wallet_dict(wallet)

        return self.ensure_credit_wallet(owner)

    def reset_monthly_credits(
        self,
        owner: str,
        *,
        credits: int,
        period_start: datetime,
        period_end: datetime,
        idempotency_key: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Set the subscription-cycle allowance to an exact credit amount.

        Renewal resets monthly credits rather than accumulating unused monthly
        allowance. Top-up credits are intentionally preserved.
        """
        if credits < 0:
            raise ValueError("Monthly credits cannot be negative.")
        if period_end <= period_start:
            raise ValueError("Credit period end must be after period start.")
        if not idempotency_key.strip():
            raise ValueError("Credit idempotency key is required.")

        now = datetime.now(UTC)

        with self.session() as session:
            self._lock_credit_owner(session, owner)

            existing = session.execute(
                select(CreditLedgerRow).where(
                    CreditLedgerRow.idempotency_key == idempotency_key
                )
            ).scalars().first()

            wallet = self._ensure_credit_wallet_locked(
                session,
                owner=owner,
                now=now,
            )

            if existing is not None:
                if existing.owner != owner:
                    raise ValueError("Credit idempotency key belongs to another owner.")
                return {
                    "applied": False,
                    "wallet": self._credit_wallet_dict(wallet),
                }

            old_monthly = int(wallet.monthly_credits)
            monthly_delta = int(credits) - old_monthly

            wallet.monthly_credits = int(credits)
            wallet.period_start = period_start
            wallet.period_end = period_end
            wallet.updated_at = now

            session.add(
                CreditLedgerRow(
                    owner=owner,
                    monthly_delta=monthly_delta,
                    topup_delta=0,
                    monthly_balance_after=int(wallet.monthly_credits),
                    topup_balance_after=int(wallet.topup_credits),
                    event_type="monthly_reset",
                    idempotency_key=idempotency_key,
                    job_id=None,
                    payment_reference=None,
                    period_start=period_start,
                    period_end=period_end,
                    metadata_json=metadata or {},
                    created_at=now,
                )
            )

            session.commit()
            return {
                "applied": True,
                "wallet": self._credit_wallet_dict(wallet),
            }

    def grant_manual_cycle_credits(
        self,
        owner: str,
        *,
        credits: int,
        period_start: datetime,
        period_end: datetime,
        idempotency_key: str,
    ) -> dict[str, Any]:
        """Add (do not reset) manual allowance once per actual cycle.

        A Free/Pro toggle does not change an existing manual cycle start.
        Legacy monthly_reset events are honored so existing accounts cannot
        accidentally receive a duplicate allowance during this hotfix.
        """
        if credits < 0 or period_end <= period_start or not idempotency_key:
            raise ValueError("Invalid manual credit cycle")
        now = datetime.now(UTC)
        with self.session() as session:
            self._lock_credit_owner(session, owner)
            wallet = self._ensure_credit_wallet_locked(session, owner=owner, now=now)
            exists = session.execute(select(CreditLedgerRow).where(
                CreditLedgerRow.idempotency_key == idempotency_key
            )).scalars().first()
            if exists is not None:
                if exists.owner != owner:
                    raise ValueError("Manual credit idempotency key belongs to another owner")
                session.commit()
                return {"applied": False, "wallet": self._credit_wallet_dict(wallet)}
            legacy = session.execute(select(CreditLedgerRow).where(
                CreditLedgerRow.owner == owner,
                CreditLedgerRow.event_type == "monthly_reset",
                CreditLedgerRow.period_start == period_start,
            )).scalars().first()
            if legacy is not None:
                session.commit()
                return {"applied": False, "legacy_cycle": True,
                        "wallet": self._credit_wallet_dict(wallet)}
            wallet.monthly_credits = int(wallet.monthly_credits) + int(credits)
            wallet.period_start = period_start
            wallet.period_end = period_end
            wallet.updated_at = now
            session.add(CreditLedgerRow(
                owner=owner, monthly_delta=int(credits), topup_delta=0,
                monthly_balance_after=int(wallet.monthly_credits),
                topup_balance_after=int(wallet.topup_credits),
                event_type="manual_cycle_grant", idempotency_key=idempotency_key,
                job_id=None, payment_reference=None,
                period_start=period_start, period_end=period_end,
                metadata_json={"source": "admin_manual_pro", "carry_forward": True},
                created_at=now,
            ))
            session.commit()
            return {"applied": True, "wallet": self._credit_wallet_dict(wallet)}

    def grant_topup_credits(
        self,
        owner: str,
        *,
        credits: int,
        idempotency_key: str,
        payment_reference: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if credits <= 0:
            raise ValueError("Top-up credits must be positive.")
        if not idempotency_key.strip():
            raise ValueError("Credit idempotency key is required.")

        now = datetime.now(UTC)

        with self.session() as session:
            self._lock_credit_owner(session, owner)

            existing = session.execute(
                select(CreditLedgerRow).where(
                    CreditLedgerRow.idempotency_key == idempotency_key
                )
            ).scalars().first()

            wallet = self._ensure_credit_wallet_locked(
                session,
                owner=owner,
                now=now,
            )

            if existing is not None:
                if existing.owner != owner:
                    raise ValueError("Credit idempotency key belongs to another owner.")
                return {
                    "applied": False,
                    "wallet": self._credit_wallet_dict(wallet),
                }

            wallet.topup_credits = int(wallet.topup_credits) + int(credits)
            wallet.updated_at = now

            session.add(
                CreditLedgerRow(
                    owner=owner,
                    monthly_delta=0,
                    topup_delta=int(credits),
                    monthly_balance_after=int(wallet.monthly_credits),
                    topup_balance_after=int(wallet.topup_credits),
                    event_type="topup_grant",
                    idempotency_key=idempotency_key,
                    job_id=None,
                    payment_reference=payment_reference,
                    period_start=None,
                    period_end=None,
                    metadata_json=metadata or {},
                    created_at=now,
                )
            )

            session.commit()
            return {
                "applied": True,
                "wallet": self._credit_wallet_dict(wallet),
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
        """Atomically reserve credits for generation.

        Monthly subscription credits are always consumed before purchased
        top-up credits.
        """
        if credits <= 0:
            raise ValueError("Reserved credits must be positive.")
        if not job_id.strip():
            raise ValueError("Job ID is required for credit reservation.")
        if not idempotency_key.strip():
            raise ValueError("Credit idempotency key is required.")

        now = datetime.now(UTC)

        with self.session() as session:
            self._lock_credit_owner(session, owner)

            existing = session.execute(
                select(CreditLedgerRow).where(
                    CreditLedgerRow.idempotency_key == idempotency_key
                )
            ).scalars().first()

            wallet = self._ensure_credit_wallet_locked(
                session,
                owner=owner,
                now=now,
            )

            if existing is not None:
                if existing.owner != owner:
                    raise ValueError("Credit idempotency key belongs to another owner.")
                return {
                    "allowed": True,
                    "applied": False,
                    "monthly_used": max(0, -int(existing.monthly_delta)),
                    "topup_used": max(0, -int(existing.topup_delta)),
                    "wallet": self._credit_wallet_dict(wallet),
                }

            monthly_available = int(wallet.monthly_credits)
            topup_available = int(wallet.topup_credits)
            total_available = monthly_available + topup_available

            if total_available < credits:
                return {
                    "allowed": False,
                    "applied": False,
                    "required": int(credits),
                    "available": total_available,
                    "shortfall": int(credits) - total_available,
                    "monthly_used": 0,
                    "topup_used": 0,
                    "wallet": self._credit_wallet_dict(wallet),
                }

            monthly_used = min(monthly_available, int(credits))
            topup_used = int(credits) - monthly_used

            wallet.monthly_credits = monthly_available - monthly_used
            wallet.topup_credits = topup_available - topup_used
            wallet.updated_at = now

            session.add(
                CreditLedgerRow(
                    owner=owner,
                    monthly_delta=-monthly_used,
                    topup_delta=-topup_used,
                    monthly_balance_after=int(wallet.monthly_credits),
                    topup_balance_after=int(wallet.topup_credits),
                    event_type="slide_reservation",
                    idempotency_key=idempotency_key,
                    job_id=job_id,
                    payment_reference=None,
                    period_start=wallet.period_start,
                    period_end=wallet.period_end,
                    metadata_json=metadata or {},
                    created_at=now,
                )
            )

            session.commit()
            return {
                "allowed": True,
                "applied": True,
                "required": int(credits),
                "monthly_used": monthly_used,
                "topup_used": topup_used,
                "wallet": self._credit_wallet_dict(wallet),
            }

    def refund_slide_reservation(
        self,
        owner: str,
        *,
        reservation_key: str,
        idempotency_key: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Fully restore a previous slide-credit reservation.

        The caller must use a stable refund idempotency key, normally derived
        from the job ID, so retries cannot refund the same job twice.
        """
        if not reservation_key.strip() or not idempotency_key.strip():
            raise ValueError("Reservation and refund idempotency keys are required.")

        now = datetime.now(UTC)

        with self.session() as session:
            self._lock_credit_owner(session, owner)

            existing_refund = session.execute(
                select(CreditLedgerRow).where(
                    CreditLedgerRow.idempotency_key == idempotency_key
                )
            ).scalars().first()

            wallet = self._ensure_credit_wallet_locked(
                session,
                owner=owner,
                now=now,
            )

            if existing_refund is not None:
                if existing_refund.owner != owner:
                    raise ValueError("Credit idempotency key belongs to another owner.")
                return {
                    "applied": False,
                    "wallet": self._credit_wallet_dict(wallet),
                }

            reservation = session.execute(
                select(CreditLedgerRow).where(
                    CreditLedgerRow.idempotency_key == reservation_key,
                    CreditLedgerRow.owner == owner,
                )
            ).scalars().first()

            if reservation is None:
                raise KeyError("Credit reservation was not found.")
            if reservation.event_type != "slide_reservation":
                raise ValueError("Referenced ledger event is not a slide reservation.")

            reserved_monthly = max(0, -int(reservation.monthly_delta))
            topup_refund = max(0, -int(reservation.topup_delta))

            same_monthly_period = (
                reservation.period_start == wallet.period_start
                and reservation.period_end == wallet.period_end
            )

            # Purchased top-up credits never expire with the monthly cycle.
            # Monthly credits are restored only while the original billing
            # period is still active; otherwise that allowance has expired.
            monthly_refund = reserved_monthly if same_monthly_period else 0
            expired_monthly_refund = reserved_monthly - monthly_refund

            wallet.monthly_credits = int(wallet.monthly_credits) + monthly_refund
            wallet.topup_credits = int(wallet.topup_credits) + topup_refund
            wallet.updated_at = now

            refund_metadata = dict(metadata or {})
            refund_metadata["reservation_key"] = reservation_key
            refund_metadata["reservation_ledger_id"] = int(reservation.id)
            refund_metadata["expired_monthly_credits_not_restored"] = expired_monthly_refund

            session.add(
                CreditLedgerRow(
                    owner=owner,
                    monthly_delta=monthly_refund,
                    topup_delta=topup_refund,
                    monthly_balance_after=int(wallet.monthly_credits),
                    topup_balance_after=int(wallet.topup_credits),
                    event_type="slide_refund",
                    idempotency_key=idempotency_key,
                    job_id=reservation.job_id,
                    payment_reference=None,
                    period_start=reservation.period_start,
                    period_end=reservation.period_end,
                    metadata_json=refund_metadata,
                    created_at=now,
                )
            )

            session.commit()
            return {
                "applied": True,
                "monthly_refunded": monthly_refund,
                "monthly_expired_not_refunded": expired_monthly_refund,
                "topup_refunded": topup_refund,
                "wallet": self._credit_wallet_dict(wallet),
            }

    @staticmethod
    def usage_period_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
        now = (now or datetime.now(UTC)).astimezone(UTC)
        start = datetime(now.year, now.month, 1, tzinfo=UTC)
        if now.month == 12:
            end = datetime(now.year + 1, 1, 1, tzinfo=UTC)
        else:
            end = datetime(now.year, now.month + 1, 1, tzinfo=UTC)
        return start, end

    def ensure_subscription(self, owner: str) -> dict[str, Any]:
        now = datetime.now(UTC)
        with self.session() as session:
            row = session.get(SubscriptionRow, owner)
            if row is None:
                row = SubscriptionRow(
                    owner=owner,
                    plan="free",
                    status="active",
                    provider=None,
                    provider_customer_id=None,
                    provider_subscription_id=None,
                    current_period_start=None,
                    current_period_end=None,
                    cancel_at_period_end=False,
                    created_at=now,
                    updated_at=now,
                )
                session.add(row)
                session.commit()
                session.refresh(row)
            return self._subscription_dict(row)

    @staticmethod
    def _subscription_dict(row: SubscriptionRow) -> dict[str, Any]:
        return {
            "owner": row.owner,
            "plan": row.plan,
            "status": row.status,
            "provider": row.provider,
            "provider_customer_id": row.provider_customer_id,
            "provider_subscription_id": row.provider_subscription_id,
            "current_period_start": row.current_period_start,
            "current_period_end": row.current_period_end,
            "cancel_at_period_end": bool(row.cancel_at_period_end),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    def get_manual_access(self, owner: str) -> dict[str, Any] | None:
        """Read an independent manual grant; absence of a row means no grant."""
        with self.session() as session:
            row = session.get(ManualAccessGrantRow, owner)
            if row is None:
                return None
            return {
                "starts_at": row.starts_at,
                "ends_at": row.ends_at,
                "monthly_credits": int(row.monthly_credits),
                "revoked_at": row.revoked_at,
            }

    def get_subscription(self, owner: str) -> dict[str, Any]:
        with self.session() as session:
            row = session.get(SubscriptionRow, owner)
            if row is None:
                return self.ensure_subscription(owner)
            return self._subscription_dict(row)

    def set_subscription(
        self,
        owner: str,
        *,
        plan: str,
        status: str = "active",
        provider: str | None = None,
        provider_customer_id: str | None = None,
        provider_subscription_id: str | None = None,
        current_period_start: datetime | None = None,
        current_period_end: datetime | None = None,
        cancel_at_period_end: bool = False,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        with self.session() as session:
            row = session.get(SubscriptionRow, owner)
            if row is None:
                row = SubscriptionRow(
                    owner=owner,
                    plan=plan,
                    status=status,
                    provider=provider,
                    provider_customer_id=provider_customer_id,
                    provider_subscription_id=provider_subscription_id,
                    current_period_start=current_period_start,
                    current_period_end=current_period_end,
                    cancel_at_period_end=cancel_at_period_end,
                    created_at=now,
                    updated_at=now,
                )
                session.add(row)
            else:
                row.plan = plan
                row.status = status
                row.provider = provider
                row.provider_customer_id = provider_customer_id
                row.provider_subscription_id = provider_subscription_id
                row.current_period_start = current_period_start
                row.current_period_end = current_period_end
                row.cancel_at_period_end = cancel_at_period_end
                row.updated_at = now
            session.commit()
            session.refresh(row)
            return self._subscription_dict(row)

    @staticmethod
    def _usage_dict(row: UsagePeriodRow | None, *, start: datetime, end: datetime) -> dict[str, Any]:
        if row is None:
            return {
                "period_start": start,
                "period_end": end,
                "presentation_jobs": 0,
                "vision_jobs": 0,
                "chat_messages": 0,
            }
        return {
            "period_start": row.period_start,
            "period_end": row.period_end,
            "presentation_jobs": int(row.presentation_jobs),
            "vision_jobs": int(row.vision_jobs),
            "chat_messages": int(row.chat_messages),
        }

    def get_free_weekly_usage(self, owner: str, *, now: datetime | None = None) -> dict[str, Any]:
        from app.core.free_quota import week_bounds
        start, end = week_bounds(now)
        with self.session() as session:
            row = session.get(FreeWeeklyUsageRow, (owner, start))
            return {"period_start": start, "period_end": end,
                    "presentations": int(row.presentation_jobs) if row else 0}

    def reserve_free_presentation(self, owner: str, *, job_id: str, limit: int,
                                  now: datetime | None = None) -> bool:
        """Serialize on the weekly row; persist each accepted job only once.

        Conditional SQL UPDATE enforces the limit across processes. Reservation
        records survive job deletion/retention and prevent retry double charges.
        """
        from app.core.free_quota import week_bounds
        if not owner or not job_id or limit < 1:
            raise ValueError("Owner, job ID and a positive limit are required")
        current = now or datetime.now(UTC)
        start, end = week_bounds(current)
        with self.session() as session:
            prior = session.get(FreePresentationReservationRow, job_id)
            if prior is not None:
                if prior.owner != owner:
                    raise ValueError("Reservation belongs to another account")
                return True
            dialect = self.engine.dialect.name
            insert = pg_insert if dialect == "postgresql" else sqlite_insert
            if dialect not in {"postgresql", "sqlite"}:
                raise RuntimeError("Unsupported weekly quota database")
            session.execute(insert(FreeWeeklyUsageRow).values(
                owner=owner, period_start=start, period_end=end, presentation_jobs=0,
            ).on_conflict_do_nothing(index_elements=["owner", "period_start"]))
            where = (FreeWeeklyUsageRow.owner == owner,
                     FreeWeeklyUsageRow.period_start == start)
            # Lock via UPDATE on both PostgreSQL and SQLite. Recheck the job
            # after waiting: two retries may arrive with the same job ID.
            session.execute(update(FreeWeeklyUsageRow).where(*where).values(
                presentation_jobs=FreeWeeklyUsageRow.presentation_jobs))
            prior = session.get(FreePresentationReservationRow, job_id)
            if prior is not None:
                if prior.owner != owner:
                    raise ValueError("Reservation belongs to another account")
                session.commit()
                return True
            result = session.execute(update(FreeWeeklyUsageRow).where(
                *where, FreeWeeklyUsageRow.presentation_jobs < limit,
            ).values(presentation_jobs=FreeWeeklyUsageRow.presentation_jobs + 1))
            if result.rowcount != 1:
                session.commit()
                return False
            session.add(FreePresentationReservationRow(
                job_id=job_id, owner=owner, period_start=start, created_at=current))
            session.commit()
            return True

    def release_free_presentation(self, owner: str, *, job_id: str) -> None:
        """Undo queue setup failure in the original week, once only."""
        with self.session() as session:
            # DELETE RETURNING makes concurrent releases idempotent and obtains
            # the exact original period even if setup crosses a Monday boundary.
            period = session.execute(delete(FreePresentationReservationRow).where(
                FreePresentationReservationRow.job_id == job_id,
                FreePresentationReservationRow.owner == owner,
            ).returning(FreePresentationReservationRow.period_start)).scalar_one_or_none()
            if period is not None:
                session.execute(update(FreeWeeklyUsageRow).where(
                    FreeWeeklyUsageRow.owner == owner,
                    FreeWeeklyUsageRow.period_start == period,
                    FreeWeeklyUsageRow.presentation_jobs > 0,
                ).values(presentation_jobs=FreeWeeklyUsageRow.presentation_jobs - 1))
            session.commit()

    def get_monthly_usage(self, owner: str, *, now: datetime | None = None) -> dict[str, Any]:
        start, end = self.usage_period_bounds(now)
        with self.session() as session:
            row = session.get(UsagePeriodRow, (owner, start))
            return self._usage_dict(row, start=start, end=end)

    def reserve_monthly_usage(
        self,
        owner: str,
        *,
        counter: str,
        limit: int,
        increment: int = 1,
        vision_increment: int = 0,
        now: datetime | None = None,
    ) -> tuple[bool, dict[str, Any]]:
        if counter not in {"presentation_jobs", "chat_messages"}:
            raise ValueError("Unsupported usage counter.")
        if increment < 1 or vision_increment < 0:
            raise ValueError("Usage increments must be positive.")

        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        start, end = self.usage_period_bounds(current_time)

        for attempt in range(2):
            with self.session() as session:
                stmt = select(UsagePeriodRow).where(
                    UsagePeriodRow.owner == owner,
                    UsagePeriodRow.period_start == start,
                )
                if self.engine.dialect.name == "postgresql":
                    stmt = stmt.with_for_update()
                row = session.execute(stmt).scalars().first()
                if row is None:
                    row = UsagePeriodRow(
                        owner=owner,
                        period_start=start,
                        period_end=end,
                        presentation_jobs=0,
                        vision_jobs=0,
                        chat_messages=0,
                        created_at=current_time,
                        updated_at=current_time,
                    )
                    session.add(row)
                    try:
                        session.flush()
                    except IntegrityError:
                        session.rollback()
                        if attempt == 0:
                            continue
                        raise

                current = int(getattr(row, counter))
                if limit > 0 and current + increment > limit:
                    return False, self._usage_dict(row, start=start, end=end)

                setattr(row, counter, current + increment)
                if vision_increment:
                    row.vision_jobs = int(row.vision_jobs) + vision_increment
                row.updated_at = current_time
                session.commit()
                session.refresh(row)
                return True, self._usage_dict(row, start=start, end=end)

        raise RuntimeError("Unable to reserve usage quota.")

    def release_monthly_usage(
        self,
        owner: str,
        *,
        counter: str,
        decrement: int = 1,
        vision_decrement: int = 0,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        if counter not in {"presentation_jobs", "chat_messages"}:
            raise ValueError("Unsupported usage counter.")
        current_time = (now or datetime.now(UTC)).astimezone(UTC)
        start, end = self.usage_period_bounds(current_time)
        with self.session() as session:
            stmt = select(UsagePeriodRow).where(
                UsagePeriodRow.owner == owner,
                UsagePeriodRow.period_start == start,
            )
            if self.engine.dialect.name == "postgresql":
                stmt = stmt.with_for_update()
            row = session.execute(stmt).scalars().first()
            if row is None:
                return self._usage_dict(None, start=start, end=end)
            setattr(row, counter, max(0, int(getattr(row, counter)) - max(0, decrement)))
            if vision_decrement:
                row.vision_jobs = max(0, int(row.vision_jobs) - max(0, vision_decrement))
            row.updated_at = current_time
            session.commit()
            session.refresh(row)
            return self._usage_dict(row, start=start, end=end)


class DatabaseChatHistoryStore:
    """Persistent chat history keyed by user and chat scope.

    The application still keeps presentation parsing/checkpoint artifacts on the durable
    filesystem volume, while all chat turns are persisted in PostgreSQL.
    """

    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def _thread(self, session: Session, *, owner: str, scope_key: str, mode: str, job_id: str | None, create: bool):
        stmt = select(ChatThreadRow).where(
            ChatThreadRow.owner == owner,
            ChatThreadRow.scope_key == scope_key,
            ChatThreadRow.mode == mode,
        )
        row = session.execute(stmt).scalars().first()
        if row is None and create:
            now = datetime.now(UTC)
            row = ChatThreadRow(
                owner=owner,
                scope_key=scope_key,
                mode=mode,
                job_id=job_id,
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            session.flush()
        return row

    def load(self, *, owner: str, scope_key: str, mode: str, job_id: str | None = None) -> list[dict[str, Any]]:
        with self.db.session() as session:
            thread = self._thread(session, owner=owner, scope_key=scope_key, mode=mode, job_id=job_id, create=False)
            if thread is None:
                return []
            stmt = (
                select(ChatMessageRow)
                .where(ChatMessageRow.thread_id == thread.id)
                .order_by(ChatMessageRow.ordinal.asc())
            )
            return [dict(item.payload) for item in session.execute(stmt).scalars().all()]

    def save(
        self,
        history: list[dict[str, Any]],
        *,
        owner: str,
        scope_key: str,
        mode: str,
        job_id: str | None = None,
    ) -> None:
        with self.db.session() as session:
            thread = self._thread(session, owner=owner, scope_key=scope_key, mode=mode, job_id=job_id, create=True)
            assert thread is not None
            session.execute(delete(ChatMessageRow).where(ChatMessageRow.thread_id == thread.id))
            now = datetime.now(UTC)
            for index, item in enumerate(history):
                session.add(
                    ChatMessageRow(
                        thread_id=thread.id,
                        ordinal=index,
                        role=str(item.get("role", "unknown")),
                        content=str(item.get("content", "")),
                        payload=dict(item),
                        created_at=now,
                    )
                )
            thread.updated_at = now
            session.commit()

    def clear(self, *, owner: str, scope_key: str, mode: str) -> None:
        with self.db.session() as session:
            thread = self._thread(session, owner=owner, scope_key=scope_key, mode=mode, job_id=None, create=False)
            if thread is not None:
                session.execute(delete(ChatMessageRow).where(ChatMessageRow.thread_id == thread.id))
                session.delete(thread)
                session.commit()
