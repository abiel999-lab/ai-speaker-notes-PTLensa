import {snapshotDocumentAssets} from './document-workflow.js';
import {isFullCopy,loadDocumentPlan} from './document-plan.js';
import { createQuote,acceptQuote,usesPlatform } from "./platform-generation.js";
import { snapshotCoverBranding } from "./cover-logo-routes.js";
import { validateCreativeRequest } from "../core/creative.js";
import { registerTemplateText } from "./template-text.js";
import { trackedFetch } from "./provider-usage.js";
import { reserveUsage, usageLimits } from "./usage.js";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { settingsSchema, manualPlanSchema, } from "./contracts.js";
import { parseSource } from "../core/source.js";
import { validatePlan } from "../core/planner.js";
import { buildScene } from "../core/layout.js";
import { validateScene } from "../core/fidelity.js";
import { suggestSlideLayout } from "../core/slide-assistant.js";
export function registerGenerationRoutes(app, repo, runner, cfg) {
    registerTemplateText(app, repo, runner, cfg);
    const deterministic = async (project,settings) => isFullCopy(project.workspace) ||
        (project.workspace?.kind==='document' && (await loadDocumentPlan(project,cfg.root,settings))?.version===2);
    app.post('/api/projects/:id/quote',async(req,reply)=>{
        const p=await repo.getProject(req.params.id,req.user.id);if(!p)return reply.code(404).send({error:'PROJECT_NOT_FOUND'});
        const body=z.object({settings:settingsSchema}).strict().parse(req.body);
        body.settings.documentMode=p.workspace?.kind==='document';
        if(await deterministic(p,body.settings)){body.settings.useAI=false;body.settings.model='gpt-6-luna';}
        else if(body.settings.creationMode==='creative')body.settings.useAI=true;
        return createQuote(p,body.settings,req.user,cfg);
    });
    async function assetExists(projectId, settings, plan) {
        const ids = new Set();
        if (settings.assetId)
            ids.add(settings.assetId);
        if(settings.coverAssetId)ids.add(settings.coverAssetId);
        for (const asset of settings.creativeAssets || [])
            ids.add(asset.id);
        for (const id of settings.coverLogos || [])
            await fs.access(path.join(cfg.root, "assets", projectId, id + ".png"));
        for (const slide of plan?.slides || [])
            if (slide.imageId && slide.imageId !== "city")
                ids.add(slide.imageId);
        for (const id of ids)
            await fs.access(path.join(cfg.root, "assets", projectId, id + ".jpg"));
    }
    async function queue(p, settings, reply, manual, acceptedQuote, derived=false) {
        try {
            await assetExists(p.id, settings, manual);
        }
        catch {
            return reply.code(400).send({ error: "IMAGE_NOT_FOUND" });
        }
        const user = usesPlatform(cfg) && !derived ? await repo.userById(p.ownerId) : null;
        if (usesPlatform(cfg) && !derived && !user) throw Error('SIGN_IN_REFRESH_REQUIRED');
        const billing = user ? acceptQuote(acceptedQuote,p,settings,user,cfg) : undefined;
        const coverBranding = await snapshotCoverBranding(repo, cfg, p, settings);
        const documentAssets=await snapshotDocumentAssets(p,cfg.root);
        const documentPlan=await loadDocumentPlan(p,cfg.root,settings);
        if(documentPlan){
            const actual=new Map(documentAssets.map(a=>[a.assetId,a]));
            if(actual.size!==documentPlan.assets.length||documentPlan.assets.some(a=>actual.get(a.assetId)?.hash!==a.hash||actual.get(a.assetId)?.sourceId!==a.sourceId))throw Error('DOCUMENT_PLAN_REQUIRED');
        }
        settings.documentMode=p.workspace?.kind==='document';
        const job = {
            ...(settings.documentMode?{documentAssets,documentPlan}:{}),
            ...(coverBranding ? { coverBranding } : {}),
            ...(billing ? { billing } : {}),
            id: randomUUID(),
            projectId: p.id,
            ownerId: p.ownerId,
            source: p.source,
            sourceHash: p.sourceHash,
            status: "queued",
            progress: 0,
            stage: "Waiting to start",
            settings,
            createdAt: new Date().toISOString(),
            preview: "none",
            kind: manual ? "design" : "generation",
            ...(manual ? { plan: manual } : {}),
        };
        try {
            await repo.admitJob(job, cfg.oidc ? usageLimits(cfg) : undefined, !manual && settings.useAI && !!cfg.key);
        }
        catch (e) {
            if (e.code === "23505" ||
                (e instanceof Error &&
                    e.message.startsWith("UNIQUE constraint failed: generations.project_id")))
                return reply.code(409).send({ error: "GENERATION_ACTIVE" });
            throw e;
        }
        try {
            await runner.enqueue(job.id);
        }
        catch {
            // The committed queued row is the outbox. A reconciler retries delivery.
            // Never mark a job failed here: Redis may already have delivered it.
            console.error(JSON.stringify({ event: "queue_delivery", code: "QUEUE_UNAVAILABLE" }));
        }
        return reply
            .code(202)
            .send({ generation: { id: job.id, status: job.status } });
    }
    app.post("/api/projects/:id/generate", { config: { rateLimit: { max: 12, timeWindow: "1 hour" } } }, async (req, reply) => {
        const p = await repo.getProject(req.params.id, req.user.id);
        if (!p)
            return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
        const body = z
            .object({ settings: settingsSchema, plan: manualPlanSchema.optional(), acceptedQuote:z.string().max(5000).optional() })
            .strict()
            .parse(req.body);
        body.settings.documentMode=p.workspace?.kind==='document';
        if (await deterministic(p,body.settings)) {
            if (body.plan) throw Error("CREATIVE_READ_ONLY");
            body.settings.useAI=false;
            body.settings.model="gpt-6-luna";
        } else if (body.settings.creationMode === "creative") {
            if (body.plan)
                throw new Error("CREATIVE_READ_ONLY");
            if (!cfg.key)
                return reply.code(503).send({ error: "AI_NOT_CONFIGURED" });
            if (!body.settings.creativePrompt?.trim())
                throw new Error("CREATIVE_PROMPT_REQUIRED");
            validateCreativeRequest(parseSource(p.source, body.settings.mode), { slideCount: body.settings.creativeSlideCount });
            body.settings.useAI = true;
        }
        if (body.plan)
            validatePlan(parseSource(p.source, body.settings.mode), body.plan);
        return queue(p, body.settings, reply, body.plan,body.acceptedQuote);
    });
    async function readyContext(req, reply) {
        const job = await repo.job(req.params.id, req.user.id);
        if (!job)
            return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
        if (job.settings.creationMode === "creative")
            throw new Error("CREATIVE_READ_ONLY");
        if (job.status !== "ready" || !job.plan)
            return reply.code(409).send({ error: "EXPORT_NOT_READY" });
        const p = await repo.getProject(job.projectId, req.user.id);
        if (!p || p.sourceHash !== job.sourceHash)
            return reply.code(409).send({ error: "SOURCE_CHANGED" });
        return { job, p };
    }
    async function designInput(req, reply) {
        const context = await readyContext(req, reply);
        if (reply.sent || !context || !("job" in context))
            return;
        const body = z
            .object({ settings: settingsSchema, plan: manualPlanSchema })
            .strict()
            .parse(req.body);
        if (body.settings.creationMode === "creative")
            throw new Error("CREATIVE_READ_ONLY");
        if (body.settings.mode !== context.job.settings.mode)
            return reply.code(409).send({ error: "SOURCE_CHANGED" });
        const { job, p } = context;
        validatePlan(parseSource(job.source, job.settings.mode), body.plan);
        try {
            await assetExists(p.id, body.settings, body.plan);
        }
        catch {
            return reply.code(400).send({ error: "IMAGE_NOT_FOUND" });
        }
        return { job, p, body };
    }
    app.post("/api/generations/:id/slide-suggestion", { config: { rateLimit: { max: 60, timeWindow: "1 hour" } } }, async (req, reply) => {
        const context = await readyContext(req, reply);
        if (reply.sent || !context || !("job" in context))
            return;
        const body = z
            .object({
            settings: settingsSchema,
            plan: manualPlanSchema,
            slideId: z.string().min(1).max(80),
        })
            .strict()
            .parse(req.body);
        if (body.settings.mode !== context.job.settings.mode)
            return reply.code(409).send({ error: "SOURCE_CHANGED" });
        const doc = parseSource(context.job.source, context.job.settings.mode);
        validatePlan(doc, body.plan);
        const slide = body.plan.slides.find((candidate) => candidate.id === body.slideId);
        if (!slide)
            return reply.code(400).send({ error: "SLIDE_NOT_FOUND" });
        if (cfg.key)
            await reserveUsage(repo, cfg, req.user.id, "ai");
        const suggestion = await suggestSlideLayout(doc, slide, {
            fetcher: trackedFetch(repo, req.user.id, "slide-suggestion", context.job.id),
            key: cfg.key,
            model: "gpt-6-luna",
            images: body.settings.images,
            signal: AbortSignal.timeout(30000),
        });
        const candidate = {
            engine: "rules",
            slides: body.plan.slides.map((item) => item.id === slide.id
                ? {
                    ...item,
                    layout: suggestion.layout,
                    imageId: suggestion.imageId,
                }
                : item),
        };
        validatePlan(doc, candidate);
        return { suggestion };
    });
    app.post("/api/generations/:id/design-preview", { config: { rateLimit: { max: 180, timeWindow: "1 minute" } } }, async (req, reply) => {
        const input = await designInput(req, reply);
        if (reply.sent || !input || !("body" in input))
            return;
        const doc = parseSource(input.job.source, input.job.settings.mode);
        const scene = buildScene(doc, input.body.plan, input.body.settings.theme, input.body.settings);
        if (input.body.settings.assetId)
            for (const slide of scene.slides)
                for (const object of slide.objects)
                    if (object.type === "image" && object.asset === "city")
                        object.asset = "custom";
        const report = validateScene(doc, scene);
        if (!report.passed)
            throw new Error("SOURCE_FIDELITY_FAILED");
        return { scene, report };
    });
    app.post("/api/generations/:id/design", { config: { rateLimit: { max: 120, timeWindow: "1 hour" } } }, async (req, reply) => {
        const input = await designInput(req, reply);
        if (reply.sent || !input || !("body" in input))
            return;
        return queue(input.p, { ...input.body.settings, useAI: false }, reply, input.body.plan,undefined,true);
    });
}
