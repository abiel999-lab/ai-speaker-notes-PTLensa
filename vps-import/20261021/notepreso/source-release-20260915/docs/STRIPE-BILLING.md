# Stripe Billing Adapter

NotePreso 1.4.0 adds Stripe Checkout as a provider adapter while keeping NotePreso's own `subscriptions` table as the entitlement source of truth.

## Model

The Stripe flow is intentionally one-time:

1. A Free user clicks **Buy Pro · 30 days**.
2. NotePreso creates a Stripe-hosted Checkout Session in `payment` mode.
3. The account remains Free while payment is pending.
4. Stripe posts a signed webhook to NotePreso.
5. NotePreso verifies the `Stripe-Signature`, reconciles the internal reference, Checkout Session ID, amount, and currency.
6. Only a confirmed paid event activates Pro.
7. Pro expires automatically at `current_period_end`; no Stripe auto-renew is required.

## Runtime configuration

```text
PAYMENT_PROVIDER=stripe
STRIPE_API_BASE_URL=https://api.stripe.com
STRIPE_SECRET_KEY=<server-side test or live secret key>
STRIPE_WEBHOOK_SECRET=<whsec_... for this webhook endpoint>
STRIPE_PRO_PRICE_IDR=50000
STRIPE_PRO_ACCESS_DAYS=30
STRIPE_TIMEOUT_SECONDS=20
STRIPE_WEBHOOK_TOLERANCE_SECONDS=300
```

Never put Stripe secret keys in browser JavaScript or commit them to source control.

## Webhook endpoint

Configure Stripe to send Checkout events to:

```text
https://notepreso.com/api/v1/billing/stripe/webhook
```

Recommended events for the one-time flow:

- `checkout.session.completed`.
- `checkout.session.async_payment_succeeded`.
- `checkout.session.async_payment_failed`.
- `checkout.session.expired`.

`checkout.session.completed` only grants Pro immediately when `payment_status` is paid (or no payment is required). If a payment method settles asynchronously, NotePreso waits for `checkout.session.async_payment_succeeded`.

## IDR amount handling

NotePreso configuration stores a human-readable rupiah amount (`50000` means Rp50,000). Stripe API amount fields use currency minor units. For IDR, the adapter sends Rp50,000 as `5000000` minor units and validates the same conversion on the webhook.

## Switching between test providers

Xendit support remains in the same build. Change only `PAYMENT_PROVIDER` and the corresponding provider credentials, then recreate the container. Existing entitlement records keep their original `provider` value.

This version does not require a database migration; it reuses `subscriptions`, `payment_checkouts`, and `payment_events`.
