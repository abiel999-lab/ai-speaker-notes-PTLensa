from __future__ import annotations

from app.core.config import Settings
from app.domain.models import GenerationEngine
from app.services.notes.base import NotesGenerator
from app.services.notes.dummy import DummyNotesGenerator
from app.services.notes.openai_generator import OpenAINotesGenerator


ALLOWED_OPENAI_MODELS = {
    "gpt-6-luna",
    "gpt-5.6-luna",
}


class NotesGeneratorFactory:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._dummy = DummyNotesGenerator()
        self._openai_generators: dict[str, NotesGenerator] = {}

    def available(self, engine: GenerationEngine) -> bool:
        if engine == GenerationEngine.dummy:
            return True
        return self.settings.openai_configured

    def get(
        self,
        engine: GenerationEngine,
        model: str | None = None,
    ) -> NotesGenerator:
        if engine == GenerationEngine.dummy:
            return self._dummy

        if not self.settings.openai_configured:
            raise RuntimeError(
                "OpenAI generation is not configured. Set OPENAI_API_KEY in .env and restart."
            )

        selected_model = model or self.settings.openai_model

        if selected_model not in ALLOWED_OPENAI_MODELS:
            raise RuntimeError(
                f"Unsupported OpenAI model: {selected_model}. "
                "Allowed models: gpt-6-luna, gpt-5.6-luna."
            )

        generator = self._openai_generators.get(selected_model)

        if generator is None:
            secret = self.settings.openai_api_key
            assert secret is not None

            generator = OpenAINotesGenerator(
                api_key=secret.get_secret_value(),
                model=selected_model,
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
            self._openai_generators[selected_model] = generator

        return generator