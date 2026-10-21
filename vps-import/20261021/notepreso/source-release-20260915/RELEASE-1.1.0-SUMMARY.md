# NotePreso 1.1.0 — Free / Pro Entitlements

This release introduces the provider-independent Free/Pro subscription engine.

## Added

- Internal `subscriptions` source of truth keyed by Keycloak subject.
- Monthly `usage_periods` counters.
- Free/Pro presentation quotas.
- Free/Pro AI-chat quotas.
- Pro-only Text + Vision entitlement by default.
- `/api/v1/account/plan` account-plan API.
- Plan and monthly usage UI on the user dashboard.
- Free/Pro badge in authenticated navigation.
- Safe server-side helper for manually testing Pro before payment integration.
- Idempotent PostgreSQL migration.

## Defaults

- Free: 3 presentations/month, 20 chat messages/month, Text-only.
- Pro: 50 presentations/month, 500 chat messages/month, Text + Vision.

All limits are environment-configurable. `0` means unlimited.

## Payment

Payment checkout is intentionally disabled in this release. Stripe, Xendit, or Paddle can be connected in Phase 2 by updating the same internal subscription rows through verified, idempotent webhooks.

## Verification

The full automated test suite passes after this change.
