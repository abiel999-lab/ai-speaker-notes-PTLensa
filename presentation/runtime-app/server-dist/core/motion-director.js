const MAX_SLIDES = 80;
const FAMILIES = ["opening", "image-led", "data", "diagram", "reference", "editorial", "closing"];
const TRANSITIONS = ["fade", "push", "wipe"];
const isSource = (o) => Boolean(o.sourceId) && (o.type === "text" || o.type === "table");
/** These are content-family heuristics, not a simulated aesthetic quality score.
 * Scene geometry and chart plans are already validated by the exporter. */
export function planDeckMotion(scene, chartsPerSlide = []) {
    if (scene.slides.length > MAX_SLIDES || chartsPerSlide.length > MAX_SLIDES)
        throw new Error("MOTION_PLAN_LIMIT");
    const familyCounts = Object.fromEntries(FAMILIES.map(f => [f, 0]));
    const transitionCounts = Object.fromEntries(TRANSITIONS.map(t => [t, 0]));
    const slides = scene.slides.map((slide, index) => {
        const source = slide.objects.filter(isSource);
        const nativeImages = slide.objects.filter(o => o.type === "image" && !o.backgroundImage).length;
        const nativeCharts = chartsPerSlide[index] || 0;
        const diagrams = slide.objects.filter(o => o.type === "shape" &&
            (o.shape === "line" || o.shape === "rightArrow" || o.shape === "leftRightArrow" ||
                o.shape === "chevron" || o.shape === "flowChartProcess" || o.shape === "flowChartDecision")).length;
        const shapeCount = slide.objects.filter(o => o.type === "shape").length;
        const characters = source.reduce((n, o) => n + (o.type === "table" ? JSON.stringify(o.rows || []).length : (o.text || "").length), 0);
        const dense = characters > 650 || source.length >= 11;
        const hasTable = source.some(o => o.type === "table");
        const isCover = index === 0 && (slide.layout === "cover" || (!dense && source.length <= 5));
        const isClosing = index === scene.slides.length - 1 && source.length <= 5 && !hasTable && nativeCharts === 0;
        const family = isCover ? "opening" : isClosing ? "closing" :
            nativeCharts > 0 || hasTable ? "data" :
                diagrams >= 2 || shapeCount >= 5 || slide.layout === "process" || slide.layout === "timeline" ? "diagram" :
                    nativeImages > 0 ? "image-led" : dense ? "reference" : "editorial";
        // Transitions reinforce meaning; never rotate effects merely by index.
        const transition = family === "data" || family === "diagram" ? "push" :
            family === "editorial" && slide.layout === "section" ? "wipe" : "fade";
        const reveal = family === "data" || family === "diagram" ? "wipe" : "fade";
        const staggerMs = dense ? 80 : family === "opening" || family === "closing" ? 210 : family === "diagram" ? 180 : 145;
        const durationMs = dense ? 300 : family === "opening" ? 670 : family === "data" ? 420 : 530;
        familyCounts[family]++;
        transitionCounts[transition]++;
        return { family, transition, direction: "l", reveal, staggerMs, durationMs,
            sourceObjects: source.length, nativeImages, nativeCharts };
    });
    return { kind: "semantic-motion-storyboard-v1", slides, summary: { familyCounts, transitionCounts } };
}
