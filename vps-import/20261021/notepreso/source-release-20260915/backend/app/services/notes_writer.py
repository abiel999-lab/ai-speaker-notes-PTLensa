from __future__ import annotations

import posixpath
import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Iterable

from pptx import Presentation

from app.domain.models import NotesMode

_APPEND_SEPARATOR = "\n\n---\n\n"
_REL_NS_URI = "http://schemas.openxmlformats.org/package/2006/relationships"
_CT_NS_URI = "http://schemas.openxmlformats.org/package/2006/content-types"
_P_NS_URI = "http://schemas.openxmlformats.org/presentationml/2006/main"
_A_NS_URI = "http://schemas.openxmlformats.org/drawingml/2006/main"
_XML_NS_URI = "http://www.w3.org/XML/1998/namespace"

_REL_NS = {"r": _REL_NS_URI}
_CT_NS = {"ct": _CT_NS_URI}
_P_NS = {"p": _P_NS_URI, "a": _A_NS_URI}

ET.register_namespace("", _REL_NS_URI)


class PptxNotesWriter:
    """Surgically writes speaker notes while preserving non-notes OOXML parts.

    python-pptx is used only as a *template generator* when a slide does not yet
    have a notes part. The final PPTX is rebuilt from the original package and
    only notes-related parts/relationships are changed. This avoids a full
    python-pptx round-trip rewriting unrelated PowerPoint XML in complex decks.
    """

    def write(
        self,
        input_path: Path,
        notes_by_slide: dict[int, str],
        output_path: Path,
        *,
        mode: NotesMode,
    ) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if not notes_by_slide:
            shutil.copy2(input_path, output_path)
            return

        presentation = Presentation(input_path)
        desired: dict[int, str] = {}
        existing_note_slides: set[int] = set()
        new_note_slides: set[int] = set()

        for number, slide in enumerate(presentation.slides, start=1):
            generated = notes_by_slide.get(number)
            if generated is None:
                continue

            existing = ""
            if slide.has_notes_slide:
                existing_note_slides.add(number)
                frame = slide.notes_slide.notes_text_frame
                if frame is not None:
                    existing = frame.text.strip()

            if mode == NotesMode.missing_only and existing:
                # Defense in depth: the pipeline normally filters these out.
                continue

            if mode == NotesMode.append and existing:
                desired[number] = f"{existing}{_APPEND_SEPARATOR}{generated}"
            else:
                desired[number] = generated

            if not slide.has_notes_slide:
                new_note_slides.add(number)

        if not desired:
            shutil.copy2(input_path, output_path)
            return

        template_path: Path | None = None
        try:
            # Only missing notes slides require python-pptx to generate the
            # notesSlide/notesMaster scaffolding. Existing notes are patched
            # directly in the original notes XML below.
            if new_note_slides:
                template_path = output_path.with_suffix(".notes-template.pptx")
                template_path.unlink(missing_ok=True)
                shutil.copy2(input_path, template_path)
                template = Presentation(template_path)
                for number in sorted(new_note_slides):
                    frame = template.slides[number - 1].notes_slide.notes_text_frame
                    if frame is None:
                        raise RuntimeError(
                            f"Slide {number} does not expose a writable notes text frame."
                        )
                    frame.text = desired[number]
                template.save(template_path)

            self._build_preserved_package(
                input_path=input_path,
                output_path=output_path,
                desired=desired,
                existing_note_slides=existing_note_slides,
                new_note_slides=new_note_slides,
                template_path=template_path,
            )
        finally:
            if template_path is not None:
                template_path.unlink(missing_ok=True)

    def _build_preserved_package(
        self,
        *,
        input_path: Path,
        output_path: Path,
        desired: dict[int, str],
        existing_note_slides: set[int],
        new_note_slides: set[int],
        template_path: Path | None,
    ) -> None:
        working = output_path.with_suffix(".working.pptx")
        working.unlink(missing_ok=True)

        with zipfile.ZipFile(input_path, "r") as original_zip:
            original_names = set(original_zip.namelist())
            replacements: dict[str, bytes] = {}
            additions: dict[str, tuple[bytes, zipfile.ZipInfo | None]] = {}

            # Existing notes: patch only the body placeholder text in the
            # original notesSlide XML. All other notes-page content survives.
            for number in sorted(set(desired) & existing_note_slides):
                slide_rels = self._slide_rels_name(number)
                rel_bytes = original_zip.read(slide_rels)
                note_rel = self._find_relationship(rel_bytes, "notesSlide")
                if note_rel is None:
                    raise RuntimeError(
                        f"Slide {number} reports notes but has no notesSlide relationship."
                    )
                note_part = self._resolve_target(self._slide_part_name(number), note_rel[1])
                original_note_xml = original_zip.read(note_part)
                replacements[note_part] = self._replace_notes_body(
                    original_note_xml, desired[number]
                )

            if new_note_slides:
                if template_path is None:
                    raise RuntimeError("Missing notes template package for new notes slides.")

                with zipfile.ZipFile(template_path, "r") as template_zip:
                    template_names = set(template_zip.namelist())

                    # Add a notes master only if the original package did not
                    # have one. The original notes master is preserved when it exists.
                    original_pres_rels = original_zip.read("ppt/_rels/presentation.xml.rels")
                    original_notes_master = self._find_relationship(
                        original_pres_rels, "notesMaster"
                    )
                    template_pres_rels = template_zip.read("ppt/_rels/presentation.xml.rels")
                    template_notes_master = self._find_relationship(
                        template_pres_rels, "notesMaster"
                    )

                    added_part_names: set[str] = set()

                    if original_notes_master is None:
                        if template_notes_master is None:
                            raise RuntimeError("Generated package did not contain a notes master.")

                        replacements["ppt/_rels/presentation.xml.rels"] = (
                            self._merge_relationship_type(
                                original_pres_rels,
                                template_pres_rels,
                                relationship_suffix="notesMaster",
                            )
                        )

                        notes_master_part = self._resolve_target(
                            "ppt/presentation.xml", template_notes_master[1]
                        )
                        self._copy_part_from_template(
                            template_zip,
                            template_names,
                            notes_master_part,
                            original_names,
                            additions,
                        )
                        added_part_names.add(notes_master_part)

                        notes_master_rels = self._rels_name_for_part(notes_master_part)
                        if notes_master_rels in template_names:
                            self._copy_part_from_template(
                                template_zip,
                                template_names,
                                notes_master_rels,
                                original_names,
                                additions,
                            )

                            # Copy any new direct resources required by the new
                            # notes master (normally its dedicated theme).
                            for _rtype, target, target_mode in self._relationships(
                                template_zip.read(notes_master_rels)
                            ):
                                if target_mode == "External":
                                    continue
                                target_part = self._resolve_target(notes_master_part, target)
                                if target_part not in original_names:
                                    self._copy_part_from_template(
                                        template_zip,
                                        template_names,
                                        target_part,
                                        original_names,
                                        additions,
                                    )
                                    added_part_names.add(target_part)

                    # For every slide that did not previously have notes, copy
                    # the generated notesSlide and merge only its relationship
                    # into the original slide rels.
                    for number in sorted(new_note_slides):
                        slide_part = self._slide_part_name(number)
                        slide_rels = self._slide_rels_name(number)
                        template_slide_rels = template_zip.read(slide_rels)
                        note_rel = self._find_relationship(template_slide_rels, "notesSlide")
                        if note_rel is None:
                            raise RuntimeError(
                                f"Generated package is missing notesSlide relationship for slide {number}."
                            )

                        if slide_rels not in original_names:
                            raise RuntimeError(
                                f"Original slide {number} has no relationship part; cannot safely attach notes."
                            )

                        replacements[slide_rels] = self._merge_relationship_type(
                            original_zip.read(slide_rels),
                            template_slide_rels,
                            relationship_suffix="notesSlide",
                        )

                        note_part = self._resolve_target(slide_part, note_rel[1])
                        self._copy_part_from_template(
                            template_zip,
                            template_names,
                            note_part,
                            original_names,
                            additions,
                        )
                        added_part_names.add(note_part)

                        note_rels = self._rels_name_for_part(note_part)
                        if note_rels in template_names:
                            self._copy_part_from_template(
                                template_zip,
                                template_names,
                                note_rels,
                                original_names,
                                additions,
                            )

                    # Merge only content-type declarations required by parts
                    # that are genuinely new in the final package.
                    if added_part_names:
                        replacements["[Content_Types].xml"] = self._merge_content_types(
                            original_zip.read("[Content_Types].xml"),
                            template_zip.read("[Content_Types].xml"),
                            added_part_names,
                        )

            # Write original parts first, replacing only the surgical set.
            with zipfile.ZipFile(working, "w") as output_zip:
                for info in original_zip.infolist():
                    data = replacements.get(info.filename, original_zip.read(info.filename))
                    self._write_entry(output_zip, info, data)

                for name, (data, info) in additions.items():
                    if name in original_names:
                        continue
                    if info is None:
                        output_zip.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
                    else:
                        self._write_entry(output_zip, info, data)

        working.replace(output_path)

    @staticmethod
    def _slide_part_name(number: int) -> str:
        return f"ppt/slides/slide{number}.xml"

    @staticmethod
    def _slide_rels_name(number: int) -> str:
        return f"ppt/slides/_rels/slide{number}.xml.rels"

    @staticmethod
    def _rels_name_for_part(part_name: str) -> str:
        directory = posixpath.dirname(part_name)
        basename = posixpath.basename(part_name)
        return posixpath.join(directory, "_rels", f"{basename}.rels")

    @staticmethod
    def _resolve_target(source_part: str, target: str) -> str:
        if target.startswith("/"):
            return target.lstrip("/")
        return posixpath.normpath(posixpath.join(posixpath.dirname(source_part), target))

    @staticmethod
    def _relationships(payload: bytes) -> list[tuple[str, str, str | None]]:
        root = ET.fromstring(payload)
        result: list[tuple[str, str, str | None]] = []
        for item in root.findall("r:Relationship", _REL_NS):
            result.append(
                (
                    item.attrib.get("Type", ""),
                    item.attrib.get("Target", ""),
                    item.attrib.get("TargetMode"),
                )
            )
        return result

    @classmethod
    def _find_relationship(cls, payload: bytes, suffix: str) -> tuple[str, str, str | None] | None:
        for rel_type, target, target_mode in cls._relationships(payload):
            if rel_type.rsplit("/", 1)[-1] == suffix:
                return rel_type, target, target_mode
        return None

    @classmethod
    def _merge_relationship_type(
        cls,
        original: bytes,
        template: bytes,
        *,
        relationship_suffix: str,
    ) -> bytes:
        original_root = ET.fromstring(original)
        template_root = ET.fromstring(template)

        template_rel = None
        for item in template_root.findall("r:Relationship", _REL_NS):
            if item.attrib.get("Type", "").rsplit("/", 1)[-1] == relationship_suffix:
                template_rel = item
                break
        if template_rel is None:
            raise RuntimeError(
                f"Template relationship '{relationship_suffix}' was not found."
            )

        # Remove only the same notes-specific relationship type if present.
        for item in list(original_root.findall("r:Relationship", _REL_NS)):
            if item.attrib.get("Type", "").rsplit("/", 1)[-1] == relationship_suffix:
                original_root.remove(item)

        used_ids = {
            item.attrib.get("Id", "")
            for item in original_root.findall("r:Relationship", _REL_NS)
        }
        preferred = template_rel.attrib.get("Id", "")
        rel_id = preferred if preferred and preferred not in used_ids else cls._next_rel_id(used_ids)

        attrib = dict(template_rel.attrib)
        attrib["Id"] = rel_id
        ET.SubElement(original_root, f"{{{_REL_NS_URI}}}Relationship", attrib)
        return ET.tostring(original_root, encoding="utf-8", xml_declaration=True)

    @staticmethod
    def _next_rel_id(used_ids: Iterable[str]) -> str:
        used = set(used_ids)
        number = 1
        while f"rId{number}" in used:
            number += 1
        return f"rId{number}"

    @staticmethod
    def _replace_notes_body(payload: bytes, text: str) -> bytes:
        root = ET.fromstring(payload)
        body_tx = None

        for shape in root.findall(".//p:sp", _P_NS):
            placeholder = shape.find("./p:nvSpPr/p:nvPr/p:ph", _P_NS)
            if placeholder is None or placeholder.attrib.get("type") != "body":
                continue
            body_tx = shape.find("./p:txBody", _P_NS)
            if body_tx is not None:
                break

        if body_tx is None:
            raise RuntimeError("Existing notes slide has no editable body placeholder.")

        for paragraph in list(body_tx.findall("a:p", _P_NS)):
            body_tx.remove(paragraph)

        lines = text.split("\n")
        if not lines:
            lines = [""]

        for line in lines:
            paragraph = ET.SubElement(body_tx, f"{{{_A_NS_URI}}}p")
            if line:
                run = ET.SubElement(paragraph, f"{{{_A_NS_URI}}}r")
                text_node = ET.SubElement(run, f"{{{_A_NS_URI}}}t")
                if line[:1].isspace() or line[-1:].isspace():
                    text_node.set(f"{{{_XML_NS_URI}}}space", "preserve")
                text_node.text = line

        return ET.tostring(root, encoding="utf-8", xml_declaration=True)

    @staticmethod
    def _merge_content_types(
        original: bytes,
        template: bytes,
        added_part_names: set[str],
    ) -> bytes:
        original_root = ET.fromstring(original)
        template_root = ET.fromstring(template)

        existing_overrides = {
            item.attrib.get("PartName", "")
            for item in original_root.findall("ct:Override", _CT_NS)
        }
        wanted = {f"/{name}" for name in added_part_names}

        for item in template_root.findall("ct:Override", _CT_NS):
            part_name = item.attrib.get("PartName", "")
            if part_name not in wanted or part_name in existing_overrides:
                continue
            ET.SubElement(original_root, f"{{{_CT_NS_URI}}}Override", dict(item.attrib))
            existing_overrides.add(part_name)

        return ET.tostring(original_root, encoding="utf-8", xml_declaration=True)

    @staticmethod
    def _copy_part_from_template(
        template_zip: zipfile.ZipFile,
        template_names: set[str],
        part_name: str,
        original_names: set[str],
        additions: dict[str, tuple[bytes, zipfile.ZipInfo | None]],
    ) -> None:
        if part_name in original_names or part_name in additions:
            return
        if part_name not in template_names:
            raise RuntimeError(f"Generated package is missing required part: {part_name}")
        additions[part_name] = (template_zip.read(part_name), template_zip.getinfo(part_name))

    @staticmethod
    def _write_entry(output_zip: zipfile.ZipFile, info: zipfile.ZipInfo, data: bytes) -> None:
        # Clone ZipInfo so writing does not mutate the source archive metadata.
        cloned = zipfile.ZipInfo(filename=info.filename, date_time=info.date_time)
        cloned.compress_type = info.compress_type
        cloned.comment = info.comment
        cloned.extra = info.extra
        cloned.create_system = info.create_system
        cloned.create_version = info.create_version
        cloned.extract_version = info.extract_version
        cloned.flag_bits = info.flag_bits
        cloned.volume = info.volume
        cloned.internal_attr = info.internal_attr
        cloned.external_attr = info.external_attr
        output_zip.writestr(cloned, data)
