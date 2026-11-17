import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
/** Fixed macro-free native PresentationML effects. No model-generated XML. */
export const MOTION_FOOTER = 6.84;
const array = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
export function navigationPosition(slide) {
    const candidates = [{ x: 11.65, y: 7.03 }, { x: .5, y: 7.03 }, { x: 11.65, y: .12 }, { x: .5, y: .12 }];
    return candidates.find(p => !slide.objects.some(o => o.type !== "shape" && !o.backgroundImage &&
        Math.min(o.x + o.w, p.x + 1.25) - Math.max(o.x, p.x) > -.08 &&
        Math.min(o.y + o.h, p.y + .32) - Math.max(o.y, p.y) > -.08));
}
/** PresentationML animation tree: all node IDs and timing tokens are internal
 * bounded enums/integers; user-authored text never enters this XML. */
function timing(targets, plan) {
    // PowerPoint's importer expects two scheduling containers between mainSeq
    // and the effect rows. Keep behavior nodes at timing depth five (root=0).
    // MS-OI29500 19.5.87 and the Open XML SDK animation fixtures use this tree.
    let node = 4;
    const stagger = plan?.staggerMs ?? 160;
    const duration = plan?.durationMs ?? 550;
    if (!Number.isSafeInteger(stagger) || stagger < 0 || stagger > 2400 ||
        !Number.isSafeInteger(duration) || duration < 1 || duration > 60000)
        throw new Error("MOTION_EXPORT_INVALID");
    const effects = targets.map((target, i) => {
        const group = ++node, visible = ++node, effect = ++node;
        const delay = Math.min(i * stagger, 2400);
        const filter = (i === 0 || target.picture) ? "fade" :
            (plan?.reveal === "wipe" || target.chart) ? "wipe(right)" : "fade";
        const preset = filter === "fade" ? 10 : 22;
        return `<p:par><p:cTn id="${group}" presetID="${preset}" presetClass="entr" ${target.picture ? "" : `grpId="${group}" `}presetSubtype="${filter === "fade" ? 0 : 1}" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>` +
            `<p:set><p:cBhvr><p:cTn id="${visible}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${target.id}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>` +
            `<p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${effect}" dur="${duration}" fill="hold"/><p:tgtEl><p:spTgt spid="${target.id}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
    }).join("");
    const builds = targets.map((t, i) => t.picture ? "" : t.table || t.chart ?
        `<p:bldGraphic spid="${t.id}" grpId="${5 + i * 3}"><p:bldAsOne/></p:bldGraphic>` :
        `<p:bldP spid="${t.id}" grpId="${5 + i * 3}" build="allAtOnce"/>`).join("");
    const schedule = `<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
        `<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>` +
        `</p:childTnLst></p:cTn></p:par>`;
    return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${schedule}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${builds ? `<p:bldLst>${builds}</p:bldLst>` : ""}</p:timing>`;
}
export async function addNativeMotion(bytes, storyboard) {
    const zip = await JSZip.loadAsync(bytes), parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
    const files = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
    // PptxGenJS writes notesMasterIdLst after sldSz; PresentationML requires
    // it immediately after the slide-master list. Correct the generated package.
    const presentationFile = zip.file("ppt/presentation.xml");
    if (!presentationFile)
        throw new Error("MOTION_EXPORT_INVALID");
    const presentation = await presentationFile.async("string");
    const notes = presentation.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/g);
    if (notes) {
        if (notes.length !== 1 || !presentation.includes("</p:sldMasterIdLst>"))
            throw new Error("MOTION_EXPORT_INVALID");
        zip.file("ppt/presentation.xml", presentation.replace(notes[0], "").replace("</p:sldMasterIdLst>", "</p:sldMasterIdLst>" + notes[0]));
    }
    if (storyboard && storyboard.slides.length !== files.length)
        throw new Error("MOTION_EXPORT_INVALID");
    let animatedObjects = 0;
    for (const [index, file] of files.entries()) {
        const xml = await zip.file(file).async("string");
        if (xml.includes("<p:timing") || xml.includes("<p:transition") || !xml.endsWith("</p:sld>"))
            throw new Error("MOTION_EXPORT_INVALID");
        const root = parser.parse(xml)["p:sld"];
        if (Object.hasOwn(root, "p:extLst"))
            throw new Error("MOTION_EXPORT_INVALID");
        const tree = root["p:cSld"]["p:spTree"];
        const targets = [];
        for (const [key, nvKey, table] of [["p:sp", "p:nvSpPr", false], ["p:graphicFrame", "p:nvGraphicFramePr", true]])
            for (const shape of array(tree[key])) {
                const nv = shape[nvKey]?.["p:cNvPr"];
                if (/^(?:vb-b\d+-\d+|eq-part-b\d+-\d+-\d+|np-visual-cover-title)$/.test(nv?.["@_name"] || "") ||
                    (table && nv?.["@_name"] === "motion-native-chart")) {
                    const id = Number(nv["@_id"]);
                    if (!Number.isSafeInteger(id) || id < 1)
                        throw new Error("MOTION_EXPORT_INVALID");
                    targets.push({ id, table, picture: false, chart: table && nv?.["@_name"] === "motion-native-chart" });
                }
            }
        // Only animate explicitly named inline user images, never backgrounds,
        // scrims, logos, decorative margin ornaments or navigation buttons.
        for (const pic of array(tree["p:pic"])) {
            const nv = pic["p:nvPicPr"]?.["p:cNvPr"];
            if (!/^motion-inline-image-\d+$/.test(nv?.["@_name"] || ""))
                continue;
            const id = Number(nv["@_id"]);
            if (!Number.isSafeInteger(id) || id < 1)
                throw new Error("MOTION_EXPORT_INVALID");
            targets.push({ id, table: false, picture: true, chart: false });
        }
        targets.sort((a, b) => a.id - b.id);
        if (!targets.length || new Set(targets.map(t => t.id)).size !== targets.length)
            throw new Error("MOTION_EXPORT_INVALID");
        const hasEquation=array(tree['p:sp']).some(s=>/^eq-part-/.test(s['p:nvSpPr']?.['p:cNvPr']?.['@_name']||''));
        const directive = hasEquation?{...storyboard?.slides[index],staggerMs:0}:storyboard?.slides[index];
        const transition = directive?.transition === "push" ? '<p:push dir="l"/>' :
            directive?.transition === "wipe" ? '<p:wipe dir="r"/>' : '<p:fade/>';
        const patched = xml.slice(0, -8) + `<p:transition spd="med" advClick="1">${transition}</p:transition>` + timing(targets, directive) + "</p:sld>";
        if (XMLValidator.validate(patched) !== true)
            throw new Error("MOTION_EXPORT_INVALID");
        zip.file(file, patched);
        animatedObjects += targets.length;
    }
    return { bytes: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), animatedObjects, transitionSlides: files.length };
}
