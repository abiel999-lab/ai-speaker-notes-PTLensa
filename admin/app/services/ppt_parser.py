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

            if slide.shapes.title is not None and slide.shapes.title.has_text_frame:
                candidate = slide.shapes.title.text.strip()
                title = candidate or None

            for shape in slide.shapes:
                if getattr(shape, "has_text_frame", False):
                    text = shape.text.strip()
                    if text:
                        texts.append(text)

                if shape.shape_type == MSO_SHAPE_TYPE.TABLE:
                    table_data: list[list[str]] = []
                    for row in shape.table.rows:
                        table_data.append([cell.text.strip() for cell in row.cells])
                    tables.append(table_data)

                if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
                    image_count += 1
                if getattr(shape, "has_chart", False):
                    chart_count += 1

            has_existing_notes = False
            if slide.has_notes_slide:
                text_frame = slide.notes_slide.notes_text_frame
                has_existing_notes = bool(text_frame and text_frame.text.strip())

            # PowerPoint stores hidden state on the slide root as show="0".
            hidden = slide._element.get("show") == "0"  # noqa: SLF001 - OOXML metadata unavailable publicly

            image_relationships = [
                rel for rel in slide.part.rels.values() if rel.reltype == RT.IMAGE
            ]
            external_image_count = sum(1 for rel in image_relationships if rel.is_external)
            # Picture placeholders are not always reported as PICTURE shapes by python-pptx.
            # Relationship count is a safer lower-level signal that a slide contains media.
            internal_image_count = sum(1 for rel in image_relationships if not rel.is_external)
            image_count = max(image_count, internal_image_count)

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
