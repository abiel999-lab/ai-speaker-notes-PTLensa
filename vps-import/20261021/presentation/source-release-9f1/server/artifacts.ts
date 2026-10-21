import path from "node:path";
import type { JobRecord } from "./repository.js";
export function generationDirectory(root: string, job: JobRecord) {
  const base = path.join(root, "exports", job.projectId, job.id);
  if (!job.artifactId) return base; // Existing 8G/9A exports keep their original paths.
  if (!/^[a-f0-9-]{36}$/.test(job.artifactId)) throw new Error("EXPORT_CORRUPTED");
  return path.join(base, "artifacts", job.artifactId);
}
