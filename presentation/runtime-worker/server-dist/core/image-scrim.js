import JSZip from "jszip";
/** Fixed native gradient at the edge of a text-safe image scrim. */
export async function softenImageScrims(bytes) {
    const zip = await JSZip.loadAsync(bytes);
    for (const name of Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
        const xml = await zip.file(name).async("string");
        const patched = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, block => {
            const match = /name="image-scrim-edge-(left|right)-(dark|light)-\d+"/.exec(block);
            if (!match)
                return block;
            const [from, to] = match[1] === "left" ? [86000, 0] : [0, 86000];
            const color = match[2] === "dark" ? "0D1323" : "FFFFFF";
            const alpha = (v) => match[2] === "light" ? Math.round(v * 90 / 86) : v;
            const gradient = `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${color}"><a:alpha val="${alpha(from)}"/></a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="${color}"><a:alpha val="${alpha(to)}"/></a:srgbClr></a:gs></a:gsLst><a:lin ang="0" scaled="1"/></a:gradFill>`;
            const index = block.indexOf("<p:spPr>");
            if (index < 0 || !block.slice(index).includes("<a:solidFill>"))
                throw new Error("MOTION_EXPORT_INVALID");
            return block.slice(0, index) + block.slice(index).replace(/<a:solidFill>[\s\S]*?<\/a:solidFill>/, gradient);
        });
        if (patched !== xml)
            zip.file(name, patched);
    }
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
