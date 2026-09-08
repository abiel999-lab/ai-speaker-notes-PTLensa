# Vision MVP - v0.2.2

## Goal

Vision is optional. Text-only remains the economical default. Vision is used only when a presenter deck contains meaningful spatial information such as charts, flow diagrams, matrices, arrows, screenshots or image-heavy layouts.

## Windows renderer strategy

`SLIDE_RENDERER=auto` uses this order:

1. Microsoft PowerPoint COM automation when PowerPoint is installed and `pywin32` is available.
2. LibreOffice + PyMuPDF as fallback.

PowerPoint is preferred for the local Windows MVP because it renders using the same Office engine used to review the result. LibreOffice remains the recommended portable renderer for Linux/container/server workers.

## Per-job choice

`OPENAI_USE_VISION=true` enables the capability at server level. It does **not** force every AI job to use screenshots.

The UI offers:

- **Text-only — paling hemat**: text, tables, full-deck outline and neighbor context only.
- **Vision — teks + screenshot slide**: adds a PNG for every target slide in the current batch.

This makes A/B testing possible without editing `.env` or restarting the server.

## No-cost renderer test

Before making a paid Vision API request:

```powershell
.\scripts\test-vision-renderer.ps1
```

The script creates `examples\vision-test-deck.pptx` and renders four representative slides to `examples\vision-rendered\`. It does not call OpenAI.

Expected Windows output when PowerPoint is installed:

```text
Renderer ready    : True
Renderer provider : powerpoint
Rendered 4 slide(s) without using OpenAI API credit
```

LibreOffice output is also valid.

## Paid A/B validation

Use the same clean deck twice:

1. OpenAI + Text-only.
2. OpenAI + Vision.

Keep model, language, audience and depth identical. Compare:

- explanation of chart direction/magnitude,
- explanation of arrows/process order,
- understanding of matrix/quadrant position,
- references to visible relationships that are not recoverable from plain text,
- token/cost difference,
- note naturalness and repetition.

The output summary records whether Vision was used and which renderer created the screenshots.

## Security boundary

Rendering opens an uploaded presentation in an Office rendering engine. The MVP already rejects macro-enabled payloads and malformed/unsafe PPTX packages before rendering. For a production multi-user service, perform rendering in an isolated worker/container with organization-specific malware scanning and resource controls rather than desktop COM automation.

## Runtime resilience in v0.2.4

`SLIDE_RENDERER=auto` is now a runtime failover policy, not only a startup selection. On Windows it tries PowerPoint first and LibreOffice second when available. PowerPoint runs in a helper process with a configurable timeout.

If all rendering fails, `OPENAI_VISION_FALLBACK_TO_TEXT=true` allows the job to continue as text-only. The result carries a warning and `used_vision=false`; this must not be counted as successful Vision evidence.
