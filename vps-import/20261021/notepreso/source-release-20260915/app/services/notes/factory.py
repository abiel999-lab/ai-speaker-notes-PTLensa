from __future__ import annotations

from app.core.config import Settings
from app.domain.models import GenerationEngine
from app.services.notes.base import NotesGenerator
from app.services.notes.dummy import DummyNotesGenerator
from app.services.notes.openai_generator import OpenAINotesGenerator


class NotesGeneratorFactory:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._dummy = DummyNotesGenerator()
        self._openai: NotesGenerator | None = None

    def available(self, engine: GenerationEngine) -> bool:
        if engine == GenerationEngine.dummy:
            return True
        return self.settings.openai_configured

    def get(self, engine: GenerationEngine) -> NotesGenerator:
        if engine == GenerationEngine.dummy:
            return self._dummy
        if not self.settings.openai_configured:
            raise RuntimeError(
                "OpenAI generation is not configured. Set OPENAI_API_KEY in .env and restart."
            )
        if self._openai is None:
            secret = self.settings.openai_api_key
            assert secret is not None
            self._openai = OpenAINotesGenerator(
                api_key=secret.get_secret_value(),
                model=self.settings.openai_model,
                reasoning_effort=self.settings.openai_reasoning_effort,
                batch_size=self.settings.openai_batch_size,
                use_vision=self.settings.openai_use_vision,
                image_detail=self.settings.openai_image_detail,
                timeout_seconds=self.settings.openai_timeout_seconds,
                max_retries=self.settings.openai_max_retries,
                semantic_retries=self.settings.openai_semantic_retries,
                resume_checkpoints=self.settings.openai_resume_checkpoints,
                max_outline_chars=self.settings.openai_max_outline_chars,
            )
        return self._openai
