import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { validateScene } from "../core/fidelity.js";
import { exportPptx } from "../core/export.js";

const two = "## Regional priorities\n- Public transport electrification across local routes\n- Renewable energy programs in public buildings";
const three = "## Core pillars\n- Inventory emissions by sector\n- Set verified reduction targets\n- Monitor implementation and report progress";

test("Phase 8F uses native two-column panels for complete editorial lists without rewriting source", async () => {
  const doc = parseSource(two,"markdown");
  const plan = rulesPlan(doc,false);
  plan.slides[0].layout="editorial";
  const scene = buildScene(doc,plan,"ivory",{template:"executive"});
  const lists = scene.slides[0].objects.filter(o=>o.type==="text" && doc.blocks.find(b=>b.id===o.sourceId)?.kind==="list");
  assert.equal(lists.length,2);
  assert.ok(lists[0].x < 1.5 && lists[1].x > 6.5);
  assert.ok(scene.slides[0].objects.filter(o=>o.type==="shape" && o.shape==="rect" && o.w>5 && o.w<6.4).length>=2);
  assert.equal(validateScene(doc,scene).passed,true);
  assert.equal(validateScene(doc,scene).quality?.status,"verified");
  assert.equal((await exportPptx(doc,scene)).report.passed,true);
});

test("Phase 8F places three concise list blocks in source order across three native panels", () => {
  const doc=parseSource(three,"markdown");const plan=rulesPlan(doc,false);
  plan.slides[0].layout="editorial";
  const scene=buildScene(doc,plan,"sage",{template:"executive"});
  const lists=scene.slides[0].objects.filter(o=>o.type==="text" && doc.blocks.find(b=>b.id===o.sourceId)?.kind==="list");
  assert.equal(lists.length,3);
  assert.ok(lists[0].x<lists[1].x && lists[1].x<lists[2].x);
  assert.equal(lists.map(o=>o.text).join("|"),doc.blocks.filter(b=>b.kind==="list").map(b=>b.text).join("|"));
  assert.equal(validateScene(doc,scene).passed,true);
});

test("Phase 8F refuses dense lists and any manual block repositioning", () => {
  const doc=parseSource("## Goals\n- "+"A".repeat(205)+"\n- Shorter but unchanged", "markdown");
  const plan=rulesPlan(doc,false);plan.slides[0].layout="editorial";
  const fallback=buildScene(doc,plan,"ivory");
  const a=fallback.slides[0].objects.find(o=>o.sourceId===doc.blocks[1].id)!;
  assert.ok(a.w>10,"dense blocks must retain the safe wide column");
  assert.equal(validateScene(doc,fallback).passed,true);
  const short=parseSource(two,"markdown");const offsetPlan=rulesPlan(short,false);
  offsetPlan.slides[0].layout="editorial";
  offsetPlan.slides[0].offsets={[short.blocks[1].id]:{dx:0.2,dy:0.1}};
  const shifted=buildScene(short,offsetPlan,"sage");
  const moved=shifted.slides[0].objects.find(o=>o.sourceId===short.blocks[1].id)!;
  assert.ok(moved.w>10,"manual block offsets must never be overridden by auto panels");
  assert.equal(validateScene(short,shifted).passed,true);
});

test("Phase 8F makes full-width source-exact bibliography rows instead of narrow URL columns", async () => {
  const raw="[1](https://example.org/very-long-regional-emission-roadmap-data-and-policy-report?download=1)\n"+
    "[2](https://example.org/another-provincial-emissions-governance-report?format=pdf)\n"+
    "[3](https://example.org/clean-energy-regulation-and-implementation-2026.pdf)";
  const doc=parseSource(raw,"markdown"),plan=rulesPlan(doc,false);
  plan.slides[0].layout="columns";
  const scene=buildScene(doc,plan,"ivory",{template:"executive"});
  const refs=scene.slides[0].objects.filter(o=>o.type==="text");
  assert.equal(refs.length,3);
  assert.ok(refs.every(o=>o.w>=10.9 && o.x>=1.0));
  assert.ok(refs.every((o,i)=>i===0||o.y>refs[i-1].y));
  assert.equal(validateScene(doc,scene).quality?.status,"verified");
  assert.equal((await exportPptx(doc,scene)).report.passed,true);
});

test("Phase 8F retains the entire Pemda example across all six themes", () => {
  const raw=fs.readFileSync("samples/pemda.txt","utf8"),doc=parseSource(raw,"markdown"),plan=rulesPlan(doc,false);
  for(const theme of ["midnight","ivory","sage","cobalt","solar","graphite"] as const) {
    const scene=buildScene(doc,plan,theme,{template:"executive"});
    const report=validateScene(doc,scene);
    assert.equal(scene.slides.length,27,`expected scene count for ${theme}`);
    assert.equal(report.passed,true,`source and geometry: ${theme}`);
    assert.equal(report.quality?.status,"verified",`typography and overlap: ${theme}`);
    const refs=scene.slides.at(-1)!.objects.filter(o=>o.type==="text");
    assert.ok(refs.every(o=>o.w>10),`references should use full width: ${theme}`);
  }
});
