import test from "node:test";
import sharp from "sharp";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { exportPptx } from "../core/export.js";
import { renderPptx } from "../server/render.js";
import { config } from "../server/config.js";
test("Final preview renders the actual editable PPTX through LibreOffice and Poppler", async (t) => {
  const cfg = config();
  if (
    spawnSync(cfg.soffice, ["--version"]).status !== 0 ||
    spawnSync(cfg.pdftoppm, ["-v"]).status !== 0
  ) {
    t.skip("LibreOffice/Poppler are not installed.");
    return;
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-render-"));
  try {
    const doc = parseSource(
      "## Exact source\nA sentence with 43,2%, punctuation, and original wording.",
    );
    const scene = buildScene(doc, rulesPlan(doc, false), "ivory");
    const { bytes } = await exportPptx(doc, scene);
    const file = path.join(dir, "presentation.pptx");
    await fs.writeFile(file, bytes);
    await fs.writeFile(path.join(dir, "preview-999.png"), "stale");
    await renderPptx(file, dir, cfg, scene.slides.length);
    const png = await fs.readFile(path.join(dir, "preview-0.png"));
    assert.ok(png.length > 1000);
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.ok((await fs.stat(path.join(dir, "presentation.pdf"))).size > 1000);
    await assert.rejects(() => fs.access(path.join(dir, "preview-999.png")));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});


test("Raster verification detects a truncated preview and rerenders only that page", async t => {
  const cfg = config();
  if (process.platform === "win32" || spawnSync(cfg.soffice, ["--version"]).status !== 0 || spawnSync(cfg.pdftoppm, ["-v"]).status !== 0) { t.skip("POSIX LibreOffice/Poppler required"); return; }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "raster-repair-"));
  try {
    const doc = parseSource("# Complete source\nThe preview must be fully decoded before publication.");
    const scene = buildScene(doc, rulesPlan(doc, false), "ivory");
    const { bytes } = await exportPptx(doc, scene); const file = path.join(dir, "presentation.pptx"); await fs.writeFile(file, bytes);
    const wrapper = path.join(dir, "pdftoppm-wrapper.cjs"), log = path.join(dir, "converter.log");
    await fs.writeFile(wrapper, "#!" + process.execPath + "\n" +
      'const fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");\n' +
      'const args=process.argv.slice(2); const result=spawnSync(' + JSON.stringify(cfg.pdftoppm) + ',args,{stdio:"ignore"});if(result.status!==0)process.exit(1);\n' +
      'fs.appendFileSync(' + JSON.stringify(log) + ',JSON.stringify(args)+"\\n");\n' +
      'if(!args.includes("-singlefile")){const folder=path.dirname(args.at(-1));const first=fs.readdirSync(folder).filter(n=>/^slide-\\d+\\.png$/.test(n)).sort()[0];fs.truncateSync(path.join(folder,first),64);}', { mode: 0o700 });
    await renderPptx(file, dir, { ...cfg, pdftoppm: wrapper }, scene.slides.length);
    await sharp(path.join(dir, "preview-0.png"), { failOn: "truncated" }).raw().toBuffer();
    const calls = (await fs.readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.equal(calls.length, 2); assert.ok(calls[1].includes("-singlefile"));
    assert.deepEqual(calls[1].slice(0, 2), ["-f", "1"]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
