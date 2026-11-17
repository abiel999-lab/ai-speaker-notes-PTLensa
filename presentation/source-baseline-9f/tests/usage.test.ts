import { test } from "node:test";
import assert from "node:assert/strict";
import { Repository } from "../server/repository.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("Draft token ledger stores no topics/content and is scoped to the owner", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "np-draft-ledger-"));
  const repo = new Repository(dir);
  try {
    await repo.init();
    await repo.recordPromptDraftUsage("user-A", { model: "unit-test", inputTokens: 100, outputTokens: 250 });
    await repo.recordPromptDraftUsage("user-A", { model: "unit-test", inputTokens: 25, outputTokens: 45 });
    await repo.recordPromptDraftUsage("user-B", { model: "unit-test", inputTokens: 500, outputTokens: 1000 });
    assert.deepEqual(await repo.promptDraftUsage("user-A"), { input: 125, output: 295, tracked: 2 });
    assert.deepEqual(await repo.promptDraftUsage("user-B"), { input: 500, output: 1000, tracked: 1 });
    const bytes = await fs.readFile(path.join(dir, "studio.sqlite"));
    assert.equal(bytes.includes(Buffer.from("Private presentation topic")), false);
  } finally {
    await repo.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
