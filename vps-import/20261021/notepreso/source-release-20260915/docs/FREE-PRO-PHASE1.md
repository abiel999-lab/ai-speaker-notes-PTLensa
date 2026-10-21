# NotePreso Free / Pro — Phase 1

## Scope

This phase adds an internal subscription and entitlement layer without coupling the application to a payment gateway. The payment provider will only update subscription state in Phase 2; job/chat authorization stays provider-independent.

## Default plans

Defaults are intentionally conservative and can be changed through environment variables without rebuilding the application.

| Feature | Free | Pro |
| --- | ---: | ---: |
| Presentations / UTC calendar month | 3 | 50 |
| AI chat messages / UTC calendar month | 20 | 500 |
| Text + Vision | No | Yes |

Set a monthly quota to `0` for unlimited usage.

Environment variables:

```env
FREE_MONTHLY_PRESENTATIONS=3
FREE_MONTHLY_CHAT_MESSAGES=20
FREE_VISION_ENABLED=false
PRO_MONTHLY_PRESENTATIONS=50
PRO_MONTHLY_CHAT_MESSAGES=500
PRO_VISION_ENABLED=true
PAYMENT_PROVIDER=disabled
```

## Data model

Two new tables are used:

- `subscriptions`: the internal plan/status record for a Keycloak subject.
- `usage_periods`: atomic monthly counters for presentations, Vision jobs, and AI chat messages.

A new authenticated endpoint exposes the current plan and quota state:

```text
GET /api/v1/account/plan
```

The response contains the effective plan, limits, usage, remaining quota, Vision entitlement, and current billing-provider state.

## Enforcement behavior

- A newly authenticated user defaults to `Free`.
- New presentation jobs reserve one monthly presentation slot after PPTX validation succeeds.
- Invalid uploads do not consume monthly quota.
- A request that fails before the job is accepted releases the reserved slot.
- Retrying an existing failed job does not consume another presentation slot.
- Free users cannot submit Text + Vision jobs when `FREE_VISION_ENABLED=false`.
- Each successful AI chat request consumes one monthly chat slot.
- Busy, per-thread-limit, and failed AI chat requests release the reserved monthly slot.
- Deleting a job or clearing chat history does not refund monthly usage.
- An active/trialing Pro subscription remains Pro until `current_period_end`; an expired/inactive Pro record falls back to Free automatically.

## Database migration

Production deployment should explicitly run:

```text
deploy/postgres/02-free-pro-subscriptions.sql
```

The migration only creates new tables/indexes and is idempotent. It does not modify existing `users`, `jobs`, chat, or audit records.

`Base.metadata.create_all()` also knows about the tables for clean/local environments, but production deployment should not rely on it as the migration mechanism.

## Manual Pro testing before payment integration

The server-side helper lets an operator activate Pro without exposing a public admin endpoint:

```bash
python scripts/set_plan.py --owner <KEYCLOAK_SUBJECT> --plan pro --days 30
```

Return the account to Free:

```bash
python scripts/set_plan.py --owner <KEYCLOAK_SUBJECT> --plan free
```

This helper must be run only from a trusted server shell. It never needs to be exposed through nginx.

## UI

The user application now shows:

- A `Free` / `Pro` chip next to the signed-in user.
- Monthly presentation usage.
- Monthly AI-chat usage.
- Vision availability.
- Monthly reset date.
- A disabled `Upgrade to Pro` control until a real payment checkout is connected.

## Phase 2 contract

Stripe, Xendit, or Paddle should not be allowed to decide feature access directly. A provider webhook should verify authenticity/idempotency, then update `subscriptions` fields such as:

- `plan`.
- `status`.
- `provider`.
- `provider_customer_id`.
- `provider_subscription_id`.
- `current_period_start`.
- `current_period_end`.
- `cancel_at_period_end`.

The existing entitlement engine will immediately apply the new plan on the next request.
