from pathlib import Path

from pptx import Presentation

from app.domain.models import NotesMode
from app.services.notes_writer import PptxNotesWriter


def _with_existing_note(source: Path, output: Path) -> Path:
    prs = Presentation(source)
    prs.slides[0].notes_slide.notes_text_frame.text = "Existing note"
    prs.save(output)
    return output


def test_notes_writer_writes_to_correct_slides_without_touching_original(sample_pptx, tmp_path: Path):
    output = tmp_path / "output.pptx"
    PptxNotesWriter().write(
        sample_pptx,
        {1: "Note one", 2: "Note two"},
        output,
        mode=NotesMode.replace_all,
    )

    original = Presentation(sample_pptx)
    result = Presentation(output)

    assert original.slides[0].has_notes_slide is False
    assert result.slides[0].notes_slide.notes_text_frame.text == "Note one"
    assert result.slides[1].notes_slide.notes_text_frame.text == "Note two"
    assert result.slides[0].shapes.title.text == "Carbon Accounting"


def test_missing_only_preserves_existing_notes(sample_pptx, tmp_path: Path):
    source = _with_existing_note(sample_pptx, tmp_path / "existing.pptx")
    output = tmp_path / "output.pptx"

    PptxNotesWriter().write(
        source,
        {1: "Should not replace", 2: "New note"},
        output,
        mode=NotesMode.missing_only,
    )

    result = Presentation(output)
    assert result.slides[0].notes_slide.notes_text_frame.text == "Existing note"
    assert result.slides[1].notes_slide.notes_text_frame.text == "New note"


def test_append_mode_keeps_existing_text(sample_pptx, tmp_path: Path):
    source = _with_existing_note(sample_pptx, tmp_path / "existing.pptx")
    output = tmp_path / "output.pptx"

    PptxNotesWriter().write(
        source,
        {1: "Generated addition"},
        output,
        mode=NotesMode.append,
    )

    note = Presentation(output).slides[0].notes_slide.notes_text_frame.text
    assert note.startswith("Existing note")
    assert note.endswith("Generated addition")


def test_writer_preserves_opaque_non_notes_package_part(sample_pptx, tmp_path: Path):
    """A complex deck may contain Office parts the app does not understand.

    The notes writer must preserve those package parts rather than relying on a
    full python-pptx round-trip that can normalize/drop unrelated XML.
    """
    import zipfile

    source = tmp_path / "with-opaque-part.pptx"
    with zipfile.ZipFile(sample_pptx, "r") as src, zipfile.ZipFile(source, "w") as dst:
        for info in src.infolist():
            dst.writestr(info, src.read(info.filename))
        dst.writestr("customXml/opaque.xml", b"<opaque vendor='powerpoint'>KEEP-ME</opaque>")

    output = tmp_path / "preserved-output.pptx"
    PptxNotesWriter().write(
        source,
        {1: "Generated note"},
        output,
        mode=NotesMode.replace_all,
    )

    with zipfile.ZipFile(output) as result:
        assert result.read("customXml/opaque.xml") == b"<opaque vendor='powerpoint'>KEEP-ME</opaque>"


def test_existing_notes_page_is_patched_without_rewriting_other_package_parts(sample_pptx, tmp_path: Path):
    import zipfile

    source = _with_existing_note(sample_pptx, tmp_path / "existing-surgical.pptx")
    output = tmp_path / "existing-surgical-output.pptx"

    with zipfile.ZipFile(source) as before:
        slide_xml_before = before.read("ppt/slides/slide1.xml")
        core_before = before.read("docProps/core.xml")

    PptxNotesWriter().write(
        source,
        {1: "Replacement note"},
        output,
        mode=NotesMode.replace_all,
    )

    with zipfile.ZipFile(output) as after:
        assert after.read("ppt/slides/slide1.xml") == slide_xml_before
        assert after.read("docProps/core.xml") == core_before

    result = Presentation(output)
    assert result.slides[0].notes_slide.notes_text_frame.text == "Replacement note"
