import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import type { Config } from "../server/config.js";
import { randomUUID } from "node:crypto";
const base = (root: string): Config => ({
  root,
  production: false,
  host: "127.0.0.1",
  port: 4310,
  model: "gpt-4.1-mini",
  render: false,
  soffice: "soffice",
  pdftoppm: "pdftoppm",
});
test("No-login end-to-end: source, project, job, export, versions, and restart", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-api-"));
  let instance = await createApp(base(root));
  let app = instance.app;
  let cookie = "";
  const call = (method: any, url: string, payload?: any, headers: any = {}) =>
    app.inject({
      method,
      url,
      payload,
      headers: { ...(cookie ? { cookie } : {}), ...headers },
    });
  try {
    assert.equal((await call("GET", "/api/projects")).statusCode, 200);
    const session = (await call("GET", "/api/session")).json();
    assert.equal(session.authentication, "none");
    assert.equal(session.setup, false);
    assert.equal(
      (
        await call("POST", "/api/login", {
          email: "owner@example.com",
          password: "unused",
        })
      ).statusCode,
      404,
    );
    assert.equal((await call("POST", "/api/setup", {})).statusCode, 404);
    const source = await fs.readFile("samples/pemda.txt", "utf8");
    const p = (
      await call("POST", "/api/projects", {
        name: "Pemda",
        source,
        mode: "markdown",
      })
    ).json().project;
    assert.ok(p.id);
    assert.equal(p.source, source);
    const g = await call("POST", `/api/projects/${p.id}/generate`, {
      settings: {
        theme: "midnight",
        mode: "markdown",
        useAI: false,
        images: true,
      },
    });
    assert.equal(g.statusCode, 202);
    const jid = g.json().generation.id;
    let job: any;
    for (let i = 0; i < 100; i++) {
      job = (await call("GET", `/api/generations/${jid}`)).json().generation;
      if (["ready", "failed"].includes(job.status)) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(job.status, "ready", job.error);
    assert.equal(job.report.passed, true);
    assert.equal(job.report.exportVerified, true);
    const file = await call("GET", `/api/generations/${jid}/export`);
    assert.equal(file.statusCode, 200);
    assert.match(file.headers["content-disposition"] || "", /filename="Pemda\.pptx"/);
    assert.ok(file.rawPayload.length > 20000);
    const validation = await call("GET", `/api/generations/${jid}/validation`);
    assert.equal(validation.statusCode, 200);
    assert.match(validation.headers["content-disposition"] || "", /filename="Pemda-validation-report\.json"/);
    assert.equal(validation.json().passed, true);
    assert.equal(validation.json().quality.status, "verified");
    assert.equal(validation.json().sourceHash, job.sourceHash);
    assert.ok(!validation.body.includes(source));
    const beforePdf = (await instance.repo.job(jid))!;
    const pdfDir = path.join(root, "exports", p.id, jid, "artifacts", beforePdf.artifactId!);
    await fs.writeFile(path.join(pdfDir, "presentation.pdf"), "%PDF-1.4\nminimal-route-fixture");
    await instance.repo.saveJob({ ...beforePdf, preview: "rendered" });
    const pdfResponse = await call("GET", `/api/generations/${jid}/pdf`);
    assert.equal(pdfResponse.statusCode, 200);
    assert.match(pdfResponse.headers["content-disposition"] || "", /filename="Pemda\.pdf"/);
    const wrong = await call(
      "POST",
      "/api/projects",
      { name: "Bad", source: "okay", mode: "literal" },
      { origin: "https://attacker.example" },
    );
    assert.equal(wrong.statusCode, 403);
    const second = {
      id: randomUUID(),
      email: "other@example.com",
      password: "",
      createdAt: new Date().toISOString(),
    };
    await instance.repo.addUser(second);
    const otherId = randomUUID();
    await instance.repo.saveProject({
      id: otherId,
      ownerId: second.id,
      name: "Other owner",
      source: "private",
      sourceHash: "unused",
      mode: "literal",
      createdAt: second.createdAt,
      updatedAt: second.createdAt,
      latestId: null,
    });
    assert.equal(
      (
        await call("GET", "/api/projects/" + otherId, undefined, {
          cookie: "vb_session=forged",
        })
      ).statusCode,
      404,
    );
    const exportPath = path.join(
      root,
      "exports",
      p.id,
      jid,
      "artifacts",
      (await instance.repo.job(jid))!.artifactId!,
      "presentation.pptx",
    );
    await fs.writeFile(exportPath, "corrupt");
    const damagedExport = await call("GET", `/api/generations/${jid}/export`);
    assert.equal(damagedExport.statusCode, 409);
    assert.equal(damagedExport.json().error, "EXPORT_CORRUPTED");
    const damagedValidation = await call("GET", `/api/generations/${jid}/validation`);
    assert.equal(damagedValidation.statusCode, 409);
    assert.equal(
      (
        await call("POST", "/api/import", {
          name: "bad.exe",
          base64: "YQ==",
          mode: "literal",
        })
      ).statusCode,
      400,
    );
    await app.close();
    instance = await createApp(base(root));
    app = instance.app;
    assert.equal(
      (await call("GET", `/api/projects/${p.id}`)).json().project.source,
      source,
    );
    assert.equal(
      (await call("GET", `/api/generations/${jid}`)).json().generation.status,
      "ready",
    );
    assert.equal((await call("GET", "/api/capabilities")).json().ai, false);
    const serialized = (await call("GET", "/api/projects")).body;
    assert.ok(!serialized.includes("Strong-test-password"));
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("Unauthenticated shared workspace cannot start in production mode", async () => {
  await assert.rejects(
    () => createApp({ ...base("/tmp/unused"), production: true }),
    /authentication and tenant isolation/,
  );
  await assert.rejects(
    () => createApp({ ...base("/tmp/unused"), production: true, origin: "http://localhost:4310" }),
    /authentication and tenant isolation/,
  );
});
