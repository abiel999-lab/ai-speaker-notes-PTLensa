from __future__ import annotations

from pathlib import Path

from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "examples" / "vision-test-deck.pptx"


def add_title(slide, title: str, subtitle: str) -> None:
    title_box = slide.shapes.add_textbox(Inches(0.7), Inches(0.35), Inches(11.8), Inches(0.7))
    p = title_box.text_frame.paragraphs[0]
    p.text = title
    p.font.size = Pt(26)
    p.font.bold = True
    sub = slide.shapes.add_textbox(Inches(0.72), Inches(1.02), Inches(11.2), Inches(0.45))
    sp = sub.text_frame.paragraphs[0]
    sp.text = subtitle
    sp.font.size = Pt(11)


def add_box(slide, x, y, w, h, text: str, fill: tuple[int, int, int]) -> None:
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor(*fill)
    shape.line.color.rgb = RGBColor(180, 190, 205)
    tf = shape.text_frame
    tf.clear()
    p = tf.paragraphs[0]
    p.text = text
    p.alignment = PP_ALIGN.CENTER
    p.font.size = Pt(15)
    p.font.bold = True


def main() -> None:
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    slide = prs.slides.add_slide(blank)
    add_title(
        slide,
        "Vision Test: Can AI Understand More Than Text?",
        "A clean four-slide deck designed to compare text-only speaker notes with visual analysis.",
    )
    add_box(slide, Inches(0.9), Inches(2.1), Inches(3.4), Inches(1.3), "TEXT\nWhat is written", (235, 244, 255))
    add_box(slide, Inches(4.95), Inches(2.1), Inches(3.4), Inches(1.3), "VISION\nHow it is arranged", (235, 250, 242))
    add_box(slide, Inches(9.0), Inches(2.1), Inches(3.4), Inches(1.3), "NOTES\nExplain the meaning", (255, 244, 226))
    arrow1 = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(4.35), Inches(2.48), Inches(0.5), Inches(0.5))
    arrow2 = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(8.4), Inches(2.48), Inches(0.5), Inches(0.5))
    for arrow in (arrow1, arrow2):
        arrow.fill.solid()
        arrow.fill.fore_color.rgb = RGBColor(100, 116, 139)
        arrow.line.fill.background()

    slide = prs.slides.add_slide(blank)
    add_title(
        slide,
        "Process Flow",
        "The important information is the left-to-right sequence and the feedback loop, not only the labels.",
    )
    labels = ["Upload PPTX", "Parse deck", "Render slide", "Generate notes", "Write back"]
    fills = [(238, 245, 255), (238, 245, 255), (236, 253, 245), (255, 247, 237), (245, 243, 255)]
    xs = [0.45, 2.95, 5.45, 7.95, 10.45]
    for i, (label, fill, x) in enumerate(zip(labels, fills, xs, strict=True)):
        add_box(slide, Inches(x), Inches(2.2), Inches(2.0), Inches(1.0), label, fill)
        if i < len(labels) - 1:
            arrow = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x + 2.05), Inches(2.45), Inches(0.75), Inches(0.48))
            arrow.fill.solid()
            arrow.fill.fore_color.rgb = RGBColor(59, 130, 246)
            arrow.line.fill.background()
    loop = slide.shapes.add_shape(MSO_SHAPE.LEFT_RIGHT_ARROW, Inches(5.2), Inches(4.25), Inches(5.5), Inches(0.6))
    loop.fill.solid()
    loop.fill.fore_color.rgb = RGBColor(224, 242, 254)
    loop.line.color.rgb = RGBColor(14, 116, 144)
    loop.text_frame.text = "Human review / regenerate selected slide"

    slide = prs.slides.add_slide(blank)
    add_title(
        slide,
        "Illustrative Preparation Time",
        "Synthetic values for testing only. Vision should be able to describe the relative difference shown by the chart.",
    )
    chart_data = ChartData()
    chart_data.categories = ["Manual notes", "AI draft + review"]
    chart_data.add_series("Minutes", (42, 9))
    chart = slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        Inches(1.35),
        Inches(1.75),
        Inches(10.6),
        Inches(4.5),
        chart_data,
    ).chart
    chart.has_legend = False
    chart.has_title = True
    chart.chart_title.text_frame.text = "Illustrative minutes per short deck"
    chart.value_axis.has_major_gridlines = True

    slide = prs.slides.add_slide(blank)
    add_title(
        slide,
        "When Vision Adds the Most Value",
        "The quadrant position is the message: spatial arrangement changes the interpretation.",
    )
    # Axes
    horiz = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(2.0), Inches(5.5), Inches(9.4), Inches(0.04))
    vert = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(6.65), Inches(1.5), Inches(0.04), Inches(4.05))
    for axis in (horiz, vert):
        axis.fill.solid()
        axis.fill.fore_color.rgb = RGBColor(100, 116, 139)
        axis.line.fill.background()
    add_box(slide, Inches(2.6), Inches(4.2), Inches(2.5), Inches(0.8), "Text-heavy slide", (241, 245, 249))
    add_box(slide, Inches(8.2), Inches(4.2), Inches(2.3), Inches(0.8), "Simple table", (241, 245, 249))
    add_box(slide, Inches(2.6), Inches(2.0), Inches(2.5), Inches(0.8), "Flow diagram", (236, 253, 245))
    add_box(slide, Inches(8.2), Inches(2.0), Inches(2.3), Inches(0.8), "Chart / matrix", (255, 247, 237))
    x_label = slide.shapes.add_textbox(Inches(5.15), Inches(5.7), Inches(3.1), Inches(0.4))
    x_label.text_frame.text = "More spatial meaning →"
    y_label = slide.shapes.add_textbox(Inches(0.55), Inches(1.3), Inches(1.5), Inches(0.8))
    y_label.text_frame.text = "More visual\ninterpretation ↑"

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(OUTPUT)
    print(f"Created: {OUTPUT}")


if __name__ == "__main__":
    main()
