import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createApp } from "../server/app.js";

test("Prompt drafts are gated when AI is not configured and do not create projects", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "np-prompt-api-"));
  const { app } = await createApp({ root, production: false, host: "127.0.0.1", port: 4310,
    model: "gpt-4.1-mini", render: false, soffice: "soffice", pdftoppm: "pdftoppm" });
  try {
    const payload = { topic: "Local emissions policy in cities", audience: "Urban planners",
      purpose: "overview", language: "English", sections: 4 };
    const disabled = await app.inject({ method: "POST", url: "/api/prompt-drafts", payload });
    assert.equal(disabled.statusCode, 503);
    assert.equal(disabled.json().error, "AI_NOT_CONFIGURED");
    const invalid = await app.inject({ method: "POST", url: "/api/prompt-drafts", payload: { ...payload, sections: 50 } });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error, "INVALID_INPUT");
    const all = await app.inject({ method: "GET", url: "/api/projects" });
    assert.deepEqual(all.json().projects, []);
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
