#!/usr/bin/env node
/** Uses a disposable, random PostgreSQL schema and random Redis account key.
 * No user documents, provider calls, migrations of customer ownership or VPS actions.
 */
import sharp from "sharp";
import { parseSource } from "../server-dist/core/source.js";
import { creativeAtoms, sceneFromCreative } from "../server-dist/core/creative.js";
import { mkdir } from "node:fs/promises";
import { Pool } from "pg";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { estimateTokenCost } from "../server-dist/server/token-pricing.js";
import { Repository } from "../server-dist/server/repository.js";
import { createApp } from "../server-dist/server/app.js";
import { config } from "../server-dist/server/config.js";
import { JobRunner, processJob, redisConnection } from "../server-dist/server/jobs.js";
import { Queue, Worker } from "bullmq";

const cfg = config();
if (!cfg.database || !cfg.redis) throw new Error("POSTGRES_AND_REDIS_REQUIRED");
const schema = "qa9b_" + randomUUID().replaceAll("-", "");
const master = new Pool({ connectionString: cfg.database, connectionTimeoutMillis: 5000 });
const root = await mkdtemp(path.join(os.tmpdir(), "verbatim-9b-integration-"));
const repositories = [], apps = [];
let runner, worker, cleanupQueue;
let created = false, stage = "schema", succeeded = false;
try {
  await master.query(`CREATE SCHEMA "${schema}"`); created = true;
  const url = new URL(cfg.database);
  url.searchParams.set("options", "-c search_path=" + schema);
  const a = new Repository(root, url.href), b = new Repository(root, url.href);
  repositories.push(a, b);
  stage = "parallel_schema_initialization";
  await Promise.all([a.init(), b.init()]);
  const owner = "qa9b-" + randomUUID(), now = new Date().toISOString();
  await a.addUser({ id: owner, email: owner + "@example.invalid", password: "", createdAt: now });
  stage = "profile_name_refresh";
  const originalProfile = await a.oidcUser("https://idp.example.invalid/realms/qa", schema);
  const namedProfile = await b.oidcUser("https://idp.example.invalid/realms/qa", schema, "profile@example.invalid", "Profile Example");
  assert.equal(namedProfile.id, originalProfile.id);
  assert.equal(namedProfile.createdAt, originalProfile.createdAt);
  assert.equal(namedProfile.displayName, "Profile Example");
  assert.equal((await a.userById(originalProfile.id)).displayName, "Profile Example");
  async function job(name) {
    const projectId = randomUUID(), source = "# QA original\nOnly synthetic test content.";
    const sourceHash = createHash("sha256").update(source).digest("hex");
    await a.saveProject({ id: projectId, ownerId: owner, name, source, sourceHash, mode: "markdown",
      createdAt: now, updatedAt: now, latestId: null });
    return { id: randomUUID(), projectId, ownerId: owner, source, sourceHash,
      status: "queued", progress: 0, stage: "QA", settings: { theme: "ivory", mode: "markdown", useAI: false, images: false },
      createdAt: now, preview: "none", kind: "generation" };
  }
  stage = "concurrent_admission";
  const jobs = await Promise.all(Array.from({ length: 20 }, (_, i) => job("QA " + i)));
  const admissions = await Promise.allSettled(jobs.map((item, i) => (i % 2 ? a : b).admitJob(item, { generations: 50, ai: 50 }, true)));
  assert.equal(admissions.filter(r => r.status === "fulfilled").length, 2);
  for (const result of admissions) if (result.status === "rejected") assert.equal(result.reason.message, "TOO_MANY_ACTIVE_JOBS");
  assert.equal((await a.dailyUsage(owner)).generations, 2);
  assert.equal((await a.dailyUsage(owner)).ai, 2);
  for (const item of jobs) if (await a.job(item.id)) await a.saveJob({ ...item, status: "failed" });
  stage = "quota_transaction_rollback";
  const blocked = await job("Quota rollback");
  await assert.rejects(() => b.admitJob(blocked, { generations: 50, ai: 2 }, true), /QUOTA_EXCEEDED/);
  assert.equal((await a.dailyUsage(owner)).generations, 2);
  assert.equal(await a.job(blocked.id), null);
  stage = "lease_fencing";
  const leased = await job("Lease fencing"); await a.admitJob(leased);
  const first = randomUUID(), second = randomUUID();
  assert.ok(await a.claimJob(leased.id, first, 1));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(await b.claimJob(leased.id, second));
  assert.equal(await a.saveLeasedJob(leased, { ...leased, status: "ready" }, first), false);
  await a.releaseLease(leased.id, first);
  assert.equal(await b.renewLease(leased.id, second), true);
  assert.equal(await b.saveLeasedJob(leased, { ...leased, status: "failed" }, second), true);
  await b.releaseLease(leased.id, second);
  stage = "metadata_pagination";
  const page = await a.projectsPage(owner, { limit: 5, offset: 0, search: "QA ", sort: "name", filter: "all" });
  assert.equal(page.projects.length, 5); assert.equal(page.nextOffset, 5);
  assert.equal((await b.projectsPage("other-owner", { limit: 5, offset: 0, search: "", sort: "recent", filter: "all" })).projects.length, 0);
  stage = "token_ledger";
  const tokenEvent = { id: randomUUID(), owner, kind: "qa", input: 12, output: 3, createdAt: now };
  await a.recordTokenUsage(tokenEvent); await b.recordTokenUsage(tokenEvent);
  assert.equal((await b.tokenUsage(owner)).total, 15);
  assert.equal((await b.tokenUsage(owner)).cost.estimatedUsd, .0000027);
  await a.recordTokenUsage({ ...tokenEvent, id: randomUUID(), input: null, output: null });
  assert.equal((await b.tokenUsage(owner)).unreportedCalls, 1);
  assert.equal((await b.tokenUsage(owner)).cost.unknownCalls, 1);
  assert.equal((await b.tokenUsage(owner)).cost.estimatedUsd, .0000027);
  stage = "premium_cost_snapshot";
  await a.recordTokenUsage({ ...tokenEvent, id: randomUUID(), owner: "premium-qa", input: 1000, output: 500,
    cost: estimateTokenCost(1000, 500, { model: "gpt-6-astra" }, "gpt-6-astra") });
  assert.equal((await b.tokenUsage("premium-qa")).cost.estimatedUsd, .035);
  assert.equal((await b.tokenUsage("premium-qa")).cost.pricing.model, "gpt-6-astra");
  stage = "atomic_text_revision";
  const revisionJob = await job("Text revision QA");
  const previous = await a.getProject(revisionJob.projectId, owner);
  const source = "# Edited synthetic source\nExact revised content.";
  const next = { ...previous, source, sourceHash: createHash("sha256").update(source).digest("hex"), revision: 1 };
  revisionJob.source = source; revisionJob.sourceHash = next.sourceHash; revisionJob.kind = "text-edit";
  await a.admitJob(revisionJob, undefined, false, { previous, next });
  assert.equal((await b.getProject(revisionJob.projectId, owner)).source, source);
  await a.saveJob({ ...revisionJob, status: "failed" });
  await assert.rejects(() => b.admitJob({ ...revisionJob, id: randomUUID() }, undefined, false, { previous, next }), /PROJECT_CONFLICT/);
  assert.equal((await a.getProject(revisionJob.projectId, owner)).source, source);
  stage = "shared_redis_rate_limit";
  const options = { ...cfg, root, production: false, database: url.href, key: undefined, render: false,
    origin: "http://127.0.0.1:4310", oidc: { issuer: "https://idp.example.invalid/realms/qa", clientId: "qa9b" } };
  stage = "redis_outbox_recovery";
  const queued = await job("Outbox recovery");
  const asset = randomUUID(), imageDir = path.join(root, "assets", queued.projectId);
  await mkdir(imageDir, { recursive: true });
  await sharp({ create: { width: 320, height: 180, channels: 3, background: "#203A52" } }).jpeg().toFile(path.join(imageDir, asset + ".jpg"));
  const doc = parseSource(queued.source), atoms = creativeAtoms(doc);
  const raw = { menuSlide: 1, slides: atoms.map((a, i) => ({ background: "#132536", shapes: [],
    image: { assetId: asset, placement: "background", treatment: "dark", textSide: "left", x: 0, y: 0, w: 13.333333, h: 7.5 },
    boxes: [{ key: a.key, x: .8, y: 1.2, w: 6.9, h: 4.5, fontSize: 30, bold: true, color: "#FFFFFF", targetSlide: i === 0 ? 2 : 1 }] })) };
  queued.settings = { ...queued.settings, creationMode: "creative", motion: "keynote", interactiveLinks: true,
    creativePrompt: "Synthetic cached-plan outbox recovery", creativeSlideCount: 2, creativeAssets: [{ id: asset, description: "Synthetic QA image" }] };
  // Recovery of an already composed plan exercises the real worker without a provider call.
  queued.scene = sceneFromCreative(doc, raw, "ivory", true, { assets: queued.settings.creativeAssets, slideCount: 2, interactiveLinks: true });
  queued.plan = { engine: "openai", slides: queued.scene.slides.map(s => ({ id: s.id, blockIds: s.blockIds, layout: "editorial", imageId: asset })) };
  await a.admitJob(queued);
  const queueName = schema + "_queue";
  cleanupQueue = new Queue(queueName, { connection: redisConnection(cfg.redis) });
  worker = new Worker(queueName, item => processJob(b, options, item.data.id), {
    connection: { ...redisConnection(cfg.redis), maxRetriesPerRequest: null, enableOfflineQueue: true }, concurrency: 2,
  });
  worker.on("error", () => {});
  await worker.waitUntilReady();
  runner = new JobRunner(a, options, queueName); await runner.init();
  // Deliberately do not enqueue: the database outbox must deliver the committed job.
  const deadline = Date.now() + 45000;
  let finished;
  do {
    finished = await a.job(queued.id);
    if (["ready", "failed"].includes(finished.status)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(finished.status, "ready"); assert.equal(finished.report?.exportVerified, true);
  assert.equal(finished.report?.motion?.transitionSlides, finished.scene.slides.length);
  assert.ok(finished.report?.motion?.animatedObjects >= 2);
  assert.equal(finished.report?.interactive?.links, 2);
  assert.equal(finished.report?.interactive?.uploadedImages, 2);
  await worker.close(); worker = undefined;
  await runner.close(); runner = undefined;
  stage = "shared_redis_rate_limit";
  const one = await createApp(options); apps.push(one.app);
  const two = await createApp(options); apps.push(two.app);
  const token = randomBytes(32).toString("base64url");
  await a.createAuthSession(createHash("sha256").update(token).digest("hex"), owner, Date.now() + 600000);
  for (let i = 0; i <= 600; i++) {
    const result = await apps[i % 2].inject({ url: "/api/capabilities", headers: { cookie: "vb_oidc_session=" + token } });
    assert.equal(result.statusCode, i === 600 ? 429 : 200);
  }
  const health = await one.app.inject("/api/health");
  assert.equal(health.statusCode, 200);
  succeeded = true;
  console.log(JSON.stringify({ result: "PASS", postgres: true, redis: true, profileNameRefresh: true, tokenLedger: true, estimatedUsd: true, historicalCostSnapshot: true, nativeMotionExport: true, cinematicImagesAndLinks: true, atomicTextRevision: true,
    concurrentAdmission: true, quotaRollback: true, leaseFencing: true,
    ownerPagination: true, outboxRecoveredAndExportVerified: true, sharedRateLimit: true,
    syntheticDataOnly: true, paidAiCalls: 0 }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ result: "FAIL", stage,
    code: /^[A-Z0-9_]{1,60}$/.test(error?.code || "") ? error.code : "INTEGRATION_CHECK_FAILED" }));
  process.exitCode = 1;
} finally {
  if (worker) await worker.close().catch(() => {});
  if (runner) await runner.close().catch(() => {});
  if (cleanupQueue) {
    try { await cleanupQueue.obliterate({ force: true }); }
    catch { console.error("QA_REDIS_CLEANUP_REQUIRED:", schema + "_queue"); process.exitCode = 1; succeeded = false; }
    await cleanupQueue.close().catch(() => {});
  }
  for (const app of apps) await app.close().catch(() => {});
  for (const repo of repositories) await repo.close().catch(() => {});
  if (created) {
    try { await master.query(`DROP SCHEMA "${schema}" CASCADE`); }
    catch { console.error("QA_SCHEMA_CLEANUP_REQUIRED:", schema); process.exitCode = 1; succeeded = false; }
  }
  await master.end(); await rm(root, { recursive: true, force: true });
  if (succeeded) console.log("Disposable QA schema removed; customer projects unchanged.");
}
