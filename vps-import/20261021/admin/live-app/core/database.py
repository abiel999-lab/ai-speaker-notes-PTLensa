from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, delete, func, inspect, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.types import JSON

from app.core.subscription_view import billing_counts, subscription_view


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
    is_banned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
        # create_all() does not alter existing tables. Keep these two lightweight
        # columns backward-compatible for installations created before the admin panel.
        columns = {item["name"] for item in inspect(self.engine).get_columns("users")}
        statements: list[str] = []
        if "is_banned" not in columns:
            if self.engine.dialect.name == "postgresql":
                statements.append("ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT FALSE")
            else:
                statements.append("ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT 0")
        if "deleted_at" not in columns:
            statements.append("ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL")
        if statements:
            with self.engine.begin() as conn:
                for statement in statements:
                    conn.exec_driver_sql(statement)

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

    def get_user(self, subject: str) -> UserRow | None:
        with self.session() as session:
            row = session.get(UserRow, subject)
            if row is None:
                return None
            session.expunge(row)
            return row

    def list_users(self, *, include_deleted: bool = False, limit: int = 1000) -> list[dict[str, Any]]:
        has_subscriptions = inspect(self.engine).has_table("subscriptions")
        with self.session() as session:
            stmt = select(UserRow)
            if not include_deleted:
                stmt = stmt.where(UserRow.deleted_at.is_(None))
            stmt = stmt.order_by(UserRow.last_login_at.desc()).limit(max(1, min(limit, 5000)))
            rows = session.execute(stmt).scalars().all()

            subscription_by_owner: dict[str, dict[str, Any]] = {}
            if has_subscriptions:
                subscription_rows = session.execute(
                    text(
                        "SELECT owner, plan, status, provider, provider_subscription_id, "
                        "current_period_start, current_period_end, cancel_at_period_end "
                        "FROM subscriptions"
                    )
                ).mappings().all()
                subscription_by_owner = {
                    str(item["owner"]): dict(item)
                    for item in subscription_rows
                }

            result: list[dict[str, Any]] = []
            for row in rows:
                item = {
                    "subject": row.subject,
                    "username": row.username,
                    "email": row.email,
                    "display_name": row.display_name,
                    "created_at": row.created_at,
                    "last_login_at": row.last_login_at,
                    "is_banned": bool(row.is_banned),
                    "deleted_at": row.deleted_at,
                }
                item.update(subscription_view(subscription_by_owner.get(row.subject)))
                result.append(item)
            return result

    def update_user_metadata(
        self,
        subject: str,
        *,
        username: str | None = None,
        email: str | None = None,
        display_name: str | None = None,
    ) -> None:
        with self.session() as session:
            row = session.get(UserRow, subject)
            if row is None:
                return
            if username is not None:
                row.username = username
            row.email = email
            row.display_name = display_name
            session.commit()

    def set_user_banned(self, subject: str, banned: bool) -> None:
        with self.session() as session:
            row = session.get(UserRow, subject)
            if row is None:
                return
            row.is_banned = bool(banned)
            session.commit()

    def soft_delete_user(self, subject: str) -> None:
        with self.session() as session:
            row = session.get(UserRow, subject)
            if row is None:
                return
            row.is_banned = True
            row.deleted_at = datetime.now(UTC)
            session.commit()

    def is_user_blocked(self, subject: str) -> bool:
        with self.session() as session:
            row = session.get(UserRow, subject)
            return bool(row and (row.is_banned or row.deleted_at is not None))

    def purge_user_chat(self, subject: str) -> None:
        with self.session() as session:
            rows = session.execute(select(ChatThreadRow).where(ChatThreadRow.owner == subject)).scalars().all()
            for row in rows:
                session.delete(row)
            session.commit()

    def get_subscription_for_owner(self, owner: str) -> dict[str, Any]:
        if not inspect(self.engine).has_table("subscriptions"):
            return subscription_view(None)
        with self.engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT plan, status, provider, provider_subscription_id, "
                    "current_period_start, current_period_end, cancel_at_period_end "
                    "FROM subscriptions WHERE owner=:owner LIMIT 1"
                ),
                {"owner": owner},
            ).mappings().first()
        return subscription_view(dict(row) if row is not None else None)

    def user_job_counts(self) -> dict[str, int]:
        with self.session() as session:
            rows = session.execute(
                select(JobRow.owner, func.count(JobRow.id)).where(JobRow.owner.is_not(None)).group_by(JobRow.owner)
            ).all()
            return {str(owner): int(count) for owner, count in rows if owner is not None}

    def admin_counts(self) -> dict[str, int]:
        has_subscriptions = inspect(self.engine).has_table("subscriptions")
        with self.session() as session:
            users = int(session.scalar(select(func.count(UserRow.subject)).where(UserRow.deleted_at.is_(None))) or 0)
            banned = int(
                session.scalar(
                    select(func.count(UserRow.subject)).where(
                        UserRow.deleted_at.is_(None),
                        UserRow.is_banned.is_(True),
                    )
                )
                or 0
            )
            jobs = int(session.scalar(select(func.count(JobRow.id))) or 0)
            completed = int(session.scalar(select(func.count(JobRow.id)).where(JobRow.status == "completed")) or 0)
            failed = int(session.scalar(select(func.count(JobRow.id)).where(JobRow.status == "failed")) or 0)
            chat_threads = int(session.scalar(select(func.count(ChatThreadRow.id))) or 0)
            chat_messages = int(session.scalar(select(func.count(ChatMessageRow.id))) or 0)
            counts = {
                "users": users,
                "banned_users": banned,
                "jobs": jobs,
                "completed_jobs": completed,
                "failed_jobs": failed,
                "chat_threads": chat_threads,
                "chat_messages": chat_messages,
            }

            if has_subscriptions:
                subscription_rows = session.execute(
                    text(
                        "SELECT s.plan, s.status, s.provider, s.provider_subscription_id, "
                        "s.current_period_start, s.current_period_end, s.cancel_at_period_end "
                        "FROM subscriptions s JOIN users u ON u.subject=s.owner "
                        "WHERE u.deleted_at IS NULL"
                    )
                ).mappings().all()
                counts.update(
                    billing_counts(
                        [dict(item) for item in subscription_rows],
                        total_users=users,
                    )
                )
            else:
                counts.update(
                    {
                        "free_users": users,
                        "pro_users": 0,
                        "expiring_pro": 0,
                        "expired_subscriptions": 0,
                        "pending_payments": 0,
                        "past_due_subscriptions": 0,
                    }
                )
            return counts

    def list_chat_threads_for_owner(self, owner: str, *, limit: int = 200) -> list[dict[str, Any]]:
        """Return chat metadata only. Message content is intentionally excluded.

        Administrators must use the explicit, audited reveal endpoint before any
        conversation content is returned to the browser.
        """
        with self.session() as session:
            stmt = (
                select(ChatThreadRow)
                .where(ChatThreadRow.owner == owner)
                .order_by(ChatThreadRow.updated_at.desc())
                .limit(max(1, min(limit, 500)))
            )
            threads = session.execute(stmt).scalars().all()
            result: list[dict[str, Any]] = []
            for thread in threads:
                message_count = int(
                    session.scalar(
                        select(func.count(ChatMessageRow.id)).where(ChatMessageRow.thread_id == thread.id)
                    )
                    or 0
                )
                result.append(
                    {
                        "id": thread.id,
                        "owner": thread.owner,
                        "scope_key": thread.scope_key,
                        "mode": thread.mode,
                        "job_id": thread.job_id,
                        "created_at": thread.created_at,
                        "updated_at": thread.updated_at,
                        "message_count": message_count,
                    }
                )
            return result

    def get_chat_thread(self, thread_id: int, *, include_messages: bool = False) -> dict[str, Any] | None:
        with self.session() as session:
            thread = session.get(ChatThreadRow, int(thread_id))
            if thread is None:
                return None
            payload: dict[str, Any] = {
                "id": thread.id,
                "owner": thread.owner,
                "scope_key": thread.scope_key,
                "mode": thread.mode,
                "job_id": thread.job_id,
                "created_at": thread.created_at,
                "updated_at": thread.updated_at,
            }
            messages = session.execute(
                select(ChatMessageRow)
                .where(ChatMessageRow.thread_id == thread.id)
                .order_by(ChatMessageRow.ordinal.asc())
            ).scalars().all()
            payload["message_count"] = len(messages)
            if include_messages:
                payload["messages"] = [
                    {
                        "id": message.id,
                        "ordinal": message.ordinal,
                        "role": message.role,
                        "content": message.content,
                        "created_at": message.created_at,
                    }
                    for message in messages
                ]
            return payload

    def list_jobs_for_owner(self, owner: str, *, limit: int = 500) -> list[dict[str, Any]]:
        with self.session() as session:
            stmt = (
                select(JobRow)
                .where(JobRow.owner == owner)
                .order_by(JobRow.created_at.desc())
                .limit(max(1, min(limit, 2000)))
            )
            rows = session.execute(stmt).scalars().all()
            return [
                {
                    "id": row.id,
                    "status": row.status,
                    "created_at": row.created_at,
                    "updated_at": row.updated_at,
                    "payload": dict(row.payload or {}),
                }
                for row in rows
            ]

    def list_jobs(self, *, limit: int = 500) -> list[dict[str, Any]]:
        with self.session() as session:
            stmt = (
                select(JobRow)
                .order_by(JobRow.created_at.desc())
                .limit(max(1, min(limit, 2000)))
            )
            rows = session.execute(stmt).scalars().all()
            return [
                {
                    "id": row.id,
                    "owner": row.owner,
                    "status": row.status,
                    "created_at": row.created_at,
                    "updated_at": row.updated_at,
                    "payload": dict(row.payload or {}),
                }
                for row in rows
            ]

    def list_chat_threads(self, *, limit: int = 300) -> list[dict[str, Any]]:
        """Return global chat metadata without message content or previews."""
        with self.session() as session:
            stmt = (
                select(ChatThreadRow)
                .order_by(ChatThreadRow.updated_at.desc())
                .limit(max(1, min(limit, 1000)))
            )
            threads = session.execute(stmt).scalars().all()
            result: list[dict[str, Any]] = []
            for thread in threads:
                message_count = int(
                    session.scalar(
                        select(func.count(ChatMessageRow.id)).where(ChatMessageRow.thread_id == thread.id)
                    )
                    or 0
                )
                result.append(
                    {
                        "id": thread.id,
                        "owner": thread.owner,
                        "scope_key": thread.scope_key,
                        "mode": thread.mode,
                        "job_id": thread.job_id,
                        "created_at": thread.created_at,
                        "updated_at": thread.updated_at,
                        "message_count": message_count,
                    }
                )
            return result

    def list_audit_events(self, *, action: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        with self.session() as session:
            stmt = select(AuditEventRow)
            if action:
                stmt = stmt.where(AuditEventRow.action == action)
            stmt = stmt.order_by(AuditEventRow.created_at.desc()).limit(max(1, min(limit, 2000)))
            rows = session.execute(stmt).scalars().all()
            return [
                {
                    "id": row.id,
                    "owner": row.owner,
                    "action": row.action,
                    "resource_type": row.resource_type,
                    "resource_id": row.resource_id,
                    "metadata": dict(row.metadata_json or {}),
                    "created_at": row.created_at,
                }
                for row in rows
            ]


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
