export const SLIDE_WIDTH = 13.333333;
export const SLIDE_HEIGHT = 7.5;
export const MAX_SOURCE_MOVE = 0.75;
export const MOVE_STEPS = [0.05, 0.1, 0.25];
/** Hitboxes use the same presentation-inch coordinate system as the PPTX scene.
 * Merge fragments belonging to the same immutable source block. Decorations,
 * images and arbitrary shapes never become movable targets. */
export function sourceHitboxes(slide, eligibleIds) {
    const eligible = new Set(eligibleIds);
    const boxes = new Map();
    for (const object of slide.objects) {
        const id = object.sourceId;
        if (!id || !eligible.has(id) || (object.type !== "text" && object.type !== "table"))
            continue;
        if (![object.x, object.y, object.w, object.h].every(Number.isFinite))
            continue;
        if (object.w <= 0 || object.h <= 0)
            continue;
        const old = boxes.get(id);
        if (!old) {
            boxes.set(id, { id, x: object.x, y: object.y, w: object.w, h: object.h });
        }
        else {
            const x = Math.min(old.x, object.x);
            const y = Math.min(old.y, object.y);
            const right = Math.max(old.x + old.w, object.x + object.w);
            const bottom = Math.max(old.y + old.h, object.y + object.h);
            boxes.set(id, { id, x, y, w: right - x, h: bottom - y });
        }
    }
    return Array.from(boxes.values());
}
/** Snap pointer motion in slide inches, and apply the same +/-0.75-inch source
 * limit enforced independently by the backend plan schema. */
export function snapMove(delta, step, existing) {
    if (!Number.isFinite(delta) || !MOVE_STEPS.includes(step) || !Number.isFinite(existing))
        return 0;
    const snapped = Math.round(delta / step) * step;
    const bound = Math.max(-MAX_SOURCE_MOVE - existing, Math.min(MAX_SOURCE_MOVE - existing, snapped));
    return Math.round(bound * 100) / 100;
}
