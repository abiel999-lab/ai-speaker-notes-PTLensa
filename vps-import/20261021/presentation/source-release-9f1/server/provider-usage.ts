import { randomUUID } from "node:crypto";
import type { Repository } from "./repository.js";
import { estimateTokenCost } from "./token-pricing.js";
/** Observe reported usage before output parsing, including rejected model outputs.
 * This ledger never stores keys, prompts, source text or provider response bodies. */
export function trackedFetch(repo: Repository, owner: string, kind: string, generationId?: string, expectedModel = "gpt-6-luna"): typeof fetch {
  return (async (input, init) => {
    let response: Response;
    const record = async (payload?: any) => {
      const valid = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1e9;
      const usage = payload?.usage;
      const reported = valid(usage?.input_tokens) && valid(usage?.output_tokens);
      await repo.recordTokenUsage({ id: randomUUID(), owner, kind, generationId,
        input: reported ? usage.input_tokens : null, output: reported ? usage.output_tokens : null,
        cost: estimateTokenCost(reported ? usage.input_tokens : null, reported ? usage.output_tokens : null, payload, expectedModel),
        createdAt: new Date().toISOString() }).catch(() =>
          console.error(JSON.stringify({ event: "token_metrics", code: "METRICS_UNAVAILABLE" })));
    };
    try { response = await fetch(input, init); }
    catch (error) { await record(); throw error; }
    let payload: unknown;
    try { payload = await response.clone().json(); } catch { /* No usage was reported. */ }
    await record(payload);
    return response;
  }) as typeof fetch;
}
