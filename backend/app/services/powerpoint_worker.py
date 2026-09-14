from __future__ import annotations

import argparse
from pathlib import Path


def render_powerpoint(
    pptx_path: Path,
    output_dir: Path,
    *,
    dpi: int,
    slide_numbers: set[int] | None,
) -> None:
    import pythoncom
    import win32com.client

    output_dir.mkdir(parents=True, exist_ok=True)
    pythoncom.CoInitialize()
    application = None
    presentation = None
    try:
        application = win32com.client.DispatchEx("PowerPoint.Application")
        presentation = application.Presentations.Open(
            str(pptx_path.resolve()), True, False, False
        )

        slide_count = int(presentation.Slides.Count)
        requested = slide_numbers or set(range(1, slide_count + 1))
        invalid = sorted(n for n in requested if n < 1 or n > slide_count)
        if invalid:
            raise RuntimeError(f"Requested slide numbers are outside the deck: {invalid[:10]}")

        width_px = max(1, int(float(presentation.PageSetup.SlideWidth) * dpi / 72.0))
        height_px = max(1, int(float(presentation.PageSetup.SlideHeight) * dpi / 72.0))

        for number in sorted(requested):
            target = output_dir / f"slide-{number:03d}.png"
            presentation.Slides(number).Export(
                str(target.resolve()),
                "PNG",
                width_px,
                height_px,
            )
            if not target.exists() or target.stat().st_size == 0:
                raise RuntimeError(f"PowerPoint did not render slide {number}.")
    finally:
        if presentation is not None:
            try:
                presentation.Close()
            except Exception:
                pass
        if application is not None:
            try:
                application.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pptx")
    parser.add_argument("output_dir")
    parser.add_argument("--dpi", type=int, default=120)
    parser.add_argument("--slides", default="")
    args = parser.parse_args()

    slide_numbers = None
    if args.slides.strip():
        slide_numbers = {int(part) for part in args.slides.split(",") if part.strip()}

    render_powerpoint(
        Path(args.pptx),
        Path(args.output_dir),
        dpi=args.dpi,
        slide_numbers=slide_numbers,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
