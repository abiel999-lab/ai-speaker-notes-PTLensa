import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { digest,decodeJournalXml,parseJournalLayout,journalMetadata,inventoryJournal,journalSections,sentenceEvidence } from '../core/journal.js';
const require=createRequire(import.meta.url);
const pptxgen=require('pptxgenjs'), sharp=require('sharp'), JSZip=require('jszip');
const W=13.333333,H=7.5;
export const MAX_JOURNAL_BYTES=10*1024*1024;

export function decodeJournal(body) {
    if(!body||Object.keys(body).some(k=>!['name','base64'].includes(k))||typeof body.name!=='string'||body.name.length>120||!/\.pdf$/i.test(body.name)||typeof body.base64!=='string'||body.base64.length>Math.ceil(MAX_JOURNAL_BYTES/3)*4||/[^A-Za-z0-9+/=]/.test(body.base64))throw Error('JOURNAL_INVALID');
    const bytes=Buffer.from(body.base64,'base64');
    if(!bytes.length||bytes.length>MAX_JOURNAL_BYTES||bytes.toString('base64')!==body.base64||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('JOURNAL_INVALID');
    return bytes;
}

async function native(command,args,{signal,outputLimit=16*1024*1024}={}) {
    return new Promise((resolve,reject)=>{
        const child=spawn(command,args,{stdio:['ignore','pipe','ignore'],windowsHide:true});
        let size=0; const chunks=[];
        const stop=()=>child.kill('SIGKILL');
        const timer=setTimeout(stop,45000);
        signal?.addEventListener('abort',stop,{once:true});
        child.stdout.on('data',d=>{size+=d.length;if(size>outputLimit)stop();else chunks.push(d);});
        const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
        child.once('error',()=>{done();reject(Error('JOURNAL_TOOLS_UNAVAILABLE'));});
        child.once('close',code=>{done();code===0&&!signal?.aborted&&size<=outputLimit?resolve(Buffer.concat(chunks)):reject(Error('JOURNAL_PDF_UNREADABLE'));});
        if(signal?.aborted)stop();
    });
}

function contain(iw,ih,box) {
    const scale=Math.min(box.w/iw,box.h/ih),w=iw*scale,h=ih*scale;
    return {x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h};
}
function addText(slide,text,box,extra={}) {
    slide.addText(text,{...box,fontFace:'Arial',fontSize:20,color:'193550',margin:0,breakLine:false,vertAlign:'top',...extra});
}
function newSlide(pptx,title,number) {
    const slide=pptx.addSlide();slide.background={color:'FFFFFF'};
    addText(slide,title,{x:.55,y:.3,w:12.1,h:.7},{fontSize:27,bold:true});
    addText(slide,String(number),{x:12.2,y:7.12,w:.5,h:.2},{fontSize:10,color:'62758A'});
    return slide;
}
function sourceNote(meta,page) {return `${meta.filename} — PDF page ${page}${meta.doi?' — https://doi.org/'+meta.doi:''}`;}

async function cropRegion(im, page, region) {
    const x=Math.max(0,Math.floor(region.x/page.width*im.width));
    const y=Math.max(0,Math.floor(region.y/page.height*im.height));
    const width=Math.min(im.width-x,Math.ceil((region.x+region.w)/page.width*im.width)-x);
    const height=Math.min(im.height-y,Math.ceil((region.y+region.h)/page.height*im.height)-y);
    if(width<1||height<1)return;
    return sharp(im.data).extract({left:x,top:y,width,height}).png().toBuffer();
}

function numericAttributes(tag) {
    return Object.fromEntries([...tag.matchAll(/\b(number|width|height|left|top)="(-?\d+(?:\.\d+)?)"/g)]
        .map(([,key,value])=>[key,Number(value)]));
}

async function collectPdfVisuals(pdf, dir, pages, images, visuals, signal, imageLayoutXml) {
    const figures=[];
    for (const visual of visuals) {
        const page=pages[visual.page-1];
        const data=await cropRegion(images.get(page.number),page,visual.region);
        if(data)figures.push({page:page.number,caption:visual.caption,data});
    }
    let layout=imageLayoutXml;
    if(layout===undefined){
        layout='';
        try {
            const output=path.join(dir,'embedded-images.xml');
            await native('pdftohtml',['-xml','-nomerge','-noroundcoord','-zoom','1','-fmt','png',pdf,output],{signal});
            layout=await fs.readFile(output,'utf8');
        } catch {
            // Full page images already contain every visible element.
            signal?.throwIfAborted();
        }
    }
    const regionsByPage=new Map();
    for(const [,tag,body] of layout.matchAll(/<page\s+([^>]+)>([\s\S]*?)<\/page>/g)){
        const page=numericAttributes(tag);
        if(!images.has(page.number)||!page.width||!page.height)continue;
        const seen=new Set();
        const regions=[];
        for(const [imageTag] of body.matchAll(/<image\b[^>]+>/g)){
            const {left:x,top:y,width:w,height:h}=numericAttributes(imageTag);
            // Leading logos, tiny icons and complete scanned sheets remain
            // visible on the original page. Reserve close-ups for larger images.
            if(!(w>=page.width*0.14&&h>=page.height*0.045)
                ||(w>=page.width*0.92&&h>=page.height*0.88)||!Number.isFinite(x)||!Number.isFinite(y))continue;
            const key=[x,y,w,h].map(Math.round).join(',');
            if(seen.has(key))continue;
            seen.add(key);
            regions.push({x,y,w,h});
        }
        regionsByPage.set(page.number,{page,regions:regions.sort((a,b)=>a.y-b.y||a.x-b.x)});
    }
    const fullCopyVisuals=[];
    let detailCount=0;
    for(const original of pages){
        const image=images.get(original.number);
        fullCopyVisuals.push({page:original.number,caption:`Original PDF page ${original.number}`,visualKind:'pdf-page',data:image.data});
        const layout=regionsByPage.get(original.number);
        if(!layout)continue;
        for(const region of layout.regions){
            if(detailCount>=80)break;
            signal?.throwIfAborted();
            const data=await cropRegion(image,layout.page,region);
            if(!data)continue;
            fullCopyVisuals.push({page:original.number,caption:`Image detail from PDF page ${original.number}`,visualKind:'pdf-detail',data});
            detailCount++;
        }
    }
    return {figures,fullCopyVisuals};
}

export async function createJournalDeck(bytes,name,{signal,layoutXml,pageImage,inspectOnly=false,captureSource=false,capturePdfVisuals=false,imageLayoutXml}={}) {
    const temporaryRoot=path.resolve(os.tmpdir());
    const dir=await fs.mkdtemp(path.join(temporaryRoot,'notepreso-journal-'));
    if(path.dirname(path.resolve(dir))!==temporaryRoot)throw Error('JOURNAL_INVALID');
    try {
        if(!bytes.length||bytes.length>MAX_JOURNAL_BYTES||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('JOURNAL_INVALID');
        const pdf=path.join(dir,'source.pdf');await fs.writeFile(pdf,bytes,{mode:0o600});
        const xml=layoutXml??(await native('pdftotext',['-bbox-layout','-enc','UTF-8',pdf,'-'],{signal})).toString('utf8');
        const pages=parseJournalLayout(xml,{allowImageOnly:capturePdfVisuals}),meta=journalMetadata(pages,name),visuals=inventoryJournal(pages),sections=journalSections(pages);
        const manifest={version:'journal-v1',sourceHash:digest(bytes),metadata:meta,pages:pages.length,visuals,sections:sections.map(s=>({title:s.title,pages:s.pages})),coverage:{strategy:'all-original-pages',sourcePages:pages.map(p=>p.number)},warnings:[]};
        if(inspectOnly)return {manifest};
        if(!sections.length)sections.push({title:'Document content',pages:pages.map(p=>p.number),paragraphs:pages.flatMap(p=>p.blocks.filter(b=>b.text.length>100).map(b=>({text:b.text,page:p.number})))});
        const images=new Map();
        for(const page of pages) {
            signal?.throwIfAborted();
            let file;
            if(pageImage)file=await pageImage(page.number);
            else {
                const prefix=path.join(dir,`page-${page.number}`);
                await native('pdftoppm',['-f',String(page.number),'-l',String(page.number),'-singlefile','-scale-to','2400','-png',pdf,prefix],{signal});
                file=prefix+'.png';
            }
            const data=await fs.readFile(file),info=await sharp(data,{limitInputPixels:16000000}).metadata();
            if(!info.width||!info.height)throw Error('JOURNAL_PDF_UNREADABLE');
            images.set(page.number,{data,width:info.width,height:info.height});
        }
        if(capturePdfVisuals){
            const extractedSource=pages.filter(page=>page.lines.length)
                .map(page=>`\n## Source page ${page.number}\n`+page.lines.map(line=>line.text).join('\n')).join('\n');
            return {title:meta.title,extractedSource:extractedSource||`# ${name.replace(/\.pdf$/i,'')}`,
                ...await collectPdfVisuals(pdf,dir,pages,images,visuals,signal,imageLayoutXml)};
        }
        const pptx=new pptxgen();pptx.layout='LAYOUT_WIDE';pptx.author=meta.authors;pptx.title=meta.title;pptx.subject='Research journal presentation';pptx.lang='en-US';
        const notes=[],mapping=[];
        const note=(slide,text)=>{slide.addNotes(text);notes.push(text);};
        const cover=pptx.addSlide();cover.background={color:'102D49'};
        addText(cover,meta.kind==='review'?'RESEARCH REVIEW':'RESEARCH PRESENTATION',{x:.7,y:.7,w:11.8,h:.4},{fontSize:14,color:'A7CBE8'});
        addText(cover,meta.title,{x:.7,y:1.65,w:11.8,h:2.6},{fontSize:33,color:'FFFFFF',bold:true});
        addText(cover,meta.authors,{x:.72,y:4.8,w:11.7,h:1.1},{fontSize:17,color:'DDEAF6'});
        addText(cover,meta.doi?'doi: '+meta.doi:name,{x:.72,y:6.55,w:11.6,h:.5},{fontSize:12,color:'A7CBE8'});
        note(cover,`${meta.title}\n\n${meta.authors}\n\n${sourceNote(meta,1)}`);
        const addVisual=async v=>{
            const page=pages[v.page-1],im=images.get(v.page);
            // Cropping isolates a region of the page; image fit on slides always
            // contains that entire region. The full original page also ships below.
            const x=Math.max(0,Math.floor(v.region.x/page.width*im.width));
            const y=Math.max(0,Math.floor(v.region.y/page.height*im.height));
            const width=Math.min(im.width-x,Math.ceil(v.region.w/page.width*im.width));
            const height=Math.min(im.height-y,Math.ceil(v.region.h/page.height*im.height));
            const image=await sharp(im.data).extract({left:x,top:y,width,height}).png().toBuffer();
            const label=v.kind==='graphical-abstract'?'Graphical abstract':`${v.kind==='table'?'Table':'Figure'} ${v.number}`;
            const slide=newSlide(pptx,label,pptx._slides.length+1);
            const box=contain(width,height,{x:.5,y:1.05,w:12.33,h:5.95});
            slide.addImage({data:'image/png;base64,'+image.toString('base64'),...box,objectName:`journal-${v.id}`,altText:v.caption});
            const context=sections.flatMap(s=>s.paragraphs).filter(p=>p.page===v.page&&new RegExp(`\\b(?:Fig(?:ure)?\\.?|Table)\\s*${v.number}\\b`,'i').test(p.text)).map(p=>p.text);
            note(slide,`${v.caption}\n\n${context.join('\n\n')||pages[v.page-1].blocks.filter(b=>b.text.length>150).slice(0,2).map(b=>b.text).join('\n\n')}\n\n${sourceNote(meta,v.page)}`);
            const item={id:v.id,slide:pptx._slides.length,page:v.page,imageHash:digest(image),imageWidth:width,imageHeight:height,box};mapping.push(item);v.slide=item.slide;
        };
        const remaining=new Set(visuals.map(v=>v.id));
        for(const section of sections) {
            const evidence=sentenceEvidence(section);
            const selected=evidence.map((e,i)=>({...e,score:(/\d|significant|however|limitation|aim|objective|collected|found|result|conclu/i.test(e.text)?2:0)-i*.005})).sort((a,b)=>b.score-a.score).slice(0,6);
            if(!selected.length)continue;
            for(let i=0;i<selected.length;i+=3) {
                const group=selected.slice(i,i+3),slide=newSlide(pptx,section.title+(i?' (continued)':''),pptx._slides.length+1);
                for(const [j,e]of group.entries())addText(slide,e.text,{x:.78,y:1.45+j*1.52,w:11.7,h:1.32},{fontSize:21,bullet:{indent:15},paraSpaceAfterPt:12});
                const contexts=[...new Set(group.map(e=>e.context))];
                note(slide,contexts.map(t=>t+'\n'+sourceNote(meta,group.find(e=>e.context===t).page)).join('\n\n'));
                addText(slide,`Source: PDF pages ${[...new Set(group.map(e=>e.page))].join(', ')}`,{x:.8,y:6.7,w:11.6,h:.3},{fontSize:11,color:'62758A'});
            }
            const maxPage=Math.max(...section.pages);
            for(const v of visuals.filter(v=>remaining.has(v.id)&&v.page<=maxPage)) {await addVisual(v);remaining.delete(v.id);}
        }
        for(const v of visuals.filter(v=>remaining.has(v.id)))await addVisual(v);
        const appendix=[];
        for(const page of pages) {
            const im=images.get(page.number),slide=newSlide(pptx,`Source journal — page ${page.number}`,pptx._slides.length+1);
            const box=contain(im.width,im.height,{x:.45,y:1,w:12.43,h:6});
            slide.addImage({data:'image/png;base64,'+im.data.toString('base64'),...box,objectName:`journal-source-page-${page.number}`,altText:`Complete original PDF page ${page.number}`});
            note(slide,`${page.blocks.map(b=>b.text).join('\n\n')}\n\n${sourceNote(meta,page.number)}`);
            appendix.push({page:page.number,slide:pptx._slides.length,imageHash:digest(im.data),imageWidth:im.width,imageHeight:im.height,box});
        }
        const deck=Buffer.from(await pptx.write({outputType:'nodebuffer',compression:true}));
        const verification=await verifyJournalDeck(deck,{pages:pages.length,visuals:mapping,appendix,notes});
        manifest.slides=pptx._slides.length;manifest.mapping=mapping;manifest.appendix=appendix;manifest.verification=verification;
        if(visuals.some(v=>v.kind==='graphical-abstract'))manifest.warnings.push('Unnumbered graphical abstract included.');
        manifest.warnings.push('Automatic visual regions require review; complete original pages are included as a coverage safeguard.');
        return {bytes:deck,manifest,...(captureSource?{extractedSource:pages.map(p=>`\n## Source page ${p.number}\n`+p.lines.map(l=>l.text).join("\n")).join("\n")}:{}),notesBySlide:notes,notes:notes.map((n,i)=>`Slide ${i+1}\n${n}`).join('\n\n---\n\n')};
    } finally {await fs.rm(dir,{recursive:true,force:true});}
}

export async function verifyJournalDeck(bytes,{pages,visuals,appendix,notes}) {
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
    const slideNames=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n));
    const media=new Set(await Promise.all(Object.values(zip.files).filter(f=>/^ppt\/media\//.test(f.name)&&!f.dir).map(async f=>digest(await f.async('nodebuffer')))));
    if(appendix.length!==pages||new Set(appendix.map(p=>p.page)).size!==pages||slideNames.length!==notes.length)throw Error('JOURNAL_COVERAGE_FAILED');
    for(const item of [...visuals,...appendix]) {
        const xml=await zip.file(`ppt/slides/slide${item.slide}.xml`)?.async('string');
        const label=item.id?`journal-${item.id}`:`journal-source-page-${item.page}`;
        if(!xml?.includes(label)||!media.has(item.imageHash)||/<a:srcRect\b/.test(xml)||Math.abs(item.box.w/item.box.h-item.imageWidth/item.imageHeight)>.0001)throw Error('JOURNAL_COVERAGE_FAILED');
        const picture=[...xml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g)].map(m=>m[0]).find(p=>p.includes(`name="${label}"`));
        const extent=picture?.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
        if(!extent||Math.abs(Number(extent[1])/Number(extent[2])-item.imageWidth/item.imageHeight)>.0001)throw Error('JOURNAL_COVERAGE_FAILED');
        const rel=await zip.file(`ppt/slides/_rels/slide${item.slide}.xml.rels`)?.async('string');
        const related=[...(rel||'').matchAll(/Target="\.\.\/media\/([^\"]+)"/g)].map(m=>`ppt/media/${m[1]}`);
        const hashes=await Promise.all(related.map(async n=>digest(await zip.file(n).async('nodebuffer'))));
        if(!hashes.includes(item.imageHash))throw Error('JOURNAL_COVERAGE_FAILED');
    }
    for(let i=0;i<notes.length;i++) {
        const xml=await zip.file(`ppt/notesSlides/notesSlide${i+1}.xml`)?.async('string');
        if(!xml||!notes[i].trim()||!xml.includes('PDF page'))throw Error('JOURNAL_NOTES_FAILED');
        const normalize=s=>s.replace(/\s+/g,' ').trim();
        const actual=normalize([...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>decodeJournalXml(m[1])).join(' '));
        if(!actual.includes(normalize(notes[i])))throw Error('JOURNAL_NOTES_FAILED');
    }
    return {passed:true,sourcePages:pages,mappedVisuals:visuals.length,slides:notes.length,originalImagesVerified:true,aspectRatiosVerified:true,notesVerified:true};
}
