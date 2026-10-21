# NotePreso 1.6.1 - Paddle Checkout UI Fix

- Fixes malformed/tiny Paddle checkout rendering seen when relying only on automatic `_ptxn` handling.
- Explicitly opens the existing Paddle transaction ID through Paddle.js.
- Uses `displayMode: overlay` and `variant: one-page`.
- Keeps webhook-confirmed entitlement as the source of truth.
- No database migration.
