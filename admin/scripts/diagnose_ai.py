from __future__ import annotations

from app.core.config import get_settings
from app.core.version import get_app_version
from app.services.ppt_renderer import AutoSlideRenderer


def main() -> int:
    settings = get_settings()
    renderer = AutoSlideRenderer(
        mode=settings.slide_renderer,
        libreoffice_bin=settings.libreoffice_bin,
        dpi=settings.render_dpi,
        powerpoint_timeout_seconds=settings.powerpoint_render_timeout_seconds,
    )

    print(f"App version        : {get_app_version()}")
    print(f"OpenAI configured  : {settings.openai_configured}")
    print(f"OpenAI model       : {settings.openai_model}")
    print(f"Reasoning effort   : {settings.openai_reasoning_effort}")
    print(f"Vision feature     : {settings.openai_use_vision}")
    print(f"Renderer mode      : {settings.slide_renderer}")
    print(f"Renderer ready     : {renderer.available()}")
    print(f"Renderer provider  : {renderer.name}")
    print(f"Renderer runtime   : {renderer.executable() or 'NOT FOUND'}")
    print(f"Input $/1M tokens  : {settings.openai_input_usd_per_mtok}")
    print(f"Output $/1M tokens : {settings.openai_output_usd_per_mtok}")
    print(f"Cost guardrail/job : ${settings.openai_max_estimated_job_cost_usd:.4f}")
    print(f"Checkpoint resume  : {settings.openai_resume_checkpoints}")
    print(f"Vision text fallback: {settings.openai_vision_fallback_to_text}")
    print(f"PowerPoint timeout : {settings.powerpoint_render_timeout_seconds}s")
    print()

    if not settings.openai_configured:
        print("ACTION: add OPENAI_API_KEY to .env, then run this diagnostic again.")
        return 2

    print("OpenAI text-only runtime is ready.")
    if settings.openai_use_vision and renderer.available():
        print(f"Vision runtime is ready via {renderer.name}.")
        print("Run .\\scripts\\test-vision-renderer.ps1 before the first paid Vision request.")
    elif settings.openai_use_vision:
        print(
            "VISION ACTION: no renderer is available. On Windows, Microsoft PowerPoint "
            "is preferred automatically; LibreOffice is the fallback."
        )
    else:
        print("Vision is disabled by OPENAI_USE_VISION=false; text-only jobs remain available.")

    print("No OpenAI API request was made by this diagnostic.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
