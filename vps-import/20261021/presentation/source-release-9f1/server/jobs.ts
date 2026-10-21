import { createCreativeScene } from "../core/creative.js";
import { trackedFetch } from "./provider-usage.js";
import { reserveUsage } from "./usage.js";
import type { Scene } from "../core/types.js";
import { randomUUID } from "node:crypto";
import { generationDirectory } from "./artifacts.js";
import fs from "node:fs/promises";
import path from "node:path";
import { Queue } from "bullmq";
import { safeErrorCode } from "./errors.js";
import { Repository, type JobRecord } from "./repository.js";
import type { Config } from "./config.js";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { aiPlan } from "../core/ai.js";
import { buildScene } from "../core/layout.js";
import { exportPptx } from "../core/export.js";
import { renderPptx } from "./render.js";
export function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    username: u.username || undefined,
    db: Number(u.pathname.slice(1) || 0),
    maxRetriesPerRequest: 2,
    connectTimeout: 5000,
    enableOfflineQueue: false,
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
async function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("QUEUE_UNAVAILABLE")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function processJob(repo: Repository, cfg: Config, id: string) {
  const started = Date.now();
  const leaseToken = randomUUID();
  let job = await repo.job(id);
  if (
    !job ||
    job.status === "cancelled" ||
    job.status === "ready" ||
    job.status === "failed"
  )
    return;
  job = await repo.claimJob(id, leaseToken);
  if (!job) {
    const current = await repo.job(id);
    if (current && !["ready", "failed", "cancelled"].includes(current.status))
      throw new Error("JOB_LEASE_BUSY");
    return;
  }
  job = { ...job, artifactId: leaseToken };
  let leaseLost = false;
  let heartbeatTail = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatTail = heartbeatTail.then(async () => {
      if (!(await repo.renewLease(id, leaseToken))) leaseLost = true;
    }).catch(() => { leaseLost = true; });
  }, 10000);
  heartbeat.unref();
  const persist = async (
    status: JobRecord["status"],
    progress: number,
    stage: string,
  ) => {
    const current = await repo.job(id);
    if (leaseLost || !current || ["cancelled", "ready", "failed"].includes(current.status))
      throw new Error("JOB_CANCELLED");
    job = { ...job!, status, progress, stage };
    if (!(await repo.saveLeasedJob(current, job, leaseToken)))
      throw new Error("JOB_CANCELLED");
  };
  const dir = generationDirectory(cfg.root, job);
  try {
    await persist("planning", 15, "Selecting a layout");
    const doc = parseSource(job.source, job.settings.mode);
    let plan = job.plan || rulesPlan(doc, job.settings.images);
    const model = "gpt-6-luna";
    const aiStarted = Date.now();
    let customScene: Scene | undefined;
    if (job.settings.creationMode === "creative") {
      if (job.plan && job.scene) { plan = job.plan; customScene = job.scene; }
      else {
        if (!cfg.key) throw new Error("OPENAI_NOT_CONFIGURED");
        const custom = await createCreativeScene(doc, job.settings.creativePrompt || "", {
          key: cfg.key, theme: job.settings.theme, quality: job.settings.creativeQuality, motion: job.settings.motion,
          features: { assets: job.settings.creativeAssets, slideCount: job.settings.creativeSlideCount, interactiveLinks: job.settings.interactiveLinks },
          fetcher: trackedFetch(repo, job.ownerId, "creative-design", id, "gpt-6-luna"),
          onAutoRepair: fixes => {
            console.info(JSON.stringify({ event: "creative_local_repair", fixes }));
          },
          onValidationFailure: issue => {
            // Only fixed reason codes, slide numbers and allowlisted schema paths.
            // Never print source text, prompts, API keys or model output.
            console.error(JSON.stringify({ event: "creative_validation", attempt: issue.attempt,
              reason: issue.reason, ...(issue.slide != null ? { slide: issue.slide } : {}),
              ...(issue.path ? { path: issue.path } : {}) }));
          },
          onRepair: async () => {
            const current = await repo.job(id);
            if (!current || ["ready", "failed", "cancelled"].includes(current.status) ||
              leaseLost || !(await repo.renewLease(id, leaseToken))) throw new Error("JOB_CANCELLED");
            await reserveUsage(repo, cfg, job!.ownerId, "ai");
          },
        });
        plan = custom.plan; customScene = custom.scene;
        plan.ai!.durationMs = Date.now() - aiStarted;
      }
    } else if (job.plan && (job.kind === "design" || !job.plan.ai)) {
      plan = {
        ...plan,
        ai: { requested: false, outcome: "manual", durationMs: 0 },
      };
    } else if (!job.plan && job.settings.useAI) {
      try {
        if (!cfg.key) throw new Error("OPENAI_NOT_CONFIGURED");
        plan = await aiPlan(doc, {
          fetcher: trackedFetch(repo, job.ownerId, "template-layout", id),
          key: cfg.key,
          model,
          images: job.settings.images,
          intent: job.settings.intent,
          signal: AbortSignal.timeout(60000),
        });
        plan.ai = {
          requested: true,
          outcome: "used",
          model,
          durationMs: Date.now() - aiStarted,
          inputTokens: plan.usage?.input,
          outputTokens: plan.usage?.output,
        };
      } catch (e) {
        const reason =
          e instanceof DOMException &&
          ["TimeoutError", "AbortError"].includes(e.name)
            ? "OPENAI_TIMEOUT"
            : safeErrorCode(e, "OPENAI_NETWORK");
        plan = {
          ...rulesPlan(doc, job.settings.images),
          warning:
            "AI layout was unavailable (" +
            reason +
            "). Your original wording was preserved by the layout engine.",
          ai: {
            requested: true,
            outcome: "fallback",
            model,
            reason,
            durationMs: Date.now() - aiStarted,
          },
        };
      }
    } else if (!job.plan) plan.ai = { requested: false, outcome: "disabled", durationMs: 0 };
    job = { ...job!, plan, ...(customScene ? { scene: customScene } : {}) };
    await persist("building", 45, "Arranging original text");
    const scene = customScene || buildScene(doc, plan, job.settings.theme, job.settings);
    const imagePaths: Record<string, string> = {};
    for (const slide of plan.slides)
      if (slide.imageId && slide.imageId !== "city")
        imagePaths[slide.imageId] = path.join(
          cfg.root,
          "assets",
          job.projectId,
          slide.imageId + ".jpg",
        );
    if (job.settings.assetId) {
      imagePaths.custom = path.join(
        cfg.root,
        "assets",
        job.projectId,
        job.settings.assetId + ".jpg",
      );
      for (const slide of scene.slides)
        for (const o of slide.objects)
          if (o.type === "image" && o.asset === "city") o.asset = "custom";
    }
    job = { ...job!, plan, scene };
    await persist("verifying", 65, "Checking every source block");
    const { bytes, report } = await exportPptx(doc, scene, imagePaths, job.settings.motion);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, "presentation.pptx");
    await fs.writeFile(file, bytes, { mode: 0o600 });
    await fs.writeFile(
      path.join(dir, "validation.json"),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    );
    job = { ...job!, report };
    let preview: JobRecord["preview"] = "layout";
    let previewWarning: string | undefined;
    if (cfg.render) {
      await persist("rendering", 82, "Rendering your presentation");
      try {
        await renderPptx(file, dir, cfg, scene.slides.length);
        preview = "rendered";
      } catch {
        previewWarning =
          "Rendered preview is unavailable. This preview shows the layout model; check the exported file in PowerPoint.";
      }
    } else
      previewWarning =
        "This preview shows the layout model. Final rendering is disabled on this server.";
    job = {
      ...job!,
      preview,
      previewWarning,
      durationMs: Date.now() - started,
    };
    await persist("ready", 100, "Ready to export");
    await repo.recordJobEvent(job!).catch(() =>
      console.error(
        JSON.stringify({
          event: "metrics_write",
          code: "METRICS_UNAVAILABLE",
        }),
      ),
    );
  } catch (e) {
    const current = await repo.job(id);
    if (current && !["cancelled", "ready", "failed"].includes(current.status))
      await repo.saveLeasedJob(current, {
        ...current,
        status: "failed",
        progress: 0,
        stage: "Generation failed",
        error: safeErrorCode(e),
        durationMs: Date.now() - started,
      }, leaseToken);
    await fs.rm(dir, { recursive: true, force: true });
    const final = await repo.job(id);
    if (final) await repo.recordJobEvent(final);
  } finally {
    clearInterval(heartbeat);
    await heartbeatTail;
    await repo.releaseLease(id, leaseToken).catch(() => {});
  }
}
export class JobRunner {
  private queue?: Queue;
  private running = false;
  private stopped = false;
  private pending: string[] = [];
  private reconcileTimer?: ReturnType<typeof setInterval>;
  private reconciling = false;
  constructor(
    private repo: Repository,
    private cfg: Config,
    queueName = "verbatim-generate",
  ) {
    if (cfg.redis)
      this.queue = new Queue(queueName, {
        connection: redisConnection(cfg.redis),
      });
  }
  async init() {
    if (this.queue) {
      this.queue.on("error", () =>
        console.error(
          JSON.stringify({
            event: "queue_connection",
            code: "QUEUE_UNAVAILABLE",
          }),
        ),
      );
    }
    if (this.queue) {
      this.reconcileTimer = setInterval(() => { void this.reconcile(); }, 15000);
      this.reconcileTimer.unref();
      void this.reconcile();
    }
    if (!this.queue) {
      await this.repo.interruptJobs();
      for (const j of await this.repo.queued()) this.pending.push(j.id);
      this.drain();
    }
  }
  private async reconcile() {
    if (!this.queue || this.reconciling || this.stopped) return;
    this.reconciling = true;
    try {
      for (const id of await this.repo.recoverableJobs()) {
        if (this.stopped) break;
        const queued = await bounded(this.queue.getJob(id), 5000);
        if (queued) {
          const state = await bounded(queued.getState(), 5000);
          if (state === "failed") await bounded(queued.retry(), 5000);
          else if (state === "completed") { await bounded(queued.remove(), 5000); await this.enqueue(id); }
        } else await this.enqueue(id);
      }
    } catch {
      if (!this.stopped) console.error(JSON.stringify({ event: "queue_reconcile", code: "QUEUE_UNAVAILABLE" }));
    } finally { this.reconciling = false; }
  }
  async enqueue(id: string) {
    if (this.queue) {
      await bounded(this.queue.waitUntilReady(), 5000);
      await bounded(
        this.queue.add(
          "generate",
          { id },
          { jobId: id, attempts: 6, backoff: { type: "fixed", delay: 30000 }, removeOnComplete: 100, removeOnFail: 100 },
        ),
        5000,
      );
    } else {
      this.pending.push(id);
      this.drain();
    }
  }
  private async drain() {
    if (this.running || this.stopped) return;
    this.running = true;
    while (this.pending.length && !this.stopped) {
      const id = this.pending.shift()!;
      await processJob(this.repo, this.cfg, id);
    }
    this.running = false;
  }
  async close() {
    this.stopped = true;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    while (this.reconciling) await new Promise(r => setTimeout(r, 20));
    await this.queue?.close();
    while (this.running) await new Promise((r) => setTimeout(r, 20));
  }
}
