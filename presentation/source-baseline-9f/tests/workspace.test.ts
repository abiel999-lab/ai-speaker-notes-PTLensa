import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Repository } from "../server/repository.js";
import { createApp } from "../server/app.js";
import { config } from "../server/config.js";
import { hash } from "../core/source.js";
test("No-login upgrade preserves the first existing owner and stored project data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-upgrade-"));
  const repo = new Repository(root);
  await repo.init();
  const user = {
    id: "original-owner",
    email: "old@example.com",
    password: "old-hash-kept",
    createdAt: "2026-10-14T00:00:00Z",
  };
  await repo.addUser(user);
  const source = "Exact text, unchanged.";
  await repo.saveProject({
    id: "original-project",
    ownerId: user.id,
    name: "Existing project",
    source,
    sourceHash: hash(source),
    mode: "literal",
    createdAt: user.createdAt,
    updatedAt: user.createdAt,
    latestId: null,
  });
  await repo.close();
  let instance = await createApp({
    ...config(),
    root,
    database: undefined,
    redis: undefined,
    production: false,
    render: false,
  });
  try {
    let response = await instance.app.inject("/api/projects/original-project");
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().project.source, source);
    assert.equal(response.json().project.ownerId, user.id);
    assert.equal(
      (await instance.app.inject("/api/session")).json().user.id,
      user.id,
    );
    assert.equal(
      (await instance.repo.userById(user.id))!.password,
      "old-hash-kept",
    );
    await instance.app.close();
    instance = await createApp({
      ...config(),
      root,
      database: undefined,
      redis: undefined,
      production: false,
      render: false,
    });
    response = await instance.app.inject("/api/projects/original-project");
    assert.equal(response.json().project.source, source);
  } finally {
    await instance.app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
