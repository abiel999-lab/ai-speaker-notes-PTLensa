from __future__ import annotations

from datetime import UTC, datetime

from fastapi import FastAPI, Request
from starlette.testclient import TestClient

from app.core.auth import SessionManager, is_admin_identity
from app.core.config import Settings
from app.core.database import DatabaseManager
from app.core.keycloak_admin import KeycloakAdminClient


def test_session_roundtrip_preserves_keycloak_roles():
    manager = SessionManager("x" * 48)
    token, issued = manager.issue(
        "admin.user",
        terms_version="2026-09-21",
        subject="kc-123",
        email="admin@example.com",
        display_name="Admin User",
        roles=("user", "admin"),
    )
    parsed = manager.parse(token)
    assert parsed is not None
    assert parsed.subject == "kc-123"
    assert parsed.roles == ("admin", "user")
    assert issued.roles == ("admin", "user")


def test_database_ban_and_delete_tombstone_blocks_user():
    db = DatabaseManager("sqlite+pysqlite:///:memory:")
    db.init_schema()
    db.upsert_user(subject="user-1", username="u1", email=None, display_name="User One")
    assert db.is_user_blocked("user-1") is False
    db.set_user_banned("user-1", True)
    assert db.is_user_blocked("user-1") is True
    db.set_user_banned("user-1", False)
    assert db.is_user_blocked("user-1") is False
    db.soft_delete_user("user-1")
    assert db.is_user_blocked("user-1") is True
    assert db.list_users() == []


def test_keycloak_admin_base_is_derived_for_root_and_auth_prefix():
    assert (
        KeycloakAdminClient._derive_admin_base(
            "https://identity.example.com/realms/aispeaker"
        )
        == "https://identity.example.com/admin/realms/aispeaker"
    )
    assert (
        KeycloakAdminClient._derive_admin_base(
            "https://identity.example.com/auth/realms/aispeaker"
        )
        == "https://identity.example.com/auth/admin/realms/aispeaker"
    )


def test_admin_access_requires_keycloak_admin_role_only():
    settings = Settings(auth_enabled=False, admin_role="admin")
    app = FastAPI()
    app.state.settings = settings

    @app.get("/")
    def check(request: Request):
        username_only = type(
            "Identity",
            (),
            {"roles": (), "subject": "sub-1", "username": "admin.user"},
        )()
        role_admin = type(
            "Identity",
            (),
            {"roles": ("user", "admin"), "subject": "sub-2", "username": "ordinary.user"},
        )()
        return {
            "username_only": is_admin_identity(request, username_only),
            "role_admin": is_admin_identity(request, role_admin),
        }

    with TestClient(app) as client:
        assert client.get("/").json() == {"username_only": False, "role_admin": True}


def test_admin_api_create_ban_unban_delete_with_fake_keycloak(tmp_path):
    from app.api.admin_routes import router as admin_router
    from app.core.auth import COOKIE_NAME
    from app.core.keycloak_admin import KeycloakUser

    class FakeKeycloak:
        def __init__(self):
            self.users = {}

        def list_users(self, *, max_users=1000):
            return list(self.users.values())[:max_users]

        def get_user(self, user_id):
            return self.users[user_id]

        def create_user(self, **kwargs):
            user = KeycloakUser(
                id="user-1",
                username=kwargs["username"],
                email=kwargs.get("email"),
                first_name=kwargs.get("first_name"),
                last_name=kwargs.get("last_name"),
                enabled=True,
                email_verified=kwargs.get("email_verified", False),
                created_timestamp=1_700_000_000_000,
            )
            self.users[user.id] = user
            return user

        def update_user(self, user_id, **kwargs):
            old = self.users[user_id]
            user = KeycloakUser(
                id=user_id,
                username=kwargs["username"],
                email=kwargs.get("email"),
                first_name=kwargs.get("first_name"),
                last_name=kwargs.get("last_name"),
                enabled=old.enabled,
                email_verified=kwargs.get("email_verified", False),
                created_timestamp=old.created_timestamp,
            )
            self.users[user_id] = user
            return user

        def set_enabled(self, user_id, enabled):
            old = self.users[user_id]
            user = KeycloakUser(
                id=user_id,
                username=old.username,
                email=old.email,
                first_name=old.first_name,
                last_name=old.last_name,
                enabled=enabled,
                email_verified=old.email_verified,
                created_timestamp=old.created_timestamp,
            )
            self.users[user_id] = user
            return user

        def delete_user(self, user_id):
            self.users.pop(user_id, None)

    class FakeStore:
        def delete(self, _job_id):
            return None

    settings = Settings(
        auth_enabled=True,
        auth_provider="keycloak",
        session_secret="s" * 48,
        public_base_url="http://testserver",
        keycloak_issuer="https://identity.example.com/realms/aispeaker",
        keycloak_client_id="ai-speaker-notes",
        keycloak_client_secret="oidc-secret",
        admin_role="admin",
        require_terms_acceptance=False,
        storage_dir=tmp_path / "jobs",
    )
    db = DatabaseManager(f"sqlite+pysqlite:///{tmp_path / 'admin.db'}")
    db.init_schema()
    app = FastAPI()
    app.state.settings = settings
    app.state.db = db
    app.state.session_manager = SessionManager(settings.session_secret.get_secret_value())
    app.state.keycloak_admin = FakeKeycloak()
    app.state.store = FakeStore()
    app.include_router(admin_router)

    token, identity = app.state.session_manager.issue(
        "admin.user",
        terms_version=settings.terms_version,
        subject="admin-sub",
        display_name="Admin",
        roles=("admin",),
    )
    headers = {"X-CSRF-Token": identity.csrf}
    with TestClient(app) as client:
        client.cookies.set(COOKIE_NAME, token)
        created = client.post(
            "/api/v1/admin/users",
            headers=headers,
            json={
                "username": "new.user",
                "email": "new.user@example.com",
                "first_name": "New",
                "last_name": "User",
                "password": "temporary-pass-123",
                "temporary_password": True,
                "email_verified": False,
            },
        )
        assert created.status_code == 201
        assert created.json()["user"]["username"] == "new.user"

        banned = client.post("/api/v1/admin/users/user-1/ban", headers=headers)
        assert banned.status_code == 200
        assert banned.json()["user"]["banned"] is True

        unbanned = client.post("/api/v1/admin/users/user-1/unban", headers=headers)
        assert unbanned.status_code == 200
        assert unbanned.json()["user"]["banned"] is False

        deleted = client.delete("/api/v1/admin/users/user-1", headers=headers)
        assert deleted.status_code == 200
        assert deleted.json()["deleted"] is True


def test_admin_database_exposes_saved_chat_for_same_user(tmp_path):
    from app.core.database import DatabaseChatHistoryStore

    db = DatabaseManager(f"sqlite+pysqlite:///{tmp_path / 'chat-admin.db'}")
    db.init_schema()
    db.upsert_user(subject="user-chat", username="chat.user", email="chat@example.com", display_name="Chat User")
    history = DatabaseChatHistoryStore(db)
    history.save(
        [
            {"role": "user", "content": "Explain slide 3"},
            {"role": "assistant", "content": "Slide 3 explains the process."},
        ],
        owner="user-chat",
        scope_key="job-123",
        mode="rag",
        job_id="job-123",
    )

    threads = db.list_chat_threads_for_owner("user-chat")
    assert len(threads) == 1
    assert threads[0]["job_id"] == "job-123"
    assert threads[0]["message_count"] == 2
    assert "messages" not in threads[0]
    revealed = db.get_chat_thread(threads[0]["id"], include_messages=True)
    assert revealed is not None
    assert [item["role"] for item in revealed["messages"]] == ["user", "assistant"]
    assert db.admin_counts()["chat_threads"] == 1
    assert db.admin_counts()["chat_messages"] == 2


def test_keycloak_placeholder_secret_is_not_considered_configured():
    settings = Settings(
        auth_enabled=True,
        auth_provider="keycloak",
        session_secret="s" * 48,
        public_base_url="http://127.0.0.1:8001",
        keycloak_issuer="https://identity.example.com/realms/aispeaker",
        keycloak_client_id="ai-speaker-notes",
        keycloak_client_secret="CHANGE_ME_FROM_KEYCLOAK_CLIENT_CREDENTIALS",
    )
    assert settings.auth_configured is False


def test_admin_database_global_activity_lists_jobs_and_chat(tmp_path):
    from app.core.database import DatabaseChatHistoryStore, JobRow

    db = DatabaseManager(f"sqlite+pysqlite:///{tmp_path / 'activity-admin.db'}")
    db.init_schema()
    db.upsert_user(subject="user-activity", username="activity.user", email="activity@example.com", display_name="Activity User")
    now = datetime.now(UTC)
    with db.session() as session:
        session.add(
            JobRow(
                id="job-activity",
                owner="user-activity",
                status="completed",
                created_at=now,
                updated_at=now,
                payload={"original_filename": "activity.pptx"},
            )
        )
        session.commit()

    history = DatabaseChatHistoryStore(db)
    history.save(
        [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi there"}],
        owner="user-activity",
        scope_key="general",
        mode="general",
        job_id=None,
    )

    jobs = db.list_jobs()
    chats = db.list_chat_threads()
    assert jobs[0]["owner"] == "user-activity"
    assert jobs[0]["id"] == "job-activity"
    assert chats[0]["owner"] == "user-activity"
    assert chats[0]["message_count"] == 2
    assert "last_message_preview" not in chats[0]



def test_admin_chat_content_reveal_requires_reason_and_writes_audit(tmp_path):
    from app.api.admin_routes import router as admin_router
    from app.core.auth import COOKIE_NAME
    from app.core.database import DatabaseChatHistoryStore

    settings = Settings(
        auth_enabled=True,
        auth_provider="keycloak",
        session_secret="s" * 48,
        public_base_url="http://testserver",
        keycloak_issuer="https://identity.example.com/realms/aispeaker",
        keycloak_client_id="ai-speaker-notes",
        keycloak_client_secret="oidc-secret",
        admin_role="admin",
        require_terms_acceptance=False,
        storage_dir=tmp_path / "jobs",
    )
    db = DatabaseManager(f"sqlite+pysqlite:///{tmp_path / 'privacy-admin.db'}")
    db.init_schema()
    db.upsert_user(subject="target-user", username="target.user", email="target@example.com", display_name="Target User")
    history = DatabaseChatHistoryStore(db)
    history.save(
        [
            {"role": "user", "content": "Private question"},
            {"role": "assistant", "content": "Private answer"},
        ],
        owner="target-user",
        scope_key="general",
        mode="general",
    )
    thread_id = db.list_chat_threads_for_owner("target-user")[0]["id"]

    app = FastAPI()
    app.state.settings = settings
    app.state.db = db
    app.state.session_manager = SessionManager(settings.session_secret.get_secret_value())
    app.include_router(admin_router)
    token, identity = app.state.session_manager.issue(
        "admin.user",
        terms_version=settings.terms_version,
        subject="admin-sub",
        display_name="Admin",
        roles=("admin",),
    )
    headers = {"X-CSRF-Token": identity.csrf}

    with TestClient(app) as client:
        client.cookies.set(COOKIE_NAME, token)
        invalid = client.post(
            f"/api/v1/admin/chat-threads/{thread_id}/reveal",
            headers=headers,
            json={"reason": "curiosity"},
        )
        assert invalid.status_code == 422

        metadata = client.get("/api/v1/admin/activity?owner=target-user")
        assert metadata.status_code == 200
        metadata_chat = metadata.json()["chats"][0]
        assert metadata_chat["message_count"] == 2
        assert metadata_chat["content_locked"] is True
        assert "messages" not in metadata_chat

        revealed = client.post(
            f"/api/v1/admin/chat-threads/{thread_id}/reveal",
            headers=headers,
            json={"reason": "customer_support", "note": "User asked support to inspect the thread."},
        )
        assert revealed.status_code == 200
        body = revealed.json()
        assert body["access"]["audited"] is True
        assert body["access"]["reason"] == "customer_support"
        assert [item["content"] for item in body["thread"]["messages"]] == ["Private question", "Private answer"]

    events = db.list_audit_events(action="admin_chat_content_accessed")
    assert len(events) == 1
    assert events[0]["owner"] == "admin-sub"
    assert events[0]["resource_id"] == str(thread_id)
    assert events[0]["metadata"]["target_owner"] == "target-user"
    assert events[0]["metadata"]["reason"] == "customer_support"
