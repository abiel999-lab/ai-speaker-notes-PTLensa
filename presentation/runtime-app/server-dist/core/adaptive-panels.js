import { THEMES } from "./palette.js";
/**
 * Adaptive source-safe visual composition for narrative/editorial slides.
 * No text, source IDs, source order, slide count, AI choices or charts are invented.
 * A complete, short list can become an editable 2- or 3-column panel system
 * even if Luna selected a generic editorial/columns layout.
 */
export function composeAdaptivePanels(slide, doc, theme, wrap, height, fontScale = 1, accentOverride) {
    if (!["editorial", "columns", "statement", "cards", "process", "timeline"].includes(slide.layout))
        return false;
    if (slide.objects.some(o => o.type === "table" || o.type === "image"))
        return false;
    const source = new Map(doc.blocks.map(b => [b.id, b]));
    const texts = slide.objects.filter(o => o.type === "text" && o.sourceId);
    const lists = texts.filter(o => source.get(o.sourceId)?.kind === "list");
    if (lists.length < 2 || lists.length > 6)
        return false;
    if (new Set(lists.map(o => o.sourceId)).size !== lists.length)
        return false;
    if (lists.some(o => o.text !== source.get(o.sourceId)?.text))
        return false;
    const start = texts.indexOf(lists[0]);
    if (start < 0 || texts.slice(start).some(o => !lists.includes(o)))
        return false;
    const lead = texts.slice(0, start);
    // Complex or long introductions and non-source comments keep the old layout.
    if (lead.length > 2 || lead.some(o => o.y + o.h > 3.1))
        return false;
    if (lead.some(o => source.get(o.sourceId)?.kind === "list"))
        return false;
    if (lead.reduce((n, o) => n + (o.text || "").length, 0) > 280)
        return false;
    // Three concise items make a three-column panel; otherwise row-major pairs.
    const columns = lists.length === 3 && lists.every(o => (o.text || "").length <= 135) ? 3 : 2;
    const maxItemChars = columns === 3 ? 135 : 180;
    if (lists.some(o => (o.text || "").length > maxItemChars))
        return false;
    const size = Math.max(16, 17 * fontScale);
    const left = 0.65, right = 12.64, gapX = 0.21, gapY = 0.20;
    const cardW = (right - left - gapX * (columns - 1)) / columns;
    const textW = cardW - 0.52;
    const placed = lists.map(o => {
        const lines = wrap(o.text || "", textW, size);
        return { o, lines, h: Math.max(1.05, height(lines.length, size) + 0.41) };
    });
    const rows = Math.ceil(placed.length / columns);
    const heights = Array.from({ length: rows }, (_, row) => Math.max(...placed.slice(row * columns, (row + 1) * columns).map(x => x.h)));
    const startY = Math.max(1.60, ...lead.map(o => o.y + o.h + 0.31));
    if (startY + heights.reduce((a, b) => a + b, 0) + gapY * (rows - 1) > 6.70)
        return false;
    const palette = THEMES[theme];
    const accent = accentOverride || palette.accent;
    const shapes = [];
    let y = startY;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            const p = placed[row * columns + col];
            if (!p)
                continue;
            const x = left + col * (cardW + gapX);
            // Native PowerPoint card, top highlight and outer accent, behind source text.
            shapes.push({ type: "shape", shape: "rect", x, y, w: cardW, h: heights[row], fill: palette.panel });
            shapes.push({ type: "shape", shape: "rect", x, y, w: cardW, h: 0.058, fill: accent });
            shapes.push({ type: "shape", shape: "rect", x: x + 0.18, y: y + 0.22, w: 0.047, h: Math.min(0.34, heights[row] - 0.39), fill: accent });
            p.o.x = x + 0.31;
            p.o.y = y + (heights[row] - height(p.lines.length, size)) / 2;
            p.o.w = textW;
            p.o.h = height(p.lines.length, size);
            p.o.fontSize = size;
            p.o.lines = p.lines;
            p.o.text = p.lines.join("");
        }
        y += heights[row] + gapY;
    }
    // Only discard default process-card backgrounds and tiny list bullets.
    // Never delete source-bearing text, table, media, or arbitrary larger artwork.
    slide.objects = slide.objects.filter(o => !(o.type === "shape" && ((o.shape === "rect" && o.w > 5 && o.x < 1 && o.y > 0.74 && o.y < 6.75 && o.h > 0.17 && o.h < 3.5) ||
        (o.shape === "ellipse" && o.w <= 0.16 && o.h <= 0.16 && o.x >= 0.64 && o.x < 7.5 && o.y >= 0.86))));
    slide.objects.unshift(...shapes);
    return true;
}
