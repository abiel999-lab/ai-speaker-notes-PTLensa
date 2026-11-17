import { validateOidc } from "./auth-config.js";
import { isLoopbackOrigin } from "./local-boundary.js";
// Executed before opening a listener or connecting to a customer database.
// A public instance must never fall back to the legacy anonymous workspace.
export function validateProductionConfig(cfg) {
    if (!cfg.production)
        return;
    if (!cfg.oidc)
        throw new Error("Public production requires authentication and tenant isolation");
    if (!cfg.origin || !cfg.origin.startsWith("https://") ||
        isLoopbackOrigin(cfg.origin) || cfg.localAdmin)
        throw new Error("Production requires HTTPS APP_ORIGIN and disabled local admin");
    if (!cfg.database || !cfg.redis)
        throw new Error("Production requires persistent PostgreSQL and Redis");
    if (!cfg.key || !cfg.key.trim())
        throw new Error("Production requires an OpenAI API key");
    if (cfg.adminMetricsToken && cfg.adminMetricsToken.length < 48)
        throw new Error("Production admin metrics token must be at least 48 characters");
    if (cfg.model !== "gpt-6-luna")
        throw new Error("Production requires GPT-6 Luna");
    validateOidc(cfg.oidc, cfg.origin, true);
}
export function allowedRequestHost(host, cfg) {
    if (!host || host.includes(",") || host.includes("/") || host.includes("@"))
        return false;
    if (cfg.production) {
        try {
            return host.toLowerCase() === new URL(cfg.origin).host.toLowerCase();
        }
        catch {
            return false;
        }
    }
    try {
        const { hostname, pathname, search, hash } = new URL("http://" + host);
        return pathname === "/" && !search && !hash &&
            (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]");
    }
    catch {
        return false;
    }
}
