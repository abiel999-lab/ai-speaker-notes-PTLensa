# AI Speaker Notes v0.2.8 — UX, Login, Chat, Limits, and Hardening

## Release goal

v0.2.8 moves the MVP from a single upload form toward a safer user-facing application. The release keeps the hidden-slide and partial-Vision reliability work from v0.2.7, adds a white/green UI, bilingual onboarding, login, legal pages, bounded file-aware chat, stronger default AI quality, and additional failure containment.

## UI / UX

- White and green visual system with responsive desktop/mobile layouts.
- New navigation: Dashboard, Chat AI, How to Use, Legal.
- Indonesian / English interface toggle stored locally in the browser.
- Student, Academic, and Concise quick presets.
- Clearer upload drop zone, processing progress, metrics, warning cards, recent-job history, download, retry, chat, and delete actions.
- Result summary exposes generated/preserved notes, visual coverage, hidden slides, warnings, token usage, and estimated API cost.

## How to Use

`/how-to` explains the six-step workflow, safe input limits, Vision behavior, hidden slides, image-only slides, external media, and common troubleshooting.

## Legal / Terms baseline

`/legal` contains a bilingual Terms of Use, Privacy Notice, AI notice, Acceptable Use rules, service limits, and retention description. This is an operational product baseline, not legal advice. Production deployment must replace/extend it with the real legal entity, hosting/vendor details, jurisdiction-specific notices, and organization policies.

## Login and session security

Login is optional for local development and recommended for public deployment.

Environment variables:

```text
AUTH_ENABLED=true
AUTH_USERNAME=<set-at-deploy-time>
AUTH_PASSWORD=<set-via-secret-manager>
SESSION_SECRET=<random value at least 32 chars>
SESSION_HOURS=8
TERMS_VERSION=2026-09-13
REQUIRE_TERMS_ACCEPTANCE=true
```

Security behavior:

- HMAC-SHA256 signed HttpOnly session cookie.
- `Secure` cookie in production and `SameSite=Strict`.
- Session expiry.
- Login brute-force limiter.
- Terms acceptance is version-bound to the session.
- Mutating authenticated API requests require a session-bound `X-CSRF-Token`.
- Jobs are stamped with an owner and are not returned across authenticated owners.

This remains a **single-account MVP**, not a multi-tenant identity platform. Do not treat it as a replacement for enterprise SSO, Keycloak, or a full user database.

## Strong model with bounded input

The default AI model changes to `gpt-5.6-sol` with medium reasoning. The application does not expose the model to unlimited input.

Default limits:

```text
OPENAI_MAX_SLIDES_PER_JOB=80
OPENAI_MAX_VISION_SLIDES_PER_JOB=60
OPENAI_MAX_SOURCE_CHARS_PER_JOB=180000
OPENAI_MAX_ESTIMATED_JOB_COST_USD=1.00
custom instructions <= 1500 characters
custom note length <= 500 words per slide
```

The paid API preflight runs before the first model request. Oversized decks fail with an explicit guardrail message instead of continuing into unpredictable cost/latency.

## Chat AI Speaker Notes

`/chat` provides presentation-aware chat after a job completes.

The chat is deliberately bounded:

```text
CHAT_MAX_MESSAGE_CHARS=2000
CHAT_MAX_TURNS_PER_JOB=20
CHAT_MAX_CONTEXT_SLIDES=12
CHAT_MAX_HISTORY_MESSAGES=10
CHAT_MAX_OUTPUT_TOKENS=1400
```

Chat behavior:

- Uses the processed presentation metadata and, when available, generated notes from the AI checkpoint.
- A requested slide receives nearby-slide context; otherwise the app selects a small set of slides by lexical relevance.
- Does not send the whole deck on every chat turn.
- Treats presentation content as untrusted data and instructs the model not to follow prompt injection embedded in slides.
- Does not expose API keys, system prompts, file paths, or other jobs.
- Chat history is stored inside the job directory and can be cleared.

## Additional worst-case hardening

v0.2.8 adds or preserves defenses for the following cases:

| Scenario | Behavior |
| --- | --- |
| Hidden slides shift renderer page numbers | Temporary normalized render copy preserves 1:1 numbering |
| One slide fails to render | Per-slide recovery; successful slides keep Vision |
| Image-only slide | Structural metadata prevents false “blank slide” conclusions |
| External linked image | Detected; remote URL is not fetched automatically |
| Macro-enabled content | Rejected |
| Embedded OLE/package object | Rejected by default (`ALLOW_EMBEDDED_OBJECTS=false`) |
| ZIP/path traversal / decompression bomb | Rejected during upload validation |
| Huge AI deck / context | Slide, Vision, character, and cost guardrails stop the job before paid generation |
| Too many simultaneous jobs | Per-user active-job limit plus bounded worker concurrency |
| Server restart mid-job | Queued/processing jobs are marked retryable at startup; compatible AI checkpoints stay on disk |
| AI/network transient failure | SDK retries + semantic retry + job retry/checkpoint support |
| Contradictory note says visual is absent | Structural contradiction guard rejects and retries the note |
| User wants immediate deletion | Dashboard DELETE endpoint removes the job directory when not processing |
| Chat abuse / runaway context | Message, context, history, turn, and output limits |
| Prompt injection in slide/chat context | Slide content is treated as untrusted data in generation and chat instructions |

## Known production limitations

- `FileJobStore` is local filesystem storage. Multi-instance Cloud Run or horizontal scaling needs shared durable storage and a database/queue.
- In-process locks and login rate limits are per application instance. Multi-instance production needs distributed locking/rate limiting.
- The bundled login is single-account. Production multi-user deployments should use a proper identity provider and tenant-aware database model.
- Legal text must be reviewed and adapted before a public/paid launch.
- AI output still requires human review; quality checks reduce errors but cannot guarantee factual correctness.

## Verification performed for this release

- Python compile check for the app.
- JavaScript syntax checks for `common.js`, `app.js`, `login.js`, and `chat.js`.
- Automated test suite: 56 tests passing.
- Manual TestClient smoke test for Dashboard, How to Use, Legal, Chat, static assets, capabilities, login redirect, login, signed session, and CSRF enforcement.
- Regression deck `Perubahan Iklim Part 2 2022_2023_eng-with-speaker-notes.pptx`: 41 slides detected, hidden slides `[6, 8, 13, 14, 15, 16, 41]`, all 41 slides rendered, and slide 10 produced a readable visual image instead of failing because of the 34/41 page mismatch.
