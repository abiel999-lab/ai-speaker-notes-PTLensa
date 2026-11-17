import { THEMES } from "./palette.js";
/** Exact source URL references, laid out in readable full-width bibliography rows.
 * Returns false if reference text is split, changed or cannot fit on one slide.
 * Does not remove or reorder source objects or create any textual citation.
 */
export function composeReferenceRows(slide, doc, theme, wrap, height, fontScale = 1, accentOverride) {
    if (!["columns", "editorial"].includes(slide.layout))
        return false;
    const source = new Map(doc.blocks.map(b => [b.id, b]));
    const texts = slide.objects.filter(o => o.type === "text" && o.sourceId);
    if (texts.length < 2 || texts.length > 9)
        return false;
    if (slide.objects.some(o => o.type === "table" || o.type === "image"))
        return false;
    if (texts.some(o => source.get(o.sourceId)?.kind !== "reference" || o.text !== source.get(o.sourceId)?.text))
        return false;
    if (new Set(texts.map(o => o.sourceId)).size !== texts.length)
        return false;
    const size = Math.max(16, 17 * fontScale), width = 10.96;
    const placed = texts.map(o => ({ o, lines: wrap(o.text || "", width, size) }));
    const heights = placed.map(p => Math.max(0.64, height(p.lines.length, size) + 0.24));
    const gap = 0.11;
    if (1.07 + heights.reduce((sum, h) => sum + h, 0) + gap * (heights.length - 1) > 6.83)
        return false;
    const palette = THEMES[theme];
    const accent = accentOverride || palette.accent;
    const shapes = [];
    let y = 1.07;
    for (let i = 0; i < placed.length; i++) {
        const { o, lines } = placed[i];
        const h = heights[i];
        shapes.push({ type: "shape", shape: "rect", x: 0.70, y, w: 11.94, h, fill: palette.panel });
        shapes.push({ type: "shape", shape: "rect", x: 0.70, y, w: 0.066, h, fill: accent });
        o.x = 1.09;
        o.y = y + (h - height(lines.length, size)) / 2;
        o.w = width;
        o.h = height(lines.length, size);
        o.fontSize = size;
        o.lines = lines;
        o.text = lines.join("");
        y += h + gap;
    }
    slide.objects.unshift(...shapes);
    return true;
}
