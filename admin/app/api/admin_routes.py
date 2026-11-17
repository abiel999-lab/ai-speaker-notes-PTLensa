from __future__ import annotations

from datetime import UTC, datetime
import logging
import time
import re
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth_routes import admin_restart_token, begin_keycloak_admin_login
from app.core.auth import is_admin_identity, request_identity, require_admin_identity, verify_csrf
from app.core.keycloak_admin import KeycloakAdminError, KeycloakUser
from app.core.subscription_view import subscription_view
from app.core.presentation_admin import fetch_presentation_admin_metrics


router = APIRouter(prefix="/api/v1/admin", tags=["admin"])
browser_router = APIRouter(tags=["admin"])
templates = Jinja2Templates(directory=Path(__file__).resolve().parents[1] / "templates")
logger = logging.getLogger("speaker_notes.admin")


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=120, pattern=r"^[A-Za-z0-9._@-]+$")
    email: EmailStr | None = None
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=12, max_length=256)
    temporary_password: bool = True
    email_verified: bool = False


class UpdateUserRequest(BaseModel):
    # Existing federated usernames are immutable identities, not new-account input.
    username: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email_verified: bool = False


class UpdatePlanRequest(BaseModel):
    plan: Literal["free", "pro"]
    days: int = Field(default=30, ge=1, le=3660)
    monthly_credits: int = Field(default=1000, ge=1, le=10_000_000)


class RevealChatRequest(BaseModel):
    reason: Literal["customer_support", "bug_investigation", "security_review", "legal_compliance"]
    note: str | None = Field(default=None, max_length=500)


def _require_db(request: Request):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=503, detail="Admin dashboard requires DATABASE_URL/PostgreSQL.")
    return db


def _data_db(request: Request):
    """Database that owns AI Speaker Notes user activity (jobs/chat)."""
    db = getattr(request.app.state, "data_db", None) or getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(
            status_code=503,
            detail="Application activity database is unavailable. Configure APPLICATION_DATABASE_URL or DATABASE_URL.",
        )
    return db


def _require_admin_api(request: Request, *, mutate: bool = False):
    identity = require_admin_identity(request)
    if mutate:
        verify_csrf(request, identity)
    return identity


def _admin_client(request: Request):
    client = getattr(request.app.state, "keycloak_admin", None)
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="Keycloak user management is not configured. Set KEYCLOAK_ADMIN_CLIENT_ID and KEYCLOAK_ADMIN_CLIENT_SECRET.",
        )
    return client


def _kc_error(exc: KeycloakAdminError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


def _dt(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def _kc_created(value: int | None) -> str | None:
    if not value:
        return None
    return datetime.fromtimestamp(value / 1000, tz=UTC).isoformat()


def _user_payload(
    kc: KeycloakUser | None,
    local: dict[str, Any] | None,
    *,
    job_count: int = 0,
    subscription: dict[str, Any] | None = None,
) -> dict[str, Any]:
    subject = kc.id if kc else str(local["subject"])
    username = kc.username if kc else str(local["username"])
    email = kc.email if kc else local.get("email")
    display_name = kc.display_name if kc else (local.get("display_name") or username)
    enabled = kc.enabled if kc else not bool(local.get("is_banned"))

    subscription_source = subscription
    if subscription_source is None and local is not None and "plan" in local:
        subscription_source = {
            "plan": local.get("subscription_plan", local.get("plan")),
            "status": local.get("subscription_status"),
            "provider": local.get("billing_provider"),
            "provider_subscription_id": local.get("provider_subscription_id"),
            "current_period_start": local.get("current_period_start"),
            "current_period_end": local.get("current_period_end"),
            "cancel_at_period_end": local.get("cancel_at_period_end", False),
        }
    billing = subscription_view(subscription_source)

    return {
        "id": subject,
        "subject": subject,
        "username": username,
        "email": email,
        "display_name": display_name,
        "first_name": kc.first_name if kc else None,
        "last_name": kc.last_name if kc else None,
        "enabled": enabled,
        "banned": not enabled or bool(local and local.get("is_banned")),
        "email_verified": kc.email_verified if kc else False,
        "keycloak_created_at": _kc_created(kc.created_timestamp) if kc else None,
        "database_created_at": _dt(local.get("created_at")) if local else None,
        "last_login_at": _dt(local.get("last_login_at")) if local else None,
        "job_count": int(job_count),
        "database_record": local is not None,
        "keycloak_record": kc is not None,
        "plan": billing["plan"],
        "plan_name": billing["plan_name"],
        "subscription_plan": billing["subscription_plan"],
        "subscription_status": billing["subscription_status"],
        "billing_provider": billing["billing_provider"],
        "billing_state": billing["billing_state"],
        "current_period_start": _dt(billing["current_period_start"]),
        "current_period_end": _dt(billing["current_period_end"]),
        "valid_until": _dt(billing["valid_until"]),
        "cancel_at_period_end": billing["cancel_at_period_end"],
        "auto_renew": billing["auto_renew"],
        "is_paid": billing["is_paid"],
    }


def _safe_file_size(path_value: str | None, root: Path) -> int | None:
    if not path_value:
        return None
    try:
        candidate = Path(path_value).resolve()
        resolved_root = root.resolve()
        if not candidate.is_relative_to(resolved_root):
            return None
        return candidate.stat().st_size if candidate.is_file() else None
    except (OSError, RuntimeError, ValueError):
        return None


def _job_payload(row: dict[str, Any], storage_root: Path) -> dict[str, Any]:
    payload = dict(row.get("payload") or {})
    options = dict(payload.get("options") or {})
    return {
        "id": str(row["id"]),
        "filename": str(payload.get("original_filename") or "presentation.pptx"),
        "status": str(row.get("status") or payload.get("status") or "unknown"),
        "created_at": _dt(row.get("created_at")),
        "updated_at": _dt(row.get("updated_at")),
        "input_bytes": _safe_file_size(payload.get("input_path"), storage_root),
        "output_bytes": _safe_file_size(payload.get("output_path"), storage_root),
        "engine": options.get("engine"),
        "language": options.get("language"),
        "audience": options.get("audience"),
        "depth": options.get("depth"),
        "used_vision": bool(payload.get("used_vision", False)),
        "model": payload.get("model"),
        "total_tokens": int(payload.get("total_tokens") or 0),
        "estimated_cost_usd": payload.get("estimated_cost_usd"),
        "error": payload.get("error"),
    }


def _render_admin_page(request: Request, page: str):
    settings = request.app.state.settings
    identity = request_identity(request)
    return_to = {
        "overview": "/admin",
        "users": "/admin/users",
        "activity": "/admin/activity",
        "presentation": "/admin/presentation-ai",
        "translator": "/admin/translator",
    }.get(page, "/admin")
    if identity is None:
        if settings.keycloak_enabled:
            return begin_keycloak_admin_login(request, return_to)
        return RedirectResponse(f"/login?return_to={return_to}", status_code=303)
    if not is_admin_identity(request, identity):
        raise HTTPException(status_code=403, detail="Administrator access required.")
    page_titles = {
        "overview": "Control Center",
        "users": "User Management",
        "activity": "Presentations & Chat",
        "presentation": "Presentation AI",
        "translator": "PowerPoint Translator",
    }
    return templates.TemplateResponse(
        request=request,
        name="admin.html",
        context={
            "app_name": settings.app_name,
            "username": identity.display_name or identity.username,
            "csrf_token": identity.csrf,
            "management_ready": getattr(request.app.state, "keycloak_admin", None) is not None,
            "admin_page": page,
            "admin_page_title": page_titles.get(page, "Administration"),
            "user_app_url": settings.user_app_url.rstrip("/"),
        },
    )


@browser_router.get("/admin/unauthorized", response_class=HTMLResponse)
def admin_unauthorized_page(request: Request):
    """Friendly recovery page for an authenticated non-admin Keycloak account."""
    settings = request.app.state.settings
    identity = request_identity(request)
    return templates.TemplateResponse(
        request=request,
        name="admin_unauthorized.html",
        context={
            "app_name": settings.app_name,
            "username": (identity.display_name or identity.username) if identity else None,
            "restart_token": admin_restart_token(request),
            "user_app_url": settings.user_app_url.rstrip("/"),
        },
        status_code=403,
    )


@browser_router.get("/admin", response_class=HTMLResponse)
def admin_page(request: Request):
    return _render_admin_page(request, "overview")


@browser_router.get("/admin/users", response_class=HTMLResponse)
def admin_users_page(request: Request):
    return _render_admin_page(request, "users")


@browser_router.get("/admin/activity", response_class=HTMLResponse)
def admin_activity_page(request: Request):
    return _render_admin_page(request, "activity")


@browser_router.get("/admin/presentation-ai", response_class=HTMLResponse)
def admin_presentation_page(request: Request):
    return _render_admin_page(request, "presentation")


@router.get("/presentation-ai")
def admin_presentation_metrics(request: Request):
    _require_admin_api(request)
    return fetch_presentation_admin_metrics(request.app.state.settings)


@router.get("/summary")
def admin_summary(request: Request):
    """Return application-database KPIs without waiting on Keycloak.

    The dashboard should paint immediately from PostgreSQL. Keycloak health is
    checked separately in the background so a slow identity provider cannot
    hold the entire page in a loading state.
    """
    _require_admin_api(request)
    db = _data_db(request)
    counts = db.admin_counts()
    management_ready = getattr(request.app.state, "keycloak_admin", None) is not None
    return {
        "counts": counts,
        "management_ready": management_ready,
        "management_error": None,
        "external_activity_database": getattr(request.app.state, "data_db", None) is not getattr(request.app.state, "db", None),
        "source": "application_database",
    }


@router.get("/keycloak-status")
def keycloak_status(request: Request):
    """Lightweight, non-blocking companion request used by the UI badge."""
    _require_admin_api(request)
    client = getattr(request.app.state, "keycloak_admin", None)
    if client is None:
        return {"ready": False, "error": "Keycloak user management is not configured."}
    try:
        return {"ready": True, "user_count": client.user_count(), "error": None}
    except KeycloakAdminError as exc:
        return {"ready": False, "error": str(exc)}


def _database_user_list(request: Request) -> tuple[Any, list[dict[str, Any]], dict[str, int], dict[str, int], list[dict[str, Any]]]:
    db = _data_db(request)
    started = time.perf_counter()
    if hasattr(db, "directory_snapshot"):
        local_rows, job_counts, counts = db.directory_snapshot(limit=5000)
    else:
        local_rows = db.list_users(limit=5000)
        job_counts = db.user_job_counts()
        counts = db.admin_counts()
    users = [
        _user_payload(None, row, job_count=job_counts.get(str(row["subject"]), 0))
        for row in local_rows
    ]
    users.sort(key=lambda item: ((item.get("display_name") or item["username"]).casefold(), item["username"].casefold()))
    logger.info(
        "admin_directory_database rows=%s elapsed_ms=%.1f",
        len(users),
        (time.perf_counter() - started) * 1000,
    )
    return db, users, job_counts, counts, local_rows


@router.get("/users")
def list_users(request: Request, source: Literal["database", "merged"] = "merged"):
    """List users database-first, with optional Keycloak enrichment.

    `source=database` never contacts Keycloak and is used for the first paint.
    `source=merged` adds live Keycloak-only accounts and enabled/disabled state.
    """
    _require_admin_api(request)
    db, database_users, job_counts, counts, local_rows = _database_user_list(request)
    management_ready = getattr(request.app.state, "keycloak_admin", None) is not None

    if source == "database" or not management_ready:
        return {
            "users": database_users,
            "counts": counts,
            "management_ready": management_ready,
            "management_error": None,
            "source": "database",
        }

    local_by_id = {str(row["subject"]): row for row in local_rows}
    kc_users: list[KeycloakUser] = []
    management_error: str | None = None
    try:
        kc_users = request.app.state.keycloak_admin.list_users(max_users=5000)

        # Reconcile only after a successful, non-empty Keycloak response.
        # If the result hits our hard limit, skip destructive reconciliation
        # because the list may be truncated.
        if kc_users and len(kc_users) < 5000:
            reconciled = db.reconcile_keycloak_subjects(
                {
                    user.id
                    for user in kc_users
                    if user.id
                }
            )

            if reconciled:
                logger.info(
                    "Keycloak reconciliation soft-deleted %d stale local identities.",
                    len(reconciled),
                )
    except KeycloakAdminError as exc:
        management_error = str(exc)

    if management_error:
        return {
            "users": database_users,
            "counts": counts,
            "management_ready": False,
            "management_error": management_error,
            "source": "database",
        }

    users: list[dict[str, Any]] = []
    seen: set[str] = set()
    for user in kc_users:
        local = local_by_id.get(user.id)
        users.append(_user_payload(user, local, job_count=job_counts.get(user.id, 0)))
        seen.add(user.id)
    for subject, local in local_by_id.items():
        if subject not in seen:
            users.append(_user_payload(None, local, job_count=job_counts.get(subject, 0)))

    users.sort(key=lambda item: ((item.get("display_name") or item["username"]).casefold(), item["username"].casefold()))
    return {
        "users": users,
        "counts": counts,
        "management_ready": True,
        "management_error": None,
        "source": "merged",
    }


@router.get("/activity")
def list_activity(request: Request, owner: str | None = None):
    _require_admin_api(request)
    db = _data_db(request)
    storage_root = request.app.state.settings.storage_dir
    started = time.perf_counter()
    if hasattr(db, "activity_snapshot"):
        snapshot = db.activity_snapshot(owner, users_limit=5000, jobs_limit=500, chats_limit=300)
        local_rows = snapshot.get("users", [])
        job_rows = snapshot.get("jobs", [])
        thread_rows = snapshot.get("chats", [])
        counts = snapshot.get("counts", {})
    else:
        local_rows = db.list_users(limit=5000)
        job_rows = db.list_jobs_for_owner(owner, limit=500) if owner else db.list_jobs(limit=500)
        thread_rows = db.list_chat_threads_for_owner(owner, limit=300) if owner else db.list_chat_threads(limit=300)
        counts = db.admin_counts()
    local_users = {str(row["subject"]): row for row in local_rows}

    jobs = []
    for row in job_rows:
        payload = _job_payload(row, storage_root)
        row_owner = owner if owner else str(row.get("owner") or "")
        local = local_users.get(row_owner)
        payload["owner"] = row_owner or None
        payload["owner_name"] = (local.get("display_name") or local.get("username")) if local else (row_owner or "Unknown user")
        payload["owner_email"] = local.get("email") if local else None
        jobs.append(payload)

    chats = []
    for thread in thread_rows:
        row_owner = owner if owner else str(thread.get("owner") or "")
        local = local_users.get(row_owner)
        chats.append({
            "id": int(thread["id"]),
            "owner": row_owner or None,
            "owner_name": (local.get("display_name") or local.get("username")) if local else (row_owner or "Unknown user"),
            "owner_email": local.get("email") if local else None,
            "scope_key": str(thread["scope_key"]),
            "mode": str(thread["mode"]),
            "job_id": str(thread["job_id"]) if thread.get("job_id") else None,
            "created_at": _dt(thread.get("created_at")),
            "updated_at": _dt(thread.get("updated_at")),
            "message_count": int(thread.get("message_count") or 0),
            "content_locked": True,
        })

    if owner and not hasattr(db, "activity_snapshot"):
        counts = {
            **counts,
            "jobs": len(jobs),
            "completed_jobs": sum(1 for job in jobs if job.get("status") == "completed"),
            "failed_jobs": sum(1 for job in jobs if job.get("status") == "failed"),
            "chat_threads": len(chats),
            "chat_messages": sum(int(chat.get("message_count") or 0) for chat in chats),
        }
    activity_users = [
        _user_payload(None, row, job_count=0)
        for row in local_rows
    ]
    activity_users.sort(
        key=lambda item: ((item.get("display_name") or item["username"]).casefold(), item["username"].casefold())
    )
    logger.info(
        "admin_activity_database owner=%s users=%s jobs=%s chats=%s elapsed_ms=%.1f",
        owner or "*",
        len(activity_users),
        len(jobs),
        len(chats),
        (time.perf_counter() - started) * 1000,
    )
    return {"counts": counts, "users": activity_users, "jobs": jobs, "chats": chats, "owner": owner}


@router.post("/chat-threads/{thread_id}/reveal")
def reveal_chat_thread(request: Request, thread_id: int, payload: RevealChatRequest):
    admin = _require_admin_api(request, mutate=True)
    data_db = _data_db(request)
    audit_db = _require_db(request)
    thread = data_db.get_chat_thread(thread_id, include_messages=True)
    if thread is None:
        raise HTTPException(status_code=404, detail="Chat thread not found.")

    reason_labels = {
        "customer_support": "Customer support",
        "bug_investigation": "Bug investigation",
        "security_review": "Security review",
        "legal_compliance": "Legal / compliance",
    }
    audit_db.audit(
        "admin_chat_content_accessed",
        owner=admin.owner_key,
        resource_type="chat_thread",
        resource_id=str(thread_id),
        metadata={
            "target_owner": str(thread.get("owner") or ""),
            "reason": payload.reason,
            "reason_label": reason_labels[payload.reason],
            "note": (payload.note or "").strip(),
            "message_count": int(thread.get("message_count") or 0),
        },
    )
    return {
        "thread": {
            "id": int(thread["id"]),
            "owner": str(thread.get("owner") or ""),
            "scope_key": str(thread.get("scope_key") or ""),
            "mode": str(thread.get("mode") or ""),
            "job_id": str(thread["job_id"]) if thread.get("job_id") else None,
            "created_at": _dt(thread.get("created_at")),
            "updated_at": _dt(thread.get("updated_at")),
            "message_count": int(thread.get("message_count") or 0),
            "messages": [
                {
                    "id": int(message["id"]),
                    "ordinal": int(message["ordinal"]),
                    "role": str(message["role"]),
                    "content": str(message["content"]),
                    "created_at": _dt(message.get("created_at")),
                }
                for message in thread.get("messages", [])
            ],
        },
        "access": {
            "reason": payload.reason,
            "reason_label": reason_labels[payload.reason],
            "audited": True,
        },
    }


@router.get("/users/{user_id}")
def get_user(request: Request, user_id: str):
    _require_admin_api(request)
    db = _data_db(request)
    local = db.get_user(user_id)
    local_payload = None
    if local is not None and local.deleted_at is None:
        local_payload = {
            "subject": local.subject,
            "username": local.username,
            "email": local.email,
            "display_name": local.display_name,
            "created_at": local.created_at,
            "last_login_at": local.last_login_at,
            "is_banned": local.is_banned,
            "deleted_at": local.deleted_at,
        }

    kc_user: KeycloakUser | None = None
    if getattr(request.app.state, "keycloak_admin", None) is not None:
        try:
            kc_user = request.app.state.keycloak_admin.get_user(user_id)
        except KeycloakAdminError as exc:
            if exc.status_code not in {404} and local_payload is None:
                raise _kc_error(exc) from exc

    if kc_user is None and local_payload is None:
        raise HTTPException(status_code=404, detail="User not found.")

    jobs = db.list_jobs_for_owner(user_id, limit=2000)
    chats = db.list_chat_threads_for_owner(user_id, limit=200)
    subscription = (
        db.get_subscription_for_owner(user_id)
        if hasattr(db, "get_subscription_for_owner")
        else subscription_view(None)
    )
    user = _user_payload(
        kc_user,
        local_payload,
        job_count=len(jobs),
        subscription=subscription,
    )
    # Read-only wallet lookup in the application database.
    try:
        with db.engine.connect() as conn:
            wallet = conn.execute(
                text(
                    "SELECT monthly_credits, topup_credits "
                    "FROM credit_wallets "
                    "WHERE owner = :owner LIMIT 1"
                ),
                {"owner": user_id},
            ).mappings().first()

        if wallet is None:
            user["credit_balance"] = {"status": "missing"}
        else:
            monthly = max(0, int(wallet["monthly_credits"] or 0))
            topup = max(0, int(wallet["topup_credits"] or 0))
            user["credit_balance"] = {
                "status": "available",
                "monthly": monthly,
                "topup": topup,
                "total": monthly + topup,
            }

    except SQLAlchemyError as exc:
        logger.warning(
            "Admin wallet lookup failed: %s",
            type(exc).__name__,
        )
        user["credit_balance"] = {"status": "unavailable"}

    storage_root = request.app.state.settings.storage_dir
    return {
        "user": user,
        "jobs": [_job_payload(row, storage_root) for row in jobs],
        "chats": [
            {
                "id": int(thread["id"]),
                "scope_key": str(thread["scope_key"]),
                "mode": str(thread["mode"]),
                "job_id": str(thread["job_id"]) if thread.get("job_id") else None,
                "created_at": _dt(thread.get("created_at")),
                "updated_at": _dt(thread.get("updated_at")),
                "message_count": int(thread.get("message_count") or 0),
                "content_locked": True,
            }
            for thread in chats
        ],
    }


@router.post("/users", status_code=201)
def create_user(request: Request, payload: CreateUserRequest):
    admin = _require_admin_api(request, mutate=True)
    client = _admin_client(request)
    try:
        user = client.create_user(
            username=payload.username,
            email=str(payload.email) if payload.email else None,
            first_name=payload.first_name,
            last_name=payload.last_name,
            password=payload.password,
            temporary_password=payload.temporary_password,
            email_verified=payload.email_verified,
        )
    except KeycloakAdminError as exc:
        raise _kc_error(exc) from exc
    db = _require_db(request)
    db.audit(
        "admin_user_created",
        owner=admin.owner_key,
        resource_type="user",
        resource_id=user.id,
        metadata={"username": user.username},
    )
    return {"user": _user_payload(user, None)}


@router.put("/users/{user_id}")
def update_user(request: Request, user_id: str, payload: UpdateUserRequest):
    admin = _require_admin_api(request, mutate=True)
    client = _admin_client(request)
    try:
        existing = client.get_user(user_id)
        if payload.username != existing.username and not re.fullmatch(r"[A-Za-z0-9._@-]{3,120}", payload.username):
            raise HTTPException(status_code=422, detail="A new username must contain 3–120 letters, numbers, dots, underscores, @ or hyphens. Keep the current username to preserve a linked sign-in.")
        user = client.update_user(
            user_id,
            username=payload.username,
            email=str(payload.email) if payload.email else None,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email_verified=payload.email_verified,
        )
    except KeycloakAdminError as exc:
        raise _kc_error(exc) from exc
    db = _require_db(request)
    db.update_user_metadata(
        user_id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
    )
    db.audit("admin_user_updated", owner=admin.owner_key, resource_type="user", resource_id=user_id)
    local = db.get_user(user_id)
    local_payload = None
    if local is not None:
        local_payload = {
            "subject": local.subject,
            "username": local.username,
            "email": local.email,
            "display_name": local.display_name,
            "created_at": local.created_at,
            "last_login_at": local.last_login_at,
            "is_banned": local.is_banned,
            "deleted_at": local.deleted_at,
        }
    return {"user": _user_payload(user, local_payload, job_count=db.user_job_counts().get(user_id, 0))}


@router.put("/users/{user_id}/plan")
def update_user_plan(request: Request, user_id: str, payload: UpdatePlanRequest):
    admin = _require_admin_api(request, mutate=True)

    data_db = _data_db(request)
    audit_db = _require_db(request)

    try:
        result = data_db.set_manual_plan(
            user_id,
            plan=payload.plan,
            days=payload.days,
            monthly_credits=payload.monthly_credits,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (RuntimeError, SQLAlchemyError) as exc:
        logger.warning("manual_plan_save_failed type=%s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="The plan could not be saved. No plan or credit changes were committed. Please try again.") from exc

    audit_db.audit(
        "admin_user_plan_updated",
        owner=admin.owner_key,
        resource_type="user",
        resource_id=user_id,
        metadata={
            "plan": payload.plan,
            "days": payload.days if payload.plan == "pro" else None,
            "monthly_credits": payload.monthly_credits if payload.plan == "pro" else 0,
            "provider": "manual",
        },
    )

    return {
        "ok": True,
        "user_id": user_id,
        "billing": result,
    }


@router.post("/users/{user_id}/ban")
def ban_user(request: Request, user_id: str):
    admin = _require_admin_api(request, mutate=True)
    if admin.owner_key == user_id:
        raise HTTPException(status_code=409, detail="You cannot ban your own active administrator account.")
    client = _admin_client(request)
    try:
        user = client.set_enabled(user_id, False)
    except KeycloakAdminError as exc:
        raise _kc_error(exc) from exc
    db = _require_db(request)
    db.set_user_banned(user_id, True)
    db.audit("admin_user_banned", owner=admin.owner_key, resource_type="user", resource_id=user_id)
    return {"user": _user_payload(user, None)}


@router.post("/users/{user_id}/unban")
def unban_user(request: Request, user_id: str):
    admin = _require_admin_api(request, mutate=True)
    client = _admin_client(request)
    try:
        user = client.set_enabled(user_id, True)
    except KeycloakAdminError as exc:
        raise _kc_error(exc) from exc
    db = _require_db(request)
    local = db.get_user(user_id)
    if local is not None and local.deleted_at is not None:
        raise HTTPException(status_code=409, detail="Deleted users cannot be unbanned. Create a new Keycloak account instead.")
    db.set_user_banned(user_id, False)
    db.audit("admin_user_unbanned", owner=admin.owner_key, resource_type="user", resource_id=user_id)
    return {"user": _user_payload(user, None)}


@router.delete("/users/{user_id}")
def delete_user(request: Request, user_id: str):
    admin = _require_admin_api(request, mutate=True)
    if admin.owner_key == user_id:
        raise HTTPException(status_code=409, detail="You cannot delete your own active administrator account.")
    client = _admin_client(request)
    try:
        client.delete_user(user_id)
    except KeycloakAdminError as exc:
        # A stale local record can remain after an account was deleted directly in
        # Keycloak. In that case allow the admin to finish local cleanup.
        if exc.status_code != 404:
            raise _kc_error(exc) from exc

    db = _require_db(request)
    jobs = db.list_jobs_for_owner(user_id, limit=2000)
    deleted_jobs = 0
    for row in jobs:
        try:
            request.app.state.store.delete(str(row["id"]))
            deleted_jobs += 1
        except Exception:
            # Account deletion must not expose server paths or fail halfway because an
            # already-expired artifact disappeared. The remaining DB tombstone blocks login.
            continue
    db.purge_user_chat(user_id)
    db.soft_delete_user(user_id)
    db.audit(
        "admin_user_deleted",
        owner=admin.owner_key,
        resource_type="user",
        resource_id=user_id,
        metadata={"deleted_jobs": deleted_jobs},
    )
    return {"deleted": True, "deleted_jobs": deleted_jobs}


# Translator monitoring: dedicated read-only service, admin authorization enforced here.
def _translation_fetch(path):
    import httpx
    from pathlib import Path
    token = Path('/app/translation-monitor-token').read_text().strip()
    try:
        with httpx.Client(timeout=30, trust_env=False, follow_redirects=False) as client:
            result = client.get('http://notepreso-translation-monitor:8020'+path, headers={'Authorization':'Bearer '+token})
        if result.status_code in (404,409):
            raise HTTPException(result.status_code, 'Translation artifact unavailable')
        if result.status_code != 200:
            raise ValueError('upstream unavailable')
        return result
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, 'Translation monitoring temporarily unavailable') from None

@browser_router.get('/admin/translator', response_class=HTMLResponse)
def admin_translator_page(request: Request):
    return _render_admin_page(request, 'translator')

@router.get('/translator')
def admin_translator_jobs(request: Request):
    _require_admin_api(request)
    data = _translation_fetch('/jobs').json()
    users = {str(u['subject']):u for u in _data_db(request).list_users(limit=10000)}
    for job in data['jobs']:
        user = users.get(job.get('owner'), {})
        job['owner_name'] = user.get('display_name') or user.get('username') or job.get('owner')
        job['owner_email'] = user.get('email')
    return data

@router.post('/translator/{job}/{artifact}')
def admin_translator_artifact(job: str, artifact: str, request: Request):
    from uuid import UUID
    from fastapi.responses import Response
    admin = _require_admin_api(request, mutate=True)
    try:
        if str(UUID(job)) != job: raise ValueError()
    except ValueError:
        raise HTTPException(404, 'Job not found')
    if artifact != 'report':
        raise HTTPException(404, 'Artifact not found')
    result = _translation_fetch('/jobs/'+job+'/'+artifact)
    _require_db(request).audit('admin_translation_download', owner=admin.owner_key, resource_type='translation', resource_id=job, metadata={'artifact':artifact})
    suffix = 'json' if artifact == 'report' else 'pptx'
    return Response(result.content, media_type=result.headers['content-type'], headers={'Content-Disposition':f'attachment; filename="translation-{job}-{artifact}.{suffix}"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
