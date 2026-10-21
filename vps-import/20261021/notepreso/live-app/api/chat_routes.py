from __future__ import annotations

from pathlib import Path
import hashlib
import time
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.routes import _owned_job, _reject_cross_site_browser_request, _require_api_access
from app.core.entitlements import PlanLimitError
from app.domain.models import JobStatus
from app.services.chat import ChatBusyError, ChatLimitError

router = APIRouter(prefix="/api/v1/jobs", tags=["chat"])
general_router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20_000)
    slide_number: int | None = Field(default=None, ge=1, le=10_000)


class ChatResponse(BaseModel):
    answer: str
    model: str
    turn: int
    referenced_slides: list[int]


def _enforce_message_limit(message: str, limit: int) -> None:
    if len(message) > limit:
        raise HTTPException(
            status_code=422,
            detail=f"Message is too long ({len(message)} characters; limit {limit}).",
        )


def _processing_state(history: list[dict[str, object]]) -> tuple[bool, str | None]:
    for item in reversed(history):
        if item.get("role") == "assistant" and item.get("status") in {"queued", "processing"}:
            request_id = item.get("request_id")
            return True, str(request_id) if request_id else None
    return False, None


def _general_chat_dir(request: Request) -> Path:
    identity = _require_api_access(request)
    key = hashlib.sha256(identity.owner_key.encode("utf-8")).hexdigest()[:24]
    directory = Path(request.app.state.settings.storage_dir) / "_general_chat" / key
    history_file = directory / "chat.json"
    retention_seconds = request.app.state.settings.job_retention_hours * 3600
    if history_file.exists() and time.time() - history_file.stat().st_mtime > retention_seconds:
        try:
            history_file.unlink()
        except OSError:
            pass
    return directory


@general_router.get("")
def general_chat_history(request: Request) -> dict[str, object]:
    _reject_cross_site_browser_request(request)
    directory = _general_chat_dir(request)
    service = request.app.state.chat_service
    identity = _require_api_access(request)
    history = service.history(directory, owner=identity.owner_key, mode="general", scope_key="general") if service else []
    turns = sum(1 for item in history if item.get("role") == "user")
    processing, active_request_id = _processing_state(history)
    return {
        "messages": history,
        "turns": turns,
        "max_turns": request.app.state.settings.chat_max_turns_per_job,
        "processing": processing,
        "active_request_id": active_request_id,
    }


@general_router.post("", response_model=ChatResponse)
def general_chat(request: Request, payload: ChatRequest) -> ChatResponse:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    settings = request.app.state.settings
    _enforce_message_limit(payload.message, settings.chat_max_message_chars)
    if not settings.openai_configured or request.app.state.chat_service is None:
        raise HTTPException(status_code=503, detail="Chat AI is unavailable because OpenAI is not configured.")
    try:
        request.app.state.entitlements.reserve_chat_message(identity.owner_key)
    except PlanLimitError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    try:
        result = request.app.state.chat_service.ask_general(
            chat_dir=_general_chat_dir(request),
            message=payload.message,
            owner=identity.owner_key,
        )
    except ChatBusyError as exc:
        request.app.state.entitlements.release_chat_message(identity.owner_key)
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ChatLimitError as exc:
        request.app.state.entitlements.release_chat_message(identity.owner_key)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        request.app.state.entitlements.release_chat_message(identity.owner_key)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception:
        request.app.state.entitlements.release_chat_message(identity.owner_key)
        raise
    return ChatResponse(
        answer=result.answer,
        model=result.model,
        turn=result.turn,
        referenced_slides=[],
    )


@general_router.delete("", status_code=204)
def clear_general_chat(request: Request):
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    service = request.app.state.chat_service
    if service:
        chat_dir = _general_chat_dir(request)
        history = service.history(chat_dir, owner=identity.owner_key, mode="general", scope_key="general")
        processing, _ = _processing_state(history)
        if processing:
            raise HTTPException(status_code=409, detail="Wait for the active AI response to finish before clearing chat.")
        service.clear(chat_dir, owner=identity.owner_key, mode="general", scope_key="general")
    return None


@router.get("/{job_id}/chat")
def chat_history(request: Request, job_id: UUID) -> dict[str, object]:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request)
    job = _owned_job(request, str(job_id))
    service = request.app.state.chat_service
    history = service.history(
        Path(job.input_path).parent, owner=identity.owner_key, mode="rag", scope_key=str(job_id), job_id=str(job_id)
    ) if service else []
    turns = sum(1 for item in history if item.get("role") == "user")
    processing, active_request_id = _processing_state(history)
    return {
        "messages": history,
        "turns": turns,
        "max_turns": request.app.state.settings.chat_max_turns_per_job,
        "processing": processing,
        "active_request_id": active_request_id,
    }


@router.post("/{job_id}/chat", response_model=ChatResponse)
def chat(request: Request, job_id: UUID, payload: ChatRequest) -> ChatResponse:
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    job = _owned_job(request, str(job_id))
    settings = request.app.state.settings
    _enforce_message_limit(payload.message, settings.chat_max_message_chars)
    if not settings.openai_configured or request.app.state.chat_service is None:
        raise HTTPException(status_code=503, detail="Chat AI is unavailable because OpenAI is not configured.")
    if job.status != JobStatus.completed:
        raise HTTPException(status_code=409, detail="Chat AI becomes available after the presentation job is completed.")
    try:
        request.app.state.entitlements.reserve_chat_message(identity.owner_key)
    except PlanLimitError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    try:
        result = request.app.state.chat_service.ask(
            job_dir=Path(job.input_path).parent,
            message=payload.message,
            slide_number=payload.slide_number,
            owner=identity.owner_key,
            job_id=str(job_id),
            model=job.options.model.value,
        )
    except ChatBusyError as exc:
        request.app.state.entitlements.release_chat_message(identity.owner_key)
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ChatLimitError as exc:
        request.app.state.entitlements.release_chat_message(identity.owner_key)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        request.app.state.entitlements.release_chat_message(identity.owner_key)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception:
        request.app.state.entitlements.release_chat_message(identity.owner_key)
        raise
    return ChatResponse(
        answer=result.answer,
        model=result.model,
        turn=result.turn,
        referenced_slides=result.referenced_slides,
    )


@router.delete("/{job_id}/chat", status_code=204)
def clear_chat(request: Request, job_id: UUID):
    _reject_cross_site_browser_request(request)
    identity = _require_api_access(request, mutate=True)
    job = _owned_job(request, str(job_id))
    service = request.app.state.chat_service
    if service:
        job_dir = Path(job.input_path).parent
        history = service.history(job_dir, owner=identity.owner_key, mode="rag", scope_key=str(job_id), job_id=str(job_id))
        processing, _ = _processing_state(history)
        if processing:
            raise HTTPException(status_code=409, detail="Wait for the active AI response to finish before clearing chat.")
        service.clear(job_dir, owner=identity.owner_key, mode="rag", scope_key=str(job_id))
    return None
