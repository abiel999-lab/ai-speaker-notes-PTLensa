# NotePreso 1.2.0 — Xendit Billing

This release connects the internal Free/Pro entitlement engine to Xendit Subscriptions.

## Included

- Xendit Payment Sessions hosted checkout for monthly Pro subscriptions.
- Server-only Xendit secret-key usage.
- Verified `x-callback-token` webhook endpoint.
- Payment checkout and webhook-event persistence for idempotency/auditability.
- Pro activation only after a successful recurring cycle webhook.
- Monthly recurring lifecycle handling: active, past-due retry, failure, and inactivation.
- Cancel-renewal endpoint that preserves paid access until the current period ends.
- Dashboard Upgrade to Pro / Cancel renewal controls.
- Configurable IDR Pro price through environment variables.
- Idempotent PostgreSQL migration script.

## Production requirements

Set `PAYMENT_PROVIDER=xendit`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, and
`XENDIT_PRO_PRICE_IDR`. Configure the Xendit Subscription / Payment Session webhook to:

`https://notepreso.com/api/v1/billing/xendit/webhook`

Do not place Xendit secrets in source control.
