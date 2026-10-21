import test from "node:test";
import assert from "node:assert/strict";
import { sourceHitboxes, snapMove, SLIDE_WIDTH, SLIDE_HEIGHT } from "../core/position-canvas.js";
import type { SceneSlide } from "../core/types.js";

test("canvas source hitboxes ignore decorative elements and merge source fragments", () => {
  const slide: SceneSlide = {
    id: "slide1", layout: "editorial", background: "#ffffff", blockIds: ["a", "b"], objects: [
      { type: "shape", sourceId: "a", shape: "rect", x: 0, y: 0, w: 12, h: 7, fill: "#123456" },
      { type: "text", sourceId: "a", x: 1, y: 1, w: 2, h: 1, text: "hello" },
      { type: "text", sourceId: "a", x: 1, y: 2.2, w: 3, h: .6, text: "world" },
      { type: "table", sourceId: "b", x: 5, y: 1, w: 4, h: 3 },
      { type: "text", sourceId: "unknown", x: 0, y: 0, w: 10, h: 5 },
      { type: "image", sourceId: "b", x: 1, y: 0, w: 1, h: 1 },
      { type: "text", sourceId: "a", x: NaN, y: 0, w: 1, h: 1 },
    ],
  };
  const hitboxes = sourceHitboxes(slide, ["a", "b"]);
  assert.equal(hitboxes.length, 2);
  assert.equal(hitboxes[0].id, "a");
  assert.equal(hitboxes[0].x, 1);
  assert.equal(hitboxes[0].y, 1);
  assert.equal(hitboxes[0].w, 3);
  assert.ok(Math.abs(hitboxes[0].h - 1.8) < 1e-9);
  assert.deepEqual(hitboxes[1], { id: "b", x: 5, y: 1, w: 4, h: 3 });
  assert.deepEqual(sourceHitboxes(slide, ["b"]), [
    { id: "b", x: 5, y: 1, w: 4, h: 3 },
  ]);
});

test("canvas movement uses PPTX inches, grid snapping and backend-compatible bounds", () => {
  assert.equal(SLIDE_WIDTH, 13.333333);
  assert.equal(SLIDE_HEIGHT, 7.5);
  assert.equal(snapMove(.12, .05, 0), .1);
  assert.equal(snapMove(-.13, .05, 0), -.15);
  assert.equal(snapMove(.31, .1, 0), .3);
  assert.equal(snapMove(.6, .25, .5), .25);
  assert.equal(snapMove(-1.5, .05, -.7), -.05);
  assert.equal(snapMove(.3, .25, .75), 0);
  assert.equal(snapMove(Number.POSITIVE_INFINITY, .05, 0), 0);
  assert.equal(snapMove(.2, .2, 0), 0);
});

test("visual canvas routes motion to staged plan changes rather than altering source text", async () => {
  const fs = await import("node:fs");
  const editor = fs.readFileSync("src/components/Editor.tsx", "utf8");
  const overlay = fs.readFileSync("src/components/CanvasPositionOverlay.tsx", "utf8");
  assert.match(editor, /<CanvasPositionOverlay/);
  assert.match(editor, /onMove=\{\(sourceId, dx, dy\) => nudge\(dx, dy, sourceId\)\}/);
  assert.match(editor, /d\.changePlan\(/);
  assert.match(overlay, /setPointerCapture/);
  assert.match(overlay, /onPointerCancel/);
  assert.match(overlay, /event\.key === "Enter"/);
  assert.match(overlay, /keys\[event\.key\]/);
});
