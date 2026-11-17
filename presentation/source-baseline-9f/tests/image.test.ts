import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { config } from "../server/config.js";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
test("Image upload accepts decoded JPEG, rejects SVG, and prevents cross-project asset injection", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-image-"));
  const { app } = await createApp({
    ...config(),
    root,
    production: false,
    render: false,
    database: undefined,
    redis: undefined,
  });
  try {
    const request = (method: any, url: string, payload?: any) =>
      app.inject({ method, url, payload });
    const p = (
      await request("POST", "/api/projects", {
        name: "Image source",
        source: "## Heading\nExact content.",
        mode: "markdown",
      })
    ).json().project;
    const image = await fs.readFile("public/assets/city.jpg");
    const good = await request("POST", `/api/projects/${p.id}/image`, {
      base64: image.toString("base64"),
    });
    assert.equal(good.statusCode, 200);
    assert.ok(good.json().assetId);
    const document = parseSource("## Heading\nExact content.");
    const plan = rulesPlan(document, false);
    plan.engine = "rules";
    plan.slides[0] = {
      ...plan.slides[0],
      layout: "photo",
      imageId: good.json().assetId,
    };
    const perSlide = await request("POST", `/api/projects/${p.id}/generate`, {
      settings: {
        theme: "ivory",
        mode: "markdown",
        useAI: false,
        images: true,
      },
      plan,
    });
    assert.equal(perSlide.statusCode, 202, perSlide.body);
    let imageJob: any;
    for (let attempt = 0; attempt < 100; attempt++) {
      imageJob = (
        await request(
          "GET",
          `/api/generations/${perSlide.json().generation.id}`,
        )
      ).json().generation;
      if (["ready", "failed"].includes(imageJob.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(imageJob.status, "ready", imageJob.error);
    assert.equal(
      imageJob.scene.slides[0].objects.find(
        (item: any) => item.type === "image",
      ).asset,
      good.json().assetId,
    );
    assert.equal(imageJob.report.quality.status, "verified");
    assert.equal(
      (
        await request(
          "GET",
          `/api/generations/${perSlide.json().generation.id}/export`,
        )
      ).statusCode,
      200,
    );
    const bad = await request("POST", `/api/projects/${p.id}/image`, {
      base64: Buffer.from('<svg onload="alert(1)"></svg>').toString("base64"),
    });
    assert.equal(bad.statusCode, 400);
    const other = (
      await request("POST", "/api/projects", {
        name: "Other source",
        source: "text",
        mode: "literal",
      })
    ).json().project;
    const inject = await request("POST", `/api/projects/${other.id}/generate`, {
      settings: {
        theme: "ivory",
        mode: "literal",
        useAI: false,
        images: true,
        assetId: good.json().assetId,
      },
    });
    assert.equal(inject.statusCode, 400);
    const foreignPlan = rulesPlan(parseSource("text", "literal"), false);
    foreignPlan.slides[0] = {
      ...foreignPlan.slides[0],
      layout: "photo",
      imageId: good.json().assetId,
    };
    const foreignSlide = await request(
      "POST",
      `/api/projects/${other.id}/generate`,
      {
        settings: {
          theme: "ivory",
          mode: "literal",
          useAI: false,
          images: true,
        },
        plan: foreignPlan,
      },
    );
    assert.equal(foreignSlide.statusCode, 400);
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
