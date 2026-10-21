# NotePreso 1.3.0 - Xendit One-Time Pro

## Purpose

NotePreso Pro can now be purchased as a one-time Xendit payment instead of requiring automatic recurring billing. The default grants 30 days of Pro after Xendit confirms a completed Payment Session.

## Runtime settings

- `XENDIT_CHECKOUT_MODE=one_time` (default).
- `XENDIT_PRO_ACCESS_DAYS=30` (default).
- Existing `PAYMENT_PROVIDER=xendit`, API key, webhook token, API version, and price settings remain unchanged.
- Set `XENDIT_CHECKOUT_MODE=subscription` only if the previous recurring-card flow is intentionally required.

## Entitlement behavior

1. User opens hosted Xendit checkout.
2. NotePreso remains Free while payment is pending.
3. Xendit sends verified `payment_session.completed` for a `PAY` session.
4. NotePreso validates reference, session ID, amount, currency, and completion state.
5. Internal subscription becomes Pro for `XENDIT_PRO_ACCESS_DAYS`.
6. Entitlement automatically falls back to Free after `current_period_end`.

No database migration is required for 1.3.0. Existing `subscriptions`, `payment_checkouts`, and `payment_events` tables are reused.

## Xendit dashboard requirement

Configure the Xendit **Payment Session** webhook to the existing NotePreso endpoint:

`https://notepreso.com/api/v1/billing/xendit/webhook`

The Recurring webhook can remain configured for backwards compatibility, but one-time purchases require Payment Session status events.

## Tests

- Full Python test suite: PASS.
- Billing/Xendit focused tests: PASS.
- JavaScript syntax check: PASS.
