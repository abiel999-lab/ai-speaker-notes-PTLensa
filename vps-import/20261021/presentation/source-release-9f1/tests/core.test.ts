import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseSource, decodeSource, hash } from "../core/source.js";
import { rulesPlan, validatePlan } from "../core/planner.js";
import { buildScene, wrapText } from "../core/layout.js";
import { validateScene, verifyPptx } from "../core/fidelity.js";
import { exportPptx } from "../core/export.js";
import { aiPlan } from "../core/ai.js";
import JSZip from "jszip";
test("Lossless ledger covers CRLF, unknown syntax, lone stars, URLs and BOM", () => {
  const raw =
    "\uFEFFHello,  WORLD!\r\n\r\n## Heading\r\n*\r\n[1](https://example.com/a)\r\n";
  const doc = parseSource(raw);
  assert.equal(doc.ledger.map((s) => raw.slice(s.start, s.end)).join(""), raw);
  assert.ok(doc.blocks.some((b) => b.text === "*"));
  assert.ok(doc.blocks.some((b) => b.text.includes("https://example.com/a")));
  assert.equal(decodeSource(Buffer.from(raw)), raw);
});
test("UTF-8 rejects corrupt/binary input and empty/oversize input", () => {
  assert.throws(() => decodeSource(Uint8Array.from([0xc3, 0x28])));
  assert.throws(() => parseSource("\0abc"));
  assert.throws(() => parseSource(" "));
  assert.throws(() => parseSource("x".repeat(2 * 1024 * 1024 + 1)));
});
test("Wrap preserves source characters including spaces and long URLs", () => {
  for (const s of [
    "one  two three   ",
    "https://example.com/" + "a".repeat(600),
    "Perubahan iklim—aksi daerah.",
  ])
    assert.equal(wrapText(s, 2, 21).join(""), s);
});
test("Plan rejects omissions, duplicates and reordered blocks", () => {
  const doc = parseSource("## Title\nOne\nTwo");
  const p = rulesPlan(doc);
  validatePlan(doc, p);
  const bad = structuredClone(p);
  bad.slides[0].blockIds.reverse();
  assert.throws(() => validatePlan(doc, bad));
});
test("Section separators stay verbatim without creating empty-looking slides", () => {
  const doc = parseSource("Intro\n*\n## Section\nExact body.\n*\n## Next");
  const plan = rulesPlan(doc, false);
  validatePlan(doc, plan);
  assert.equal(
    plan.slides.some(
      (slide) =>
        slide.blockIds.length === 1 &&
        doc.blocks.find((block) => block.id === slide.blockIds[0])?.text ===
          "*",
    ),
    false,
  );
  assert.deepEqual(
    plan.slides.flatMap((slide) => slide.blockIds),
    doc.blocks.map((block) => block.id),
  );
});
test("Scene detects missing, changed, added and duplicate wording", () => {
  const doc = parseSource("## Title\nExact, ORIGINAL text.");
  const scene = buildScene(doc, rulesPlan(doc), "ivory");
  assert.ok(validateScene(doc, scene).passed);
  for (const mutation of ["change", "delete", "extra", "duplicate"]) {
    const s = structuredClone(scene);
    const idx = s.slides[0].objects.findIndex((o) => o.type === "text");
    const o = s.slides[0].objects[idx];
    if (mutation === "change") o.text += " altered";
    if (mutation === "delete") s.slides[0].objects.splice(idx, 1);
    if (mutation === "extra")
      s.slides[0].objects.push({ ...o, sourceId: "invented" });
    if (mutation === "duplicate") s.slides[0].objects.push({ ...o });
    assert.equal(validateScene(doc, s).passed, false, mutation);
  }
});
test("Quality engine blocks overlapping source objects and reports readable text", () => {
  const doc = parseSource(
    "## Title\nFirst exact paragraph.\nSecond exact paragraph.",
  );
  const scene = buildScene(doc, rulesPlan(doc, false), "ivory");
  const clean = validateScene(doc, scene);
  assert.equal(clean.quality?.status, "verified");
  assert.equal(clean.quality?.overflow, 0);
  assert.ok((clean.quality?.minimumFontSize || 0) >= 14);
  const sourceObjects = scene.slides[0].objects.filter(
    (object) => object.type === "text",
  );
  sourceObjects[1].x = sourceObjects[0].x;
  sourceObjects[1].y = sourceObjects[0].y;
  const blocked = validateScene(doc, scene);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.quality?.status, "blocked");
  assert.ok((blocked.quality?.overlaps || 0) > 0);
});
test("All Pemda source blocks survive all themes and the actual PPTX export", async () => {
  const raw = await fs.readFile("samples/pemda.txt", "utf8");
  assert.equal(
    hash(raw),
    "fc64fa461955226fe66d59eb9bac651e79c2749ef47138f25f4cf40ec27d23f1",
  );
  const doc = parseSource(raw);
  for (const theme of ["midnight", "ivory", "solar"] as const) {
    const scene = buildScene(doc, rulesPlan(doc, true), theme);
    assert.ok(validateScene(doc, scene).passed);
    const { bytes, report } = await exportPptx(doc, scene);
    assert.ok(report.passed);
    assert.ok(report.exportVerified);
    const zip = await JSZip.loadAsync(bytes);
    assert.ok(zip.file("ppt/slides/slide1.xml"));
  }
});
test("Literal import and Unicode keep punctuation, case and Markdown visible", async () => {
  const doc = parseSource(
    "## 原文\n**Bonjour** — CO₂, 43,2%.\n- unchanged!",
    "literal",
  );
  const scene = buildScene(doc, rulesPlan(doc, false), "ivory");
  const { report } = await exportPptx(doc, scene);
  assert.ok(report.passed);
});
test("Native Markdown table survives export without invented headers", async () => {
  const doc = parseSource(
    "## Results\n| Name | Value |\n| --- | --- |\n| Solar | 43,2% |\n| Original | unchanged. |",
  );
  const scene = buildScene(doc, rulesPlan(doc, false), "ivory");
  assert.ok(validateScene(doc, scene).passed);
  const { bytes, report } = await exportPptx(doc, scene);
  assert.ok(report.passed);
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(n),
  );
  assert.ok(
    (await Promise.all(names.map((n) => zip.file(n)!.async("string")))).some(
      (s) => s.includes("<a:tbl>"),
    ),
  );
});
test("Export mutation is detected independently of source hash", async () => {
  const doc = parseSource("Exact original.");
  const { bytes } = await exportPptx(
    doc,
    buildScene(doc, rulesPlan(doc, false), "ivory"),
  );
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  zip.file(
    "ppt/slides/slide1.xml",
    xml.replace("Exact original.", "Changed original."),
  );
  const changed = await zip.generateAsync({ type: "nodebuffer" });
  assert.equal((await verifyPptx(doc, changed)).passed, false);
});
test("OpenAI adapter locks source groups, schema and store:false; invalid choices cannot escape", async () => {
  const doc = parseSource("## Original\nContent.");
  let sent: any;
  const fetcher = async (_u: any, o: any) => {
    sent = JSON.parse(o.body);
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  slides: [
                    {
                      index: 0,
                      layout: "editorial",
                      imageId: "none",
                    },
                  ],
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
      { status: 200 },
    );
  };
  const p = await aiPlan(doc, {
    key: "test-only",
    images: false,
    fetcher: fetcher as typeof fetch,
  });
  assert.equal(p.engine, "openai");
  assert.equal(sent.store, false);
  assert.equal(sent.text.format.strict, true);
  const bad = async () =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  slides: [
                    {
                      index: 900,
                      layout: "cover",
                      imageId: "none",
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    );
  await assert.rejects(() =>
    aiPlan(doc, {
      key: "test-only",
      images: false,
      fetcher: bad as typeof fetch,
    }),
  );
});
