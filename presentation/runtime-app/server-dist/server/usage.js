export const usageLimits = (cfg) => cfg.usageLimits || { generations: 25, ai: 50 };
export async function reserveUsage(repo, cfg, owner, kind) {
    if (!cfg.oidc)
        return; // Preserve the existing local, single-owner workflow.
    if (!(await repo.reserveUsage(owner, kind, usageLimits(cfg)[kind])))
        throw new Error("QUOTA_EXCEEDED");
}
