import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { notesForScene, notesTranscript, slideNotes } from "../core/notes.js";
import { exportPptx } from "../core/export.js";

test("Presenter notes include only final slide source and remain separate from fidelity validation", async () => {
  const doc = parseSource("## Opening\nOriginal line one.\n## Ending\nOriginal line two.");
  const scene = buildScene(doc, rulesPlan(doc, false), "ivory");
  const notes = notesForScene(doc, scene);
  assert.equal(notes.length, scene.slides.length);
  for (let i = 0; i < scene.slides.length; i++) {
    assert.ok(notes[i].includes(`Slide ${i + 1} of ${scene.slides.length}`));
    assert.equal(notes[i], slideNotes(scene.slides[i], i + 1, scene.slides.length));
  }
  const { bytes, report } = await exportPptx(doc, scene);
  assert.ok(report.passed);
  assert.ok(report.exportVerified);
  const pptx = await JSZip.loadAsync(bytes);
  const parts = Object.keys(pptx.files).filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name));
  assert.equal(parts.length, scene.slides.length);
  const partText = await Promise.all(parts.map((name) => pptx.file(name)!.async("string")));
  assert.ok(partText.join(" ").includes("Source-based presenter notes"));
  const script = notesTranscript(doc, scene);
  assert.ok(script.includes(doc.sha256));
  assert.ok(script.includes("Original line one"));
  assert.ok(script.includes("Original line two"));
  assert.ok(!script.includes("fake-source-contents"));
});

test("Presenter notes reject a mismatched scene fingerprint", () => {
  const doc = parseSource("Hello");
  const scene = buildScene(doc, rulesPlan(doc, false), "sage");
  assert.throws(() => notesForScene(parseSource("Different source"), scene), /SOURCE_CHANGED/);
});
