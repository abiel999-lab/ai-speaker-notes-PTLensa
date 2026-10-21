import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { parseSource } from "../core/source.js";
import { buildScene } from "../core/layout.js";
import { rulesPlan } from "../core/planner.js";
import { exportPptx } from "../core/export.js";
import { addNativeMotion, navigationPosition } from "../core/motion.js";
import { verifyPptx } from "../core/fidelity.js";
import { config } from "../server/config.js";
import { renderPptx, run } from "../server/render.js";

const source = "# A complete presentation\nEvery source word remains present.\n## Workflow\n- Capture the idea.\n- Shape the story.\n- Present with confidence.\n## Results\n| Item | Value |\n|---|---|\n| Exact | 92% |\n";
test("Native motion preserves source, references real shape IDs and links only to existing internal slides", async () => {
  const doc = parseSource(source), scene = buildScene(doc, rulesPlan(doc, false), "ivory");
  const plain = await exportPptx(doc, scene), animated = await exportPptx(doc, scene, {}, "keynote");
  assert.equal(animated.report.exportVerified, true); assert.equal((await verifyPptx(doc, animated.bytes)).passed, true);
  assert.ok(animated.report.motion!.animatedObjects >= doc.blocks.length);
  assert.equal(animated.report.motion!.transitionSlides, scene.slides.length);
  const zip = await JSZip.loadAsync(animated.bytes), unanimated = await JSZip.loadAsync(plain.bytes);
  const parser = new XMLParser({ ignoreAttributes: false });
  const presentation = await zip.file("ppt/presentation.xml")!.async("string");
  assert.ok(presentation.indexOf("<p:notesMasterIdLst>") < presentation.indexOf("<p:sldIdLst>"));
  for (let i = 1; i <= scene.slides.length; i++) {
    const filename = `ppt/slides/slide${i}.xml`, xml = await zip.file(filename)!.async("string");
    assert.equal(XMLValidator.validate(xml), true); assert.ok(xml.includes("<p:timing>"));
    assert.ok(!((await unanimated.file(filename)!.async("string")).includes("<p:timing>")));
    const ids = [...xml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)].map(m => m[1]);
    const targets = [...xml.matchAll(/<p:spTgt spid="(\d+)"/g)].map(m => m[1]);
    assert.ok(targets.length > 0 && targets.every(id => ids.includes(id)));
    const nodes = [...xml.matchAll(/<p:cTn id="(\d+)"/g)].map(m => m[1]);
    assert.equal(new Set(nodes).size, nodes.length);
    for (const match of xml.matchAll(/<p:bld(?:P|Graphic) spid="\d+" grpId="(\d+)"/g)) {
      assert.ok(nodes.includes(match[1]), "Build group must reference a real animation group");
      assert.ok(xml.includes(`grpId="${match[1]}" presetSubtype=`));
    }
    assert.ok(xml.indexOf("<p:transition ") < xml.indexOf("<p:timing>"));
    const rels = await zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)!.async("string");
    const tree = parser.parse(rels).Relationships.Relationship;
    for (const rel of Array.isArray(tree) ? tree : [tree])
      if (rel["@_Type"].endsWith("/slide")) {
        const to = Number(rel["@_Target"].match(/slide(\d+)\.xml$/)?.[1]);
        assert.ok(to >= 1 && to <= scene.slides.length); assert.notEqual(rel["@_TargetMode"], "External");
      }
  }
  assert.ok(!Object.keys(zip.files).some(f => !zip.files[f].dir && /vbaProject|activeX|embeddings/i.test(f)));
  await assert.rejects(() => addNativeMotion(animated.bytes), /MOTION_EXPORT_INVALID/);
  assert.equal(navigationPosition({ ...scene.slides[0], objects: [{ type: "text", sourceId: "b0", x: 0, y: 0, w: 13.333333, h: 7.5 }] }), undefined);
});

test("LibreOffice renders animated exports with complete static content and retains native timing on PPTX roundtrip", async t => {
  const cfg = config();
  if (spawnSync(cfg.soffice, ["--version"]).status !== 0 || spawnSync(cfg.pdftoppm, ["-v"]).status !== 0) { t.skip("LibreOffice/Poppler unavailable"); return; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "motion-render-"));
  try {
    const doc = parseSource(source), scene = buildScene(doc, rulesPlan(doc, false), "midnight");
    const { bytes } = await exportPptx(doc, scene, {}, "keynote");
    const file = path.join(root, "motion.pptx"); await fs.writeFile(file, bytes);
    await renderPptx(file, root, cfg, scene.slides.length);
    assert.ok((await fs.stat(path.join(root, "preview-0.png"))).size > 1000);
    const pdfText = spawnSync("pdftotext", ["-layout", path.join(root, "motion.pdf"), "-"], { encoding: "utf8" });
    assert.equal(pdfText.status, 0); assert.match(pdfText.stdout, /Every source word remains present/); assert.match(pdfText.stdout, /92%/);
    const converted = path.join(root, "roundtrip"); await fs.mkdir(converted);
    await run(cfg.soffice, [`-env:UserInstallation=${pathToFileURL(path.join(root, "roundtrip-profile")).href}`, "--headless", "--convert-to", "pptx", "--outdir", converted, file]);
    const zip = await JSZip.loadAsync(await fs.readFile(path.join(converted, "motion.pptx")));
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    assert.ok(xml.includes("<p:timing>"), "Independent importer must recognize the animation tree");
    assert.ok(xml.includes("<p:animEffect"), "Independent importer must retain entrance effects");
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
