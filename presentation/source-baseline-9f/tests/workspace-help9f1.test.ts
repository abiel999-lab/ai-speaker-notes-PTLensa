import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { WorkspaceHelp } from "../src/components/WorkspaceHelp.js";

test("How to Use explains 9F Always Generate and the complete six-step workflow", () => {
  const html = renderToStaticMarkup(React.createElement(WorkspaceHelp, { lang: "en", onBack: () => {} }));
  const doc = new JSDOM(html).window.document;
  const headings = [...doc.querySelectorAll("ol.workspace-help-steps h2")].map(el => el.textContent);
  assert.deepEqual(headings, [
    "Add your content", "Choose Template or Creative AI", "Customize your presentation",
    "Generate and track usage", "Review the result", "Download and present",
  ]);
  const copy = doc.body.textContent || "";
  for (const required of [
    "GPT-6 Luna", "up to 12 JPG/PNG", "Interactive topic and quiz links",
    "without another paid AI request", "source-safe fallback", "Estimated USD",
    "Links on this slide", "filenames follow your project name", "press F5",
    "PowerPoint reports a repaired file", "application UI is English",
  ]) assert.ok(copy.includes(required), `Missing guide content: ${required}`);
  assert.ok(!copy.includes("one repair request"), "Legacy paid repair guidance must not return");
  assert.match(doc.querySelector("a.workspace-help-back")?.getAttribute("href") || "", /^\/app$/);
});
