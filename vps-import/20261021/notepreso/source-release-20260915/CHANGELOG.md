## 1.6.2 - Paddle inline checkout stabilization

- Replace Paddle overlay checkout with a dedicated centered inline checkout target.
- Explicitly set frameTarget, frameInitialHeight, and frameStyle per Paddle inline requirements.
- Add cache-busted checkout script URL.
- Keep webhook-only Pro activation.

# Changelog

## 1.6.0 - 2026-09-24

- Added simultaneous multi-provider billing with user-selectable Xendit, Paddle, and future Stripe checkout.
- Added `PAYMENT_PROVIDERS` comma-separated enablement while keeping `PAYMENT_PROVIDER` as a backward-compatible default.
- Added provider-specific checkout selection and a responsive payment-provider chooser in the user app.
- Kept one internal Pro entitlement source of truth regardless of payment gateway.
- Kept provider webhooks independently verifiable and idempotent.

## 1.5.0 - 2026-09-24

- Added Paddle Billing one-time Pro adapter, checkout landing page, and verified webhook provisioning.
- Added multi-currency billing display and preserved Xendit/Stripe adapters.

# Changelog

## 1.4.0 - 2026-09-24

- Added Stripe hosted Checkout as a second payment adapter for one-time Pro purchases.
- Stripe test/live credentials remain server-side; checkout creation never exposes secret keys.
- Added verified `Stripe-Signature` webhook handling with timestamp tolerance and idempotent event processing.
- Successful `checkout.session.completed` or `checkout.session.async_payment_succeeded` payments activate Pro for the configured access period.
- Added amount, currency, session, and internal reference reconciliation before entitlement activation.
- Generalized billing UI metadata so Xendit and Stripe share the same internal Free/Pro entitlement engine.
- Preserved the existing Xendit one-time and legacy recurring paths unchanged.
- Added Stripe adapter, signature, synchronous payment, asynchronous payment, and 30-day entitlement tests.

## 1.3.0 - 2026-09-24

- Added Xendit one-time hosted checkout (`session_type=PAY`) for manual 30-day Pro purchases.
- A verified `payment_session.completed` event now activates Pro for the configured access period.
- Kept the previous Xendit subscription path available through `XENDIT_CHECKOUT_MODE=subscription`.
- Default checkout mode is now `one_time`; payment methods are not saved by NotePreso for this flow.
- Free accounts are no longer marked as Xendit-backed merely because a checkout was opened.
- Updated account UI copy for one-time Pro purchases and removed renewal language from the one-time success flow.
- Added webhook/session matching, amount/currency validation coverage, duplicate-event coverage, and 30-day entitlement tests.

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

## 1.1.0 - 2026-09-23

- Added provider-independent Free/Pro subscriptions and monthly usage quotas.
- Added Pro Vision entitlement and quota enforcement for presentations and AI chat.
- Added account plan API and dashboard usage UI.
- Added production PostgreSQL migration and manual Pro test helper.

## 1.2.0 - Xendit Billing

- Added Xendit Payment Sessions checkout for monthly Pro subscriptions.
- Added authenticated checkout/cancel endpoints and verified server-side webhook handling.
- Added payment checkout/event persistence and idempotent webhook processing.
- Pro entitlement is activated by successful Xendit recurring-cycle events.
- Added paid-period preservation on cancel and past-due handling during retries.

- Added `docs/XENDIT-BILLING.md` with secure test/live setup and webhook guidance.

## 1.6.1 - 2026-09-24

- Fixed Paddle transaction checkout presentation by explicitly opening the `_ptxn` transaction with `Paddle.Checkout.open()`.
- Forces desktop/mobile-safe overlay mode with the one-page checkout variant.
- Adds explicit Paddle success redirect back to NotePreso while entitlement still depends on the verified webhook.
