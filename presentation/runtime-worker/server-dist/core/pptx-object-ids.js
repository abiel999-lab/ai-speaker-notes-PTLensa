/** Normalize exporter-assigned drawing IDs BEFORE adding native animations.
 * Table IDs from PptxGenJS may collide with text IDs or run out of document order.
 * Only drawing identity/reference attributes change; text, geometry, links and media do not.
 */
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
export async function normalizeSlideObjectIds(bytes) {
    const zip=await JSZip.loadAsync(bytes);let changed=false;
    const slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n));
    for(const file of slides) {
        const original=await zip.file(file).async('string');
        if(XMLValidator.validate(original)!==true) throw Error('PPTX_OBJECT_IDS_INVALID');
        // This runs on a fresh exporter package, before any timing IDs exist.
        if(/<p:(?:timing|spTgt)\b/.test(original)) throw Error('PPTX_OBJECT_IDS_ALREADY_ANIMATED');
        const mapping=new Map();let next=0;
        let xml=original.replace(/<p:cNvPr\b[^>]*>/g,tag=>{
            const match=tag.match(/\sid="(\d+)"/);
            if(!match) throw Error('PPTX_OBJECT_IDS_INVALID');
            const old=Number(match[1]),id=++next;
            if(!Number.isSafeInteger(old)) throw Error('PPTX_OBJECT_IDS_INVALID');
            const ids=mapping.get(old)||[];ids.push(id);mapping.set(old,ids);
            return tag.replace(/(\sid=")\d+(")/,(all,prefix,suffix)=>prefix+id+suffix);
        });
        if(!next) throw Error('PPTX_OBJECT_IDS_INVALID');
        // Connectors can reference old IDs. Never guess if an old ID was ambiguous.
        xml=xml.replace(/<a:(?:stCxn|endCxn)\b[^>]*>/g,tag=>tag.replace(/(\sid=")(\d+)(")/,(all,prefix,old,suffix)=>{
            const ids=mapping.get(Number(old));
            if(!ids||ids.length!==1) throw Error('PPTX_OBJECT_REFERENCE_AMBIGUOUS');
            return prefix+ids[0]+suffix;
        }));
        if(XMLValidator.validate(xml)!==true) throw Error('PPTX_OBJECT_IDS_INVALID');
        if(xml!==original){zip.file(file,xml);changed=true;}
    }
    return changed?zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}):bytes;
}
