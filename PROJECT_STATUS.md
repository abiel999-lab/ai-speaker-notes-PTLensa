# Project Status — v0.2.5 Hardening

## Implemented / passed in build environment

- secure PPTX upload and package validation
- full-deck parser
- existing speaker-notes protection modes
- package-preserving OOXML write-back
- strict integrity gate
- GPT-5.6 Luna OpenAI provider
- full-deck briefing + batched Structured Outputs
- per-job Text-only / Vision
- PowerPoint + LibreOffice renderer abstraction
- runtime renderer fallback in auto mode
- isolated PowerPoint helper process + timeout
- configurable Vision -> text-only fallback with warning
- harmless extra-slide filtering
- narrow missing-slide recovery
- atomic AI checkpoints
- compatible checkpoint resume
- failed-job retry endpoint/UI
- in-process per-job idempotency lock
- no-cost preflight estimate
- configurable per-job cost guardrail before paid generation
- token/request/actual-estimate reporting
- **37 automated tests passing**
- deterministic non-AI verification PASS

## Operator validation still required

1. Upgrade to v0.2.5 while preserving `.env`.
2. Run `setup.ps1` and `verify.ps1` — expect 37 tests.
3. Run `diagnose-ai.ps1`.
4. Run `test-vision-renderer.ps1` — no API cost.
5. Run `preflight-cost.ps1` against the intended real deck — no API cost.
6. Run one real Vision job.
7. Confirm result reports the actual Vision renderer or an explicit text-only fallback warning.
8. Open output in Microsoft PowerPoint and verify no new Repair/Recover warning.
9. Verify notes quality and package integrity.
10. Capture evidence for the MVP documentation.

## Hardening exit criterion

The v0.2.x MVP can be closed for today's documentation after a clean real-world Vision job passes with:

- Vision renderer actually used,
- all target notes produced,
- output PPTX opens cleanly,
- integrity gate passes,
- cost/token metadata recorded,
- no unresolved recovery errors.

## Deferred

Per-slide review/regenerate, production frontend, authentication, PostgreSQL/Redis, distributed queue, deployment observability, RAG, approval workflow, enterprise malware scanning.
