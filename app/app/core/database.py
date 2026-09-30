from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
import uuid

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, delete, select, text
from sqlalchemy.dialects.postgresql import JSONB
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

    def upsert_user(self, *, subject: str, username: str, email: str | None, display_name: str | None) -> None:
        now = datetime.now(UTC)
        with self.session() as session:
            row = session.get(UserRow, subject)
            if row is None:
                row = UserRow(
                    subject=subject,
                    username=username,
                    email=email,
                    display_name=display_name,
                    created_at=now,
                    last_login_at=now,
                )
                session.add(row)
            else:
                row.username = username
                row.email = email
                row.display_name = display_name
                row.last_login_at = now
            session.commit()

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
