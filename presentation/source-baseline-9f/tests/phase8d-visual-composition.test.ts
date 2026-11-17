import test from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { validateScene } from "../core/fidelity.js";
import { exportPptx } from "../core/export.js";

test("Phase 8D turns suitable unchanged source lists into editable two-column cards", async () => {
  const doc = parseSource("## Core pillars\n- Renewable energy transitions across the city.\n- Energy efficiency programs in public buildings.\n- Lower emissions in public transport fleets.\n- Community monitoring and public accountability.", "markdown");
  const plan = rulesPlan(doc, false);
  assert.ok(["process", "cards"].includes(plan.slides[0].layout), "heading plus 4 items is not a cover-only slide");
  const scene = buildScene(doc, plan, "ivory", {template:"executive"});
  const bullets = scene.slides[0].objects.filter(o => o.type === "text" &&
    doc.blocks.find(b => b.id === o.sourceId)?.kind === "list");
  assert.equal(bullets.length, 4);
  assert.ok(bullets.some(o => o.x > 6.5), "real two-column composition");
  assert.ok(scene.slides[0].objects.some(o => o.type === "shape" && o.w > 5 && o.w < 6));
  assert.equal(validateScene(doc, scene).passed, true);
  assert.equal((await exportPptx(doc,scene)).report.passed, true);
});

test("Phase 8D makes an opening composition without adding a heading", async () => {
  const doc = parseSource("This introductory paragraph is deliberately substantial and must remain letter-for-letter identical. It describes the project background, priorities and motivation in a single uninterrupted source paragraph without an invented heading.");
  const scene = buildScene(doc, rulesPlan(doc,false), "ivory", {template:"executive"});
  assert.ok(scene.slides[0].objects.some(o => o.type === "shape" && o.x === 9.03));
  assert.equal(validateScene(doc,scene).passed,true);
  assert.equal((await exportPptx(doc,scene)).report.passed,true);
});

test("Phase 8D section design preserves literal Markdown separator and heading", async () => {
  const doc = parseSource("*\n## Discussion\n", "markdown");
  const scene = buildScene(doc,rulesPlan(doc,false),"ivory",{template:"executive"});
  const marker = scene.slides.flatMap(s=>s.objects).find(o=>o.type==="text" && o.text?.trim()==="*");
  assert.ok(marker);
  assert.ok(scene.slides.some(s=>s.background==="#17243A"));
  const sectionQuality = validateScene(doc,scene);
  assert.equal(sectionQuality.passed,true);
  assert.equal(sectionQuality.quality?.status, "verified", "source separator must remain readable");
});

test("Phase 8D card grid does not override manual source offsets", () => {
  const doc = parseSource("## Three pathways\n- First policy and implementation route\n- Second policy and implementation route\n- Third policy and implementation route", "markdown");
  const plan = rulesPlan(doc,false);
  const first=plan.slides[0].blockIds.find(id=>doc.blocks.find(b=>b.id===id)?.kind==="list")!;
  const natural=buildScene(doc,rulesPlan(doc,false),"ivory");
  plan.slides[0].offsets={[first]:{dx:0.15,dy:0.1}};
  const adjusted=buildScene(doc,plan,"ivory");
  const native=natural.slides.flatMap(s=>s.objects).find(o=>o.sourceId===first && o.type==="text")!;
  const modified=adjusted.slides.flatMap(s=>s.objects).find(o=>o.sourceId===first && o.type==="text")!;
  assert.notEqual(native.x,modified.x);
  assert.equal(validateScene(doc,adjusted).passed,true);
});

test("Phase 8D retains meaningful cover-only headings and never makes Markdown marker sub-14pt", () => {
  const headingOnly = parseSource("## Net Zero Pathways", "markdown");
  assert.equal(rulesPlan(headingOnly, false).slides[0].layout, "cover");
  const markerDoc = parseSource("*\n## Monitoring and evaluation", "markdown");
  for (const fontScale of [0.8, 1, 1.25]) {
    const scene = buildScene(markerDoc, rulesPlan(markerDoc, false), "ivory", { fontScale });
    const marker = scene.slides.flatMap(s => s.objects).find(o => o.type === "text" && o.text === "*");
    assert.ok(marker);
    assert.ok(marker.fontSize! >= 14, "source-bearing separator must pass minimum font quality gate");
    assert.equal(validateScene(markerDoc, scene).quality?.status, "verified");
  }
});
