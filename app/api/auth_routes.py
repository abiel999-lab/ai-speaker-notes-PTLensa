from __future__ import annotations

import secrets

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.core.auth import COOKIE_NAME, request_identity

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=512)
    accept_terms: bool = False


class AuthStatus(BaseModel):
    authenticated: bool
    username: str | None = None
    csrf_token: str | None = None
    terms_version: str
    auth_enabled: bool


@router.get("/me", response_model=AuthStatus)
def me(request: Request) -> AuthStatus:
    settings = request.app.state.settings
    identity = request_identity(request)
    return AuthStatus(
        authenticated=identity is not None,
        username=identity.username if identity else None,
        csrf_token=identity.csrf if identity and settings.auth_enabled else None,
        terms_version=settings.terms_version,
        auth_enabled=settings.auth_enabled,
    )


@router.post("/login", response_model=AuthStatus)
def login(request: Request, payload: LoginRequest, response: Response) -> AuthStatus:
    settings = request.app.state.settings
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
        csrf_token=identity.csrf,
        terms_version=settings.terms_version,
        auth_enabled=True,
    )


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> Response:
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        secure=request.app.state.settings.app_env == "production",
        httponly=True,
        samesite="strict",
    )
    return response
