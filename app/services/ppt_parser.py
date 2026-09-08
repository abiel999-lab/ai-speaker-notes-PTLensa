from __future__ import annotations

from pathlib import Path

from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

from app.domain.models import PresentationDeck, SlideContent


class PptxParser:
    def parse(self, path: Path) -> PresentationDeck:
        presentation = Presentation(path)
        slides: list[SlideContent] = []

        for number, slide in enumerate(presentation.slides, start=1):
            texts: list[str] = []
            tables: list[list[list[str]]] = []
            title = None

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

            has_existing_notes = False
            if slide.has_notes_slide:
                text_frame = slide.notes_slide.notes_text_frame
                has_existing_notes = bool(text_frame and text_frame.text.strip())

            slides.append(
                SlideContent(
                    number=number,
                    title=title,
                    texts=texts,
                    tables=tables,
                    has_existing_notes=has_existing_notes,
                )
            )

        return PresentationDeck(slide_count=len(slides), slides=slides)
