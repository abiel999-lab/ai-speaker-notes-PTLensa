from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI Speaker Notes MVP"
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000

    storage_dir: Path = Path("storage/jobs")
    max_upload_mb: int = Field(default=50, ge=1, le=500)
    max_zip_entries: int = Field(default=10_000, ge=100, le=100_000)
    max_uncompressed_mb: int = Field(default=500, ge=10, le=5_000)
    job_retention_hours: int = Field(default=24, ge=1, le=720)
    max_concurrent_jobs: int = Field(default=2, ge=1, le=16)

    # Vision rendering. Auto prefers Microsoft PowerPoint on Windows and falls back
    # to LibreOffice; Linux/server deployments should use LibreOffice.
    slide_renderer: str = "auto"
    libreoffice_bin: str = "auto"
    render_dpi: int = Field(default=120, ge=72, le=220)

    # OpenAI is opt-in. OPENAI_USE_VISION enables the feature; each job can still
    # choose text-only or vision mode from the UI.
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-5.6-luna"
    openai_reasoning_effort: str = "low"
    openai_use_vision: bool = True
    openai_image_detail: str = "auto"
    openai_batch_size: int = Field(default=4, ge=1, le=12)
    openai_timeout_seconds: float = Field(default=120.0, ge=10.0, le=600.0)
    openai_max_retries: int = Field(default=2, ge=0, le=8)
    openai_semantic_retries: int = Field(default=2, ge=0, le=6)
    openai_resume_checkpoints: bool = True
    openai_vision_fallback_to_text: bool = True
    powerpoint_render_timeout_seconds: int = Field(default=120, ge=15, le=600)

    # Hard cost guardrail. 0 disables the guardrail. This is a conservative preflight estimate,
    # not a billing quote.
    openai_max_estimated_job_cost_usd: float = Field(default=1.00, ge=0, le=1000)
    openai_vision_estimated_input_tokens_per_slide: int = Field(default=1100, ge=0, le=10000)

    # Cost display is only an estimate. Keep prices configurable because API pricing changes.
    openai_input_usd_per_mtok: float = Field(default=0.20, ge=0)
    openai_output_usd_per_mtok: float = Field(default=1.20, ge=0)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def max_uncompressed_bytes(self) -> int:
        return self.max_uncompressed_mb * 1024 * 1024

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key and self.openai_api_key.get_secret_value().strip())

    def estimated_openai_cost_usd(self, *, input_tokens: int, output_tokens: int) -> float:
        return round(
            (input_tokens / 1_000_000) * self.openai_input_usd_per_mtok
            + (output_tokens / 1_000_000) * self.openai_output_usd_per_mtok,
            6,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
