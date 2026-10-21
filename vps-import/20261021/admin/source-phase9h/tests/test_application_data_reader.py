from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import create_engine, text

from app.core.application_data import ApplicationDataReader


def test_reader_supports_legacy_application_schema_without_admin_columns(tmp_path: Path):
    url = f"sqlite+pysqlite:///{tmp_path / 'legacy.db'}"
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE users (subject TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT, display_name TEXT, created_at TIMESTAMP NOT NULL, last_login_at TIMESTAMP NOT NULL)"
        )
        conn.exec_driver_sql(
            "CREATE TABLE jobs (id TEXT PRIMARY KEY, owner TEXT, status TEXT NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL, payload JSON NOT NULL)"
        )
        conn.exec_driver_sql(
            "CREATE TABLE chat_threads (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, scope_key TEXT NOT NULL, mode TEXT NOT NULL, job_id TEXT, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL)"
        )
        conn.exec_driver_sql(
            "CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id INTEGER NOT NULL, ordinal INTEGER NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, payload JSON NOT NULL, created_at TIMESTAMP NOT NULL)"
        )
        conn.execute(text("INSERT INTO users VALUES ('u1','alice','alice@example.com','Alice',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
        conn.execute(
            text("INSERT INTO jobs VALUES ('j1','u1','completed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,:payload)"),
            {"payload": json.dumps({"original_filename": "deck.pptx", "model": "gpt-5.6-sol"})},
        )
        conn.execute(text("INSERT INTO chat_threads(owner,scope_key,mode,job_id,created_at,updated_at) VALUES ('u1','j1','rag','j1',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
        thread_id = conn.execute(text("SELECT id FROM chat_threads LIMIT 1")).scalar_one()
        conn.execute(
            text("INSERT INTO chat_messages(thread_id,ordinal,role,content,payload,created_at) VALUES (:tid,0,'user','hello',:payload,CURRENT_TIMESTAMP)"),
            {"tid": thread_id, "payload": json.dumps({"role": "user", "content": "hello"})},
        )

    reader = ApplicationDataReader(url)
    assert reader.healthcheck() is True
    users = reader.list_users()
    assert users[0]["subject"] == "u1"
    assert users[0]["is_banned"] is False
    assert users[0]["deleted_at"] is None
    assert reader.admin_counts()["jobs"] == 1
    assert reader.admin_counts()["chat_threads"] == 1
    assert reader.user_job_counts() == {"u1": 1}
    jobs = reader.list_jobs_for_owner("u1")
    assert jobs[0]["payload"]["original_filename"] == "deck.pptx"
    threads = reader.list_chat_threads_for_owner("u1")
    assert threads[0]["message_count"] == 1
    revealed = reader.get_chat_thread(threads[0]["id"], include_messages=True)
    assert revealed is not None
    assert revealed["messages"][0]["content"] == "hello"

    users_snapshot, job_counts, counts = reader.directory_snapshot(limit=5000)
    assert users_snapshot[0]["subject"] == "u1"
    assert job_counts == {"u1": 1}
    assert counts["users"] == 1
    assert counts["jobs"] == 1

    activity = reader.activity_snapshot()
    assert len(activity["users"]) == 1
    assert len(activity["jobs"]) == 1
    assert len(activity["chats"]) == 1
    assert activity["chats"][0]["message_count"] == 1
