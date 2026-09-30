from __future__ import annotations

from pathlib import Path

import pytest
from pptx import Presentation
from pptx.util import Inches


@pytest.fixture
def sample_pptx(tmp_path: Path) -> Path:
    path = tmp_path / "sample.pptx"
    prs = Presentation()

    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "Carbon Accounting"
    slide.placeholders[1].text = "Scope 1\nScope 2\nScope 3"

    slide2 = prs.slides.add_slide(prs.slide_layouts[5])
    slide2.shapes.title.text = "Emission Sources"
    table_shape = slide2.shapes.add_table(2, 2, Inches(1), Inches(2), Inches(6), Inches(1.5))
    table_shape.table.cell(0, 0).text = "Source"
    table_shape.table.cell(0, 1).text = "Category"
    table_shape.table.cell(1, 0).text = "Diesel"
    table_shape.table.cell(1, 1).text = "Scope 1"

    prs.save(path)
    return path
