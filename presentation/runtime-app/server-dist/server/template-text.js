import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseSource } from "../core/source.js";
import { rulesPlan, validatePlan } from "../core/planner.js";
import { usageLimits } from "./usage.js";
export function registerTemplateText(app, repo, runner, cfg) {
    app.post("/api/generations/:id/text", {
        config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
    }, async (req, reply) => {
        const old = await repo.job(req.params.id, req.user.id);
        if (!old)
            return reply.code(404).send({ error: "GENERATION_NOT_FOUND" });
        if (old.settings.creationMode === "creative")
            throw new Error("CREATIVE_READ_ONLY");
        if (old.status !== "ready")
            return reply.code(409).send({ error: "EXPORT_NOT_READY" });
        const body = z.object({ blockId: z.string().regex(/^b\d+$/), text: z.string().min(1).max(200000),
            expectedRevision: z.number().int().nonnegative(), expectedSourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(req.body);
        const previous = await repo.getProject(old.projectId, req.user.id);
        if (!previous || previous.mode !== old.settings.mode || previous.sourceHash !== old.sourceHash || body.expectedSourceHash !== old.sourceHash)
            return reply.code(409).send({ error: "SOURCE_CHANGED" });
        if ((previous.revision || 0) !== body.expectedRevision)
            throw new Error("PROJECT_CONFLICT");
        const original = parseSource(old.source, old.settings.mode), block = original.blocks.find(b => b.id === body.blockId);
        if (!block)
            return reply.code(400).send({ error: "INVALID_INPUT" });
        const ending = block.raw.match(/(\r?\n)$/)?.[1] || "";
        const replacement = body.text + (ending && !body.text.endsWith("\n") ? ending : "");
        const source = old.source.slice(0, block.start) + replacement + old.source.slice(block.end);
        const doc = parseSource(source, old.settings.mode), now = new Date().toISOString();
        const next = { ...previous, source, sourceHash: doc.sha256, updatedAt: now, revision: (previous.revision || 0) + 1 };
        let plan = { engine: "rules", slides: old.plan?.slides.map(s => ({ ...s })) || [] };
        // Keep compatible layout choices; new source structure starts a safe layout plan.
        try {
            validatePlan(doc, plan);
        }
        catch {
            plan = rulesPlan(doc, false);
        }
        const job = { id: randomUUID(), projectId: old.projectId, ownerId: req.user.id, source,
            sourceHash: doc.sha256, settings: { ...old.settings, useAI: false, creationMode: "template" }, plan,
            status: "queued", progress: 0, stage: "Saving edited text", createdAt: now, preview: "none", kind: "text-edit" };
        await repo.admitJob(job, cfg.oidc ? usageLimits(cfg) : undefined, false, { previous, next });
        try {
            await runner.enqueue(job.id);
        }
        catch {
            console.error(JSON.stringify({ event: "queue_delivery", code: "QUEUE_UNAVAILABLE" }));
        }
        return reply.code(202).send({ project: { ...next, latestId: job.id }, generation: { id: job.id } });
    });
}
