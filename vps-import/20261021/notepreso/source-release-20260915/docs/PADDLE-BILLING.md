# Paddle Billing integration

NotePreso 1.5.0 adds Paddle Billing as an optional one-time payment provider. Internal NotePreso entitlements remain the source of truth. A verified `transaction.completed` webhook grants Pro for the configured access period.

## Important currency note

Paddle does not support IDR as a payment currency. Keep Xendit for the local Rp50,000 flow. For Paddle, create a one-time catalog price in a supported currency such as USD, then configure its price ID, currency, and minor-unit amount in NotePreso.

## Sandbox setup

1. Create a Paddle sandbox account.
2. Create a one-time NotePreso Pro product/price and copy the `pri_...` price ID.
3. Create a sandbox API key and client-side token.
4. Set the default payment link to `https://notepreso.com/paddle/checkout`.
5. Create a notification destination for `transaction.completed` pointing to `https://notepreso.com/api/v1/billing/paddle/webhook` and copy its endpoint secret.
6. Configure NotePreso with `PAYMENT_PROVIDER=paddle`, the sandbox API URL/credentials, price ID, price amount/currency, and access days.

Do not paste API keys or webhook secrets into chat or source control.
