import { THEMES } from "./palette.js";
/** Decorative visual language using only PowerPoint-native, editable shapes.
 * No source words, numbers, labels, charts or claims are created here.
 * Shapes are placed in the safe margins or behind text; fidelity validation
 * continues to operate on immutable source-bearing objects only.
 */
export function enrichSceneVisuals(scene, options = {}) {
    const palette = THEMES[scene.theme];
    const accent = options.accent || palette.accent;
    const template = options.template || "editorial";
    const total = scene.slides.length;
    for (const [index, slide] of scene.slides.entries()) {
        const add = [];
        // A discrete progress line helps long training decks without introducing
        // any numerical labels or words not present in the source.
        if (total > 1) {
            add.push({ type: "shape", shape: "rect", x: 0, y: 7.43,
                w: 13.333, h: 0.07, fill: palette.panel });
            add.push({ type: "shape", shape: "rect", x: 0, y: 7.43,
                w: Math.round((13.333 * (index + 1) / total) * 1000) / 1000,
                h: 0.07, fill: accent });
        }
        const texts = slide.objects.filter(o => o.type === "text");
        const sourceTexts = texts.filter(o => !!o.sourceId);
        const headingTexts = sourceTexts.filter(o => o.bold);
        const isSection = headingTexts.length === 1 && sourceTexts.length <= 2 &&
            sourceTexts.every(o => o.bold || o.text?.trim() === "*");
        const isOpening = index === 0 && sourceTexts.length === 1 &&
            !sourceTexts[0].bold && sourceTexts[0].w <= 8.15 && sourceTexts[0].text.length > 100;
        if (isSection) {
            // Real chapter break: inverted editorial surface, all text still belongs
            // to its original source ID and is exported as native PowerPoint text.
            slide.background = palette.fg;
            for (const item of sourceTexts) {
                item.color = item.bold ? palette.bg : accent;
            }
            add.push({ type: "shape", shape: "rect", x: 0, y: 0, w: 0.18, h: 7.5, fill: accent });
            add.push({ type: "shape", shape: "ellipse", x: 10.07, y: 4.82, w: 2.05, h: 2.05, fill: palette.panel });
            add.push({ type: "shape", shape: "ellipse", x: 11.82, y: 5.66, w: 0.63, h: 0.63, fill: accent });
            add.push({ type: "shape", shape: "rect", x: 0.96, y: 5.74, w: 3.4, h: 0.06, fill: accent });
        }
        else if (isOpening) {
            // Source paragraph stays intact on an 8-inch editorial column.
            // The graphic is clearly abstract: it is NOT a numerical chart.
            add.push({ type: "shape", shape: "rect", x: 9.03, y: 0, w: 4.30, h: 7.43, fill: palette.panel });
            add.push({ type: "shape", shape: "ellipse", x: 9.75, y: 1.24, w: 2.59, h: 2.59, fill: accent });
            add.push({ type: "shape", shape: "ellipse", x: 10.52, y: 2.04, w: 1.00, h: 1.00, fill: palette.panel });
            add.push({ type: "shape", shape: "rect", x: 9.75, y: 4.41, w: 2.62, h: 0.085, fill: accent });
            add.push({ type: "shape", shape: "rect", x: 9.75, y: 4.84, w: 1.87, h: 0.085, fill: palette.muted });
            add.push({ type: "shape", shape: "rect", x: 9.75, y: 5.27, w: 2.27, h: 0.085, fill: accent });
        }
        // The margin rail and dots sit strictly left of x=.66, the source text.
        if (!isSection && !isOpening && ["process", "timeline", "cards"].includes(slide.layout)) {
            add.push({ type: "shape", shape: "rect", x: 0.32, y: 1.04,
                w: 0.045, h: 5.54, fill: palette.panel });
            for (const o of texts.filter(o => !o.bold).slice(0, 12)) {
                const dotY = Math.min(6.65, Math.max(1.04, o.y + 0.06));
                add.push({ type: "shape", shape: "ellipse", x: 0.285, y: dotY,
                    w: 0.115, h: 0.115, fill: accent });
            }
        }
        else if (!isSection && !isOpening && slide.layout === "columns") {
            // A thin line fits entirely in the existing 0.67in column gutter.
            add.push({ type: "shape", shape: "rect", x: 6.66, y: 1.0,
                w: 0.018, h: 5.65, fill: palette.panel });
        }
        else if (!isSection && !isOpening && ["cover", "section"].includes(slide.layout) || (slide.layout === "statement" && sourceTexts.length === 1 && sourceTexts[0].fontSize >= 25)) {
            // Graphic sequence occupies only the far-right editorial panel.
            // All original source text remains in its existing boxes and order.
            // Equal-weight geometric motif, deliberately not an implied metric chart.
            for (let i = 0; i < 3; i++)
                add.push({ type: "shape", shape: "rect",
                    x: 11.65, y: 4.82 + i * 0.37,
                    w: 0.73 + i * 0.17, h: 0.09,
                    fill: i === 0 ? accent : palette.muted });
        }
        else if (!isSection && !isOpening) {
            // Subtle hierarchy cues beside headings without duplicating a word.
            for (const o of texts.filter(o => o.bold).slice(0, 2))
                add.push({ type: "shape", shape: "rect", x: 0.36,
                    y: Math.max(0.88, o.y), w: 0.07,
                    h: Math.min(0.37, Math.max(0.12, o.h)), fill: accent });
        }
        if (template === "executive" || template === "studio") {
            // Native, editable corner accent -- not a screenshot or raster overlay.
            add.push({ type: "shape", shape: "rect", x: 12.94, y: 0.4,
                w: 0.09, h: 0.33, fill: accent });
        }
        // Background layer, before every source-bearing shape; the planner's
        // original object order is unchanged.
        slide.objects.unshift(...add);
    }
    return scene;
}
