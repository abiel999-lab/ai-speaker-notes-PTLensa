import { createHash, timingSafeEqual } from "node:crypto";
// The caller must also be on the dedicated internal Docker network.
// Nginx must reject /api/internal/admin/ paths at the public edge.
export const ADMIN_METRICS_PATH = "/api/internal/admin/metrics";
export function authorizedAdminMetrics(header, secret) {
    if (!secret || secret.length < 48 || !header?.startsWith("Bearer ") || header.length > 300)
        return false;
    const supplied = header.slice(7);
    const a = createHash("sha256").update(secret).digest();
    const b = createHash("sha256").update(supplied).digest();
    return timingSafeEqual(a, b);
}
