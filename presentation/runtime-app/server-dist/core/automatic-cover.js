/** Automatic AI Creative opening cover. No source text, IDs, order or links changed. */
import { wrapText, textHeight, WIDTH, HEIGHT } from './layout.js';
import { validateScene } from './fidelity.js';
import { sourceSlideSections, isSlideBoundaryText } from './creative-sections.js';
import { THEMES } from './palette.js';

export function openingCoverAtoms(atoms, target) {
    const authored = sourceSlideSections(atoms, target);
    if (authored) return authored[0];
    if (target === 1 || atoms.length === 1) return atoms;
    // Reserve the leading title and, when short, its subtitle. Never move later source forward.
    let end = 1;
    const available = target ? atoms.length - target + 1 : atoms.length - 1;
    if (atoms[0].kind === 'heading' && atoms[0].text.length <= 180) {
        while (end < Math.min(3, available) && atoms[end].kind === 'paragraph' &&
               atoms[end].text.length <= 130 &&
               atoms.slice(0, end + 1).reduce((n, a) => n + a.text.length, 0) <= 300) end++;
    }
    return atoms.slice(0, Math.max(1, end));
}
const rect = (x,y,w,h,fill,opacity=1) => ({type:'shape',shape:'rect',x,y,w,h,fill,fillOpacity:opacity});
const ellipse = (x,y,w,h,fill,opacity=1) => ({type:'shape',shape:'ellipse',x,y,w,h,fill,fillOpacity:opacity});
function hash(text) { let h=2166136261;for(const c of text) h=Math.imul(h^c.codePointAt(0),16777619);return h>>>0; }
function light(hex) { return [1,3,5].reduce((s,i,j)=>{let v=parseInt(hex.slice(i,i+2),16)/255;v=v<=.04045?v/12.92:((v+.055)/1.055)**2.4;return s+v*[.2126,.7152,.0722][j];},0)>.22; }
function artwork(style,accent,panel) {
    if(style===0) return [rect(8.55,.55,4.1,5.98,panel),ellipse(8.95,1.05,3.25,3.25,accent,.24),ellipse(9.62,1.72,1.9,1.9,accent,.58),rect(9,5.12,3.18,.07,accent),rect(9,5.43,2.15,.07,accent,.48)];
    if(style===1) return [rect(8.62,.7,4.05,5.8,panel),{type:'shape',shape:'parallelogram',x:8.83,y:1.15,w:3.35,h:4.25,fill:accent,fillOpacity:.65},rect(9.48,1.65,2.6,4.1,panel,.92),rect(8.86,5.95,3.32,.05,accent)];
    return [rect(8.65,.65,4.02,5.85,panel),rect(9.02,1.03,2.96,2.96,accent,.82),rect(9.54,1.55,2.96,2.96,panel,.88),ellipse(8.98,4.62,1.2,1.2,accent,.75),rect(10.55,5.14,1.63,.06,accent)];
}
export function styleOpeningCover(doc, scene) {
    if(!scene.slides.length) return scene;
    const original=scene.slides[0], palette=THEMES[scene.theme] || THEMES.cobalt;
    const content=original.objects.filter(o=>o.type==='text'||o.type==='table');
    const texts=content.filter(o=>o.type==='text');
    const sourceBlocks=new Map(doc.blocks.map(b=>[b.id,b]));
    const candidates=texts.filter(o=>!isSlideBoundaryText(o.text||''));
    const title=candidates.find(o=>sourceBlocks.get(o.sourceId)?.kind==='heading') || candidates[0];
    const marked={...original,layout:'cover'};
    const replace=slide=>({...scene,slides:[slide,...scene.slides.slice(1)]});
    // Keep an already strong Luna cover, including its chosen image and native artwork.
    if(title && title.bold && title.fontSize>=38 && candidates.length<=5 &&
       candidates.reduce((n,o)=>n+(o.text||'').length,0)<=500) {
        const proposed=replace(marked);
        if(validateScene(doc,proposed).passed) return proposed;
    }
    // Dense/table-led sources stay readable; no source is deleted to force a sparse cover.
    if(!title || content.some(o=>o.type==='table') || texts.length>9 ||
       candidates.reduce((n,o)=>n+(o.text||'').length,0)>1000) {
        const proposed=replace(marked);
        return validateScene(doc,proposed).passed?proposed:scene;
    }
    const image=original.objects.find(o=>o.type==='image');
    const bg=image?'#0D1B2A':original.background;
    const bright=image || !light(bg);
    const fg=bright?'#F7FAFF':'#14243D', muted=bright?'#CDDBE9':'#40516B';
    const style=hash(title.text||'')%3;
    for(const base of [56,50,44,38,32,28]) {
        const placed=[];
        let y=.9, ok=true;
        for(const o of texts) {
            const marker=isSlideBoundaryText(o.text||'');
            const headline=o===title;
            const pt=marker?14:headline?base:20;
            const width=7.35;
            const lines=(o.text||'').split('\n').flatMap(line=>wrapText(line,width,pt,headline));
            const h=textHeight(lines.length,pt)*1.18+.15;
            if(y+h>6.48) {ok=false;break;}
            placed.push({...o,x:.78,y,w:width,h,fontSize:pt,bold:headline,
                align:'left',color:marker?muted:headline?fg:muted,lines});
            y+=h+(headline?.28:.18);
        }
        if(!ok) continue;
        const art=image?[{...image,x:0,y:0,w:WIDTH,h:HEIGHT,
            backgroundImage:true,imageTreatment:'dark',imageTextSide:'left'}]:artwork(style,palette.accent,palette.panel);
        const candidate={...marked,background:bg,objects:[...art,...placed]};
        const proposed=replace(candidate);
        if(validateScene(doc,proposed).passed) return proposed;
    }
    const proposed=replace(marked);
    return validateScene(doc,proposed).passed?proposed:scene;
}
