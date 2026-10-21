# Hardening 0.2.7 — Reliability, Vision, and UI

This release focuses on preventing a single malformed or unusual PowerPoint slide from degrading the whole job.

## Reliability changes

- Hidden slides are detected in the canonical slide manifest.
- LibreOffice rendering uses a disposable normalized PPTX copy where hidden flags are removed so PDF page numbering remains aligned with PowerPoint slide numbering.
- The uploaded source and final PPTX are never changed by that normalization step.
- If batch rendering fails, the pipeline retries slides individually and keeps every successful image.
- Partial Vision is supported: missing screenshots fall back to text/structure context for those slides only; Vision remains active for the rest of the deck.
- Slide structure records image, chart, table, hidden-slide, and external-image signals.
- Image-only slides are no longer treated as blank simply because no PowerPoint text object can be extracted.
- A narrow structural quality gate rejects generated notes that explicitly claim a visual slide has “no text or visual,” forcing semantic recovery instead of checkpointing an obviously contradictory note.
- External image relationships are detected but never fetched from the network. This avoids unsafe server-side URL retrieval; unavailable linked media is reported as a warning.
- Result metadata now reports visual target count, rendered count, hidden slides, image-dominant slides, and external media count.

## UI changes

- Rebuilt public frontend with clearer hierarchy and mobile layout.
- Added Indonesian / English interface toggle.
- Added post-job diagnostics for visual coverage, hidden slides, image-dominant slides, and external media.
- Warnings are displayed separately instead of being buried inside one long status line.
- Added clearer safety copy around source preservation, external media, and existing speaker notes.

## Regression coverage

Automated tests now cover:

- Hidden-slide detection.
- Temporary hidden-slide normalization.
- Visual-only slide detection.
- Partial Vision when a slide screenshot is missing.
- Rejection of the known “no text or visual” contradiction on a slide that structurally contains visual media.

The supplied climate-change deck was also used as a real regression case. It contains 41 slides, including 7 hidden slides. The hardened LibreOffice path rendered all 41 slide numbers successfully after temporary normalization, including the image-only graph on slide 10.
