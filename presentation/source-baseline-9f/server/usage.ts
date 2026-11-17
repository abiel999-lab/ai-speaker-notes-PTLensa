import type { Config } from "./config.js";
import type { Repository } from "./repository.js";
export const usageLimits = (cfg: Config) => cfg.usageLimits || { generations: 25, ai: 50 };
export async function reserveUsage(repo: Repository, cfg: Config, owner: string, kind: "generations" | "ai") {
  if (!cfg.oidc) return; // Preserve the existing local, single-owner workflow.
  if (!(await repo.reserveUsage(owner, kind, usageLimits(cfg)[kind])))
    throw new Error("QUOTA_EXCEEDED");
}
