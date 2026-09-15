# AI Speaker Notes v1.0.0 — Production Release

Release date: 2026-09-14

## Production scope

v1.0.0 promotes the hardened speaker-notes engine to a multi-user production application.

### Core processing

- Package-safe PPTX write-back.
- Existing notes: fill missing, append, replace.
- Hidden-slide-aware normalized rendering.
- Per-slide Vision recovery.
- Automatic batching with no fixed Vision slide-count cap.
- Large-deck checkpoint/resume and cost guardrails.
- Output integrity validation.

### Chat AI / RAG

- General chat without a PowerPoint context.
- Presentation-aware RAG.
- Exact slide retrieval from field or natural language.
- Same-slide follow-up memory.
- Hallucination guard when data is not present in the supplied presentation context.
- 2,000-character message guard and bounded turn history.
- Persistent PostgreSQL chat history in production.

### Multi-user production identity

- Keycloak OIDC Authorization Code flow with PKCE.
- Stable Keycloak `sub` is used as the ownership key.
- Signed HttpOnly application session cookie.
- CSRF protection for mutating API calls.
- User metadata persisted in PostgreSQL.
- Job ownership enforced server-side; another user's job is returned as not found.

### Persistence

- PostgreSQL-backed job metadata.
- PostgreSQL chat history and audit events.
- Durable file volume for source PPTX, outputs, checkpoints, and render artifacts.
- Owner-partitioned file directories.

### Deployment

- Docker Compose production stack: app + PostgreSQL + Keycloak.
- Nginx reverse-proxy template.
- Keycloak branded login theme.
- Keycloak Admin UI not exposed by public Nginx configuration.
- Target URL: `https://aispeakernote.lensalingkungantech.com`.

### UX fixes included before release

- Responsive phone/tablet/desktop UI.
- Full ID/EN interface.
- Polished Clear Chat button.
- Duplicate `-with-speaker-notes` download suffix removed.
- Append mode now reports existing notes as preserved.
- Hidden slide diagnostic wording clarifies that handling is automatic and original hidden state remains unchanged.
