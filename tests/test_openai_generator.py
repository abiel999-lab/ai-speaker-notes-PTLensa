from pathlib import Path
from types import SimpleNamespace

from app.domain.models import GenerationOptions, PresentationDeck, SlideContent
from app.services.notes.openai_generator import (
    DeckBrief,
    OpenAINotesGenerator,
    SlideNote,
    SlideNotesBatch,
)


class FakeResponses:
    def __init__(self):
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        text_format = kwargs["text_format"]
        if text_format is DeckBrief:
            parsed = DeckBrief(
                presentation_purpose="Explain carbon accounting",
                narrative_arc="Introduce scopes, then emission sources",
                key_terms=["Scope 1", "Scope 2", "Scope 3"],
                sections=[],
            )
        else:
            text = str(kwargs["input"])
            notes = []
            for number in (1, 2):
                if f"Slide {number} —" in text:
                    notes.append(SlideNote(slide_number=number, speaker_notes=f"Note for {number}"))
            parsed = SlideNotesBatch(slides=notes)
        usage = SimpleNamespace(
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
            input_tokens_details=SimpleNamespace(cached_tokens=10),
        )
        item = SimpleNamespace(parsed=parsed)
        message = SimpleNamespace(type="message", content=[item])
        return SimpleNamespace(output=[message], usage=usage)


class FakeClient:
    def __init__(self):
        self.responses = FakeResponses()


def test_openai_generator_batches_structured_notes_without_real_api(tmp_path: Path):
    deck = PresentationDeck(
        slide_count=2,
        slides=[
            SlideContent(number=1, title="Carbon Accounting", texts=["Scope 1", "Scope 2"]),
            SlideContent(number=2, title="Emission Sources", texts=["Diesel", "Electricity"]),
        ],
    )
    client = FakeClient()
    generator = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-terra",
        batch_size=4,
        use_vision=False,
        client=client,
    )

    result = generator.generate(
        deck,
        GenerationOptions(),
        full_deck=deck,
        artifact_dir=tmp_path,
    )

    assert result.notes == {1: "Note for 1", 2: "Note for 2"}
    assert result.provider == "openai"
    assert result.model == "gpt-5.6-terra"
    assert result.request_count == 2  # one deck brief + one batch
    assert result.usage.total_tokens == 300
    assert result.usage.cached_input_tokens == 20
    assert (tmp_path / "ai-generation-report.json").exists()
    assert client.responses.calls[0]["store"] is False
    assert client.responses.calls[1]["store"] is False


def test_openai_generator_attaches_target_slide_images_when_vision_is_selected(tmp_path: Path):
    deck = PresentationDeck(
        slide_count=2,
        slides=[
            SlideContent(number=1, title="Flow", texts=["Upload", "Generate"]),
            SlideContent(number=2, title="Chart", texts=["Illustrative values"]),
        ],
    )
    client = FakeClient()
    generator = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        batch_size=4,
        use_vision=True,
        client=client,
    )
    images = {}
    for number in (1, 2):
        path = tmp_path / f"slide-{number:03d}.png"
        path.write_bytes(b"fake-png")
        images[number] = path

    result = generator.generate(
        deck,
        GenerationOptions(use_vision=True),
        full_deck=deck,
        rendered_slides=images,
        artifact_dir=tmp_path,
    )

    assert result.used_vision is True
    batch_call = client.responses.calls[1]
    content = batch_call["input"][0]["content"]
    image_items = [item for item in content if item["type"] == "input_image"]
    assert len(image_items) == 2
    assert all(item["image_url"].startswith("data:image/png;base64,") for item in image_items)


def test_openai_generator_keeps_text_only_when_vision_feature_is_enabled_but_job_does_not_select_it(tmp_path: Path):
    deck = PresentationDeck(
        slide_count=1,
        slides=[SlideContent(number=1, title="Text", texts=["One bullet"])],
    )
    client = FakeClient()
    generator = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        use_vision=True,
        client=client,
    )

    result = generator.generate(deck, GenerationOptions(use_vision=False), full_deck=deck)

    assert result.used_vision is False
    content = client.responses.calls[1]["input"][0]["content"]
    assert not any(item["type"] == "input_image" for item in content)


class ExtraNeighborResponses:
    def __init__(self):
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        text_format = kwargs["text_format"]
        if text_format is DeckBrief:
            parsed = DeckBrief(
                presentation_purpose="Test a real training deck",
                narrative_arc="Move through a standards module",
                key_terms=["GRI", "SASB", "TCFD"],
                sections=[],
            )
        else:
            parsed = SlideNotesBatch(
                slides=[
                    SlideNote(slide_number=n, speaker_notes=f"Note for {n}")
                    for n in (13, 14, 15, 16, 17)
                ]
            )
        usage = SimpleNamespace(
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
            input_tokens_details=SimpleNamespace(cached_tokens=0),
        )
        item = SimpleNamespace(parsed=parsed)
        message = SimpleNamespace(type="message", content=[item])
        return SimpleNamespace(output=[message], usage=usage)


class ExtraNeighborClient:
    def __init__(self):
        self.responses = ExtraNeighborResponses()


def test_openai_generator_ignores_harmless_extra_neighbor_slide_without_retry():
    full_deck = PresentationDeck(
        slide_count=5,
        slides=[
            SlideContent(number=n, title=f"Slide {n}", texts=[f"Content {n}"])
            for n in (13, 14, 15, 16, 17)
        ],
    )
    target_deck = PresentationDeck(slide_count=4, slides=full_deck.slides[:4])
    client = ExtraNeighborClient()
    generator = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        batch_size=4,
        use_vision=False,
        semantic_retries=1,
        client=client,
    )

    result = generator.generate(
        target_deck,
        GenerationOptions(),
        full_deck=full_deck,
    )

    assert result.notes == {n: f"Note for {n}" for n in (13, 14, 15, 16)}
    assert result.request_count == 2
    assert len(client.responses.calls) == 2


class MissingThenRecoverResponses:
    def __init__(self):
        self.calls = []
        self.note_calls = 0

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        text_format = kwargs["text_format"]
        if text_format is DeckBrief:
            parsed = DeckBrief(
                presentation_purpose="Recovery test",
                narrative_arc="Two-slide flow",
                key_terms=[],
                sections=[],
            )
        else:
            self.note_calls += 1
            if self.note_calls == 1:
                parsed = SlideNotesBatch(
                    slides=[SlideNote(slide_number=1, speaker_notes="Recovered-safe note 1")]
                )
            else:
                request_text = str(kwargs["input"])
                assert "Slide 2 —" in request_text
                assert "Slide 1 —" not in request_text.split("TARGET SLIDES TO WRITE NOW:", 1)[1].split("IMMEDIATE NEIGHBOR SLIDES:", 1)[0]
                parsed = SlideNotesBatch(
                    slides=[SlideNote(slide_number=2, speaker_notes="Recovered-safe note 2")]
                )
        usage = SimpleNamespace(
            input_tokens=10,
            output_tokens=5,
            total_tokens=15,
            input_tokens_details=SimpleNamespace(cached_tokens=0),
        )
        return SimpleNamespace(
            output=[SimpleNamespace(type="message", content=[SimpleNamespace(parsed=parsed)])],
            usage=usage,
        )


class MissingThenRecoverClient:
    def __init__(self):
        self.responses = MissingThenRecoverResponses()


def test_openai_generator_recovers_only_missing_slide_not_whole_batch(tmp_path: Path):
    deck = PresentationDeck(
        slide_count=2,
        slides=[
            SlideContent(number=1, title="One", texts=["A"]),
            SlideContent(number=2, title="Two", texts=["B"]),
        ],
    )
    client = MissingThenRecoverClient()
    generator = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        batch_size=2,
        use_vision=False,
        semantic_retries=2,
        client=client,
    )

    result = generator.generate(
        deck,
        GenerationOptions(),
        full_deck=deck,
        artifact_dir=tmp_path,
    )

    assert result.notes == {
        1: "Recovered-safe note 1",
        2: "Recovered-safe note 2",
    }
    assert result.recovered_slide_count == 1
    assert result.request_count == 3  # brief + initial batch + slide-2-only recovery
    checkpoint = (tmp_path / "ai-checkpoint.json").read_text(encoding="utf-8")
    assert '"1"' in checkpoint and '"2"' in checkpoint


class FailMidwayResponses:
    def __init__(self):
        self.calls = []
        self.note_calls = 0

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        if kwargs["text_format"] is DeckBrief:
            parsed = DeckBrief(
                presentation_purpose="Checkpoint test",
                narrative_arc="Four slides",
                key_terms=[],
                sections=[],
            )
        else:
            self.note_calls += 1
            if self.note_calls == 1:
                parsed = SlideNotesBatch(
                    slides=[
                        SlideNote(slide_number=1, speaker_notes="Note 1"),
                        SlideNote(slide_number=2, speaker_notes="Note 2"),
                    ]
                )
            else:
                raise RuntimeError("simulated network/runtime interruption")
        usage = SimpleNamespace(
            input_tokens=20,
            output_tokens=10,
            total_tokens=30,
            input_tokens_details=SimpleNamespace(cached_tokens=0),
        )
        return SimpleNamespace(
            output=[SimpleNamespace(type="message", content=[SimpleNamespace(parsed=parsed)])],
            usage=usage,
        )


class FailMidwayClient:
    def __init__(self):
        self.responses = FailMidwayResponses()


class ResumeOnlyResponses:
    def __init__(self):
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        assert kwargs["text_format"] is SlideNotesBatch  # brief must be reused from checkpoint
        text = str(kwargs["input"])
        assert "Slide 3 —" in text and "Slide 4 —" in text
        target = text.split("TARGET SLIDES TO WRITE NOW:", 1)[1].split("IMMEDIATE NEIGHBOR SLIDES:", 1)[0]
        assert "Slide 1 —" not in target and "Slide 2 —" not in target
        parsed = SlideNotesBatch(
            slides=[
                SlideNote(slide_number=3, speaker_notes="Note 3"),
                SlideNote(slide_number=4, speaker_notes="Note 4"),
            ]
        )
        usage = SimpleNamespace(
            input_tokens=20,
            output_tokens=10,
            total_tokens=30,
            input_tokens_details=SimpleNamespace(cached_tokens=0),
        )
        return SimpleNamespace(
            output=[SimpleNamespace(type="message", content=[SimpleNamespace(parsed=parsed)])],
            usage=usage,
        )


class ResumeOnlyClient:
    def __init__(self):
        self.responses = ResumeOnlyResponses()


def test_openai_generator_resumes_completed_batches_from_checkpoint(tmp_path: Path):
    import pytest

    deck = PresentationDeck(
        slide_count=4,
        slides=[
            SlideContent(number=n, title=f"Slide {n}", texts=[f"Content {n}"])
            for n in range(1, 5)
        ],
    )
    first = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        batch_size=2,
        use_vision=False,
        semantic_retries=0,
        client=FailMidwayClient(),
    )
    with pytest.raises(RuntimeError, match="simulated"):
        first.generate(deck, GenerationOptions(), full_deck=deck, artifact_dir=tmp_path)

    checkpoint_path = tmp_path / "ai-checkpoint.json"
    assert checkpoint_path.exists()
    assert '"1"' in checkpoint_path.read_text(encoding="utf-8")

    resume_client = ResumeOnlyClient()
    second = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        batch_size=2,
        use_vision=False,
        semantic_retries=0,
        client=resume_client,
    )
    result = second.generate(deck, GenerationOptions(), full_deck=deck, artifact_dir=tmp_path)

    assert result.notes == {1: "Note 1", 2: "Note 2", 3: "Note 3", 4: "Note 4"}
    assert result.resumed_slide_count == 2
    assert len(resume_client.responses.calls) == 1
    assert result.request_count == 3  # historical brief + batch 1 + resumed batch 2


def test_checkpoint_is_not_reused_when_output_language_changes(tmp_path: Path):
    from app.domain.models import Language

    deck = PresentationDeck(
        slide_count=2,
        slides=[
            SlideContent(number=1, title="One", texts=["A"]),
            SlideContent(number=2, title="Two", texts=["B"]),
        ],
    )
    first_client = FakeClient()
    first = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        batch_size=4,
        use_vision=False,
        client=first_client,
    )
    first.generate(
        deck,
        GenerationOptions(language=Language.id),
        full_deck=deck,
        artifact_dir=tmp_path,
    )

    second_client = FakeClient()
    second = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        batch_size=4,
        use_vision=False,
        client=second_client,
    )
    result = second.generate(
        deck,
        GenerationOptions(language=Language.en),
        full_deck=deck,
        artifact_dir=tmp_path,
    )

    assert result.resumed_slide_count == 0
    assert len(second_client.responses.calls) == 2  # new brief + new batch


def test_openai_generator_applies_word_count_audience_and_custom_instructions(tmp_path: Path):
    from app.domain.models import Audience, NoteLength

    deck = PresentationDeck(
        slide_count=1,
        slides=[SlideContent(number=1, title="Research", texts=["Method", "Finding"])],
    )
    client = FakeClient()
    generator = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        use_vision=False,
        client=client,
    )
    options = GenerationOptions(
        audience=Audience.academic,
        note_length=NoteLength.custom,
        custom_word_limit=180,
        custom_instructions="Gunakan istilah metodologi penelitian secara konsisten.",
    )

    generator.generate(deck, options, full_deck=deck, artifact_dir=tmp_path)

    brief_call = client.responses.calls[0]
    batch_call = client.responses.calls[1]
    assert "Target audience: Akademisi" in brief_call["input"]
    assert "do not exceed 180 words per slide" in batch_call["instructions"]
    assert "Gunakan istilah metodologi penelitian" in batch_call["instructions"]
    batch_text = batch_call["input"][0]["content"][0]["text"]
    assert "Audience: Akademisi" in batch_text
    assert "Word-count target:" in batch_text


def test_openai_max_output_tokens_scale_with_note_length():
    from app.domain.models import NoteLength

    short = OpenAINotesGenerator._max_output_tokens(
        GenerationOptions(note_length=NoteLength.under_100), 4
    )
    long = OpenAINotesGenerator._max_output_tokens(
        GenerationOptions(note_length=NoteLength.words_250_500), 4
    )
    custom = OpenAINotesGenerator._max_output_tokens(
        GenerationOptions(note_length=NoteLength.custom, custom_word_limit=500), 4
    )
    assert short < long <= custom


def test_openai_generator_uses_selected_reasoning_level():
    from app.domain.models import Depth

    deck = PresentationDeck(
        slide_count=1,
        slides=[SlideContent(number=1, title="Reasoning", texts=["Test"])],
    )
    client = FakeClient()
    generator = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        reasoning_effort="low",
        use_vision=False,
        client=client,
    )

    generator.generate(
        deck,
        GenerationOptions(depth=Depth.high),
        full_deck=deck,
    )

    assert client.responses.calls[0]["reasoning"] == {"effort": "high"}
    assert client.responses.calls[1]["reasoning"] == {"effort": "high"}


def test_openai_generator_keeps_partial_vision_when_one_slide_image_is_missing(tmp_path: Path):
    deck = PresentationDeck(
        slide_count=2,
        slides=[
            SlideContent(number=1, title="Visual", image_count=1),
            SlideContent(number=2, title="Text", texts=["Bullet"]),
        ],
    )
    client = FakeClient()
    generator = OpenAINotesGenerator(
        api_key="test-key",
        model="gpt-5.6-luna",
        batch_size=4,
        use_vision=True,
        client=client,
    )
    image = tmp_path / "slide-001.png"
    image.write_bytes(b"fake-png")

    result = generator.generate(
        deck,
        GenerationOptions(use_vision=True),
        full_deck=deck,
        rendered_slides={1: image},
        artifact_dir=tmp_path,
    )

    assert result.used_vision is True
    assert any("slide(s): 2" in warning for warning in result.warnings)
    content = client.responses.calls[1]["input"][0]["content"]
    assert len([item for item in content if item["type"] == "input_image"]) == 1


def test_visual_structure_contradiction_is_detected():
    slide = SlideContent(number=10, image_count=1)
    assert OpenAINotesGenerator._note_contradicts_structure(
        slide, "Slide ini tidak memuat teks atau visual yang dapat diidentifikasi."
    ) is True
    assert OpenAINotesGenerator._note_contradicts_structure(
        slide, "Slide ini menampilkan grafik radiance terhadap wavelength."
    ) is False
