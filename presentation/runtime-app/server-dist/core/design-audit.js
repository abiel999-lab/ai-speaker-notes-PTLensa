const AREA = 13.333333 * 7.5;
const marker = /^\s*(?:={3,}\s*)?(?:slide|halaman)\s+0*\d+\s*(?:(?:of|dari)\s+0*\d+)?\s*[:=—–-]/iu;
const clamp = (n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
const area = (o) => Math.max(0, o.w) * Math.max(0, o.h);
const isSourceText = (o) => o.type === "text" && !!o.sourceId;
function signature(s, charts) {
    const objects = s.objects;
    const texts = objects.filter(isSourceText);
    const img = objects.some(o => o.type === "image");
    const shapes = objects.filter(o => o.type === "shape").length;
    const left = texts.filter(o => o.x + o.w / 2 < 6.667).length;
    const right = texts.length - left;
    const twoCol = left > 1 && right > 1;
    const top = texts.filter(o => o.y < 2.2).length;
    const centroid = texts.length ? texts.reduce((n, o) => n + o.x + o.w / 2, 0) / texts.length : 6.667;
    const lateralBias = centroid < 5.45 ? "L" : centroid > 7.9 ? "R" : "C";
    return [lateralBias, img ? "I" : "N", charts ? "C" : "N", shapes >= 5 ? "G" : shapes ? "g" : "N", twoCol ? "2" : "1", top > 3 ? "T" : "M", Math.round(texts.length / 4)].join(":");
}
/** Optional chart distribution must be supplied by the actual exporter. */
export function auditDesignScene(scene, chartsPerSlide = []) {
    const signatures = new Map();
    const bySlide = [];
    for (const [index, slide] of scene.slides.entries()) {
        const texts = slide.objects.filter(isSourceText), pictures = slide.objects.filter(o => o.type === "image");
        const shapes = slide.objects.filter(o => o.type === "shape");
        const fonts = texts.map(o => o.fontSize || 14);
        const maxFont = fonts.length ? Math.max(...fonts) : 0, minFont = fonts.length ? Math.min(...fonts) : 0;
        const sourceChars = texts.reduce((n, o) => n + (o.text || "").length, 0);
        const textArea = clamp(texts.reduce((a, o) => a + area(o), 0) / AREA);
        const visualArea = clamp([...pictures, ...shapes].reduce((a, o) => a + area(o), 0) / AREA);
        const markerFonts = texts.filter(o => marker.test(o.text || "")).map(o => o.fontSize || 14);
        const otherFonts = texts.filter(o => !marker.test(o.text || "")).map(o => o.fontSize || 14);
        const charts = chartsPerSlide[index] || 0;
        const issues = [];
        if (markerFonts.length && otherFonts.length && Math.max(...markerFonts) > Math.max(...otherFonts) + 1)
            issues.push("marker_dominant");
        if (fonts.length >= 4 && maxFont - minFont < 2)
            issues.push("thin_hierarchy");
        if (sourceChars > 650 && !pictures.length && shapes.length < 3 && charts === 0)
            issues.push("text_heavy");
        if (texts.length >= 5 && !pictures.length && shapes.length < 2 && charts === 0)
            issues.push("minimal_visual_structure");
        if (sourceChars < 200 && textArea < .14 && visualArea < .08 && !charts)
            issues.push("sparse_layout");
        const sig = signature(slide, charts);
        signatures.set(sig, (signatures.get(sig) || 0) + 1);
        bySlide.push({ slide: index + 1, textCount: texts.length, imageCount: pictures.length, shapeCount: shapes.length,
            nativeChartCount: charts, maxFontPt: maxFont, minFontPt: minFont,
            textAreaFraction: Number(textArea.toFixed(3)), visualAreaFraction: Number(visualArea.toFixed(3)), issues });
    }
    const maxRepeats = Math.max(0, ...signatures.values());
    const n = scene.slides.length;
    if (n >= 4 && maxRepeats / n >= .65) {
        const common = [...signatures.entries()].find(e => e[1] === maxRepeats)?.[0];
        for (let i = 0; i < n; i++)
            if (signature(scene.slides[i], chartsPerSlide[i] || 0) === common)
                bySlide[i].issues.push("possible_repetitive_composition");
    }
    return { kind: "geometry-only-v2", status: "ADVISORY_MANUAL_REVIEW_REQUIRED", slides: n,
        compositionVariety: n ? Number((signatures.size / n).toFixed(2)) : 0,
        pictureSlides: bySlide.filter(s => s.imageCount > 0).length,
        diagramSlides: bySlide.filter(s => s.shapeCount >= 3).length,
        chartSlides: bySlide.filter(s => s.nativeChartCount > 0).length,
        warnings: bySlide.reduce((sum, s) => sum + s.issues.length, 0), bySlide };
}
