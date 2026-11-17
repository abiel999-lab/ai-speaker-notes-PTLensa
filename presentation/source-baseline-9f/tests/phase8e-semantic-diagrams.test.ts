import test from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { validateScene } from "../core/fidelity.js";
import { exportPptx } from "../core/export.js";

const threeSteps = "## Implementation pathway\n- Baseline inventory of regional emissions\n- Set targets for each program\n- Monitor progress and publish reports";
const timeline = "## Roadmap steps\n1. Inventory emissions at the start\n2. Prepare the baseline and projections\n3. Plan priority reduction actions\n4. Track, evaluate and publish results";

test("Phase 8E process draws a real three-stage native diagram and keeps every source character", async () => {
  const doc = parseSource(threeSteps, "markdown");
  const plan = rulesPlan(doc, false);
  plan.slides[0].layout = "process";
  plan.slides[0].imageId = null;
  const scene = buildScene(doc, plan, "ivory", { template: "executive" });
  const shapes = scene.slides[0].objects.filter(o => o.type === "shape");
  const lists = scene.slides[0].objects.filter(o => o.type === "text" &&
    doc.blocks.find(b => b.id === o.sourceId)?.kind === "list");
  assert.equal(lists.length, 3);
  assert.ok(lists[0].x < lists[1].x && lists[1].x < lists[2].x);
  assert.ok(shapes.filter(o => o.shape === "line" && o.y > 1.5 && o.y < 6.7).length >= 2, "two native flow connectors");
  assert.equal(validateScene(doc, scene).quality?.status, "verified");
  assert.equal(validateScene(doc, scene).passed, true);
  assert.equal((await exportPptx(doc, scene)).report.passed, true);
});

test("Phase 8E timeline turns source-ordered milestones into an editable vertical flow", async () => {
  const doc = parseSource(timeline, "markdown");
  const plan = rulesPlan(doc, false);
  plan.slides[0].layout = "timeline";
  plan.slides[0].imageId = null;
  const scene = buildScene(doc, plan, "sage", { template: "executive" });
  const lists = scene.slides[0].objects.filter(o => o.type === "text" &&
    doc.blocks.find(b => b.id === o.sourceId)?.kind === "list");
  assert.equal(lists.length, 4);
  assert.ok(lists.every((o,i) => i === 0 || o.y > lists[i-1].y));
  assert.ok(lists.every(o => o.x > 1.8));
  assert.ok(scene.slides[0].objects.some(o => o.shape === "line" && o.x === 1.09));
  assert.equal(validateScene(doc, scene).quality?.status, "verified");
  assert.equal((await exportPptx(doc, scene)).report.passed, true);
});

test("Phase 8E refuses overly long diagram content and manual offset reflow", () => {
  const doc = parseSource("## Pathway\n- " + "A".repeat(220) + "\n- Short step\n- Third step", "markdown");
  const plan = rulesPlan(doc,false);
  plan.slides[0].layout="process";
  const scene = buildScene(doc,plan,"ivory");
  assert.ok(scene.slides[0].objects.some(o => o.type==="text" && o.sourceId));
  assert.equal(validateScene(doc,scene).passed,true);
  const short = parseSource(threeSteps,"markdown");
  const offsetPlan=rulesPlan(short,false);
  offsetPlan.slides[0].layout="process";
  const list = short.blocks.find(b=>b.kind==="list")!;
  offsetPlan.slides[0].offsets = {[list.id]:{dx:0.15,dy:0.10}};
  const manual = buildScene(short,offsetPlan,"ivory");
  const manualList = manual.slides[0].objects.find(o=>o.type==="text" && o.sourceId===list.id)!;
  const native = buildScene(short,{...offsetPlan,slides:[{...offsetPlan.slides[0],offsets:undefined}]},"ivory");
  const nativeList = native.slides[0].objects.find(o=>o.type==="text" && o.sourceId===list.id)!;
  assert.notEqual(manualList.x,nativeList.x);
  assert.equal(validateScene(short,manual).passed,true);
});
