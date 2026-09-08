from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class JobStatus(StrEnum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Language(StrEnum):
    id = "Bahasa Indonesia"
    en = "English"


class Audience(StrEnum):
    general = "Umum"
    management = "Manajemen"
    technical = "Teknis"
    regulator = "Regulator"


class Depth(StrEnum):
    concise = "Ringkas"
    standard = "Standar"
    deep = "Mendalam"


class NotesMode(StrEnum):
    """Controls how generated notes interact with speaker notes already in the deck."""

    missing_only = "missing_only"
    replace_all = "replace_all"
    append = "append"


class GenerationEngine(StrEnum):
    dummy = "dummy"
    openai = "openai"


class GenerationOptions(BaseModel):
    language: Language = Language.id
    audience: Audience = Audience.general
    depth: Depth = Depth.standard
    notes_mode: NotesMode = NotesMode.missing_only
    engine: GenerationEngine = GenerationEngine.dummy
    use_vision: bool = False


class SlideContent(BaseModel):
    number: int
    title: str | None = None
    texts: list[str] = Field(default_factory=list)
    tables: list[list[list[str]]] = Field(default_factory=list)
    has_existing_notes: bool = False


class PresentationDeck(BaseModel):
    slide_count: int
    slides: list[SlideContent]

    @property
    def existing_notes_count(self) -> int:
        return sum(1 for slide in self.slides if slide.has_existing_notes)


class TokenUsage(BaseModel):
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0

    def add(self, other: "TokenUsage") -> None:
        self.input_tokens += other.input_tokens
        self.cached_input_tokens += other.cached_input_tokens
        self.output_tokens += other.output_tokens
        self.total_tokens += other.total_tokens


class NotesGenerationResult(BaseModel):
    notes: dict[int, str] = Field(default_factory=dict)
    provider: str = "dummy"
    model: str | None = None
    prompt_version: str | None = None
    usage: TokenUsage = Field(default_factory=TokenUsage)
    request_count: int = 0
    used_vision: bool = False
    resumed_slide_count: int = 0
    recovered_slide_count: int = 0
    warnings: list[str] = Field(default_factory=list)


class PipelineResult(BaseModel):
    deck: PresentationDeck
    existing_notes_count: int
    generated_notes_count: int
    preserved_existing_notes_count: int
    provider: str = "dummy"
    model: str | None = None
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float | None = None
    request_count: int = 0
    used_vision: bool = False
    vision_renderer: str | None = None
    preflight_estimated_cost_usd: float | None = None
    resumed_slide_count: int = 0
    recovered_slide_count: int = 0
    warnings: list[str] = Field(default_factory=list)


class JobRecord(BaseModel):
    id: str
    status: JobStatus = JobStatus.queued
    original_filename: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    progress_current: int = 0
    progress_total: int = 0
    message: str = "Queued"
    options: GenerationOptions
    input_path: str
    output_path: str | None = None
    error: str | None = None
    existing_notes_count: int = 0
    generated_notes_count: int = 0
    preserved_existing_notes_count: int = 0
    provider: str = "dummy"
    model: str | None = None
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float | None = None
    request_count: int = 0
    used_vision: bool = False
    vision_renderer: str | None = None
    preflight_estimated_cost_usd: float | None = None
    resumed_slide_count: int = 0
    recovered_slide_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    attempt_count: int = 0

    def touch(self) -> None:
        self.updated_at = datetime.now(UTC)


class JobPublic(BaseModel):
    id: str
    status: JobStatus
    original_filename: str
    created_at: datetime
    updated_at: datetime
    progress_current: int
    progress_total: int
    message: str
    error: str | None = None
    download_url: str | None = None
    notes_mode: NotesMode
    engine: GenerationEngine
    existing_notes_count: int = 0
    generated_notes_count: int = 0
    preserved_existing_notes_count: int = 0
    provider: str = "dummy"
    model: str | None = None
    input_tokens: int = 0
    cached_input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float | None = None
    request_count: int = 0
    used_vision: bool = False
    vision_renderer: str | None = None
    preflight_estimated_cost_usd: float | None = None
    resumed_slide_count: int = 0
    recovered_slide_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    attempt_count: int = 0

    @classmethod
    def from_record(cls, job: JobRecord) -> "JobPublic":
        download_url = None
        if job.status == JobStatus.completed and job.output_path:
            download_url = f"/api/v1/jobs/{job.id}/download"
        return cls(
            id=job.id,
            status=job.status,
            original_filename=job.original_filename,
            created_at=job.created_at,
            updated_at=job.updated_at,
            progress_current=job.progress_current,
            progress_total=job.progress_total,
            message=job.message,
            error=job.error,
            download_url=download_url,
            notes_mode=job.options.notes_mode,
            engine=job.options.engine,
            existing_notes_count=job.existing_notes_count,
            generated_notes_count=job.generated_notes_count,
            preserved_existing_notes_count=job.preserved_existing_notes_count,
            provider=job.provider,
            model=job.model,
            input_tokens=job.input_tokens,
            cached_input_tokens=job.cached_input_tokens,
            output_tokens=job.output_tokens,
            total_tokens=job.total_tokens,
            estimated_cost_usd=job.estimated_cost_usd,
            request_count=job.request_count,
            used_vision=job.used_vision,
            vision_renderer=job.vision_renderer,
            preflight_estimated_cost_usd=job.preflight_estimated_cost_usd,
            resumed_slide_count=job.resumed_slide_count,
            recovered_slide_count=job.recovered_slide_count,
            warnings=job.warnings,
            attempt_count=job.attempt_count,
        )
