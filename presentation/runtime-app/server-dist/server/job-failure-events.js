import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const token = value => typeof value === 'string' && /^[a-z0-9_.:-]{1,120}$/i.test(value) ? value : undefined;

export async function recordPresentationFailure(root, details, error) {
    const directory = path.join(root, '.job-alerts');
    const incident = randomUUID();
    const temporary = path.join(directory, incident + '.tmp');
    const stack = (error?.stack?.split('\n').slice(1) ?? [])
        .flatMap(line => line.match(/[\w.-]+\.(?:js|mjs|cjs|ts):\d+:\d+/g) ?? []).slice(0, 12);
    const event = {
        incident, product: 'Presentation', timestamp: new Date().toISOString(),
        jobId: token(details.id), ownerId: token(details.owner), projectId: token(details.project),
        code: token(details.code) || 'UNCLASSIFIED', status: token(details.status),
        stage: typeof details.stage === 'string' && /^[a-z0-9 ._-]{1,120}$/i.test(details.stage) ? details.stage : undefined,
        durationMs: Number.isFinite(details.durationMs) ? details.durationMs : undefined,
        model: token(details.model), exceptionType: token(error?.name),
        internalCode: /^[A-Z][A-Z0-9_]{2,80}$/.test(error?.message || '') ? error.message : undefined,
        stack,
    };
    try {
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        await fs.writeFile(temporary, JSON.stringify(event), { mode: 0o600, flag: 'wx', flush: true });
        await fs.rename(temporary, path.join(directory, incident + '.json'));
    } catch {
        await fs.rm(temporary, { force: true }).catch(() => {});
        console.error(JSON.stringify({ event: 'job_alert_spool_failed', jobId: event.jobId }));
    }
}
