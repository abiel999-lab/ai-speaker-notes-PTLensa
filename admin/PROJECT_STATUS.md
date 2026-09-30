# Project Status — AI Speaker Notes v1.0.0

Status: Production release preparation
Date: 2026-09-14

## Completed functional verification

- Baseline 42-slide generation: PASS
- Existing notes preserve: PASS
- Append notes: PASS
- Replace all notes: PASS
- Hidden slide handling: PASS
- Image-only / chart Vision: PASS
- Large deck 72 slides: PASS
- Vision 72/72: PASS
- Automatic batching beyond legacy 60-slide limit: PASS
- Partial existing notes (17 preserved / 55 generated): PASS
- Original PPTX remains untouched: PASS
- Exact-slide RAG: PASS
- Natural language slide selection: PASS
- Same-slide follow-up: PASS
- General Chat: PASS
- Hallucination guard: PASS
- Chat character limit: PASS
- Chat turn limit: PASS
- Responsive mobile/tablet/desktop: PASS
- Indonesian/English UI: PASS

## v1.0.0 production work included

- PostgreSQL persistence layer
- Keycloak OIDC integration with PKCE
- Per-user server-side ownership isolation
- PostgreSQL chat history
- Audit events
- Durable production file storage layout
- Docker Compose production stack
- Nginx production reverse proxy
- Branded Keycloak theme
- Production deployment/backup scripts

## Deployment target

`https://aispeakernote.lensalingkungantech.com`


## Local admin data integration update

- The user-facing app and `/admin` use the same `DATABASE_URL`. Presentation history is stored in `jobs`; persistent AI chat is stored in `chat_threads` and `chat_messages`; login/application users are stored in `users`.
- `/admin` user detail now reads both presentation jobs and saved chat threads/messages for that Keycloak user subject.
- Admin access is granted only when the signed Keycloak token contains the configured `ADMIN_ROLE` (default `admin`). Username-based admin bypasses are not used.
- The local launcher can reuse the existing `KEYCLOAK_CLIENT_SECRET` from a sibling `ai-speaker-notes-mvp/.env` when the new `.env` still contains a placeholder. It never prints the secret.
- If Keycloak rejects the OIDC client credentials, the callback now returns a clear configuration error instead of an unhandled 500 traceback.


## Admin performance v21

- Production DB-first admin reads are batched for SSH-tunneled PostgreSQL.
- Overview, user directory, and Presentations & Chat no longer require repeated remote queries for first paint.
- Keycloak remains authoritative for account management but does not block production activity data.
