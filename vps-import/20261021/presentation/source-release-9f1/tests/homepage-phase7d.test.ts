import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RELEASE } from "../core/release.js";

test("Phase 7D homepage has honest working routes, anchors and no false public auth", () => {
  const source = fs.readFileSync("src/components/Homepage.tsx", "utf8");
  for (const anchor of ["product", "workflow", "designs", "faq"]) {
    assert.match(source, new RegExp(`id=\"${anchor}\"`));
  }
  assert.match(source, /href=\"\/app\?new=1\"/);
  assert.match(source, /href=\"\/app\?new=1&author=1\"/);
  assert.match(source, /Illustrative preview/);
  assert.match(source, /<LanguageButton/);
  assert.doesNotMatch(source, /login\.notepreso\.com|href=\"\/pricing\"/);
});

test("Phase 7D dashboard flow and release history remain available", () => {
  const styles = fs.readFileSync("src/styles.css", "utf8");
  const nav = fs.readFileSync("src/components/UserNavigation.tsx", "utf8");
  const app = fs.readFileSync("src/App.tsx", "utf8");
  assert.match(styles, /\.np7d-home \.np7d-nav,\s*\.user-topnav\s*\{\s*position:static/);
  assert.match(styles, /\.app-shell\.np7d-dashboard-layout\s*\{height:auto/);
  assert.match(nav, /<ReleaseInfo lang=\{lang\} location=\"workspace\"/);
  assert.match(app, /view === \"dashboard\" \? \"np7d-dashboard-layout\"/);
  assert.equal(RELEASE.version, JSON.parse(fs.readFileSync("package.json", "utf8")).version);
  assert.equal(RELEASE.phase, RELEASE.history[0].phase);
  assert.equal(RELEASE.history[0].version, RELEASE.version);
});
