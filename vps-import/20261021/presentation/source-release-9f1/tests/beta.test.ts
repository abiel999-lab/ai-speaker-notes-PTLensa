import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Repository, type JobRecord } from "../server/repository.js";
import { processJob } from "../server/jobs.js";
import { generationDirectory } from "../server/artifacts.js";
import { createApp } from "../server/app.js";
import type { Config } from "../server/config.js";
import { hash } from "../core/source.js";

const cfg = (root: string): Config => ({ root, production: false, host: "127.0.0.1", port: 4310,
  model: "gpt-6-luna", render: false, soffice: "soffice", pdftoppm: "pdftoppm" });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-beta-"));
  const a = new Repository(root), b = new Repository(root); await a.init(); await b.init();
  const owner = randomUUID();
  async function job(name = "Test"): Promise<JobRecord> {
    const id = randomUUID(), now = new Date().toISOString(), source = "# Original heading\nOriginal words stay intact.";
    await a.saveProject({ id, ownerId: owner, name, source, sourceHash: hash(source), mode: "markdown",
      createdAt: now, updatedAt: now, latestId: null });
    return { id: randomUUID(), projectId: id, ownerId: owner, source, sourceHash: hash(source),
      status: "queued", progress: 0, stage: "Waiting", createdAt: now, preview: "none", kind: "generation",
      settings: { theme: "ivory", mode: "markdown", useAI: false, images: false } };
  }
  return { root, a, b, owner, job, close: async () => { await a.close(); await b.close(); await fs.rm(root, { recursive: true, force: true }); } };
}

test("Atomic owner admission allows two concurrent jobs across repositories and charges only admitted jobs", async () => {
  const f = await fixture();
  try {
    const jobs = await Promise.all(Array.from({ length: 20 }, () => f.job()));
    const results = await Promise.allSettled(jobs.map((j, i) => (i % 2 ? f.a : f.b).admitJob(j, { generations: 20, ai: 20 }, true)));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2);
    for (const r of results) if (r.status === "rejected") assert.equal(r.reason.message, "TOO_MANY_ACTIVE_JOBS");
    assert.equal((await f.a.dailyUsage(f.owner)).generations, 2);
    assert.equal((await f.a.dailyUsage(f.owner)).ai, 2);
  } finally { await f.close(); }
});

test("An AI quota failure rolls back generation quota and job insertion", async () => {
  const f = await fixture();
  try {
    const job = await f.job(); await f.a.reserveUsage(f.owner, "ai", 1);
    await assert.rejects(() => f.b.admitJob(job, { generations: 10, ai: 1 }, true), /QUOTA_EXCEEDED/);
    assert.equal((await f.a.dailyUsage(f.owner)).generations, 0);
    assert.equal(await f.a.job(job.id), null);
  } finally { await f.close(); }
});

test("Admission links the generation without overwriting newer project source", async () => {
  const f = await fixture();
  try {
    const job = await f.job();
    const original = (await f.a.getProject(job.projectId, f.owner))!;
    const source = "Newer autosaved document.";
    await f.a.saveProject({ ...original, source, sourceHash: hash(source), revision: 2 });
    await f.b.admitJob(job);
    const linked = (await f.a.getProject(job.projectId, f.owner))!;
    assert.equal(linked.latestId, job.id); assert.equal(linked.source, source); assert.equal(linked.revision, 2);
    assert.equal((await f.a.job(job.id))!.source, original.source);
  } finally { await f.close(); }
});

test("Schema upgrade backfills a legacy project's listing while retaining its original export path", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-legacy-"));
  const id = randomUUID(), owner = randomUUID(), now = new Date().toISOString();
  const project = { id, ownerId: owner, name: "Legacy presentation", source: "Legacy exact source", sourceHash: hash("Legacy exact source"),
    mode: "literal", createdAt: now, updatedAt: now, latestId: null };
  const db = new DatabaseSync(path.join(root, "studio.sqlite"));
  db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,data TEXT NOT NULL)");
  db.prepare("INSERT INTO projects VALUES (?,?,?)").run(id, owner, JSON.stringify(project)); db.close();
  const repo = new Repository(root);
  try {
    await repo.init();
    const page = await repo.projectsPage(owner, { limit: 30, offset: 0, search: "Legacy", sort: "recent", filter: "drafts" });
    assert.equal(page.projects[0].source, project.source);
    assert.equal(page.projects[0].ownerId, owner);
    const generation = { projectId: id, id: randomUUID() } as JobRecord;
    assert.equal(generationDirectory(root, generation), path.join(root, "exports", id, generation.id));
  } finally { await repo.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test("Deletion cannot race admission into an orphan generation", async () => {
  const f = await fixture();
  try {
    const job = await f.job();
    const results = await Promise.allSettled([f.a.admitJob(job), f.b.deleteProject(job.projectId, f.owner)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const stored = await f.a.job(job.id);
    if (stored) assert.ok(await f.a.getProject(stored.projectId, f.owner));
  } finally { await f.close(); }
});

test("Expired job leases can be recovered; stale workers cannot publish or revoke the new lease", async () => {
  const f = await fixture();
  try {
    const job = await f.job(); await f.a.admitJob(job);
    const first = randomUUID(), second = randomUUID();
    assert.ok(await f.a.claimJob(job.id, first, 1));
    await new Promise(r => setTimeout(r, 8));
    assert.ok(await f.b.claimJob(job.id, second));
    assert.equal(await f.a.saveLeasedJob(job, { ...job, status: "ready" }, first), false);
    await f.a.releaseLease(job.id, first);
    assert.equal(await f.b.renewLease(job.id, second), true);
    assert.equal(await f.a.claimJob(job.id, randomUUID()), null);
    assert.equal(await f.b.saveLeasedJob(job, { ...job, status: "cancelled" }, second), true);
    assert.equal(await f.a.claimJob(job.id, randomUUID()), null);
  } finally { await f.close(); }
});

test("Duplicate worker delivery produces one verified export in an attempt-specific directory", async () => {
  const f = await fixture();
  try {
    const job = await f.job(); await f.a.admitJob(job);
    const results = await Promise.allSettled([processJob(f.a, cfg(f.root), job.id), processJob(f.b, cfg(f.root), job.id)]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const rejected = results.find(r => r.status === "rejected");
    assert.equal(rejected?.status === "rejected" && rejected.reason.message, "JOB_LEASE_BUSY");
    const finished = (await f.a.job(job.id))!;
    assert.equal(finished.status, "ready"); assert.equal(finished.report?.exportVerified, true);
    assert.ok(finished.artifactId);
    assert.ok((await fs.stat(path.join(generationDirectory(f.root, finished), "presentation.pptx"))).size > 1000);
    assert.equal((await fs.readdir(path.join(f.root, "exports", job.projectId, job.id, "artifacts"))).length, 1);
  } finally { await f.close(); }
});

test("Bounded project listing filters and sorts all owner metadata, with no source/other-owner leakage", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "verbatim-page-"));
  const { app, repo } = await createApp(cfg(root));
  try {
    const owner = await repo.workspaceOwner();
    for (let i = 0; i < 35; i++) {
      const now = new Date().toISOString();
      await repo.saveProject({ id: randomUUID(), ownerId: owner.id, name: `Report ${String(i).padStart(2, "0")}`,
        source: "private-secret-source", sourceHash: hash("private-secret-source"), mode: "literal",
        createdAt: now, updatedAt: now, latestId: null });
    }
    const one = (await app.inject("/api/projects?limit=20&sort=name")).json();
    const two = (await app.inject("/api/projects?limit=20&sort=name&offset=20")).json();
    assert.equal(one.projects.length, 20); assert.equal(one.nextOffset, 20);
    assert.equal(two.projects.length, 15); assert.equal(two.nextOffset, null);
    assert.equal(one.projects[0].name, "Report 00");
    assert.equal(two.projects[0].name, "Report 20");
    assert.equal(new Set([...one.projects, ...two.projects].map(p => p.id)).size, 35);
    assert.equal((await app.inject("/api/projects?search=Report%2034")).json().projects.length, 1);
    assert.equal((await app.inject("/api/projects?limit=101")).statusCode, 400);
    assert.ok(!JSON.stringify(one).includes("private-secret-source"));
    assert.ok(!JSON.stringify(one).includes("ownerId"));
    await assert.rejects(() => repo.saveProject({ ...one.projects[0], ownerId: "another-owner", source: "replacement" }), /PROJECT_NOT_FOUND/);
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
