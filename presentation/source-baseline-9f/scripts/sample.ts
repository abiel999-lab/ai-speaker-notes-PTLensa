import fs from "node:fs/promises";
import path from "node:path";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { exportPptx } from "../core/export.js";
const source = await fs.readFile("samples/pemda.txt", "utf8");
const doc = parseSource(source);
const plan = rulesPlan(doc, true);
const scene = buildScene(doc, plan, "midnight");
const { bytes, report } = await exportPptx(doc, scene);
await fs.mkdir("test-output", { recursive: true });
await fs.writeFile("test-output/Pemda_Verbatim.pptx", bytes);
await fs.writeFile("test-output/scene.json", JSON.stringify(scene));
await fs.writeFile(
  "test-output/validation.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    slides: scene.slides.length,
    blocks: doc.blocks.length,
    passed: report.passed,
    path: path.resolve("test-output/Pemda_Verbatim.pptx"),
  }),
);
