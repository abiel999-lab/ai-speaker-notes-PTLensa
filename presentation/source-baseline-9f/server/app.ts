import Redis from "ioredis";
import { trackedFetch } from "./provider-usage.js";
import { generationDirectory } from "./artifacts.js";
import { projectDownloadHeader } from "./download-filename.js";
import { redisConnection } from "./jobs.js";
import { registerOidc, sessionCsrf, workspaceReturnPath } from "./auth.js";
import { validateOidc } from "./auth-config.js";
import { reserveUsage, usageLimits } from "./usage.js";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Repository, type User } from "./repository.js";
import { JobRunner } from "./jobs.js";
import type { Config } from "./config.js";
import { parseSource, hash, decodeSource } from "../core/source.js";
import { verifyPptx } from "../core/fidelity.js";
import { notesTranscript } from "../core/notes.js";
import { RELEASE } from "../core/release.js";
import type { Project } from "../core/types.js";
import sharp from "sharp";
import { sourceInput } from "./contracts.js";
import { promptDraftInput, generatePromptDraft } from "../core/prompt-draft.js";
import { registerGenerationRoutes } from "./generation-routes.js";
declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}
import { isLoopbackHostname, isLoopbackOrigin } from "./local-boundary.js";
const terminal = ["ready", "failed", "cancelled"];
export async function createApp(cfg: Config) {
  // Fail closed: this release has a shared, unauthenticated workspace owner.
  // A production mode MUST have a real validated identity provider and tenant isolation.
  if (cfg.production)
    throw new Error("Public production disabled: authentication and tenant isolation are required.");
  if (cfg.origin && !isLoopbackOrigin(cfg.origin))
    throw new Error(
      "Local release requires a loopback APP_ORIGIN. Configure authentication before public deployment.",
    );
  if (cfg.oidc) validateOidc(cfg.oidc, cfg.origin);
  const repo = new Repository(cfg.root, cfg.database);
  await repo.init();
  const workspaceUser = cfg.oidc ? null : await repo.workspaceOwner();
  const runner = new JobRunner(repo, cfg);
  await runner.init();
  const app = Fastify({ bodyLimit: 3 * 1024 * 1024, logger: false });
  app.decorateRequest("user", null);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        upgradeInsecureRequests: cfg.production ? [] : null,
      },
    },
  });
  const identity = await registerOidc(app, repo, cfg);
  const rateRedis = cfg.redis ? new Redis({ ...redisConnection(cfg.redis), enableOfflineQueue: true, commandTimeout: 5000 }) : undefined;
  rateRedis?.on("error", () => {});
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute", hook: "preHandler",
    ...(rateRedis ? { redis: rateRedis, nameSpace: "verbatim-project2-rate-" } : {}),
    skipOnError: false,
    keyGenerator: req => req.user?.id || req.ip });
  app.addHook("onRequest", async (req, reply) => {
    try {
      const host = new URL("http://" + (req.headers.host || ""));
      if (!isLoopbackHostname(host.hostname) || host.pathname !== "/")
        return reply.code(403).send({ error: "HOST_REJECTED" });
    } catch {
      return reply.code(403).send({ error: "HOST_REJECTED" });
    }
    if (req.method !== "GET" && req.method !== "HEAD" && req.headers.origin) {
      let permitted = false;
      try {
        const u = new URL(req.headers.origin);
        const configured = new URL(
          cfg.origin || "http://localhost:" + cfg.port,
        );
        permitted =
          u.origin === configured.origin ||
          (!cfg.production &&
            isLoopbackHostname(u.hostname) &&
            u.protocol === configured.protocol &&
            u.port === configured.port);
      } catch {}
      if (!permitted) return reply.code(403).send({ error: "ORIGIN_REJECTED" });
    }
    req.user = identity ? await identity.user(req) : workspaceUser;
    if (identity) {
      const publicApi = new Set(["/api/health", "/api/session", "/api/auth/login", "/api/auth/callback"]);
      const pathname = req.url.split("?")[0];
      if (!req.user && (pathname === "/app" || pathname.startsWith("/app/"))) {
        const returnTo = workspaceReturnPath(req.url);
        return reply.redirect("/api/auth/login" +
          (returnTo === "/app" ? "" : "?returnTo=" + encodeURIComponent(returnTo)));
      }
      if (pathname.startsWith("/api/") && !publicApi.has(pathname) && !req.user)
        return reply.code(401).send({ error: "AUTH_REQUIRED" });
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        if (req.headers.origin !== cfg.origin)
          return reply.code(403).send({ error: "ORIGIN_REJECTED" });
        if (!identity.csrf(req)) return reply.code(403).send({ error: "CSRF_REJECTED" });
      }
    }
  });
  app.addHook("onSend", async (req, reply, payload) => {
    if (req.url.startsWith("/api/"))
      reply.header("Cache-Control", "private, no-store");
    return payload;
  });
  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: "AUTH_REQUIRED" });
  };
  app.get("/api/health", { config: { rateLimit: false } }, async () => ({ ok: true, version: RELEASE.version }));
  app.get("/api/session", async (req) => ({
    user: req.user ? { id: req.user.id, name: cfg.oidc ? (req.user.displayName || null) : "Local workspace",
      email: cfg.oidc ? (req.user.displayEmail || "Signed-in user") : "workspace@local.invalid" } : null,
    authentication: cfg.oidc ? "oidc" : "none",
    ...(cfg.oidc && req.user ? { csrfToken: sessionCsrf(req) } : {}),
    setup: false,
  }));
  app.get("/api/usage", { preHandler: auth }, async req => ({
    usage: await repo.dailyUsage(req.user!.id), limits: usageLimits(cfg),
    enforced: !!cfg.oidc, resetTimezone: "UTC",
  }));
  app.get("/api/token-usage", { preHandler: auth }, async (req, reply) => {
    const query = z.object({ generationId: z.string().uuid().optional() }).strict().parse(req.query);
    if (query.generationId && !(await repo.job(query.generationId, req.user!.id)))
      return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
    return { usage: await repo.tokenUsage(req.user!.id, query.generationId) };
  });
  app.get("/api/capabilities", { preHandler: auth }, async () => ({
    ai: !!cfg.key,
    model: cfg.key ? "gpt-6-luna" : null,
    render: cfg.render,
    mode: cfg.production ? "production" : "local",
    models: ["gpt-6-luna"],
    creativeModels: ["gpt-6-luna"],
    localAdmin: false,
  }));
  // AI content authoring is opt-in. This endpoint never writes projects or alters source.
  app.post("/api/prompt-drafts", {
    preHandler: auth,
    config: { rateLimit: { max: 6, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    const input = promptDraftInput.parse(req.body);
    if (!cfg.key) return reply.code(503).send({ error: "AI_NOT_CONFIGURED" });
    await reserveUsage(repo, cfg, req.user!.id, "ai");
    const draft = await generatePromptDraft(input, {
      fetcher: trackedFetch(repo, req.user!.id, "content-draft"),
      key: cfg.key,
      model: "gpt-6-luna",
      signal: AbortSignal.timeout(60000),
    });
    // Usage only: do not persist topics or authored content in this ledger.
    await repo.recordPromptDraftUsage(req.user!.id, draft.usage).catch(() =>
      console.error(JSON.stringify({ event: "draft_metrics_write", code: "METRICS_UNAVAILABLE" })),
    );
    reply.header("Cache-Control", "private, no-store");
    return { draft };
  });
  app.get("/api/sample", { preHandler: auth }, async () => ({
    source: await fs.readFile("samples/pemda.txt", "utf8"),
    name: "Decarbonization · Local government",
  }));
  app.post("/api/analyze", { preHandler: auth }, async (req) => {
    const body = z
      .object({ source: z.string(), mode: z.enum(["markdown", "literal"]) })
      .strict()
      .parse(req.body);
    const doc = parseSource(body.source, body.mode);
    return {
      hash: doc.sha256,
      words: doc.words,
      blocks: doc.blocks.map(({ id, text, kind, level, raw }) => ({
        raw,
        id,
        text,
        kind,
        level,
      })),
      headings: doc.blocks.filter((b) => b.kind === "heading").length,
    };
  });
  app.post("/api/import", { preHandler: auth }, async (req) => {
    const body = z
      .object({
        name: z.string().max(120),
        base64: z.string(),
        mode: z.enum(["markdown", "literal"]),
      })
      .strict()
      .parse(req.body);
    if (!/\.(txt|md)$/i.test(body.name)) throw new Error("FILE_TYPE");
    const source = decodeSource(Buffer.from(body.base64, "base64"));
    const doc = parseSource(source, body.mode);
    return { source, hash: doc.sha256, words: doc.words };
  });
  app.get("/api/projects", { preHandler: auth }, async (req) => {
    const options = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
      search: z.string().max(120).default(""),
      sort: z.enum(["recent", "name"]).default("recent"),
      filter: z.enum(["all", "ready", "drafts"]).default("all"),
    }).strict().parse(req.query);
    const page = await repo.projectsPage(req.user!.id, options);
    return {
      projects: await Promise.all(
      page.projects.map(
        async ({ source, ownerId, ...p }) => {
          const job = p.latestId
            ? await repo.job(p.latestId, req.user!.id)
            : null;
          return {
            ...p,
            latest: job
              ? {
                  id: job.id,
                  status: job.status,
                  slides: job.scene?.slides.length || 0,
                  theme: job.settings.theme,
                  engine: job.plan?.engine,
                  preview: job.preview,
                }
              : null,
          };
        },
      ),
    ),
      nextOffset: page.nextOffset,
    };
  });
  app.post("/api/projects", { preHandler: auth }, async (req) => {
    const body = sourceInput.parse(req.body);
    const doc = parseSource(body.source, body.mode);
    const now = new Date().toISOString();
    const p: Project = {
      id: randomUUID(),
      ownerId: req.user!.id,
      name: body.name,
      source: body.source,
      sourceHash: doc.sha256,
      mode: body.mode,
      createdAt: now,
      updatedAt: now,
      latestId: null,
      revision: 1,
    };
    await repo.saveProject(p);
    return { project: p };
  });
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id",
    { preHandler: auth },
    async (req, reply) => {
      const p = await repo.getProject(req.params.id, req.user!.id);
      if (!p) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
      return {
        project: p,
        history: (await repo.jobsForProject(p.id, p.ownerId)).map(
          ({ source, scene, plan, ownerId, artifactId, ...j }) => j,
        ),
      };
    },
  );
  app.patch<{ Params: { id: string } }>(
    "/api/projects/:id",
    { preHandler: auth },
    async (req, reply) => {
      const p = await repo.getProject(req.params.id, req.user!.id);
      if (!p) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
      const body = sourceInput
        .extend({ expectedRevision: z.number().int().nonnegative().optional() })
        .parse(req.body);
      if (
        body.expectedRevision !== undefined &&
        body.expectedRevision !== (p.revision || 0)
      )
        return reply.code(409).send({ error: "PROJECT_CONFLICT" });
      parseSource(body.source, body.mode);
      const { expectedRevision, ...input } = body;
      const updated = {
        ...p,
        ...input,
        revision: (p.revision || 0) + 1,
        sourceHash: hash(body.source),
        updatedAt: new Date().toISOString(),
      };
      if (!(await repo.compareAndSaveProject(p, updated)))
        return reply.code(409).send({ error: "PROJECT_CONFLICT" });
      return { project: updated };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/duplicate",
    { preHandler: auth },
    async (req, reply) => {
      const p = await repo.getProject(req.params.id, req.user!.id);
      if (!p) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
      const now = new Date().toISOString();
      const copy = {
        ...p,
        id: randomUUID(),
        name: (p.name + " · Copy").slice(0, 120),
        createdAt: now,
        updatedAt: now,
        latestId: null,
        revision: 1,
      };
      await repo.saveProject(copy);
      return { project: copy };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/image",
    { preHandler: auth },
    async (req, reply) => {
      const p = await repo.getProject(req.params.id, req.user!.id);
      if (!p) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
      const body = z
        .object({ base64: z.string().max(2800000) })
        .strict()
        .parse(req.body);
      const bytes = Buffer.from(body.base64, "base64");
      const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      if ((!png && !jpeg) || bytes.length > 2 * 1024 * 1024)
        return reply.code(400).send({ error: "IMAGE_TYPE" });
      try {
        const image = sharp(bytes, { limitInputPixels: 16000000 });
        const meta = await image.metadata();
        if (!meta.width || !meta.height)
          return reply.code(400).send({ error: "IMAGE_TYPE" });
        const dir = path.join(cfg.root, "assets", p.id);
        await fs.mkdir(dir, { recursive: true });
        const assetId = randomUUID();
        await image
          .rotate()
          .resize({
            width: 1920,
            height: 1920,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 88 })
          .toFile(path.join(dir, assetId + ".jpg"));
        return { assetId };
      } catch {
        return reply.code(400).send({ error: "IMAGE_TYPE" });
      }
    },
  );
  app.get<{ Params: { id: string } }>("/api/projects/:id/images", { preHandler: auth }, async (req, reply) => {
    const project = await repo.getProject(req.params.id, req.user!.id);
    if (!project) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
    let files: string[];
    try { files = await fs.readdir(path.join(cfg.root, "assets", project.id)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; files = []; }
    reply.header("Cache-Control", "private, no-store");
    const assets = files.filter(name => /^[0-9a-f-]{36}\.jpg$/i.test(name) && z.string().uuid().safeParse(name.slice(0, -4)).success)
      .sort().slice(0, 100).map(name => ({ id: name.slice(0, -4) }));
    return { assets };
  });
  app.get<{ Params: { id: string; assetId: string } }>(
    "/api/projects/:id/image/:assetId",
    { preHandler: auth },
    async (req, reply) => {
      const p = await repo.getProject(req.params.id, req.user!.id);
      if (!p) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
      if (!z.string().uuid().safeParse(req.params.assetId).success)
        return reply.code(404).send({ error: "IMAGE_NOT_FOUND" });
      try {
        const bytes = await fs.readFile(
          path.join(cfg.root, "assets", p.id, req.params.assetId + ".jpg"),
        );
        reply.header("Cache-Control", "private, no-store").type("image/jpeg");
        return bytes;
      } catch {
        return reply.code(404).send({ error: "IMAGE_NOT_FOUND" });
      }
    },
  );
  registerGenerationRoutes(app, repo, runner, cfg);
  app.get<{ Params: { id: string } }>(
    "/api/generations/:id",
    { preHandler: auth },
    async (req, reply) => {
      const j = await repo.job(req.params.id, req.user!.id);
      if (!j) return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
      const { ownerId, artifactId, ...generation } = j;
      return { generation };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/generations/:id/cancel",
    { preHandler: auth },
    async (req, reply) => {
      const j = await repo.job(req.params.id, req.user!.id);
      if (!j) return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
      if (!terminal.includes(j.status))
        await repo.compareAndSaveJob(j, {
          ...j,
          status: "cancelled",
          stage: "Cancelled",
        });
      return { ok: true };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/generations/:id/export",
    { preHandler: auth },
    async (req, reply) => {
      const j = await repo.job(req.params.id, req.user!.id);
      if (!j) return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
      if (j.status !== "ready" || !j.report?.passed || !j.report.exportVerified)
        return reply.code(409).send({ error: "EXPORT_NOT_READY" });
      const file = path.join(generationDirectory(cfg.root, j), "presentation.pptx");
      let bytes: Buffer;
      try { bytes = await fs.readFile(file); }
      catch { return reply.code(409).send({ error: "EXPORT_NOT_READY" }); }
      let verified: Awaited<ReturnType<typeof verifyPptx>>;
      try { verified = await verifyPptx(parseSource(j.source, j.settings.mode), bytes); }
      catch { return reply.code(409).send({ error: "EXPORT_CORRUPTED" }); }
      if (!verified.passed)
        return reply.code(409).send({ error: "EXPORTED_TEXT_MISMATCH" });
      reply
        .header("Cache-Control", "private, no-store")
        .header(
          "Content-Disposition",
          projectDownloadHeader((await repo.getProject(j.projectId, req.user!.id))?.name, "pptx"),
        )
        .type(
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        );
      return bytes;
    },
  );
  // Owner-scoped, source-grounded speaker notes; no additional provider request.
  app.get<{ Params: { id: string } }>(
    "/api/generations/:id/notes",
    { preHandler: auth },
    async (req, reply) => {
      const j = await repo.job(req.params.id, req.user!.id);
      if (!j) return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
      if (j.status !== "ready" || !j.scene || !j.report?.passed || !j.report.exportVerified)
        return reply.code(409).send({ error: "EXPORT_NOT_READY" });
      const project = await repo.getProject(j.projectId, req.user!.id);
      if (!project || project.sourceHash !== j.sourceHash)
        return reply.code(409).send({ error: "SOURCE_CHANGED" });
      const doc = parseSource(j.source, j.settings.mode);
      return reply
        .header("Cache-Control", "private, no-store")
        .header("Content-Disposition", 'attachment; filename="presenter-notes.txt"')
        .type("text/plain; charset=utf-8")
        .send(notesTranscript(doc, j.scene));
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/generations/:id/pdf",
    { preHandler: auth },
    async (req, reply) => {
      const j = await repo.job(req.params.id, req.user!.id);
      if (!j) return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
      if (j.status !== "ready" || j.preview !== "rendered" || !j.report?.passed)
        return reply.code(409).send({ error: "PDF_NOT_READY" });
      let bytes: Buffer;
      try {
        bytes = await fs.readFile(path.join(generationDirectory(cfg.root, j), "presentation.pdf"));
      } catch {
        return reply.code(409).send({ error: "PDF_NOT_READY" });
      }
      reply.type("application/pdf").header(
        "Content-Disposition", projectDownloadHeader((await repo.getProject(j.projectId, req.user!.id))?.name, "pdf"),
      );
      return bytes;
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/generations/:id/validation",
    { preHandler: auth },
    async (req, reply) => {
      const job = await repo.job(req.params.id, req.user!.id);
      if (!job) return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
      if (
        job.status !== "ready" ||
        !job.report?.passed ||
        !job.report.exportVerified
      )
        return reply.code(409).send({ error: "EXPORT_NOT_READY" });
      const file = path.join(generationDirectory(cfg.root, job), "presentation.pptx");
      let verified: Awaited<ReturnType<typeof verifyPptx>>;
      try {
        verified = await verifyPptx(parseSource(job.source, job.settings.mode), await fs.readFile(file));
      } catch {
        return reply.code(409).send({ error: "EXPORT_CORRUPTED" });
      }
      if (!verified.passed)
        return reply.code(409).send({ error: "EXPORTED_TEXT_MISMATCH" });
      reply
        .header(
          "Content-Disposition",
          projectDownloadHeader((await repo.getProject(job.projectId, req.user!.id))?.name, "validation"),
        )
        .type("application/json");
      return {
        ...verified,
        quality: job.report.quality,
        generationId: job.id,
        verifiedAt: new Date().toISOString(),
      };
    },
  );
  app.get<{ Params: { id: string; index: string } }>(
    "/api/generations/:id/preview/:index",
    { preHandler: auth },
    async (req, reply) => {
      const j = await repo.job(req.params.id, req.user!.id);
      if (!j || j.preview !== "rendered" || j.status !== "ready")
        return reply.code(404).send({ error: "PREVIEW_NOT_FOUND" });
      const n = Number(req.params.index);
      if (!Number.isInteger(n) || n < 0 || n >= j.scene!.slides.length)
        return reply.code(404).send({ error: "PREVIEW_NOT_FOUND" });
      reply.header("Cache-Control", "private, no-store").type("image/png");
      return await fs.readFile(
        path.join(generationDirectory(cfg.root, j), `preview-${n}.png`),
      );
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/generations/:id/image",
    { preHandler: auth },
    async (req, reply) => {
      const j = await repo.job(req.params.id, req.user!.id);
      if (!j || !j.settings.assetId)
        return reply.code(404).send({ error: "IMAGE_NOT_FOUND" });
      reply.type("image/jpeg");
      return fs.readFile(
        path.join(cfg.root, "assets", j.projectId, j.settings.assetId + ".jpg"),
      );
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/projects/:id",
    { preHandler: auth },
    async (req, reply) => {
      const p = await repo.getProject(req.params.id, req.user!.id);
      if (!p) return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
      const jobs = await repo.jobsForProject(p.id, p.ownerId);
      if (jobs.some((j) => !terminal.includes(j.status)))
        return reply.code(409).send({ error: "GENERATION_ACTIVE" });
      await repo.deleteProject(p.id, p.ownerId);
      await fs.rm(path.join(cfg.root, "exports", p.id), {
        recursive: true,
        force: true,
      });
      await fs.rm(path.join(cfg.root, "assets", p.id), {
        recursive: true,
        force: true,
      });
      return { ok: true };
    },
  );
  app.setErrorHandler((unknownError, req, reply) => {
    const error = unknownError as Error & { statusCode?: number };
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: "INVALID_INPUT",
        message: "Please check the fields and try again.",
      });
    const msg = error.message || "SERVER_ERROR";
    const known = [
      "EMPTY_SOURCE",
      "SOURCE_TOO_LARGE",
      "SOURCE_WORD_LIMIT",
      "BINARY_SOURCE",
      "FILE_TYPE",
      "TABLE_COLUMNS",
      "PLAN_COVERAGE",
      "PLAN_SCHEMA",
      "TABLE_TOO_WIDE",
      "TABLE_CELL_TOO_LONG",
      "SLIDE_LIMIT",
      "LAYOUT_BOUNDS",
      "SOURCE_FIDELITY_FAILED",
      "CREATIVE_PROMPT_REQUIRED",
      "CREATIVE_SLIDE_COUNT",
      "CREATIVE_SOURCE_LIMIT",
      "CREATIVE_INVALID_SCENE",
    ];
    if (known.includes(msg)) return reply.code(400).send({ error: msg });
    if (msg === "CREATIVE_READ_ONLY") return reply.code(403).send({ error: msg });
    if (msg === "PROJECT_CONFLICT") return reply.code(409).send({ error: msg });
    if (msg === "PROJECT_NOT_FOUND") return reply.code(404).send({ error: msg });
    if (msg === "GENERATION_ACTIVE") return reply.code(409).send({ error: msg });
    if (msg === "TOO_MANY_ACTIVE_JOBS") return reply.code(429).send({ error: msg });
    if (msg === "QUOTA_EXCEEDED")
      return reply.code(429).header("Retry-After", "86400").send({ error: msg });
    if (msg === "AI_NOT_CONFIGURED") return reply.code(503).send({ error: msg });
    if (msg === "AI_DRAFT_TIMEOUT") return reply.code(504).send({ error: msg });
    if (msg === "AI_RATE_LIMITED") return reply.code(429).send({ error: msg });
    if (msg === "AI_DRAFT_UNAVAILABLE") return reply.code(502).send({ error: msg });
    if (msg === "AI_DRAFT_INVALID") return reply.code(502).send({ error: msg });
    if (error.statusCode === 429)
      return reply.code(429).send({ error: "RATE_LIMITED" });
    console.error(
      JSON.stringify({
        event: "request_failed",
        requestId: req.id,
        method: req.method,
        route: req.routeOptions.url,
        code: /^[A-Z0-9_]{1,60}$/.test((error as any).code || "")
          ? (error as any).code
          : "INTERNAL_ERROR",
      }),
    );
    return reply
      .code(error.statusCode && error.statusCode < 500 ? error.statusCode : 500)
      .send({
        error: "REQUEST_FAILED",
        requestId: req.id,
        message: "The request could not be completed.",
      });
  });
  try {
    await fs.access(path.resolve("dist/index.html"));
    await app.register(staticFiles, {
      root: path.resolve("dist"),
      prefix: "/",
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/") || req.url === "/admin" || req.url.startsWith("/admin/")
        ? reply.code(404).send({ error: "NOT_FOUND" })
        : reply.sendFile("index.html"),
    );
  } catch {}
  app.addHook("onClose", async () => {
    await runner.close();
    rateRedis?.disconnect();
    await repo.close();
  });
  return { app, repo, runner };
}
