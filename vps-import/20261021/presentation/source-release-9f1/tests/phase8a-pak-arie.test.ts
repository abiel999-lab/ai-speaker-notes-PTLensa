import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { validateScene, verifyPptx } from "../core/fidelity.js";
import { exportPptx } from "../core/export.js";
import { RELEASE } from "../core/release.js";

const raw = fs.readFileSync("samples/pemda.txt", "utf8");
test("Pak Arie source survives visually enriched executive deck and native PPTX", async () => {
  const doc = parseSource(raw, "markdown");
  const scene = buildScene(doc, rulesPlan(doc, false), "ivory", {
    template: "executive", density: "comfortable", fontScale: 1,
  });
  const report = validateScene(doc, scene);
  assert.equal(report.passed, true);
  assert.equal(report.quality?.overlaps, 0);
  assert.equal(report.quality?.overflow, 0);
  assert.equal(scene.version, "layout-v6-universal");
  assert.ok(scene.slides.every(s => s.objects.some(o => o.type === "shape" && o.y === 7.43)));
  const result = await exportPptx(doc, scene);
  assert.equal(result.report.passed, true);
  assert.equal((await verifyPptx(doc, result.bytes)).passed, true);
  assert.ok(result.bytes.length > 20000);
});
test("visual grammar does not change any text across palette variants", () => {
  const doc = parseSource(raw, "markdown");
  const plan = rulesPlan(doc, false);
  for (const theme of ["midnight", "ivory", "solar", "cobalt", "sage", "graphite"] as const) {
    const scene = buildScene(doc, plan, theme, { template: "studio" });
    const report = validateScene(doc, scene);
    assert.equal(report.passed, true, theme);
    assert.equal(report.quality?.overlaps, 0, theme);
  }
});
test("live QA is opt-in, fails closed on fallback, and never prints key", () => {
  const live = fs.readFileSync("scripts/qa-pak-arie-live.mjs", "utf8");
  const docker = fs.readFileSync("Dockerfile", "utf8");
  assert.match(live, /QA_CONFIRM_PAID_AI !== "YES"/);
  assert.match(live, /trace\.outcome !== "used"/);
  assert.match(live, /AI_NOT_USED/);
  assert.match(live, /LOCAL_APP_REQUIRED/);
  assert.doesNotMatch(live, /OPENAI_API_KEY\s*=\s*[\"']/);
  assert.match(docker, /COPY --from=build \/app\/scripts\/qa-pak-arie-live\.mjs/);
  assert.ok(RELEASE.history.some(entry => entry.phase === "Phase 8G"));
});
