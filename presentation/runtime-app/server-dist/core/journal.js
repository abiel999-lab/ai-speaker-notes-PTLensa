// PDF text is evidence, never executable instructions or a model prompt.
import { createHash } from 'node:crypto';
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)] || 12;
const plain = s => s.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi, (_,h,d,n) => h||d ? String.fromCodePoint(parseInt(h||d,h?16:10)) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[n.toLowerCase()]).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
export const decodeJournalXml=plain;
const attrs = s => Object.fromEntries([...s.matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],Number(m[2])]));
const textOf = lines => lines.map(l=>l.text).join(' ').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
function positionedText(words,font) {
    const ordinary=words.filter(w=>w.yMax-w.yMin>=font*.85);
    const baselineTop=median(ordinary.map(w=>w.yMin)),baselineBottom=median(ordinary.map(w=>w.yMax));
    const sub='₀₁₂₃₄₅₆₇₈₉',sup='⁰¹²³⁴⁵⁶⁷⁸⁹';let text='',previous;
    for(const word of words){
        let value=word.text.replace(/\u00ad/g,'');if(!value)continue;
        if(/^[0-9−+()]+$/.test(value)&&word.yMax-word.yMin<font*.82){
            if(word.yMin>baselineTop+2)value=value.replace(/[0-9−+()]/g,c=>/\d/.test(c)?sub[Number(c)]:({'−':'₋','+':'₊','(':'₍',')':'₎'})[c]);
            else if(word.yMax<baselineBottom-2)value=value.replace(/[0-9−+()]/g,c=>/\d/.test(c)?sup[Number(c)]:({'−':'⁻','+':'⁺','(':'⁽',')':'⁾'})[c]);
        }
        const gap=previous?word.xMin-previous.xMax:0;
        text+=(previous&&gap>font*.09&&!/^[.,;:!?\])]/.test(value)&&!/[\[(]$/.test(text)?' ':'')+value;
        previous=word;
    }
    return text;
}
function bodyFontFor(pages) {
    const values=pages.slice(1,7).flatMap(p=>p.lines.filter(l=>l.text.length>40&&l.font>=10&&l.font<18).map(l=>Math.round(l.font*4)/4));
    const counts=new Map();for(const v of values)counts.set(v,(counts.get(v)||0)+1);
    return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||13;
}

export function parseJournalLayout(xml) {
    const pages=[];
    for (const p of xml.matchAll(/<page\s+([^>]+)>([\s\S]*?)<\/page>/g)) {
        const size=attrs(p[1]);
        if (!size.width || !size.height || size.width>2000 || size.height>2000) throw Error('JOURNAL_PAGE_SIZE');
        const page={number:pages.length+1,width:size.width,height:size.height,blocks:[],lines:[]};
        for (const [bi,b] of [...p[2].matchAll(/<block\s+([^>]+)>([\s\S]*?)<\/block>/g)].entries()) {
            const groups = new Map();
            for (const l of b[2].matchAll(/<line\s+[^>]+>([\s\S]*?)<\/line>/g)) {
                let chunk=[];
                const flush=()=>{
                    if(!chunk.length)return;
                    const box={xMin:chunk[0].xMin,yMin:Math.min(...chunk.map(w=>w.yMin)),xMax:chunk.at(-1).xMax,yMax:Math.max(...chunk.map(w=>w.yMax))};
                    const line={...box,text:chunk.map(w=>w.text).join(' '),font:median(chunk.map(w=>w.yMax-w.yMin)),block:bi,words:chunk.map(w=>({...w}))};
                    page.lines.push(line);
                    const side=box.xMin>size.width*.48?'right':box.xMax<size.width*.55?'left':'wide';
                    if(!groups.has(side))groups.set(side,[]);
                    groups.get(side).push(line);chunk=[];
                };
                for(const w of l[1].matchAll(/<word\s+([^>]+)>([\s\S]*?)<\/word>/g)) {
                    const item={...attrs(w[1]),text:plain(w[2])};
                    if(chunk.length && (item.xMin-chunk.at(-1).xMax>18 || (chunk[0].xMin<size.width*.48&&chunk.at(-1).xMax<size.width*.50&&item.xMin>size.width*.50&&item.xMin-chunk.at(-1).xMax>7)))flush();
                    chunk.push(item);
                }
                flush();
            }
            for(const lines of groups.values())page.blocks.push({id:`p${page.number}-b${bi}-${lines[0].xMin}`,lines,text:textOf(lines),font:median(lines.map(l=>l.font)),xMin:Math.min(...lines.map(l=>l.xMin)),xMax:Math.max(...lines.map(l=>l.xMax)),yMin:Math.min(...lines.map(l=>l.yMin)),yMax:Math.max(...lines.map(l=>l.yMax))});
        }
        // Poppler emits many subscripts/superscripts as separate lines or blocks.
        // Attach spatially overlapping fragments before reading order is decided.
        // Comparing a fixed anchor avoids chaining into an adjacent physical row.
        const rows=[];
        for(const line of [...page.lines].sort((a,b)=>b.text.length-a.text.length)){
            const row=rows.find(r=>{
                const a=r.anchor,overlap=Math.min(a.yMax,line.yMax)-Math.max(a.yMin,line.yMin);
                const separateColumns=page.number>1&&((a.xMax<page.width*.50&&line.xMin>page.width*.50)||(line.xMax<page.width*.50&&a.xMin>page.width*.50));
                const gap=Math.max(line.xMin-a.xMax,a.xMin-line.xMax,0);
                return !separateColumns&&gap<22&&overlap/Math.min(a.yMax-a.yMin,line.yMax-line.yMin)>.68;
            });
            if(row)row.members.push(line);else rows.push({anchor:line,members:[line]});
        }
        page.lines=rows.map(r=>{
            const words=r.members.flatMap(l=>l.words).sort((a,b)=>a.xMin-b.xMin);
            return {...r.anchor,words,text:positionedText(words,r.anchor.font),xMin:Math.min(...words.map(w=>w.xMin)),xMax:Math.max(...words.map(w=>w.xMax)),yMin:Math.min(...words.map(w=>w.yMin)),yMax:Math.max(...words.map(w=>w.yMax)),font:median(words.map(w=>w.yMax-w.yMin))};
        }).sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin);
        pages.push(page);
    }
    if(!pages.length || pages.length>40)throw Error('JOURNAL_PAGE_LIMIT');
    if(pages.reduce((n,p)=>n+p.lines.reduce((s,l)=>s+l.text.length,0),0)>240000)throw Error('JOURNAL_TEXT_LIMIT');
    if(pages.reduce((n,p)=>n+p.lines.length,0)<10)throw Error('JOURNAL_OCR_REQUIRED');
    return pages;
}

export function journalMetadata(pages, filename) {
    const first=pages[0];
    const candidates=first.lines.filter(l=>l.yMin>first.height*.09&&l.yMin<first.height*.35&&l.text.length>20&&!/https?:/.test(l.text));
    const max=Math.max(...candidates.map(l=>l.font));
    const titleLines=candidates.filter(l=>l.font>=max*.88);
    const title=textOf(titleLines)||filename.replace(/\.pdf$/i,'');
    const titleEnd=Math.max(0,...titleLines.map(l=>l.yMax));
    const authorLines=first.lines.filter(l=>l.yMin>titleEnd&&l.yMin<titleEnd+48&&!/^(Department|Received|©)/i.test(l.text));
    const all=pages.flatMap(p=>p.lines.map(l=>l.text)).join('\n');
    const doi=all.match(/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/)?.[0]?.replace(/[.,;]+$/,'')||'';
    return {title,authors:textOf(authorLines),doi,kind:/\b(systematic review|meta-analysis|REVIEW)\b/i.test(first.lines.map(l=>l.text).join(' '))?'review':'research',filename};
}

function captionMatch(line) {
    const m=line.text.match(/^(Figure|Fig\.?|Table)\s*(\d+)\b[.\s\u2000-\u200b]*(.*)/i);
    if(!m || /^(shows?|presents?|provides?|summarizes?|lists?|the following|and\b|,)/i.test(m[3]))return null;
    return {kind:/table/i.test(m[1])?'table':'figure',number:Number(m[2])};
}

export function inventoryJournal(pages) {
    const visuals=[];
    const documentFont=bodyFontFor(pages);
    for(const page of pages) {
        const bodyFont=documentFont;
        for(const line of page.lines) {
            const match=captionMatch(line);
            if(!match || line.font>bodyFont*1.10)continue;
            const id=`${match.kind}-${match.number}`;
            if(visuals.some(v=>v.id===id))continue;
            const nearby=page.lines.filter(l=>l.block===line.block&&l.xMin>=line.xMin-10&&l.xMin<=line.xMin+24&&l.yMin>=line.yMin&&l.yMin<line.yMin+42);
            visuals.push({id,...match,page:page.number,caption:textOf(nearby.length?nearby:[line]),captionBox:{...line},region:visualRegion(page,line,match.kind,bodyFont)});
        }
        const graphical=page.lines.find(l=>/^Graphical\s+abstract$/i.test(l.text));
        if(graphical) {
            const next=page.lines.filter(l=>/^\d*\s*Introduction$/i.test(l.text)&&l.yMin>graphical.yMax).sort((a,b)=>a.yMin-b.yMin)[0];
            visuals.push({id:`graphical-abstract-${page.number}`,kind:'graphical-abstract',page:page.number,caption:'Graphical abstract',region:{x:35,y:graphical.yMin,w:page.width-70,h:(next?.yMin||page.height*.55)-graphical.yMin-7}});
        }
    }
    return visuals.sort((a,b)=>a.page-b.page||(a.captionBox?.yMin||0)-(b.captionBox?.yMin||0));
}

function visualRegion(page,caption,kind,bodyFont) {
    const prose=page.lines.filter(b=>((b.text.length>35&&b.font>=bodyFont*.97&&b.font<bodyFont*1.12)||(b.text.length<95&&b.font>bodyFont*1.15))&&!captionMatch(b)&&b.yMin>page.height*.07&&b.yMax<page.height*.93);
    const side=caption.xMin>page.width*.48?'right':caption.xMax<page.width*.51?'left':'wide';
    const opposing=prose.some(b=>(side==='left'?b.xMin>page.width*.49:b.xMax<page.width*.51)&&(kind==='table'?b.yMin<caption.yMax+80&&b.yMax>caption.yMax+30:b.yMin<caption.yMax&&b.yMax>caption.yMin-100));
    const column=side!=='wide'&&opposing&&(kind==='table'||caption.yMin>page.height*.15);
    const x=column?(side==='left'?35:page.width*.505):35;
    const right=column?(side==='left'?page.width*.495:page.width-35):page.width-35;
    const relevant=prose.filter(b=>b.xMax>x+30&&b.xMin<right-30);
    let top,bottom;
    if(kind==='figure'&&caption.yMin>page.height*.15) {
        top=Math.max(page.height*.065,...relevant.filter(b=>b.yMax<caption.yMin-12).map(b=>b.yMax+4));
        const previousCaption=page.lines.filter(l=>captionMatch(l)?.kind==='figure'&&l.yMax<caption.yMin-25&&l.yMax>top).sort((a,b)=>b.yMax-a.yMax)[0];
        if(previousCaption)top=previousCaption.yMax+12;
        bottom=caption.yMax+18;
        bottom=Math.min(bottom,...relevant.filter(b=>b.yMin>caption.yMax+2).map(b=>b.yMin-3));
    } else if(kind==='figure') {
        top=page.height*.06;
        bottom=Math.min(page.height*.92,...relevant.filter(b=>b.yMin>caption.yMax+40).map(b=>b.yMin-5));
    } else {
        top=caption.yMin-8;
        bottom=Math.min(page.height*.92,...relevant.filter(b=>b.yMin>caption.yMax+28).map(b=>b.yMin-5));
        bottom=Math.min(bottom,...page.lines.filter(l=>captionMatch(l)&&l.yMin>caption.yMax+28&&l.xMax>x&&l.xMin<right).map(l=>l.yMin-8));
    }
    // A conservative region, plus an untouched page appendix, avoids loss from
    // uncertain vector/table boundaries. Never use a guessed crop as sole evidence.
    if(bottom-top<65){top=Math.max(page.height*.06,caption.yMin-180);bottom=Math.min(page.height*.93,caption.yMax+200);}
    return {x,y:top,w:right-x,h:bottom-top};
}

const sectionLabel = s => s.replace(/^\d+(?:\.\d+)*\.?\s*/,'').trim();
export function journalSections(pages) {
    const sections=[]; let current=null;
    const font=bodyFontFor(pages);
    const visuals=inventoryJournal(pages);
    for(const page of pages) {
        if(page.number===1)continue;
        let pending=[],previous=null;
        const flush=()=>{if(current&&pending.length){const text=textOf(pending).replace(/-\s+(?=[a-z])/g,'-');if(text.length>100){current.paragraphs.push({text,page:page.number});if(!current.pages.includes(page.number))current.pages.push(page.number);}}pending=[];};
        const lines=[...page.lines].sort((a,b)=>((a.xMin>page.width*.49?1:0)-(b.xMin>page.width*.49?1:0))||a.yMin-b.yMin||a.xMin-b.xMin);
        for(const line of lines) {
            const label=sectionLabel(line.text);
            if(line.text.length<95&&/^(Introduction|Background|Methods?|Materials and Methods|Results(?: and Discussion)?|Discussion|Conclusions?|Limitations?|Future (?:Research|Directions))$/i.test(label)) {
                flush();
                current={title:label,pages:[],paragraphs:[]};sections.push(current);continue;
            }
            if(line.text.length<90&&/^(References|Acknowledg|Funding|Author Contributions|Conflict|Competing|Ethic|Data Availability|Institutional Review|Informed Consent)/i.test(label)){flush();current=null;continue;}
            if(!current||line.font<font*.97||line.yMin<page.height*.07||line.yMax>page.height*.94||captionMatch(line))continue;
            if(visuals.some(v=>v.page===page.number&&line.yMin>=v.region.y&&line.yMax<=v.region.y+v.region.h&&line.xMin>=v.region.x&&line.xMax<=v.region.x+v.region.w))continue;
            if(line.font>font*1.15&&line.text.length<100){flush();continue;}
            if(previous&&(line.yMin-previous.yMax>8||line.yMin<previous.yMin||line.xMin>previous.xMin+12))flush();
            pending.push(line);previous=line;
        }
        flush();
    }
    const first=pages[0],abstract=first.lines.find(l=>/^Abstract$/i.test(l.text));
    if(abstract){
        const lines=first.lines.filter(l=>l.yMin>=abstract.yMax-1&&l.yMin<first.height*.69&&l.font<=font*1.1).sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin);
        if(lines.length)sections.unshift({title:'Study overview',pages:[1],paragraphs:[{text:textOf(lines).replace(/-\s+(?=[a-z])/g,'-'),page:1}]});
    }
    return sections.filter(s=>s.paragraphs.length);
}

export function sentenceEvidence(section) {
    const evidence=[];
    for(const p of section.paragraphs) {
        for(const text of p.text.split(/(?<=[.!?])\s+(?=[A-Z])/u)) {
            const value=text.trim();
            if(value.length>=65&&value.length<=265&&/^[A-Z]/.test(value)&&/[.!?]$/.test(value)&&!/^\[|^\d+\.|https?:|@|Copyright|References/i.test(value)){
                const complete=p.text.split(/(?<=[.!?])\s+(?=[A-Z])/u).filter(s=>/^[A-Z]/.test(s)&&/[.!?]$/.test(s));
                evidence.push({text:value,page:p.page,context:complete.join(' ')});
            }
        }
    }
    const seen=new Set();
    return evidence.filter(e=>!seen.has(e.text)&&seen.add(e.text));
}
