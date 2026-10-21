import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RELEASE } from "../core/release.js";

test("Phase 7E three-column geometry remains aligned for both navbars", () => {
  const css = fs.readFileSync("src/styles.css", "utf8");
  const home = fs.readFileSync("src/components/Homepage.tsx", "utf8");
  const workspace = fs.readFileSync("src/components/UserNavigation.tsx", "utf8");
  assert.match(css, /\.np7e-nav-inner,\s*\.user-topnav-inner\s*\{/);
  assert.match(css, /grid-template-columns:minmax\(185px,1fr\) auto minmax\(185px,1fr\)/);
  assert.match(css, /\.np7e-nav-inner,\s*\.user-topnav-inner/);
  assert.match(home, /className="np7e-nav-inner"/);
  assert.match(workspace, /className="user-topnav-inner"/);
  assert.equal(RELEASE.version, JSON.parse(fs.readFileSync("package.json", "utf8")).version);
  assert.ok(RELEASE.history.some((entry) => entry.phase === "Phase 7E"));
});

test("Phase 7E previews rotate through three clearly illustrative slides safely", () => {
  const home = fs.readFileSync("src/components/Homepage.tsx", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  assert.match(home, /DEMO_SLIDES = \[/);
  assert.match(home, /document\.hidden/);
  assert.match(home, /prefers-reduced-motion: reduce/);
  assert.match(home, /onMouseEnter=\{\(\) => setDemoPaused\(true\)\}/);
  assert.match(home, /aria-pressed=\{activeSlide === index\}/);
  assert.match(home, /Illustrative preview/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css, /@keyframes np7e-chart-grow/);
  assert.match(css, /@keyframes np7e-slide-enter/);
});
