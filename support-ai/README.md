# NotePreso internal AI Support (prototype v1)

**Not ready for public traffic.** This is a vendor-neutral internal API skeleton, based on NotePreso's draft knowledge base and bot policy. It does not modify existing production services.

- `GET /healthz` — liveness only, not evidence of model availability
- `POST /v1/support/reply` — authenticated JSON `{ "message": "..." }`
- Header `X-Support-Key` is server-to-server **only**, never expose it to browsers or a chat widget.
- Reply format: `{ "action": "answer|escalate|security", "reply": "...", "handoff": true|false, "usage": {"input_tokens": n, "output_tokens": n} }`.
- API is **read-only**. It creates no tickets, charges, credits, refunds or subscriptions.
- Persistent quota counts API attempts in SQLite. Max 5/minute and 40/day by default (change via env). These are call-count limits, **not financial budget guarantees**. Daily reset is UTC.
- No conversation persistence and no user-message logging by the service. Model input is transmitted to OpenAI. Review privacy, consent and retention requirements before live use.
- `store=False`, explicit structured output, no tools, 320 output-token cap, and no retries.
- Failure is a generic 503. Vendor adapters must tolerate 429/503.
- Model replies are **not trusted instructions**. Action label should never grant permissions or execute business changes.

## Offline verification (without API charge)

Place `support_api.py` and `test_support_api.py` together, then run:

```bash
python -m unittest -v test_support_api
```

## Suggested deployment approach (not part of this package)

1. Copy files to `/opt/actia-ai/notepreso/runtime/support-ai/api-v1/` as root-owned files.
2. Keep existing knowledge and policy files under the support-ai directory read-only.
3. Create a **new** 256-bit `SUPPORT_AI_SHARED_KEY` (only for trusted backend-to-backend access; never put it in frontend JS).
4. Run as an isolated Docker sidecar with **no published host ports**, non-root, read-only source mount, writable dedicated `/srv/support-ai/state` for quota DB, and only required environment variables (`OPENAI_API_KEY`, support shared key, model, paths). Never pass Paddle keys or the existing 87 production environment variables.
5. Run an authenticated synthetic test against the sidecar; never test with real customer data at this phase.
6. Integrate later using a backend adapter and explicit vendor selection.

## Limitations

- This is a prototype, not an authorization gateway, abuse-proof rate limiter, or monetary spend limiter.
- The KB is still **DRAFT**; approval required before external user access.
- An LLM response may still be wrong or manipulated. Separate human review and independent safety tests are necessary.
