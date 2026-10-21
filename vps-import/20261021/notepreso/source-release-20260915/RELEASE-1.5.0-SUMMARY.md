# NotePreso 1.5.0 — Paddle Billing

- Adds Paddle Billing as a third payment adapter while preserving Xendit and Stripe.
- One-time Paddle purchase grants Pro for a configurable number of days.
- Adds signed Paddle webhook verification with replay-window validation.
- Validates Paddle transaction, configured price ID, quantity, unit amount, and currency before granting Pro.
- Adds a dedicated Paddle.js checkout landing page for transaction payment links.
- Adds dynamic currency display so Paddle can use supported international currencies while Xendit remains IDR.
- No database migration required.
