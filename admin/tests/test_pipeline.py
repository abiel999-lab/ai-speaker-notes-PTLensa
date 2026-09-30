from pathlib import Path

from pptx import Presentation

from app.core.config import Settings
from app.domain.models import GenerationOptions, NotesMode
from app.services.integrity import PptxIntegrityValidator
from app.services.notes.factory import NotesGeneratorFactory
from app.services.notes_writer import PptxNotesWriter
from app.services.pipeline import PresentationPipeline
from app.services.ppt_parser import PptxParser


def _pipeline() -> PresentationPipeline:
    parser = PptxParser()
    settings = Settings(_env_file=None)
    return PresentationPipeline(
        parser=parser,
        generator_factory=NotesGeneratorFactory(settings),
        notes_writer=PptxNotesWriter(),
        integrity_validator=PptxIntegrityValidator(parser),
        settings=settings,
    )


def test_full_non_ai_pipeline(sample_pptx, tmp_path: Path):
    output = tmp_path / "result.pptx"
    events = []
    result = _pipeline().process(
        sample_pptx,
        output,
        GenerationOptions(),
        lambda *args: events.append(args),
    )
    assert output.exists()
    assert len(events) == 5
    assert result.generated_notes_count == 2
    assert result.existing_notes_count == 0


def test_pipeline_safe_default_generates_only_missing_notes(sample_pptx, tmp_path: Path):
    source = tmp_path / "existing.pptx"
    prs = Presentation(sample_pptx)
    prs.slides[0].notes_slide.notes_text_frame.text = "Human-authored note"
    prs.save(source)

    output = tmp_path / "result.pptx"
    result = _pipeline().process(
        source,
        output,
        GenerationOptions(notes_mode=NotesMode.missing_only),
        lambda *_: None,
    )

    processed = Presentation(output)
    assert processed.slides[0].notes_slide.notes_text_frame.text == "Human-authored note"
    assert processed.slides[1].notes_slide.notes_text_frame.text.startswith("[MVP TEST]")
    assert result.existing_notes_count == 1
    assert result.generated_notes_count == 1
    assert result.preserved_existing_notes_count == 1


def test_pipeline_replace_all_explicitly_replaces_existing_notes(sample_pptx, tmp_path: Path):
    source = tmp_path / "existing-replace.pptx"
    prs = Presentation(sample_pptx)
    prs.slides[0].notes_slide.notes_text_frame.text = "Human-authored note"
    prs.save(source)

    output = tmp_path / "replace-result.pptx"
    result = _pipeline().process(
        source,
        output,
        GenerationOptions(notes_mode=NotesMode.replace_all),
        lambda *_: None,
    )

    processed = Presentation(output)
    assert processed.slides[0].notes_slide.notes_text_frame.text.startswith("[MVP TEST]")
    assert result.existing_notes_count == 1
    assert result.generated_notes_count == 2
    assert result.preserved_existing_notes_count == 0


def test_pipeline_append_keeps_existing_notes_and_adds_generated_text(sample_pptx, tmp_path: Path):
    source = tmp_path / "existing-append.pptx"
    prs = Presentation(sample_pptx)
    prs.slides[0].notes_slide.notes_text_frame.text = "Human-authored note"
    prs.save(source)

    output = tmp_path / "append-result.pptx"
    _pipeline().process(
        source,
        output,
        GenerationOptions(notes_mode=NotesMode.append),
        lambda *_: None,
    )

    note = Presentation(output).slides[0].notes_slide.notes_text_frame.text
    assert note.startswith("Human-authored note")
    assert "[MVP TEST]" in note


def test_pipeline_preserves_unknown_ooxml_part_and_still_passes_integrity(sample_pptx, tmp_path: Path):
    import zipfile

    source = tmp_path / "complex-like.pptx"
    with zipfile.ZipFile(sample_pptx, "r") as src, zipfile.ZipFile(source, "w") as dst:
        for info in src.infolist():
            dst.writestr(info, src.read(info.filename))
        dst.writestr("customXml/vendor-extension.xml", b"<vendorExtension>opaque</vendorExtension>")

    output = tmp_path / "complex-like-output.pptx"
    result = _pipeline().process(
        source,
        output,
        GenerationOptions(notes_mode=NotesMode.missing_only),
        lambda *_: None,
    )

    assert result.generated_notes_count == 2
    with zipfile.ZipFile(output) as archive:
        assert archive.read("customXml/vendor-extension.xml") == b"<vendorExtension>opaque</vendorExtension>"


def test_pipeline_vision_renders_only_target_slides_and_records_provider(sample_pptx, tmp_path: Path):
    from app.domain.models import NotesGenerationResult, TokenUsage

    class FakeGenerator:
        def generate(self, deck, options, **kwargs):
            rendered = kwargs["rendered_slides"]
            assert set(rendered) == {1, 2}
            assert options.use_vision is True
            return NotesGenerationResult(
                notes={slide.number: f"AI note {slide.number}" for slide in deck.slides},
                provider="openai",
                model="fake-vision-model",
                request_count=2,
                used_vision=True,
                usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150),
            )

    class FakeFactory:
        def get(self, engine):
            return FakeGenerator()

    class FakeRenderer:
        name = "test-renderer"

        def available(self):
            return True

        def render(self, pptx_path, output_dir, *, slide_numbers=None):
            assert slide_numbers == {1, 2}
            output_dir.mkdir(parents=True, exist_ok=True)
            result = {}
            for number in sorted(slide_numbers):
                path = output_dir / f"slide-{number:03d}.png"
                path.write_bytes(b"png")
                result[number] = path
            return result

    parser = PptxParser()
    settings = Settings(_env_file=None, openai_use_vision=True)
    pipeline = PresentationPipeline(
        parser=parser,
        generator_factory=FakeFactory(),
        notes_writer=PptxNotesWriter(),
        integrity_validator=PptxIntegrityValidator(parser),
        settings=settings,
        renderer=FakeRenderer(),
    )
    output = tmp_path / "vision-result.pptx"
    result = pipeline.process(
        sample_pptx,
        output,
        GenerationOptions(
            engine="openai",
            notes_mode=NotesMode.replace_all,
            use_vision=True,
        ),
        lambda *_: None,
    )

    assert result.used_vision is True
    assert result.vision_renderer == "test-renderer"
    assert result.generated_notes_count == 2


def test_pipeline_vision_failure_can_fallback_to_text_only(sample_pptx, tmp_path: Path):
    from app.domain.models import NotesGenerationResult, TokenUsage

    class FakeGenerator:
        def generate(self, deck, options, **kwargs):
            assert options.use_vision is False
            assert kwargs["rendered_slides"] == {}
            return NotesGenerationResult(
                notes={slide.number: f"AI note {slide.number}" for slide in deck.slides},
                provider="openai",
                model="fake-model",
                request_count=2,
                used_vision=False,
                usage=TokenUsage(input_tokens=100, output_tokens=50, total_tokens=150),
            )

    class FakeFactory:
        def get(self, engine):
            return FakeGenerator()

    class FailingRenderer:
        name = "powerpoint"

        def available(self):
            return True

        def render(self, *args, **kwargs):
            raise RuntimeError("renderer crash")

    parser = PptxParser()
    settings = Settings(
        _env_file=None,
        openai_use_vision=True,
        openai_vision_fallback_to_text=True,
    )
    pipeline = PresentationPipeline(
        parser=parser,
        generator_factory=FakeFactory(),
        notes_writer=PptxNotesWriter(),
        integrity_validator=PptxIntegrityValidator(parser),
        settings=settings,
        renderer=FailingRenderer(),
    )
    output = tmp_path / "fallback-result.pptx"
    result = pipeline.process(
        sample_pptx,
        output,
        GenerationOptions(engine="openai", notes_mode=NotesMode.replace_all, use_vision=True),
        lambda *_: None,
    )

    assert result.used_vision is False
    assert result.vision_renderer is None
    assert any("continued in text-only mode" in warning for warning in result.warnings)
    assert output.exists()


def test_pipeline_cost_guardrail_stops_before_generator_is_created(sample_pptx, tmp_path: Path):
    import pytest

    from app.services.preflight import AICostGuardrailError

    class MustNotBeCalledFactory:
        def get(self, engine):
            raise AssertionError("generator must not be created when cost guardrail blocks")

    parser = PptxParser()
    settings = Settings(
        _env_file=None,
        openai_max_estimated_job_cost_usd=0.000001,
    )
    pipeline = PresentationPipeline(
        parser=parser,
        generator_factory=MustNotBeCalledFactory(),
        notes_writer=PptxNotesWriter(),
        integrity_validator=PptxIntegrityValidator(parser),
        settings=settings,
    )

    with pytest.raises(AICostGuardrailError):
        pipeline.process(
            sample_pptx,
            tmp_path / "blocked.pptx",
            GenerationOptions(engine="openai", notes_mode=NotesMode.replace_all),
            lambda *_: None,
        )
