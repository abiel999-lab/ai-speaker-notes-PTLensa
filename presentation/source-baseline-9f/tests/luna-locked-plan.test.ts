import test from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "../core/source.js";
import { aiPlan } from "../core/ai.js";
import { rulesPlan, validatePlan, safeLayoutChoices } from "../core/planner.js";
import { config } from "../server/config.js";

const source = ["# Decarbonization Pemda", ...Array.from({length: 22}, (_,i) => `## Section ${i+1}\n- Emissions ${i}\n- Energy ${i}\n- Planning ${i}`)].join("\n");
const doc = parseSource(source, "markdown");
const original = rulesPlan(doc, false);
function fake(answer: unknown) {
  let request: any;
  const fetcher = async (_url: unknown, options: any) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({status:"completed", usage:{input_tokens:55,output_tokens:24},output:[{content:[{type:"output_text",text:JSON.stringify(answer)}]}]}),{status:200});
  };
  return { fetcher: fetcher as typeof fetch, request: () => request };
}
test("Luna never receives control over text IDs, slide grouping, or another model", async () => {
  const choices = safeLayoutChoices(doc, original.slides[0], false);
  const result = fake({slides:[{index:0,layout:choices[0],imageId:"none"}]});
  const plan = await aiPlan(doc,{key:"fake-key",model:"gpt-4.1-mini",images:false,fetcher:result.fetcher});
  const body = result.request();
  assert.equal(body.model,"gpt-6-luna");
  assert.equal(body.store,false);
  assert.equal(body.text.format.strict,true);
  assert.equal(body.input.includes("blockIds"),false);
  assert.equal(plan.engine,"openai");
  assert.deepEqual(plan.slides.flatMap(slide=>slide.blockIds),doc.blocks.map(block=>block.id));
  assert.deepEqual(plan.slides.map(slide=>slide.blockIds),original.slides.map(slide=>slide.blockIds));
  validatePlan(doc,plan);
});
test("AI may choose a partial set of layouts without losing a single source block", async () => {
  const suggestion = original.slides[0].layout === "editorial" ? "statement" : "editorial";
  const result = fake({slides:[{index:0,layout:suggestion,imageId:"none"}]});
  const plan = await aiPlan(doc,{key:"fake-key",images:false,fetcher:result.fetcher});
  assert.equal(plan.slides.length,original.slides.length);
  assert.deepEqual(plan.slides.flatMap(slide=>slide.blockIds),original.slides.flatMap(slide=>slide.blockIds));
  assert.equal(plan.usage?.model,"gpt-6-luna");
});
test("invalid, duplicated or invented AI choices fail closed", async () => {
  for (const answer of [
    {slides:[{index:999,layout:"editorial",imageId:"none"}]},
    {slides:[{index:0,layout:"editorial",imageId:"none"},{index:0,layout:"editorial",imageId:"none"}]},
    {slides:[{index:0,layout:"table",imageId:"none"}]},
  ]) {
    const {fetcher}=fake(answer);
    await assert.rejects(aiPlan(doc,{key:"fake-key",images:false,fetcher}), /OPENAI_INVALID_PLAN/);
  }
});
test("server disregards legacy OPENAI_MODEL and pins Luna", () => {
  const prior=process.env.OPENAI_MODEL;
  try {process.env.OPENAI_MODEL="gpt-4.1-mini"; assert.equal(config().model,"gpt-6-luna");}
  finally {if(prior===undefined) delete process.env.OPENAI_MODEL;else process.env.OPENAI_MODEL=prior;}
});
