import{applyCoverRole}from'../core/cover-role.js';
import{resolvePresentationSource}from'../core/source-language.js';
import {buildFullCopyScene,parseFullCopySource} from '../core/full-copy.js';
import {buildDocumentScene} from '../core/document-scene.js';
import{composeTechnicalDocument}from'../core/document-composition.js';
import{withVisualCover}from'../core/visual-cover.js';
import { reserveJobBilling,settleJobBilling,refundJobBilling,reconcileBilling,safeBillingScene } from "./platform-generation.js";
import { enrichAutomaticVisuals } from "../core/automatic-visuals.js";
import { createPhotoResolver } from "./visual-photo-provider.js";
import { createCreativeScene } from "../core/creative.js";
import { trackedFetch } from "./provider-usage.js";
import { reserveUsage } from "./usage.js";
import { randomUUID } from "node:crypto";
import { generationDirectory } from "./artifacts.js";
import fs from "node:fs/promises";
import path from "node:path";
import { Queue } from "bullmq";
import { safeErrorCode } from "./errors.js";
import { parseSource } from "../core/source.js";
import { rulesPlan } from "../core/planner.js";
import { aiPlan } from "../core/ai.js";
import { buildScene } from "../core/layout.js";
import { exportPptx } from "../core/export.js";
import { renderPptx } from "./render.js";
import { auditRenderedPresentation, unavailableRenderQuality } from "./render-quality.js";
export function redisConnection(url) {
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
async function bounded(work, timeoutMs) {
    let timer;
    try {
        return await Promise.race([
            work,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("QUEUE_UNAVAILABLE")), timeoutMs);
            }),
        ]);
    }
    finally {
        clearTimeout(timer);
    }
}
export async function processJob(repo, cfg, id) {
    const started = Date.now();
    const leaseToken = randomUUID();
    let job = await repo.job(id);
    if (!job ||
        job.status === "cancelled" ||
        job.status === "ready" ||
        job.status === "failed")
        return;
    job = await repo.claimJob(id, leaseToken);
    if (!job) {
        const current = await repo.job(id);
        if (current && !["ready", "failed", "cancelled"].includes(current.status))
            throw new Error("JOB_LEASE_BUSY");
        return;
    }
    job = { ...job, artifactId: job.billing?.phase === "settling" ? job.artifactId : leaseToken };
    let leaseLost = false;
    let heartbeatTail = Promise.resolve();
    const heartbeat = setInterval(() => {
        heartbeatTail = heartbeatTail.then(async () => {
            if (!(await repo.renewLease(id, leaseToken)))
                leaseLost = true;
        }).catch(() => { leaseLost = true; });
    }, 10000);
    heartbeat.unref();
    const persist = async (status, progress, stage) => {
        const current = await repo.job(id);
        if (leaseLost || !current || ["cancelled", "ready", "failed"].includes(current.status))
            throw new Error("JOB_CANCELLED");
        job = { ...job, status, progress, stage };
        if (!(await repo.saveLeasedJob(current, job, leaseToken)))
            throw new Error("JOB_CANCELLED");
    };
    const dir = generationDirectory(cfg.root, job);
    let generationStarted = false;
    try {
        if(job.billing?.phase==='settling'){
            await fs.access(path.join(generationDirectory(cfg.root,job),'presentation.pptx'));
            job=await settleJobBilling(repo,cfg,job);await persist('ready',100,'Ready to export');await repo.completeBillingRefund(job.id);return;
        }
        job=await reserveJobBilling(repo,cfg,job);
        await persist("planning", 15, "Selecting a layout");
        generationStarted = true;
        if(job.settings.presentationLanguage)await persist("planning", 12, "Applying presentation language");
        const languageSource=job.settings.documentMode?{source:job.source}:await resolvePresentationSource(job,{key:cfg.key,fetcher:trackedFetch(repo,job.ownerId,"presentation-language",id,job.billing?.model||job.settings.model||"gpt-6-luna")});
        if(languageSource.cache){job={...job,presentationLanguageSource:languageSource.cache};await persist("planning",15,"Selecting a layout");}
        const fullCopy=job.documentPlan?.version===2;
        const doc = fullCopy?parseFullCopySource(languageSource.source):parseSource(languageSource.source, job.settings.mode);
        if(!fullCopy)doc.presentationLanguage=job.settings.presentationLanguage;
        let plan = job.plan || (fullCopy?{engine:"rules",slides:[]}:rulesPlan(doc, job.settings.images));
        const model = job.billing?.model || job.settings.model || "gpt-6-luna";
        const aiStarted = Date.now();
        let customScene;
        if(job.settings.documentMode){
            if(!job.documentPlan)throw Error('DOCUMENT_PLAN_REQUIRED');
            customScene=fullCopy?buildFullCopyScene(doc,job.documentPlan.assets,job.settings):buildDocumentScene(doc,job.documentPlan,job.settings);
            if(fullCopy)plan.slides=customScene.slides.map(({id,blockIds,layout})=>({id,blockIds,layout,imageId:null}));
            plan.ai={requested:!fullCopy,outcome:fullCopy?'disabled':'used',model,durationMs:0};
        }
        else if (job.settings.creationMode === "creative") {
            if (job.plan && job.scene) {
                plan = job.plan;
                customScene = job.scene;
            }
            else {
                if (!cfg.key)
                    throw new Error("OPENAI_NOT_CONFIGURED");
                const custom = await createCreativeScene(doc, job.settings.creativePrompt || "", {
                    key: cfg.key, model, theme: job.settings.theme, quality: job.settings.creativeQuality, motion: job.settings.motion,
                    reasoningEffort: job.settings.reasoningEffort,
                    features: { assets: job.settings.creativeAssets, slideCount: job.settings.creativeSlideCount, interactiveLinks: job.settings.interactiveLinks },
                    fetcher: trackedFetch(repo, job.ownerId, "creative-design", id, model),
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
                            leaseLost || !(await repo.renewLease(id, leaseToken)))
                            throw new Error("JOB_CANCELLED");
                        await reserveUsage(repo, cfg, job.ownerId, "ai");
                    },
                });
                plan = custom.plan;
                customScene = custom.scene;
                plan.ai.durationMs = Date.now() - aiStarted;
            }
        }
        else if (job.plan && (job.kind === "design" || !job.plan.ai)) {
            plan = {
                ...plan,
                ai: { requested: false, outcome: "manual", durationMs: 0 },
            };
        }
        else if (!job.plan && job.settings.useAI) {
            try {
                if (!cfg.key)
                    throw new Error("OPENAI_NOT_CONFIGURED");
                plan = await aiPlan(doc, {
                    fetcher: trackedFetch(repo, job.ownerId, "template-layout", id, model),
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
            }
            catch (e) {
                const reason = e instanceof DOMException &&
                    ["TimeoutError", "AbortError"].includes(e.name)
                    ? "OPENAI_TIMEOUT"
                    : safeErrorCode(e, "OPENAI_NETWORK");
                plan = {
                    ...rulesPlan(doc, job.settings.images),
                    warning: "AI layout was unavailable (" +
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
        }
        else if (!job.plan)
            plan.ai = { requested: false, outcome: "disabled", durationMs: 0 };
        job = { ...job, plan, ...(customScene ? { scene: customScene } : {}) };
        await persist("building", 45, "Arranging original text");
        let scene = customScene || buildScene(doc, plan, job.settings.theme, job.settings);
        if(!job.settings.documentMode){
            if(job.settings.creationMode==="creative")scene=withVisualCover(doc,scene,job.settings.creativeSlideCount);
            if(job.billing && scene.slides.length>job.billing.maxSlides)scene=safeBillingScene(languageSource.source,job.settings);
            scene=applyCoverRole(scene,job.settings);
        }
        if(job.billing && scene.slides.length>job.billing.maxSlides)throw Error('BILLING_SLIDE_COUNT_EXCEEDED');
        const imagePaths = {};
        for (const slide of plan.slides)
            if (slide.imageId && slide.imageId !== "city")
                imagePaths[slide.imageId] = path.join(cfg.root, "assets", job.projectId, slide.imageId + ".jpg");
        if (job.settings.assetId) {
            imagePaths.custom = path.join(cfg.root, "assets", job.projectId, job.settings.assetId + ".jpg");
            for (const slide of scene.slides)
                for (const o of slide.objects)
                    if (o.type === "image" && o.asset === "city")
                        o.asset = "custom";
        }
        let visualSummary;
        if (!job.settings.documentMode && job.settings.creationMode === "creative" && !job.visualsProcessed) {
            await persist("building", 52, "Selecting relevant visuals");
            const photos = createPhotoResolver({root: cfg.root, projectId: job.projectId});
            const enriched = await enrichAutomaticVisuals(doc, scene, {resolvePhoto: photos.resolve});
            scene = enriched.scene; visualSummary = enriched.summary;
            Object.assign(imagePaths, photos.paths);
        }
        job = { ...job, plan, scene, ...(job.settings.creationMode === "creative" ? {visualsProcessed: true} : {}) };
        for (const s of scene.slides) for (const o of s.objects)
            if(o.type === 'image' && /^[0-9a-f-]{36}$/i.test(o.asset || ''))
                imagePaths[o.asset] = path.join(cfg.root, 'assets', job.projectId, o.asset + '.jpg');
        for(const[key,file]of Object.entries(imagePaths)){const png=file.replace(/\.jpg$/,'.image.png');if(png!==file)try{await fs.access(png);imagePaths[key]=png;}catch(error){if(error.code!=='ENOENT')throw error;}}
        await persist("verifying", 65, "Checking every source block");
        const branding = job.coverBranding ? { ...job.coverBranding,
            paths: Object.fromEntries((job.coverBranding.logos || []).map(logo => [logo.id, path.join(cfg.root, "assets", job.projectId, logo.id + ".png")])) } : undefined;
        const { bytes, report } = await exportPptx(doc, scene, imagePaths, job.settings.motion, branding);
        if(job.documentPlan?.recoveryCode) report.recovery={code:job.documentPlan.recoveryCode,retainedSource:true};
        if (visualSummary) report.automaticVisuals = visualSummary;
        await fs.mkdir(dir, { recursive: true });
        const file = path.join(dir, "presentation.pptx");
        await fs.writeFile(file, bytes, { mode: 0o600 });
        await fs.writeFile(path.join(dir, "validation.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
        job = { ...job, report };
        let preview = "layout";
        let previewWarning;
        if (cfg.render) {
            await persist("rendering", 82, "Rendering your presentation");
            try {
                await renderPptx(file, dir, cfg, scene.slides.length);
                preview = "rendered";
                // Render QA is advisory; incomplete Poppler extraction must never
                // discard a valid source-verified PowerPoint or retry paid Luna.
                try {
                    report.renderQuality = await auditRenderedPresentation(dir, scene);
                    if (report.renderQuality.status === "warning")
                        previewWarning = `Rendered-slide quality review flagged ${report.renderQuality.lowTextSlides} slide(s) with potentially missing text and ${report.renderQuality.nearBlankSlides} near-blank slide(s). Review the PowerPoint before presenting.`;
                }
                catch {
                    report.renderQuality = unavailableRenderQuality(scene.slides.length);
                }
            }
            catch {
                report.renderQuality = unavailableRenderQuality(scene.slides.length);
                previewWarning =
                    "Rendered preview is unavailable. This preview shows the layout model; check the exported file in PowerPoint.";
            }
        }
        else {
            report.renderQuality = unavailableRenderQuality(scene.slides.length);
            previewWarning =
                "This preview shows the layout model. Final rendering is disabled on this server.";
        }
        await fs.writeFile(path.join(dir, "validation.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
        if(job.documentPlan?.recoveryCode)previewWarning='The AI draft could not be prepared. This deck contains the original source wording in a readable layout.'+(previewWarning?' '+previewWarning:'');
        job = {
            ...job,
            preview,
            previewWarning,
            durationMs: Date.now() - started,
        };
        if(job.billing){job={...job,billing:{...job.billing,phase:'settling'}};await persist('verifying',96,'Finalizing credits');job=await settleJobBilling(repo,cfg,job);}
        await persist("ready", 100, "Ready to export");
        if(job.billing)await repo.completeBillingRefund(job.id);
        await repo.recordJobEvent(job).catch(() => console.error(JSON.stringify({
            event: "metrics_write",
            code: "METRICS_UNAVAILABLE",
        })));
    }
    catch (e) {
        console.error(JSON.stringify({event:'generation_failure',jobId:id,code:safeErrorCode(e),kind:e instanceof Error?e.name:'Unknown',internalCode:e instanceof Error&&/^[A-Z][A-Z0-9_]{2,80}$/.test(e.message)?e.message:'UNCLASSIFIED',frames:e instanceof Error?e.stack?.split('\n').slice(1,5).map(s=>s.replace(/\/app\//g,'').trim()):[]}));
        // A durable, already exported artifact must survive settlement transport failures.
        if(['settling','committed'].includes(job.billing?.phase))throw e;
        if (generationStarted && !leaseLost && safeErrorCode(e) !== 'JOB_CANCELLED') {
            try {
                const original = job.presentationLanguageSource?.source ?? job.source;
                const doc = parseFullCopySource(original);
                const imagePaths = {}, assets = [];
                for (const asset of job.documentAssets ?? []) {
                    const candidate = path.join(cfg.root,'assets',job.projectId,asset.assetId+'.image.png');
                    try { await fs.access(candidate); imagePaths[asset.assetId]=candidate; assets.push(asset); }
                    catch (error) { if (error.code !== 'ENOENT') throw error; }
                }
                const recoverySettings={
                    ...job.settings, fontScale:0.85, density:'compact',
                    includeSpeakerNotes:!job.settings.documentMode || job.settings.includeSpeakerNotes,
                };
                await persist('verifying',76,'Checking recovered presentation');
                let retained=assets;
                async function attempt(visuals) {
                    const scene=buildFullCopyScene(doc,visuals,recoverySettings);
                    if(job.billing&&scene.slides.length>job.billing.maxSlides)throw Error('BILLING_SLIDE_COUNT_EXCEEDED');
                    return {...await exportPptx(doc,scene,imagePaths),scene};
                }
                let artifact;
                try {artifact=await attempt(retained);}
                catch (error) {if(!retained.length)throw error;retained=[];artifact=await attempt(retained);}
                const {bytes,report,scene}=artifact;
                report.recovery={code:safeErrorCode(e),retainedSource:true,missingVisuals:(job.documentAssets?.length??0)-retained.length};
                await fs.mkdir(dir,{recursive:true});
                const temporary=path.join(dir,'recovered-'+randomUUID()+'.pptx');
                await fs.writeFile(temporary,bytes,{mode:0o600});
                await fs.rename(temporary,path.join(dir,'presentation.pptx'));
                await fs.writeFile(path.join(dir,'validation.json'),JSON.stringify(report,null,2),{mode:0o600});
                job={...job,scene,report,coverBranding:undefined,preview:'layout',
                    previewWarning:'A simpler layout was used after an error. Source text was verified. Review language, visual assets and formatting before presenting.',
                    plan:{engine:'rules',slides:scene.slides.map(({id,blockIds,layout})=>({id,blockIds,layout,imageId:null}))},
                    durationMs:Date.now()-started};
                if(job.billing){
                    job={...job,billing:{...job.billing,phase:'settling'}};
                    await persist('verifying',96,'Finalizing credits');
                    job=await settleJobBilling(repo,cfg,job);
                }
                await persist('ready',100,'Recovered PowerPoint ready to export');
                if(job.billing)await repo.completeBillingRefund(job.id);
                await repo.recordJobEvent(job).catch(() => {});
                return;
            } catch (recoveryError) {
                console.warn(JSON.stringify({event:'presentation_recovery_failed',jobId:id,code:safeErrorCode(recoveryError)}));
                if(['settling','committed'].includes(job.billing?.phase))throw recoveryError;
            }
        }
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
        if(job.billing){const latest=await repo.job(id);if(['failed','cancelled'].includes(latest?.status))try{await refundJobBilling(repo,cfg,job);}catch{console.error(JSON.stringify({event:'platform_refund_pending',code:'PLATFORM_UNAVAILABLE'}));}else if(latest?.status!=='ready')throw e;}
        // Retain failed artifacts; the durable refund outbox is reconciled separately.
        const final = await repo.job(id);
        if (final)
            await repo.recordJobEvent(final);
    }
    finally {
        clearInterval(heartbeat);
        await heartbeatTail;
        await repo.releaseLease(id, leaseToken).catch(() => { });
    }
}
export class JobRunner {
    repo;
    cfg;
    queue;
    running = false;
    stopped = false;
    pending = [];
    reconcileTimer;
    reconciling = false;
    constructor(repo, cfg, queueName = "verbatim-generate") {
        this.repo = repo;
        this.cfg = cfg;
        if (cfg.redis)
            this.queue = new Queue(queueName, {
                connection: redisConnection(cfg.redis),
            });
    }
    async init() {
        if (this.queue) {
            this.queue.on("error", () => console.error(JSON.stringify({
                event: "queue_connection",
                code: "QUEUE_UNAVAILABLE",
            })));
        }
        if (this.queue) {
            this.reconcileTimer = setInterval(() => { void this.reconcile(); }, 15000);
            this.reconcileTimer.unref();
            void this.reconcile();
        }
        if (!this.queue) {
            await this.repo.interruptJobs();
            for (const j of await this.repo.queued())
                this.pending.push(j.id);
            this.drain();
        }
    }
    async reconcile() {
        if (!this.queue || this.reconciling || this.stopped)
            return;
        this.reconciling = true;
        try {
            await reconcileBilling(this.repo,this.cfg);
            for (const id of await this.repo.recoverableJobs()) {
                if (this.stopped)
                    break;
                const queued = await bounded(this.queue.getJob(id), 5000);
                if (queued) {
                    const state = await bounded(queued.getState(), 5000);
                    if (state === "failed")
                        await bounded(queued.retry(), 5000);
                    else if (state === "completed") {
                        await bounded(queued.remove(), 5000);
                        await this.enqueue(id);
                    }
                }
                else
                    await this.enqueue(id);
            }
        }
        catch {
            if (!this.stopped)
                console.error(JSON.stringify({ event: "queue_reconcile", code: "QUEUE_UNAVAILABLE" }));
        }
        finally {
            this.reconciling = false;
        }
    }
    async enqueue(id) {
        if (this.queue) {
            await bounded(this.queue.waitUntilReady(), 5000);
            await bounded(this.queue.add("generate", { id }, { jobId: id, attempts: 6, backoff: { type: "fixed", delay: 30000 }, removeOnComplete: 100, removeOnFail: 100 }), 5000);
        }
        else {
            this.pending.push(id);
            this.drain();
        }
    }
    async drain() {
        if (this.running || this.stopped)
            return;
        this.running = true;
        while (this.pending.length && !this.stopped) {
            const id = this.pending.shift();
            await processJob(this.repo, this.cfg, id);
        }
        this.running = false;
    }
    async close() {
        this.stopped = true;
        if (this.reconcileTimer)
            clearInterval(this.reconcileTimer);
        while (this.reconciling)
            await new Promise(r => setTimeout(r, 20));
        await this.queue?.close();
        while (this.running)
            await new Promise((r) => setTimeout(r, 20));
    }
}
