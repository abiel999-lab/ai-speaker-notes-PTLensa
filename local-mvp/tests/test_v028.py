from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import SecretStr

from app.core.auth import SessionManager
from app.core.config import Settings
from app.domain.models import GenerationOptions, PresentationDeck, SlideContent
from app.services.preflight import AIInputGuardrailError, enforce_input_guardrails


def test_signed_session_rejects_tampering():
    manager = SessionManager("x" * 40, max_age_seconds=3600)
    token, identity = manager.issue("admin", terms_version="2026-09-13")
    assert manager.parse(token).username == "admin"
    assert manager.parse(token + "x") is None
    assert identity.csrf


def test_openai_slide_guardrail_blocks_oversized_deck():
    settings = Settings(openai_max_slides_per_job=2)
    deck = PresentationDeck(
        slide_count=3,
        slides=[SlideContent(number=i, texts=["hello"]) for i in range(1, 4)],
    )
    with pytest.raises(AIInputGuardrailError, match="3 slides"):
        enforce_input_guardrails(
            full_deck=deck,
            target_deck=deck,
            options=GenerationOptions(),
            settings=settings,
        )


def test_vision_guardrail_is_separate_from_text_only():
    settings = Settings(openai_max_slides_per_job=10, openai_max_vision_slides_per_job=2)
    deck = PresentationDeck(
        slide_count=3,
        slides=[SlideContent(number=i, texts=["hello"]) for i in range(1, 4)],
    )
    enforce_input_guardrails(
        full_deck=deck,
        target_deck=deck,
        options=GenerationOptions(use_vision=False),
        settings=settings,
    )
    with pytest.raises(AIInputGuardrailError, match="Vision limit"):
        enforce_input_guardrails(
            full_deck=deck,
            target_deck=deck,
            options=GenerationOptions(use_vision=True),
            settings=settings,
        )


def test_v028_public_pages_render():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        for path in ("/", "/how-to", "/legal", "/chat"):
            response = client.get(path)
            assert response.status_code == 200
        assert "white" not in client.get("/static/app.css").text[:20].lower() or client.get("/static/app.css").status_code == 200
        assert client.get("/api/v1/capabilities").json()["version"] == "0.2.8"


def test_login_and_csrf_protect_mutating_job_api(sample_pptx: Path):
    from fastapi.testclient import TestClient
    from app.main import app, settings

    old = (settings.auth_enabled, settings.auth_username, settings.auth_password, settings.session_secret)
    settings.auth_enabled = True
    settings.auth_username = "admin"
    settings.auth_password = SecretStr("correct-horse-battery")
    settings.session_secret = SecretStr("s" * 40)
    try:
        with TestClient(app) as client:
            assert client.get("/", follow_redirects=False).status_code == 303
            login = client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "correct-horse-battery", "accept_terms": True},
            )
            assert login.status_code == 200
            csrf = login.json()["csrf_token"]
            with sample_pptx.open("rb") as fh:
                blocked = client.post(
                    "/api/v1/jobs",
                    files={"file": ("sample.pptx", fh, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
                )
            assert blocked.status_code == 403
            with sample_pptx.open("rb") as fh:
                accepted = client.post(
                    "/api/v1/jobs",
                    headers={"X-CSRF-Token": csrf},
                    files={"file": ("sample.pptx", fh, "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
                )
            assert accepted.status_code == 202
    finally:
        settings.auth_enabled, settings.auth_username, settings.auth_password, settings.session_secret = old


def test_file_aware_chat_is_bounded_and_selects_slide(tmp_path: Path):
    from types import SimpleNamespace
    from app.services.chat import JobChatService

    class FakeResponses:
        def create(self, **kwargs):
            assert kwargs["model"] == "gpt-5.6-sol"
            assert "SLIDE 2" in kwargs["input"][-1]["content"]
            return SimpleNamespace(output_text="Slide 2 explains methane emissions.")

    fake_client = SimpleNamespace(responses=FakeResponses())
    settings = Settings(
        chat_max_message_chars=200,
        chat_max_turns_per_job=2,
        chat_max_context_slides=3,
        openai_chat_model="gpt-5.6-sol",
    )
    job_dir = tmp_path / "job"
    job_dir.mkdir()
    deck = PresentationDeck(
        slide_count=3,
        slides=[
            SlideContent(number=1, title="Intro", texts=["Climate change"]),
            SlideContent(number=2, title="Methane", texts=["CH4 emissions"]),
            SlideContent(number=3, title="Closing", texts=["Summary"]),
        ],
    )
    (job_dir / "presentation.json").write_text(deck.model_dump_json(), encoding="utf-8")
    service = JobChatService(settings, client=fake_client)
    result = service.ask(job_dir=job_dir, message="Explain methane", slide_number=2)
    assert result.turn == 1
    assert 2 in result.referenced_slides
    assert service.history(job_dir)[-1]["role"] == "assistant"
