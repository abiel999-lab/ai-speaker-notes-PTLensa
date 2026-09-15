# Changelog

## 1.0.0 — 2026-09-14

- Promoted hardened application from MVP line to production v1.0.0.
- Added PostgreSQL job metadata, user metadata, chat history, and audit persistence.
- Added Keycloak OIDC login using Authorization Code + PKCE.
- Added stable per-user ownership based on Keycloak subject.
- Added owner-partitioned durable file storage.
- Added Docker Compose production stack and Nginx deployment configuration.
- Added branded Keycloak login theme.
- Removed legacy fixed 60-slide Vision rejection; large decks use safe automatic batching.
- Fixed exact-slide RAG, same-slide follow-up, general chat mode, message length guard, and turn limit UX.
- Fixed duplicate output filename suffix.
- Improved hidden-slide status wording and append-mode preservation reporting.
- Finalized responsive white/green bilingual UI.
