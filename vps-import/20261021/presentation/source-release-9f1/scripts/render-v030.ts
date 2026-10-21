import fs from "node:fs/promises";
import path from "node:path";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { exportPptx } from "../core/export.js";
import { renderPptx } from "../server/render.js";
import { config } from "../server/config.js";

const doc = parseSource(await fs.readFile("samples/pemda.txt", "utf8"));
for (const template of ["minimal", "studio", "executive"] as const) {
  const dir = path.resolve("test-output/v030-" + template);
  await fs.mkdir(dir, { recursive: true });
  const theme =
    template === "studio"
      ? "graphite"
      : template === "minimal"
        ? "sage"
        : "cobalt";
  const scene = buildScene(doc, rulesPlan(doc, true), theme, {
    template,
    fontScale: 1.1,
    density: "compact",
  });
  const { bytes, report } = await exportPptx(doc, scene);
  const file = path.join(dir, "presentation.pptx");
  await fs.writeFile(file, bytes);
  await fs.writeFile(
    path.join(dir, "validation.json"),
    JSON.stringify(report, null, 2),
  );
  await renderPptx(file, dir, config(), scene.slides.length);
  console.log(template, scene.slides.length, "slides, verified and rendered");
}
