# Hardening Notes — v0.2.4

## Goal

Make the current MVP resilient to partial AI output, transient job failure, renderer instability, and accidental high-cost jobs without weakening the PPTX integrity gate.

## Recoverable generation contract

For each requested batch, target slide numbers are authoritative. AI output is classified as:

- **usable**: exactly one non-empty note for a target slide,
- **context-only extra**: ignored and logged,
- **missing**: requested again in a narrow recovery request,
- **duplicate/empty**: treated as unresolved and recovered again,
- **still unresolved after bounded recovery**: fail closed.

Successful notes are written atomically to `ai-checkpoint.json` after every request. A checkpoint is only reused when its SHA-256 generation signature matches the deck, target slides, model, prompt version, options, batching, and Vision mode.

## Retry model

`POST /api/v1/jobs/{job_id}/retry` is allowed only for failed jobs. The input PPTX and checkpoint remain in the job directory. A compatible checkpoint can reuse:

- deck brief,
- previously generated notes,
- cumulative token/request metadata.

This avoids paying again for successful batches.

## Renderer resilience

`SLIDE_RENDERER=auto` uses runtime fallback:

1. PowerPoint on Windows when available,
2. LibreOffice when available.

PowerPoint rendering runs in `python -m app.services.powerpoint_worker` with `POWERPOINT_RENDER_TIMEOUT_SECONDS`.

If all renderers fail and `OPENAI_VISION_FALLBACK_TO_TEXT=true`, the pipeline continues text-only and stores a warning in the job/result metadata. This fallback is explicit in the UI result and must not be mistaken for a successful Vision run.

## Cost guardrail

`ai-preflight.json` is created before note-generation API requests. It estimates repeated deck-outline context, batch count, expected output by depth, and optional image-token overhead.

`OPENAI_MAX_ESTIMATED_JOB_COST_USD` stops a job before paid generation when the estimate exceeds the configured threshold. Set it to `0` only when intentionally disabling the guardrail.

The estimator is deliberately conservative and not a billing quote.

## Idempotency boundary

The MVP now prevents duplicate execution for the same job ID inside one application process. This is not distributed idempotency. Multi-node deployment still requires a shared durable queue / database lease.

## Known remaining risks

- External API provider behavior and pricing can change.
- PowerPoint COM can leave an orphan process after a hard timeout on some systems.
- File-based checkpoints are not suitable for multi-node execution without shared storage/locking.
- No AV/sandbox scanner is integrated.
- Hidden-slide and embedded-media policy remains future work.
- Human validation is still mandatory for important claims, numbers, standards, dates, and regulations.
