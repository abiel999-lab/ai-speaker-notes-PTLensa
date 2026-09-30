from __future__ import annotations

import math
from dataclasses import dataclass

from app.core.config import Settings
from app.domain.models import GenerationOptions, NoteLength, PresentationDeck


class AICostGuardrailError(RuntimeError):
    pass


class AIInputGuardrailError(RuntimeError):
    pass


@dataclass(frozen=True)
class OpenAIPreflightEstimate:
    target_slides: int
    batch_count: int
    estimated_input_tokens: int
    estimated_output_tokens: int
    estimated_total_tokens: int
    estimated_cost_usd: float
    vision: bool
    method: str = "conservative-heuristic-v1"

    def as_dict(self) -> dict[str, object]:
        return {
            "target_slides": self.target_slides,
            "batch_count": self.batch_count,
            "estimated_input_tokens": self.estimated_input_tokens,
            "estimated_output_tokens": self.estimated_output_tokens,
            "estimated_total_tokens": self.estimated_total_tokens,
            "estimated_cost_usd": self.estimated_cost_usd,
            "vision": self.vision,
            "method": self.method,
        }



def _deck_source_chars(deck: PresentationDeck) -> int:
    total = 0
    for slide in deck.slides:
        total += len(slide.title or "")
        total += sum(len(item) for item in slide.texts)
        for table in slide.tables:
            for row in table:
                total += sum(len(cell) for cell in row)
    return total


def enforce_input_guardrails(
    *,
    full_deck: PresentationDeck,
    target_deck: PresentationDeck,
    options: GenerationOptions,
    settings: Settings,
) -> None:
    # Slide count itself is not a rejection criterion. The generator already sends
    # target slides to the model in small OPENAI_BATCH_SIZE chunks, so large decks
    # can proceed without a fixed 60/80-slide ceiling. Safety remains enforced by
    # upload/package validation, extracted-context size, cost, timeouts, retries,
    # checkpoints, and concurrency limits.
    source_chars = _deck_source_chars(full_deck)

    if (
        settings.openai_enforce_source_char_guardrail
        and source_chars > settings.openai_max_source_chars_per_job
    ):
        raise AIInputGuardrailError(
            f"Extracted slide content is too large for one AI job ({source_chars:,} characters; "
            f"limit {settings.openai_max_source_chars_per_job:,}). Split the presentation to keep "
            "requests predictable and avoid context/cost spikes."
        )

def estimate_openai_job(
    *,
    full_deck: PresentationDeck,
    target_deck: PresentationDeck,
    options: GenerationOptions,
    settings: Settings,
) -> OpenAIPreflightEstimate:
    """Estimate API usage before any paid request is made.

    This intentionally favors over-estimation. It is a guardrail, not a quote. The
    real API bill can differ because tokenization, caching, model behavior, and image
    token accounting are provider-controlled.
    """

    target_count = len(target_deck.slides)
    if target_count == 0:
        return OpenAIPreflightEstimate(0, 0, 0, 0, 0, 0.0, options.use_vision)

    batch_count = math.ceil(target_count / settings.openai_batch_size)

    # 4 chars/token is a common rough estimate for mixed English/Indonesian prose.
    full_deck_tokens = max(1, math.ceil(_deck_source_chars(full_deck) / 4))
    target_tokens = max(1, math.ceil(_deck_source_chars(target_deck) / 4))

    # One briefing request sees the full deck. Each note batch gets the outline plus
    # target detail and nearby-slide context. The factor intentionally includes prompt
    # overhead and repeated outline text.
    estimated_input = full_deck_tokens + batch_count * (full_deck_tokens + target_tokens // max(1, batch_count) + 450)

    if options.use_vision:
        estimated_input += target_count * settings.openai_vision_estimated_input_tokens_per_slide

    per_slide_output = {
        NoteLength.under_100: 170,
        NoteLength.words_100_250: 400,
        NoteLength.words_250_500: 800,
        NoteLength.custom: max(100, int((options.custom_word_limit or 150) * 1.6)),
    }[options.note_length]
    estimated_output = 700 + target_count * per_slide_output
    total = estimated_input + estimated_output
    cost = settings.estimated_openai_cost_usd(
        model=options.model.value,
        input_tokens=estimated_input,
        output_tokens=estimated_output,
    )
    return OpenAIPreflightEstimate(
        target_slides=target_count,
        batch_count=batch_count,
        estimated_input_tokens=estimated_input,
        estimated_output_tokens=estimated_output,
        estimated_total_tokens=total,
        estimated_cost_usd=cost,
        vision=options.use_vision,
    )


def enforce_cost_guardrail(estimate: OpenAIPreflightEstimate, settings: Settings) -> None:
    if not settings.openai_enforce_cost_guardrail:
        return
    limit = settings.openai_max_estimated_job_cost_usd
    if limit <= 0:
        return
    if estimate.estimated_cost_usd > limit:
        raise AICostGuardrailError(
            "Preflight estimate exceeds the configured per-job API cost guardrail: "
            f"estimated ${estimate.estimated_cost_usd:.4f} > limit ${limit:.4f}. "
            "Increase OPENAI_MAX_ESTIMATED_JOB_COST_USD only after reviewing the deck and model settings."
        )
