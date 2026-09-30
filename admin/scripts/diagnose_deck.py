from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.services.ppt_parser import PptxParser


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect PPTX reliability signals without calling AI.")
    parser.add_argument("pptx", type=Path)
    parser.add_argument("--json", action="store_true", help="Print full slide manifest as JSON.")
    args = parser.parse_args()

    deck = PptxParser().parse(args.pptx)
    hidden = [s.number for s in deck.slides if s.hidden]
    image_dominant = [s.number for s in deck.slides if s.has_visual_content and not s.texts]
    external = {s.number: s.external_image_count for s in deck.slides if s.external_image_count}

    if args.json:
        print(json.dumps(deck.model_dump(mode="json"), ensure_ascii=False, indent=2))
        return 0

    print(f"Slides: {deck.slide_count}")
    print(f"Existing notes: {deck.existing_notes_count}")
    print(f"Hidden slides ({len(hidden)}): {hidden or '-'}")
    print(f"Image/visual-dominant slides ({len(image_dominant)}): {image_dominant or '-'}")
    print(f"External image relationships: {sum(external.values())}")
    if external:
        print(f"External-media slides: {external}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
