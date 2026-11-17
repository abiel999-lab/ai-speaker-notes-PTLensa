import type { Rect, SceneObject } from "./types.js";
export function shapePolygon(shape: SceneObject["shape"]): number[][] | null {
  if (shape === "triangle") return [[.5, 0], [1, 1], [0, 1]];
  if (shape === "hexagon") return [[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]];
  if (shape === "parallelogram") return [[.25, 0], [1, 0], [.75, 1], [0, 1]];
  if (shape === "chevron") return [[0, 0], [.7, 0], [1, .5], [.7, 1], [0, 1], [.3, .5]];
  return null;
}
export function shapeContains(shape: SceneObject, box: Rect) {
  const inset = shape.shape === "roundRect" ? Math.max(.06, Math.min(shape.w, shape.h) * .05) : .06;
  if (shape.x + inset > box.x || shape.y + inset > box.y || shape.x + shape.w - inset < box.x + box.w || shape.y + shape.h - inset < box.y + box.h) return false;
  if (shape.shape === "rect" || shape.shape === "roundRect") return true;
  if (shape.shape === "ellipse") return [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]
    .every(([x, y]) => ((x - shape.x - shape.w / 2) / (shape.w / 2 - inset)) ** 2 + ((y - shape.y - shape.h / 2) / (shape.h / 2 - inset)) ** 2 <= 1);
  return false; // Polygon labels stay beside the geometry, avoiding ambiguous cutouts.
}
