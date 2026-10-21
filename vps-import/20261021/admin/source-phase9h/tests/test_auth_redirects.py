from __future__ import annotations

import re
import time

from fastapi import FastAPI
from starlette.testclient import TestClient

from app.api.admin_routes import browser_router as admin_browser_router
from app.api.auth_routes import OIDC_COOKIE_NAME, browser_router as auth_browser_router, router as auth_router
from app.core.auth import SessionManager
from app.core.config import Settings
from app.core.oidc import OidcExchangeError, OidcLoginState
import jwt


class FakeOidcClient:
    def __init__(self, client_id: str = "ai-speaker-notes", *, roles=("user",)):
        self.client_id = client_id
        self.fail_exchange = False
        self.fail_validation_once = False
        self.roles = tuple(roles)

    def new_login(self, return_to: str):
        return (
            f"https://identity.example.com/realms/aispeaker/protocol/openid-connect/auth?client_id={self.client_id}",
            OidcLoginState(
                state="state-123",
                verifier="verifier-123",
                return_to=return_to,
                expires_at=int(time.time()) + 600,
            ),
        )

    def exchange(self, *, code: str, verifier: str):
        if self.fail_exchange:
            raise OidcExchangeError(
                "Keycloak token exchange failed: Code not valid",
                status_code=502,
                error_code="invalid_grant",
            )
        return {"id_token": "id", "access_token": "access"}

    def validate_access_token(self, token: str):
        if self.fail_validation_once:
            self.fail_validation_once = False
            raise jwt.InvalidSignatureError("stale signing key")
        return {
            "sub": "admin-sub",
            "preferred_username": "admin.user",
            "realm_access": {"roles": list(self.roles)},
            "azp": self.client_id,
        }

    def userinfo(self, token: str):
        return {"sub": "admin-sub", "preferred_username": "admin.user", "name": "Admin User"}

    def logout_url(self, post_logout_redirect_uri: str | None = None):
        target = post_logout_redirect_uri or "http://127.0.0.1:8001/"
        return (
            "https://identity.example.com/realms/aispeaker/protocol/openid-connect/logout"
            f"?client_id={self.client_id}&post_logout_redirect_uri={target}"
        )


def make_app() -> FastAPI:
    settings = Settings(
        auth_enabled=True,
        auth_provider="keycloak",
        session_secret="s" * 48,
        public_base_url="http://127.0.0.1:8001",
        keycloak_issuer="https://identity.example.com/realms/aispeaker",
        keycloak_client_id="ai-speaker-notes",
        keycloak_client_secret="oidc-secret",
        keycloak_admin_login_client_id="ai-speaker-admin-login",
        keycloak_admin_login_client_secret="admin-login-secret",
        admin_role="admin",
        require_terms_acceptance=False,
    )
    app = FastAPI()
    app.state.settings = settings
    app.state.session_manager = SessionManager(settings.session_secret.get_secret_value())
    app.state.oidc_client = FakeOidcClient()
    app.state.admin_oidc_client = FakeOidcClient("ai-speaker-admin-login", roles=("admin",))
    app.state.keycloak_admin = None
    app.state.db = None
    app.include_router(auth_router)
    app.include_router(auth_browser_router)
    app.include_router(admin_browser_router)
    return app


def test_auth_login_redirects_straight_to_keycloak_and_sets_state_cookie():
    app = make_app()
    with TestClient(app) as client:
        response = client.get("/auth/login?return_to=/", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"].startswith("https://identity.example.com/")
    assert OIDC_COOKIE_NAME in response.headers.get("set-cookie", "")


def test_admin_without_session_redirects_straight_to_keycloak():
    app = make_app()
    with TestClient(app) as client:
        response = client.get("/admin", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"].startswith("https://identity.example.com/")
    assert "client_id=ai-speaker-admin-login" in response.headers["location"]
    assert "prompt=login" in response.headers["location"]
    assert "asn_admin_oidc_state" in response.headers.get("set-cookie", "")


def test_admin_callback_requires_admin_role():
    app = make_app()
    app.state.admin_oidc_client = FakeOidcClient("ai-speaker-admin-login", roles=("user",))
    with TestClient(app) as client:
        start = client.get("/admin", follow_redirects=False)
        assert start.status_code == 303
        callback = client.get(
            "/auth/admin/callback?code=fresh&state=state-123",
            follow_redirects=False,
        )
        assert callback.status_code == 303
        assert callback.headers["location"] == "/admin/unauthorized"

        page = client.get("/admin/unauthorized", follow_redirects=False)
    assert page.status_code == 403
    assert "Administrator permission is required" in page.text
    assert "Sign in with another admin account" in page.text
    assert "restart_token" in page.text


def test_unauthorized_admin_restart_clears_local_session_and_logs_out_keycloak():
    app = make_app()
    app.state.admin_oidc_client = FakeOidcClient("ai-speaker-admin-login", roles=("user",))
    with TestClient(app) as client:
        page = client.get("/admin/unauthorized", follow_redirects=False)
        match = re.search(r'name="restart_token" value="([^"]+)"', page.text)
        assert match is not None
        response = client.post(
            "/auth/admin/restart",
            data={"restart_token": match.group(1)},
            follow_redirects=False,
        )
    assert response.status_code == 303
    assert response.headers["location"].startswith(
        "https://identity.example.com/realms/aispeaker/protocol/openid-connect/logout"
    )
    assert "client_id=ai-speaker-admin-login" in response.headers["location"]
    assert "post_logout_redirect_uri=http://127.0.0.1:8001/admin" in response.headers["location"]
    set_cookie = response.headers.get("set-cookie", "")
    assert "asn_session=" in set_cookie


def test_admin_callback_issues_session_for_admin_role():
    app = make_app()
    with TestClient(app) as client:
        start = client.get("/admin", follow_redirects=False)
        assert start.status_code == 303
        callback = client.get(
            "/auth/admin/callback?code=fresh&state=state-123",
            follow_redirects=False,
        )
    assert callback.status_code == 303
    assert callback.headers["location"] == "/admin"
    set_cookie = callback.headers.get("set-cookie", "")
    assert "asn_session=" in set_cookie
    assert "samesite=lax" in set_cookie.casefold()


def test_user_oidc_callback_session_cookie_is_lax():
    app = make_app()
    with TestClient(app) as client:
        start = client.get("/auth/login?return_to=/", follow_redirects=False)
        assert start.status_code == 303
        callback = client.get(
            "/auth/callback?code=fresh&state=state-123",
            follow_redirects=False,
        )
    assert callback.status_code == 303
    set_cookie = callback.headers.get("set-cookie", "")
    assert "asn_session=" in set_cookie
    assert "samesite=lax" in set_cookie.casefold()


def test_stale_keycloak_callback_restarts_oidc_once():
    app = make_app()
    app.state.oidc_client.fail_exchange = True
    with TestClient(app) as client:
        start = client.get("/auth/login?return_to=/admin", follow_redirects=False)
        assert start.status_code == 303
        callback = client.get(
            "/auth/callback?code=already-used&state=state-123",
            follow_redirects=False,
        )
    assert callback.status_code == 303
    assert callback.headers["location"].startswith("https://identity.example.com/")
    assert "asn_oidc_retry=1" in callback.headers.get("set-cookie", "")


def test_repeated_invalid_grant_stops_retry_loop():
    app = make_app()
    app.state.oidc_client.fail_exchange = True
    with TestClient(app) as client:
        client.get("/auth/login?return_to=/admin", follow_redirects=False)
        first = client.get(
            "/auth/callback?code=already-used&state=state-123",
            follow_redirects=False,
        )
        assert first.status_code == 303
        # The first recovery created a fresh signed state cookie. The fake client
        # always uses state-123, so a second callback can exercise the loop guard.
        second = client.get(
            "/auth/callback?code=still-invalid&state=state-123",
            follow_redirects=False,
        )
    assert second.status_code == 400
    assert "do not refresh /auth/callback" in second.json()["detail"]


def test_unauthorized_page_returns_to_configured_user_app():
    app = make_app()
    with TestClient(app) as client:
        page = client.get("/admin/unauthorized", follow_redirects=False)
    assert page.status_code == 403
    assert 'href="https://aispeakernote.lensalingkungantech.com/"' in page.text



def test_admin_logout_uses_dedicated_admin_client_and_clears_session():
    app = make_app()
    with TestClient(app) as client:
        response = client.post("/api/v1/auth/admin/logout", follow_redirects=False)
    assert response.status_code == 200
    payload = response.json()
    assert "client_id=ai-speaker-admin-login" in payload["redirect_url"]
    assert "post_logout_redirect_uri=http://127.0.0.1:8001/admin" in payload["redirect_url"]
    assert "asn_session=" in response.headers.get("set-cookie", "")


def test_token_validation_failure_restarts_login_once():
    app = make_app()
    app.state.admin_oidc_client.fail_validation_once = True
    with TestClient(app) as client:
        client.get("/admin", follow_redirects=False)
        callback = client.get(
            "/auth/admin/callback?code=fresh&state=state-123",
            follow_redirects=False,
        )
    assert callback.status_code == 303
    assert "client_id=ai-speaker-admin-login" in callback.headers["location"]
    assert "asn_admin_oidc_retry=1" in callback.headers.get("set-cookie", "")
