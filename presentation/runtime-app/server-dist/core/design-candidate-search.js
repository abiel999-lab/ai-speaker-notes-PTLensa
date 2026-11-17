import { validateScene } from "./fidelity.js";
import { auditDesignScene } from "./design-audit.js";
const W = 13.333333;
const marker = /^\s*(?:={3,}\s*)?(?:slide|halaman)\s+0*\d+\s*(?:(?:of|dari)\s+0*\d+)?\s*[:=—–-]/iu;
const isText = (o) => o.type === "text" && Boolean(o.sourceId);
const isMarker = (o) => isText(o) && marker.test(o.text || "");
/** In-place marker shrink is safe only when the existing box can already hold
 * the immutable marker text, and another title exists on that same slide.
 * No shape is added, no other object moves, no image/asset/link is touched.
 */
function markerHierarchy(slide) {
    if (!/^creative-\d+$/u.test(slide.id))
        return null;
    const headings = slide.objects.filter(isText);
    if (headings.length < 2)
        return null;
    const maxOther = Math.max(...headings.filter(o => !isMarker(o)).map(o => o.fontSize || 14));
    const i = slide.objects.findIndex(o => isMarker(o) && (o.fontSize || 14) > Math.max(14, maxOther));
    if (i < 0)
        return null;
    const original = slide.objects[i];
    if (original.targetSlide != null || original.h < .20)
        return null;
    const objects = slide.objects.map(o => ({ ...o }));
    // Keep original text, lines, box and source order. PowerPoint's font is
    // reduced only; geometry and text-fit headroom cannot deteriorate.
    objects[i] = { ...objects[i], fontSize: 14, bold: false };
    return { ...slide, objects };
}
/** A very conservative spatial alternative for repetitive, text-only slides.
 * The entire composition is mirrored, preserving its internal spacing and
 * source order. Prohibited for arrows, diagrams, user-provided assets,
 * tables, hyperlink targets or wide full-bleed source objects.
 */
function editorialRhythm(slide) {
    if (!/^creative-[1-9]\d*$/u.test(slide.id))
        return null;
    const objects = slide.objects;
    if (objects.length < 3 || objects.some(o => o.type !== "text" || !o.sourceId || o.targetSlide != null))
        return null;
    if (objects.some(o => o.w > 9.4 || o.x < .3 || o.x + o.w > W - .3))
        return null;
    const xLeft = objects.reduce((sum, o) => sum + (o.x + o.w / 2), 0) / objects.length;
    if (xLeft > 5.45 && xLeft < 7.9)
        return null; // Already balanced.
    const mirrored = objects.map(o => ({ ...o, x: Number((W - o.x - o.w).toFixed(6)) }));
    return { ...slide, objects: mirrored };
}
function sceneWith(scene, index, slide) {
    return { ...scene, slides: scene.slides.map((s, i) => i === index ? slide : s) };
}
function safe(doc, candidate) {
    try {
        const v = validateScene(doc, candidate);
        return v.passed && v.quality?.status !== "blocked" &&
            (v.quality?.minimumFontSize || 14) >= 14;
    }
    catch {
        return false;
    }
}
function score(a) {
    // This is purposefully a conservative structural metric. It must NEVER
    // be represented as a visual-aesthetic quality score.
    return a.warnings * 10 + (1 - a.compositionVariety) * 4;
}
export function searchSafeDesignCandidates(doc, original) {
    const before = auditDesignScene(original);
    const changes = [];
    let scene = original, evaluated = 0;
    // Safety-first: never attempt enhancement if the input scene is invalid.
    if (safe(doc, original)) {
        // First candidate family: preserve all geometry, correct an oversized
        // machine-readable slide marker if it overwhelms the actual title.
        for (let i = 0; i < scene.slides.length; i++) {
            const next = markerHierarchy(scene.slides[i]);
            if (!next)
                continue;
            evaluated++;
            const candidate = sceneWith(scene, i, next);
            if (!safe(doc, candidate))
                continue;
            if (score(auditDesignScene(candidate)) < score(auditDesignScene(scene))) {
                scene = candidate;
                changes.push({ slide: i + 1, kind: "marker-hierarchy" });
            }
        }
        // Second family: only consider layout rhythm when the deck itself has
        // repetitive structure. At most one slide in every three can change;
        // zero edits are acceptable if no objectively safer candidate exists.
        const audit = auditDesignScene(scene);
        if (scene.slides.length >= 5 &&
            audit.bySlide.filter(s => s.issues.includes("possible_repetitive_composition")).length >= 4) {
            for (let i = 1; i < scene.slides.length; i += 3) {
                const next = editorialRhythm(scene.slides[i]);
                if (!next)
                    continue;
                evaluated++;
                const candidate = sceneWith(scene, i, next);
                if (!safe(doc, candidate))
                    continue;
                if (score(auditDesignScene(candidate)) < score(auditDesignScene(scene))) {
                    scene = candidate;
                    changes.push({ slide: i + 1, kind: "editorial-rhythm" });
                }
            }
        }
    }
    // Recheck the complete selected deck, never apply invalid candidate even
    // if a future scoring change contains a bug.
    if (!safe(doc, scene)) {
        scene = original;
        changes.length = 0;
    }
    const after = auditDesignScene(scene);
    return {
        scene,
        diagnostic: {
            kind: "safe-local-candidate-search-v1", status: "ADVISORY_MANUAL_REVIEW_REQUIRED",
            evaluated, accepted: changes.length, changes,
            warningsBefore: before.warnings, warningsAfter: after.warnings,
            varietyBefore: before.compositionVariety, varietyAfter: after.compositionVariety,
        },
    };
}
