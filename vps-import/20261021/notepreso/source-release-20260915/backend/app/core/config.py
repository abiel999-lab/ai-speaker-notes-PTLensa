from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "AI Speaker Notes"
    app_env: str = "development"
    app_host: str = "127.0.0.1"
    app_port: int = 8000

    # Cross-origin frontend support for split deployment (e.g. Hostinger UI -> Cloud Run API).
    # Origins are comma-separated scheme+host values, without paths.
    frontend_origins: str = "http://127.0.0.1:8000,http://localhost:8000"
    # Optional demo access key. When configured, all job API operations require X-Demo-Key.
    demo_access_key: SecretStr | None = None

    # Optional single-account login for the MVP. Enable this in public deployments.
    auth_enabled: bool = False
    auth_username: str = "admin"
    auth_password: SecretStr | None = None
    session_secret: SecretStr | None = None
    session_hours: int = Field(default=8, ge=1, le=168)
    terms_version: str = "2026-09-13"
    require_terms_acceptance: bool = True

    # v1.0.0 production persistence and identity.
    database_url: str | None = None
    auth_provider: str = "local"  # local | keycloak
    public_base_url: str = "http://127.0.0.1:8000"
    keycloak_issuer: str = ""
    keycloak_internal_issuer: str = ""
    keycloak_client_id: str = "ai-speaker-notes"
    keycloak_client_secret: SecretStr | None = None

    storage_dir: Path = Path("storage/jobs")
    max_upload_mb: int = Field(default=50, ge=1, le=500)
    max_zip_entries: int = Field(default=10_000, ge=100, le=100_000)
    max_uncompressed_mb: int = Field(default=500, ge=10, le=5_000)
    allow_embedded_objects: bool = False
    job_retention_hours: int = Field(default=24, ge=1, le=720)
    max_concurrent_jobs: int = Field(default=2, ge=1, le=16)
    max_active_jobs_per_user: int = Field(default=2, ge=1, le=20)

    # Vision rendering. Auto prefers Microsoft PowerPoint on Windows and falls back
    # to LibreOffice; Linux/server deployments should use LibreOffice.
    slide_renderer: str = "auto"
    libreoffice_bin: str = "auto"
    render_dpi: int = Field(default=120, ge=72, le=220)

    # OpenAI is opt-in. OPENAI_USE_VISION enables the feature; each job can still
    # choose text-only or vision mode from the UI.
    openai_api_key: SecretStr | None = None
    # Model choice is configurable. Large decks are handled with automatic batching.
    openai_model: str = "gpt-5.6-sol"
    openai_reasoning_effort: str = "medium"
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
    openai_max_source_chars_per_job: int = Field(default=180_000, ge=1_000, le=2_000_000)

    # File-aware chat uses the same strong model but intentionally receives a narrow context.
    openai_chat_model: str = "gpt-5.6-sol"
    openai_chat_reasoning_effort: str = "medium"
    chat_max_message_chars: int = Field(default=2000, ge=100, le=20_000)
    chat_max_turns_per_job: int = Field(default=20, ge=1, le=200)
    chat_max_context_slides: int = Field(default=12, ge=1, le=50)
    chat_max_history_messages: int = Field(default=10, ge=0, le=50)
    chat_max_output_tokens: int = Field(default=1400, ge=100, le=10_000)

    # Cost display is only an estimate. Keep prices configurable because API pricing changes.
    openai_input_usd_per_mtok: float = Field(default=4.00, ge=0)
    openai_output_usd_per_mtok: float = Field(default=20.00, ge=0)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def max_uncompressed_bytes(self) -> int:
        return self.max_uncompressed_mb * 1024 * 1024

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key and self.openai_api_key.get_secret_value().strip())

    @property
    def allowed_frontend_origins(self) -> list[str]:
        return [item.strip().rstrip("/") for item in self.frontend_origins.split(",") if item.strip()]

    @property
    def auth_configured(self) -> bool:
        if not self.auth_enabled:
            return True
        session_ok = bool(self.session_secret and len(self.session_secret.get_secret_value()) >= 32)
        if self.auth_provider.lower() == "keycloak":
            return bool(
                session_ok
                and self.public_base_url.startswith("http")
                and self.keycloak_issuer.startswith("http")
                and self.keycloak_client_id.strip()
                and self.keycloak_client_secret
                and self.keycloak_client_secret.get_secret_value().strip()
            )
        return bool(
            session_ok
            and self.auth_password
            and self.auth_password.get_secret_value().strip()
        )

    @property
    def keycloak_enabled(self) -> bool:
        return self.auth_enabled and self.auth_provider.lower() == "keycloak"

    @property
    def demo_access_configured(self) -> bool:
        return bool(self.demo_access_key and self.demo_access_key.get_secret_value().strip())

    def estimated_openai_cost_usd(self, *, input_tokens: int, output_tokens: int) -> float:
        return round(
            (input_tokens / 1_000_000) * self.openai_input_usd_per_mtok
            + (output_tokens / 1_000_000) * self.openai_output_usd_per_mtok,
            6,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

