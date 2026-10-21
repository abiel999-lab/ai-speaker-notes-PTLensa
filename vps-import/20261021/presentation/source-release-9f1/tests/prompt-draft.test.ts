import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPromptDraft, generatePromptDraft, promptDraftInput } from "../core/prompt-draft.js";

const request = {
  topic: "Urban emissions reduction strategies for public policy leaders",
  audience: "Government executives",
  purpose: "overview" as const,
  language: "English" as const,
  sections: 3,
};
const authored = {
  title: "Urban emissions reduction",
  sections: [
    { heading: "Why action matters", bullets: ["Energy choices affect community costs.", "Local decisions influence infrastructure."] },
    { heading: "Practical policy levers", bullets: ["Review procurement requirements.", "Prioritize measurable improvements."] },
    { heading: "Evaluation and follow-through", bullets: ["Track agreed indicators over time.", "Review results with stakeholders."] },
  ],
};

test("Prompt authoring rejects missing key without network access", async () => {
  await assert.rejects(() => generatePromptDraft(request, { model: "test-model" }), /AI_NOT_CONFIGURED/);
});

test("Structured draft uses store:false, remains separate, and creates valid source", async () => {
  let payload: any;
  let url = "";
  const fetcher = async (u: URL | RequestInfo, opts?: RequestInit) => {
    url = String(u);
    payload = JSON.parse(String(opts?.body));
    return new Response(JSON.stringify({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: JSON.stringify(authored) }] }],
      usage: { input_tokens: 98, output_tokens: 144 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const result = await generatePromptDraft(request, { key: "unit-test-only", model: "test-model", fetcher: fetcher as typeof fetch });
  assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(payload.store, false);
  assert.equal(payload.text.format.strict, true);
  assert.equal(result.sections, 3);
  assert.equal(result.source, formatPromptDraft(authored, 3).source);
  assert.ok(result.source.includes("## Why action matters"));
  assert.ok(result.attribution.startsWith("AI-generated"));
  assert.equal(result.usage.inputTokens, 98);
  assert.equal(payload.input.includes(request.topic), true);
});

test("Malformed, extra, or mismatched AI drafts are rejected", () => {
  assert.throws(() => formatPromptDraft({ ...authored, sections: authored.sections.slice(0, 2) }, 3), /AI_DRAFT_INVALID/);
  assert.throws(() => formatPromptDraft({ ...authored, injected: true }, 3));
  assert.equal(promptDraftInput.safeParse({ ...request, sections: 30 }).success, false);
  assert.equal(promptDraftInput.safeParse({ ...request, topic: "a" }).success, false);
});

test("Provider errors are safe and avoid leaking untrusted response bodies", async () => {
  const fetcher = async () => new Response("secret provider error", { status: 500 });
  await assert.rejects(() => generatePromptDraft(request, {
    key: "unit-test-only", model: "test-model", fetcher: fetcher as typeof fetch,
  }), /AI_DRAFT_UNAVAILABLE/);
});
