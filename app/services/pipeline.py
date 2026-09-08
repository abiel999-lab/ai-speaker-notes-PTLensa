from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from app.core.config import Settings
from app.domain.models import (
    GenerationEngine,
    GenerationOptions,
    NotesMode,
    PipelineResult,
    PresentationDeck,
)
from app.services.integrity import PptxIntegrityValidator
from app.services.notes.factory import NotesGeneratorFactory
from app.services.notes_writer import PptxNotesWriter
from app.services.ppt_parser import PptxParser
from app.services.ppt_renderer import SlideRenderer
from app.services.preflight import enforce_cost_guardrail, estimate_openai_job

ProgressCallback = Callable[[int, int, str], None]


class PresentationPipeline:
    def __init__(
        self,
        *,
        parser: PptxParser,
        generator_factory: NotesGeneratorFactory,
        notes_writer: PptxNotesWriter,
        integrity_validator: PptxIntegrityValidator,
        settings: Settings,
        renderer: SlideRenderer | None = None,
    ) -> None:
        self.parser = parser
        self.generator_factory = generator_factory
        self.notes_writer = notes_writer
        self.integrity_validator = integrity_validator
        self.settings = settings
        self.renderer = renderer

    def process(
        self,
        input_path: Path,
        output_path: Path,
        options: GenerationOptions,
        progress: ProgressCallback,
    ) -> PipelineResult:
        warnings: list[str] = []
        progress(1, 5, "Reading PowerPoint structure and existing notes")
        deck = self.parser.parse(input_path)

        metadata_path = input_path.parent / "presentation.json"
        metadata_path.write_text(
            json.dumps(deck.model_dump(mode="json"), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        generation_deck = self._select_generation_deck(deck, options.notes_mode)
        effective_options = options
        preflight_cost: float | None = None

        if options.engine == GenerationEngine.openai:
            estimate = estimate_openai_job(
                full_deck=deck,
                target_deck=generation_deck,
                options=options,
                settings=self.settings,
            )
            preflight_cost = estimate.estimated_cost_usd
            (input_path.parent / "ai-preflight.json").write_text(
                json.dumps(estimate.as_dict(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            progress(
                2,
                5,
                f"AI preflight: {estimate.target_slides} target slide(s), "
                f"estimated API cost ${estimate.estimated_cost_usd:.4f}",
            )
            enforce_cost_guardrail(estimate, self.settings)

        rendered_map: dict[int, Path] = {}
        vision_renderer: str | None = None
        needs_vision = (
            options.engine == GenerationEngine.openai
            and options.use_vision
            and bool(generation_deck.slides)
        )
        if needs_vision:
            progress(2, 5, "Rendering target slides for AI visual understanding")
            if not self.settings.openai_use_vision:
                raise RuntimeError(
                    "Vision was requested for this job, but OPENAI_USE_VISION=false on the server."
                )
            try:
                if self.renderer is None or not self.renderer.available():
                    raise RuntimeError(
                        "No slide renderer is available. On Windows, install Microsoft PowerPoint "
                        "or LibreOffice; for server deployment use LibreOffice."
                    )
                target_numbers = {slide.number for slide in generation_deck.slides}
                rendered_map = self.renderer.render(
                    input_path,
                    input_path.parent / "rendered",
                    slide_numbers=target_numbers,
                )
                vision_renderer = self.renderer.name
            except Exception as exc:
                if not self.settings.openai_vision_fallback_to_text:
                    raise
                warning = (
                    "Vision rendering failed; the job continued in text-only mode without sending "
                    f"slide screenshots to the AI. Renderer error: {type(exc).__name__}: {exc}"
                )
                warnings.append(warning)
                effective_options = options.model_copy(update={"use_vision": False})
                rendered_map = {}
                vision_renderer = None
                progress(2, 5, "Vision unavailable; continuing safely in text-only mode")
        elif options.engine != GenerationEngine.openai:
            progress(2, 5, "Preparing generation context")
        elif not options.use_vision:
            progress(2, 5, "Preparing text-only AI generation context")

        generator = self.generator_factory.get(options.engine)
        label = "AI speaker notes" if options.engine == GenerationEngine.openai else "MVP test notes"
        progress(3, 5, f"Generating {label} for {len(generation_deck.slides)} slide(s)")
        generated = generator.generate(
            generation_deck,
            effective_options,
            full_deck=deck,
            rendered_slides=rendered_map,
            artifact_dir=input_path.parent,
            status=lambda message: progress(3, 5, message),
        )
        warnings.extend(item for item in generated.warnings if item not in warnings)

        report_path = input_path.parent / "ai-generation-report.json"
        if generated.provider == "openai" and report_path.exists():
            try:
                report = json.loads(report_path.read_text(encoding="utf-8"))
                report["vision_renderer"] = vision_renderer if generated.used_vision else None
                report["preflight_estimated_cost_usd"] = preflight_cost
                report["warnings"] = warnings
                report_path.write_text(
                    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
                )
            except (OSError, json.JSONDecodeError):
                # Diagnostic metadata must never invalidate an otherwise safe PPTX result.
                pass

        progress(4, 5, "Writing speaker notes to a package-preserving working copy")
        self.notes_writer.write(input_path, generated.notes, output_path, mode=options.notes_mode)

        progress(5, 5, "Validating visible content, OOXML package, and notes")
        self.integrity_validator.validate(
            input_path,
            output_path,
            generated_notes=generated.notes,
            mode=options.notes_mode,
        )

        existing = deck.existing_notes_count
        preserved = existing if options.notes_mode == NotesMode.missing_only else 0
        cost = None
        if generated.provider == "openai":
            cost = self.settings.estimated_openai_cost_usd(
                input_tokens=generated.usage.input_tokens,
                output_tokens=generated.usage.output_tokens,
            )

        return PipelineResult(
            deck=deck,
            existing_notes_count=existing,
            generated_notes_count=len(generated.notes),
            preserved_existing_notes_count=preserved,
            provider=generated.provider,
            model=generated.model,
            input_tokens=generated.usage.input_tokens,
            cached_input_tokens=generated.usage.cached_input_tokens,
            output_tokens=generated.usage.output_tokens,
            total_tokens=generated.usage.total_tokens,
            estimated_cost_usd=cost,
            request_count=generated.request_count,
            used_vision=generated.used_vision,
            vision_renderer=vision_renderer if generated.used_vision else None,
            preflight_estimated_cost_usd=preflight_cost,
            resumed_slide_count=generated.resumed_slide_count,
            recovered_slide_count=generated.recovered_slide_count,
            warnings=warnings,
        )

    @staticmethod
    def _select_generation_deck(deck: PresentationDeck, mode: NotesMode) -> PresentationDeck:
        if mode != NotesMode.missing_only:
            return deck

        slides = [slide for slide in deck.slides if not slide.has_existing_notes]
        return PresentationDeck(slide_count=deck.slide_count, slides=slides)
