import { useEffect, useState } from "react";
import { api } from "../api";
interface Usage { input: number; output: number; total: number; calls: number; unreportedCalls: number;
  cost?: { estimatedUsd: number | null; unknownCalls: number; assumedCalls: number; currency: string;
    pricing: null | { model?: string; verifiedAt: string; source: string; perMillion: { input: number; cachedInput: number; cacheWrite: number; output: number } } } }
function dollars(usage: Usage) {
  const cost = usage.cost;
  if (!cost || cost.estimatedUsd === null) return "Unknown";
  const amount = cost.estimatedUsd > 0 && cost.estimatedUsd < .000001 ? "<$0.000001" : "$" + cost.estimatedUsd.toFixed(6);
  return amount + (cost.unknownCalls ? " + unknown" : "");
}
export function TokenUsage({ generationId, active }: { generationId?: string; active: boolean }) {
  const [today, setToday] = useState<Usage | null>(null), [generation, setGeneration] = useState<Usage | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let stopped = false, refreshing = false;
    setGeneration(null);
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const [day, job] = await Promise.all([api<{ usage: Usage }>("/token-usage"), generationId
          ? api<{ usage: Usage }>("/token-usage?generationId=" + generationId) : Promise.resolve(null)]);
        if (!stopped) { setToday(day.usage); setGeneration(job?.usage || null); setUnavailable(false); }
      } catch { if (!stopped) setUnavailable(true); }
      finally { refreshing = false; }
    }
    void refresh();
    const timer = setInterval(() => { void refresh(); }, active ? 2500 : 15000);
    window.addEventListener("verbatim-token-usage", refresh);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener("verbatim-token-usage", refresh); };
  }, [generationId, active]);
  const selected = generationId ? generation : today;
  const pricing = (selected || today)?.cost?.pricing;
  const number = (n: number) => n.toLocaleString("en-US");
  return <details className="token-usage-bar">
    <summary><span>AI tokens{generationId ? " · this version" : " · today"}</span>
      <strong>{unavailable ? "Unavailable" : !selected ? "Loading…" : number(selected.total) + (selected.unreportedCalls ? " + unknown" : "")}</strong>
      <span className="token-cost-summary">Estimated USD <strong>{unavailable ? "Unavailable" : !selected ? "Loading…" : dollars(selected)}</strong></span>
      {active && <span>Updating after each AI response…</span>}
    </summary>
    <div className="token-usage-details">
      {unavailable ? <p>Token usage could not be loaded. Open again after reloading.</p> : <>
        {generation && <p>This version: <strong>{number(generation.total)}</strong> · input {number(generation.input)} · output {number(generation.output)} · {generation.calls} AI calls · Estimated USD <strong>{dollars(generation)}</strong></p>}
        {today && <p>Today: <strong>{number(today.total)}</strong> · input {number(today.input)} · output {number(today.output)} · Estimated USD <strong>{dollars(today)}</strong></p>}
        {!!((generation || today)?.unreportedCalls) && <p>Usage was not reported for {(generation || today)!.unreportedCalls} call(s). Their token count is unknown.</p>}
        {!!(generation?.cost?.unknownCalls || today?.cost?.unknownCalls) && <p>Some calls have unknown cost. The estimate includes priced calls only.</p>}
        {!!(generation?.cost?.assumedCalls || today?.cost?.assumedCalls) && <p>Some calls lack cache or processing-tier details; Standard/uncached rates are assumed where details are missing.</p>}
        <small>Estimated API cost, not an invoice or account balance. Includes reported failed/repair attempts. Excludes taxes, regional premiums, negotiated pricing and hosting. Manual template edits do not call AI. Daily reset: 00:00 UTC.</small>
        {pricing && <small>Standard {pricing.model || "AI"} rates per 1M tokens: input ${pricing.perMillion.input.toFixed(2)} · cached input ${pricing.perMillion.cachedInput.toFixed(2)} · cache writes ${pricing.perMillion.cacheWrite} · output ${pricing.perMillion.output.toFixed(2)}. <a href={pricing.source} target="_blank" rel="noopener noreferrer">Rates verified {pricing.verifiedAt}</a>. Historical estimates retain their recorded rate version.</small>}
      </>}
    </div>
  </details>;
}
