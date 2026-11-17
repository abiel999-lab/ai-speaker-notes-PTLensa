/** Phase 10L — Source-grounded, editable visual compositions.
 * Never invents data or textual labels. It may only reposition intact source
 * blocks for narrowly recognised content patterns and may always decline.
 */
import { textHeight, wrapText } from "./layout.js";
const W = 13.333333, H = 7.5;
const MARKER = /^\s*(?:={3,}\s*)?SLIDE\s+\d+\s+OF\s+\d+\s*:/iu;
const YEAR = /^\s*(?:19|20)\d{2}\s*[/—–-]/u;
const ALTERNATIVE = /^\s*(?:SITE|OPTION|ALTERNATIVE)\s+([A-D])\s*[/—–:-]/iu;
const SCENARIOS = [/^\s*UPSIDE\s*[—–:-]/iu, /^\s*BASE\s*[—–:-]/iu, /^\s*STRESS\s*[—–:-]/iu];
const COLOR = /^#[0-9a-fA-F]{6}$/u;
const txt = (o) => o.text || "";
const bar = (x, y, w, h, fill, opacity = 1) => ({ type: "shape", shape: "rect", x, y, w, h, fill, fillOpacity: opacity });
const line = (x, y, w, h, stroke) => ({ type: "shape", shape: "line", x, y, w, h, stroke, strokeWidth: 1.8, fill: stroke, fillOpacity: .9 });
const dot = (x, y, size, fill) => ({ type: "shape", shape: "ellipse", x, y, w: size, h: size, fill });
function place(o, x, y, w, maxH, size, bold = false) {
    if (!Number.isFinite(x + y + w + maxH + size) || w < 1 || size < 14 || x < 0 || y < 0 || x + w > W)
        return null;
    const lines = txt(o).split("\n").flatMap(s => wrapText(s, w, size, bold));
    const h = textHeight(lines.length, size) * 1.17 + .11;
    if (h > maxH || y + h > H)
        return null;
    return { ...o, x, y, w, h, fontSize: size, bold, align: "left", lines };
}
function kicker(o) {
    return place(o, .74, .30, 11.83, .78, 14);
}
function safeSourceOnly(s) {
    if (!/^creative-\d+$/u.test(s.id) || s.objects.length < 6 || s.objects.length > 12)
        return false;
    return s.objects.every(o => o.type === "text" && !!o.sourceId && !!o.text && o.targetSlide == null &&
        Math.abs(o.x - .7) < .4 && o.w > 9.7 && o.y >= 0 && o.y + o.h <= H + .01);
}
function complete(s, placed, drawn) {
    if (placed.length !== s.objects.length || placed.some((o, i) => o.sourceId !== s.objects[i].sourceId || o.text !== s.objects[i].text))
        return null;
    const all = [...drawn, ...placed];
    if (all.some(o => o.x < 0 || o.y < 0 || o.x + o.w > W + .0001 || o.y + o.h > H + .0001))
        return null;
    // No native diagram may cover source text, even if a validator changes.
    if (drawn.some(a => placed.some(t => Math.min(a.x + a.w, t.x + t.w) > Math.max(a.x, t.x) &&
        Math.min(a.y + a.h, t.y + t.h) > Math.max(a.y, t.y))))
        return null;
    return { ...s, objects: all };
}
function comparison(s, accent) {
    const objects = s.objects;
    if (objects.length !== 8)
        return null;
    const alternatives = objects.slice(3, 7);
    if (alternatives.map(o => ALTERNATIVE.exec(txt(o))?.[1]?.toUpperCase()).join("") !== "ABCD")
        return null;
    const head = kicker(objects[0]), title = place(objects[1], .76, 1.20, 11.8, .61, 19, true), intro = place(objects[2], .76, 1.91, 11.8, .62, 14), ending = place(objects[7], .76, 6.16, 11.8, .79, 14, true);
    if (!head || !title || !intro || !ending)
        return null;
    const cards = [];
    const graphics = [];
    for (let i = 0; i < 4; i++) {
        const x = i % 2 === 0 ? .97 : 7.08, y = i < 2 ? 2.72 : 4.25;
        const item = place(alternatives[i], x, y + .22, 5.28, 1.22, 14);
        if (!item)
            return null;
        cards.push(item);
        graphics.push(bar(x - .22, y + .20, .075, 1.11, accent, .84));
        // Horizontal boundaries and lane separator live entirely outside text.
        graphics.push(line(x - .20, y, 5.63, 0, accent));
    }
    return complete(s, [head, title, intro, ...cards, ending], graphics);
}
function timeline(s, accent) {
    const objects = s.objects, steps = objects.slice(2, -1);
    if (steps.length < 4 || steps.length > 7 || !steps.every(o => YEAR.test(txt(o))))
        return null;
    const head = kicker(objects[0]), title = place(objects[1], .76, 1.16, 11.8, .65, 19, true), ending = place(objects[objects.length - 1], .76, 6.43, 11.8, .67, 14, true);
    if (!head || !title || !ending)
        return null;
    const placed = [head, title], graphics = [];
    const top = 2.05, bottom = 5.74, step = (bottom - top) / (steps.length - 1);
    graphics.push(line(1.30, top + .12, 0, bottom - top, accent));
    for (let i = 0; i < steps.length; i++) {
        const y = top + i * step;
        const item = place(steps[i], 2.08, y - .06, 10.36, step - .03, 14, i === steps.length - 1);
        if (!item)
            return null;
        placed.push(item);
        graphics.push(dot(1.19, y, .24, accent), line(1.44, y + .12, .40, 0, accent));
    }
    placed.push(ending);
    return complete(s, placed, graphics);
}
function scenario(s, accent) {
    const objects = s.objects;
    if (objects.length < 7 || objects.length > 10 || !SCENARIOS.every((rx, i) => rx.test(txt(objects[2 + i]))))
        return null;
    const head = kicker(objects[0]), title = place(objects[1], .76, 1.20, 11.8, .67, 19, true);
    if (!head || !title)
        return null;
    const placed = [head, title], graphics = [];
    for (let i = 0; i < 3; i++) {
        const y = 2.06 + i * .77;
        const item = place(objects[i + 2], 2.19, y, 10.19, .65, 15, true);
        if (!item)
            return null;
        placed.push(item);
        graphics.push(dot(1.24, y + .16, .27, accent), line(1.51, y + .29, .43, 0, accent));
    }
    graphics.push(line(1.13, 2.34, 0, 1.54, accent));
    const remaining = objects.slice(5);
    const count = remaining.length;
    for (let i = 0; i < count; i++) {
        const y = 4.48 + i * (2.14 / count);
        const item = place(remaining[i], .76, y, 11.8, 2.05 / count, 14, i === 0);
        if (!item)
            return null;
        placed.push(item);
    }
    return complete(s, placed, graphics);
}
/** Validated by the export caller against the immutable document. */
export function composeSourceInfographic(slide, accent) {
    if (!COLOR.test(accent) || !safeSourceOnly(slide) || !MARKER.test(txt(slide.objects[0])))
        return null;
    try {
        return comparison(slide, accent) || timeline(slide, accent) || scenario(slide, accent);
    }
    catch {
        // Unsupported typography or complex source means retain Luna's scene.
        return null;
    }
}
