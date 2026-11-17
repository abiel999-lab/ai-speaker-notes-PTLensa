import JSZip from "jszip";
import path from "node:path";
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const invalid = () => { throw new Error("PPTX_PACKAGE_INVALID"); };
/** Give notes masters independent themes and validate OPC part closure.
 * Source-bearing slide/notes/media/animation parts are never rewritten or removed.
 */
export async function finalizePptxPackage(bytes) {
    const zip = await JSZip.loadAsync(bytes);
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false });
    const manifest = zip.file("[Content_Types].xml");
    if (!manifest)
        return invalid();
    const manifestXml = await manifest.async("string");
    if (XMLValidator.validate(manifestXml) !== true)
        return invalid();
    const document = parser.parse(manifestXml);
    const types = document.Types;
    if (!types)
        return invalid();
    const parts = new Set(Object.values(zip.files).filter(file => !file.dir).map(file => file.name));
    const referenced = new Set();
    const themeOwners = new Map();
    const noteThemes = [];
    let changed = false;
    for (const name of parts) {
        if (!name.endsWith(".rels"))
            continue;
        const xml = await zip.file(name).async("string");
        if (XMLValidator.validate(xml) !== true)
            return invalid();
        const relDocument = parser.parse(xml);
        const relationships = relDocument.Relationships;
        if (!relationships)
            return invalid();
        const root = name === "_rels/.rels";
        const owner = root ? "" : name.replace(/(^|\/)\_rels\//, "$1").replace(/\.rels$/, "");
        if (!root && !parts.has(owner))
            return invalid();
        const identifiers = new Set();
        for (const rel of list(relationships.Relationship)) {
            const id = rel["@_Id"];
            if (typeof id !== "string" || !id || identifiers.has(id))
                return invalid();
            identifiers.add(id);
            if (rel["@_TargetMode"] === "External")
                continue;
            const target = rel["@_Target"];
            if (typeof target !== "string" || !target || /[\\?]/.test(target))
                return invalid();
            let decoded;
            try {
                decoded = decodeURIComponent(target.split("#")[0]);
            }
            catch {
                return invalid();
            }
            const resolved = path.posix.normalize(decoded.startsWith("/") ? decoded.slice(1) :
                path.posix.join(root ? "" : path.posix.dirname(owner), decoded));
            if (resolved.startsWith("../") || !parts.has(resolved))
                return invalid();
            referenced.add(resolved);
            if (String(rel["@_Type"]).endsWith("/theme")) {
                const owners = themeOwners.get(resolved) || new Set();
                owners.add(owner);
                themeOwners.set(resolved, owners);
                if (/^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(owner))
                    noteThemes.push({ file: name, document: relDocument, relationship: rel, theme: resolved });
            }
        }
    }
    // A notes master gets its own theme, matching PowerPoint's native repair.
    // Share no theme part with slide masters or the presentation root. Slides and
    // source-bearing notes XML remain byte-identical.
    for (const item of noteThemes) {
        if ((themeOwners.get(item.theme)?.size || 0) < 2)
            continue;
        let number = 1;
        while (parts.has(`ppt/theme/theme${number}.xml`))
            number++;
        const target = `ppt/theme/theme${number}.xml`;
        const originalTheme = await zip.file(item.theme).async("string");
        const notesTheme = originalTheme
            .replace(/(<a:majorFont>\s*<a:latin)\b[^>]*\/>/, '$1 typeface="Calibri Light" panose="020F0302020204030204"/>')
            .replace(/(<a:minorFont>\s*<a:latin)\b[^>]*\/>/, '$1 typeface="Calibri" panose="020F0502020204030204"/>');
        if (XMLValidator.validate(notesTheme) !== true)
            return invalid();
        zip.file(target, notesTheme);
        parts.add(target);
        item.relationship["@_Target"] = path.posix.relative("ppt/notesMasters", target);
        zip.file(item.file, new XMLBuilder({ ignoreAttributes: false, suppressEmptyNode: true }).build(item.document));
        types.Override = [...list(types.Override), {
                "@_PartName": "/" + target,
                "@_ContentType": "application/vnd.openxmlformats-officedocument.theme+xml",
            }];
        changed = true;
    }
    const seen = new Set();
    const overrides = list(types.Override);
    const kept = overrides.filter(override => {
        const name = override["@_PartName"];
        if (typeof name !== "string" || !name.startsWith("/") || seen.has(name))
            return invalid();
        seen.add(name);
        const part = name.slice(1);
        if (parts.has(part))
            return true;
        // PptxGenJS can register one master per slide while emitting one shared master.
        if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(part) && !referenced.has(part))
            return false;
        return invalid();
    });
    const defaults = new Map();
    for (const entry of list(types.Default)) {
        const extension = entry["@_Extension"], contentType = entry["@_ContentType"];
        if (typeof extension !== "string" || typeof contentType !== "string" || defaults.has(extension))
            return invalid();
        defaults.set(extension, contentType);
    }
    const explicit = new Set(kept.map(entry => entry["@_PartName"].slice(1)));
    for (const part of parts) {
        if (part === "[Content_Types].xml")
            continue;
        const extension = part.endsWith(".rels") ? "rels" : path.posix.extname(part).slice(1);
        if (!explicit.has(part) && !defaults.has(extension))
            return invalid();
    }
    if (kept.length === overrides.length && !changed)
        return bytes;
    types.Override = kept;
    const output = new XMLBuilder({ ignoreAttributes: false, suppressEmptyNode: true }).build(document);
    if (XMLValidator.validate(output) !== true)
        return invalid();
    zip.file("[Content_Types].xml", output);
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
