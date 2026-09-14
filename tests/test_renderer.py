from pathlib import Path

import app.services.ppt_renderer as renderer_module
from app.services.ppt_renderer import AutoSlideRenderer


def test_auto_renderer_prefers_powerpoint_on_windows(monkeypatch):
    renderer = AutoSlideRenderer(mode="auto")
    monkeypatch.setattr(renderer_module.os, "name", "nt")
    monkeypatch.setattr(renderer.powerpoint, "available", lambda: True)
    monkeypatch.setattr(renderer.libreoffice, "available", lambda: True)

    assert renderer.selected() is renderer.powerpoint
    assert renderer.name == "powerpoint"


def test_auto_renderer_falls_back_to_libreoffice(monkeypatch):
    renderer = AutoSlideRenderer(mode="auto")
    monkeypatch.setattr(renderer.powerpoint, "available", lambda: False)
    monkeypatch.setattr(renderer.libreoffice, "available", lambda: True)

    assert renderer.selected() is renderer.libreoffice
    assert renderer.name == "libreoffice"


def test_explicit_renderer_mode_does_not_silently_switch(monkeypatch):
    renderer = AutoSlideRenderer(mode="powerpoint")
    monkeypatch.setattr(renderer.powerpoint, "available", lambda: False)
    monkeypatch.setattr(renderer.libreoffice, "available", lambda: True)

    assert renderer.selected() is None
    assert renderer.available() is False


def test_auto_renderer_delegates_only_requested_slides(monkeypatch, tmp_path: Path):
    renderer = AutoSlideRenderer(mode="libreoffice")
    monkeypatch.setattr(renderer.libreoffice, "available", lambda: True)
    calls = {}

    def fake_render(pptx_path, output_dir, *, slide_numbers=None):
        calls["pptx"] = pptx_path
        calls["slides"] = slide_numbers
        return {2: output_dir / "slide-002.png"}

    monkeypatch.setattr(renderer.libreoffice, "render", fake_render)
    source = tmp_path / "source.pptx"
    result = renderer.render(source, tmp_path / "out", slide_numbers={2})

    assert calls["slides"] == {2}
    assert result[2].name == "slide-002.png"


def test_auto_renderer_runtime_fallbacks_from_powerpoint_to_libreoffice(monkeypatch, tmp_path: Path):
    renderer = AutoSlideRenderer(mode="auto")
    monkeypatch.setattr(renderer_module.os, "name", "nt")
    monkeypatch.setattr(renderer.powerpoint, "available", lambda: True)
    monkeypatch.setattr(renderer.libreoffice, "available", lambda: True)
    monkeypatch.setattr(
        renderer.powerpoint,
        "render",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("COM failed")),
    )

    def lo_render(pptx_path, output_dir, *, slide_numbers=None):
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / "slide-001.png"
        path.write_bytes(b"png")
        return {1: path}

    monkeypatch.setattr(renderer.libreoffice, "render", lo_render)
    result = renderer.render(tmp_path / "source.pptx", tmp_path / "out", slide_numbers={1})

    assert result[1].exists()
    assert renderer.name == "libreoffice"


def test_hidden_slide_normalization_preserves_slide_count(tmp_path: Path):
    from pptx import Presentation
    from app.services.ppt_renderer import _make_hidden_slides_renderable

    source = tmp_path / "hidden.pptx"
    normalized = tmp_path / "normalized.pptx"
    prs = Presentation()
    first = prs.slides.add_slide(prs.slide_layouts[6])
    second = prs.slides.add_slide(prs.slide_layouts[6])
    first._element.set("show", "0")
    prs.save(source)

    count = _make_hidden_slides_renderable(source, normalized)
    reparsed = Presentation(normalized)

    assert count == 1
    assert len(reparsed.slides) == 2
    assert reparsed.slides[0]._element.get("show") != "0"
    assert reparsed.slides[1]._element.get("show") != "0"
