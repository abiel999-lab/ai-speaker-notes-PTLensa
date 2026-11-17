from __future__ import annotations

from pathlib import Path
from typing import Callable

from app.domain.models import GenerationOptions, NotesGenerationResult, PresentationDeck


class DummyNotesGenerator:
    """Deterministic generator used to prove the complete non-AI pipeline."""

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
    ) -> NotesGenerationResult:
        notes: dict[int, str] = {}
        for slide in deck.slides:
            title = slide.title or "Tanpa judul"
            notes[slide.number] = (
                f"[MVP TEST] Speaker notes untuk slide {slide.number}: {title}. "
                f"Bahasa: {options.language.value}. Audiens: {options.audience.value}. "
                f"Kedalaman: {options.depth.value}. "
                "Catatan ini dibuat oleh DummyNotesGenerator untuk memvalidasi pipeline "
                "PPTX → parse → generate → write-back → download sebelum AI diaktifkan."
            )
            if slide_progress is not None:
                slide_progress(len(notes))
        return NotesGenerationResult(
            notes=notes,
            provider="dummy",
            model=None,
            prompt_version="dummy-v1",
            request_count=0,
            used_vision=False,
        )
