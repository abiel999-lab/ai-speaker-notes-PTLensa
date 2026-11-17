import test from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { validateScene, verifyPptx } from "../core/fidelity.js";
import { exportPptx } from "../core/export.js";

/** Small, unrelated genre fixtures. Source fidelity must not be a Pemda-only special case. */
const SCENARIOS = [
  { name: "business pitch", text: "# Small Business Pitch\n## Problem\n- Customers wait 30 minutes for orders\n- Manual inventory is slow\n## Solution\n- Track stock in real time\n- Improve order status visibility" },
  { name: "education", text: "# Earth's Changing Surface\n## What Can Change?\n- Rain moves soil downhill\n- Rivers carry sediment\n- Wind shapes sand dunes\n## Activity\n- Compare two photos\n- Describe the changes" },
  { name: "product proposal", text: "# Customer Support Proposal\n## Objectives\n- One shared inbox for support agents\n- Route requests to specialist teams\n## Rollout\n1. Start with WhatsApp\n2. Train the first team\n3. Measure response times" },
  { name: "finance KPI table", text: "# Quarterly Business Summary\n\n| KPI | Q1 | Q2 |\n| --- | --- | --- |\n| Revenue | 120 | 145 |\n| Costs | 85 | 92 |\n| Profit | 35 | 53 |\n\n## Observations\n- Units are illustrative, not predictions" },
  { name: "technical workshop", text: "# Secure Deployment Workshop\n## Steps\n1. Create a separate environment\n2. Run automated checks\n3. Deploy with a rollback path\n## Safety\n- Do not print credentials in logs\n- Confirm health after deployment" },
  { name: "multilingual notes", text: "# Laporan Energi Daerah\n## Rencana Tahun 2030\n- Emisi: 42% dari baseline\n- Energi terbarukan ≥ 30%\n## Ringkasan / Summary\n- Data perlu diverifikasi\n- Zahlen und Maße bleiben erhalten" },
  { name: "citations", text: "# Research References\n[1](https://example.org/reports/large-policy-study-2026.pdf)\n[2](https://example.org/technical/guideline-on-data-quality-and-compliance)\n[3](https://example.org/publications/overview-of-urban-mobility)" },
  { name: "unstructured plain text", text: "Meeting Notes\nThe team needs a cleaner sales handoff.\nAction: review conversion rate trends this week.\nQuestions: who owns the follow-up, and when is the deadline?" },
] as const;

for (const item of SCENARIOS) {
  test(`multi-genre ${item.name}: immutable source and readable native slide objects`, () => {
    const doc = parseSource(item.text, "markdown");
    const plan = rulesPlan(doc, false);
    const scene = buildScene(doc, plan, "ivory", { template: "executive" });
    const report = validateScene(doc, scene);
    assert.equal(report.passed, true, item.name);
    assert.equal(report.orderValid, true, item.name);
    assert.deepEqual(report.missing, [], item.name);
    assert.deepEqual(report.changed, [], item.name);
    assert.deepEqual(report.extra, [], item.name);
    assert.equal(report.quality?.status, "verified", item.name);
    assert.ok(scene.slides.length > 0 && scene.slides.length <= 80);
    assert.ok(scene.slides.every(slide => slide.objects.some(object => object.sourceId)));
  });
}

test("a dense mixed-content statement slide never enlarges bullets into a hero", () => {
  const doc = parseSource("## Workshop exercises\n- Review 30 customer support requests\n- Categorize the recurring questions\n- Discuss what changed this week", "markdown");
  const plan = rulesPlan(doc, false);
  plan.slides[0].layout = "statement";  // permitted legacy or model-selected slide
  const scene = buildScene(doc, plan, "sage", { template: "executive" });
  const content = scene.slides.flatMap(s => s.objects).filter(o => o.type === "text" && o.sourceId && o.sourceId !== doc.blocks[0].id);
  assert.ok(content.length >= 3);
  assert.ok(content.every(o => (o.fontSize || 0) <= 21.1), "mixed-source bullets must not become 28pt heroes");
  assert.equal(validateScene(doc, scene).quality?.status, "verified");
  // The graphic must not masquerade as a 4-bar data chart with differing bar heights.
  const rightPanelBars = scene.slides.flatMap(s => s.objects).filter(o => o.type === "shape" && o.shape === "rect" && o.x > 11.5 && (o.h || 0) > 0.35);
  assert.equal(rightPanelBars.length, 0);
});

test("single concise source paragraph retains statement emphasis", () => {
  const doc = parseSource("A strong presentation makes decisions easier for its audience.", "markdown");
  const plan = rulesPlan(doc, false);
  plan.slides[0].layout = "statement";
  const scene = buildScene(doc, plan, "midnight");
  const text = scene.slides[0].objects.find(o => o.sourceId === doc.blocks[0].id)!;
  assert.ok((text.fontSize || 0) >= 27);
  assert.equal(validateScene(doc, scene).passed, true);
});

test("editable PPTX preserves exact multilingual input and native table values", async () => {
  const doc = parseSource(SCENARIOS[3].text + "\n" + SCENARIOS[5].text, "markdown");
  const scene = buildScene(doc, rulesPlan(doc, false), "cobalt", { template: "minimal" });
  const output = await exportPptx(doc, scene);
  assert.equal(output.report.passed, true);
  const exported = await verifyPptx(doc, output.bytes);
  assert.equal(exported.passed, true);
  assert.ok(output.bytes.length > 10000);
});
