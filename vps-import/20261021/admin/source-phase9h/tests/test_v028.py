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


def test_large_decks_are_not_rejected_by_slide_count():
    settings = Settings(openai_max_source_chars_per_job=1_000_000)
    deck = PresentationDeck(
        slide_count=72,
        slides=[SlideContent(number=i, texts=["hello"]) for i in range(1, 73)],
    )
    # Large decks are handled by the generator's small automatic batches.
    enforce_input_guardrails(
        full_deck=deck,
        target_deck=deck,
        options=GenerationOptions(use_vision=True),
        settings=settings,
    )


def test_source_context_guardrail_still_blocks_unsafe_jobs():
    settings = Settings(openai_max_source_chars_per_job=1000)
    deck = PresentationDeck(
        slide_count=2,
        slides=[SlideContent(number=1, texts=["x" * 800]), SlideContent(number=2, texts=["y" * 800])],
    )
    with pytest.raises(AIInputGuardrailError, match="Extracted slide content is too large"):
        enforce_input_guardrails(
            full_deck=deck,
            target_deck=deck,
            options=GenerationOptions(use_vision=True),
            settings=settings,
        )

def test_v100_public_pages_render():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        for path in ("/", "/how-to", "/legal", "/chat"):
            response = client.get(path)
            assert response.status_code == 200
        assert "white" not in client.get("/static/app.css").text[:20].lower() or client.get("/static/app.css").status_code == 200
        assert client.get("/api/v1/capabilities").json()["version"] == "1.0.0"


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
            prompt = kwargs["input"][-1]["content"]
            assert "CONTEXT MODE: EXACT SLIDE 2 ONLY" in prompt
            assert "SLIDE 2" in prompt
            assert "SLIDE 1\n" not in prompt
            assert "SLIDE 3\n" not in prompt
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
    assert result.referenced_slides == [2]
    assert service.history(job_dir)[-1]["role"] == "assistant"


def test_chat_natural_language_explicit_slide_is_exact(tmp_path: Path):
    from types import SimpleNamespace
    from app.services.chat import JobChatService

    class FakeResponses:
        def create(self, **kwargs):
            prompt = kwargs["input"][-1]["content"]
            assert "CONTEXT MODE: EXACT SLIDE 4 ONLY" in prompt
            assert "SLIDE 4\n" in prompt
            assert "SLIDE 2\n" not in prompt
            assert "SLIDE 3\n" not in prompt
            assert "SLIDE 5\n" not in prompt
            assert "SLIDE 6\n" not in prompt
            return SimpleNamespace(output_text="Slide 4 only.")

    fake_client = SimpleNamespace(responses=FakeResponses())
    settings = Settings(
        chat_max_message_chars=300,
        chat_max_turns_per_job=3,
        chat_max_context_slides=12,
        openai_chat_model="gpt-5.6-sol",
    )
    job_dir = tmp_path / "job-explicit"
    job_dir.mkdir()
    deck = PresentationDeck(
        slide_count=6,
        slides=[SlideContent(number=i, title=f"Slide {i}", texts=[f"Content {i}"]) for i in range(1, 7)],
    )
    (job_dir / "presentation.json").write_text(deck.model_dump_json(), encoding="utf-8")
    service = JobChatService(settings, client=fake_client)
    result = service.ask(job_dir=job_dir, message="Explain slide 4 in a student-friendly way")
    assert result.referenced_slides == [4]
    assert service.history(job_dir)[-2]["slide_number"] == 4



def test_chat_followup_same_slide_stays_exact(tmp_path: Path):
    from types import SimpleNamespace
    from app.services.chat import JobChatService

    prompts = []

    class FakeResponses:
        def create(self, **kwargs):
            prompts.append(kwargs["input"][-1]["content"])
            return SimpleNamespace(output_text="Answer")

    settings = Settings(
        chat_max_message_chars=400,
        chat_max_turns_per_job=4,
        chat_max_context_slides=12,
        openai_chat_model="gpt-5.6-sol",
    )
    job_dir = tmp_path / "followup-job"
    job_dir.mkdir()
    deck = PresentationDeck(
        slide_count=5,
        slides=[SlideContent(number=i, title=f"Slide {i}", texts=[f"Content {i}"]) for i in range(1, 6)],
    )
    (job_dir / "presentation.json").write_text(deck.model_dump_json(), encoding="utf-8")
    service = JobChatService(settings, client=SimpleNamespace(responses=FakeResponses()))

    first = service.ask(job_dir=job_dir, message="Explain this slide", slide_number=4)
    assert first.referenced_slides == [4]
    second = service.ask(
        job_dir=job_dir,
        message="Now explain the same slide in Indonesian for a first-year university student.",
    )
    assert second.referenced_slides == [4]
    assert "CONTEXT MODE: EXACT SLIDE 4 ONLY" in prompts[-1]
    assert "SLIDE 3\n" not in prompts[-1]
    assert "SLIDE 5\n" not in prompts[-1]


def test_general_chat_has_no_presentation_context(tmp_path: Path):
    from types import SimpleNamespace
    from app.services.chat import JobChatService

    captured = {}

    class FakeResponses:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_text="General answer")

    settings = Settings(
        chat_max_message_chars=400,
        chat_max_turns_per_job=4,
        openai_chat_model="gpt-5.6-sol",
    )
    service = JobChatService(settings, client=SimpleNamespace(responses=FakeResponses()))
    chat_dir = tmp_path / "general"
    result = service.ask_general(chat_dir=chat_dir, message="What is climate risk?")
    assert result.referenced_slides == []
    assert result.turn == 1
    assert "No PowerPoint presentation is currently selected" in captured["instructions"]
    assert "SLIDE " not in captured["input"][-1]["content"]
    assert service.history(chat_dir)[-1]["mode"] == "general"


def test_chat_message_limit_is_enforced_before_model_call(tmp_path: Path):
    from types import SimpleNamespace
    from app.services.chat import ChatLimitError, JobChatService

    class FailIfCalled:
        def create(self, **kwargs):
            raise AssertionError("OpenAI must not be called for an over-limit chat message")

    settings = Settings(
        chat_max_message_chars=100,
        chat_max_turns_per_job=4,
        openai_chat_model="gpt-5.6-sol",
    )
    service = JobChatService(settings, client=SimpleNamespace(responses=FailIfCalled()))
    with pytest.raises(ChatLimitError, match="Message is too long"):
        service.ask_general(chat_dir=tmp_path / "general-limit", message="x" * 101)


def test_chat_route_message_limit_helper_returns_422():
    from fastapi import HTTPException
    from app.api.chat_routes import _enforce_message_limit

    _enforce_message_limit("x" * 100, 100)
    with pytest.raises(HTTPException) as exc:
        _enforce_message_limit("x" * 101, 100)
    assert exc.value.status_code == 422
    assert "limit 100" in str(exc.value.detail)


def test_chat_page_does_not_silently_truncate_over_limit_input():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        html = client.get("/chat").text
        js = client.get("/static/chat.js").text
    assert 'data-max-message-chars="' in html
    assert 'id="chat-input" maxlength=' not in html
    assert "chatMessageTooLong" in js
    assert "msg.length>maxMessageChars" in js
