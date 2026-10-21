# NotePreso 1.6.0 — Multi-Provider Billing

NotePreso can expose more than one configured payment gateway at the same time. Users choose a provider when buying 30 days of Pro access. Xendit and Paddle can therefore coexist; Stripe can be enabled later without replacing either provider.

Configuration uses `PAYMENT_PROVIDERS=xendit,paddle` for enabled gateways. The legacy `PAYMENT_PROVIDER` remains the default/fallback for backward compatibility. Provider credentials remain independent and payment success continues to update the same internal subscription/entitlement record.
