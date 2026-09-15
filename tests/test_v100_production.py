from __future__ import annotations

from pathlib import Path

from app.core.auth import SessionManager
from app.core.config import Settings
from app.core.database import DatabaseChatHistoryStore, DatabaseManager
from app.core.oidc import KeycloakOidcClient
from app.core.postgres_job_store import PostgresJobStore
from app.domain.models import GenerationOptions, JobRecord


def test_session_identity_uses_oidc_subject_as_owner_key():
    manager = SessionManager("x" * 48)
    token, issued = manager.issue(
        "alice",
        terms_version="2026-09-14",
        subject="kc-user-123",
        email="alice@example.com",
        display_name="Alice",
    )
    parsed = manager.parse(token)
    assert parsed is not None
    assert parsed.owner_key == "kc-user-123"
    assert parsed.email == "alice@example.com"
    assert parsed.display_name == "Alice"
    assert issued.owner_key == "kc-user-123"


def test_sqlite_database_job_and_chat_persistence(tmp_path: Path):
    db = DatabaseManager(f"sqlite:///{tmp_path / 'test.db'}")
    db.init_schema()
    store = PostgresJobStore(tmp_path / "jobs", db)

    job_dir = tmp_path / "jobs" / "owner" / "job-1"
    job_dir.mkdir(parents=True)
    input_path = job_dir / "input.pptx"
    input_path.write_bytes(b"placeholder")
    job = JobRecord(
        id="job-1",
        original_filename="deck.pptx",
        owner="owner-sub",
        options=GenerationOptions(),
        input_path=str(input_path),
    )
    store.save(job)
    loaded = store.get("job-1")
    assert loaded.owner == "owner-sub"
    assert store.list_recent(owner="owner-sub")[0].id == "job-1"
    assert store.list_recent(owner="other") == []

    history_store = DatabaseChatHistoryStore(db)
    history = [
        {"role": "user", "content": "hello", "turn": 1},
        {"role": "assistant", "content": "hi", "turn": 1, "referenced_slides": []},
    ]
    history_store.save(history, owner="owner-sub", scope_key="general", mode="general")
    assert history_store.load(owner="owner-sub", scope_key="general", mode="general") == history
    assert history_store.load(owner="other", scope_key="general", mode="general") == []
    history_store.clear(owner="owner-sub", scope_key="general", mode="general")
    assert history_store.load(owner="owner-sub", scope_key="general", mode="general") == []


def test_keycloak_authorization_url_uses_pkce_and_exact_callback(monkeypatch):
    settings = Settings(
        auth_enabled=True,
        auth_provider="keycloak",
        session_secret="x" * 48,
        public_base_url="https://aispeakernote.lensalingkungantech.com",
        keycloak_issuer="https://aispeakernote.lensalingkungantech.com/auth/realms/ai-speaker-notes",
        keycloak_client_id="ai-speaker-notes",
        keycloak_client_secret="secret-value",
    )
    client = KeycloakOidcClient(settings)
    monkeypatch.setattr(
        client,
        "discovery",
        lambda: {
            "authorization_endpoint": "https://aispeakernote.lensalingkungantech.com/auth/realms/ai-speaker-notes/protocol/openid-connect/auth"
        },
    )
    url, state = client.new_login("/chat")
    assert "code_challenge=" in url
    assert "code_challenge_method=S256" in url
    assert "redirect_uri=https%3A%2F%2Faispeakernote.lensalingkungantech.com%2Fauth%2Fcallback" in url
    assert state.return_to == "/chat"
