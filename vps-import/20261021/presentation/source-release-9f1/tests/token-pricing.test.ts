import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Repository } from "../server/repository.js";
import { estimateTokenCost } from "../server/token-pricing.js";
import { trackedFetch } from "../server/provider-usage.js";

test("Luna USD estimates price the user's reported sample, cache replacements, long requests and supported tiers", () => {
  assert.equal(estimateTokenCost(581, 504).nanoUsd, 310100);
  assert.equal(estimateTokenCost(1075, 559).nanoUsd, 387000);
  assert.equal(estimateTokenCost(0, 0).nanoUsd, 0);
  const payload = { model: "gpt-6-luna", service_tier: "default", usage: { input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 } } };
  assert.equal(estimateTokenCost(1000, 500, payload).nanoUsd, 346000);
  assert.equal(estimateTokenCost(1000, 500, { ...payload, service_tier: "fast" }).nanoUsd, 692000);
  assert.equal(estimateTokenCost(1000, 500, { ...payload, service_tier: "flex" }).nanoUsd, 173000);
  assert.equal(estimateTokenCost(272000, 1).nanoUsd, 27200500);
  assert.equal(estimateTokenCost(272001, 1).nanoUsd, 54400950);
  for (const [input, output, extra] of [[null, null, undefined], [1, -1, undefined], [1, 1, { model: "another-model" }],
    [1, 1, { service_tier: "unknown-tier" }], [1, 1, { usage: { input_tokens_details: { cached_tokens: 2 } } }],
    [1, 1, { usage: { input_tokens_details: { cache_write_tokens: -1 } } }], [1.5, 1, undefined]] as const)
    assert.equal(estimateTokenCost(input, output, extra).nanoUsd, null);
});

test("Usage and price snapshots commit together, remain owner-scoped and never turn missing costs into zero", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "token-price-")); const repo = new Repository(root); await repo.init();
  const original = globalThis.fetch;
  try {
    const observer = trackedFetch(repo, "owner", "creative", "generation");
    globalThis.fetch = (async () => Response.json({ model: "gpt-6-luna", service_tier: "default", status: "incomplete",
      usage: { input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 } },
      private: "PROVIDER_BODY_NEVER_SAVED" })) as typeof fetch;
    await observer("https://api.openai.com/v1/responses");
    const usage = await repo.tokenUsage("owner", "generation");
    assert.equal(usage.cost.estimatedUsd, .000346); assert.equal(usage.cost.assumedCalls, 0);
    assert.equal((await repo.tokenUsage("other")).cost.estimatedUsd, 0);
    const event = { id: "stable", owner: "owner", kind: "qa", input: 581, output: 504, createdAt: new Date().toISOString() };
    await repo.recordTokenUsage(event); await repo.recordTokenUsage(event);
    assert.equal((await repo.tokenUsage("owner")).cost.estimatedUsd, .0006561);
    await repo.recordTokenUsage({ ...event, id: "unknown", owner: "unknown-owner", input: null, output: null });
    assert.equal((await repo.tokenUsage("unknown-owner")).cost.estimatedUsd, null);
    await repo.recordTokenUsage({ ...event, id: "partial", input: null, output: null });
    const partial = await repo.tokenUsage("owner");
    assert.equal(partial.cost.estimatedUsd, .0006561); assert.equal(partial.cost.unknownCalls, 1);
    const db = new DatabaseSync(path.join(root, "studio.sqlite"));
    // Simulate a future, recorded historical price; totals must use its snapshot.
    db.prepare("UPDATE token_event_costs SET nano_usd=1000000,pricing_version='historical-rate' WHERE event_id='stable'").run();
    assert.equal((await repo.tokenUsage("owner")).cost.estimatedUsd, .001346);
    db.exec("CREATE TRIGGER reject_cost BEFORE INSERT ON token_event_costs BEGIN SELECT RAISE(ABORT,'synthetic'); END;");
    await assert.rejects(() => repo.recordTokenUsage({ ...event, id: "must-rollback" }));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM token_events WHERE id='must-rollback'").get()!.n, 0);
    assert.ok(!JSON.stringify(db.prepare("SELECT * FROM token_event_costs").all()).includes("PROVIDER_BODY_NEVER_SAVED"));
    db.close();
  } finally { globalThis.fetch = original; await repo.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test("Schema 7 imports existing token events once without altering reported tokens or revaluing historical prices", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "price-upgrade-")); let repo = new Repository(root); await repo.init();
  try {
    await repo.recordTokenUsage({ id: "legacy", owner: "owner", kind: "qa", input: 581, output: 504, createdAt: new Date().toISOString() });
    await repo.close();
    const db = new DatabaseSync(path.join(root, "studio.sqlite"));
    db.prepare("INSERT INTO token_events (id,owner_id,kind,input_tokens,output_tokens,created_at) VALUES ('legacy-draft-old','older-owner','content-draft',100,100,?)").run(new Date().toISOString());
    db.prepare("INSERT INTO content_draft_events (id,owner_id,model,input_tokens,output_tokens,created_at) VALUES ('old','older-owner','another-model',100,100,?)").run(new Date().toISOString());
    db.exec("DROP TABLE token_event_costs; DELETE FROM schema_migrations WHERE version=7;"); db.close();
    repo = new Repository(root); await repo.init();
    const usage = await repo.tokenUsage("owner"); assert.equal(usage.total, 1085);
    assert.equal(usage.cost.estimatedUsd, .0003101); assert.equal(usage.cost.assumedCalls, 1);
    assert.equal((await repo.tokenUsage("older-owner")).cost.estimatedUsd, null);
    await repo.close(); repo = new Repository(root); await repo.init();
    assert.equal((await repo.tokenUsage("owner")).cost.estimatedUsd, .0003101);
  } finally { await repo.close(); await fs.rm(root, { recursive: true, force: true }); }
});


test("Premium model prices are isolated, mixed totals use stored snapshots and mismatched provider models remain unknown", async () => {
  const payload = { model: "gpt-6-astra", service_tier: "default", usage: { input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 } } };
  assert.equal(estimateTokenCost(1000, 500, payload, "gpt-6-astra").nanoUsd, 34600000);
  assert.equal(estimateTokenCost(1000, 500, payload).nanoUsd, null);
  assert.equal(estimateTokenCost(1000, 500, { ...payload, model: "gpt-6-luna" }, "gpt-6-astra").nanoUsd, null);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "premium-price-")); const repo = new Repository(root); await repo.init();
  const original = globalThis.fetch;
  try {
    const event = { id: "luna", owner: "owner", kind: "qa", input: 1000, output: 500, createdAt: new Date().toISOString() };
    await repo.recordTokenUsage(event);
    globalThis.fetch = (async () => Response.json({ ...payload, usage: { ...payload.usage, input_tokens: 1000, output_tokens: 500 } })) as typeof fetch;
    await trackedFetch(repo, "owner", "creative", "premium", "gpt-6-astra")("https://api.openai.com/v1/responses");
    const premium = await repo.tokenUsage("owner", "premium");
    assert.equal(premium.cost.estimatedUsd, .0346); assert.equal(premium.cost.pricing?.model, "gpt-6-astra");
    const mixed = await repo.tokenUsage("owner"); assert.equal(mixed.cost.estimatedUsd, .03495); assert.equal(mixed.cost.pricing, null);
    await repo.close(); await repo.init();
    assert.equal((await repo.tokenUsage("owner")).cost.estimatedUsd, .03495);
  } finally { globalThis.fetch = original; await repo.close(); await fs.rm(root, { recursive: true, force: true }); }
});
