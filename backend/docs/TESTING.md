# Testing - v0.2.2

## Automated

The release contains 27 tests covering parser behavior, secure upload, API routes, notes modes, package-preserving write-back, unknown OOXML preservation, renderer selection/delegation, OpenAI Structured Outputs behavior, text-only generation and Vision image attachment. Fake OpenAI clients are used; automated tests consume no API credit.

```powershell
.\scripts\verify.ps1
```

## Renderer validation without API cost

```powershell
.\scripts\test-vision-renderer.ps1
```

This creates a clean four-slide Vision test deck and renders its target slides. Confirm the provider is `powerpoint` or `libreoffice` and inspect the PNG files.

## Live AI validation

For the same clean 3-5 slide deck:

1. run OpenAI + Text-only,
2. run OpenAI + Vision,
3. keep model/language/audience/depth identical,
4. compare notes and the displayed cost,
5. open both outputs in Microsoft PowerPoint and confirm no Repair/Recover warning.

Vision should add value especially on the included process flow, chart and quadrant slides.

## Real-deck compatibility gate

After the small A/B test passes, process a real presentation that did not require PowerPoint repair before processing. Verify slide count, theme, images, tables/charts, transitions/animations where present, speaker-notes mapping and absence of a new Repair/Recover warning.

## v0.2.4 hardening tests

The suite now also covers:

- partial batch response followed by missing-slide-only recovery,
- checkpoint resume after a simulated mid-job interruption,
- harmless extra context-slide filtering,
- runtime PowerPoint -> LibreOffice renderer fallback,
- Vision -> text-only fallback behavior,
- conservative preflight cost increase for Vision,
- hard cost guardrail,
- failed-job retry and attempt counting.

Expected suite size for this release: **37 passed**.
