# AI Speaker Notes v0.2.8 — Release Summary

This package upgrades v0.2.7 with a redesigned white/green UI, bilingual onboarding, optional login, legal/terms baseline, bounded presentation-aware Chat AI, GPT-5.6 Sol as the quality-first default, hard input/cost limits, manual job deletion, interrupted-job recovery, and additional file-security controls.

## Quick local start

```powershell
copy .env.example .env
# Fill OPENAI_API_KEY if AI is needed.
# For local development AUTH_ENABLED can stay false.
.\scripts\setup.ps1
.\scripts\run.ps1
```

Open `http://127.0.0.1:8000`.

## Enable login locally

Set these in `.env`:

```text
AUTH_ENABLED=true
AUTH_USERNAME=<set-at-deploy-time>
AUTH_PASSWORD=<set-via-secret-manager>
SESSION_SECRET=<random secret at least 32 chars>
```

Restart the app. `/` will redirect to `/login`.

## Main v0.2.8 pages

- `/` — Dashboard and PowerPoint processing
- `/chat` — bounded file-aware Chat AI
- `/how-to` — bilingual usage guide and troubleshooting
- `/legal` — Terms, Privacy, AI notice, Acceptable Use, limits, and retention baseline

## Validation status

- 56 automated tests pass in the root source, `backend/`, and `local-mvp/` copies.
- JavaScript syntax checks pass for all new UI scripts.
- The previously problematic 41-slide climate deck renders all 41 slides despite seven hidden slides.
- Slide 10 renders as an actual radiance/wavelength chart instead of being lost when Vision sees only 34 rendered pages.

Read `docs/UPGRADE-0.2.8.md` for the full hardening and known-production-limit notes.
