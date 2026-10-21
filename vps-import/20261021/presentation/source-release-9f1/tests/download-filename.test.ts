import test from "node:test";
import assert from "node:assert/strict";
import { safeProjectFilenameStem, projectDownloadHeader } from "../server/download-filename.js";

const expected = [
  ["ECOSORT_SOURCE", "ECOSORT_SOURCE"],
  ["Robotika AI 2026", "Robotika AI 2026"],
  ["  Proyek: A/B?  ", "Proyek- A-B"],
  ["CON", "_CON"],
  ["..", "presentation"],
  ["", "presentation"],
] as const;
for (const [input, output] of expected) {
  test(`download name safely handles ${JSON.stringify(input)}`, () => {
    assert.equal(safeProjectFilenameStem(input), output);
  });
}

test("project names become filenames for all three downloadable formats", () => {
  assert.match(projectDownloadHeader("ECOSORT_SOURCE", "pptx"), /filename="ECOSORT_SOURCE.pptx"/);
  assert.match(projectDownloadHeader("ECOSORT_SOURCE", "pdf"), /filename="ECOSORT_SOURCE.pdf"/);
  assert.match(projectDownloadHeader("ECOSORT_SOURCE", "validation"), /filename="ECOSORT_SOURCE-validation-report.json"/);
});

test("Unicode is retained by filename*= and unsafe header characters cannot escape", () => {
  const header = projectDownloadHeader("Robotika Café Indonesia", "pptx");
  assert.ok(header.includes("filename*=UTF-8''Robotika%20Caf%C3%A9%20Indonesia.pptx"));
  const hostile = projectDownloadHeader('x\r\nSet-Cookie: hostile/CON\u202E', "pdf");
  assert.ok(!hostile.includes("\r") && !hostile.includes("\n"));
  assert.ok(!hostile.includes("\u202E"));
  assert.equal((hostile.match(/filename=/g) || []).length, 1);
});
