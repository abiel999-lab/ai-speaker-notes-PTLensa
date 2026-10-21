# NotePreso Xendit Billing

NotePreso 1.2.0 connects the internal Free/Pro entitlement engine to Xendit hosted subscription checkout.

## Architecture

- NotePreso remains the source of truth for product entitlements and monthly quotas.
- Xendit is the payment/subscription provider and updates NotePreso through verified webhooks.
- Pro is granted only after a successful `recurring.cycle.succeeded` event.
- `recurring.plan.activated` links the Xendit plan but does not by itself grant paid access.
- Webhook events are persisted and deduplicated before repeated processing.
- Cancellation deactivates future Xendit cycles while preserving already-paid Pro access until `current_period_end`.

## Required environment variables

```text
PAYMENT_PROVIDER=xendit
XENDIT_API_BASE_URL=https://api.xendit.co
XENDIT_API_VERSION=2026-01-01
XENDIT_SECRET_KEY=<set directly on the server>
XENDIT_WEBHOOK_TOKEN=<set directly on the server>
XENDIT_PRO_PRICE_IDR=<monthly Pro price in IDR>
```

Never commit the secret key or webhook verification token to source control.

## Xendit webhook URL

Configure both Payment Session and Subscription lifecycle webhooks to use:

```text
https://notepreso.com/api/v1/billing/xendit/webhook
```

The endpoint validates the `x-callback-token` header using the Xendit webhook verification token.

Relevant events handled by NotePreso:

```text
payment_session.completed
payment_session.expired
recurring.plan.activated
recurring.plan.inactivated
recurring.cycle.retrying
recurring.cycle.succeeded
recurring.cycle.failed
```

Other Xendit events are stored/ignored safely when they do not match a NotePreso checkout.

## Test-mode flow

1. Configure Xendit test credentials and webhook token directly in the VPS environment file.
2. Set a test `XENDIT_PRO_PRICE_IDR`.
3. Run the billing database migration.
4. Build and deploy NotePreso 1.2.0.
5. Use a Free test account and click **Upgrade to Pro**.
6. Complete the Xendit hosted checkout.
7. Confirm the account changes to Pro only after the successful cycle webhook is received.
8. Verify `payment_checkouts`, `payment_events`, `subscriptions`, and audit events.
9. Test **Cancel renewal** and confirm paid access remains through the current paid period.

## Production cutover

Only switch from Xendit test mode to live credentials after the complete test-mode checkout/webhook/cancellation flow passes. Keep the previous NotePreso container as a rollback target until production payment tests pass.
