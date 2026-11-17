import test from "node:test";
import assert from "node:assert/strict";
import { parseSource } from "../core/source.js";
import { createCreativeScene, creativeAtoms, sceneFromCreative } from "../core/creative.js";
import { validateScene } from "../core/fidelity.js";

const source = [
  "# EcoSort Robotika", "Kamera membaca objek yang berjalan pada konveyor.",
  "Sensor dan kecerdasan buatan membantu robot mengenali berbagai kategori sampah.",
  "## Kuis", "Apa manfaat utama pemilahan robot?"
].join("\n\n");
const assetId = "00000000-0000-4000-8000-000000000001";
const doc = parseSource(source);
const atoms = creativeAtoms(doc);

function sample() {
  const boxes = atoms.map((a, i) => ({ key: a.key, x: .8, y: .85 + i*1.55, w: 7.2, h: 1.18,
    fontSize: 22, bold: i === 0 || i === 3, color: "#FFFFFF", targetSlide: i === 0 ? 2 : null }));
  return { menuSlide: 1, slides: [
    { background: "#081526", image: { assetId, x: 0, y: 0, w: 13.333333, h: 7.5,
      placement: "background" as const, textSide: "left" as const, treatment: "dark" as const },
      shapes: [], boxes: boxes.slice(0,3) },
    { background: "#081526", image: null, shapes: [], boxes: boxes.slice(3).map((b,i) => ({ ...b, y: 1.2 + i*1.25 })) }
  ] };
}
function completed(data: unknown) {
  return Response.json({ status: "completed", usage: { input_tokens: 300, output_tokens: 100 },
    output: [{ content: [{ type: "output_text", text: JSON.stringify(data) }] }] });
}

for (const defect of ["too-small-text-box", "overlapping-text-boxes"] as const) {
  test(`9E.3 repairs ${defect} locally without paid Luna repair or changing any source text`, async () => {
    const raw = sample();
    if (defect === "too-small-text-box") {
      raw.slides[0].boxes[0].h = .1;
      raw.slides[0].boxes[0].fontSize = 74;
    } else {
      raw.slides[0].boxes[1].y = raw.slides[0].boxes[0].y;
    }
    assert.throws(() => sceneFromCreative(doc, raw, "midnight", true, { assets: [{ id: assetId, description: "robot" }], interactiveLinks: true, slideCount: 2 }),
      /CREATIVE_INVALID_SCENE/);
    let calls = 0, paidRepair = 0; const fixes: string[][] = [];
    const response = await createCreativeScene(doc, "An editorial robotic deck", {
      key: "fixture", theme: "midnight", motion: "keynote", features: {
        assets: [{ id: assetId, description: "robot" }], interactiveLinks: true, slideCount: 2 },
      fetcher: (async () => { calls++; return completed(raw); }) as typeof fetch,
      onRepair: async () => { paidRepair++; }, onAutoRepair: codes => fixes.push(codes),
    });
    assert.equal(calls, 1); assert.equal(paidRepair, 0);
    assert.ok(fixes.flat().some(x => x.startsWith("SOURCE_SAFE_REFLOW:")));
    assert.equal(response.scene.slides.length, 2);
    assert.equal(validateScene(doc, response.scene).passed, true);
    assert.equal(response.scene.slides[0].objects.find(o => o.type === "text")?.targetSlide, 2);
  });
}
