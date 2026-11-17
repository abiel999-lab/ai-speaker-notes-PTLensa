import test from "node:test";
import sharp from "sharp";
import JSZip from "jszip";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Repository } from "../server/repository.js";
import { randomBytes, createHash } from "node:crypto";
import { parseSource } from "../core/source.js";
import { sceneFromCreative, createCreativeScene, creativeAtoms } from "../core/creative.js";
import { verifyInternalSlideLinks } from "../core/scene-features.js";
import { exportPptx } from "../core/export.js";
import { validateScene, verifyPptx } from "../core/fidelity.js";
import { createApp } from "../server/app.js";
import { csrfToken } from "../server/auth.js";
import { trackedFetch } from "../server/provider-usage.js";
import type { Config } from "../server/config.js";

const source = "# Exact original title\nA full original paragraph with 43.2%, punctuation and unchanged meaning.\n- First step\n- Second step";
function composition(atoms: { key: string }[]) {
  return { slides: atoms.map((atom, i) => ({ background: i % 2 ? "#F5F1E8" : "#132536",
    boxes: [{ key: atom.key, x: i % 2 ? 2.1 : .9, y: 1.7, w: 9.8, h: 4.5, fontSize: 30, bold: i === 0, color: "#FFFFFF" }],
    shapes: [{ shape: "rect", x: .1, y: .1, w: 13, h: .17, fill: "#ADE868" }] })) };
}
const completed = (data: unknown, input = 700, output = 130) => Response.json({ status: "completed", usage: { input_tokens: input, output_tokens: output },
  output: [{ content: [{ type: "output_text", text: JSON.stringify(data) }] }] });
const settings = { theme: "ivory", mode: "markdown", useAI: false, images: false };
async function fixture(generations = 20) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "product-modes-"));
  const cfg: Config = { root, production: false, host: "127.0.0.1", port: 4310, origin: "http://127.0.0.1:4310", model: "gpt-6-luna",
    key: "test-secret-never-output", render: false, soffice: "soffice", pdftoppm: "pdftoppm", oidc: { issuer: "https://idp.example.invalid/realms/test", clientId: "test" }, usageLimits: { generations, ai: 10 } };
  const { app, repo } = await createApp(cfg);
  const owner = await repo.oidcUser(cfg.oidc!.issuer, "owner"), other = await repo.oidcUser(cfg.oidc!.issuer, "other");
  async function session(id: string) {
    const token = randomBytes(32).toString("base64url");
    await repo.createAuthSession(createHash("sha256").update(token).digest("hex"), id, Date.now() + 600000);
    return { cookie: "vb_oidc_session=" + token, origin: cfg.origin!, "x-csrf-token": csrfToken(token) };
  }
  const headers = await session(owner.id), otherHeaders = await session(other.id);
  const call = (method: "GET" | "POST" | "DELETE", url: string, payload?: any, h = headers) => app.inject({ method, url, payload, headers: h });
  async function project(text = source) {
    const result = await call("POST", "/api/projects", { name: "Product test", source: text, mode: "markdown" });
    assert.equal(result.statusCode, 200); return result.json().project;
  }
  async function wait(id: string) {
    for (let i = 0; i < 200; i++) {
      const job = (await call("GET", "/api/generations/" + id)).json().generation;
      if (["ready", "failed", "cancelled"].includes(job.status)) return job;
      await new Promise(r => setTimeout(r, 15));
    }
    throw new Error("TEST_JOB_TIMEOUT");
  }
  return { root, app, repo, owner, cfg, headers, otherHeaders, call, project, wait,
    close: async () => { await app.close(); await fs.rm(root, { recursive: true, force: true }); } };
}

test("Creative AI uses custom geometry, preserves every source block and exports a verified native PPTX", async () => {
  const doc = parseSource(source), atoms = creativeAtoms(doc);
  const scene = sceneFromCreative(doc, composition(atoms), "ivory");
  assert.equal(scene.slides[0].objects[1].x, .9);
  assert.equal(scene.slides[1].objects[1].x, 2.1);
  const { bytes, report } = await exportPptx(doc, scene);
  assert.equal(report.passed, true); assert.equal((await verifyPptx(doc, bytes)).passed, true);
  assert.ok(scene.slides[1].objects[1].color !== "#FFFFFF", "Unreadable white-on-light text must be corrected");
  const repeated = composition(atoms); repeated.slides[1].boxes[0].key = atoms[0].key;
  assert.throws(() => sceneFromCreative(doc, repeated, "ivory"), /CREATIVE_INVALID_SCENE/);
  const overflow = composition(atoms); overflow.slides[0].boxes[0].x = 13;
  assert.throws(() => sceneFromCreative(doc, overflow, "ivory"), /CREATIVE_INVALID_SCENE/);
  const extra = composition(atoms) as any; extra.slides[0].boxes[0].text = "Invented text";
  assert.throws(() => sceneFromCreative(doc, extra, "ivory"));
});

test("Creative uses one Luna request and a disclosed local fallback while retaining usage", async () => {
  const doc = parseSource(source); let calls = 0, repairs = 0;
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    assert.equal(request.model, "gpt-6-luna"); assert.equal(request.store, false);
    assert.ok(!JSON.stringify(request.text.format.schema).includes('"layout"'));
    const data = composition(JSON.parse(request.input).atoms); calls++;
    if (calls === 1) data.slides[0].boxes[0].key = "untrusted";
    return completed(data);
  }) as typeof fetch;
  const result = await createCreativeScene(doc, "Make a distinctive editorial composition", { key: "fixture", theme: "ivory", fetcher, onRepair: async () => { repairs++; } });
  assert.equal(calls, 1); assert.equal(repairs, 0);
  assert.equal(result.plan.ai?.outcome, "fallback");
  assert.equal(result.plan.usage?.input, 700); assert.equal(result.plan.usage?.output, 130);
  let invalidCalls = 0;
  const recovered = await createCreativeScene(doc, "A visual brief", { key: "fixture", theme: "ivory", fetcher: (async () => { invalidCalls++; return completed({ slides: [] }); }) as typeof fetch });
  assert.equal(invalidCalls, 1);
  assert.equal(recovered.plan.ai?.outcome, "fallback");
  assert.equal(validateScene(doc, recovered.scene).passed, true);
});

test("Creative reports sanitized errors then locally rescues invalid geometry in one call", async () => {
  const doc = parseSource(source);
  const issues: { reason: string; slide?: number; path?: string; attempt?: number }[] = [];
  let calls = 0;
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    calls++;
    const request = JSON.parse(String(init.body));
    const input = JSON.parse(request.input);
    const data = composition(input.atoms);
    data.slides[0].boxes[0].x = 13.1;
    return completed(data);
  }) as typeof fetch;
  const recovered = await createCreativeScene(doc, "Editorial design", { key: "fixture", theme: "ivory", fetcher,
    onValidationFailure: issue => { issues.push(issue); } });
  assert.equal(calls, 1);
  assert.equal(recovered.plan.ai?.outcome, "fallback");
  assert.deepEqual(issues, [{ reason: "OBJECT_OUT_OF_BOUNDS", slide: 1, attempt: 1 }]);
  assert.equal(validateScene(doc, recovered.scene).passed, true);
});

test("Creative export supports long Unicode source and native source tables without losing text", async () => {
  const doc = parseSource("## Mixed source\n" + "Original café words 漢字. ".repeat(85) + "\n\n| A | B |\n|---|---|\n| Exact | 43.2% |\n");
  const atoms = creativeAtoms(doc);
  assert.ok(atoms.length > doc.blocks.length);
  const raw = composition(atoms);
  for (const s of raw.slides) { s.boxes[0].x = .65; s.boxes[0].y = .6; s.boxes[0].w = 12; s.boxes[0].h = 6.2; s.boxes[0].fontSize = 20; }
  const { report } = await exportPptx(doc, sceneFromCreative(doc, raw, "ivory"));
  assert.equal(report.exportVerified, true); assert.equal(report.changed.length, 0);
});

test("Template text edit is atomic, preserves earlier exports and rolls back completely on quota rejection", async () => {
  const f = await fixture(2);
  try {
    const p = await f.project("# Original heading\r\nOriginal exact body.\r\n");
    const created = await f.call("POST", `/api/projects/${p.id}/generate`, { settings });
    const first = await f.wait(created.json().generation.id); assert.equal(first.status, "ready");
    const oldExport = (await f.call("GET", `/api/generations/${first.id}/export`)).rawPayload;
    const edit = { blockId: "b1", text: "Edited café text with 43.2%.", expectedRevision: 1, expectedSourceHash: first.sourceHash };
    assert.equal((await f.call("POST", `/api/generations/${first.id}/text`, edit, f.otherHeaders)).statusCode, 404);
    const edited = await f.call("POST", `/api/generations/${first.id}/text`, edit);
    assert.equal(edited.statusCode, 202, edited.body);
    const next = await f.wait(edited.json().generation.id); assert.equal(next.status, "ready");
    assert.equal(next.kind, "text-edit"); assert.equal(next.settings.useAI, false);
    assert.equal(next.source, "# Original heading\r\nEdited café text with 43.2%.\r\n");
    const now = await f.repo.getProject(p.id, f.owner.id); assert.equal(now!.revision, 2);
    assert.deepEqual((await f.call("GET", `/api/generations/${first.id}/export`)).rawPayload, oldExport);
    const blocked = await f.call("POST", `/api/generations/${next.id}/text`, { ...edit, text: "Must not be saved", expectedRevision: 2, expectedSourceHash: next.sourceHash });
    assert.equal(blocked.statusCode, 429); assert.equal(blocked.json().error, "QUOTA_EXCEEDED");
    assert.deepEqual(await f.repo.getProject(p.id, f.owner.id), now);
    assert.equal((await f.repo.dailyUsage(f.owner.id)).ai, 0);
    assert.equal((await f.repo.tokenUsage(f.owner.id)).calls, 0);
  } finally { await f.close(); }
});

test("Creative jobs expose downloads and token counts but reject all template mutation paths", async () => {
  const f = await fixture(); const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => completed(composition(JSON.parse(JSON.parse(String(init.body)).input).atoms))) as typeof fetch;
  try {
    const p = await f.project();
    const creativeSettings = { ...settings, creationMode: "creative", creativePrompt: "Navy and lime, offset typography and geometric accents" };
    const created = await f.call("POST", `/api/projects/${p.id}/generate`, { settings: creativeSettings });
    assert.equal(created.statusCode, 202, created.body);
    const job = await f.wait(created.json().generation.id); assert.equal(job.status, "ready", job.error);
    assert.equal((await f.call("GET", `/api/generations/${job.id}/export`)).statusCode, 200);
    for (const suffix of ["design-preview", "design", "slide-suggestion", "text"])
      assert.equal((await f.call("POST", `/api/generations/${job.id}/${suffix}`, {})).statusCode, 403, suffix);
    const usage = (await f.call("GET", `/api/token-usage?generationId=${job.id}`)).json().usage;
    assert.equal(usage.input, 700); assert.equal(usage.output, 130); assert.equal(usage.total, 830);
    assert.equal((await f.call("GET", `/api/token-usage?generationId=${job.id}`, undefined, f.otherHeaders)).statusCode, 404);
    assert.equal((await f.call("GET", "/api/token-usage", undefined, f.otherHeaders)).json().usage.total, 0);
    const project = (await f.call("GET", "/api/projects/" + p.id)).json().project;
    await f.call("DELETE", "/api/projects/" + project.id);
    assert.equal((await f.repo.tokenUsage(f.owner.id)).total, 830);
  } finally { globalThis.fetch = originalFetch; await f.close(); }
});

test("Usage observation records reported failures and unknown usage, without persisting response bodies", async () => {
  const f = await fixture(); const originalFetch = globalThis.fetch;
  try {
    const wrapped = trackedFetch(f.repo, f.owner.id, "test");
    globalThis.fetch = (async () => Response.json({ status: "incomplete", usage: { input_tokens: 123, output_tokens: 45 }, private: "DO_NOT_PERSIST_PROVIDER_BODY" })) as typeof fetch;
    await wrapped("https://api.openai.com/v1/responses");
    globalThis.fetch = (async () => Response.json({ error: "private provider failure" }, { status: 429 })) as typeof fetch;
    await wrapped("https://api.openai.com/v1/responses");
    globalThis.fetch = (async () => { throw new Error("private network failure"); }) as typeof fetch;
    await assert.rejects(() => wrapped("https://api.openai.com/v1/responses"));
    const usage = await f.repo.tokenUsage(f.owner.id);
    assert.equal(usage.total, 168); assert.equal(usage.calls, 3); assert.equal(usage.unreportedCalls, 2);
    const data = await fs.readFile(path.join(f.root, "studio.sqlite"));
    assert.ok(!data.includes(Buffer.from("DO_NOT_PERSIST_PROVIDER_BODY")));
  } finally { globalThis.fetch = originalFetch; await f.close(); }
});


test("Creative fallback avoids repeat charges and cancellation still blocks export", async () => {
  for (const cancel of [false, true]) {
    const f = await fixture(); const originalFetch = globalThis.fetch; let calls = 0;
    f.cfg.usageLimits!.ai = 1;
    globalThis.fetch = (async () => {
      calls++;
      if (cancel) {
        const jobs = await f.repo.queued();
        const project = (await f.repo.projects(f.owner.id))[0];
        const active = (await f.repo.jobsForProject(project.id, f.owner.id))[0] || jobs[0];
        await f.repo.compareAndSaveJob(active, { ...active, status: "cancelled", stage: "Cancelled" });
      }
      return completed({ slides: [] });
    }) as typeof fetch;
    try {
      const p = await f.project();
      const result = await f.call("POST", `/api/projects/${p.id}/generate`, { settings: { ...settings, creationMode: "creative", creativePrompt: "Create a custom navy design" } });
      const job = await f.wait(result.json().generation.id);
      assert.equal(job.status, cancel ? "cancelled" : "ready");
      if (!cancel) assert.equal(job.plan?.ai?.outcome, "fallback");
      assert.equal(calls, 1); assert.equal((await f.repo.dailyUsage(f.owner.id)).ai, 1);
      assert.equal((await f.repo.tokenUsage(f.owner.id)).total, 830);
    } finally { globalThis.fetch = originalFetch; await f.close(); }
  }
});

test("Schema v6 imports historical reported usage once, retaining totals across repository restarts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "token-migration-"));
  let repo = new Repository(root); await repo.init();
  try {
    await repo.recordPromptDraftUsage("legacy-owner", { model: "gpt-6-luna", inputTokens: 42, outputTokens: 8 });
    await repo.close();
    const db = new DatabaseSync(path.join(root, "studio.sqlite"));
    db.exec("DROP TABLE token_events; DELETE FROM schema_migrations WHERE version=6;"); db.close();
    repo = new Repository(root); await repo.init();
    assert.equal((await repo.tokenUsage("legacy-owner")).total, 50);
    await repo.close(); repo = new Repository(root); await repo.init();
    assert.equal((await repo.tokenUsage("legacy-owner")).total, 50);
    assert.equal((await repo.tokenUsage("other-owner")).total, 0);
  } finally { await repo.close(); await fs.rm(root, { recursive: true, force: true }); }
});


test("Legacy Premium settings still route only Luna, with native motion and Luna usage pricing", async () => {
  const f = await fixture(); const original = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body)); assert.equal(request.model, "gpt-6-luna");
    assert.equal(request.reasoning.effort, "low");
    assert.ok(request.instructions.includes("EVERY text/table box must end at y<=6.84"));
    const response = await completed(composition(JSON.parse(request.input).atoms)).json();
    return Response.json({ ...response, model: "gpt-6-luna" });
  }) as typeof fetch;
  try {
    const p = await f.project();
    const result = await f.call("POST", `/api/projects/${p.id}/generate`, { settings: {
      ...settings, creationMode: "creative", creativePrompt: "Make every word look its best", creativeQuality: "premium", motion: "keynote" } });
    assert.equal(result.statusCode, 202, result.body);
    const job = await f.wait(result.json().generation.id); assert.equal(job.status, "ready", job.error);
    assert.equal(job.plan.ai.model, "gpt-6-luna"); assert.equal(job.report.motion.transitionSlides, job.scene.slides.length);
    assert.equal(job.report.motion.navigationSlides, job.scene.slides.length); assert.ok(job.report.motion.animatedObjects >= 4);
    assert.equal((await f.repo.tokenUsage(f.owner.id, job.id)).cost.estimatedUsd, .000135);
    assert.equal((await f.call("POST", `/api/generations/${job.id}/text`, {})).statusCode, 403);
  } finally { globalThis.fetch = original; await f.close(); }
});

test("Creative geometry aligns text, protects contrast on panels and rejects ornaments crossing source boxes", async () => {
  const doc = parseSource("# Exact words stay intact"); const raw = composition(creativeAtoms(doc)) as any;
  raw.slides[0].boxes[0] = { ...raw.slides[0].boxes[0], x: 1.1, y: 1.4, w: 6, h: 2, fontSize: 40, align: "center", color: "#FFFFFF" };
  raw.slides[0].shapes = [{ shape: "roundRect", x: .8, y: 1, w: 7, h: 3.8, fill: "#FFFFFF", stroke: null, strokeWidth: 0, fillOpacity: 1 },
    { shape: "chevron", x: 9, y: 2, w: 2, h: 2, fill: "#ACE458", stroke: "#132536", strokeWidth: 2, fillOpacity: .8 }];
  const scene = sceneFromCreative(doc, raw, "ivory", true);
  assert.equal(scene.slides[0].objects.at(-1)!.align, "center"); assert.equal(scene.slides[0].objects.at(-1)!.color, "#111111");
  assert.equal((await exportPptx(doc, scene, {}, "keynote")).report.exportVerified, true);
  raw.slides[0].shapes.push({ shape: "ellipse", x: 5, y: 1, w: 3, h: 3, fill: "#111111" });
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", true), /CREATIVE_INVALID_SCENE/);
  raw.slides[0].shapes.pop(); raw.slides[0].boxes[0].y = 5;
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", true), /CREATIVE_INVALID_SCENE/);
});


test("Creative images and content links export through the owner-scoped worker with exact slide count and Luna only", async () => {
  const f = await fixture(); const original = globalThis.fetch; let calls = 0;
  try {
    const p = await f.project();
    const ids: string[] = [];
    for (const color of ["#235470", "#A64539"]) {
      const png = await sharp({ create: { width: 320, height: 180, channels: 3, background: color } }).png().toBuffer();
      const uploaded = await f.call("POST", `/api/projects/${p.id}/image`, { base64: png.toString("base64") });
      assert.equal(uploaded.statusCode, 200); ids.push(uploaded.json().assetId);
    }
    const gallery = await f.call("GET", `/api/projects/${p.id}/images`);
    assert.deepEqual(new Set(gallery.json().assets.map((a: any) => a.id)), new Set(ids));
    assert.equal((await f.call("GET", `/api/projects/${p.id}/images`, undefined, f.otherHeaders)).statusCode, 404);
    assert.equal((await f.call("GET", `/api/projects/${p.id}/image/${ids[0]}`, undefined, f.otherHeaders)).statusCode, 404);
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
      calls++; const request = JSON.parse(String(init.body)), input = JSON.parse(request.input);
      assert.equal(request.model, "gpt-6-luna"); assert.equal(input.targetSlideCount, 4); assert.equal(input.interactiveLinks, true);
      assert.deepEqual(input.assets.map((a: any) => a.id), ids); assert.ok(!String(init.body).includes("base64"));
      const raw = composition(input.atoms) as any; raw.menuSlide = 2;
      for (const [i, slide] of raw.slides.entries()) {
        slide.image = { assetId: ids[i % 2], x: 0, y: 0, w: 13.333333, h: 7.5, placement: "background", treatment: i % 2 ? "light" : "dark", textSide: i % 2 ? "right" : "left" };
        slide.boxes[0].x = i % 2 ? 5.2 : .9; slide.boxes[0].w = 6.9;
        slide.boxes[0].targetSlide = i === 3 ? 2 : i + 2;
      }
      return completed(raw);
    }) as typeof fetch;
    const created = await f.call("POST", `/api/projects/${p.id}/generate`, { settings: { ...settings, creationMode: "creative", creativePrompt: "Cinematic art with a topic menu and linked source labels", motion: "keynote", interactiveLinks: true,
      creativeSlideCount: 4, creativeAssets: ids.map((id, i) => ({ id, description: "Synthetic image " + i })) } });
    assert.equal(created.statusCode, 202, created.body);
    const job = await f.wait(created.json().generation.id); assert.equal(job.status, "ready", job.error); assert.equal(calls, 1);
    assert.equal(job.scene.slides.length, 4); assert.equal(job.report.motion.navigationSlides, 4); assert.deepEqual(job.report.interactive, { links: 4, uploadedImages: 4, menuSlide: 2 });
    assert.equal(job.report.quality.overlaps, 0); assert.equal(job.report.exportVerified, true);
    const download = await f.call("GET", `/api/generations/${job.id}/export`); assert.equal(download.statusCode, 200);
    const zip = await JSZip.loadAsync(download.rawPayload);
    assert.equal(Object.keys(zip.files).filter(n => /^ppt\/media\/image.+\.jpeg$/.test(n) || /^ppt\/media\/image.+\.jpg$/.test(n)).length >= 2, true);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string"); assert.match(xml, /ppaction:\/\/hlinksldjump/); assert.match(xml, /<a:gradFill/);
    assert.equal(job.scene.slides[1].objects.at(-1).color, "#111111");
    const relName = "ppt/slides/_rels/slide1.xml.rels";
    const relXml = await zip.file(relName)!.async("string");
    zip.file(relName, relXml.replace(/Target="(?:\.\.\/slides\/)?slide2\.xml"/g, 'Target="https://invalid.example/" TargetMode="External"'));
    const tampered = await zip.generateAsync({ type: "nodebuffer" });
    await assert.rejects(() => verifyInternalSlideLinks(tampered), /SCENE_INTERACTION_INVALID/);
    assert.equal((await verifyPptx(parseSource(source), download.rawPayload)).passed, true);
    const otherProject = await f.project();
    const blocked = await f.call("POST", `/api/projects/${otherProject.id}/generate`, { settings: { ...settings, creationMode: "creative", creativePrompt: "Use an unowned image", creativeAssets: [{ id: ids[0], description: "Private other project" }] } });
    assert.equal(blocked.statusCode, 400); assert.equal(blocked.json().error, "IMAGE_NOT_FOUND"); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; await f.close(); }
});

test("Creative bounds reject unknown image paths, unsafe backgrounds, invalid links and impossible counts before provider charges", async () => {
  const doc = parseSource(source), raw = composition(creativeAtoms(doc)) as any;
  const asset = "00000000-0000-4000-8000-000000000001", features = { assets: [{ id: asset, description: "Known art" }], interactiveLinks: true };
  raw.slides[0].image = { assetId: "../../private", x: 0, y: 0, w: 13.333333, h: 7.5, placement: "background", treatment: "dark" };
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", false, features), /CREATIVE_INVALID_SCENE/);
  raw.slides[0].image.assetId = asset; raw.slides[0].image.treatment = "none";
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", false, features), /CREATIVE_INVALID_SCENE/);
  raw.slides[0].image.treatment = "dark"; raw.slides[0].image.textSide = "left";
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", false, features), /CREATIVE_INVALID_SCENE/);
  raw.slides[0].image.textSide = "full";
  raw.slides[0].boxes[0].targetSlide = 99;
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", false, features));
  raw.slides[0].boxes[0].targetSlide = 1;
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", false, features), /CREATIVE_INVALID_SCENE/);
  raw.slides[0].boxes[0].targetSlide = 2;
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", false, { ...features, interactiveLinks: false }), /CREATIVE_INVALID_SCENE/);
  assert.throws(() => sceneFromCreative(doc, raw, "ivory", false, { ...features, slideCount: 3 }), /CREATIVE_INVALID_SCENE/);
  const valid = sceneFromCreative(doc, raw, "ivory", false, features); valid.slides[0].objects.at(-1)!.targetSlide = 99;
  await assert.rejects(() => exportPptx(doc, valid), /SCENE_INTERACTION_INVALID/);
  let called = false;
  await assert.rejects(() => createCreativeScene(doc, "A complete presentation", { key: "fixture", theme: "ivory", features: { slideCount: 40 },
    fetcher: (async () => { called = true; throw new Error("Must not call provider"); }) as typeof fetch }), /CREATIVE_SLIDE_COUNT/);
  assert.equal(called, false);
  const f = await fixture();
  try {
    const p = await f.project();
    const response = await f.call("POST", `/api/projects/${p.id}/generate`, { settings: { ...settings, creationMode: "creative", creativePrompt: "Exactly forty slides", creativeSlideCount: 40 } });
    assert.equal(response.statusCode, 400); assert.equal(response.json().error, "CREATIVE_SLIDE_COUNT");
    assert.equal((await f.repo.dailyUsage(f.owner.id)).ai, 0); assert.equal((await f.repo.dailyUsage(f.owner.id)).generations, 0);
  } finally { await f.close(); }
});

test("Creative safety locally expands image scrim and removes crossing ornaments without a second Luna call", async () => {
  const doc = parseSource(source), atoms = creativeAtoms(doc);
  const asset = "00000000-0000-4000-8000-000000000001";
  const raw = composition(atoms) as any;
  raw.slides[0].image = { assetId: asset, x: 0, y: 0, w: 13.333333, h: 7.5, placement: "background", treatment: "dark", textSide: "left" };
  raw.slides[0].boxes[0].x = 9.0;
  raw.slides[0].boxes[0].w = 3;
  raw.slides[0].boxes[0].h = 4.5;
  raw.slides[0].shapes.push({ shape: "ellipse", x: 9.2, y: 1.8, w: 2, h: 2, fill: "#C0D0E0" });
  const fixes: string[][] = []; let calls = 0, repairs = 0;
  const result = await createCreativeScene(doc, "Cinematic anime", {
    key: "fixture", theme: "ivory", motion: "keynote", features: { assets: [{ id: asset, description: "Cinematic image" }] },
    fetcher: (async () => { calls++; return completed(raw); }) as typeof fetch,
    onAutoRepair: actions => fixes.push(actions), onRepair: async () => { repairs++; },
  });
  assert.equal(calls, 1, "local geometry repair must not spend on a second model call");
  assert.equal(repairs, 0);
  assert.ok(fixes.flat().some(f => f.startsWith("SCRIM_FULL:1")));
  assert.ok(fixes.flat().some(f => f.startsWith("DECORATION_REMOVED:1")));
  const first = result.scene.slides[0];
  assert.equal(first.objects.find(o => o.type === "image")!.imageTextSide, "full");
  assert.equal(first.objects.filter(o => o.type === "shape").length, 1);
  assert.equal(result.scene.slides.length, atoms.length);
  assert.equal(result.scene.sourceHash, doc.sha256);
});

test("Creative safety fixes translucent background panels only when they contain source text", async () => {
  const doc = parseSource("# Original immutable title"), atoms = creativeAtoms(doc);
  const asset = "00000000-0000-4000-8000-000000000001";
  const raw = composition(atoms) as any;
  raw.slides[0].image = { assetId: asset, x: 0, y: 0, w: 13.333333, h: 7.5, placement: "background", treatment: "dark", textSide: "full" };
  raw.slides[0].shapes = [{ shape: "rect", x: .5, y: 1, w: 11, h: 6, fill: "#111111", fillOpacity: .5 }];
  let calls = 0;
  const result = await createCreativeScene(doc, "Cinematic", {
    key: "fixture", theme: "ivory", features: { assets: [{ id: asset, description: "Test" }] },
    fetcher: (async () => { calls++; return completed(raw); }) as typeof fetch,
  });
  assert.equal(calls, 1);
  assert.equal(result.scene.slides[0].objects.find(o => o.type === "shape")!.fillOpacity, 1);
});
