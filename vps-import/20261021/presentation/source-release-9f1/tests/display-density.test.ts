import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync("src/styles.css", "utf8");
const referenceStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

test("desktop density is approximately 80% while keeping original Inter family", () => {
  assert.ok(css.includes(`--font-ui: ${referenceStack};`));
  assert.match(css, /@media \(min-width: 721px\)[\s\S]*?html \{[\s\S]*?font-size: 13\.6px;/);
  assert.ok(css.includes(".user-topnav-inner"));
  assert.ok(css.includes(".home-nav"));
});

test("mobile inputs remain readable and no global scaling breaks interactions", () => {
  const update = css.slice(css.indexOf("/* Phase 3c"));
  assert.ok(update.includes("@media (max-width: 720px)"));
  assert.ok(update.includes("font-size: 16px"));
  assert.ok(!/\bzoom\s*:/.test(update));
  assert.ok(!/transform\s*:\s*scale\(/.test(update));
});
