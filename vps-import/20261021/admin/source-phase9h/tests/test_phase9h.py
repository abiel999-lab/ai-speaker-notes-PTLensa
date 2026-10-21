from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api.admin_routes import router
from app.core.config import Settings
from app.core.presentation_admin import fetch_presentation_admin_metrics
from app.core.auth import SessionManager, COOKIE_NAME

API_URL = "http://actia-presentation-app:4310/api/internal/admin/metrics"
TOKEN = "a" * 64


def test_9h_requires_explicit_private_api_url_and_secret():
    assert not Settings(presentation_admin_api_url="https://example.com/", presentation_admin_api_secret=SecretStr(TOKEN)).presentation_admin_configured
    assert not Settings(presentation_admin_api_url=API_URL, presentation_admin_api_secret=SecretStr("short")).presentation_admin_configured
    assert Settings(presentation_admin_api_url=API_URL, presentation_admin_api_secret=SecretStr(TOKEN)).presentation_admin_configured


def test_9h_non_admin_denied_before_any_upstream_call(monkeypatch):
    from app.api import admin_routes
    called=[]
    def fake(_settings):
        called.append(True)
        return {"schemaVersion":1}
    monkeypatch.setattr(admin_routes,"fetch_presentation_admin_metrics",fake)
    app=FastAPI()
    settings=Settings(auth_enabled=True,session_secret=SecretStr("x"*48))
    app.state.settings=settings
    app.state.session_manager=SessionManager("x"*48)
    app.include_router(router)
    with TestClient(app) as client:
        r=client.get("/api/v1/admin/presentation-ai")
        assert r.status_code in (401,403)
        assert not called


def test_9h_admin_can_fetch_without_browser_exposure(monkeypatch):
    from app.api import admin_routes
    monkeypatch.setattr(admin_routes,"fetch_presentation_admin_metrics",lambda _settings:{"schemaVersion":1,"counts":{"generations":2},"recent":[],"users":[]})
    app=FastAPI()
    settings=Settings(auth_enabled=True,session_secret=SecretStr("x"*48))
    app.state.settings=settings
    app.state.session_manager=SessionManager("x"*48)
    app.include_router(router)
    token,_=app.state.session_manager.issue("admin",terms_version=settings.terms_version,subject="admin1",roles=("admin",))
    with TestClient(app) as client:
        client.cookies.set(COOKIE_NAME,token)
        r=client.get("/api/v1/admin/presentation-ai")
        assert r.status_code==200
        assert r.json()["counts"]["generations"]==2


def test_9h_upstream_failure_is_generic(monkeypatch):
    def fail(*args,**kwargs):
        raise httpx.ConnectError("potential secret in upstream detail")
    monkeypatch.setattr(httpx.Client,"get",fail)
    with pytest.raises(Exception) as exc:
        fetch_presentation_admin_metrics(Settings(presentation_admin_api_url=API_URL,presentation_admin_api_secret=SecretStr(TOKEN)))
    assert "secret" not in str(exc.value)
