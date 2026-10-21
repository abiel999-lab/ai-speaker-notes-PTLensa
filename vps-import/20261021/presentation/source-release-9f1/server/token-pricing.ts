/** Published Standard rates verified 2026-10-19. Historical event prices are
 * snapshotted, so a future rate update must introduce a new pricing version. */
export const TOKEN_PRICING = {
  version: "luna-2026-10-19", model: "gpt-6-luna", currency: "USD", verifiedAt: "2026-10-19",
  source: "https://developers.openai.com/api/docs/models/gpt-6-luna",
  perMillion: { input: 0.10, cachedInput: 0.01, cacheWrite: 0.125, output: 0.50 },
} as const;
export const ASTRA_PRICING = {
  version: "astra-2026-10-19", model: "gpt-6-astra", currency: "USD", verifiedAt: "2026-10-19",
  source: "https://developers.openai.com/api/docs/models/gpt-6-astra",
  perMillion: { input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50 },
} as const;
export const PRICING_VERSIONS: Record<string, typeof TOKEN_PRICING | typeof ASTRA_PRICING> = {
  [TOKEN_PRICING.version]: TOKEN_PRICING, [ASTRA_PRICING.version]: ASTRA_PRICING,
};
export interface TokenCost { nanoUsd: number | null; cached: number | null; written: number | null; assumed: boolean; pricingVersion?: string }
export function estimateTokenCost(input: number | null, output: number | null, payload?: any, expectedModel = "gpt-6-luna"): TokenCost {
  const valid = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 1e9;
  const pricing = expectedModel === "gpt-6-astra" ? ASTRA_PRICING : expectedModel === "gpt-6-luna" ? TOKEN_PRICING : null;
  const unknown = { nanoUsd: null, cached: null, written: null, assumed: true, pricingVersion: pricing?.version || "unknown" };
  if (!pricing) return unknown;
  if (!valid(input) || !valid(output)) return unknown;
  if (payload?.model !== undefined && (typeof payload.model !== "string" || !new RegExp("^" + expectedModel + "(?:-\\d{4}-\\d{2}-\\d{2})?$").test(payload.model))) return unknown;
  const details = payload?.usage?.input_tokens_details;
  const cached = details?.cached_tokens, written = details?.cache_write_tokens;
  if ((cached !== undefined && !valid(cached)) || (written !== undefined && !valid(written))) return unknown;
  const read = cached ?? 0, write = written ?? 0;
  if (read + write > input) return unknown;
  const tiers: Record<string, number> = { default: 1, standard: 1, fast: 2, priority: 2, flex: .5, batch: .5 };
  const tier = payload?.service_tier;
  if (tier !== undefined && (typeof tier !== "string" || !Object.hasOwn(tiers, tier))) return unknown;
  const multiplier = tier === undefined ? 1 : tiers[tier];
  const long = input > 272000;
  // Nano-USD keeps aggregation exact to $0.000000001. Cache writes replace
  // ordinary input pricing, rather than adding a second charge for that input.
  const rates = pricing.perMillion;
  const nanoUsd = Math.round(((input - read - write) * rates.input + read * rates.cachedInput + write * rates.cacheWrite) * 1000 * (long ? 2 : 1) * multiplier + output * rates.output * 1000 * (long ? 1.5 : 1) * multiplier);
  return { nanoUsd, pricingVersion: pricing.version, cached: cached ?? null, written: written ?? null,
    assumed: cached === undefined || written === undefined || tier === undefined || payload?.model === undefined };
}
