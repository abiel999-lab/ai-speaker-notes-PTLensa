from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings
from app.services.ppt_renderer import AutoSlideRenderer


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    settings = get_settings()
    deck = root / "examples" / "vision-test-deck.pptx"
    if not deck.exists():
        print("Vision test deck not found. Run scripts/create_vision_test_deck.py first.")
        return 2

    renderer = AutoSlideRenderer(
        mode=settings.slide_renderer,
        libreoffice_bin=settings.libreoffice_bin,
        dpi=settings.render_dpi,
    )
    print(f"Renderer mode     : {settings.slide_renderer}")
    print(f"Renderer ready    : {renderer.available()}")
    print(f"Renderer provider : {renderer.name}")
    print(f"Runtime           : {renderer.executable() or 'NOT FOUND'}")
    if not renderer.available():
        print("No renderer available. Install Microsoft PowerPoint or LibreOffice.")
        return 3

    out = root / "examples" / "vision-rendered"
    rendered = renderer.render(deck, out, slide_numbers={1, 2, 3, 4})
    print(f"Rendered {len(rendered)} slide(s) without using OpenAI API credit:")
    for number, path in sorted(rendered.items()):
        print(f"  slide {number}: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
