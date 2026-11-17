/** Phase 10K — an editable, source-exact editorial cover treatment.
 * Safe-by-default: only opt in when the source explicitly marks slide one as
 * a cover, no user objects/links/images are present, and content still fits.
 */
import { wrapText, textHeight } from "./layout.js";
const W = 13.333333, H = 7.5;
const HEX = /^#[0-9a-fA-F]{6}$/u;
const COVER = /^\s*(?:={3,}\s*)?SLIDE\s+0*1\s+OF\s+\d+\s*:\s*COVER\b/iu;
function touches(a, b, pad = 0) {
    return Math.min(a.x + a.w + pad, b.x + b.w + pad) > Math.max(a.x - pad, b.x - pad) &&
        Math.min(a.y + a.h + pad, b.y + b.h + pad) > Math.max(a.y - pad, b.y - pad);
}
function luminosity(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
        .reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
}
const block = (x, y, w, h, fill, opacity = 1) => ({ type: "shape", shape: "rect", x, y, w, h, fill, fillOpacity: opacity });
const ring = (x, y, w, h, fill, opacity = 1) => ({ type: "shape", shape: "ellipse", x, y, w, h, fill, fillOpacity: opacity });
const trace = (x, y, w, h, fill, opacity = 1) => ({ type: "shape", shape: "line", x, y, w, h, fill, fillOpacity: opacity, stroke: fill, strokeWidth: 1 });
/** A subject-neutral systems motif, composed of editable native shapes.
 * It does not introduce fabricated text, statistics, or illustrative claims. */
export function coverArtwork(accent, panel) {
    const art = [
        block(7.42, 1.46, 5.26, 5.30, panel, .88),
        block(7.42, 1.46, .06, 5.30, accent, .82),
        ring(8.13, 1.78, 3.90, 3.90, accent, .12),
        ring(8.67, 2.32, 2.82, 2.82, panel, .57),
        ring(9.25, 2.90, 1.66, 1.66, accent, .30),
        ring(9.76, 3.42, .64, .64, accent, .80),
    ];
    for (let i = 0; i < 3; i++) {
        const x = 8.11 + i * 1.37, y = 5.12 - (i % 2) * .20;
        art.push(block(x, y, 1.18, .115, accent, .62));
        art.push(block(x + .16, y - .60, .23, .56, accent, .24));
        art.push(block(x + .59, y - .90, .25, .86, accent, .28));
    }
    for (let i = 0; i < 5; i++)
        art.push(trace(7.86, 5.91 + i * .13, 4.30, 0, accent, .18));
    art.push(trace(8.14, 5.27, 3.62, 0, accent, .45));
    art.push(trace(8.78, 5.27, 0, .65, accent, .45));
    art.push(trace(11.40, 4.76, 0, 1.15, accent, .45));
    return art;
}
/** Every source-bearing object remains in its original order, with exactly
 * the same sourceId and text. Caller re-validates against immutable source. */
export function composeCreativeCover(slide, accent, panel) {
    if (slide.id !== "creative-0" || slide.objects.length < 4 || slide.objects.length > 9 ||
        !HEX.test(accent) || !HEX.test(panel) || !HEX.test(slide.background))
        return null;
    const source = slide.objects;
    if (source.some(o => o.type !== "text" || !o.text || !o.sourceId || o.targetSlide != null))
        return null;
    if (!COVER.test(source[0].text || ""))
        return null;
    const dark = luminosity(slide.background) <= .20;
    const fg = dark ? "#F5FAFF" : "#17243A", muted = dark ? "#C7D5DF" : "#344961";
    const choices = [[14, 40, 27, 17, 15, 14, 14, 14, 14],
        [14, 36, 24, 16, 14, 14, 14, 14, 14],
        [14, 32, 21, 15, 14, 14, 14, 14, 14]];
    for (const sizes of choices) {
        const header = source[0];
        const firstLines = (header.text || "").split("\n").flatMap(t => wrapText(t, 11.8, 14, false));
        const firstHeight = Math.max(.72, textHeight(firstLines.length, 14) * 1.25 + .20);
        if (firstHeight > 1.08)
            continue;
        // Full-width kicker above both columns: long literal source markers must
        // not spill into the monumental cover title or the art panel.
        const placed = [{ ...header, x: .74, y: .37, w: 11.8, h: firstHeight,
                fontSize: 14, bold: false, color: muted, align: "left", lines: firstLines }];
        let y = Math.max(1.54, .37 + firstHeight + .26), failed = false;
        for (const [offset, o] of source.slice(1).entries()) {
            const i = offset + 1, fontSize = sizes[i] || 14, bold = i === 1 || i === 2;
            const lines = (o.text || "").split("\n").flatMap(t => wrapText(t, 6.06, fontSize, bold));
            const h = textHeight(lines.length, fontSize) * 1.15 + .17;
            if (!Number.isFinite(h) || h > 2) {
                failed = true;
                break;
            }
            placed.push({ ...o, x: .74, y, w: 6.06, h, fontSize, bold,
                color: i === 1 && dark ? accent : i === 1 || i === 2 ? fg : muted, align: "left", lines });
            y += h + (i < 3 ? .16 : .12);
        }
        if (failed || y > 6.95)
            continue;
        const artwork = coverArtwork(accent, panel);
        if (artwork.some(a => placed.some(t => touches(a, t, .035))))
            continue;
        if (placed.some(o => o.x < 0 || o.y < 0 || o.x + o.w > W || o.y + o.h > H))
            continue;
        return { ...slide, objects: [...artwork, ...placed] };
    }
    return null;
}
/** Non-content geometry in checked margins. Never places art over actual
 * text, tables, images or the reserved chart zone. */
export function marginGraphics(slide, index, total, accent, chartRegion) {
    if (!/^creative-\d+$/u.test(slide.id) || !HEX.test(accent) || total < 1 || index < 0)
        return [];
    const occupied = slide.objects.filter(o => o.type !== "shape" && !(o.type === "image" && o.backgroundImage));
    const candidates = [block(0, 0, W, .065, accent, .82),
        block(.16, .68, .065, 1.20, accent, .72),
        trace(.74, 7.29, 11.84 * Math.min(1, (index + 1) / total), 0, accent, .70)];
    return candidates.filter(a => a.x + a.w <= W + .001 && a.y + a.h <= H &&
        !occupied.some(o => touches(a, o, .09)) && (!chartRegion || !touches(a, chartRegion, .09)));
}
