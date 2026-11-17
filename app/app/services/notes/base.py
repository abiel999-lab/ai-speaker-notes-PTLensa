from __future__ import annotations

from pathlib import Path
from typing import Callable, Protocol

from app.domain.models import GenerationOptions, NotesGenerationResult, PresentationDeck


class NotesGenerator(Protocol):
    def generate(
        self,
        deck: PresentationDeck,
        options: GenerationOptions,
        *,
        full_deck: PresentationDeck | None = None,
        rendered_slides: dict[int, Path] | None = None,
        artifact_dir: Path | None = None,
        status: Callable[[str], None] | None = None,
        slide_progress: Callable[[int], None] | None = None,
    ) -> NotesGenerationResult: ...
