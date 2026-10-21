import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import type { Config } from "../server/config.js";
import { manualPlanSchema } from "../server/contracts.js";
import { redisConnection } from "../server/jobs.js";
import { safeErrorCode } from "../server/errors.js";
import { parseSource } from "../core/source.js";
import { buildScene } from "../core/layout.js";
import { rulesPlan } from "../core/planner.js";
import { exportPptx } from "../core/export.js";
import { THEMES } from "../core/palette.js";
import type { TemplateId, ThemeId } from "../core/types.js";
const config = (root: string): Config => ({
  root,
  production: false,
  host: "127.0.0.1",
  port: 4310,
  origin: "http://localhost:4310",
  model: "gpt-6-luna",
  render: false,
  soffice: "soffice",
  pdftoppm: "pdftoppm",
  localAdmin: true,
});
const wait = async (app: any, id: string) => {
  for (let i = 0; i < 160; i++) {
    const job = (
      await app.inject({ method: "GET", url: "/api/generations/" + id })
    ).json().generation;
    if (["ready", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("Job timeout");
};

test("Design previews do not create jobs or call AI; apply produces a verified version", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-api-"));
  const { app } = await createApp(config(root));
  try {
    const source =
      "## Exact title\nOriginal 43,2% — unchanged.\n- One item.\n- Two items.\n- Three items.";
    const settings = {
      theme: "sage",
      mode: "markdown",
      useAI: false,
      images: false,
      template: "minimal",
      fontScale: 1,
      density: "comfortable",
      accent: null,
    };
    const p = (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Design regression", source, mode: "markdown" },
      })
    ).json().project;
    const initial = await app.inject({
      method: "POST",
      url: `/api/projects/${p.id}/generate`,
      payload: { settings },
    });
    assert.equal(initial.statusCode, 202);
    const original = await wait(app, initial.json().generation.id);
    assert.equal(original.status, "ready");
    assert.equal(original.plan.ai.outcome, "disabled");
    const plan = manualPlanSchema.parse({
      engine: "rules",
      slides: original.plan.slides,
    });
    plan.slides[0].layout = "columns";
    const changed = {
      ...settings,
      theme: "graphite",
      template: "studio",
      accent: "#E6B98C",
    };
    for (let i = 0; i < 15; i++) {
      const preview = await app.inject({
        method: "POST",
        url: `/api/generations/${original.id}/design-preview`,
        payload: { plan, settings: changed },
      });
      assert.equal(preview.statusCode, 200, preview.body);
      assert.equal(preview.json().report.passed, true);
      assert.equal(preview.json().report.exportVerified, false);
    }
    let history = (
      await app.inject({ method: "GET", url: "/api/projects/" + p.id })
    ).json().history;
    assert.equal(history.length, 1);
    const bad = structuredClone(plan);
    bad.slides[0].blockIds.pop();
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/generations/${original.id}/design-preview`,
          payload: { plan: bad, settings: changed },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/generations/${original.id}/design-preview`,
          payload: {
            plan,
            settings: { ...changed, accent: "url(https://attacker.example)" },
          },
        })
      ).statusCode,
      400,
    );
    const applied = await app.inject({
      method: "POST",
      url: `/api/generations/${original.id}/design`,
      payload: { plan, settings: { ...changed, useAI: true } },
    });
    assert.equal(applied.statusCode, 202);
    const next = await wait(app, applied.json().generation.id);
    assert.equal(next.status, "ready");
    assert.equal(next.kind, "design");
    assert.equal(next.plan.ai.outcome, "manual");
    assert.equal(next.report.exportVerified, true);
    assert.equal(next.source, source);
    history = (
      await app.inject({ method: "GET", url: "/api/projects/" + p.id })
    ).json().history;
    assert.equal(history.length, 2);
    const copy = (
      await app.inject({
        method: "POST",
        url: "/api/projects/" + p.id + "/duplicate",
      })
    ).json().project;
    assert.equal(copy.source, source);
    assert.equal(copy.latestId, null);
    assert.notEqual(copy.id, p.id);
    assert.equal((await app.inject({ method: "GET", url: "/api/admin/overview" })).statusCode, 404);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/api/generations/" + next.id + "/pdf",
        })
      ).statusCode,
      409,
    );
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Atomic revision checks reject conflicting autosave and outdated design snapshots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-conflict-"));
  const { app } = await createApp(config(root));
  try {
    const p = (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: {
          name: "Version",
          source: "Original content.",
          mode: "literal",
        },
      })
    ).json().project;
    const requests = await Promise.all(
      ["First tab.", "Second tab."].map((source) =>
        app.inject({
          method: "PATCH",
          url: "/api/projects/" + p.id,
          payload: { name: p.name, source, mode: p.mode, expectedRevision: 1 },
        }),
      ),
    );
    assert.deepEqual(requests.map((r) => r.statusCode).sort(), [200, 409]);
    const actual = (
      await app.inject({ method: "GET", url: "/api/projects/" + p.id })
    ).json().project;
    assert.equal(actual.revision, 2);
    const settings = {
      theme: "ivory",
      mode: "literal",
      useAI: false,
      images: false,
    };
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${p.id}/generate`,
      payload: { settings },
    });
    const job = await wait(app, response.json().generation.id);
    await app.inject({
      method: "PATCH",
      url: "/api/projects/" + p.id,
      payload: {
        name: p.name,
        source: "New source version.",
        mode: "literal",
        expectedRevision: 2,
      },
    });
    const design = await app.inject({
      method: "POST",
      url: `/api/generations/${job.id}/design`,
      payload: { settings, plan: { engine: "rules", slides: job.plan.slides } },
    });
    assert.equal(design.statusCode, 409);
    assert.equal(design.json().error, "SOURCE_CHANGED");
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("AI trace distinguishes successful Luna requests from provider fallback without leaking keys", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-ai-"));
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let fail = false;
  globalThis.fetch = (async (_url: any, options: any) => {
    requests++;
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.reasoning.effort, "none");
    assert.equal(body.store, false);
    const format = body.text.format.name;
    assert.ok(
      format === "locked_slide_visual_decisions" || format === "slide_layout_suggestion",
      `Unexpected AI response format: ${format}`,
    );
    if (format === "locked_slide_visual_decisions") {
      assert.match(body.instructions, /Purpose: report\./);
    }
    const input = JSON.parse(body.input);
    if (fail) return new Response("sensitive provider body", { status: 429 });
    // Phase 8B locks source block IDs and slide grouping in server code.
    // Mock Luna's *visual decisions*, never the pre-8B blockIds contract.
    const outputText =
      format === "slide_layout_suggestion"
        ? { layout: "columns", imageId: "none" }
        : {
            slides: [
              {
                index: input.slides[0].index,
                layout: input.slides[0].allowedLayouts[0],
                imageId: "none",
              },
            ],
          };
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify(outputText),
              },
            ],
          },
        ],
        usage: { input_tokens: 321, output_tokens: 123 },
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const { app } = await createApp({
    ...config(root),
    key: "test-secret-not-for-export",
  });
  try {
    const p = (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: {
          name: "AI trace",
          source: "## Title\nOriginal wording.",
          mode: "markdown",
        },
      })
    ).json().project;
    const settings = {
      theme: "cobalt",
      mode: "markdown",
      useAI: true,
      images: false,
      model: "gpt-6-luna",
      intent: "report",
    };
    let r = await app.inject({
      method: "POST",
      url: `/api/projects/${p.id}/generate`,
      payload: { settings },
    });
    let job = await wait(app, r.json().generation.id);
    assert.equal(job.plan.engine, "openai");
    assert.equal(job.plan.ai.outcome, "used");
    assert.equal(job.plan.usage.input, 321);
    const historyBefore = (
      await app.inject({ method: "GET", url: "/api/projects/" + p.id })
    ).json().history.length;
    const suggestion = await app.inject({
      method: "POST",
      url: `/api/generations/${job.id}/slide-suggestion`,
      payload: {
        settings,
        plan: { engine: "rules", slides: job.plan.slides },
        slideId: job.plan.slides[0].id,
      },
    });
    assert.equal(suggestion.statusCode, 200, suggestion.body);
    assert.equal(suggestion.json().suggestion.layout, "columns");
    assert.equal(suggestion.json().suggestion.trace.outcome, "used");
    assert.equal(
      (await app.inject({ method: "GET", url: "/api/projects/" + p.id })).json()
        .history.length,
      historyBefore,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/generations/${job.id}/slide-suggestion`,
          payload: {
            settings,
            plan: { engine: "rules", slides: job.plan.slides },
            slideId: "missing-slide",
          },
        })
      ).statusCode,
      400,
    );
    fail = true;
    r = await app.inject({
      method: "POST",
      url: `/api/projects/${p.id}/generate`,
      payload: { settings },
    });
    job = await wait(app, r.json().generation.id);
    assert.equal(job.status, "ready");
    assert.equal(job.plan.ai.outcome, "fallback");
    assert.equal(job.plan.ai.reason, "OPENAI_HTTP_429");
    assert.equal(requests, 3);
    assert.equal((await app.inject({ method: "GET", url: "/api/admin/overview" })).statusCode, 404);
    assert.ok(!JSON.stringify(job).includes("sensitive provider body"));
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("Every theme and template retains Pemda text at compact and enlarged text scales", async () => {
  const doc = parseSource(await fs.readFile("samples/pemda.txt", "utf8"));
  const plan = rulesPlan(doc, false);
  for (const theme of Object.keys(THEMES) as ThemeId[])
    for (const template of [
      "editorial",
      "minimal",
      "studio",
      "executive",
    ] as TemplateId[]) {
      const scene = buildScene(doc, plan, theme, {
        template,
        density: "compact",
        fontScale: template === "studio" ? 1.15 : 0.85,
        accent: "#426957",
      });
      const result = await exportPptx(doc, scene);
      assert.equal(result.report.passed, true, theme + " / " + template);
      assert.equal(result.report.blocks, 95);
    }
});

test("Local operations guard and diagnostics do not expose arbitrary exception messages", () => {
  const cfg = config("/tmp/unused");
  assert.equal(cfg.production, false);
  assert.equal(
    safeErrorCode(new Error("secret-key and source text")),
    "GENERATION_FAILED",
  );
  assert.equal(
    redisConnection("redis://localhost:6379").maxRetriesPerRequest,
    2,
  );
});

test("Production and non-local hosts cannot access local operational telemetry", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-admin-"));
  let instance = await createApp(config(root));
  try {
    assert.equal(
      (
        await instance.app.inject({
          method: "GET",
          url: "/api/admin/overview",
          headers: { host: "public.example" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await instance.app.inject({ method: "GET", url: "/api/admin/overview" })).statusCode,
      404,
    );
    await assert.rejects(
      createApp({ ...config(root), production: true }),
      /authentication and tenant isolation/,
    );
  } finally {
    await instance.app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("BullMQ can load the installed production ioredis driver without a server (INFO stubbed)", async () => {
  const { default: Redis } = await import("ioredis");
  const { RedisConnection } = await import("bullmq");
  const previous = Redis.prototype.info;
  Redis.prototype.info = (async () =>
    "redis_version:7.4.11\r\nmaxmemory_policy:noeviction\r\n") as typeof Redis.prototype.info;
  const connection = new RedisConnection(
    { lazyConnect: true, maxRetriesPerRequest: null },
    { skipWaitingForReady: true },
  );
  try {
    const client = await connection.client;
    assert.equal(typeof client.defineCommand, "function");
    assert.equal(connection.status, "ready");
  } finally {
    await connection.close(true);
    Redis.prototype.info = previous;
  }
});

test("Local workspace rejects non-local Host reads and a public origin at startup", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-host-"));
  const { app } = await createApp(config(root));
  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { host: "rebinding.example:4310" },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "HOST_REJECTED");
    const alias = await app.inject({
      method: "POST",
      url: "/api/analyze",
      headers: { host: "127.0.0.1:4310", origin: "http://127.0.0.1:4310" },
      payload: { source: "Exact source.", mode: "literal" },
    });
    assert.equal(alias.statusCode, 200);
    await assert.rejects(
      () => createApp({ ...config(root), origin: "https://public.example" }),
      /loopback APP_ORIGIN/,
    );
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
