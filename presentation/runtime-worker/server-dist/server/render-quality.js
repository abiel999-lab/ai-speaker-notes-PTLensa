/** Phase 10G — privacy-preserving visual acceptance diagnostics.
 * The canonical proof of text identity remains PPTX fidelity verification.
 * PDF glyph extraction is renderer-dependent and therefore warning-only:
 * NEVER block source-safe exports or create a second paid AI request.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import sharp from "sharp";
const MAX_PDF_TEXT_BYTES = 2_000_000;
const REPORT_LIMIT = 24;
const TEXT_COVERAGE_FLOOR = 0.6;
const EXPECTED_MIN_TERMS = 7;
/** Accept only source-bearing text; diagrams, notes, decorative text and
 * native chart labels do not substitute for the original slide wording. */
function expectedSourceText(scene, slideIndex) {
    return scene.slides[slideIndex].objects
        .filter(object => object.sourceId && (object.type === "text" || object.type === "table"))
        .map(object => object.type === "table" ? (object.rows || []).flat().join(" ") : object.text || "")
        .join(" ");
}
function terms(text) {
    const words = text.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) || [];
    return new Set(words.filter(token => token.length >= 4 || /^\d{2,}$/u.test(token)).slice(0, 10000));
}
/** Pure per-page coverage check; errors contain only codes and page indexes. */
export function assessRenderedText(scene, renderedPages) {
    const findings = [];
    let lowTextSlides = 0;
    let minimumTextCoveragePct = null;
    if (renderedPages.length !== scene.slides.length) {
        findings.push({ slide: 0, code: "RENDER_PAGE_COUNT" });
    }
    for (let i = 0; i < scene.slides.length; i++) {
        const expected = terms(expectedSourceText(scene, i));
        if (expected.size < EXPECTED_MIN_TERMS)
            continue; // Deliberately sparse covers are valid.
        const observed = terms(renderedPages[i] || "");
        const matched = [...expected].filter(token => observed.has(token)).length;
        const coverage = matched / expected.size;
        const percent = Math.round(coverage * 100);
        minimumTextCoveragePct = minimumTextCoveragePct === null ? percent : Math.min(percent, minimumTextCoveragePct);
        if (coverage < TEXT_COVERAGE_FLOOR) {
            lowTextSlides++;
            if (findings.length < REPORT_LIMIT)
                findings.push({ slide: i + 1, code: "LOW_TEXT_COVERAGE" });
        }
    }
    return { status: findings.length || lowTextSlides ? "warning" : "verified",
        checkedSlides: scene.slides.length, lowTextSlides, nearBlankSlides: 0, minimumTextCoveragePct,
        findings };
}
/** Bound stdout, runtime and subprocess cleanup; never log extracted user text. */
export function extractPdfText(pdfPath, binary = "pdftotext") {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, ["-layout", "-enc", "UTF-8", pdfPath, "-"], { stdio: ["ignore", "pipe", "ignore"] });
        const chunks = [];
        let bytes = 0;
        let settled = false;
        const fail = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            child.kill("SIGKILL");
            reject(new Error("RENDER_QA_UNAVAILABLE"));
        };
        const timer = setTimeout(fail, 30_000);
        child.stdout.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_PDF_TEXT_BYTES) {
                fail();
                return;
            }
            chunks.push(chunk);
        });
        child.once("error", fail);
        child.once("close", code => {
            clearTimeout(timer);
            if (settled)
                return;
            settled = true;
            if (code !== 0) {
                reject(new Error("RENDER_QA_UNAVAILABLE"));
                return;
            }
            const pages = Buffer.concat(chunks).toString("utf8").split("\f");
            // Poppler terminates the last page with a form feed, which produces an empty tail.
            if (!pages.at(-1)?.trim())
                pages.pop();
            resolve(pages);
        });
    });
}
/** Uses the already-rendered previews; no additional LibreOffice conversion. */
export async function auditRenderedPresentation(dir, scene, pdfTextBinary = "pdftotext") {
    const pages = await extractPdfText(path.join(dir, "presentation.pdf"), pdfTextBinary);
    const result = assessRenderedText(scene, pages);
    for (let i = 0; i < scene.slides.length; i++) {
        // Downsampling makes the check inexpensive and independent of slide resolution.
        const statistics = await sharp(path.join(dir, `preview-${i}.png`), { failOn: "truncated", limitInputPixels: 3_000_000 })
            .resize(320, 180, { fit: "fill" }).greyscale().stats();
        // A monochrome rendered page that was supposed to contain text is suspect,
        // but it must not block downloads: charts, fonts and gradients vary by renderer.
        if (statistics.channels[0].stdev < 1.5 && terms(expectedSourceText(scene, i)).size >= EXPECTED_MIN_TERMS) {
            result.nearBlankSlides++;
            if (result.findings.length < REPORT_LIMIT)
                result.findings.push({ slide: i + 1, code: "NEAR_BLANK_SLIDE" });
        }
    }
    if (result.nearBlankSlides)
        result.status = "warning";
    return result;
}
export const unavailableRenderQuality = (slides) => ({
    status: "unavailable", checkedSlides: slides, lowTextSlides: 0, nearBlankSlides: 0,
    minimumTextCoveragePct: null, findings: [],
});
