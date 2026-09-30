from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.core.auth import COOKIE_NAME, request_identity

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
browser_router = APIRouter(tags=["auth"])
OIDC_COOKIE_NAME = "asn_oidc_state"


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


def _oidc_cookie(request: Request, payload: dict[str, object]) -> str:
    secret = request.app.state.settings.session_secret
    if secret is None:
        raise RuntimeError("Session secret is not configured.")
    encoded = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64url(hmac.new(secret.get_secret_value().encode(), encoded.encode(), hashlib.sha256).digest())
    return f"{encoded}.{signature}"


def _parse_oidc_cookie(request: Request) -> dict[str, object]:
    token = request.cookies.get(OIDC_COOKIE_NAME, "")
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
        samesite="lax",
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


@browser_router.get("/auth/login")
def keycloak_login(request: Request, return_to: str = "/"):
    settings = request.app.state.settings
    if not settings.keycloak_enabled:
        return RedirectResponse("/login", status_code=303)
    if not return_to.startswith("/") or return_to.startswith("//"):
        return_to = "/"
    login_url, state = request.app.state.oidc_client.new_login(return_to)
    cookie = _oidc_cookie(
        request,
        {"state": state.state, "verifier": state.verifier, "return_to": state.return_to, "exp": state.expires_at},
    )
    response = RedirectResponse(login_url, status_code=303)
    response.set_cookie(
        OIDC_COOKIE_NAME,
        cookie,
        max_age=600,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        path="/auth",
    )
    return response


@browser_router.get("/auth/callback")
def keycloak_callback(request: Request, code: str, state: str):
    settings = request.app.state.settings
    if not settings.keycloak_enabled:
        raise HTTPException(status_code=404, detail="Keycloak login is not enabled.")
    stored = _parse_oidc_cookie(request)
    if not hmac.compare_digest(str(stored.get("state", "")), state):
        raise HTTPException(status_code=400, detail="OIDC state mismatch.")
    tokens = request.app.state.oidc_client.exchange(code=code, verifier=str(stored["verifier"]))
    id_token = str(tokens.get("id_token", ""))
    if not id_token:
        raise HTTPException(status_code=502, detail="Identity provider did not return an ID token.")
    claims = request.app.state.oidc_client.validate_id_token(id_token)
    subject = str(claims["sub"])
    username = str(claims.get("preferred_username") or claims.get("email") or subject)
    email = str(claims.get("email")) if claims.get("email") else None
    display_name = str(claims.get("name") or username)

    if request.app.state.db is not None:
        request.app.state.db.upsert_user(
            subject=subject,
            username=username,
            email=email,
            display_name=display_name,
        )
        request.app.state.db.ensure_subscription(subject)
        request.app.state.db.audit("login", owner=subject, resource_type="session")

    token, _ = request.app.state.session_manager.issue(
        username,
        terms_version=settings.terms_version,
        subject=subject,
        email=email,
        display_name=display_name,
    )
    response = RedirectResponse(str(stored.get("return_to") or "/"), status_code=303)
    response.delete_cookie(OIDC_COOKIE_NAME, path="/auth")
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


@router.post("/logout", response_model=LogoutResponse)
def logout(request: Request, response: Response) -> LogoutResponse:
    settings = request.app.state.settings
    identity = request_identity(request)
    if request.app.state.db is not None and identity is not None:
        request.app.state.db.audit("logout", owner=identity.owner_key, resource_type="session")
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        secure=settings.app_env == "production",
        httponly=True,
        samesite="lax",
    )
    redirect_url = request.app.state.oidc_client.logout_url() if settings.keycloak_enabled else "/login"
    return LogoutResponse(redirect_url=redirect_url)
