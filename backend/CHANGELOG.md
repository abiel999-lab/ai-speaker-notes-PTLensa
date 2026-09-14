# Changelog

## 0.2.6 - Audience, note length, and custom instructions

- Added audience presets for Akademisi and Mahasiswa.
- Added per-slide note length presets: <100, 100-250, 250-500 words, plus a custom maximum (30-600).
- Added optional custom instructions up to 2,000 characters.
- Updated OpenAI prompt, checkpoint signature, output-token budget, and preflight cost estimate to respect note length.
- Added local and Hostinger frontend controls for the new options.

## 0.2.5 - 2026-09-08

- Added narrow missing-slide semantic recovery: successful target notes are kept and only unresolved slides are requested again.
- Added atomic per-job `ai-checkpoint.json` and compatible resume after a failed job.
- Added failed-job retry API/UI while preserving checkpoints.
- Added per-job in-process execution lock to ignore duplicate runs in one app process.
- Added conservative `ai-preflight.json` cost estimation and configurable pre-generation cost guardrail.
- Added zero-cost `preflight-cost.ps1` CLI estimator.
- Added runtime renderer fallback in `auto` mode (PowerPoint -> LibreOffice).
- Isolated PowerPoint COM rendering in a helper process with a configurable timeout.
- Added configurable Vision -> text-only fallback with explicit warnings when rendering cannot complete.
- Added resume/recovery/warning/preflight metadata to job results and UI summaries.
- Automated suite increased to **37 passing tests**.

## 0.2.3

- Fixed Vision/full-deck batch validation when the model returns an extra context-only neighbor slide.
- Extra non-target slide notes are now ignored if every requested target slide is present exactly once.
- Missing or duplicate target slides still retry/fail closed.
- Strengthened the batch prompt to state that neighbor slides are context-only.
- Avoids unnecessary semantic retries and API cost for harmless extra-slide responses.

## 0.2.2 - 2026-09-08

- Added per-job Text-only vs Vision selection; Text-only stays the cost-saving default.
- Added `AutoSlideRenderer` abstraction.
- Added Microsoft PowerPoint COM renderer via Windows-only `pywin32`; `auto` prefers PowerPoint locally on Windows.
- Kept LibreOffice + PyMuPDF as portable fallback and recommended server renderer.
- Render only target slides that actually need generated notes.
- Added renderer provider to job/result metadata and UI cost summary.
- Added no-cost `test-vision-renderer.ps1` preflight.
- Added a clean four-slide Vision A/B test deck generator with flow, chart and quadrant examples.
- Fixed unit-test isolation so a real developer `.env` / API key cannot change the not-configured API test.
- Added Vision payload tests and renderer-selection tests.
- Automated suite increased to 27 passing tests.
- Updated Vision/security/architecture/testing documentation.

## 0.2.1 - 2026-09-08

- Fixed Windows `diagnose-ai.ps1` quoting failure by moving Python diagnostics into `scripts/diagnose_ai.py`.
- Added explicit diagnostic output for model, reasoning effort, vision, renderer, and configured token-price estimator.
- Changed development defaults to `gpt-5.6-luna` with configurable $0.20/M input and $1.20/M output estimates.
- `setup.ps1` now clears stale editable-install `*.egg-info` metadata before reinstalling and prints both app and installed distribution versions.
- No change to the package-preserving PPTX write-back pipeline.


## 0.2.0

- added optional OpenAI Responses API provider,
- default AI model configuration set to GPT-5.6 Terra,
- added Pydantic Structured Outputs,
- added full-deck briefing before slide-note generation,
- added configurable batched slide generation,
- added optional slide vision,
- replaced Poppler dependency with PyMuPDF for PDF -> PNG rendering,
- added LibreOffice auto-detection on Windows,
- added token usage, request count and estimated cost reporting,
- added OpenAI configuration / vision capability UI,
- added explicit confirmation before external AI processing,
- added `store=False` for OpenAI responses,
- added local AI generation report without secrets,
- added fake-client OpenAI tests with zero API spend,
- retained v0.1.3 package-preserving OOXML write-back and integrity gate.

## 0.1.3

Package-preserving OOXML notes write-back and stronger integrity validation.

### UI/reasoning refinement
- Generator tetap menampilkan GPT-5.6 Luna.
- Kedalaman analisis sekarang memakai Low / Medium / High dan langsung memetakan reasoning effort OpenAI per job.
- Istilah Vision di UI diganti menjadi Text + image analysis / Image Analysis agar lebih mudah dipahami pengguna.
- Nama internal `use_vision` dan `OPENAI_USE_VISION` dipertahankan untuk kompatibilitas backend.

## 0.2.7 — 2026-09-13

- Fixed hidden-slide / LibreOffice page-number mismatch that could disable Vision for an entire job.
- Added temporary hidden-slide normalization for rendering without modifying the uploaded or output PPTX.
- Added per-slide renderer recovery and partial Vision fallback.
- Added visual structure metadata (images, charts, hidden slides, external media).
- Added structural contradiction guard for obviously false “no text or visual” notes.
- Added bilingual Indonesian/English public UI and clearer reliability diagnostics.
- Added regression tests for hidden slides, visual-only slides, partial Vision, and contradiction detection.

## 0.2.8 — 2026-09-13

### Added
- Redesigned responsive white/green interface with clearer information hierarchy and student-friendly presets.
- Bilingual Indonesian/English UI toggle.
- `/how-to` onboarding and troubleshooting page.
- `/legal` Terms, Privacy, AI notice, Acceptable Use, limits, and retention baseline.
- Optional single-account login with signed HttpOnly sessions, expiry, brute-force limiting, versioned Terms acceptance, CSRF protection, and job ownership.
- File-aware Chat AI page and API with bounded message length, turns, history, selected/relevant slide context, and output size.
- Job history API and manual job deletion.
- Startup recovery for interrupted queued/processing jobs.
- Per-user active-job limit.
- AI input guardrails for slide count, Vision slide count, source character count, and cost.
- Default rejection of embedded OLE/package objects.

### Changed
- Quality-first default model upgraded from GPT-5.6 Luna to GPT-5.6 Sol with medium reasoning.
- Custom instructions limited to 1,500 characters and custom visible notes to 500 words/slide.
- Default API price-estimate fields updated for GPT-5.6 Sol and remain configurable.
- Result UI now surfaces visual coverage, hidden slides, warnings, retry, Chat AI, and recent jobs separately instead of one long technical status sentence.

### Reliability / Security
- Preserves v0.2.7 hidden-slide normalization, per-slide Vision recovery, image-only structural detection, external-media warning, semantic contradiction guard, checkpoint resume, and OOXML integrity validation.
- Added session-bound CSRF checks for authenticated mutations and owner-aware job reads.
