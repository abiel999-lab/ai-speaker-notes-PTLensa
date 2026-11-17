from __future__ import annotations

import base64
import hashlib
import hmac

import jwt
import json
import logging
import secrets
import time
from urllib.parse import quote

from fastapi import APIRouter, Form, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.core.auth import COOKIE_NAME, request_identity
from app.core.oidc import OidcExchangeError

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
logger = logging.getLogger("speaker_notes.auth")
browser_router = APIRouter(tags=["auth"])
OIDC_COOKIE_NAME = "asn_oidc_state"
OIDC_RETRY_COOKIE_NAME = "asn_oidc_retry"
ADMIN_OIDC_COOKIE_NAME = "asn_admin_oidc_state"
ADMIN_OIDC_RETRY_COOKIE_NAME = "asn_admin_oidc_retry"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=512)
    accept_terms: bool = False


class AuthStatus(BaseModel):
    authenticated: bool
    username: str | None = None
    display_name: str | None = None
    email: str | None = None
    csrf_token: str | None = None
    terms_version: str
    auth_enabled: bool
    auth_provider: str


class LogoutResponse(BaseModel):
    redirect_url: str


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode((value + "=" * (-len(value) % 4)).encode("ascii"))


def admin_restart_token(request: Request) -> str:
    """Short-lived signed token used by the unauthorized-admin restart form.

    This works even when the current browser has no valid application session.
    It prevents a third-party page from silently posting the logout/re-auth action.
    """
    secret = request.app.state.settings.session_secret
    if secret is None:
        raise RuntimeError("Session secret is not configured.")
    bucket = int(time.time()) // 300
    message = f"admin-restart:{bucket}".encode("utf-8")
    signature = _b64url(hmac.new(secret.get_secret_value().encode(), message, hashlib.sha256).digest())
    return f"{bucket}.{signature}"


def _verify_admin_restart_token(request: Request, token: str) -> bool:
    secret = request.app.state.settings.session_secret
    if secret is None or "." not in token:
        return False
    raw_bucket, signature = token.split(".", 1)
    try:
        bucket = int(raw_bucket)
    except ValueError:
        return False
    current = int(time.time()) // 300
    if bucket not in {current, current - 1}:
        return False
    message = f"admin-restart:{bucket}".encode("utf-8")
    expected = _b64url(hmac.new(secret.get_secret_value().encode(), message, hashlib.sha256).digest())
    return hmac.compare_digest(signature, expected)


def _oidc_cookie(request: Request, payload: dict[str, object]) -> str:
    secret = request.app.state.settings.session_secret
    if secret is None:
        raise RuntimeError("Session secret is not configured.")
    encoded = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64url(hmac.new(secret.get_secret_value().encode(), encoded.encode(), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def _parse_oidc_cookie(request: Request, cookie_name: str = OIDC_COOKIE_NAME) -> dict[str, object]:
    token = request.cookies.get(cookie_name, "")
    if "." not in token:
        raise HTTPException(status_code=400, detail="OIDC login state is missing.")
    encoded, signature = token.split(".", 1)
    secret = request.app.state.settings.session_secret
    if secret is None:
        raise HTTPException(status_code=503, detail="Session secret is unavailable.")
    expected = _b64url(hmac.new(secret.get_secret_value().encode(), encoded.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=400, detail="OIDC login state is invalid.")
    try:
        payload = json.loads(_b64url_decode(encoded))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="OIDC login state is invalid.") from exc
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=400, detail="OIDC login state has expired.")
    return payload


@router.get("/me", response_model=AuthStatus)
def me(request: Request) -> AuthStatus:
    settings = request.app.state.settings
    identity = request_identity(request)
    return AuthStatus(
        authenticated=identity is not None,
        username=identity.username if identity else None,
        display_name=identity.display_name if identity else None,
        email=identity.email if identity else None,
        csrf_token=identity.csrf if identity and settings.auth_enabled else None,
        terms_version=settings.terms_version,
        auth_enabled=settings.auth_enabled,
        auth_provider=settings.auth_provider,
    )


@router.post("/login", response_model=AuthStatus)
def login(request: Request, payload: LoginRequest, response: Response) -> AuthStatus:
    settings = request.app.state.settings
    if settings.keycloak_enabled:
        raise HTTPException(status_code=409, detail="Use Keycloak sign-in for this deployment.")
    if not settings.auth_enabled:
        raise HTTPException(status_code=409, detail="Login is disabled for this local deployment.")
    if not settings.auth_configured:
        raise HTTPException(status_code=503, detail="Login is enabled but server credentials are incomplete.")
    if settings.require_terms_acceptance and not payload.accept_terms:
        raise HTTPException(status_code=422, detail="You must accept the Terms of Use and Privacy Notice.")

    client_ip = request.client.host if request.client else "unknown"
    limiter = request.app.state.login_limiter
    limiter.check(client_ip)

    expected_password = settings.auth_password.get_secret_value() if settings.auth_password else ""
    valid_user = secrets.compare_digest(payload.username, settings.auth_username)
    valid_password = secrets.compare_digest(payload.password, expected_password)
    if not (valid_user and valid_password):
        limiter.failure(client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    limiter.success(client_ip)
    token, identity = request.app.state.session_manager.issue(
        settings.auth_username,
        terms_version=settings.terms_version,
        subject=settings.auth_username,
        display_name=settings.auth_username,
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        path="/",
    )
    return AuthStatus(
        authenticated=True,
        username=identity.username,
        display_name=identity.display_name,
        email=identity.email,
        csrf_token=identity.csrf,
        terms_version=settings.terms_version,
        auth_enabled=True,
        auth_provider=settings.auth_provider,
    )


def _begin_oidc_login(
    request: Request,
    *,
    oidc_client,
    return_to: str,
    cookie_name: str,
) -> RedirectResponse:
    settings = request.app.state.settings
    login_url, state = oidc_client.new_login(return_to)
    if cookie_name == ADMIN_OIDC_COOKIE_NAME:
        # Admin authentication is intentionally re-prompted even when the browser
        # already has a realm SSO session. Authorization still requires the admin role.
        login_url += ("&" if "?" in login_url else "?") + "prompt=login"
    cookie = _oidc_cookie(
        request,
        {"state": state.state, "verifier": state.verifier, "return_to": state.return_to, "exp": state.expires_at},
    )
    response = RedirectResponse(login_url, status_code=303)
    response.set_cookie(
        cookie_name,
        cookie,
        max_age=600,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        path="/",
    )
    return response


def begin_keycloak_login(request: Request, return_to: str = "/") -> RedirectResponse:
    """Start normal-user OIDC using the ai-speaker-notes client."""
    settings = request.app.state.settings
    if not settings.keycloak_enabled:
        return RedirectResponse("/login", status_code=303)
    if not return_to.startswith("/") or return_to.startswith("//"):
        return_to = "/"
    return _begin_oidc_login(
        request,
        oidc_client=request.app.state.oidc_client,
        return_to=return_to,
        cookie_name=OIDC_COOKIE_NAME,
    )


def begin_keycloak_admin_login(request: Request, return_to: str = "/admin") -> RedirectResponse:
    """Start administrator OIDC using the dedicated ai-speaker-admin-login client."""
    settings = request.app.state.settings
    if not settings.keycloak_enabled:
        return RedirectResponse("/login?return_to=/admin", status_code=303)
    oidc_client = getattr(request.app.state, "admin_oidc_client", None)
    if oidc_client is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Admin login is not configured. Set KEYCLOAK_ADMIN_LOGIN_CLIENT_ID and "
                "KEYCLOAK_ADMIN_LOGIN_CLIENT_SECRET, then restart the app."
            ),
        )
    if not return_to.startswith("/admin") or return_to.startswith("//"):
        return_to = "/admin"
    return _begin_oidc_login(
        request,
        oidc_client=oidc_client,
        return_to=return_to,
        cookie_name=ADMIN_OIDC_COOKIE_NAME,
    )


@browser_router.get("/auth/login")
def keycloak_login(request: Request, return_to: str = "/"):
    return begin_keycloak_login(request, return_to)


@browser_router.get("/auth/admin/login")
def keycloak_admin_login(request: Request, return_to: str = "/admin"):
    return begin_keycloak_admin_login(request, return_to)


def _roles_from(source: dict, client_id: str) -> list[str]:
    realm_roles = source.get("realm_access", {}).get("roles", []) if isinstance(source.get("realm_access"), dict) else []
    resource_access = source.get("resource_access", {}) if isinstance(source.get("resource_access"), dict) else {}
    client_access = resource_access.get(client_id, {}) if isinstance(resource_access, dict) else {}
    client_roles = client_access.get("roles", []) if isinstance(client_access, dict) else []
    return [str(role) for role in [*(realm_roles or []), *(client_roles or [])] if str(role).strip()]


def _complete_keycloak_callback(
    request: Request,
    *,
    code: str,
    state: str,
    oidc_client,
    cookie_name: str,
    retry_cookie_name: str,
    admin_flow: bool,
):
    settings = request.app.state.settings
    stored = _parse_oidc_cookie(request, cookie_name)
    if not hmac.compare_digest(str(stored.get("state", "")), state):
        raise HTTPException(status_code=400, detail="OIDC state mismatch.")
    try:
        tokens = oidc_client.exchange(code=code, verifier=str(stored["verifier"]))
    except OidcExchangeError as exc:
        detail = str(exc)
        stale_code = exc.error_code == "invalid_grant" and "code not valid" in detail.casefold()
        if stale_code:
            return_to = str(stored.get("return_to") or ("/admin" if admin_flow else "/"))
            if admin_flow:
                if not return_to.startswith("/admin") or return_to.startswith("//"):
                    return_to = "/admin"
            elif not return_to.startswith("/") or return_to.startswith("//"):
                return_to = "/"
            already_retried = request.cookies.get(retry_cookie_name) == "1"
            if not already_retried:
                response = (
                    begin_keycloak_admin_login(request, return_to)
                    if admin_flow
                    else begin_keycloak_login(request, return_to)
                )
                response.set_cookie(
                    retry_cookie_name,
                    "1",
                    max_age=60,
                    httponly=True,
                    secure=settings.app_env == "production",
                    samesite="lax",
                    path="/",
                )
                return response
            target = "/auth/admin/callback" if admin_flow else "/auth/callback"
            response = JSONResponse(
                status_code=400,
                content={
                    "detail": (
                        "Keycloak rejected a fresh authorization code. "
                        f"Start a new login; do not refresh {target}."
                    )
                },
            )
            response.delete_cookie(cookie_name, path="/auth")
            response.delete_cookie(retry_cookie_name, path="/auth")
            return response
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc

    access_token = str(tokens.get("access_token", ""))
    if not access_token:
        raise HTTPException(status_code=502, detail="Identity provider did not return an access token.")
    try:
        access_claims = oidc_client.validate_access_token(access_token)
        profile = oidc_client.userinfo(access_token)
    except jwt.ImmatureSignatureError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Keycloak token time is ahead of this computer. Synchronize the Windows/VPS clock, "
                "or temporarily increase KEYCLOAK_CLOCK_SKEW_SECONDS (recommended <= 120), then login again."
            ),
        ) from exc
    except jwt.PyJWTError as exc:
        # A freshly issued token can fail locally when the browser/app is carrying
        # stale OIDC state or the cached Keycloak signing keys just rotated. Retry
        # the complete authorization flow once instead of leaving the browser on
        # a dead callback page. The OIDC client itself already forces one JWKS
        # refresh before this branch is reached.
        already_retried = request.cookies.get(retry_cookie_name) == "1"
        return_to = str(stored.get("return_to") or ("/admin" if admin_flow else "/"))
        if not already_retried:
            response = (
                begin_keycloak_admin_login(request, return_to)
                if admin_flow
                else begin_keycloak_login(request, return_to)
            )
            response.set_cookie(
                retry_cookie_name,
                "1",
                max_age=60,
                httponly=True,
                secure=settings.app_env == "production",
                samesite="lax",
                path="/",
            )
            return response
        raise HTTPException(
            status_code=502,
            detail=(
                "Keycloak issued a token that could not be validated after a fresh sign-in. "
                "The local OIDC state has been cleared; start sign-in again."
            ),
        ) from exc
    except RuntimeError as exc:
        # Authorization/client-binding failures are not silently accepted. A stale
        # local flow gets one clean restart, then surfaces a safe diagnostic.
        already_retried = request.cookies.get(retry_cookie_name) == "1"
        return_to = str(stored.get("return_to") or ("/admin" if admin_flow else "/"))
        if not already_retried and "token" in str(exc).casefold():
            response = (
                begin_keycloak_admin_login(request, return_to)
                if admin_flow
                else begin_keycloak_login(request, return_to)
            )
            response.set_cookie(
                retry_cookie_name,
                "1",
                max_age=60,
                httponly=True,
                secure=settings.app_env == "production",
                samesite="lax",
                path="/",
            )
            return response
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    token_subject = str(access_claims.get("sub") or "")
    profile_subject = str(profile.get("sub") or "")
    if not token_subject or profile_subject != token_subject:
        raise HTTPException(status_code=502, detail="Keycloak user identity did not match the validated access token.")

    subject = token_subject
    username = str(
        profile.get("preferred_username")
        or profile.get("email")
        or access_claims.get("preferred_username")
        or access_claims.get("email")
        or subject
    )
    email_value = profile.get("email") or access_claims.get("email")
    email = str(email_value) if email_value else None
    display_name = str(profile.get("name") or access_claims.get("name") or username)
    roles = tuple(sorted(set(_roles_from(access_claims, oidc_client.client_id))))

    # A normal realm user may authenticate successfully against the admin OIDC
    # client, but must never receive an administrator application session unless
    # the signed Keycloak role is present. Send them to a dedicated recovery page
    # instead of a raw JSON 403 response. Their existing user-app session is kept
    # until they explicitly choose to sign out and try a different admin account.
    if admin_flow and settings.admin_role not in roles:
        if request.app.state.db is not None:
            request.app.state.db.audit(
                "admin_login_denied",
                owner=subject,
                resource_type="session",
                metadata={"username": username, "required_role": settings.admin_role},
            )
        response = RedirectResponse("/admin/unauthorized", status_code=303)
        response.delete_cookie(cookie_name, path="/auth")
        response.delete_cookie(retry_cookie_name, path="/auth")
        return response

    if request.app.state.db is not None:
        try:
            request.app.state.db.upsert_user(
                subject=subject,
                username=username,
                email=email,
                display_name=display_name,
            )
            request.app.state.db.audit("admin_login" if admin_flow else "login", owner=subject, resource_type="session")
        except Exception:
            # Identity establishment must not fail with a 500 merely because the
            # auxiliary admin/audit database had a transient issue. API pages can
            # surface DB health separately after the signed session is established.
            logger.exception("oidc_login_persistence_failed admin_flow=%s subject=%s", admin_flow, subject)

    token, _ = request.app.state.session_manager.issue(
        username,
        terms_version=settings.terms_version,
        subject=subject,
        email=email,
        display_name=display_name,
        roles=roles,
    )
    response = RedirectResponse(str(stored.get("return_to") or ("/admin" if admin_flow else "/")), status_code=303)
    response.delete_cookie(cookie_name, path="/auth")
    response.delete_cookie(retry_cookie_name, path="/auth")
    # OIDC callbacks arrive from a different site (Keycloak). A Strict session
    # cookie can be withheld during the redirect chain, causing /admin or / to
    # immediately start a new login even though token exchange succeeded. Lax
    # is appropriate for a top-level OAuth/OIDC GET callback; mutating API
    # requests remain protected by the signed session and CSRF token.
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        path="/",
    )
    return response




def _provider_error_page(request: Request, *, admin_flow: bool):
    # Use the existing signed admin restart flow; never reflect provider input.
    action = ('<form method="post" action="/auth/admin/restart"><input type="hidden" name="restart_token" value="' + admin_restart_token(request) + '"><button type="submit">Start sign-in again</button></form>') if admin_flow else '<a href="/auth/login">Start sign-in again</a>'
    response = HTMLResponse(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Sign in again | NotePreso</title><h1>Sign-in could not be completed</h1><p>Please start a fresh sign-in to continue.</p>' + action + '</html>',
        status_code=400, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )
    response.delete_cookie(ADMIN_OIDC_COOKIE_NAME if admin_flow else OIDC_COOKIE_NAME, path="/")
    return response


@browser_router.get("/auth/callback")
def keycloak_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    if error is not None or not code or not state:
        return _provider_error_page(request, admin_flow=False)
    settings = request.app.state.settings
    if not settings.keycloak_enabled:
        raise HTTPException(status_code=404, detail="Keycloak login is not enabled.")
    return _complete_keycloak_callback(
        request,
        code=code,
        state=state,
        oidc_client=request.app.state.oidc_client,
        cookie_name=OIDC_COOKIE_NAME,
        retry_cookie_name=OIDC_RETRY_COOKIE_NAME,
        admin_flow=False,
    )


@browser_router.get("/auth/admin/callback")
def keycloak_admin_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    if error is not None or not code or not state:
        return _provider_error_page(request, admin_flow=True)
    settings = request.app.state.settings
    if not settings.keycloak_enabled:
        raise HTTPException(status_code=404, detail="Keycloak login is not enabled.")
    oidc_client = getattr(request.app.state, "admin_oidc_client", None)
    if oidc_client is None:
        raise HTTPException(status_code=503, detail="Admin login is not configured.")
    return _complete_keycloak_callback(
        request,
        code=code,
        state=state,
        oidc_client=oidc_client,
        cookie_name=ADMIN_OIDC_COOKIE_NAME,
        retry_cookie_name=ADMIN_OIDC_RETRY_COOKIE_NAME,
        admin_flow=True,
    )


@browser_router.post("/auth/admin/restart")
def restart_admin_login(request: Request, restart_token: str = Form(...)):
    """Clear local auth + realm SSO, then require a fresh admin login.

    This is intentionally separate from the normal user logout button. It is used
    only after an authenticated Keycloak account lacks the configured admin role.
    """
    settings = request.app.state.settings
    if not _verify_admin_restart_token(request, restart_token):
        raise HTTPException(status_code=403, detail="Admin sign-in restart token is invalid or expired.")

    identity = request_identity(request)
    if request.app.state.db is not None:
        request.app.state.db.audit(
            "admin_reauthentication_requested",
            owner=identity.owner_key if identity else None,
            resource_type="session",
        )

    admin_oidc_client = getattr(request.app.state, "admin_oidc_client", None)
    if settings.keycloak_enabled and admin_oidc_client is not None:
        post_logout = f"{settings.public_base_url.rstrip('/')}/admin"
        redirect_url = admin_oidc_client.logout_url(post_logout_redirect_uri=post_logout)
    else:
        redirect_url = "/admin"

    response = RedirectResponse(redirect_url, status_code=303)
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie(OIDC_COOKIE_NAME, path="/auth")
    response.delete_cookie(OIDC_RETRY_COOKIE_NAME, path="/auth")
    response.delete_cookie(ADMIN_OIDC_COOKIE_NAME, path="/auth")
    response.delete_cookie(ADMIN_OIDC_RETRY_COOKIE_NAME, path="/auth")
    response.delete_cookie(OIDC_COOKIE_NAME, path="/")
    response.delete_cookie(OIDC_RETRY_COOKIE_NAME, path="/")
    response.delete_cookie(ADMIN_OIDC_COOKIE_NAME, path="/")
    response.delete_cookie(ADMIN_OIDC_RETRY_COOKIE_NAME, path="/")
    return response


def _clear_auth_cookies(response: Response, settings) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie(OIDC_COOKIE_NAME, path="/auth")
    response.delete_cookie(OIDC_RETRY_COOKIE_NAME, path="/auth")
    response.delete_cookie(ADMIN_OIDC_COOKIE_NAME, path="/auth")
    response.delete_cookie(ADMIN_OIDC_RETRY_COOKIE_NAME, path="/auth")
    response.delete_cookie(OIDC_COOKIE_NAME, path="/")
    response.delete_cookie(OIDC_RETRY_COOKIE_NAME, path="/")
    response.delete_cookie(ADMIN_OIDC_COOKIE_NAME, path="/")
    response.delete_cookie(ADMIN_OIDC_RETRY_COOKIE_NAME, path="/")


@browser_router.post("/auth/admin/logout")
def browser_admin_logout(request: Request, csrf_token: str = Form(...)):
    """Reliable browser-driven admin logout that does not depend on dashboard JavaScript."""
    settings = request.app.state.settings
    identity = request_identity(request)
    if identity is None or not hmac.compare_digest(csrf_token or "", identity.csrf):
        raise HTTPException(status_code=403, detail="Invalid CSRF token.")
    if request.app.state.db is not None:
        try:
            request.app.state.db.audit("admin_logout", owner=identity.owner_key, resource_type="session")
        except Exception:
            logger.exception("admin_logout_audit_failed subject=%s", identity.owner_key)
    admin_oidc_client = getattr(request.app.state, "admin_oidc_client", None)
    if settings.keycloak_enabled and admin_oidc_client is not None:
        post_logout = f"{settings.public_base_url.rstrip('/')}/admin"
        redirect_url = admin_oidc_client.logout_url(post_logout_redirect_uri=post_logout)
    else:
        redirect_url = "/admin"
    response = RedirectResponse(redirect_url, status_code=303)
    _clear_auth_cookies(response, settings)
    return response


@router.post("/admin/logout", response_model=LogoutResponse)
def admin_logout(request: Request, response: Response) -> LogoutResponse:
    """Logout the dedicated admin OIDC client and clear every local auth cookie.

    The admin dashboard must not use the normal ai-speaker-notes logout client;
    mixing those two RP sessions was the source of stale callback/token state after
    an administrator signed out and immediately signed in again.
    """
    settings = request.app.state.settings
    identity = request_identity(request)
    if request.app.state.db is not None and identity is not None:
        try:
            request.app.state.db.audit("admin_logout", owner=identity.owner_key, resource_type="session")
        except Exception:
            logger.exception("admin_logout_audit_failed subject=%s", identity.owner_key)
    _clear_auth_cookies(response, settings)
    admin_oidc_client = getattr(request.app.state, "admin_oidc_client", None)
    if settings.keycloak_enabled and admin_oidc_client is not None:
        post_logout = f"{settings.public_base_url.rstrip('/')}/admin"
        redirect_url = admin_oidc_client.logout_url(post_logout_redirect_uri=post_logout)
    else:
        redirect_url = "/admin"
    return LogoutResponse(redirect_url=redirect_url)


@router.post("/logout", response_model=LogoutResponse)
def logout(request: Request, response: Response) -> LogoutResponse:
    settings = request.app.state.settings
    identity = request_identity(request)
    if request.app.state.db is not None and identity is not None:
        try:
            request.app.state.db.audit("logout", owner=identity.owner_key, resource_type="session")
        except Exception:
            logger.exception("logout_audit_failed subject=%s", identity.owner_key)
    _clear_auth_cookies(response, settings)
    redirect_url = request.app.state.oidc_client.logout_url() if settings.keycloak_enabled else "/login"
    return LogoutResponse(redirect_url=redirect_url)
