import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RELEASE } from "../core/release.js";

test("Phase 7F keeps the homepage navigation visible and floats only after scroll", () => {
  const home = fs.readFileSync("src/components/Homepage.tsx", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  const workspace = fs.readFileSync("src/components/UserNavigation.tsx", "utf8");
  assert.match(home, /const \[navFloating, setNavFloating\] = useState\(false\)/);
  assert.match(home, /window\.scrollY > 32/);
  assert.match(home, /addEventListener\("scroll", syncFloating, \{ passive: true \}\)/);
  assert.match(home, /removeEventListener\("scroll", syncFloating\)/);
  assert.match(home, /np7f-floating-header\$\{navFloating \? " is-floating" : ""\}/);
  assert.match(css, /\.np7d-home \.np7d-nav\.np7e-site-header\.np7f-floating-header\s*\{\s*position:sticky/);
  assert.match(css, /\.np7f-floating-header\.is-floating > \.np7e-nav-inner\s*\{/);
  assert.match(css, /border-radius:18px/);
  assert.doesNotMatch(workspace, /np7f-floating-header/);
  assert.equal(RELEASE.version, JSON.parse(fs.readFileSync("package.json", "utf8")).version);
  assert.ok(RELEASE.history.some(entry => entry.phase === "Phase 7F"));
});

test("Phase 7F does not alter the homepage demo animation or reduced-motion support", () => {
  const home = fs.readFileSync("src/components/Homepage.tsx", "utf8");
  const css = fs.readFileSync("src/styles.css", "utf8");
  assert.match(home, /DEMO_SLIDES/);
  assert.match(home, /document\.hidden/);
  assert.match(home, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.np7f-floating-header > \.np7e-nav-inner\s*\{transition:none;/);
});
