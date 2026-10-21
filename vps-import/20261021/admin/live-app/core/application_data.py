from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

from app.core.subscription_view import billing_counts, subscription_view


@dataclass(frozen=True)
class ApplicationUser:
    subject: str
    username: str
    email: str | None
    display_name: str | None
    created_at: datetime | None
    last_login_at: datetime | None
    is_banned: bool = False
    deleted_at: datetime | None = None


class ApplicationDataReader:
    """Read-only adapter for an AI Speaker Notes application database.

    The production application may still use the original v1 schema where the
    `users` table has no admin-only `is_banned` / `deleted_at` columns. This
    adapter intentionally uses SQL text + schema introspection so the admin
    dashboard can read jobs/chat without applying migrations to production.

    For remote databases reached through an SSH tunnel we avoid long-lived
    pooled DBAPI sockets. A fresh connection per dashboard snapshot is more
    reliable across tunnel reconnects, and each snapshot batches several SQL
    reads over one connection to reduce network round trips.
    """

    def __init__(self, url: str) -> None:
        self.url = url
        engine_kwargs: dict[str, Any] = {}
        if url.startswith("postgresql"):
            # SSH tunnels can be restarted independently from this process. A
            # NullPool prevents stale forwarded sockets from sitting in a pool.
            engine_kwargs["poolclass"] = NullPool
            engine_kwargs["connect_args"] = {"connect_timeout": 3}
        self.engine = create_engine(url, **engine_kwargs)
        self.tables: set[str] = set()
        self.user_columns: set[str] = set()
        self.last_error: str | None = None
        self._schema_loaded = False
        self._cache_ttl = 2.5
        self._counts_cache: tuple[float, dict[str, int]] | None = None
        self._directory_cache: tuple[float, list[dict[str, Any]], dict[str, int], dict[str, int]] | None = None

    def _refresh_schema(self) -> bool:
        try:
            inspector = inspect(self.engine)
            tables = set(inspector.get_table_names())
            user_columns = {c["name"] for c in inspector.get_columns("users")} if "users" in tables else set()
            self.tables = tables
            self.user_columns = user_columns
            self._schema_loaded = True
            self.last_error = None
            return True
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return False

    def _ensure_schema(self) -> bool:
        if self._schema_loaded:
            return True
        return self._refresh_schema()

    @property
    def ready(self) -> bool:
        return self._schema_loaded and self.last_error is None

    def _invalidate_cache(self) -> None:
        self._counts_cache = None
        self._directory_cache = None

    def reconcile_keycloak_subjects(
        self,
        active_subjects: set[str],
    ) -> list[str]:
        """Soft-delete active local identities missing from Keycloak.

        This reconciliation intentionally preserves jobs, chat history,
        presentations, and audit data. Keycloak remains the source of
        truth for whether an identity is currently active.
        """
        subjects = {
            str(value).strip()
            for value in active_subjects
            if str(value).strip()
        }

        # Safety guard: never mass-delete when Keycloak returns no users.
        if not subjects:
            return []

        if (
            not self._ensure_schema()
            or "users" not in self.tables
            or "deleted_at" not in self.user_columns
        ):
            return []

        params = {
            f"kc_{i}": subject
            for i, subject in enumerate(sorted(subjects))
        }

        placeholders = ", ".join(
            f":kc_{i}"
            for i in range(len(params))
        )

        select_sql = text(
            "SELECT subject FROM users "
            "WHERE deleted_at IS NULL "
            f"AND subject NOT IN ({placeholders})"
        )

        try:
            with self.engine.begin() as conn:
                stale = [
                    str(value)
                    for value in conn.execute(
                        select_sql,
                        params,
                    ).scalars().all()
                ]

                if not stale:
                    return []

                stale_params = {
                    f"stale_{i}": subject
                    for i, subject in enumerate(stale)
                }

                stale_placeholders = ", ".join(
                    f":stale_{i}"
                    for i in range(len(stale))
                )

                assignments = [
                    "deleted_at = CURRENT_TIMESTAMP"
                ]

                if "is_banned" in self.user_columns:
                    assignments.append(
                        "is_banned = :reconcile_banned"
                    )
                    stale_params[
                        "reconcile_banned"
                    ] = True

                update_sql = text(
                    "UPDATE users SET "
                    + ", ".join(assignments)
                    + " WHERE deleted_at IS NULL "
                    + f"AND subject IN ({stale_placeholders})"
                )

                conn.execute(
                    update_sql,
                    stale_params,
                )

        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            raise

        self._invalidate_cache()

        return stale


    def _mark_unavailable(self, exc: Exception) -> None:
        self.last_error = str(exc)
        self._schema_loaded = False
        self._invalidate_cache()
        self.engine.dispose()

    def healthcheck(self) -> bool:
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return self._refresh_schema()
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return False

    @staticmethod
    def _json(value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return dict(value)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                return dict(parsed) if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
        return {}

    def _empty_counts(self) -> dict[str, int]:
        return {
            "users": 0,
            "banned_users": 0,
            "jobs": 0,
            "completed_jobs": 0,
            "failed_jobs": 0,
            "chat_threads": 0,
            "chat_messages": 0,
            "free_users": 0,
            "pro_users": 0,
            "expiring_pro": 0,
            "expired_subscriptions": 0,
            "pending_payments": 0,
            "past_due_subscriptions": 0,
        }

    def _counts_sql(self):
        users_where = " WHERE deleted_at IS NULL" if "deleted_at" in self.user_columns else ""
        if "users" in self.tables:
            users_expr = f"(SELECT COUNT(*) FROM users{users_where})"
            if "is_banned" in self.user_columns:
                banned_where = "is_banned = TRUE"
                if "deleted_at" in self.user_columns:
                    banned_where += " AND deleted_at IS NULL"
                banned_expr = f"(SELECT COUNT(*) FROM users WHERE {banned_where})"
            else:
                banned_expr = "0"
        else:
            users_expr = banned_expr = "0"

        jobs_expr = "(SELECT COUNT(*) FROM jobs)" if "jobs" in self.tables else "0"
        completed_expr = "(SELECT COUNT(*) FROM jobs WHERE status='completed')" if "jobs" in self.tables else "0"
        failed_expr = "(SELECT COUNT(*) FROM jobs WHERE status='failed')" if "jobs" in self.tables else "0"
        threads_expr = "(SELECT COUNT(*) FROM chat_threads)" if "chat_threads" in self.tables else "0"
        messages_expr = "(SELECT COUNT(*) FROM chat_messages)" if "chat_messages" in self.tables else "0"
        return text(
            "SELECT "
            f"{users_expr} AS users, "
            f"{banned_expr} AS banned_users, "
            f"{jobs_expr} AS jobs, "
            f"{completed_expr} AS completed_jobs, "
            f"{failed_expr} AS failed_jobs, "
            f"{threads_expr} AS chat_threads, "
            f"{messages_expr} AS chat_messages"
        )

    def _counts_with_conn(self, conn) -> dict[str, int]:
        if not self._ensure_schema():
            return self._empty_counts()
        row = conn.execute(self._counts_sql()).mappings().one()
        counts = {key: int(row.get(key) or 0) for key in self._empty_counts()}

        if "subscriptions" in self.tables and "users" in self.tables:
            users_where = "WHERE u.deleted_at IS NULL" if "deleted_at" in self.user_columns else ""
            subscription_rows = conn.execute(
                text(
                    "SELECT s.plan, s.status, s.provider, s.provider_subscription_id, "
                    "s.current_period_start, s.current_period_end, s.cancel_at_period_end "
                    "FROM subscriptions s JOIN users u ON u.subject=s.owner "
                    f"{users_where}"
                )
            ).mappings().all()
            counts.update(
                billing_counts(
                    [dict(item) for item in subscription_rows],
                    total_users=counts["users"],
                )
            )
        else:
            counts["free_users"] = counts["users"]

        return counts

    def admin_counts(self) -> dict[str, int]:
        now = time.monotonic()
        if self._counts_cache and now - self._counts_cache[0] < self._cache_ttl:
            return dict(self._counts_cache[1])
        if not self._ensure_schema():
            return self._empty_counts()
        try:
            with self.engine.connect() as conn:
                counts = self._counts_with_conn(conn)
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return self._empty_counts()
        self._counts_cache = (now, dict(counts))
        return counts

    def directory_snapshot(
        self,
        *,
        include_deleted: bool = False,
        limit: int = 1000,
    ) -> tuple[list[dict[str, Any]], dict[str, int], dict[str, int]]:
        """Return users + per-user job counts + dashboard counts in one DB checkout."""
        now = time.monotonic()
        if (
            not include_deleted
            and limit >= 1000
            and self._directory_cache
            and now - self._directory_cache[0] < self._cache_ttl
        ):
            _, users, job_counts, counts = self._directory_cache
            return [dict(item) for item in users], dict(job_counts), dict(counts)

        if not self._ensure_schema() or "users" not in self.tables:
            return [], {}, self.admin_counts()

        banned_expr = "u.is_banned" if "is_banned" in self.user_columns else "FALSE AS is_banned"
        deleted_expr = "u.deleted_at" if "deleted_at" in self.user_columns else "NULL AS deleted_at"
        where = ""
        if not include_deleted and "deleted_at" in self.user_columns:
            where = "WHERE u.deleted_at IS NULL"
        joins: list[str] = []
        if "jobs" in self.tables:
            joins.append(
                "LEFT JOIN (SELECT owner, COUNT(*) AS job_count FROM jobs "
                "WHERE owner IS NOT NULL GROUP BY owner) j ON j.owner=u.subject"
            )
            job_expr = "COALESCE(j.job_count, 0) AS job_count"
        else:
            job_expr = "0 AS job_count"

        if "subscriptions" in self.tables:
            joins.append("LEFT JOIN subscriptions s ON s.owner=u.subject")
            subscription_expr = (
                "s.plan AS subscription_plan_raw, "
                "s.status AS subscription_status_raw, "
                "s.provider AS subscription_provider_raw, "
                "s.provider_subscription_id AS subscription_provider_id_raw, "
                "s.current_period_start AS subscription_period_start_raw, "
                "s.current_period_end AS subscription_period_end_raw, "
                "s.cancel_at_period_end AS subscription_cancel_raw"
            )
        else:
            subscription_expr = (
                "NULL AS subscription_plan_raw, "
                "NULL AS subscription_status_raw, "
                "NULL AS subscription_provider_raw, "
                "NULL AS subscription_provider_id_raw, "
                "NULL AS subscription_period_start_raw, "
                "NULL AS subscription_period_end_raw, "
                "NULL AS subscription_cancel_raw"
            )

        join_sql = " ".join(joins)
        sql = text(
            "SELECT u.subject, u.username, u.email, u.display_name, u.created_at, u.last_login_at, "
            f"{banned_expr}, {deleted_expr}, {job_expr}, {subscription_expr} "
            f"FROM users u {join_sql} {where} "
            "ORDER BY u.last_login_at DESC LIMIT :limit"
        )
        try:
            with self.engine.connect() as conn:
                rows = conn.execute(sql, {"limit": max(1, min(int(limit), 5000))}).mappings().all()
                counts = self._counts_with_conn(conn)
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return [], {}, self._empty_counts()

        users: list[dict[str, Any]] = []
        job_counts: dict[str, int] = {}
        for row in rows:
            item = dict(row)
            item["is_banned"] = bool(item.get("is_banned", False))
            item["deleted_at"] = item.get("deleted_at")
            count = int(item.pop("job_count", 0) or 0)
            job_counts[str(item["subject"])] = count

            raw_subscription = None
            if item.get("subscription_plan_raw") is not None:
                raw_subscription = {
                    "plan": item.get("subscription_plan_raw"),
                    "status": item.get("subscription_status_raw"),
                    "provider": item.get("subscription_provider_raw"),
                    "provider_subscription_id": item.get("subscription_provider_id_raw"),
                    "current_period_start": item.get("subscription_period_start_raw"),
                    "current_period_end": item.get("subscription_period_end_raw"),
                    "cancel_at_period_end": item.get("subscription_cancel_raw"),
                }

            for key in [
                "subscription_plan_raw",
                "subscription_status_raw",
                "subscription_provider_raw",
                "subscription_provider_id_raw",
                "subscription_period_start_raw",
                "subscription_period_end_raw",
                "subscription_cancel_raw",
            ]:
                item.pop(key, None)

            item.update(subscription_view(raw_subscription))
            users.append(item)
        self.last_error = None
        self._counts_cache = (now, dict(counts))
        if not include_deleted and limit >= 1000:
            self._directory_cache = (
                now,
                [dict(item) for item in users],
                dict(job_counts),
                dict(counts),
            )
        return users, job_counts, counts

    def list_users(self, *, include_deleted: bool = False, limit: int = 1000) -> list[dict[str, Any]]:
        users, _, _ = self.directory_snapshot(include_deleted=include_deleted, limit=limit)
        return users

    def get_user(self, subject: str) -> ApplicationUser | None:
        if not self._ensure_schema() or "users" not in self.tables:
            return None
        banned_expr = "is_banned" if "is_banned" in self.user_columns else "FALSE AS is_banned"
        deleted_expr = "deleted_at" if "deleted_at" in self.user_columns else "NULL AS deleted_at"
        sql = text(
            "SELECT subject, username, email, display_name, created_at, last_login_at, "
            f"{banned_expr}, {deleted_expr} FROM users WHERE subject=:subject LIMIT 1"
        )
        try:
            with self.engine.connect() as conn:
                row = conn.execute(sql, {"subject": subject}).mappings().first()
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return None
        if row is None:
            return None
        return ApplicationUser(
            subject=str(row["subject"]),
            username=str(row["username"]),
            email=str(row["email"]) if row.get("email") else None,
            display_name=str(row["display_name"]) if row.get("display_name") else None,
            created_at=row.get("created_at"),
            last_login_at=row.get("last_login_at"),
            is_banned=bool(row.get("is_banned", False)),
            deleted_at=row.get("deleted_at"),
        )

    def get_subscription_for_owner(self, owner: str) -> dict[str, Any]:
        if not self._ensure_schema() or "subscriptions" not in self.tables:
            return subscription_view(None)
        try:
            with self.engine.connect() as conn:
                row = conn.execute(
                    text(
                        "SELECT plan, status, provider, provider_subscription_id, "
                        "current_period_start, current_period_end, cancel_at_period_end "
                        "FROM subscriptions WHERE owner=:owner LIMIT 1"
                    ),
                    {"owner": owner},
                ).mappings().first()
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return subscription_view(None)
        return subscription_view(dict(row) if row is not None else None)

    def set_manual_plan(
        self,
        owner: str,
        *,
        plan: str,
        days: int = 30,
        monthly_credits: int = 1000,
    ) -> dict[str, Any]:
        """Grant or revoke a manual NotePreso plan.

        Provider-managed paid subscriptions are deliberately protected from
        accidental overwrite. Manual Pro grants receive a fresh credit cycle;
        downgrading to Free clears monthly credits but preserves top-up credits.
        """
        owner = str(owner or "").strip()
        plan = str(plan or "").strip().lower()

        if not owner:
            raise ValueError("owner is required")
        if plan not in {"free", "pro"}:
            raise ValueError("plan must be 'free' or 'pro'")
        if not 1 <= int(days) <= 3660:
            raise ValueError("days must be between 1 and 3660")
        if not 0 <= int(monthly_credits) <= 10_000_000:
            raise ValueError("monthly_credits is outside the allowed range")

        if not self._ensure_schema() or "subscriptions" not in self.tables:
            raise RuntimeError("Application subscriptions table is unavailable")

        now = datetime.now(timezone.utc)
        period_end = now + timedelta(days=int(days)) if plan == "pro" else None

        try:
            with self.engine.begin() as conn:
                current = conn.execute(
                    text(
                        "SELECT plan, status, provider, provider_subscription_id, "
                        "current_period_start, current_period_end, cancel_at_period_end "
                        "FROM subscriptions WHERE owner=:owner LIMIT 1"
                    ),
                    {"owner": owner},
                ).mappings().first()

                if current is not None:
                    provider = str(current.get("provider") or "").strip().lower()
                    current_plan = str(current.get("plan") or "free").strip().lower()
                    current_status = str(current.get("status") or "").strip().lower()

                    if (
                        provider
                        and provider != "manual"
                        and current_plan == "pro"
                        and current_status in {"active", "trialing", "past_due"}
                    ):
                        raise ValueError(
                            f"Cannot overwrite provider-managed subscription ({provider})"
                        )

                if plan == "pro":
                    params = {
                        "owner": owner,
                        "plan": "pro",
                        "status": "active",
                        "provider": "manual",
                        "period_start": now,
                        "period_end": period_end,
                        "now": now,
                    }

                    result = conn.execute(
                        text(
                            "UPDATE subscriptions SET "
                            "plan=:plan, status=:status, provider=:provider, "
                            "provider_customer_id=NULL, provider_subscription_id=NULL, "
                            "current_period_start=:period_start, "
                            "current_period_end=:period_end, "
                            "cancel_at_period_end=false, updated_at=:now "
                            "WHERE owner=:owner"
                        ),
                        params,
                    )

                    if result.rowcount == 0:
                        conn.execute(
                            text(
                                "INSERT INTO subscriptions "
                                "(owner, plan, status, provider, "
                                "provider_customer_id, provider_subscription_id, "
                                "current_period_start, current_period_end, "
                                "cancel_at_period_end, created_at, updated_at) "
                                "VALUES "
                                "(:owner, :plan, :status, :provider, "
                                "NULL, NULL, :period_start, :period_end, "
                                "false, :now, :now)"
                            ),
                            params,
                        )

                    if "credit_wallets" in self.tables:
                        wallet_params = {
                            "owner": owner,
                            "credits": int(monthly_credits),
                            "period_start": now,
                            "period_end": period_end,
                            "now": now,
                        }

                        result = conn.execute(
                            text(
                                "UPDATE credit_wallets SET "
                                "monthly_credits=:credits, "
                                "period_start=:period_start, "
                                "period_end=:period_end, updated_at=:now "
                                "WHERE owner=:owner"
                            ),
                            wallet_params,
                        )

                        if result.rowcount == 0:
                            conn.execute(
                                text(
                                    "INSERT INTO credit_wallets "
                                    "(owner, monthly_credits, topup_credits, "
                                    "period_start, period_end, created_at, updated_at) "
                                    "VALUES "
                                    "(:owner, :credits, 0, :period_start, "
                                    ":period_end, :now, :now)"
                                ),
                                wallet_params,
                            )

                else:
                    params = {
                        "owner": owner,
                        "plan": "free",
                        "status": "active",
                        "now": now,
                    }

                    result = conn.execute(
                        text(
                            "UPDATE subscriptions SET "
                            "plan=:plan, status=:status, provider='manual', "
                            "provider_customer_id=NULL, provider_subscription_id=NULL, "
                            "current_period_start=NULL, current_period_end=NULL, "
                            "cancel_at_period_end=false, updated_at=:now "
                            "WHERE owner=:owner"
                        ),
                        params,
                    )

                    if result.rowcount == 0:
                        conn.execute(
                            text(
                                "INSERT INTO subscriptions "
                                "(owner, plan, status, provider, "
                                "provider_customer_id, provider_subscription_id, "
                                "current_period_start, current_period_end, "
                                "cancel_at_period_end, created_at, updated_at) "
                                "VALUES "
                                "(:owner, :plan, :status, 'manual', "
                                "NULL, NULL, NULL, NULL, false, :now, :now)"
                            ),
                            params,
                        )

                    if "credit_wallets" in self.tables:
                        conn.execute(
                            text(
                                "UPDATE credit_wallets SET "
                                "monthly_credits=0, period_start=NULL, "
                                "period_end=NULL, updated_at=:now "
                                "WHERE owner=:owner"
                            ),
                            {"owner": owner, "now": now},
                        )

                row = conn.execute(
                    text(
                        "SELECT plan, status, provider, provider_subscription_id, "
                        "current_period_start, current_period_end, cancel_at_period_end "
                        "FROM subscriptions WHERE owner=:owner LIMIT 1"
                    ),
                    {"owner": owner},
                ).mappings().first()

                wallet = None
                if "credit_wallets" in self.tables:
                    wallet = conn.execute(
                        text(
                            "SELECT monthly_credits, topup_credits, "
                            "period_start, period_end "
                            "FROM credit_wallets WHERE owner=:owner LIMIT 1"
                        ),
                        {"owner": owner},
                    ).mappings().first()

        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            raise

        self._invalidate_cache()

        result = subscription_view(dict(row) if row is not None else None)
        result["credits"] = dict(wallet) if wallet is not None else None
        return result

    def user_job_counts(self) -> dict[str, int]:
        _, job_counts, _ = self.directory_snapshot(limit=5000)
        return job_counts

    def _job_rows_with_conn(self, conn, owner: str | None, limit: int) -> list[dict[str, Any]]:
        if "jobs" not in self.tables:
            return []
        where = "WHERE owner=:owner" if owner is not None else ""
        sql = text(
            f"SELECT id, owner, status, created_at, updated_at, payload FROM jobs {where} "
            "ORDER BY created_at DESC LIMIT :limit"
        )
        params: dict[str, Any] = {"limit": max(1, min(int(limit), 2000))}
        if owner is not None:
            params["owner"] = owner
        rows = conn.execute(sql, params).mappings().all()
        return [
            {
                "id": row["id"],
                "owner": row.get("owner"),
                "status": row.get("status"),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
                "payload": self._json(row.get("payload")),
            }
            for row in rows
        ]

    def _job_rows(self, owner: str | None, limit: int) -> list[dict[str, Any]]:
        if not self._ensure_schema() or "jobs" not in self.tables:
            return []
        try:
            with self.engine.connect() as conn:
                return self._job_rows_with_conn(conn, owner, limit)
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return []

    def list_jobs_for_owner(self, owner: str, *, limit: int = 500) -> list[dict[str, Any]]:
        rows = self._job_rows(owner, limit)
        for row in rows:
            row.pop("owner", None)
        return rows

    def list_jobs(self, *, limit: int = 500) -> list[dict[str, Any]]:
        return self._job_rows(None, limit)

    def _thread_rows_with_conn(self, conn, owner: str | None, limit: int) -> list[dict[str, Any]]:
        if "chat_threads" not in self.tables:
            return []
        where = "WHERE t.owner=:owner" if owner is not None else ""
        message_join = ""
        message_count = "0 AS message_count"
        if "chat_messages" in self.tables:
            message_join = "LEFT JOIN chat_messages m ON m.thread_id=t.id"
            message_count = "COUNT(m.id) AS message_count"
        sql = text(
            "SELECT t.id, t.owner, t.scope_key, t.mode, t.job_id, t.created_at, t.updated_at, "
            f"{message_count} FROM chat_threads t {message_join} {where} "
            "GROUP BY t.id, t.owner, t.scope_key, t.mode, t.job_id, t.created_at, t.updated_at "
            "ORDER BY t.updated_at DESC LIMIT :limit"
        )
        params: dict[str, Any] = {"limit": max(1, min(int(limit), 1000))}
        if owner is not None:
            params["owner"] = owner
        rows = conn.execute(sql, params).mappings().all()
        return [dict(row) for row in rows]

    def _thread_rows(self, owner: str | None, limit: int) -> list[dict[str, Any]]:
        if not self._ensure_schema() or "chat_threads" not in self.tables:
            return []
        try:
            with self.engine.connect() as conn:
                return self._thread_rows_with_conn(conn, owner, limit)
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return []

    def list_chat_threads_for_owner(self, owner: str, *, limit: int = 200) -> list[dict[str, Any]]:
        return self._thread_rows(owner, min(limit, 500))

    def list_chat_threads(self, *, limit: int = 300) -> list[dict[str, Any]]:
        return self._thread_rows(None, limit)

    def activity_snapshot(
        self,
        owner: str | None = None,
        *,
        users_limit: int = 5000,
        jobs_limit: int = 500,
        chats_limit: int = 300,
    ) -> dict[str, Any]:
        """Fetch activity-page data with one DB checkout.

        This is the performance-critical path for local admin -> SSH tunnel ->
        production PostgreSQL. Keeping all reads on one connection avoids the
        many preflight/checkout round trips of the earlier implementation.
        """
        if not self._ensure_schema():
            return {"users": [], "jobs": [], "chats": [], "counts": self._empty_counts()}
        try:
            with self.engine.connect() as conn:
                users: list[dict[str, Any]] = []
                if "users" in self.tables:
                    banned_expr = "is_banned" if "is_banned" in self.user_columns else "FALSE AS is_banned"
                    deleted_expr = "deleted_at" if "deleted_at" in self.user_columns else "NULL AS deleted_at"
                    where = "WHERE deleted_at IS NULL" if "deleted_at" in self.user_columns else ""
                    rows = conn.execute(
                        text(
                            "SELECT subject, username, email, display_name, created_at, last_login_at, "
                            f"{banned_expr}, {deleted_expr} FROM users {where} "
                            "ORDER BY last_login_at DESC LIMIT :limit"
                        ),
                        {"limit": max(1, min(int(users_limit), 5000))},
                    ).mappings().all()
                    users = [dict(row) for row in rows]
                jobs = self._job_rows_with_conn(conn, owner, jobs_limit)
                chats = self._thread_rows_with_conn(conn, owner, chats_limit)
                counts = self._counts_with_conn(conn)
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return {"users": [], "jobs": [], "chats": [], "counts": self._empty_counts()}

        if owner:
            counts = {
                **counts,
                "jobs": len(jobs),
                "completed_jobs": sum(1 for row in jobs if row.get("status") == "completed"),
                "failed_jobs": sum(1 for row in jobs if row.get("status") == "failed"),
                "chat_threads": len(chats),
                "chat_messages": sum(int(row.get("message_count") or 0) for row in chats),
            }
        self.last_error = None
        return {"users": users, "jobs": jobs, "chats": chats, "counts": counts}

    def get_chat_thread(self, thread_id: int, *, include_messages: bool = False) -> dict[str, Any] | None:
        if not self._ensure_schema() or "chat_threads" not in self.tables:
            return None
        try:
            with self.engine.connect() as conn:
                thread = conn.execute(
                    text(
                        "SELECT id, owner, scope_key, mode, job_id, created_at, updated_at "
                        "FROM chat_threads WHERE id=:id LIMIT 1"
                    ),
                    {"id": int(thread_id)},
                ).mappings().first()
                if thread is None:
                    return None
                payload = dict(thread)
                messages: list[dict[str, Any]] = []
                if "chat_messages" in self.tables:
                    rows = conn.execute(
                        text(
                            "SELECT id, ordinal, role, content, created_at FROM chat_messages "
                            "WHERE thread_id=:id ORDER BY ordinal ASC"
                        ),
                        {"id": int(thread_id)},
                    ).mappings().all()
                    messages = [dict(row) for row in rows]
        except SQLAlchemyError as exc:
            self._mark_unavailable(exc)
            return None
        payload["message_count"] = len(messages)
        if include_messages:
            payload["messages"] = messages
        return payload
