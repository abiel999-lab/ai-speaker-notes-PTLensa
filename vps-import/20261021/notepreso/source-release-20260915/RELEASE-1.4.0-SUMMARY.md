# NotePreso 1.4.0 - Stripe Test Adapter

## Purpose

Add Stripe as a second payment adapter without changing NotePreso's internal Free/Pro entitlement model or the working Xendit path.

## Added

- Stripe hosted Checkout Session (`mode=payment`).
- One-time Pro access with configurable `STRIPE_PRO_ACCESS_DAYS`.
- Server-side secret key use only.
- Signed webhook verification using the raw request body and `Stripe-Signature`.
- Timestamp tolerance for replay resistance.
- Idempotent Stripe event handling.
- Internal reference, Checkout Session, amount, and currency reconciliation.
- Support for paid synchronous and asynchronous Checkout completion.
- Provider-neutral billing copy in the account UI.

## Entitlement contract

Stripe never directly decides feature access. A verified, reconciled successful payment updates NotePreso's internal `subscriptions` row to:

```text
plan=pro
status=active
provider=stripe
current_period_start=<paid time>
current_period_end=<paid time + configured days>
cancel_at_period_end=false
```

After `current_period_end`, the existing entitlement engine treats the account as Free.

## No schema migration

1.4.0 reuses the 1.2/1.3 billing tables. No database migration is required.

## Tests

- Full Python test suite: PASS.
- Stripe Checkout payload and IDR minor-unit conversion: PASS.
- Stripe webhook signature validation and replay tolerance: PASS.
- Paid Checkout -> Pro 30 days: PASS.
- Duplicate event idempotency: PASS.
- Asynchronous payment waits for settlement: PASS.
- Existing Xendit tests: PASS.
- Python compile and JavaScript syntax checks: PASS.
