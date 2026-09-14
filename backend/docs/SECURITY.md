# Security

## Threats addressed in the MVP

- oversized uploads,
- ZIP decompression abuse,
- path traversal in ZIP entries,
- unexpected executable/macro content,
- unsafe filenames,
- cross-site browser uploads,
- accidental modification of the original file,
- accidental replacement of human speaker notes,
- uncontrolled job concurrency,
- stale temporary data,
- accidental API-key disclosure,
- unexpected PowerPoint package changes.

## AI-specific controls

- API key is a Pydantic `SecretStr` and is never serialized into job records.
- UI/health expose only whether OpenAI is configured, not the secret.
- prompts and base64 slide screenshots are not logged.
- Responses API requests use `store=False`.
- selecting OpenAI in the browser requires a cost/external-processing confirmation.
- no AI call is made in dummy mode or automated unit tests.
- model name and cost rates are configuration rather than user-supplied arbitrary request values.
- slide text and visuals are explicitly treated as untrusted data to reduce prompt-injection risk.

## Important production gaps

This is still an internal MVP. Before internet-facing deployment add authentication, authorization, centralized secrets management, TLS/reverse proxy, rate limiting, malware scanning policy, durable audit logs, object-storage policy, queue isolation and organization-specific data governance.

## Vision renderer note - v0.2.2

Local Windows MVP Vision may use Microsoft PowerPoint COM to render uploaded `.pptx` files. The upload validator runs before rendering and rejects malformed/macro-enabled packages, but opening untrusted documents in a desktop Office process is still a larger execution boundary than text parsing alone. Do not expose the COM renderer as an internet-facing shared service. Production deployment should use an isolated rendering worker/container, malware-scanning policy, resource/time limits and organization-approved data-handling controls.

## v0.2.4 hardening controls

- API cost is estimated before paid note generation and can be blocked by a configured per-job ceiling.
- AI checkpoint files contain generated notes and are therefore treated with the same retention/sensitivity policy as uploaded presentations.
- Checkpoints do not contain the OpenAI API key.
- Retry reuses only checkpoints whose generation fingerprint matches current deck/options/model configuration.
- Vision fallback is never silent in result metadata: a text-only fallback produces a warning.
- PowerPoint rendering is isolated from the main worker process with a timeout. This limits application hangs but is not a malware sandbox.
- Local retry/idempotency is not a substitute for distributed locking in a future multi-node deployment.
