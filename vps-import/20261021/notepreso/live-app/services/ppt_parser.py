from __future__ import annotations

from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE
from pptx.opc.constants import RELATIONSHIP_TYPE as RT

from app.domain.models import PresentationDeck, SlideContent


class PptxParser:
    """Parse slide text plus structural signals used by the reliability layer.

    Speaker-note generation must not confuse "no extractable text" with "blank slide".
    We therefore keep lightweight visual metadata and hidden-slide state in the canonical
    slide manifest. External image relationships are counted but never fetched by the app.
    """

    def parse(self, path: Path) -> PresentationDeck:
        presentation = Presentation(path)
        slides: list[SlideContent] = []

        for number, slide in enumerate(presentation.slides, start=1):
            texts: list[str] = []
            tables: list[list[list[str]]] = []
            title = None
            image_count = 0
            chart_count = 0

            try:
                title_shape = slide.shapes.title
                if title_shape is not None and title_shape.has_text_frame:
                    candidate = title_shape.text.strip()
                    title = candidate or None
            except Exception:
                # A malformed title placeholder must not invalidate the slide.
                title = None

            try:
                shapes = list(slide.shapes)
            except Exception:
                shapes = []

            for shape in shapes:
                try:
                    if getattr(shape, "has_text_frame", False):
                        text = shape.text.strip()
                        if text:
                            texts.append(text)
                except Exception:
                    pass

                try:
                    if shape.shape_type == MSO_SHAPE_TYPE.TABLE:
                        table_data: list[list[str]] = []
                        for row in shape.table.rows:
                            table_data.append([cell.text.strip() for cell in row.cells])
                        tables.append(table_data)
                except Exception:
                    pass

                try:
                    if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                        image_count += 1
                except Exception:
                    pass
                try:
                    if getattr(shape, "has_chart", False):
                        chart_count += 1
                except Exception:
                    pass

            has_existing_notes = False
            try:
                if slide.has_notes_slide:
                    text_frame = slide.notes_slide.notes_text_frame
                    has_existing_notes = bool(text_frame and text_frame.text.strip())
            except Exception:
                # Broken notes structures are repaired later by PptxNotesWriter.
                has_existing_notes = False

            try:
                hidden = slide._element.get("show") == "0"  # noqa: SLF001
            except Exception:
                hidden = False

            external_image_count = 0
            try:
                image_relationships = [
                    rel for rel in slide.part.rels.values() if rel.reltype == RT.IMAGE
                ]
                external_image_count = sum(1 for rel in image_relationships if rel.is_external)
                internal_image_count = sum(1 for rel in image_relationships if not rel.is_external)
                image_count = max(image_count, internal_image_count)
            except Exception:
                pass

            slides.append(
                SlideContent(
                    number=number,
                    title=title,
                    texts=texts,
                    tables=tables,
                    has_existing_notes=has_existing_notes,
                    hidden=hidden,
                    image_count=image_count,
                    chart_count=chart_count,
                    external_image_count=external_image_count,
                )
            )

        return PresentationDeck(slide_count=len(slides), slides=slides)
