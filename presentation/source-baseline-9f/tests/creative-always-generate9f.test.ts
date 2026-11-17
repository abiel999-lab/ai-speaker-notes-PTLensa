import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseSource } from "../core/source.js";
import { createCreativeScene, creativeAtoms } from "../core/creative.js";
import { buildCreativeRescueScene } from "../core/creative-fallback.js";
import { validateScene, verifyPptx } from "../core/fidelity.js";
import { exportPptx } from "../core/export.js";

const source = fs.readFileSync("samples/ecosort-qa.md", "utf8");
const doc = parseSource(source);
const ids = Array.from({ length: 6 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const features = { slideCount: 10, interactiveLinks: true, assets: ids.map((id, i) => ({ id, description: `Robotics image ${i + 1}` })) };
const fixture = (x: unknown) => Response.json({ status: "completed", usage: { input_tokens: 1200, output_tokens: 300 },
  output: [{ content: [{ type: "output_text", text: JSON.stringify(x) }] }] });

test("9F EcoSort deterministic rescue preserves 10 slides, full source, 6 images, links and native PPTX", async () => {
  const { scene } = buildCreativeRescueScene(doc, creativeAtoms(doc), "midnight", { ...features, motion: true });
  assert.equal(scene.slides.length, 10);
  const quality = validateScene(doc, scene);
  assert.equal(quality.passed, true);
  assert.equal(quality.changed.length, 0);
  assert.equal(quality.quality?.overlaps, 0);
  assert.equal(new Set(scene.slides.flatMap(slide => slide.objects.filter(obj => obj.type === "image").map(obj => obj.asset))).size, 6);
  assert.equal(scene.menuSlide, 2);
  assert.ok(scene.slides.flatMap(s => s.objects).filter(o => !!o.targetSlide).length >= 10);
  const imagePaths = Object.fromEntries(ids.map(id => [id, path.resolve("public/assets/city.jpg")]));
  const { bytes, report } = await exportPptx(doc, scene, imagePaths, "keynote");
  assert.equal(report.passed, true);
  assert.equal((await verifyPptx(doc, bytes)).passed, true);
});

test("9F invalid Luna scene locally produces a deck in one paid request", async () => {
  let calls = 0; let paidRepairs = 0;
  const result = await createCreativeScene(doc, "robotics", { key: "fake", theme: "midnight", motion: "keynote", features,
    fetcher: (async () => { calls++; return fixture({ slides: [] }); }) as typeof fetch,
    onRepair: async () => { paidRepairs++; },
  });
  assert.equal(calls, 1);
  assert.equal(paidRepairs, 0);
  assert.equal(result.plan.ai?.outcome, "fallback");
  assert.equal(result.plan.usage?.input, 1200);
  assert.equal(result.scene.slides.length, 10);
  assert.equal(validateScene(doc, result.scene).passed, true);
});

test("9F provider outage creates a local source-safe deck without repeated API calls", async () => {
  let calls = 0;
  const result = await createCreativeScene(doc, "robotics", { key: "fake", theme: "midnight", features,
    fetcher: (async () => { calls++; return new Response(null, { status: 503 }); }) as typeof fetch,
  });
  assert.equal(calls, 1);
  assert.equal(result.plan.ai?.outcome, "fallback");
  assert.equal(validateScene(doc, result.scene).passed, true);
});
