from app.core.config import Settings
from app.domain.models import Depth, GenerationOptions, PresentationDeck, SlideContent
from app.services.preflight import AICostGuardrailError, enforce_cost_guardrail, estimate_openai_job


def test_preflight_estimate_increases_when_vision_is_enabled():
    deck = PresentationDeck(
        slide_count=2,
        slides=[
            SlideContent(number=1, title="One", texts=["A" * 200]),
            SlideContent(number=2, title="Two", texts=["B" * 200]),
        ],
    )
    settings = Settings(_env_file=None, openai_batch_size=2)
    text = estimate_openai_job(
        full_deck=deck,
        target_deck=deck,
        options=GenerationOptions(depth=Depth.deep, use_vision=False),
        settings=settings,
    )
    vision = estimate_openai_job(
        full_deck=deck,
        target_deck=deck,
        options=GenerationOptions(depth=Depth.deep, use_vision=True),
        settings=settings,
    )
    assert vision.estimated_input_tokens > text.estimated_input_tokens
    assert vision.estimated_cost_usd > text.estimated_cost_usd


def test_preflight_cost_guardrail_blocks_before_paid_request():
    deck = PresentationDeck(
        slide_count=50,
        slides=[SlideContent(number=n, title="Large", texts=["X" * 2000]) for n in range(1, 51)],
    )
    settings = Settings(
        _env_file=None,
        openai_max_estimated_job_cost_usd=0.0001,
        openai_input_usd_per_mtok=0.2,
        openai_output_usd_per_mtok=1.2,
    )
    estimate = estimate_openai_job(
        full_deck=deck,
        target_deck=deck,
        options=GenerationOptions(depth=Depth.deep, use_vision=True),
        settings=settings,
    )
    try:
        enforce_cost_guardrail(estimate, settings)
    except AICostGuardrailError as exc:
        assert "cost guardrail" in str(exc)
    else:
        raise AssertionError("guardrail should have blocked the job")
