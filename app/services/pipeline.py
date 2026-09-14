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
from app.services.preflight import enforce_cost_guardrail, enforce_input_guardrails, estimate_openai_job

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

        hidden_slide_count = sum(1 for slide in deck.slides if slide.hidden)
        image_dominant_slide_count = sum(
            1 for slide in deck.slides if slide.has_visual_content and not slide.texts
        )
        external_image_count = sum(slide.external_image_count for slide in deck.slides)
        if hidden_slide_count:
            warnings.append(
                f"Detected {hidden_slide_count} hidden slide(s). Rendering uses a temporary normalized "
                "copy so hidden slides do not shift slide-number mapping."
            )
        if external_image_count:
            warnings.append(
                f"Detected {external_image_count} externally linked image relationship(s). For security, "
                "the app does not fetch external URLs; unavailable linked media may not appear in Vision."
            )

        if options.engine == GenerationEngine.openai:
            enforce_input_guardrails(
                full_deck=deck,
                target_deck=generation_deck,
                options=options,
                settings=self.settings,
            )
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
                render_dir = input_path.parent / "rendered"
                try:
                    rendered_map = self.renderer.render(
                        input_path,
                        render_dir,
                        slide_numbers=target_numbers,
                    )
                    vision_renderer = self.renderer.name
                except Exception as batch_exc:
                    # A single malformed/unsupported slide must not disable Vision for the
                    # entire deck. Recover slide-by-slide and keep every successful image.
                    recovered: dict[int, Path] = {}
                    failed: dict[int, str] = {}
                    for number in sorted(target_numbers):
                        per_slide_dir = render_dir / f"single-{number:03d}"
                        try:
                            item = self.renderer.render(
                                input_path,
                                per_slide_dir,
                                slide_numbers={number},
                            )
                            recovered.update(item)
                        except Exception as slide_exc:
                            failed[number] = f"{type(slide_exc).__name__}: {slide_exc}"
                    rendered_map = recovered
                    vision_renderer = self.renderer.name if recovered else None
                    if recovered:
                        warning = (
                            f"Batch vision rendering failed ({type(batch_exc).__name__}: {batch_exc}), "
                            f"but {len(recovered)}/{len(target_numbers)} slide(s) were recovered "
                            "individually. Slides without images will use text-only context."
                        )
                        if failed:
                            warning += " Failed slide(s): " + ", ".join(map(str, sorted(failed)[:20])) + "."
                        warnings.append(warning)
                    else:
                        raise batch_exc
            except Exception as exc:
                if not self.settings.openai_vision_fallback_to_text:
                    raise
                warning = (
                    "Vision rendering was unavailable for this deck; the job continued in text-only "
                    f"mode. Renderer error: {type(exc).__name__}: {exc}"
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
            vision_target_count=len(generation_deck.slides) if needs_vision else 0,
            vision_rendered_count=len(rendered_map) if needs_vision else 0,
            hidden_slide_count=hidden_slide_count,
            image_dominant_slide_count=image_dominant_slide_count,
            external_image_count=external_image_count,
        )

    @staticmethod
    def _select_generation_deck(deck: PresentationDeck, mode: NotesMode) -> PresentationDeck:
        if mode != NotesMode.missing_only:
            return deck

        slides = [slide for slide in deck.slides if not slide.has_existing_notes]
        return PresentationDeck(slide_count=deck.slide_count, slides=slides)
