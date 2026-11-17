import{fontForText}from'./script-fonts.js';
/** Trusted generation metadata, separate from immutable source-bearing slide content. */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { wrapText, textHeight } from './layout.js';
import { validateScene } from './fidelity.js';
import { isSlideBoundaryText } from './creative-sections.js';
export const MAX_COVER_LOGOS=4;
const reservedLayouts=new WeakMap();
export function cleanAuthor(value) {
    if(typeof value!=='string')return '';
    return Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/gu,' ').trim()).slice(0,120).join('');
}
export function coverBrandingLayout(branding) {
    if(branding&&reservedLayouts.has(branding))return reservedLayouts.get(branding);
    const author=cleanAuthor(branding?.author), logos=branding?.logos||[];
    if(logos.length>MAX_COVER_LOGOS)throw Error('COVER_LOGO_LIMIT');
    const lines=author?wrapText(author,7.2,18,false):[];
    const h=author?textHeight(lines.length,18)*1.18+.08:0;
    const authorBox=author?{x:.78,y:6.52-h,w:7.2,h}:null;
    const placed=[];
    for(let start=0;start<logos.length;start+=3){
        const row=logos.slice(start,start+3);
        for(const o of row)if(!Number.isFinite(o.width)||!Number.isFinite(o.height)||o.width<=0||o.height<=0)throw Error('COVER_LOGO_INVALID');
        const widths=row.map(o=>Math.min(2,.85*o.width/o.height));
        const gap=.12,available=4.15-gap*(row.length-1);
        const factor=Math.min(1,available/widths.reduce((a,b)=>a+b,0));
        const total=widths.reduce((a,b)=>a+b,0)*factor+gap*(row.length-1);
        let x=12.62-total;
        row.forEach((o,i)=>{
            const w=widths[i]*factor,h=w*o.height/o.width;
            const cell={x,y:.32+Math.floor(start/3)*1.02,w,h:.9};
            placed.push({...o,cell,x,y:cell.y+(cell.h-h)/2,w,h});x+=w+gap;
        });
    }
    return {author,authorBox,logos:placed};
}
const overlaps=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.025&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.025;
export function reserveCoverBranding(doc,scene,branding) {
    const plan=coverBrandingLayout(branding);if(!plan.author&&!plan.logos.length)return scene;
    const first=scene.slides[0],zones=[...(plan.authorBox?[plan.authorBox]:[]),...plan.logos.map(l=>l.cell)];
    const content=first.objects.filter(o=>['text','table','image'].includes(o.type)&&!o.backgroundImage);
    const good=s=>!s.objects.filter(o=>['text','table','image'].includes(o.type)&&!o.backgroundImage).some(o=>zones.some(z=>overlaps(o,z)));
    if(good(first))return scene;
    // Dense sources may occupy the usual byline area. Use the free top-left
    // strip without moving, shrinking or removing any source-bearing object.
    if(plan.authorBox){
        const authorBox={...plan.authorBox,y:.08};
        const alternate=[authorBox,...plan.logos.map(l=>l.cell)];
        if(!content.some(o=>alternate.some(z=>overlaps(o,z)))){
            reservedLayouts.set(branding,{...plan,authorBox});
            return scene;
        }
    }

    const text=first.objects.filter(o=>o.type==='text');
    if(first.objects.some(o=>o.type==='table'))throw Error('COVER_BRANDING_SPACE');
    const title=text.find(o=>!isSlideBoundaryText(o.text||''))||text[0];
    const image=first.objects.find(o=>o.type==='image');
    const bg=image?'#0D1B2A':first.background;
    const rgb=[1,3,5].map(i=>parseInt(bg.slice(i,i+2),16));const dark=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<140;
    for(const titleSize of [48,42,36,30,26,22])for(const body of [18,16,14]){
        let y=.72,ok=true;const placed=[];const bottom=plan.authorBox?plan.authorBox.y-.2:6.5;
        for(const o of text){const heading=o===title;const pt=isSlideBoundaryText(o.text||'')?14:heading?titleSize:body;
            const lines=(o.text||'').split('\n').flatMap(t=>wrapText(t,7.2,pt,heading));const h=textHeight(lines.length,pt)*1.18+.12;
            if(y+h>bottom){ok=false;break;}placed.push({...o,x:.78,y,w:7.2,h,fontSize:pt,bold:heading,align:'left',lines,color:dark?'#F7FAFF':'#14243D'});y+=h+.16;}
        if(!ok)continue;
        const objects=[...(image?[{...image,x:0,y:0,w:13.333333,h:7.5,backgroundImage:true,imageTreatment:'dark',imageTextSide:'left'}]:[]),...placed];
        const candidate={...scene,slides:[{...first,background:bg,objects},...scene.slides.slice(1)]};
        if(good(candidate.slides[0])&&validateScene(doc,candidate).passed)return candidate;
    }
    throw Error('COVER_BRANDING_SPACE');
}
export function drawCoverBranding(slide,pptx,branding,layout) {
    const plan=layout||coverBrandingLayout(branding);
    if(plan.author){const bg=branding.background||'#0D1B2A';const c=[1,3,5].map(i=>parseInt(bg.slice(i,i+2),16));const light=c[0]*.2126+c[1]*.7152+c[2]*.0722>140;
        slide.addText(plan.author,{...plan.authorBox,fontFace:fontForText(plan.author),fontSize:18,color:light?'223653':'F7FAFF',margin:0,breakLine:false,paraSpaceAfter:0,lineSpacing:18*1.28,valign:'top',objectName:'np-cover-author'});}
    for(const [i,o]of plan.logos.entries()){
        // Draw the original PNG directly; no plate or background is added.
        const file=branding.paths?.[o.id];if(!file)throw Error('COVER_LOGO_NOT_FOUND');
        slide.addImage({path:file,x:o.x,y:o.y,w:o.w,h:o.h,objectName:'np-cover-logo-'+i});
    }
}
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
export async function verifyCoverBranding(zip,branding) {
    const plan=coverBrandingLayout(branding);const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false,trimValues:false});
    const invalid=()=>{throw Error('COVER_METADATA_MISMATCH');};let authors=0;const seen=new Set();
    for(const file of Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))){
        const xml=await zip.file(file).async('string');const tree=parser.parse(xml)['p:sld']['p:cSld']['p:spTree'];
        for(const s of arr(tree['p:sp'])){
            const name=s['p:nvSpPr']?.['p:cNvPr']?.['@_name']||'';
            if(name!=='np-cover-author')continue;
            if(file!=='ppt/slides/slide1.xml'||!plan.author||++authors!==1)invalid();
            const text=arr(s['p:txBody']?.['a:p']).map(p=>arr(p['a:r']).map(r=>typeof r['a:t']==='object'?r['a:t']['#text']||'':r['a:t']||'').join('')).join('\n');
            if(text!==plan.author)invalid();
        }
        const logos=arr(tree['p:pic']).filter(p=>/^np-cover-logo-\d+$/.test(p['p:nvPicPr']?.['p:cNvPr']?.['@_name']||''));
        if(!logos.length)continue;if(file!=='ppt/slides/slide1.xml')invalid();
        const rels=parser.parse(await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')).Relationships;
        for(const pic of logos){const index=Number(pic['p:nvPicPr']['p:cNvPr']['@_name'].split('-').at(-1)),expected=plan.logos[index];if(!expected||seen.has(index))invalid();seen.add(index);
            const rid=pic['p:blipFill']?.['a:blip']?.['@_r:embed'];const rel=arr(rels.Relationship).find(r=>r['@_Id']===rid);
            if(!rel||rel['@_TargetMode']==='External')invalid();const target=path.posix.normalize(path.posix.join('ppt/slides',rel['@_Target']));const media=zip.file(target);if(!media)invalid();
            const hash=createHash('sha256').update(await media.async('nodebuffer')).digest('hex');if(hash!==expected.sha256)invalid();
        }
    }
    if(authors!==(plan.author?1:0)||seen.size!==plan.logos.length)invalid();
    return {author:!!plan.author,logos:seen.size,verified:true};
}
