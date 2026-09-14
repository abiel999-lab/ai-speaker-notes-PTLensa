from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.api.routes import _owned_job, _reject_cross_site_browser_request, _require_api_access
from app.domain.models import JobStatus
from app.services.chat import ChatLimitError

router = APIRouter(prefix="/api/v1/jobs", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20_000)
    slide_number: int | None = Field(default=None, ge=1, le=10_000)


class ChatResponse(BaseModel):
    answer: str
    model: str
    turn: int
    referenced_slides: list[int]


@router.get("/{job_id}/chat")
def chat_history(request: Request, job_id: UUID) -> dict[str, object]:
    _reject_cross_site_browser_request(request)
    _require_api_access(request)
    job = _owned_job(request, str(job_id))
    service = request.app.state.chat_service
    history = service.history(Path(job.input_path).parent) if service else []
    turns = sum(1 for item in history if item.get("role") == "user")
    return {
        "messages": history,
        "turns": turns,
        "max_turns": request.app.state.settings.chat_max_turns_per_job,
    }


@router.post("/{job_id}/chat", response_model=ChatResponse)
def chat(request: Request, job_id: UUID, payload: ChatRequest) -> ChatResponse:
    _reject_cross_site_browser_request(request)
    _require_api_access(request, mutate=True)
    job = _owned_job(request, str(job_id))
    settings = request.app.state.settings
    if not settings.openai_configured or request.app.state.chat_service is None:
        raise HTTPException(status_code=503, detail="Chat AI is unavailable because OpenAI is not configured.")
    if job.status != JobStatus.completed:
        raise HTTPException(status_code=409, detail="Chat AI becomes available after the presentation job is completed.")
    try:
        result = request.app.state.chat_service.ask(
            job_dir=Path(job.input_path).parent,
            message=payload.message,
            slide_number=payload.slide_number,
        )
    except ChatLimitError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ChatResponse(
        answer=result.answer,
        model=result.model,
        turn=result.turn,
        referenced_slides=result.referenced_slides,
    )


@router.delete("/{job_id}/chat", status_code=204)
def clear_chat(request: Request, job_id: UUID):
    _reject_cross_site_browser_request(request)
    _require_api_access(request, mutate=True)
    job = _owned_job(request, str(job_id))
    service = request.app.state.chat_service
    if service:
        service.clear(Path(job.input_path).parent)
    return None
