from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.smtp"), env_file_encoding="utf-8", extra="ignore")

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

    # Support center / SMTP. Keep SMTP credentials in .env.smtp or runtime environment,
    # never in source control. SSL on port 465 is the recommended default for cPanel mail.
    support_inbox_email: str = "billing@notepreso.com"
    smtp_host: str = ""
    smtp_port: int = Field(default=465, ge=1, le=65535)
    smtp_username: str = ""
    smtp_password: SecretStr | None = None
    smtp_from_email: str = ""
    smtp_use_ssl: bool = True
    smtp_starttls: bool = False
    smtp_timeout_seconds: float = Field(default=20.0, ge=3.0, le=120.0)
    support_max_attachment_mb: int = Field(default=8, ge=1, le=25)
    support_send_ack: bool = True

    storage_dir: Path = Path("storage/jobs")
    max_upload_mb: int = Field(default=50, ge=1, le=500)
    max_zip_entries: int = Field(default=10_000, ge=100, le=100_000)
    max_uncompressed_mb: int = Field(default=500, ge=10, le=5_000)
    allow_embedded_objects: bool = True
    job_retention_hours: int = Field(default=24, ge=1, le=720)
    max_concurrent_jobs: int = Field(default=2, ge=1, le=16)
    max_active_jobs_per_user: int = Field(default=2, ge=1, le=20)

    # Internal subscription/entitlement engine. These are starter defaults and are
    # intentionally configurable so pricing can be tuned without a code change.
    # A value of 0 means unlimited for the corresponding monthly quota.
    free_monthly_presentations: int = Field(default=3, ge=0, le=10000)
    free_monthly_chat_messages: int = Field(default=20, ge=0, le=100000)
    free_vision_enabled: bool = False
    pro_monthly_presentations: int = Field(default=50, ge=0, le=100000)
    pro_monthly_chat_messages: int = Field(default=500, ge=0, le=1000000)
    pro_vision_enabled: bool = True

    # Billing gateway. Entitlements remain internal; Xendit only drives the
    # subscription lifecycle through server-side checkout + verified webhooks.
    payment_provider: str = "disabled"  # legacy default: disabled | xendit | stripe | paddle
    payment_providers: str = ""  # optional comma-separated enabled providers, e.g. xendit,paddle
    xendit_api_base_url: str = "https://api.xendit.co"
    xendit_api_version: str = "2026-01-01"
    xendit_secret_key: SecretStr | None = None
    xendit_webhook_token: SecretStr | None = None
    xendit_pro_price_idr: int = Field(default=0, ge=0, le=1_000_000_000)
    xendit_checkout_mode: str = "one_time"  # one_time | subscription
    xendit_pro_access_days: int = Field(default=30, ge=1, le=3650)
    xendit_timeout_seconds: float = Field(default=20.0, ge=3.0, le=120.0)

    # Stripe hosted Checkout (one-time Pro access). NotePreso stores prices in
    # human-readable rupiah and converts to Stripe minor units at the adapter boundary.
    stripe_api_base_url: str = "https://api.stripe.com"
    stripe_secret_key: SecretStr | None = None
    stripe_webhook_secret: SecretStr | None = None
    stripe_pro_price_idr: int = Field(default=0, ge=0, le=1_000_000_000)
    stripe_pro_access_days: int = Field(default=30, ge=1, le=3650)
    stripe_timeout_seconds: float = Field(default=20.0, ge=3.0, le=120.0)
    stripe_webhook_tolerance_seconds: int = Field(default=300, ge=0, le=3600)

    # Paddle Billing. Paddle does not support IDR as a payment currency, so NotePreso
    # keeps the Paddle price/currency separately from the local Xendit price. The
    # price ID must point to a one-time Paddle catalog price.
    paddle_api_base_url: str = "https://api.paddle.com"
    paddle_environment: str = "production"  # sandbox | production
    paddle_api_key: SecretStr | None = None
    paddle_client_token: SecretStr | None = None
    paddle_webhook_secret: SecretStr | None = None
    paddle_pro_price_id: str = ""
    paddle_pro_price_minor: int = Field(default=0, ge=0, le=1_000_000_000)
    paddle_pro_currency: str = "USD"
    paddle_pro_access_days: int = Field(default=30, ge=1, le=3650)
    paddle_timeout_seconds: float = Field(default=20.0, ge=3.0, le=120.0)
    paddle_webhook_tolerance_seconds: int = Field(default=300, ge=0, le=3600)

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
    openai_enforce_cost_guardrail: bool = False
    openai_vision_estimated_input_tokens_per_slide: int = Field(default=1100, ge=0, le=10000)
    openai_max_source_chars_per_job: int = Field(default=180_000, ge=1_000, le=2_000_000)
    openai_enforce_source_char_guardrail: bool = False
    openai_max_outline_chars: int = Field(default=60_000, ge=5_000, le=500_000)
    job_internal_retries: int = Field(default=2, ge=0, le=8)
    integrity_strict: bool = False

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
    def support_email(self) -> str:
        return self.support_inbox_email

    @property
    def smtp_security(self) -> str:
        if self.smtp_use_ssl:
            return "ssl"
        if self.smtp_starttls:
            return "starttls"
        return "none"

    @property
    def support_smtp_configured(self) -> bool:
        from_email = self.smtp_from_email.strip() or self.smtp_username.strip()
        return bool(
            self.smtp_host.strip()
            and self.smtp_username.strip()
            and self.smtp_password
            and self.smtp_password.get_secret_value().strip()
            and self.support_inbox_email.strip()
            and from_email
            and (self.smtp_use_ssl or self.smtp_starttls)
        )

    @property
    def support_max_attachment_bytes(self) -> int:
        return self.support_max_attachment_mb * 1024 * 1024

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

    @property
    def enabled_payment_providers(self) -> list[str]:
        allowed = {"xendit", "stripe", "paddle"}
        raw = self.payment_providers.strip()
        values = [item.strip().lower() for item in raw.split(",") if item.strip()] if raw else []
        if not values:
            legacy = self.payment_provider.strip().lower()
            values = [legacy] if legacy in allowed else []
        result: list[str] = []
        for value in values:
            if value in allowed and value not in result:
                result.append(value)
        return result

    @property
    def xendit_configured(self) -> bool:
        return bool(
            self.xendit_secret_key
            and self.xendit_secret_key.get_secret_value().strip()
            and self.xendit_webhook_token
            and self.xendit_webhook_token.get_secret_value().strip()
            and self.xendit_pro_price_idr > 0
            and self.public_base_url.startswith("https://")
        )

    @property
    def xendit_available(self) -> bool:
        return "xendit" in self.enabled_payment_providers and self.xendit_configured

    @property
    def stripe_configured(self) -> bool:
        return bool(
            self.stripe_secret_key
            and self.stripe_secret_key.get_secret_value().strip()
            and self.stripe_webhook_secret
            and self.stripe_webhook_secret.get_secret_value().strip()
            and self.stripe_pro_price_idr > 0
            and self.public_base_url.startswith("https://")
        )

    @property
    def stripe_available(self) -> bool:
        return "stripe" in self.enabled_payment_providers and self.stripe_configured

    @property
    def paddle_configured(self) -> bool:
        environment = self.paddle_environment.strip().lower()
        currency = self.paddle_pro_currency.strip().upper()
        return bool(
            environment in {"sandbox", "production"}
            and self.paddle_api_base_url.startswith("https://")
            and self.paddle_api_key
            and self.paddle_api_key.get_secret_value().strip()
            and self.paddle_client_token
            and self.paddle_client_token.get_secret_value().strip()
            and self.paddle_webhook_secret
            and self.paddle_webhook_secret.get_secret_value().strip()
            and self.paddle_pro_price_id.strip().startswith("pri_")
            and self.paddle_pro_price_minor > 0
            and len(currency) == 3
            and currency != "IDR"
            and self.public_base_url.startswith("https://")
        )

    @property
    def paddle_available(self) -> bool:
        return "paddle" in self.enabled_payment_providers and self.paddle_configured

    @property
    def default_payment_provider(self) -> str:
        available = [
            provider
            for provider in self.enabled_payment_providers
            if getattr(self, f"{provider}_available", False)
        ]
        legacy = self.payment_provider.strip().lower()
        if legacy in available:
            return legacy
        return available[0] if available else "disabled"

    @property
    def billing_configured(self) -> bool:
        return any((self.xendit_available, self.stripe_available, self.paddle_available))

    def estimated_openai_cost_usd(self, *, input_tokens: int, output_tokens: int) -> float:
        return round(
            (input_tokens / 1_000_000) * self.openai_input_usd_per_mtok
            + (output_tokens / 1_000_000) * self.openai_output_usd_per_mtok,
            6,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

