from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import get_settings
from app.domain.models import Depth, GenerationOptions, NotesMode
from app.services.pipeline import PresentationPipeline
from app.services.ppt_parser import PptxParser
from app.services.preflight import estimate_openai_job


def main() -> int:
    parser = argparse.ArgumentParser(description="Estimate OpenAI cost without making any API request.")
    parser.add_argument("pptx", type=Path)
    parser.add_argument("--vision", action="store_true")
    parser.add_argument("--depth", choices=[d.value for d in Depth], default=Depth.standard.value)
    parser.add_argument(
        "--notes-mode",
        choices=[m.value for m in NotesMode],
        default=NotesMode.missing_only.value,
    )
    args = parser.parse_args()

    settings = get_settings()
    deck = PptxParser().parse(args.pptx)
    options = GenerationOptions(
        depth=Depth(args.depth),
        notes_mode=NotesMode(args.notes_mode),
        use_vision=args.vision,
    )
    target = PresentationPipeline._select_generation_deck(deck, options.notes_mode)
    estimate = estimate_openai_job(
        full_deck=deck,
        target_deck=target,
        options=options,
        settings=settings,
    )

    print(f"Deck slides           : {deck.slide_count}")
    print(f"Existing notes        : {deck.existing_notes_count}")
    print(f"Target slides         : {estimate.target_slides}")
    print(f"Estimated batches     : {estimate.batch_count}")
    print(f"Vision                : {estimate.vision}")
    print(f"Estimated input tokens: {estimate.estimated_input_tokens:,}")
    print(f"Estimated output      : {estimate.estimated_output_tokens:,}")
    print(f"Estimated API cost    : ${estimate.estimated_cost_usd:.4f}")
    print(f"Configured cost limit : ${settings.openai_max_estimated_job_cost_usd:.4f}")
    print("No OpenAI API request was made. Estimate is conservative and not a billing quote.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
