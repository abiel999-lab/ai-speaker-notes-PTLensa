import { textHeight, wrapText } from "./layout.js";
const SAFE_UNIT = /^(MWh\/day|kWh\/day|MW|MWp|m³\/day|t\/day|ha|%|USD\s*M|USD\s*B|Rp|people|orang)$/iu;
const LINE = /^\s*(?:[-•]\s*)?([\p{L}][\p{L}\p{N} &/().-]{2,37}?)\s*:\s*(.+)$/iu;
const NUMBER_UNIT = /(?:^|\s|=|:)\s*(?:USD\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(MWh\/day|kWh\/day|MWp?|m³\/day|t\/day|ha|%|USD\s*M|USD\s*B|Rp|people|orang)\s*\.?\s*$/iu;
const AGGREGATE = /\b(?:total|subtotal|surplus|demand|consumption|net|overall|sum|jumlah|keseluruhan|selisih|target|estimated|estimate|forecast|projection|prediksi|allocation|allocation\s+balance|balance|flow)\b/iu;
const UNSAFE = /[<>\[\]{}\n\r]/u;
const MAX_VALUE = 1e9;
const REGIONS = [
    { x: 7.25, y: 1.48, w: 5.15, h: 4.65 },
    { x: .85, y: 1.48, w: 5.15, h: 4.65 },
    { x: 7.25, y: 3.55, w: 5.15, h: 2.65 },
    { x: .85, y: 3.55, w: 5.15, h: 2.65 },
];
function intersects(a, b, pad = .12) {
    return Math.min(a.x + a.w + pad, b.x + b.w + pad) > Math.max(a.x - pad, b.x - pad) &&
        Math.min(a.y + a.h + pad, b.y + b.h + pad) > Math.max(a.y - pad, b.y - pad);
}
function normalizeUnit(unit) { return unit.replace(/\s+/gu, " ").toLowerCase(); }
function extract(source) {
    const entries = [];
    for (const line of source.split(/\r?\n/u)) {
        const match = line.match(LINE);
        if (!match)
            continue;
        const label = match[1].trim();
        if (AGGREGATE.test(label) || UNSAFE.test(label))
            continue;
        // Numeric facts are taken from the final explicit quantity on this line.
        const quantity = match[2].match(NUMBER_UNIT);
        if (!quantity || !SAFE_UNIT.test(quantity[2]))
            continue;
        const value = Number(quantity[1].replace(/,/gu, ""));
        if (!Number.isFinite(value) || value < 0 || value > MAX_VALUE)
            continue;
        if (normalizeUnit(quantity[2]) === "%" && value > 100)
            continue;
        entries.push({ label, value, unit: normalizeUnit(quantity[2]) });
    }
    return entries;
}
/** Only Creative slides, never template or arbitrary third-party scenes. */
function financeSeries(texts) {
    // Treat a financial time series as categorical data only when both the
    // header *and* the currency/scale appear literally on this same slide.
    const lines = texts.flatMap(t => t.split(/\r?\n/u)).map(t => t.trim());
    const joined = lines.join("\n");
    if (/\bYEAR\s*\|\s*REVENUE\s*\|\s*OPEX\s*\|\s*EBITDA\b/iu.test(joined) &&
        /\bUSD\s*M\s*\/\s*YEAR\b/iu.test(joined)) {
        const rows = lines.map(t => t.match(/^(20\d{2})\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*(\d+(?:\.\d+)?)\s*\|\s*(\d+(?:\.\d+)?)$/u)).filter((r) => !!r);
        if (rows.length >= 3 && rows.length <= 7 && new Set(rows.map(r => r[1])).size === rows.length &&
            rows.every(r => Number(r[4]) >= 0 && Number(r[4]) <= MAX_VALUE && Math.abs(Number(r[2]) - Number(r[3]) - Number(r[4])) < .01)) {
            return { unit: "USD M/year — EBITDA", labels: rows.map(r => r[1]), values: rows.map(r => Number(r[4])) };
        }
    }
    // Categorized CAPEX is safe only when the explicit USD-million total
    // reconciles with all categories and each row contains its percentage.
    if (/\bCAPEX\b/iu.test(joined) && /\bUSD\b/iu.test(joined)) {
        const total = joined.match(/\btotal\s+modelled\s+initial\s+CAPEX\s*:\s*USD\s*([\d,]+(?:\.\d+)?)\s*million\b/iu);
        if (total) {
            const rows = lines.map(t => t.match(/^([\p{L}][\p{L}\p{N} &/().-]{3,62})\s*:\s*(\d+(?:\.\d+)?)\s*M\s*\(\s*(\d+(?:\.\d+)?)%\s*\)\.?$/iu))
                .filter((r) => !!r);
            const totalM = Number(total[1].replace(/,/gu, ""));
            const sum = rows.reduce((n, r) => n + Number(r[2]), 0);
            const pct = rows.reduce((n, r) => n + Number(r[3]), 0);
            if (rows.length >= 3 && rows.length <= 7 && totalM > 0 &&
                Math.abs(sum - totalM) / totalM <= .002 && Math.abs(pct - 100) <= .1 &&
                new Set(rows.map(r => r[1].toLowerCase())).size === rows.length) {
                return { unit: "USD M — CAPEX", labels: rows.map(r => r[1]), values: rows.map(r => Number(r[2])) };
            }
        }
    }
    return null;
}
function eligibleSeries(slide) {
    if (!/^creative(?:-rescue)?-\d+$/u.test(slide.id))
        return null;
    const texts = slide.objects.filter(o => o.type === "text" && o.sourceId && o.text);
    if (!texts.length)
        return null;
    const finance = financeSeries(texts.map(t => t.text || ""));
    if (finance)
        return finance;
    const byUnit = new Map();
    for (const item of texts)
        for (const row of extract(item.text || "")) {
            const matching = byUnit.get(row.unit) || [];
            matching.push(row);
            byUnit.set(row.unit, matching);
        }
    const groups = [...byUnit.values()].filter(rows => rows.length >= 3 && rows.length <= 7 &&
        new Set(rows.map(r => r.label.toLowerCase())).size === rows.length && rows.some(r => r.value > 0));
    if (!groups.length)
        return null;
    groups.sort((a, b) => b.length - a.length);
    if (groups[1] && groups[0].length === groups[1].length)
        return null;
    const values = groups[0];
    return { unit: values[0].unit, labels: values.map(v => v.label), values: values.map(v => v.value) };
}
/** Never place a chart over any content, images, or decorative shapes. */
export function planNativeChart(slide) {
    const series = eligibleSeries(slide);
    if (!series)
        return null;
    const occupied = slide.objects.filter(o => !(o.type === "image" && o.backgroundImage));
    const region = REGIONS.find(r => !occupied.some(o => intersects(r, o)));
    if (!region)
        return null;
    return { region, ...series };
}
const CHART_FIRST_REGION = { x: 6.98, y: 4.00, w: 5.36, h: 2.75 };
/**
 * Phase 10J: opt-in, deterministic reflow for an otherwise unchartable Creative
 * slide. All source text objects remain in the same order, with the exact same
 * sourceId and content. The caller MUST validate the resulting scene against
 * the immutable source; this function never bypasses source or geometry QA.
 *
 * Intentionally conservative: do not move user-supplied images, tables,
 * decorative objects, interactive links, or unusual layouts.
 */
export function reserveNativeChartSpace(slide) {
    const series = eligibleSeries(slide);
    if (!series || planNativeChart(slide))
        return null;
    if (!/^creative-\d+$/u.test(slide.id))
        return null;
    const items = slide.objects;
    if (items.length < 4 || items.length > 22 || items.some(o => o.type !== "text" || !o.text || !o.sourceId || o.targetSlide != null))
        return null;
    const header = items[0];
    if (!/^\s*(?:=+\s*)?SLIDE\s+\d+\s+OF\s+\d+\s*:/iu.test(header.text || ""))
        return null;
    const availableFonts = [18, 16, 14];
    const sideColumns = { leftX: .72, rightX: 6.93, width: 5.64 };
    const headerX = .72, headerWidth = 11.88, headerY = .48;
    const gap = .105;
    // Preserve typography quality before accepting smaller fonts. A source
    // segment needing more space than either column is not safe for chart-first.
    const measured = (o, w, f) => {
        if (!o.text)
            return Infinity;
        const lines = o.text.split("\n").flatMap(t => wrapText(t, w, f, o.bold));
        return textHeight(lines.length, f) * 1.15 + .12;
    };
    for (const baseFont of availableFonts) {
        const headFont = Math.max(14, Math.min(header.fontSize || 22, 22));
        const headH = measured(header, headerWidth, headFont);
        const startY = headerY + headH + .20;
        if (startY >= 3.62)
            continue;
        const body = items.slice(1);
        const fontSizes = body.map(o => Math.max(14, Math.min(o.fontSize || 16, baseFont)));
        const heights = body.map((o, i) => measured(o, sideColumns.width, fontSizes[i]));
        if (heights.some(h => !Number.isFinite(h) || h > 5.5))
            continue;
        // The first (left) column is full height; the second (right) column
        // stops above the native chart. Source-reading order is left, then right.
        for (let split = body.length; split >= 1; split--) {
            let leftY = startY, rightY = startY;
            const placed = [{ ...header, x: headerX, y: headerY,
                    w: headerWidth, h: headH, fontSize: headFont }];
            for (const [idx, o] of body.entries()) {
                const right = idx >= split;
                const y = right ? rightY : leftY;
                const h = heights[idx];
                placed.push({ ...o, x: right ? sideColumns.rightX : sideColumns.leftX,
                    y, w: sideColumns.width, h, fontSize: fontSizes[idx] });
                if (right)
                    rightY += h + gap;
                else
                    leftY += h + gap;
            }
            if (leftY - gap > 6.83 || rightY - (split === body.length ? 0 : gap) > 3.72)
                continue;
            // Reserve generous whitespace around native chart and source objects.
            if (placed.some(o => intersects(o, CHART_FIRST_REGION, .065)))
                continue;
            return { slide: { ...slide, objects: placed }, chart: { ...series, region: CHART_FIRST_REGION } };
        }
    }
    return null;
}
