import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Pool, type PoolClient } from "pg";
import { atomicProgram, ownerLock, sqliteStatement, type SqlProgram } from "./sql-program.js";
import { admitJobProgram } from "./admission.js";
import { estimateTokenCost, TOKEN_PRICING, PRICING_VERSIONS, type TokenCost } from "./token-pricing.js";
import type { UsageLimits } from "./auth-config.js";
import fs from "node:fs/promises";
import path from "node:path";
import type { Project, Generation } from "../core/types.js";
export interface User {
  id: string;
  email: string;
  password: string;
  displayEmail?: string;
  displayName?: string;
  createdAt: string;
}
export interface JobRecord extends Generation {
  source: string;
  ownerId: string;
  artifactId?: string;
}
export class Repository {
  private sqlite?: DatabaseSync;
  private pg?: Pool;
  private migrationClient?: PoolClient;
  constructor(
    private root: string,
    private url?: string,
  ) {}
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    if (this.url) {
      this.pg = new Pool({ connectionString: this.url });
      this.migrationClient = await this.pg.connect();
      await this.migrationClient.query("BEGIN");
      await this.migrationClient.query("SELECT pg_advisory_xact_lock(4310,9)");
    } else {
      this.sqlite = new DatabaseSync(path.join(this.root, "studio.sqlite"));
      this.sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    }
    try {
      await this.initializeSchema();
      if (this.migrationClient) await this.migrationClient.query("COMMIT");
    } catch (error) {
      if (this.migrationClient) await this.migrationClient.query("ROLLBACK");
      throw error;
    } finally {
      this.migrationClient?.release(); this.migrationClient = undefined;
    }
  }
  private async initializeSchema() {
    await this.exec(
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,data TEXT NOT NULL)",
    );
    await this.exec(
      "CREATE TABLE IF NOT EXISTS workspace_identity (id TEXT PRIMARY KEY,user_id TEXT NOT NULL)",
    );
    await this.exec(
      "CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires BIGINT NOT NULL)",
    );
    await this.exec(
      "CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,data TEXT NOT NULL)",
    );
    await this.exec(
      "CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,owner_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL)",
    );
    await this.exec(
      "CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner_id)",
    );
    await this.exec(
      "CREATE INDEX IF NOT EXISTS generations_owner_status ON generations(owner_id,status)",
    );
    await this.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS one_active_job_per_project ON generations(project_id) WHERE status IN ('queued','planning','building','verifying','rendering')",
    );
    // Additive, restart-safe migrations: existing projects and JSON snapshots remain intact.
    await this.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)",
    );
    await this.exec(
      "CREATE TABLE IF NOT EXISTS job_events (generation_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,project_id TEXT NOT NULL,status TEXT NOT NULL,kind TEXT NOT NULL,engine TEXT,model TEXT,input_tokens INTEGER NOT NULL,output_tokens INTEGER NOT NULL,duration_ms INTEGER NOT NULL,error_code TEXT,updated_at TEXT NOT NULL)",
    );
    await this.exec(
      "CREATE INDEX IF NOT EXISTS job_events_owner_date ON job_events(owner_id,updated_at)",
    );
    // Content drafts record costs/usage without retaining potentially private prompts.
    await this.exec(
      "CREATE TABLE IF NOT EXISTS content_draft_events (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,model TEXT NOT NULL,input_tokens INTEGER NOT NULL,output_tokens INTEGER NOT NULL,created_at TEXT NOT NULL)",
    );
    await this.exec(
      "CREATE INDEX IF NOT EXISTS content_draft_owner_created ON content_draft_events(owner_id,created_at)",
    );
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
    if (!migrated) await this.exec("INSERT INTO project_listing (id,owner_id,name,updated_at,latest_id) SELECT id,owner_id," + fields + " FROM projects WHERE 1=1 ON CONFLICT(id) DO NOTHING");
    for (const version of [1, 2, 3, 4, 5, 6, 7])
      await this.exec(
        "INSERT INTO schema_migrations (version,applied_at) VALUES ($1,$2) ON CONFLICT(version) DO NOTHING",
        [version, new Date().toISOString()],
      );
  }
  private async exec(sql: string, params: any[] = []) {
    if (this.migrationClient) return this.migrationClient.query(sql, params);
    if (this.pg) return this.pg.query(sql, params);
    const { statement, values } = sqliteStatement(this.sqlite!, { sql, params });
    return statement.run(...values);
  }
  private async rows(sql: string, params: any[] = []): Promise<any[]> {
    if (this.migrationClient) return (await this.migrationClient.query(sql, params)).rows;
    if (this.pg) return (await this.pg.query(sql, params)).rows;
    const { statement, values } = sqliteStatement(this.sqlite!, { sql, params });
    return statement.all(...values);
  }
  private atomic<T>(program: SqlProgram<T>) { return atomicProgram(program, this.sqlite, this.pg); }
  async workspaceOwner(): Promise<User> {
    const stored = (
      await this.rows("SELECT user_id FROM workspace_identity WHERE id=$1", [
        "shared",
      ])
    )[0];
    if (stored) {
      const user = await this.userById(stored.user_id);
      if (user) return user;
    }
    // Preserve the first existing owner's projects without changing owner IDs.
    const users = (await this.rows("SELECT data FROM users"))
      .map((r) => JSON.parse(r.data) as User)
      .filter((user) => !user.id.startsWith("oidc-"))
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
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
    await this.exec(
      "INSERT INTO workspace_identity (id,user_id) VALUES ($1,$2) ON CONFLICT(id) DO NOTHING",
      ["shared", user.id],
    );
    const chosen = (
      await this.rows("SELECT user_id FROM workspace_identity WHERE id=$1", [
        "shared",
      ])
    )[0];
    return (await this.userById(chosen.user_id))!;
  }
  async oidcUser(issuer: string, subject: string, email?: string, displayName?: string): Promise<User> {
    // Bind identity to (issuer, subject), never to a mutable email address.
    // In particular, never adopt/migrate the shared local owner's projects.
    const identity = createHash("sha256").update(issuer + "\0" + subject).digest("hex");
    const user: User = { id: "oidc-" + identity, email: identity + "@oidc.invalid",
      password: "", createdAt: new Date().toISOString(),
      ...(email && email.length <= 254 ? { displayEmail: email } : {}),
      ...(displayName ? { displayName } : {}) };
    const lock = this.pg ? " FOR UPDATE" : "";
    return this.atomic((function* (): SqlProgram<User> {
      yield { sql: "INSERT INTO users (id,email,data) VALUES ($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id",
        params: [user.id, user.email, JSON.stringify(user)] };
      const rows = yield { sql: "SELECT data FROM users WHERE id=$1" + lock, params: [user.id] };
      const existing = JSON.parse(rows[0].data) as User;
      const updated = { ...existing, ...(user.displayEmail ? { displayEmail: user.displayEmail } : {}),
        ...(user.displayName ? { displayName: user.displayName } : {}) };
      yield { sql: "UPDATE users SET data=$1 WHERE id=$2 RETURNING id", params: [JSON.stringify(updated), user.id] };
      return updated;
    })());
  }
  async saveLoginFlow(token: string, flow: { state: string; nonce: string; verifier: string; returnTo?: string }, expires: number) {
    await this.exec("DELETE FROM oidc_login_flows WHERE expires<=$1", [Date.now()]);
    await this.exec("INSERT INTO oidc_login_flows (token,data,expires) VALUES ($1,$2,$3)",
      [token, JSON.stringify(flow), expires]);
  }
  async consumeLoginFlow(token: string): Promise<{ state: string; nonce: string; verifier: string; returnTo?: string } | null> {
    const rows = await this.rows("DELETE FROM oidc_login_flows WHERE token=$1 AND expires>$2 RETURNING data", [token, Date.now()]);
    return rows[0] ? JSON.parse(rows[0].data) : null;
  }
  async createAuthSession(tokenHash: string, userId: string, expires: number) {
    await this.exec("DELETE FROM sessions WHERE expires<=$1", [Date.now()]);
    await this.session(tokenHash, userId, expires);
  }
  async reserveUsage(owner: string, kind: "generations" | "ai", limit: number) {
    const day = new Date().toISOString().slice(0, 10);
    const rows = await this.rows(
      "INSERT INTO usage_buckets (owner_id,day,kind,used) VALUES ($1,$2,$3,1) ON CONFLICT(owner_id,day,kind) DO UPDATE SET used=usage_buckets.used+1 WHERE usage_buckets.used<$4 RETURNING used",
      [owner, day, kind, limit]);
    return rows.length === 1;
  }
  async dailyUsage(owner: string) {
    const day = new Date().toISOString().slice(0, 10);
    const rows = await this.rows("SELECT kind,used FROM usage_buckets WHERE owner_id=$1 AND day=$2", [owner, day]);
    return { day, generations: Number(rows.find(r => r.kind === "generations")?.used || 0),
      ai: Number(rows.find(r => r.kind === "ai")?.used || 0) };
  }
  async recordTokenUsage(event: { id: string; owner: string; kind: string; generationId?: string; input: number | null; output: number | null; createdAt: string; cost?: TokenCost }) {
    const cost = event.cost || estimateTokenCost(event.input, event.output);
    await this.atomic((function* (): SqlProgram<void> {
      const inserted = yield { sql: "INSERT INTO token_events (id,owner_id,kind,generation_id,input_tokens,output_tokens,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING RETURNING id",
        params: [event.id, event.owner, event.kind, event.generationId || null, event.input, event.output, event.createdAt] };
      if (inserted.length) yield { sql: "INSERT INTO token_event_costs (event_id,nano_usd,cached_input,cache_write_input,assumed,pricing_version) VALUES ($1,$2,$3,$4,$5,$6)",
        params: [event.id, cost.nanoUsd, cost.cached, cost.written, cost.assumed ? 1 : 0, cost.pricingVersion || TOKEN_PRICING.version] };
    })());
  }
  async tokenUsage(owner: string, generationId?: string) {
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
    return Number(
      (await this.rows("SELECT COUNT(*) AS count FROM users"))[0].count,
    );
  }
  async user(email: string): Promise<User | null> {
    const row = (
      await this.rows("SELECT data FROM users WHERE email=$1", [
        email.toLowerCase(),
      ])
    )[0];
    return row ? JSON.parse(row.data) : null;
  }
  async userById(id: string): Promise<User | null> {
    const row = (
      await this.rows("SELECT data FROM users WHERE id=$1", [id])
    )[0];
    return row ? JSON.parse(row.data) : null;
  }
  async addUser(user: User) {
    await this.exec("INSERT INTO users (id,email,data) VALUES ($1,$2,$3)", [
      user.id,
      user.email.toLowerCase(),
      JSON.stringify(user),
    ]);
  }
  async session(token: string, userId: string, expires: number) {
    await this.exec(
      "INSERT INTO sessions (token,user_id,expires) VALUES ($1,$2,$3)",
      [token, userId, expires],
    );
  }
  async sessionUser(token: string) {
    const row = (
      await this.rows(
        "SELECT user_id FROM sessions WHERE token=$1 AND expires>$2",
        [token, Date.now()],
      )
    )[0];
    return row ? this.userById(row.user_id) : null;
  }
  async removeSession(token: string) {
    await this.exec("DELETE FROM sessions WHERE token=$1", [token]);
  }
  private static listing(p: Project) {
    return { sql: "INSERT INTO project_listing (id,owner_id,name,updated_at,latest_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,latest_id=excluded.latest_id RETURNING id",
      params: [p.id, p.ownerId, p.name, p.updatedAt, p.latestId] };
  }
  async saveProject(p: Project) {
    return this.atomic((function* (): SqlProgram<void> {
      const rows = yield { sql: "INSERT INTO projects (id,owner_id,data) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE projects.owner_id=excluded.owner_id RETURNING id",
        params: [p.id, p.ownerId, JSON.stringify(p)] };
      if (!rows.length) throw new Error("PROJECT_NOT_FOUND");
      yield Repository.listing(p);
    })());
  }
  async compareAndSaveProject(previous: Project, next: Project) {
    if (previous.id !== next.id || previous.ownerId !== next.ownerId) throw new Error("PROJECT_NOT_FOUND");
    return this.atomic((function* (): SqlProgram<boolean> {
      const rows = yield { sql: "UPDATE projects SET data=$1 WHERE id=$2 AND owner_id=$3 AND data=$4 RETURNING id",
        params: [JSON.stringify(next), previous.id, previous.ownerId, JSON.stringify(previous)] };
      if (!rows.length) return false;
      yield Repository.listing(next); return true;
    })());
  }
  async projectsPage(owner: string, options: { limit: number; offset: number; search: string; sort: "recent" | "name"; filter: "all" | "ready" | "drafts" }) {
    const order = options.sort === "name" ? "LOWER(l.name) ASC,l.id ASC" : "l.updated_at DESC,l.id DESC";
    const found = await this.rows(
      ("SELECT p.data FROM project_listing l JOIN projects p ON p.id=l.id AND p.owner_id=l.owner_id LEFT JOIN generations g ON g.id=l.latest_id AND g.owner_id=l.owner_id WHERE l.owner_id=$1 AND POSITION_PLACEHOLDER AND ($3='all' OR ($3='ready' AND g.status='ready') OR ($3='drafts' AND (g.status IS NULL OR g.status<>'ready'))) ORDER BY " + order + " LIMIT $4 OFFSET $5").replace("POSITION_PLACEHOLDER", this.pg ? "STRPOS(LOWER(l.name),$2)>0" : "INSTR(LOWER(l.name),$2)>0"),
      [owner, options.search.toLowerCase(), options.filter, options.limit + 1, options.offset]);
    const more = found.length > options.limit;
    return { projects: found.slice(0, options.limit).map(r => JSON.parse(r.data) as Project), nextOffset: more ? options.offset + options.limit : null };
  }
  async admitJob(job: JobRecord, limits?: UsageLimits, chargeAi = false, replacement?: { previous: Project; next: Project }) {
    return this.atomic(admitJobProgram(job, !!this.pg, limits, chargeAi, replacement));
  }
  async claimJob(id: string, token: string, ttl = 120000) {
    const now = Date.now();
    const lock = this.pg ? " FOR UPDATE" : "";
    return this.atomic((function* (): SqlProgram<JobRecord | null> {
      const rows = yield { sql: "SELECT data FROM generations WHERE id=$1 AND status IN ('queued','planning','building','verifying','rendering')" + lock, params: [id] };
      if (!rows.length) return null;
      const claimed = yield { sql: "INSERT INTO job_leases (generation_id,token,expires) VALUES ($1,$2,$3) ON CONFLICT(generation_id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE job_leases.expires<=$4 RETURNING generation_id", params: [id, token, now + ttl, now] };
      return claimed.length ? JSON.parse(rows[0].data) : null;
    })());
  }
  async renewLease(id: string, token: string, ttl = 120000) {
    return (await this.rows("UPDATE job_leases SET expires=$1 WHERE generation_id=$2 AND token=$3 AND expires>$4 RETURNING generation_id", [Date.now() + ttl, id, token, Date.now()])).length === 1;
  }
  async releaseLease(id: string, token: string) {
    await this.exec("DELETE FROM job_leases WHERE generation_id=$1 AND token=$2", [id, token]);
  }
  async saveLeasedJob(previous: JobRecord, next: JobRecord, token: string) {
    const lock = this.pg ? " FOR UPDATE" : "";
    return this.atomic((function* (): SqlProgram<boolean> {
      // Use the same generation-then-lease lock order as claimJob. A stale attempt
      // cannot publish across a concurrent lease replacement on PostgreSQL.
      const current = yield { sql: "SELECT id FROM generations WHERE id=$1 AND owner_id=$2 AND data=$3" + lock,
        params: [previous.id, previous.ownerId, JSON.stringify(previous)] };
      if (!current.length) return false;
      const lease = yield { sql: "SELECT generation_id FROM job_leases WHERE generation_id=$1 AND token=$2 AND expires>$3" + lock,
        params: [previous.id, token, Date.now()] };
      if (!lease.length) return false;
      yield { sql: "UPDATE generations SET status=$1,data=$2 WHERE id=$3 RETURNING id",
        params: [next.status, JSON.stringify(next), previous.id] };
      return true;
    })());
  }
  async recoverableJobs(limit = 50) {
    const rows = await this.rows("SELECT id FROM generations WHERE status IN ('queued','planning','building','verifying','rendering') AND NOT EXISTS (SELECT 1 FROM job_leases WHERE generation_id=generations.id AND expires>$1) ORDER BY id LIMIT $2", [Date.now(), limit]);
    return rows.map(row => String(row.id));
  }
  async getProject(id: string, owner: string): Promise<Project | null> {
    const row = (
      await this.rows("SELECT data FROM projects WHERE id=$1 AND owner_id=$2", [
        id,
        owner,
      ])
    )[0];
    return row ? JSON.parse(row.data) : null;
  }
  async projects(owner: string): Promise<Project[]> {
    return (
      await this.rows("SELECT data FROM projects WHERE owner_id=$1", [owner])
    )
      .map((r) => JSON.parse(r.data))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async saveJob(j: JobRecord) {
    await this.exec(
      "INSERT INTO generations (id,project_id,owner_id,status,data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data",
      [j.id, j.projectId, j.ownerId, j.status, JSON.stringify(j)],
    );
  }
  async recordJobEvent(j: JobRecord) {
    const usage = j.plan?.usage;
    await this.exec(
      "INSERT INTO job_events (generation_id,owner_id,project_id,status,kind,engine,model,input_tokens,output_tokens,duration_ms,error_code,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(generation_id) DO UPDATE SET status=excluded.status,engine=excluded.engine,model=excluded.model,input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,duration_ms=excluded.duration_ms,error_code=excluded.error_code,updated_at=excluded.updated_at",
      [
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
      ],
    );
  }
  async operations(owner: string) {
    const counts = await this.rows(
      "SELECT status,COUNT(*) AS count FROM generations WHERE owner_id=$1 GROUP BY status",
      [owner],
    );
    const usage = (
      await this.rows(
        "SELECT COALESCE(SUM(input_tokens),0) AS input,COALESCE(SUM(output_tokens),0) AS output,COUNT(*) AS tracked FROM job_events WHERE owner_id=$1",
        [owner],
      )
    )[0];
    const recent = await this.rows(
      "SELECT generation_id,project_id,status,kind,engine,model,input_tokens,output_tokens,duration_ms,error_code,updated_at FROM job_events WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 40",
      [owner],
    );
    return {
      counts: Object.fromEntries(
        counts.map((r) => [r.status, Number(r.count)]),
      ),
      usage: {
        input: Number(usage.input),
        output: Number(usage.output),
        tracked: Number(usage.tracked),
      },
      recent,
    };
  }
  async recordPromptDraftUsage(ownerId: string, usage: { model: string; inputTokens: number; outputTokens: number }) {
    await this.exec(
      "INSERT INTO content_draft_events (id,owner_id,model,input_tokens,output_tokens,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [randomUUID(), ownerId, usage.model, usage.inputTokens, usage.outputTokens, new Date().toISOString()],
    );
  }
  async promptDraftUsage(ownerId: string) {
    const rows = await this.rows(
      "SELECT COALESCE(SUM(input_tokens),0) AS input,COALESCE(SUM(output_tokens),0) AS output,COUNT(*) AS tracked FROM content_draft_events WHERE owner_id=$1",
      [ownerId],
    );
    return { input: Number(rows[0].input), output: Number(rows[0].output), tracked: Number(rows[0].tracked) };
  }
  async compareAndSaveJob(previous: JobRecord, next: JobRecord) {
    const result = await this.exec(
      "UPDATE generations SET status=$1,data=$2 WHERE id=$3 AND owner_id=$4 AND data=$5",
      [
        next.status,
        JSON.stringify(next),
        previous.id,
        previous.ownerId,
        JSON.stringify(previous),
      ],
    );
    return (
      Number("rowCount" in result ? result.rowCount : result.changes) === 1
    );
  }
  async job(id: string, owner?: string): Promise<JobRecord | null> {
    const rows = owner
      ? await this.rows(
          "SELECT data FROM generations WHERE id=$1 AND owner_id=$2",
          [id, owner],
        )
      : await this.rows("SELECT data FROM generations WHERE id=$1", [id]);
    return rows[0] ? JSON.parse(rows[0].data) : null;
  }
  async jobsForProject(id: string, owner: string): Promise<JobRecord[]> {
    return (
      await this.rows(
        "SELECT data FROM generations WHERE project_id=$1 AND owner_id=$2",
        [id, owner],
      )
    )
      .map((r) => JSON.parse(r.data))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async queued(): Promise<JobRecord[]> {
    return (
      await this.rows("SELECT data FROM generations WHERE status='queued'")
    ).map((r) => JSON.parse(r.data));
  }
  async interruptJobs() {
    for (const row of await this.rows(
      "SELECT data FROM generations WHERE status IN ('planning','building','verifying','rendering')",
    )) {
      const j = JSON.parse(row.data);
      await this.saveJob({
        ...j,
        status: "failed",
        error: "PROCESS_INTERRUPTED",
        stage: "Process interrupted. You can retry safely.",
      });
    }
  }
  async deleteProject(id: string, owner: string) {
    const postgres = !!this.pg;
    return this.atomic((function* (): SqlProgram<void> {
      yield* ownerLock(owner, postgres);
      const active = yield { sql: "SELECT id FROM generations WHERE project_id=$1 AND owner_id=$2 AND status IN ('queued','planning','building','verifying','rendering')", params: [id, owner] };
      if (active.length) throw new Error("GENERATION_ACTIVE");
      yield { sql: "DELETE FROM job_leases WHERE generation_id IN (SELECT id FROM generations WHERE project_id=$1 AND owner_id=$2) RETURNING generation_id", params: [id, owner] };
      yield { sql: "DELETE FROM generations WHERE project_id=$1 AND owner_id=$2 RETURNING id", params: [id, owner] };
      yield { sql: "DELETE FROM project_listing WHERE id=$1 AND owner_id=$2 RETURNING id", params: [id, owner] };
      yield { sql: "DELETE FROM projects WHERE id=$1 AND owner_id=$2 RETURNING id", params: [id, owner] };
    })());
  }
  async close() {
    this.sqlite?.close();
    await this.pg?.end();
  }
}
