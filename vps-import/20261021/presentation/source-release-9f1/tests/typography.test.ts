import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync("src/styles.css", "utf8");
const html = readFileSync("index.html", "utf8");
const server = readFileSync("server/app.ts", "utf8");

const uiStack = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

test("UI uses Inter, not serif, and keeps larger text", () => {
  assert.ok(css.includes(`--font-ui: ${uiStack};`));
  assert.ok(css.includes("font-family: var(--font-ui)"));
  assert.ok(css.includes("font-size: 17px"));
  assert.ok(!css.includes("--font-serif"));
  assert.ok(!css.includes("Studio Sans"));
});

test("Inter loads via approved stylesheet and font CSP hosts", () => {
  assert.ok(html.includes("fonts.googleapis.com/css2?family=Inter"));
  assert.ok(server.includes('"https://fonts.googleapis.com"'));
  assert.ok(server.includes('"https://fonts.gstatic.com"'));
});
