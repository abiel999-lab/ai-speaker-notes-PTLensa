from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from pptx import Presentation

from app.domain.models import NotesMode
from app.services.ppt_parser import PptxParser


class IntegrityCheckError(RuntimeError):
    pass


_REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}
_CT_NS = {"ct": "http://schemas.openxmlformats.org/package/2006/content-types"}
_SLIDE_RELS = re.compile(r"^ppt/slides/_rels/slide\d+\.xml\.rels$")
_THEME = re.compile(r"^ppt/theme/theme\d+\.xml$")
_APPEND_SEPARATOR = "\n\n---\n\n"


class PptxIntegrityValidator:
    """Validates semantic content and protects non-notes OOXML parts after write-back."""

    def __init__(self, parser: PptxParser) -> None:
        self.parser = parser

    def validate(
        self,
        original: Path,
        output: Path,
        *,
        generated_notes: dict[int, str],
        mode: NotesMode,
    ) -> None:
        self._validate_visible_content(original, output)
        self._validate_package_parts(original, output)
        self._validate_notes(original, output, generated_notes, mode)

    def _validate_visible_content(self, original: Path, output: Path) -> None:
        before = self.parser.parse(original)
        after = self.parser.parse(output)

        if before.slide_count != after.slide_count:
            raise IntegrityCheckError("Slide count changed after notes write-back.")

        for old, new in zip(before.slides, after.slides, strict=True):
            if old.title != new.title or old.texts != new.texts or old.tables != new.tables:
                raise IntegrityCheckError(
                    f"Visible slide content changed unexpectedly on slide {old.number}."
                )

    def _validate_package_parts(self, original: Path, output: Path) -> None:
        with zipfile.ZipFile(original) as before_zip, zipfile.ZipFile(output) as after_zip:
            before_names = set(before_zip.namelist())
            after_names = set(after_zip.namelist())

            removed = before_names - after_names
            if removed:
                first = sorted(removed)[0]
                raise IntegrityCheckError(f"OOXML package part was removed unexpectedly: {first}")

            for name in sorted(before_names & after_names):
                before_bytes = before_zip.read(name)
                after_bytes = after_zip.read(name)
                if before_bytes == after_bytes:
                    continue

                if name.startswith("ppt/notesSlides/") or name.startswith("ppt/notesMasters/"):
                    continue
                if name == "[Content_Types].xml":
                    self._validate_content_types(before_bytes, after_bytes)
                    continue
                if name == "ppt/_rels/presentation.xml.rels":
                    self._validate_relationships(before_bytes, after_bytes, ignored_suffix="notesMaster")
                    continue
                if _SLIDE_RELS.match(name):
                    self._validate_relationships(before_bytes, after_bytes, ignored_suffix="notesSlide")
                    continue

                raise IntegrityCheckError(
                    f"Protected OOXML package part changed unexpectedly: {name}"
                )

            for name in sorted(after_names - before_names):
                if self._allowed_added_part(name):
                    continue
                raise IntegrityCheckError(f"Unexpected OOXML package part was added: {name}")

    @staticmethod
    def _allowed_added_part(name: str) -> bool:
        return (
            name.startswith("ppt/notesSlides/")
            or name.startswith("ppt/notesMasters/")
            or bool(_THEME.match(name))
        )

    @staticmethod
    def _validate_relationships(before: bytes, after: bytes, *, ignored_suffix: str) -> None:
        def filtered(payload: bytes) -> set[tuple[str, str, str | None]]:
            root = ET.fromstring(payload)
            relationships: set[tuple[str, str, str | None]] = set()
            for item in root.findall("r:Relationship", _REL_NS):
                rel_type = item.attrib.get("Type", "")
                if rel_type.rsplit("/", 1)[-1] == ignored_suffix:
                    continue
                relationships.add(
                    (
                        rel_type,
                        item.attrib.get("Target", ""),
                        item.attrib.get("TargetMode"),
                    )
                )
            return relationships

        if filtered(before) != filtered(after):
            raise IntegrityCheckError(
                "Non-notes OOXML relationships changed unexpectedly during write-back."
            )

    @staticmethod
    def _validate_content_types(before: bytes, after: bytes) -> None:
        def parse(payload: bytes) -> tuple[set[tuple[str, str]], set[tuple[str, str]]]:
            root = ET.fromstring(payload)
            defaults = {
                (item.attrib.get("Extension", ""), item.attrib.get("ContentType", ""))
                for item in root.findall("ct:Default", _CT_NS)
            }
            overrides = {
                (item.attrib.get("PartName", ""), item.attrib.get("ContentType", ""))
                for item in root.findall("ct:Override", _CT_NS)
            }
            return defaults, overrides

        before_defaults, before_overrides = parse(before)
        after_defaults, after_overrides = parse(after)

        if before_defaults != after_defaults:
            raise IntegrityCheckError("OOXML default content types changed unexpectedly.")

        if not before_overrides.issubset(after_overrides):
            raise IntegrityCheckError("Existing OOXML content types were removed or changed.")

        new_overrides = after_overrides - before_overrides
        for part_name, _content_type in new_overrides:
            if (
                part_name.startswith("/ppt/notesSlides/")
                or part_name.startswith("/ppt/notesMasters/")
                or re.match(r"^/ppt/theme/theme\d+\.xml$", part_name)
            ):
                continue
            raise IntegrityCheckError(
                f"Unexpected OOXML content type was introduced: {part_name}"
            )

    @staticmethod
    def _notes_texts(path: Path) -> dict[int, str]:
        presentation = Presentation(path)
        result: dict[int, str] = {}
        for number, slide in enumerate(presentation.slides, start=1):
            text = ""
            if slide.has_notes_slide:
                frame = slide.notes_slide.notes_text_frame
                if frame is not None:
                    text = frame.text.strip()
            result[number] = text
        return result

    def _validate_notes(
        self,
        original: Path,
        output: Path,
        generated_notes: dict[int, str],
        mode: NotesMode,
    ) -> None:
        before = self._notes_texts(original)
        after = self._notes_texts(output)

        if before.keys() != after.keys():
            raise IntegrityCheckError("Slide/notes mapping changed unexpectedly.")

        for number, old_note in before.items():
            new_note = after[number]
            generated = generated_notes.get(number)

            if generated is None:
                if old_note != new_note:
                    raise IntegrityCheckError(
                        f"Existing speaker notes changed unexpectedly on slide {number}."
                    )
                continue

            if mode == NotesMode.missing_only:
                expected = old_note if old_note else generated
            elif mode == NotesMode.append:
                expected = f"{old_note}{_APPEND_SEPARATOR}{generated}" if old_note else generated
            else:
                expected = generated

            if new_note.strip() != expected.strip():
                raise IntegrityCheckError(
                    f"Speaker notes do not match the requested write mode on slide {number}."
                )
