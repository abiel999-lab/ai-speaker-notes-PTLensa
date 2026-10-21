AI Speaker Notes v0.2.8 - Chat Input Limit Guard Patch

Fixes:
- Prevents silent browser truncation of pasted messages over the configured chat limit.
- Shows an inline bilingual validation error and live over-limit counter.
- Disables Send while the message exceeds the configured maximum.
- Adds explicit backend API validation against CHAT_MAX_MESSAGE_CHARS.
- Keeps service-layer validation as a second backend safety layer.
- Preserves General Chat and PowerPoint RAG behavior.

Default limit remains 2000 characters per message (configurable through CHAT_MAX_MESSAGE_CHARS).
Boundary behavior:
- <= configured limit: allowed.
- > configured limit: rejected before any OpenAI request.

Regression checks performed:
- Root test suite: 12 passed.
- Backend mirror: 12 passed.
- Local-MVP mirror: 12 passed.
- Python compile: PASS.
- JavaScript syntax: PASS.

This patch does not include .env, API keys, storage, or virtual environments.
