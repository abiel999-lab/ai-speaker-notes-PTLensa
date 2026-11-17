import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
/** Internal slide numbers only. No URLs, model XML, macros or action strings. */
export function sceneFeatures(scene) {
    const total = scene.slides.length;
    const valid = (v) => Number.isSafeInteger(v) && Number(v) >= 1 && Number(v) <= total;
    if (scene.menuSlide !== undefined && !valid(scene.menuSlide))
        throw new Error("SCENE_INTERACTION_INVALID");
    let links = 0, uploadedImages = 0;
    for (const [i, slide] of scene.slides.entries())
        for (const object of slide.objects) {
            if (object.targetSlide !== undefined) {
                if (object.type !== "text" || !object.sourceId || !valid(object.targetSlide) || object.targetSlide === i + 1)
                    throw new Error("SCENE_INTERACTION_INVALID");
                links++;
            }
            if (object.type === "image" && object.asset && !["city", "custom"].includes(object.asset))
                uploadedImages++;
        }
    return { links, uploadedImages, menuSlide: scene.menuSlide ?? null };
}
/** Inspect actual OOXML relationships after the exporter has assigned IDs. */
export async function verifyInternalSlideLinks(bytes) {
    const zip = await JSZip.loadAsync(bytes), parser = new XMLParser({ ignoreAttributes: false });
    const array = (v) => v == null ? [] : Array.isArray(v) ? v : [v];
    let links = 0;
    for (const name of Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
        const relFile = zip.file(name.replace("slides/", "slides/_rels/") + ".rels");
        const relations = relFile ? array(parser.parse(await relFile.async("string")).Relationships?.Relationship) : [];
        const map = new Map(relations.map(r => [r["@_Id"], r]));
        const visit = (node) => {
            if (!node || typeof node !== "object")
                return;
            for (const [key, value] of Object.entries(node)) {
                if (["a:hlinkClick", "a:hlinkMouseOver"].includes(key))
                    for (const click of array(value)) {
                        const relation = map.get(click["@_r:id"]);
                        const target = relation?.["@_Target"];
                        const match = typeof target === "string" ? /^(?:\.\.\/slides\/)?(slide\d+\.xml)$/.exec(target) : null;
                        if (!relation?.["@_Type"]?.endsWith("/slide") || relation["@_TargetMode"] === "External" || !match || !zip.file("ppt/slides/" + match[1]))
                            throw new Error("SCENE_INTERACTION_INVALID");
                        links++;
                    }
                if (Array.isArray(value))
                    value.forEach(visit);
                else
                    visit(value);
            }
        };
        visit(parser.parse(await zip.file(name).async("string")));
    }
    return links;
}
