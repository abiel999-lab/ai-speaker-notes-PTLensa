import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { SceneSlide } from "./types.js";
/** Fixed macro-free native PresentationML effects. No model-generated XML. */
export const MOTION_FOOTER = 6.84;
const array = (v: any): any[] => v == null ? [] : Array.isArray(v) ? v : [v];
export function navigationPosition(slide: SceneSlide) {
  const candidates = [{ x: 11.65, y: 7.03 }, { x: .5, y: 7.03 }, { x: 11.65, y: .12 }, { x: .5, y: .12 }];
  return candidates.find(p => !slide.objects.some(o => o.type !== "shape" && !o.backgroundImage &&
    Math.min(o.x + o.w, p.x + 1.25) - Math.max(o.x, p.x) > -.08 &&
    Math.min(o.y + o.h, p.y + .32) - Math.max(o.y, p.y) > -.08));
}
function timing(targets: { id: number; table: boolean }[]) {
  let node = 2;
  const effects = targets.map((target, i) => {
    const group = ++node, visible = ++node, effect = ++node;
    const delay = Math.min(i * 180, 2400), filter = i === 0 ? "fade" : "wipe(right)", preset = i === 0 ? 10 : 22;
    return `<p:par><p:cTn id="${group}" presetID="${preset}" presetClass="entr" grpId="${group}" presetSubtype="${i === 0 ? 0 : 1}" fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst><p:childTnLst>` +
      `<p:set><p:cBhvr><p:cTn id="${visible}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${target.id}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>` +
      `<p:animEffect transition="in" filter="${filter}"><p:cBhvr><p:cTn id="${effect}" dur="550" fill="hold"/><p:tgtEl><p:spTgt spid="${target.id}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`;
  }).join("");
  const builds = targets.map((t, i) => t.table ? `<p:bldGraphic spid="${t.id}" grpId="${3 + i * 3}"><p:bldAsOne/></p:bldGraphic>` : `<p:bldP spid="${t.id}" grpId="${3 + i * 3}" build="allAtOnce"/>`).join("");
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${effects}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst>${builds}</p:bldLst></p:timing>`;
}
export async function addNativeMotion(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes), parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const files = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/slide(\d+)/)![1]) - Number(b.match(/slide(\d+)/)![1]));
  // PptxGenJS writes notesMasterIdLst after sldSz; PresentationML requires
  // it immediately after the slide-master list. Correct the generated package.
  const presentationFile = zip.file("ppt/presentation.xml");
  if (!presentationFile) throw new Error("MOTION_EXPORT_INVALID");
  const presentation = await presentationFile.async("string");
  const notes = presentation.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/g);
  if (notes) {
    if (notes.length !== 1 || !presentation.includes("</p:sldMasterIdLst>")) throw new Error("MOTION_EXPORT_INVALID");
    zip.file("ppt/presentation.xml", presentation.replace(notes[0], "").replace("</p:sldMasterIdLst>", "</p:sldMasterIdLst>" + notes[0]));
  }
  let animatedObjects = 0;
  for (const [index, file] of files.entries()) {
    const xml = await zip.file(file)!.async("string");
    if (xml.includes("<p:timing") || xml.includes("<p:transition") || !xml.endsWith("</p:sld>")) throw new Error("MOTION_EXPORT_INVALID");
    const root = parser.parse(xml)["p:sld"];
    if (Object.hasOwn(root, "p:extLst")) throw new Error("MOTION_EXPORT_INVALID");
    const tree = root["p:cSld"]["p:spTree"];
    const targets: { id: number; table: boolean }[] = [];
    for (const [key, nvKey, table] of [["p:sp", "p:nvSpPr", false], ["p:graphicFrame", "p:nvGraphicFramePr", true]] as const)
      for (const shape of array(tree[key])) {
        const nv = shape[nvKey]?.["p:cNvPr"];
        if (/^vb-b\d+-\d+$/.test(nv?.["@_name"] || "")) {
          const id = Number(nv["@_id"]);
          if (!Number.isSafeInteger(id) || id < 1) throw new Error("MOTION_EXPORT_INVALID");
          targets.push({ id, table });
        }
      }
    targets.sort((a, b) => a.id - b.id);
    if (!targets.length || new Set(targets.map(t => t.id)).size !== targets.length) throw new Error("MOTION_EXPORT_INVALID");
    const transition = index % 3 === 1 ? '<p:push dir="l"/>' : index % 3 === 2 ? '<p:wipe dir="r"/>' : '<p:fade/>';
    const patched = xml.slice(0, -8) + `<p:transition spd="med" advClick="1">${transition}</p:transition>` + timing(targets) + "</p:sld>";
    if (XMLValidator.validate(patched) !== true) throw new Error("MOTION_EXPORT_INVALID");
    zip.file(file, patched); animatedObjects += targets.length;
  }
  return { bytes: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), animatedObjects, transitionSlides: files.length };
}
