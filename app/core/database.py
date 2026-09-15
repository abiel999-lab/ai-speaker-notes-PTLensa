from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, delete, select, text
from sqlalchemy.dialects.postgresql import JSONB
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
