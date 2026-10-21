import test from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "../core/source.js";
import { rulesPlan, validatePlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { validateScene } from "../core/fidelity.js";
import { manualPlanSchema } from "../server/contracts.js";
import { exportPptx } from "../core/export.js";

test("source-anchored positioning moves editable text without changing characters and exports native PPTX", async () => {
  const doc = parseSource("## Title\nOne source paragraph.");
  const base = rulesPlan(doc, false);
  const chosen = doc.blocks[0].id;
  const settings = { template: "minimal" as const };
  const initial = buildScene(doc, base, "ivory", settings);
  const original = initial.slides.flatMap(s => s.objects).find(o => o.sourceId === chosen && o.type === "text")!;
  const updated = {
    ...base,
    slides: base.slides.map((s, i) => i === 0 ? { ...s, offsets: { [chosen]: { dx: 0.05, dy: 0.05 } } } : s),
  };
  assert.equal(validatePlan(doc, updated), true);
  assert.ok(manualPlanSchema.safeParse(updated).success);
  const moved = buildScene(doc, updated, "ivory", settings);
  const changed = moved.slides.flatMap(s => s.objects).find(o => o.sourceId === chosen && o.type === "text")!;
  assert.ok(Math.abs(changed.x - original.x - 0.05) < 1e-8);
  assert.ok(Math.abs(changed.y - original.y - 0.05) < 1e-8);
  assert.equal(changed.text, original.text);
  assert.equal(validateScene(doc, moved).passed, true);
  const { report } = await exportPptx(doc, moved);
  assert.equal(report.passed, true);
  assert.equal(report.exportVerified, true);
});

test("offset schema blocks unknown source IDs, oversized values, and non-finite coordinates", () => {
  const doc = parseSource("A sentence.", "literal");
  const base = rulesPlan(doc, false);
  const invalids = [
    { unknown: { dx: 0.05, dy: 0 } },
    { [doc.blocks[0].id]: { dx: 1.5, dy: 0 } },
    { [doc.blocks[0].id]: { dx: Number.POSITIVE_INFINITY, dy: 0 } },
    { [doc.blocks[0].id]: { dx: 0.1, dy: NaN } },
  ];
  for (const offsets of invalids) {
    const plan = { ...base, slides: [{ ...base.slides[0], offsets }] };
    assert.equal(manualPlanSchema.safeParse(plan).success, false);
    assert.throws(() => validatePlan(doc, plan), /PLAN_SCHEMA/);
  }
});

test("text overflow from positional edits is rejected before an exported deck is committed", () => {
  const doc = parseSource("## Test title");
  const base = rulesPlan(doc, false);
  const offsets = { [doc.blocks[0].id]: { dx: -0.75, dy: 0 } };
  const plan = { ...base, slides: [{ ...base.slides[0], offsets }] };
  assert.ok(manualPlanSchema.safeParse(plan).success);
  assert.throws(() => buildScene(doc, plan, "ivory"), /LAYOUT_BOUNDS/);
});
