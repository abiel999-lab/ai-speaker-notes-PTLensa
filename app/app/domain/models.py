from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator


class JobStatus(StrEnum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class Language(StrEnum):
    """Accepted speaker-notes languages; values also persist in saved jobs."""
    id = "Bahasa Indonesia"
    en = "English"
    zh_cn = "Chinese (Simplified)"
    zh_tw = "Chinese (Traditional)"
    ja = "Japanese"
    ko = "Korean"
    ar = "Arabic"
    fr = "French"
    de = "German"
    es = "Spanish"
    pt = "Portuguese"
    ru = "Russian"
    it = "Italian"
    nl = "Dutch"
    tr = "Turkish"
    hi = "Hindi"
    bn = "Bengali"
    ur = "Urdu"
    pa = "Punjabi"
    ta = "Tamil"
    te = "Telugu"
    mr = "Marathi"
    vi = "Vietnamese"
    th = "Thai"
    ms = "Malay"
    fil = "Filipino"
    uk = "Ukrainian"
    pl = "Polish"
    cs = "Czech"
    ro = "Romanian"
    hu = "Hungarian"
    el = "Greek"
    sv = "Swedish"
    da = "Danish"
    no = "Norwegian"
    fi = "Finnish"
    he = "Hebrew"
    fa = "Persian"
    sw = "Swahili"
    su = "Sundanese"
    jv = "Javanese"
    ace = "Acehnese"
    mad = "Madurese"
    mak = "Makassarese"
    min = "Minangkabau"
    bug = "Buginese"
    ban = "Balinese"
    bjn = "Banjarese"
    yue = "Cantonese (Traditional)"
    pt_br = "Portuguese (Brazil)"
    pt_pt = "Portuguese (Portugal)"
    fr_ca = "French (Canada)"
    pa_ar = "Punjabi (Shahmukhi)"
    kn = "Kannada"
    ml = "Malayalam"
    gu = "Gujarati"
    or_ = "Odia"
    as_ = "Assamese"
    ne = "Nepali"
    si = "Sinhala"
    km = "Khmer"
    lo = "Lao"
    my = "Burmese"
    bo = "Tibetan"
    mn = "Mongolian"
    ka = "Georgian"
    hy = "Armenian"
    az = "Azerbaijani"
    kk = "Kazakh"
    uz = "Uzbek"
    ky = "Kyrgyz"
    tg = "Tajik"
    tk = "Turkmen"
    ps = "Pashto"
    ku = "Kurdish (Kurmanji)"
    ckb = "Kurdish (Sorani)"
    sd = "Sindhi"
    ug = "Uyghur"
    af = "Afrikaans"
    am = "Amharic"
    ha = "Hausa"
    yo = "Yoruba"
    ig = "Igbo"
    zu = "Zulu"
    xh = "Xhosa"
    so = "Somali"
    rw = "Kinyarwanda"
    mg = "Malagasy"
    ht = "Haitian Creole"
    sq = "Albanian"
    bg = "Bulgarian"
    hr = "Croatian"
    sr = "Serbian"
    sk = "Slovak"
    sl = "Slovenian"
    et = "Estonian"
    lv = "Latvian"
    lt = "Lithuanian"
    is_ = "Icelandic"
    ga = "Irish"


class Audience(StrEnum):
    general = "Umum"
    management = "Manajemen"
    technical = "Teknis"
    regulator = "Regulator"
    academic = "Akademisi"
    student = "Mahasiswa"


class Depth(StrEnum):
    low = "Low"
    medium = "Medium"
    high = "High"


class NoteLength(StrEnum):
    under_100 = "<100 kata"
    words_100_250 = "100-250 kata"
    words_250_500 = "250-500 kata"
    custom = "Custom"


class NotesMode(StrEnum):
    """Controls how generated notes interact with speaker notes already in the deck."""

    missing_only = "missing_only"
    replace_all = "replace_all"
    append = "append"


class GenerationEngine(StrEnum):
    dummy = "dummy"
    openai = "openai"


class OpenAIModel(StrEnum):
    gpt_6_luna = "gpt-6-luna"
    gpt_6_1_terra = "gpt-6.1-terra"
    gpt_5_6_luna = "gpt-5.6-luna"


class GenerationOptions(BaseModel):
    language: Language = Language.en
    audience: Audience = Audience.general
    depth: Depth = Depth.medium
    note_length: NoteLength = NoteLength.words_100_250
    custom_word_limit: int | None = Field(default=None, ge=30, le=500)
    custom_instructions: str = ""

    @field_validator("custom_instructions")
    @classmethod
    def validate_instruction_words(cls, value: str) -> str:
        if len(value.split()) > 5000:
            raise ValueError("Additional instructions must be 5000 words or fewer")
        return value
    reference_context: str = Field(default="", max_length=60000)
    reference_name: str = Field(default="", max_length=120)
    notes_mode: NotesMode = NotesMode.missing_only
    engine: GenerationEngine = GenerationEngine.dummy
    model: OpenAIModel = OpenAIModel.gpt_6_luna
    use_vision: bool = False
    # Internal entitlement control. This is never accepted directly from the public
    # upload form; the API sets it after resolving the account plan.
    target_slide_limit: int | None = Field(default=None, ge=1, le=1000)


class SlideContent(BaseModel):
    number: int
    title: str | None = None
    texts: list[str] = Field(default_factory=list)
    tables: list[list[list[str]]] = Field(default_factory=list)
    has_existing_notes: bool = False
    hidden: bool = False
    image_count: int = 0
    chart_count: int = 0
    external_image_count: int = 0

    @property
    def has_visual_content(self) -> bool:
        return bool(self.image_count or self.chart_count or self.tables)


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
    slide_count: int = 0
    target_slide_count: int = 0
    remaining_unprocessed_slides: int = 0
    preview_limited: bool = False
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
    vision_target_count: int = 0
    vision_rendered_count: int = 0
    hidden_slide_count: int = 0
    image_dominant_slide_count: int = 0
    external_image_count: int = 0


class JobRecord(BaseModel):
    id: str
    status: JobStatus = JobStatus.queued
    original_filename: str
    owner: str | None = None
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
    vision_target_count: int = 0
    vision_rendered_count: int = 0
    hidden_slide_count: int = 0
    image_dominant_slide_count: int = 0
    external_image_count: int = 0
    slide_count: int = 0
    target_slide_count: int = 0
    remaining_unprocessed_slides: int = 0
    preview_limited: bool = False
    attempt_count: int = 0

    # Paid AI Slide Credit state for the currently active reservation.
    # Historical transactions remain authoritative in credit_ledger.
    credit_required: int = 0
    credit_reservation_key: str | None = None
    credit_monthly_used: int = 0
    credit_topup_used: int = 0
    credit_refunded: bool = False
    credit_refund_key: str | None = None

    def touch(self) -> None:
        self.updated_at = datetime.now(UTC)


class JobPublic(BaseModel):
    can_verify_email: bool = False
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
    used_vision: bool = False
    warnings: list[str] = Field(default_factory=list)
    vision_target_count: int = 0
    vision_rendered_count: int = 0
    hidden_slide_count: int = 0
    image_dominant_slide_count: int = 0
    external_image_count: int = 0
    slide_count: int = 0
    target_slide_count: int = 0
    remaining_unprocessed_slides: int = 0
    preview_limited: bool = False
    attempt_count: int = 0

    credit_required: int = 0
    credit_monthly_used: int = 0
    credit_topup_used: int = 0
    credit_refunded: bool = False

    @classmethod
    def from_record(cls, job: JobRecord) -> "JobPublic":
        download_url = None
        if job.status == JobStatus.completed and job.output_path:
            download_url = f"/api/v1/jobs/{job.id}/download"
        messages = {
            JobStatus.queued: "Waiting to process your presentation.",
            JobStatus.processing: "Preparing speaker notes for your presentation.",
            JobStatus.completed: "Your presentation is ready to download.",
            JobStatus.failed: "Processing could not finish.",
        }
        error = None
        if job.status == JobStatus.failed:
            error = (
                "Processing could not finish. Retry this saved job to reuse completed notes. "
                "Contact Support if it fails again."
            )
            if "server restart" in (job.error or "").lower():
                error = (
                    "Processing was interrupted when the service restarted. "
                    "Your upload is saved. Retry this job to continue."
                )
            elif "guardrail" in (job.error or "").lower():
                error = "Try a smaller deck or adjust the generation settings."
            if job.credit_refunded:
                error += " Reserved AI Credits were restored."
        return cls(
            id=job.id,
            status=job.status,
            original_filename=job.original_filename,
            created_at=job.created_at,
            updated_at=job.updated_at,
            progress_current=job.progress_current,
            progress_total=job.progress_total,
            message=messages.get(job.status, "Check the status of your presentation."),
            error=error,
            download_url=download_url,
            notes_mode=job.options.notes_mode,
            engine=job.options.engine,
            existing_notes_count=job.existing_notes_count,
            generated_notes_count=job.generated_notes_count,
            preserved_existing_notes_count=job.preserved_existing_notes_count,
            provider=job.provider,
            model=job.model,
            used_vision=job.used_vision,
            warnings=["Review the generated notes before presenting. Some slide details may need checking."] if job.warnings else [],
            vision_target_count=job.vision_target_count,
            vision_rendered_count=job.vision_rendered_count,
            hidden_slide_count=job.hidden_slide_count,
            image_dominant_slide_count=job.image_dominant_slide_count,
            external_image_count=job.external_image_count,
            slide_count=job.slide_count,
            target_slide_count=job.target_slide_count,
            remaining_unprocessed_slides=job.remaining_unprocessed_slides,
            preview_limited=job.preview_limited,
            attempt_count=job.attempt_count,
            credit_required=job.credit_required,
            credit_monthly_used=job.credit_monthly_used,
            credit_topup_used=job.credit_topup_used,
            credit_refunded=job.credit_refunded,
        )
