import{verifyEquations}from'./native-equations.js';
import{visualCoverTitle,visualCoverSubtitle,technicalSectionTitle}from'./visual-cover.js';
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { verifyCoverBranding } from "./cover-branding.js";
import { XMLParser } from "fast-xml-parser";
import { WIDTH, HEIGHT } from "./layout.js";
const arr = (x) => x === undefined ? [] : Array.isArray(x) ? x : [x];
function contentReport(doc, entries, exportVerified) {
    const expected = doc.blocks.map((b) => b.id);
    const map = new Map();
    const order = [];
    const extra = [];
    for (const e of entries) {
        if (!expected.includes(e.id))
            extra.push(e.id);
        if (order.at(-1) !== e.id)
            order.push(e.id);
        map.set(e.id, (map.get(e.id) || "") + e.text);
    }
    const missing = expected.filter((id) => !map.has(id));
    const changed = doc.blocks
        .filter((b) => map.has(b.id) && map.get(b.id) !== b.text)
        .map((b) => b.id);
    const duplicate = order.filter((id, i) => order.indexOf(id) !== i);
    const orderValid = JSON.stringify(order) === JSON.stringify(expected);
    return {
        passed: !missing.length &&
            !changed.length &&
            !extra.length &&
            !duplicate.length &&
            orderValid,
        sourceHash: doc.sha256,
        blocks: doc.blocks.length,
        characters: doc.blocks.reduce((n, b) => n + b.text.length, 0),
        missing,
        changed,
        extra,
        duplicate,
        orderValid,
        exportVerified,
    };
}
export function validateScene(doc, scene) {
    const entries = scene.slides.flatMap((s) => s.objects
        .filter((o) => ["text", "table"].includes(o.type))
        .map((o) => ({
        id: o.sourceId || "UNMAPPED",
        text: o.type === "table"
            ? o.rows.map((r) => r.join("\t")).join("\n")
            : o.text || "",
    })));
    // A table split across slides keeps a source newline between native rows.
    for (let i = 1; i < entries.length; i++)
        if (entries[i].id === entries[i - 1].id &&
            doc.blocks.find((b) => b.id === entries[i].id)?.kind === "table")
            entries[i].text = "\n" + entries[i].text;
    const report = contentReport(doc, entries, false);
    const contentObjects = scene.slides.flatMap((slide, slideIndex) => slide.objects
        .filter((object) => ["text", "table", "image"].includes(object.type))
        .map((object) => ({ ...object, slideIndex })));
    const overflow = contentObjects.filter((object) => object.x < 0 ||
        object.y < 0 ||
        object.x + object.w > WIDTH + 0.02 ||
        object.y + object.h > HEIGHT + 0.02).length;
    let overlaps = 0;
    for (let i = 0; i < contentObjects.length; i++)
        for (let j = i + 1; j < contentObjects.length; j++) {
            const a = contentObjects[i];
            const b = contentObjects[j];
            // Source IDs identify immutable input blocks, not visual shapes. A long
            // source block can create multiple independently positioned text atoms.
            // Never exempt their collisions merely because sourceId is identical.
            // Full-bleed background images are intentionally behind the content.
            if (a.slideIndex !== b.slideIndex || a.backgroundImage || b.backgroundImage)
                continue;
            const intersectionWidth = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            const intersectionHeight = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (intersectionWidth > 0.03 && intersectionHeight > 0.03)
                overlaps++;
        }
    const sizes = contentObjects
        .map((object) => object.fontSize)
        .filter((value) => typeof value === "number");
    const minimumFontSize = sizes.length ? Math.min(...sizes) : 0;
    report.quality = {
        status: overflow || overlaps
            ? "blocked"
            : minimumFontSize && minimumFontSize < 14
                ? "warning"
                : "verified",
        overflow,
        overlaps,
        minimumFontSize: Math.round(minimumFontSize * 10) / 10,
    };
    if (report.quality.status === "blocked")
        report.passed = false;
    if (scene.sourceHash !== doc.sha256)
        report.passed = false;
    return report;
}
function paragraphText(tx) {
    return arr(tx?.["a:p"])
        .map((p) => arr(p?.["a:r"])
        .map((r) => typeof r["a:t"] === "object"
        ? (r["a:t"]["#text"] ?? "")
        : (r["a:t"] ?? ""))
        .join("") +
        arr(p?.["a:fld"])
            .map((r) => r["a:t"] ?? "")
            .join(""))
        .join("\n");
}
async function verifyPdfPicture(zip, parser, tree, filename, expected) {
    const picture = arr(tree["p:pic"]).find(item =>
        item["p:nvPicPr"]?.["p:cNvPr"]?.["@_descr"] === expected.altText);
    const fill = picture?.["p:blipFill"];
    const relId = fill?.["a:blip"]?.["@_r:embed"];
    if (!relId || (fill["a:srcRect"] && Object.values(fill["a:srcRect"]).some(value => Number(value) !== 0)))
        throw Error("DOCUMENT_VISUAL_EXPORT_MISMATCH");
    const relPath = "ppt/slides/_rels/" + posix.basename(filename) + ".rels";
    const relations = parser.parse(await zip.file(relPath)?.async("string") || "");
    const target = arr(relations.Relationships?.Relationship).find(rel => rel["@_Id"] === relId)?.["@_Target"];
    const assetPath = target && posix.join(posix.dirname(filename), target);
    const data = assetPath?.startsWith("ppt/media/") && await zip.file(assetPath)?.async("nodebuffer");
    if (!data || createHash("sha256").update(data).digest("hex") !== expected.originalPdfHash)
        throw Error("DOCUMENT_VISUAL_EXPORT_MISMATCH");
}

export async function verifyPptx(doc, bytes, branding, pdfPictures = new Map()) {
    const zip = await JSZip.loadAsync(bytes);
    const brandingReport = await verifyCoverBranding(zip, branding);
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        parseTagValue: false,
        trimValues: false,
    });
    const entries = [];
    const files = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
    for (const [slideIndex, file] of files.entries()) {
        const xml = await zip.file(file).async("string");
        const tree = parser.parse(xml)["p:sld"]["p:cSld"]["p:spTree"];
        const expectedPdfPicture = pdfPictures.get(slideIndex);
        if (expectedPdfPicture) await verifyPdfPicture(zip, parser, tree, file, expectedPdfPicture);
        // Exporter emits source-bearing objects in source order; collect using shape IDs.
        const onSlide = verifyEquations(arr(tree["p:sp"]),doc,paragraphText);
        for(const s of arr(tree['p:sp'])){const name=s['p:nvSpPr']?.['p:cNvPr']?.['@_name'];if(name==='np-visual-cover-title'&&(file!=='ppt/slides/slide1.xml'||paragraphText(s['p:txBody'])!==visualCoverTitle(doc)))throw Error('COVER_METADATA_MISMATCH');if(/^np-section-title-b\d+$/.test(name||'')&&paragraphText(s['p:txBody'])!==technicalSectionTitle(doc,name.replace('np-section-title-','')))throw Error('SOURCE_FIDELITY_FAILED');if(name==='np-visual-cover-subtitle'&&(file!=='ppt/slides/slide1.xml'||paragraphText(s['p:txBody'])!==visualCoverSubtitle(doc)))throw Error('COVER_METADATA_MISMATCH');}
        for (const shape of arr(tree["p:sp"])) {
            const nv = shape["p:nvSpPr"]?.["p:cNvPr"];
            const name = nv?.["@_name"] || "";
            const text = paragraphText(shape["p:txBody"]);
            const derived=name.match(/^np-derived-(b\d+)-(\d+)-(\d+)-(\d+)$/);if(derived){const source=doc.blocks.find(b=>b.id===derived[1]);const start=Number(derived[2]),end=Number(derived[3]);if(!source||end<=start||source.text.slice(start,end)!==text)throw Error('SOURCE_FIDELITY_FAILED');continue;}
            if (text && name !== "np-cover-author"&&!name.startsWith("eq-")&&!name.startsWith("np-visual-cover-")&&!/^np-section-title-b\d+$/.test(name)) {
                const m = name.match(/^vb-(b\d+)-(\d+)$/);
                onSlide.push({
                    pos: Number(nv?.["@_id"]),
                    id: m?.[1] || "UNMAPPED",
                    text,
                });
            }
        }
        for (const frame of arr(tree["p:graphicFrame"])) {
            const nv = frame["p:nvGraphicFramePr"]?.["p:cNvPr"];
            const table = frame["a:graphic"]?.["a:graphicData"]?.["a:tbl"];
            if (!table)
                continue;
            const rows = arr(table["a:tr"])
                .map((r) => arr(r["a:tc"])
                .map((c) => paragraphText(c["a:txBody"]))
                .join("\t"))
                .join("\n");
            const m = (nv?.["@_name"] || "").match(/^vb-(b\d+)-(\d+)$/);
            onSlide.push({
                pos: Number(nv?.["@_id"]),
                id: m?.[1] || "UNMAPPED",
                text: rows,
            });
        }
        entries.push(...onSlide.sort((a, b) => a.pos - b.pos));
    }
    for (let i = 1; i < entries.length; i++)
        if (entries[i].id === entries[i - 1].id &&
            doc.blocks.find((b) => b.id === entries[i].id)?.kind === "table")
            entries[i].text = "\n" + entries[i].text;
    if ([...pdfPictures.keys()].some(index => index >= files.length)) throw Error("DOCUMENT_VISUAL_EXPORT_MISMATCH");
    const report = contentReport(doc, entries, true);
    report.coverBranding = brandingReport;
    return report;
}
