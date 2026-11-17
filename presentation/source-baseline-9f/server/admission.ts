import { ownerLock, type SqlProgram } from "./sql-program.js";
import type { Project } from "../core/types.js";
import type { JobRecord } from "./repository.js";
import type { UsageLimits } from "./auth-config.js";
export function* admitJobProgram(job: JobRecord, postgres: boolean, limits?: UsageLimits, chargeAi = false, replacement?: { previous: Project; next: Project }): SqlProgram<void> {
  yield* ownerLock(job.ownerId, postgres);
  const project = yield { sql: "SELECT data FROM projects WHERE id=$1 AND owner_id=$2" + (postgres ? " FOR UPDATE" : ""), params: [job.projectId, job.ownerId] };
  if (!project.length) throw new Error("PROJECT_NOT_FOUND");
  if (replacement && (project[0].data !== JSON.stringify(replacement.previous) ||
    replacement.next.id !== job.projectId || replacement.next.ownerId !== job.ownerId)) throw new Error("PROJECT_CONFLICT");
  const active = yield { sql: "SELECT project_id FROM generations WHERE owner_id=$1 AND status IN ('queued','planning','building','verifying','rendering')", params: [job.ownerId] };
  if (active.some(row => row.project_id === job.projectId)) throw new Error("GENERATION_ACTIVE");
  if (active.length >= 2) throw new Error("TOO_MANY_ACTIVE_JOBS");
  if (limits) {
    const day = new Date().toISOString().slice(0, 10);
    for (const kind of chargeAi ? ["generations", "ai"] as const : ["generations"] as const) {
      const reserved = yield {
        sql: "INSERT INTO usage_buckets (owner_id,day,kind,used) VALUES ($1,$2,$3,1) ON CONFLICT(owner_id,day,kind) DO UPDATE SET used=usage_buckets.used+1 WHERE usage_buckets.used<$4 RETURNING used",
        params: [job.ownerId, day, kind, limits[kind]],
      };
      if (!reserved.length) throw new Error("QUOTA_EXCEEDED");
    }
  }
  yield { sql: "INSERT INTO generations (id,project_id,owner_id,status,data) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    params: [job.id, job.projectId, job.ownerId, job.status, JSON.stringify(job)] };
  const linked = { ...(replacement?.next || JSON.parse(project[0].data)), latestId: job.id, updatedAt: job.createdAt };
  yield { sql: "UPDATE projects SET data=$1 WHERE id=$2 AND owner_id=$3 RETURNING id",
    params: [JSON.stringify(linked), job.projectId, job.ownerId] };
  yield { sql: "UPDATE project_listing SET latest_id=$1,updated_at=$2 WHERE id=$3 AND owner_id=$4 RETURNING id",
    params: [job.id, job.createdAt, job.projectId, job.ownerId] };
}
