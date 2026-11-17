import { THEMES } from "./palette.js";
// Visual layout pass: never generates, removes, reorders or rewrites source-bearing text.
// Works with complete, small list blocks only; unusually dense content remains in the
// original deterministic layout. All geometry is in PowerPoint inches.
export function composeNativeCards(slide, doc, theme, wrap, height, fontScale = 1, accentOverride) {
    if (slide.layout !== "cards" && slide.layout !== "process")
        return false;
    const content = slide.objects.filter((o) => o.type === "text" && o.sourceId);
    const source = new Map(doc.blocks.map((block) => [block.id, block]));
    const lists = content.filter((o) => source.get(o.sourceId)?.kind === "list");
    if (lists.length < 3 || lists.length > 6)
        return false;
    if (new Set(lists.map((o) => o.sourceId)).size !== lists.length)
        return false;
    if (lists.some((o) => (o.text || "").length > 155))
        return false;
    const firstList = content.indexOf(lists[0]);
    if (firstList < 0 || content.slice(firstList).some((o) => !lists.includes(o)))
        return false;
    const prior = content.slice(0, firstList);
    if (prior.some((o) => o.y + o.h > 3.8))
        return false;
    const startY = Math.max(1.56, ...prior.map((o) => o.y + o.h + 0.29));
    const size = 18 * fontScale;
    const gapX = 0.22;
    const cardW = (12.03 - gapX) / 2;
    const textW = cardW - 0.51;
    const placements = lists.map((object) => {
        const text = object.text || "";
        const lines = wrap(text, textW, size);
        return { object, lines, h: Math.max(0.86, height(lines.length, size) + 0.32) };
    });
    const rows = Math.ceil(lists.length / 2);
    const heights = Array.from({ length: rows }, (_, row) => Math.max(...placements.slice(row * 2, row * 2 + 2).map((p) => p.h)));
    const gapY = 0.20;
    if (startY + heights.reduce((n, h) => n + h, 0) + gapY * (rows - 1) > 6.75)
        return false;
    const palette = THEMES[theme];
    const backdrops = [];
    let y = startY;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < 2; col++) {
            const entry = placements[row * 2 + col];
            if (!entry)
                continue;
            const x = 0.64 + col * (cardW + gapX);
            backdrops.push({ type: "shape", shape: "rect", x, y, w: cardW, h: heights[row], fill: palette.panel });
            backdrops.push({ type: "shape", shape: "rect", x, y, w: 0.065, h: heights[row], fill: accentOverride || palette.accent });
            entry.object.x = x + 0.25;
            entry.object.y = y + (heights[row] - height(entry.lines.length, size)) / 2;
            entry.object.w = textW;
            entry.object.h = height(entry.lines.length, size);
            entry.object.lines = entry.lines;
            entry.object.text = entry.lines.join("");
            entry.object.fontSize = size;
        }
        y += heights[row] + gapY;
    }
    // Eliminate old full-row rectangles and bullets emitted by the basic
    // process/cards template. Never delete source-bearing content.
    slide.objects = slide.objects.filter((o) => !(o.type === "shape" &&
        ((o.shape === "rect" && o.w > 5 && o.y > 0.74 && o.y < 6.75 && o.h > 0.17 && o.h < 3.5) ||
            (o.shape === "ellipse" && o.w <= 0.16 && o.h <= 0.16 && o.x >= 0.64 && o.x < 7.5))));
    slide.objects.unshift(...backdrops);
    return true;
}
