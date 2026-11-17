import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { RELEASE } from "../core/release.js";

/** Guard against displaying a stale build number after future phase updates. */
test("development version agrees across UI, package, lockfile, Compose and health endpoint", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const compose = fs.readFileSync("compose.yaml", "utf8");
  const app = fs.readFileSync("server/app.ts", "utf8");
  const ui = fs.readFileSync("src/components/ReleaseInfo.tsx", "utf8");
  assert.equal(RELEASE.version, pkg.version);
  assert.equal(RELEASE.version, lock.version);
  assert.equal(RELEASE.version, lock.packages[""].version);
  assert.match(RELEASE.version, /^1\.0\.0-dev\.9f\.1$/);
  assert.ok(compose.includes(`verbatim-project2:${RELEASE.version}`));
  assert.equal(compose.match(new RegExp(`verbatim-project2:${RELEASE.version.replaceAll(".", "\\.")}`, "g"))?.length, 2);
  assert.match(app, /version: RELEASE\.version/);
  assert.match(ui, /RELEASE\.version/);
});

test("release notes list actual phase features in both languages", () => {
  assert.equal(RELEASE.phase, "Phase 9F.1");
  assert.equal(RELEASE.history[0].version, RELEASE.version);
  assert.ok(RELEASE.history.length >= 4);
  for (const entry of RELEASE.history) {
    assert.ok(entry.title.en.length > 5 && entry.title.id.length > 5);
    assert.ok(entry.changes.length >= 2);
    assert.ok(entry.changes.every((change) => change.en.length > 10 && change.id.length > 10));
  }
  const editor = fs.readFileSync("src/components/Editor.tsx", "utf8");
  for (const step of ["0.05", "0.1", "0.25"]) {
    assert.ok(editor.includes(`value={${step}}`), `Move step ${step} is selectable`);
  }
  assert.match(editor, /Math\.abs\(nextX\) > 0\.75/);
  assert.match(editor, /Math\.abs\(nextY\) > 0\.75/);
});
