from pathlib import Path

from pptx import Presentation

from app.services.ppt_parser import PptxParser


def test_parser_extracts_slide_text_and_tables(sample_pptx):
    deck = PptxParser().parse(sample_pptx)
    assert deck.slide_count == 2
    assert deck.slides[0].title == "Carbon Accounting"
    assert any("Scope 1" in text for text in deck.slides[0].texts)
    assert deck.slides[1].tables[0][1] == ["Diesel", "Scope 1"]
    assert deck.existing_notes_count == 0


def test_parser_detects_existing_speaker_notes(sample_pptx, tmp_path: Path):
    path = tmp_path / "with-notes.pptx"
    prs = Presentation(sample_pptx)
    prs.slides[0].notes_slide.notes_text_frame.text = "Existing note"
    prs.save(path)

    deck = PptxParser().parse(path)
    assert deck.slides[0].has_existing_notes is True
    assert deck.slides[1].has_existing_notes is False
    assert deck.existing_notes_count == 1
