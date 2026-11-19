import { recordPresentationFailure } from './job-failure-events.js';
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";
import { atomicProgram, ownerLock, sqliteStatement } from "./sql-program.js";
import { admitJobProgram } from "./admission.js";
import { estimateTokenCost, TOKEN_PRICING, PRICING_VERSIONS } from "./token-pricing.js";
import fs from "node:fs/promises";
import path from "node:path";
export class Repository {
    root;
    url;
    sqlite;
    pg;
    migrationClient;
    constructor(root, url) {
        this.root = root;
        this.url = url;
    }
    async init() {
        await fs.mkdir(this.root, { recursive: true });
        if (this.url) {
            this.pg = new Pool({ connectionString: this.url });
            this.migrationClient = await this.pg.connect();
            await this.migrationClient.query("BEGIN");
            await this.migrationClient.query("SELECT pg_advisory_xact_lock(4310,9)");
        }
        else {
            this.sqlite = new DatabaseSync(path.join(this.root, "studio.sqlite"));
            this.sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
        }
        try {
            await this.initializeSchema();
            if (this.migrationClient)
                await this.migrationClient.query("COMMIT");
        }
        catch (error) {
            if (this.migrationClient)
                await this.migrationClient.query("ROLLBACK");
            throw error;
        }
        finally {
            this.migrationClient?.release();
            this.migrationClient = undefined;
        }
    }
    async initializeSchema() {
        await this.ensureBillingOutbox();
        await this.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,data TEXT NOT NULL)");
        await this.exec("CREATE TABLE IF NOT EXISTS workspace_identity (id TEXT PRIMARY KEY,user_id TEXT NOT NULL)");
        await this.exec("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires BIGINT NOT NULL)");
        await this.exec("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,data TEXT NOT NULL)");
        await this.exec("CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,owner_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL)");
        await this.exec("CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id)");
        await this.exec("CREATE INDEX IF NOT EXISTS generations_owner_status ON generations(owner_id,status)");
        await this.exec("CREATE UNIQUE INDEX IF NOT EXISTS one_active_job_per_project ON generations(project_id) WHERE status IN ('queued','planning','building','verifying','rendering')");
        // Additive, restart-safe migrations: existing projects and JSON snapshots remain intact.
        await this.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)");
        await this.exec("CREATE TABLE IF NOT EXISTS job_events (generation_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,project_id TEXT NOT NULL,status TEXT NOT NULL,kind TEXT NOT NULL,engine TEXT,model TEXT,input_tokens INTEGER NOT NULL,output_tokens INTEGER NOT NULL,duration_ms INTEGER NOT NULL,error_code TEXT,updated_at TEXT NOT NULL)");
        await this.exec("CREATE INDEX IF NOT EXISTS job_events_owner_date ON job_events(owner_id,updated_at)");
        // Content drafts record costs/usage without retaining potentially private prompts.
        await this.exec("CREATE TABLE IF NOT EXISTS content_draft_events (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,model TEXT NOT NULL,input_tokens INTEGER NOT NULL,output_tokens INTEGER NOT NULL,created_at TEXT NOT NULL)");
        await this.exec("CREATE INDEX IF NOT EXISTS content_draft_owner_created ON content_draft_events(owner_id,created_at)");
        await this.exec("CREATE TABLE IF NOT EXISTS oidc_login_flows (token TEXT PRIMARY KEY,data TEXT NOT NULL,expires BIGINT NOT NULL)");
        await this.exec("CREATE INDEX IF NOT EXISTS oidc_flow_expiry ON oidc_login_flows(expires)");
        await this.exec("CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires)");
        await this.exec("CREATE TABLE IF NOT EXISTS usage_buckets (owner_id TEXT NOT NULL,day TEXT NOT NULL,kind TEXT NOT NULL,used INTEGER NOT NULL,PRIMARY KEY(owner_id,day,kind))");
        await this.exec("CREATE TABLE IF NOT EXISTS job_leases (generation_id TEXT PRIMARY KEY,token TEXT NOT NULL,expires BIGINT NOT NULL)");
        await this.exec("CREATE INDEX IF NOT EXISTS job_leases_expiry ON job_leases(expires)");
        await this.exec("CREATE TABLE IF NOT EXISTS project_listing (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,updated_at TEXT NOT NULL,latest_id TEXT)");
        await this.exec("CREATE INDEX IF NOT EXISTS project_listing_owner_date ON project_listing(owner_id,updated_at,id)");
        await this.exec("CREATE INDEX IF NOT EXISTS project_listing_owner_name ON project_listing(owner_id,name,id)");
        await this.exec("CREATE TABLE IF NOT EXISTS token_events (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,kind TEXT NOT NULL,generation_id TEXT,input_tokens BIGINT,output_tokens BIGINT,created_at TEXT NOT NULL)");
        await this.exec("CREATE INDEX IF NOT EXISTS token_events_owner_date ON token_events(owner_id,created_at)");
        await this.exec("CREATE INDEX IF NOT EXISTS token_events_owner_generation ON token_events(owner_id,generation_id)");
        if (!(await this.rows("SELECT version FROM schema_migrations WHERE version=6")).length) {
            await this.exec("INSERT INTO token_events (id,owner_id,kind,generation_id,input_tokens,output_tokens,created_at) SELECT 'legacy-job-'||generation_id,owner_id,'generation',generation_id,input_tokens,output_tokens,updated_at FROM job_events WHERE input_tokens+output_tokens>0 ON CONFLICT(id) DO NOTHING");
            await this.exec("INSERT INTO token_events (id,owner_id,kind,generation_id,input_tokens,output_tokens,created_at) SELECT 'legacy-draft-'||id,owner_id,'content-draft',NULL,input_tokens,output_tokens,created_at FROM content_draft_events WHERE input_tokens+output_tokens>0 ON CONFLICT(id) DO NOTHING");
        }
        await this.exec("CREATE TABLE IF NOT EXISTS token_event_costs (event_id TEXT PRIMARY KEY,nano_usd BIGINT,cached_input BIGINT,cache_write_input BIGINT,assumed INTEGER NOT NULL,pricing_version TEXT NOT NULL)");
        if (!(await this.rows("SELECT version FROM schema_migrations WHERE version=7")).length) {
            // Older events have no cache/tier breakdown: clearly marked Standard,
            // uncached estimates. Unknown token usage stays an unknown cost.
            await this.exec("INSERT INTO token_event_costs (event_id,nano_usd,cached_input,cache_write_input,assumed,pricing_version) SELECT e.id,CASE WHEN e.input_tokens IS NULL OR e.output_tokens IS NULL OR (e.id LIKE 'legacy-job-%' AND (j.model IS NULL OR j.model<>'gpt-6-luna')) OR (e.id LIKE 'legacy-draft-%' AND (d.model IS NULL OR d.model<>'gpt-6-luna')) THEN NULL WHEN e.input_tokens>272000 THEN e.input_tokens*$2+e.output_tokens*$3 ELSE e.input_tokens*$4+e.output_tokens*$5 END,NULL,NULL,1,$1 FROM token_events e LEFT JOIN job_events j ON e.id='legacy-job-'||j.generation_id LEFT JOIN content_draft_events d ON e.id='legacy-draft-'||d.id WHERE 1=1 ON CONFLICT(event_id) DO NOTHING", [TOKEN_PRICING.version, TOKEN_PRICING.perMillion.input * 2000, TOKEN_PRICING.perMillion.output * 1500, TOKEN_PRICING.perMillion.input * 1000, TOKEN_PRICING.perMillion.output * 1000]);
        }
        const migrated = (await this.rows("SELECT version FROM schema_migrations WHERE version=5")).length > 0;
        const fields = this.pg
            ? "COALESCE(data::jsonb->>'name',''),COALESCE(data::jsonb->>'updatedAt',''),data::jsonb->>'latestId'"
            : "COALESCE(json_extract(data,'$.name'),''),COALESCE(json_extract(data,'$.updatedAt'),''),json_extract(data,'$.latestId')";
        if (!migrated)
            await this.exec("INSERT INTO project_listing (id,owner_id,name,updated_at,latest_id) SELECT id,owner_id," + fields + " FROM projects WHERE 1=1 ON CONFLICT(id) DO NOTHING");
        for (const version of [1, 2, 3, 4, 5, 6, 7])
            await this.exec("INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT(version) DO NOTHING", [version, new Date().toISOString()]);
    }
    async exec(sql, params = []) {
        if (this.migrationClient)
            return this.migrationClient.query(sql, params);
        if (this.pg)
            return this.pg.query(sql, params);
        const { statement, values } = sqliteStatement(this.sqlite, { sql, params });
        return statement.run(...values);
    }
    async rows(sql, params = []) {
        if (this.migrationClient)
            return (await this.migrationClient.query(sql, params)).rows;
        if (this.pg)
            return (await this.pg.query(sql, params)).rows;
        const { statement, values } = sqliteStatement(this.sqlite, { sql, params });
        return statement.all(...values);
    }
    atomic(program) { return atomicProgram(program, this.sqlite, this.pg); }
    async workspaceOwner() {
        const stored = (await this.rows("SELECT user_id FROM workspace_identity WHERE id=$1", [
            "shared",
        ]))[0];
        if (stored) {
            const user = await this.userById(stored.user_id);
            if (user)
                return user;
        }
        // Preserve the first existing owner's projects without changing owner IDs.
        const users = (await this.rows("SELECT data FROM users"))
            .map((r) => JSON.parse(r.data))
            .filter((user) => !user.id.startsWith("oidc-"))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        let user = users[0];
        if (!user) {
            user = {
                id: randomUUID(),
                email: "workspace@local.invalid",
                password: "",
                createdAt: new Date().toISOString(),
            };
            await this.addUser(user);
        }
        await this.exec("INSERT INTO workspace_identity (id,user_id) VALUES ($1,$2) ON CONFLICT(id) DO NOTHING", ["shared", user.id]);
        const chosen = (await this.rows("SELECT user_id FROM workspace_identity WHERE id=$1", [
            "shared",
        ]))[0];
        return (await this.userById(chosen.user_id));
    }
    async oidcUser(issuer, subject, email, displayName) {
        // Bind identity to (issuer, subject), never to a mutable email address.
        // In particular, never adopt/migrate the shared local owner's projects.
        const identity = createHash("sha256").update(issuer + "\0" + subject).digest("hex");
        const user = { id: "oidc-" + identity, email: identity + "@oidc.invalid",
            password: "", createdAt: new Date().toISOString(),
            ...(email && email.length <= 254 ? { displayEmail: email } : {}),
            ...(displayName ? { displayName } : {}), platformIdentity: { issuer, subject } };
        const lock = this.pg ? " FOR UPDATE" : "";
        return this.atomic((function* () {
            yield { sql: "INSERT INTO users (id,email,data) VALUES ($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id",
                params: [user.id, user.email, JSON.stringify(user)] };
            const rows = yield { sql: "SELECT data FROM users WHERE id=$1" + lock, params: [user.id] };
            const existing = JSON.parse(rows[0].data);
            const updated = { ...existing, platformIdentity: user.platformIdentity, ...(user.displayEmail ? { displayEmail: user.displayEmail } : {}),
                ...(user.displayName ? { displayName: user.displayName } : {}) };
            yield { sql: "UPDATE users SET data=$1 WHERE id=$2 RETURNING id", params: [JSON.stringify(updated), user.id] };
            return updated;
        })());
    }
    async saveLoginFlow(token, flow, expires) {
        await this.exec("DELETE FROM oidc_login_flows WHERE expires<=$1", [Date.now()]);
        await this.exec("INSERT INTO oidc_login_flows (token,data,expires) VALUES ($1,$2,$3)", [token, JSON.stringify(flow), expires]);
    }
    async consumeLoginFlow(token) {
        const rows = await this.rows("DELETE FROM oidc_login_flows WHERE token=$1 AND expires>$2 RETURNING data", [token, Date.now()]);
        return rows[0] ? JSON.parse(rows[0].data) : null;
    }
    async createAuthSession(tokenHash, userId, expires) {
        await this.exec("DELETE FROM sessions WHERE expires<=$1", [Date.now()]);
        await this.session(tokenHash, userId, expires);
    }
    async reserveUsage(owner, kind, limit) {
        const day = new Date().toISOString().slice(0, 10);
        const rows = await this.rows("INSERT INTO usage_buckets (owner_id,day,kind,used) VALUES ($1,$2,$3,1) ON CONFLICT(owner_id,day,kind) DO UPDATE SET used=usage_buckets.used+1 WHERE usage_buckets.used<$4 RETURNING used", [owner, day, kind, limit]);
        return rows.length === 1;
    }
    async dailyUsage(owner) {
        const day = new Date().toISOString().slice(0, 10);
        const rows = await this.rows("SELECT kind,used FROM usage_buckets WHERE owner_id=$1 AND day=$2", [owner, day]);
        return { day, generations: Number(rows.find(r => r.kind === "generations")?.used || 0),
            ai: Number(rows.find(r => r.kind === "ai")?.used || 0) };
    }
    async recordTokenUsage(event) {
        const cost = event.cost || estimateTokenCost(event.input, event.output);
        await this.atomic((function* () {
            const inserted = yield { sql: "INSERT INTO token_events (id,owner_id,kind,generation_id,input_tokens,output_tokens,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id",
                params: [event.id, event.owner, event.kind, event.generationId || null, event.input, event.output, event.createdAt] };
            if (inserted.length)
                yield { sql: "INSERT INTO token_event_costs (event_id,nano_usd,cached_input,cache_write_input,assumed,pricing_version) VALUES ($1,$2,$3,$4,$5,$6)",
                    params: [event.id, cost.nanoUsd, cost.cached, cost.written, cost.assumed ? 1 : 0, cost.pricingVersion || TOKEN_PRICING.version] };
        })());
    }
    async tokenUsage(owner, generationId) {
        const day = new Date().toISOString().slice(0, 10);
        const rows = await this.rows("SELECT COALESCE(SUM(e.input_tokens),0) AS input,COALESCE(SUM(e.output_tokens),0) AS output,COUNT(*) AS calls,COALESCE(SUM(CASE WHEN e.input_tokens IS NULL OR e.output_tokens IS NULL THEN 1 ELSE 0 END),0) AS unknown,COALESCE(SUM(c.nano_usd),0) AS nano_usd,COALESCE(SUM(CASE WHEN c.nano_usd IS NULL THEN 1 ELSE 0 END),0) AS cost_unknown,COALESCE(SUM(CASE WHEN c.nano_usd IS NOT NULL AND c.assumed=1 THEN 1 ELSE 0 END),0) AS cost_assumed,MIN(c.pricing_version) AS min_pricing,MAX(c.pricing_version) AS max_pricing FROM token_events e LEFT JOIN token_event_costs c ON c.event_id=e.id WHERE e.owner_id=$1 AND " + (generationId ? "e.generation_id=$2" : "e.created_at>=$2"), [owner, generationId || day]);
        const row = rows[0], input = Number(row.input), output = Number(row.output);
        const costUnknown = Number(row.cost_unknown), calls = Number(row.calls);
        const pricing = !calls ? TOKEN_PRICING : row.min_pricing === row.max_pricing ? PRICING_VERSIONS[row.min_pricing] || null : null;
        return { input, output, total: input + output, calls, unreportedCalls: Number(row.unknown), scope: generationId ? "generation" : "today", day, model: pricing?.model || "mixed-or-unknown",
            cost: { estimatedUsd: calls > 0 && calls === costUnknown ? null : Number(row.nano_usd) / 1e9,
                unknownCalls: costUnknown, assumedCalls: Number(row.cost_assumed), currency: "USD", pricing } };
    }
    async userCount() {
        return Number((await this.rows("SELECT COUNT(*) AS count FROM users"))[0].count);
    }
    async user(email) {
        const row = (await this.rows("SELECT data FROM users WHERE email=$1", [
            email.toLowerCase(),
        ]))[0];
        return row ? JSON.parse(row.data) : null;
    }
    async userById(id) {
        const row = (await this.rows("SELECT data FROM users WHERE id=$1", [id]))[0];
        return row ? JSON.parse(row.data) : null;
    }
    async addUser(user) {
        await this.exec("INSERT INTO users (id,email,data) VALUES ($1,$2,$3)", [
            user.id,
            user.email.toLowerCase(),
            JSON.stringify(user),
        ]);
    }
    async session(token, userId, expires) {
        await this.exec("INSERT INTO sessions (token,user_id,expires) VALUES ($1,$2,$3)", [token, userId, expires]);
    }
    async sessionUser(token) {
        const row = (await this.rows("SELECT user_id FROM sessions WHERE token=$1 AND expires>$2", [token, Date.now()]))[0];
        return row ? this.userById(row.user_id) : null;
    }
    async removeSession(token) {
        await this.exec("DELETE FROM sessions WHERE token=$1", [token]);
    }
    static listing(p) {
        return { sql: "INSERT INTO project_listing (id,owner_id,name,updated_at,latest_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,latest_id=excluded.latest_id RETURNING id",
            params: [p.id, p.ownerId, p.name, p.updatedAt, p.latestId] };
    }
    async saveProject(p) {
        return this.atomic((function* () {
            const rows = yield { sql: "INSERT INTO projects (id,owner_id,data) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE projects.owner_id=excluded.owner_id RETURNING id",
                params: [p.id, p.ownerId, JSON.stringify(p)] };
            if (!rows.length)
                throw new Error("PROJECT_NOT_FOUND");
            yield Repository.listing(p);
        })());
    }
    async compareAndSaveProject(previous, next) {
        if (previous.id !== next.id || previous.ownerId !== next.ownerId)
            throw new Error("PROJECT_NOT_FOUND");
        return this.atomic((function* () {
            const rows = yield { sql: "UPDATE projects SET data=$1 WHERE id=$2 AND owner_id=$3 AND data=$4 RETURNING id",
                params: [JSON.stringify(next), previous.id, previous.ownerId, JSON.stringify(previous)] };
            if (!rows.length)
                return false;
            yield Repository.listing(next);
            return true;
        })());
    }
    async projectsPage(owner, options) {
        const order = options.sort === "name" ? "LOWER(l.name) ASC,l.id ASC" : "l.updated_at DESC,l.id DESC";
        const found = await this.rows(("SELECT p.data FROM project_listing l JOIN projects p ON p.id=l.id AND p.owner_id=l.owner_id LEFT JOIN generations g ON g.id=l.latest_id AND g.owner_id=l.owner_id WHERE l.owner_id=$1 AND POSITION_PLACEHOLDER AND ($3='all' OR ($3='ready' AND g.status='ready') OR ($3='drafts' AND (g.status IS NULL OR g.status<>'ready'))) ORDER BY " + order + " LIMIT $4 OFFSET $5").replace("POSITION_PLACEHOLDER", this.pg ? "STRPOS(LOWER(l.name),$2)>0" : "INSTR(LOWER(l.name),$2)>0"), [owner, options.search.toLowerCase(), options.filter, options.limit + 1, options.offset]);
        const more = found.length > options.limit;
        return { projects: found.slice(0, options.limit).map(r => JSON.parse(r.data)), nextOffset: more ? options.offset + options.limit : null };
    }
    async ensureBillingOutbox() {
        await this.exec("CREATE TABLE IF NOT EXISTS platform_billing_outbox (id TEXT PRIMARY KEY,data TEXT NOT NULL,state TEXT NOT NULL)");
    }
    async enqueueBillingRefund(job) {
        await this.exec("INSERT INTO platform_billing_outbox (id,data,state) VALUES ($1,$2,'pending') ON CONFLICT(id) DO NOTHING",[job.id,JSON.stringify({id:job.id})]);
    }
    async pendingBillingRefunds() {
        return (await this.rows("SELECT id FROM platform_billing_outbox WHERE state='pending' LIMIT 50",[])).map(r=>({id:r.id}));
    }
    async completeBillingRefund(id) {await this.exec("UPDATE platform_billing_outbox SET state='delivered' WHERE id=$1",[id]);}
    async admitJob(job, limits, chargeAi = false, replacement) {
        return this.atomic(admitJobProgram(job, !!this.pg, limits, chargeAi, replacement));
    }
    async claimJob(id, token, ttl = 120000) {
        const now = Date.now();
        const lock = this.pg ? " FOR UPDATE" : "";
        return this.atomic((function* () {
            const rows = yield { sql: "SELECT data FROM generations WHERE id=$1 AND status IN ('queued','planning','building','verifying','rendering')" + lock, params: [id] };
            if (!rows.length)
                return null;
            const claimed = yield { sql: "INSERT INTO job_leases (generation_id,token,expires) VALUES ($1,$2,$3) ON CONFLICT(generation_id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE job_leases.expires<=$4 RETURNING generation_id", params: [id, token, now + ttl, now] };
            return claimed.length ? JSON.parse(rows[0].data) : null;
        })());
    }
    async renewLease(id, token, ttl = 120000) {
        return (await this.rows("UPDATE job_leases SET expires=$1 WHERE generation_id=$2 AND token=$3 AND expires>$4 RETURNING generation_id", [Date.now() + ttl, id, token, Date.now()])).length === 1;
    }
    async releaseLease(id, token) {
        await this.exec("DELETE FROM job_leases WHERE generation_id=$1 AND token=$2", [id, token]);
    }
    async saveLeasedJob(previous, next, token) {
        const lock = this.pg ? " FOR UPDATE" : "";
        return this.atomic((function* () {
            // Use the same generation-then-lease lock order as claimJob. A stale attempt
            // cannot publish across a concurrent lease replacement on PostgreSQL.
            const current = yield { sql: "SELECT id FROM generations WHERE id=$1 AND owner_id=$2 AND data=$3" + lock,
                params: [previous.id, previous.ownerId, JSON.stringify(previous)] };
            if (!current.length)
                return false;
            const lease = yield { sql: "SELECT generation_id FROM job_leases WHERE generation_id=$1 AND token=$2 AND expires>$3" + lock,
                params: [previous.id, token, Date.now()] };
            if (!lease.length)
                return false;
            yield { sql: "UPDATE generations SET status=$1,data=$2 WHERE id=$3 RETURNING id",
                params: [next.status, JSON.stringify(next), previous.id] };
            return true;
        })());
    }
    async recoverableJobs(limit = 50) {
        const rows = await this.rows("SELECT id FROM generations WHERE status IN ('queued','planning','building','verifying','rendering') AND NOT EXISTS (SELECT 1 FROM job_leases WHERE generation_id=generations.id AND expires>$1) ORDER BY id LIMIT $2", [Date.now(), limit]);
        return rows.map(row => String(row.id));
    }
    async getProject(id, owner) {
        const row = (await this.rows("SELECT data FROM projects WHERE id=$1 AND owner_id=$2", [
            id,
            owner,
        ]))[0];
        return row ? JSON.parse(row.data) : null;
    }
    async projects(owner) {
        return (await this.rows("SELECT data FROM projects WHERE owner_id=$1", [owner]))
            .map((r) => JSON.parse(r.data))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    async saveJob(j) {
        await this.exec("INSERT INTO generations (id,project_id,owner_id,status,data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data", [j.id, j.projectId, j.ownerId, j.status, JSON.stringify(j)]);
    }
    async recordJobEvent(j) {
        const usage = j.plan?.usage;
        await this.exec("INSERT INTO job_events (generation_id,owner_id,project_id,status,kind,engine,model,input_tokens,output_tokens,duration_ms,error_code,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(generation_id) DO UPDATE SET status=excluded.status,engine=excluded.engine,model=excluded.model,input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,duration_ms=excluded.duration_ms,error_code=excluded.error_code,updated_at=excluded.updated_at", [
            j.id,
            j.ownerId,
            j.projectId,
            j.status,
            j.kind || "generation",
            j.plan?.engine || null,
            usage?.model || j.plan?.ai?.model || null,
            usage?.input || 0,
            usage?.output || 0,
            Math.round(j.durationMs || 0),
            j.error || j.plan?.ai?.reason || null,
            new Date().toISOString(),
        ]);
    }
    async operations(owner) {
        const counts = await this.rows("SELECT status,COUNT(*) AS count FROM generations WHERE owner_id=$1 GROUP BY status", [owner]);
        const usage = (await this.rows("SELECT COALESCE(SUM(input_tokens),0) AS input,COALESCE(SUM(output_tokens),0) AS output,COUNT(*) AS tracked FROM job_events WHERE owner_id=$1", [owner]))[0];
        const recent = await this.rows("SELECT generation_id,project_id,status,kind,engine,model,input_tokens,output_tokens,duration_ms,error_code,updated_at FROM job_events WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 40", [owner]);
        return {
            counts: Object.fromEntries(counts.map((r) => [r.status, Number(r.count)])),
            usage: {
                input: Number(usage.input),
                output: Number(usage.output),
                tracked: Number(usage.tracked),
            },
            recent,
        };
    }
    async recordPromptDraftUsage(ownerId, usage) {
        await this.exec("INSERT INTO content_draft_events (id,owner_id,model,input_tokens,output_tokens,created_at) VALUES ($1,$2,$3,$4,$5,$6)", [randomUUID(), ownerId, usage.model, usage.inputTokens, usage.outputTokens, new Date().toISOString()]);
    }
    async promptDraftUsage(ownerId) {
        const rows = await this.rows("SELECT COALESCE(SUM(input_tokens),0) AS input,COALESCE(SUM(output_tokens),0) AS output,COUNT(*) AS tracked FROM content_draft_events WHERE owner_id=$1", [ownerId]);
        return { input: Number(rows[0].input), output: Number(rows[0].output), tracked: Number(rows[0].tracked) };
    }
    async compareAndSaveJob(previous, next) {
        const result = await this.exec("UPDATE generations SET status=$1,data=$2 WHERE id=$3 AND owner_id=$4 AND data=$5", [
            next.status,
            JSON.stringify(next),
            previous.id,
            previous.ownerId,
            JSON.stringify(previous),
        ]);
        return (Number("rowCount" in result ? result.rowCount : result.changes) === 1);
    }
    async job(id, owner) {
        const rows = owner
            ? await this.rows("SELECT data FROM generations WHERE id=$1 AND owner_id=$2", [id, owner])
            : await this.rows("SELECT data FROM generations WHERE id=$1", [id]);
        return rows[0] ? JSON.parse(rows[0].data) : null;
    }
    async jobsForProject(id, owner) {
        return (await this.rows("SELECT data FROM generations WHERE project_id=$1 AND owner_id=$2", [id, owner]))
            .map((r) => JSON.parse(r.data))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    async queued() {
        return (await this.rows("SELECT data FROM generations WHERE status='queued'")).map((r) => JSON.parse(r.data));
    }
    async interruptJobs() {
        for (const row of await this.rows("SELECT data FROM generations WHERE status IN ('planning','building','verifying','rendering')")) {
            const j = JSON.parse(row.data);
            await this.saveJob({
                ...j,
                status: "failed",
                error: "PROCESS_INTERRUPTED",
                stage: "Process interrupted. You can retry safely.",
            });
            await recordPresentationFailure(this.root ?? process.env.DATA_DIR ?? "data", {
                id: j.id, owner: j.ownerId, project: j.projectId,
                status: "failed", code: "PROCESS_INTERRUPTED", stage: j.stage,
            });
        }
    }
    async deleteProject(id, owner) {
        const postgres = !!this.pg;
        return this.atomic((function* () {
            yield* ownerLock(owner, postgres);
            const active = yield { sql: "SELECT id FROM generations WHERE project_id=$1 AND owner_id=$2 AND status IN ('queued','planning','building','verifying','rendering')", params: [id, owner] };
            if (active.length)
                throw new Error("GENERATION_ACTIVE");
            yield { sql: "DELETE FROM job_leases WHERE generation_id IN (SELECT id FROM generations WHERE project_id=$1 AND owner_id=$2) RETURNING generation_id", params: [id, owner] };
            yield { sql: "DELETE FROM generations WHERE project_id=$1 AND owner_id=$2 RETURNING id", params: [id, owner] };
            yield { sql: "DELETE FROM project_listing WHERE id=$1 AND owner_id=$2 RETURNING id", params: [id, owner] };
            yield { sql: "DELETE FROM projects WHERE id=$1 AND owner_id=$2 RETURNING id", params: [id, owner] };
        })());
    }
    /** Phase 9H: read-only summary for a dedicated admin service token.
     * Never return the user-authored source, slide contents, image paths, or session data.
     * Do not use job_events as the source for total generations: not every queued
     * generation has an event yet.
     */
    async adminMetrics() {
        const statusRows = await this.rows("SELECT status,COUNT(*) AS count FROM generations GROUP BY status");
        const statuses = Object.fromEntries(statusRows.map(r => [String(r.status), Number(r.count)]));
        const total = Object.values(statuses).reduce((a, b) => a + b, 0);
        const active = ["queued", "planning", "building", "verifying", "rendering"]
            .reduce((n, s) => n + (statuses[s] || 0), 0);
        const projectRow = (await this.rows("SELECT COUNT(*) AS count FROM projects"))[0];
        const userRow = (await this.rows("SELECT COUNT(*) AS count FROM users"))[0];
        const usage = (await this.rows("SELECT COUNT(*) AS calls,COALESCE(SUM(e.input_tokens),0) AS input_tokens,COALESCE(SUM(e.output_tokens),0) AS output_tokens,COALESCE(SUM(c.nano_usd),0) AS nano_usd,COALESCE(SUM(CASE WHEN c.nano_usd IS NULL THEN 1 ELSE 0 END),0) AS unknown_cost_calls,COALESCE(SUM(CASE WHEN c.assumed=1 THEN 1 ELSE 0 END),0) AS assumed_cost_calls FROM token_events e LEFT JOIN token_event_costs c ON c.event_id=e.id"))[0];
        // Metadata-only. Project names are visible to authorized admins, never the source.
        const recentRows = await this.rows("SELECT g.id,g.project_id,g.owner_id,g.status,p.name AS title,j.model,j.engine,j.error_code,j.updated_at FROM generations g LEFT JOIN project_listing p ON p.id=g.project_id AND p.owner_id=g.owner_id LEFT JOIN job_events j ON j.generation_id=g.id ORDER BY COALESCE(j.updated_at,p.updated_at,'') DESC,g.id DESC LIMIT 100");
        const owners = await this.rows("SELECT owner_id,COUNT(*) AS generations FROM generations GROUP BY owner_id ORDER BY COUNT(*) DESC LIMIT 100");
        const userRows = await this.rows("SELECT id,data FROM users");
        const names = new Map();
        for (const row of userRows) {
            try {
                const user = JSON.parse(row.data);
                names.set(String(row.id), String(user.displayName || user.displayEmail || "Account " + String(row.id).slice(0, 12)).slice(0, 120));
            }
            catch { /* Data may be from an earlier release. */ }
        }
        const safeError = (value) => {
            const text = typeof value === "string" ? value : "";
            return /^[A-Z][A-Z0-9_-]{1,79}$/.test(text) ? text : null;
        };
        return {
            schemaVersion: 1,
            counts: { projects: Number(projectRow.count), accounts: Number(userRow.count),
                generations: total, completed: statuses.ready || 0, failed: statuses.failed || 0,
                cancelled: statuses.cancelled || 0, active, byStatus: statuses },
            usage: { calls: Number(usage.calls), inputTokens: Number(usage.input_tokens),
                outputTokens: Number(usage.output_tokens),
                estimatedUsd: Number(usage.calls) > 0 && Number(usage.unknown_cost_calls) === Number(usage.calls)
                    ? null : Number(usage.nano_usd) / 1e9,
                unknownCostCalls: Number(usage.unknown_cost_calls), assumedCostCalls: Number(usage.assumed_cost_calls),
                currency: "USD", label: "Estimated API cost; not an invoice" },
            users: owners.map(r => ({ ownerId: String(r.owner_id),
                displayName: names.get(String(r.owner_id)) || "Account " + String(r.owner_id).slice(0, 12),
                generations: Number(r.generations) })),
            recent: recentRows.map(r => ({ id: String(r.id), projectId: String(r.project_id),
                ownerId: String(r.owner_id), ownerName: names.get(String(r.owner_id)) || "Unknown account",
                title: typeof r.title === "string" ? r.title.slice(0, 120) : "Untitled project",
                status: String(r.status), model: r.model || null, engine: r.engine || null,
                errorCode: safeError(r.error_code), updatedAt: r.updated_at || null })),
        };
    }
    async close() {
        this.sqlite?.close();
        await this.pg?.end();
    }
}
