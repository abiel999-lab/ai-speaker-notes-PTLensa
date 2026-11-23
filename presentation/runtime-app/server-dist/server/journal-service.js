import { findPdfVectorRegions, pdfEquationAt, pdfMultilineEquationAt } from './pdf-vector-regions.js';
import { equationParts } from '../core/native-equations.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { digest,decodeJournalXml,parseJournalLayout,journalMetadata,inventoryJournal,journalSections,sentenceEvidence } from '../core/journal.js';
import { addNativeMotion } from '../core/motion.js';
import { buildJournalFullCopy } from './journal-full-copy.js';
const require=createRequire(import.meta.url);
const pptxgen=require('pptxgenjs'), sharp=require('sharp'), JSZip=require('jszip');
const W=13.333333,H=7.5;
export const MAX_JOURNAL_BYTES=50*1024*1024;

export function decodeJournal(body) {
    const keys = ['name', 'base64', 'fontFamily', 'fontScale', 'density', 'includeSpeakerNotes', 'interactiveLinks', 'presenterContext', 'motion', 'reviewOutput', 'sourcePagesOnly', 'editableSource', 'renderPreview', 'journalRole'];
    const invalidOptions = body && (
        (body.journalRole !== undefined && !['full-copy','content'].includes(body.journalRole)) ||
        (body.motion !== undefined && !['none', 'keynote'].includes(body.motion)) ||
        (body.fontScale !== undefined && (!Number.isFinite(body.fontScale) || body.fontScale < .85 || body.fontScale > 1.15)) ||
        (body.density !== undefined && !['comfortable', 'compact'].includes(body.density)) ||
        ['includeSpeakerNotes', 'interactiveLinks', 'reviewOutput', 'sourcePagesOnly', 'editableSource', 'renderPreview'].some(key => body[key] !== undefined && typeof body[key] !== 'boolean') ||
        (body.presenterContext !== undefined && (typeof body.presenterContext !== 'string' || body.presenterContext.length > 3000))
    );
    if(!body||Object.keys(body).some(key=>!keys.includes(key))||invalidOptions||(body.fontFamily!==undefined&&!["Arial", "Aptos", "Calibri", "Cambria", "Century Gothic", "Comic Sans MS", "Garamond", "Georgia", "Helvetica", "Inter", "Lato", "Montserrat", "Open Sans", "Poppins", "Roboto", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"].includes(body.fontFamily))||typeof body.name!=='string'||body.name.length>120||!/\.pdf$/i.test(body.name)||typeof body.base64!=='string'||body.base64.length>Math.ceil(MAX_JOURNAL_BYTES/3)*4||/[^A-Za-z0-9+/=]/.test(body.base64))throw Error('JOURNAL_INVALID');
    const bytes=Buffer.from(body.base64,'base64');
    if(!bytes.length||bytes.length>MAX_JOURNAL_BYTES||bytes.toString('base64')!==body.base64||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('JOURNAL_INVALID');
    return bytes;
}

async function native(command,args,{signal,outputLimit=16*1024*1024,timeout=45000}={}) {
    return new Promise((resolve,reject)=>{
        const child=spawn(command,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});
        let size=0, timedOut=false, diagnostics=''; const chunks=[];
        child.stderr.on('data',data=>{diagnostics=(diagnostics+data.toString()).slice(-4096);});
        const stop=()=>child.kill('SIGKILL');
        const timer=setTimeout(()=>{timedOut=true;stop();},timeout);
        signal?.addEventListener('abort',stop,{once:true});
        child.stdout.on('data',d=>{size+=d.length;if(size>outputLimit)stop();else chunks.push(d);});
        const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
        child.once('error',()=>{done();reject(Error('JOURNAL_TOOLS_UNAVAILABLE'));});
        child.once('close',code=>{
            done();
            if(signal?.aborted||timedOut) reject(Error('JOURNAL_ANALYSIS_TIMEOUT'));
            else if(size>outputLimit) reject(Error('JOURNAL_LAYOUT_LIMIT'));
            else if(code===0) resolve(Buffer.concat(chunks));
            else reject(Error(/password|encrypted file/i.test(diagnostics)?'JOURNAL_PDF_PASSWORD_REQUIRED':'JOURNAL_PDF_UNREADABLE'));
        });
        if(signal?.aborted)stop();
    });
}

function contain(iw,ih,box) {
    const scale=Math.min(box.w/iw,box.h/ih),w=iw*scale,h=ih*scale;
    return {x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h};
}
function addText(slide,text,box,extra={}) {
    const fontSize = Math.round((extra.fontSize ?? 20) * (slide.journalFontScale ?? 1) * 100) / 100;
    const typography = slide.journalFontScale !== 1 ? {fit: 'shrink'} : {};
    if (extra.bullet && slide.journalDensity === 'compact') typography.lineSpacing = fontSize * 1.08;
    slide.addText(text,{...box,fontFace:slide.journalFont||'Arial',color:'193550',margin:0,breakLine:false,vertAlign:'top',...extra,...typography,fontSize});
}
function newSlide(pptx,title,number) {
    const slide=pptx.addSlide();
    Object.assign(slide, pptx.journalTypography);
    slide.background={color:'FFFFFF'};
    addText(slide,title,{x:.55,y:.3,w:12.1,h:.7},{fontSize:27,bold:true,objectName:'np-visual-cover-title'});
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

function pdfTextEvents(lines, visuals) {
    const text=lines.map(line=>line.text);
    const events=[];
    for(let index=0;index<lines.length;index++){
        const line=lines[index];
        const multiline=pdfMultilineEquationAt(text,index);
        if(multiline){
            const last=lines[multiline.end];
            // A glyph or image between formula rows can carry a missing operator.
            // Keep the original reading order unless all visible content is text.
            const interrupted=visuals.some(event=>event.y>=line.yMin && event.y<=last.yMax);
            if(!interrupted){
                try{
                    equationParts(multiline.text,{x:0,y:0,w:11.69,h:5});
                    events.push({y:line.yMin,x:line.xMin,text:multiline.text});
                    index=multiline.end;
                    continue;
                }catch(error){
                    if(!['MATH_SYNTAX','MATH_UNSUPPORTED','MATH_LAYOUT_SPACE'].includes(error.message))throw error;
                }
            }
        }
        if(pdfEquationAt(text,index)){
            events.push({y:line.yMin,x:line.xMin,text:'\\['},
                {y:lines[index+1].yMin,x:lines[index+1].xMin,text:text[index+1]},
                {y:lines[index+2].yMin,x:lines[index+2].xMin,text:'\\]'});
            index+=2;
            continue;
        }
        events.push({y:line.yMin,x:line.xMin,text:line.text});
    }
    return events;
}

async function readEmbeddedPdfImages(pdf, dir, pages, signal, imageLayoutXml) {
    let layout=imageLayoutXml;
    if(layout===undefined){
        layout='';
        try {
            const output=path.join(dir,'embedded-images.xml');
            await native('pdftohtml',['-xml','-nomerge','-noroundcoord','-zoom','1','-fmt','png',pdf,output],{signal});
            layout=await fs.readFile(output,'utf8');
        } catch {
            signal?.throwIfAborted();
            throw Error('DOCUMENT_IMAGE_EXTRACTION_FAILED');
        }
    }
    const regionsByPage=new Map();
    for(const [,tag,body] of layout.matchAll(/<page\s+([^>]+)>([\s\S]*?)<\/page>/g)){
        const page=numericAttributes(tag);
        const original=pages[page.number-1];
        if(!original||!page.width||!page.height)continue;
        const seen=new Set();
        const regions=[];
        for(const [imageTag] of body.matchAll(/<image\b[^>]+>/g)){
            const {left:x,top:y,width:w,height:h}=numericAttributes(imageTag);
            if(!(w>0&&h>0)||!Number.isFinite(x)||!Number.isFinite(y))continue;
            const file=path.basename(imageTag.match(/\bsrc="([^"]+)"/)?.[1] || '');
            if(imageLayoutXml===undefined&&!/^embedded-images-[\w.-]+\.(?:png|jpe?g)$/i.test(file))
                throw Error('DOCUMENT_IMAGE_EXTRACTION_FAILED');
            const key=[x,y,w,h,file].join(',');
            if(seen.has(key))continue;
            seen.add(key);
            regions.push({ x:x/page.width*original.width, y:y/page.height*original.height,
                w:w/page.width*original.width, h:h/page.height*original.height, file });
        }
        regionsByPage.set(page.number,regions.sort((a,b)=>a.y-b.y||a.x-b.x));
    }
    return regionsByPage;
}

async function collectPdfVisuals(pdf, dir, pages, images, visuals, signal, imageLayoutXml) {
    const figures=[];
    for (const visual of visuals) {
        const page=pages[visual.page-1];
        const data=await cropRegion(images.get(page.number),page,visual.region);
        if(data)figures.push({page:page.number,caption:visual.caption,data});
    }
    const regionsByPage=await readEmbeddedPdfImages(pdf,dir,pages,signal,imageLayoutXml);
    const fullCopyVisuals=[];
    const embeddedCount=[...regionsByPage.values()].reduce((total, regions)=>total+regions.length,0);
    let remainingVectors=Math.max(0,200-embeddedCount);
    let source='';
    const addText = text => { source += (source ? '\n' : '') + text; };
    for(const original of pages){
        const events=[];
        const embedded=regionsByPage.get(original.number)||[];
        for(const region of embedded) events.push({y:region.y,x:region.x,region});
        // Keep the existing image inventory intact when the document is at its asset limit.
        if(remainingVectors && original.lines.length){
            const pageImage=images.get(original.number);
            const vectors=await findPdfVectorRegions(pageImage,original,embedded);
            for(const region of vectors.slice(0,Math.min(remainingVectors,16))){
                events.push({y:region.y+region.h/2,x:region.x,region,vector:true});
                remainingVectors--;
            }
        }
        events.push(...pdfTextEvents(original.lines,events));
        for(const event of events.sort((a,b)=>a.y-b.y||a.x-b.x)){
            if(event.text!==undefined){
                addText(event.text);
                continue;
            }
            const {region}=event;
            let data;
            if(region.file){
                data=await sharp(await fs.readFile(path.join(dir,region.file)),{limitInputPixels:32e6})
                    .resize({width:2200,height:2200,fit:'inside',withoutEnlargement:true}).png().toBuffer();
            }else{
                data=await cropRegion(images.get(original.number),original,region);
            }
            if(fullCopyVisuals.length>=200)throw Error('DOCUMENT_IMAGE_LIMIT');
            if(data)fullCopyVisuals.push({page:original.number,
                caption:event.vector?`Vector detail, PDF page ${original.number}`:`Image ${fullCopyVisuals.length+1}, PDF page ${original.number}`,
                visualKind:'inline',sourceOffset:source.length+(source?1:0),
                ...(event.vector?{pdfRegionHeight:region.h}:{}),data});
        }
    }
    return {figures,fullCopyVisuals,source};
}

function standardizeJournalSections(sections) {
    const required = [
        ['Introduction', /^(Introduction|Background)$/i],
        ['Methodology', /^(Methods?|Methodology|Materials and Methods|Methods and Materials|Experimental(?: Methods| Procedures| Section)?|Study Design)$/i],
        ['Conclusion', /^Conclusions?$/i],
    ];
    for (const [title, match] of required) {
        const section = sections.find(value => match.test(value.title));
        if (section) {
            if (!(title === 'Introduction' && /^Background$/i.test(section.title))) section.title = title;
        } else {
            const before = title === 'Introduction' ? sections.findIndex(value => value.title !== 'Study overview')
                : title === 'Methodology' ? sections.findIndex(value => /^Results|^Discussion|^Conclusion/i.test(value.title)) : -1;
            sections.splice(before < 0 ? sections.length : before, 0, {title,pages:[],paragraphs:[],missing:true});
        }
    }
}


const missingSection = "No matching section was identified in this PDF. Check the original journal in the appendix.";

function selectEvidence(section, standardHeadings) {
    let evidence=sentenceEvidence(section);
    if (standardHeadings && !evidence.length)
        evidence=section.paragraphs.slice(0,3).map(p=>({
            text:p.text.length<=240?p.text:p.text.slice(0,237).replace(/\s+\S*$/,'')+'…',
            context:p.text,page:p.page,
        }));
    const selected=evidence.map((e,i)=>({...e,score:(/\d|significant|however|limitation|aim|objective|collected|found|result|conclu/i.test(e.text)?2:0)-i*.005})).sort((a,b)=>b.score-a.score).slice(0,6);
    return selected;
}

function groupEvidence(selected) {
    const groups = [];
    for (let index = 0; index < selected.length; index += 3) groups.push(selected.slice(index, index + 3));
    return groups;
}

function reviewJournal(meta, evidenceBySection) {
    const cover = {title: meta.title, items: [meta.authors, meta.doi && 'doi: ' + meta.doi].filter(Boolean), pages: [1]};
    return [cover, ...Array.from(evidenceBySection).flatMap(([section, evidence]) => {
        if (section.missing) return [{title: section.title, items: [missingSection], pages: []}];
        return groupEvidence(evidence).map((group, index) => ({
            title: section.title + (index ? ' (continued)' : ''),
            items: group.map(item => item.text),
            pages: [...new Set(group.map(item => item.page))],
        }));
    })];
}

// PptxGenJS writes an explicit Notes Master reference that desktop
// PowerPoint rejects for these exports. The notes slides already link to
// the master. Also declare the standard MIME type for .jpg image parts.
async function officeCompatiblePdfDeck(bytes) {
    const zip = await JSZip.loadAsync(bytes);
    const presentation = zip.file('ppt/presentation.xml');
    const types = zip.file('[Content_Types].xml');
    zip.file(presentation.name,(await presentation.async('string')).replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/g,''));
    zip.file(types.name,(await types.async('string')).replace(/ContentType="image\/jpg"/g,'ContentType="image/jpeg"'));
    return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}

function sourceTextParts(text) {
    const characters = Array.from(text);
    const parts = [];
    for (let start=0;start<characters.length;) {
        const window=characters.slice(start,start+850);
        const fragment=window.join('');
        const boundary=window.length===850 ? fragment.search(/\s+\S*$/u) : -1;
        const length=boundary>660 ? Array.from(fragment.slice(0,boundary)).length : window.length;
        parts.push(window.slice(0,length).join(''));
        start+=length;
    }
    return parts;
}

async function createSourcePageDeck(pdf,dir,pages,{signal,reviewOutput,motion,editableSource,fontFamily,fontScale,density,interactiveLinks}) {
    const pptx = new pptxgen();
    pptx.defineLayout({name:'source-pages',width:W,height:H});
    pptx.layout = 'source-pages';
    pptx.journalTypography={journalFont:fontFamily,journalFontScale:fontScale,journalDensity:density};
    pptx.theme={headFontFace:fontFamily,bodyFontFace:fontFamily};
    const review = [];
    const contents=interactiveLinks&&editableSource ? newSlide(pptx,'Contents',1) : null;
    const editablePages=[];
    // Use Poppler's reading order for multi-column reports. Keep the
    // positioned words when the independent extraction doesn't cover a page.
    let orderedPages=[];
    try {
        orderedPages=(await native('pdftotext',['-enc','UTF-8',pdf,'-'],{signal,outputLimit:4*1024*1024}))
            .toString('utf8').split('\f');
        if (orderedPages.at(-1)==='') orderedPages.pop();
    } catch {
        signal?.throwIfAborted();
    }
    const basename = path.join(dir,'original');
    await native('pdftoppm',['-jpeg','-jpegopt','quality=90','-scale-to','1800',pdf,basename],
        {signal,timeout:180000});
    const digits = String(pages.length).length;
    for (const page of pages) {
        signal?.throwIfAborted();
        const title = 'Source PDF — page ' + page.number;
        const file = basename + '-' + String(page.number).padStart(digits,'0') + '.jpg';
        const {width,height} = await sharp(file).metadata();
        const slide = newSlide(pptx,title,pptx._slides.length+1);
        slide.addImage({path:file,...contain(width,height,{x:.45,y:1,w:12.43,h:6}),objectName:'journal-source-page-'+page.number,altText:title});
        const positioned = page.lines.map(line => line.text).join('\n');
        const ordered = orderedPages.length===pages.length ? orderedPages[page.number-1].trim() : '';
        const text = ordered && ordered.replace(/\s/g,'').length >= .95 * positioned.replace(/\s/g,'').length
            && (ordered.match(/\uFFFD/g)||[]).length <= (positioned.match(/\uFFFD/g)||[]).length ? ordered : positioned;
        slide.addNotes(`PDF page ${page.number}\n\n${text || 'No selectable text on this page.'}`);
        if (editableSource&&text.trim()) editablePages.push({page:page.number,text});
        if (reviewOutput) {
            const preview = await sharp(file).resize({width:420,height:420,fit:'inside'}).jpeg({quality:70}).toBuffer();
            review.push({title,items:[text ? 'Selectable source text is included in the speaker notes.' : 'Image-only page.' ],pages:[page.number],image:'data:image/jpeg;base64,'+preview.toString('base64')});
        }
    }
    if (contents) {
        const entries=[{title:'Original PDF pages',slide:2},...(editablePages.length
            ? [{title:'Editable source text',slide:pptx._slides.length+1}] : [])];
        entries.forEach(({title,slide},index)=>addText(contents,title,{x:.8,y:1.45+index*.9,w:11.7,h:.6},
            {fontSize:22,color:'076E7B',hyperlink:{slide,tooltip:'Go to '+title}}));
        if (reviewOutput) review.unshift({title:'Contents',items:entries.map(entry=>entry.title),pages:[]});
    }
    for (const {page,text} of editablePages) {
        signal?.throwIfAborted();
        for (const [index,part] of sourceTextParts(text).entries()) {
            const title='Editable source text — page '+page+' · '+(index+1);
            const slide=newSlide(pptx,title,pptx._slides.length+1);
            addText(slide,part,{x:.72,y:1.18,w:11.9,h:5.65},
                {fontSize:density==='compact'?17:19,fit:'shrink',objectName:'vb-b0-0'});
            if(reviewOutput)review.push({title,items:[part],pages:[page]});
        }
    }
    let bytes=Buffer.from(await pptx.write({outputType:'nodebuffer',compression:true}));
    if(motion==='keynote') bytes=(await addNativeMotion(bytes)).bytes;
    bytes=await officeCompatiblePdfDeck(bytes);
    return {bytes,manifest:{pages:pages.length,visuals:[],slides:pptx._slides.length,generatedReview:review}};
}

export async function createJournalDeck(bytes,name,{signal,layoutXml,pageImage,inspectOnly=false,captureSource=false,capturePdfVisuals=false,imageLayoutXml,standardHeadings=false,fontFamily='Arial',fontScale=1,density='comfortable',includeSpeakerNotes=true,interactiveLinks=false,presenterContext='',motion='none',reviewOutput=false,sourcePagesOnly=false,allowSourcePageCopy=false,editableSource=false,journalRole="full-copy"}={}) {
    const temporaryRoot=path.resolve(os.tmpdir());
    const dir=await fs.mkdtemp(path.join(temporaryRoot,'notepreso-journal-'));
    if(path.dirname(path.resolve(dir))!==temporaryRoot)throw Error('JOURNAL_INVALID');
    try {
        if(!bytes.length||bytes.length>MAX_JOURNAL_BYTES||!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('JOURNAL_INVALID');
        const pdf=path.join(dir,'source.pdf');await fs.writeFile(pdf,bytes,{mode:0o600});
        const xml=layoutXml??(await native('pdftotext',['-bbox-layout','-enc','UTF-8',pdf,'-'],{signal,outputLimit:sourcePagesOnly||allowSourcePageCopy?32*1024*1024:16*1024*1024})).toString('utf8');
        const pages = sourcePagesOnly||allowSourcePageCopy
            ? parseJournalLayout(xml,{allowImageOnly:true,maxPages:200,maxText:1000000})
            : parseJournalLayout(xml,{allowImageOnly:capturePdfVisuals});
        const sourceManifest = () => {
            const textPages=pages.filter(page=>page.lines.some(line=>line.text.trim()));
            const pageBudget=Math.floor(110000/pages.length);
            const planningSource=textPages.map(page=>{
                const text=page.lines.map(line=>line.text).join(' ');
                return '## PDF page '+page.number+'\n'+text.slice(0,pageBudget)+(text.length>pageBudget?'…':'');
            }).join('\n\n');
            return {pages:pages.length,pagesWithText:textPages.length,planningSource,visuals:[],review:[]};
        };
        if (sourcePagesOnly) {
            if (inspectOnly) return {manifest:sourceManifest()};
            return await createSourcePageDeck(pdf,dir,pages,{signal,reviewOutput,motion,editableSource,fontFamily,fontScale,density,interactiveLinks});
        }
        if (allowSourcePageCopy && (pages.length>40 || pages.reduce((size,page)=>size+page.lines.reduce((total,line)=>total+line.text.length,0),0)>240000
            || pages.every(page=>!page.lines.length))) return {sourcePageCopy:sourceManifest()};
        const meta=journalMetadata(pages,name,{includeUpperTitle:standardHeadings}),visuals=inventoryJournal(pages),sections=journalSections(pages,{includeFirstPage:standardHeadings});
        if(standardHeadings)standardizeJournalSections(sections);
        const manifest={version:'journal-v1',sourceHash:digest(bytes),metadata:meta,pages:pages.length,visuals,sections:sections.map(s=>({title:s.title,pages:s.pages})),coverage:{strategy:'all-original-pages',sourcePages:pages.map(p=>p.number)},warnings:[]};
        if(!sections.length)sections.push({title:'Document content',pages:pages.map(p=>p.number),paragraphs:pages.flatMap(p=>p.blocks.filter(b=>b.text.length>100).map(b=>({text:b.text,page:p.number})))});
        const evidenceBySection = new Map(sections.map(section => [section, selectEvidence(section, standardHeadings)]));
        if (inspectOnly) {
            manifest.review = reviewJournal(meta, evidenceBySection);
            return {manifest};
        }
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
            const result=await collectPdfVisuals(pdf,dir,pages,images,visuals,signal,imageLayoutXml);
            return {title:meta.title,extractedSource:result.source||`# ${name.replace(/\.pdf$/i,'')}`,pageCount:pages.length,...result};
        }
        const thumbnail = async data => reviewOutput
            ? 'data:image/jpeg;base64,' + (await sharp(data).resize({width:420,height:420,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:70}).toBuffer()).toString('base64')
            : undefined;
        if (standardHeadings && journalRole === 'full-copy') {
            let embedded = new Map();
            try {
                embedded = await readEmbeddedPdfImages(pdf,dir,pages,signal,imageLayoutXml);
            } catch (error) {
                signal?.throwIfAborted();
                manifest.warnings.push('Could not inventory inline PDF visuals. Original pages are included.');
            }
            return await buildJournalFullCopy(pages, images, manifest, {
                dir, signal, fontFamily, fontScale, density, includeSpeakerNotes, interactiveLinks, presenterContext, motion, reviewOutput, thumbnail,
                vectorRegions: (page, image) => findPdfVectorRegions(image,page,embedded.get(page.number)||[]),
                readRegion: async (page, box, raw) => (await native('pdftotext', [
                    raw ? '-raw' : '-layout', '-enc', 'UTF-8', '-r', '72', '-f', String(page.number), '-l', String(page.number),
                    '-x', String(Math.floor(box.x)), '-y', String(Math.floor(box.y)),
                    '-W', String(Math.ceil(box.w)), '-H', String(Math.ceil(box.h)), pdf, '-',
                ], { signal })).toString('utf8'),
                rasterize: async image => {
                    const { data, info } = await sharp(image.data).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
                    return { data, width: info.width, height: info.height };
                },
                cropImage: async (image, page, box) => {
                    const data = await cropRegion(image, page, box);
                    if (!data) return null;
                    const { width, height } = await sharp(data).metadata();
                    return { data, width, height };
                },
            });
        }
        const pptx=new pptxgen();pptx.journalTypography={journalFont:fontFamily,journalFontScale:fontScale,journalDensity:density};pptx.theme={headFontFace:fontFamily,bodyFontFace:fontFamily};pptx.layout='LAYOUT_WIDE';pptx.author=meta.authors;pptx.title=meta.title;pptx.subject='Research journal presentation';pptx.lang='en-US';
        const notes=[],mapping=[],generatedReview=[];
        const record = (slide, title, items=[], pages=[], image) => {
            if (reviewOutput) generatedReview[pptx._slides.indexOf(slide)] = {title, items, pages, image};
        };
        const note=(slide,text)=>{if(includeSpeakerNotes)slide.addNotes(text);notes.push(text);};
        const cover=pptx.addSlide();Object.assign(cover,pptx.journalTypography);cover.background={color:'102D49'};
        addText(cover,meta.kind==='review'?'RESEARCH REVIEW':'RESEARCH PRESENTATION',{x:.7,y:.7,w:11.8,h:.4},{fontSize:14,color:'A7CBE8'});
        addText(cover,meta.title,{x:.7,y:1.65,w:11.8,h:2.6},{fontSize:33,color:'FFFFFF',bold:true,objectName:'np-visual-cover-title'});
        addText(cover,meta.authors,{x:.72,y:4.8,w:11.7,h:1.1},{fontSize:17,color:'DDEAF6'});
        addText(cover,meta.doi?'doi: '+meta.doi:name,{x:.72,y:6.55,w:11.6,h:.5},{fontSize:12,color:'A7CBE8'});
        note(cover, [meta.title, meta.authors, presenterContext.trim(), sourceNote(meta,1)].filter(Boolean).join('\n\n'));
        record(cover,meta.title,[meta.authors, meta.doi && 'doi: ' + meta.doi].filter(Boolean),[1]);
        const contents = interactiveLinks ? newSlide(pptx, 'Contents', 2) : null;
        const destinations = new Map();
        if (contents) note(contents, 'Select a heading to jump to its section.\n\n' + sourceNote(meta,1));
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
            record(slide,label,[v.caption],[v.page],await thumbnail(image));
            const box=contain(width,height,{x:.5,y:1.05,w:12.33,h:5.95});
            slide.addImage({data:'image/png;base64,'+image.toString('base64'),...box,objectName:`journal-${v.id}`,altText:v.caption});
            const context=sections.flatMap(s=>s.paragraphs).filter(p=>p.page===v.page&&new RegExp(`\\b(?:Fig(?:ure)?\\.?|Table)\\s*${v.number}\\b`,'i').test(p.text)).map(p=>p.text);
            note(slide,`${v.caption}\n\n${context.join('\n\n')||pages[v.page-1].blocks.filter(b=>b.text.length>150).slice(0,2).map(b=>b.text).join('\n\n')}\n\n${sourceNote(meta,v.page)}`);
            const item={id:v.id,slide:pptx._slides.length,page:v.page,imageHash:digest(image),imageWidth:width,imageHeight:height,box};mapping.push(item);v.slide=item.slide;
        };
        const remaining=new Set(visuals.map(v=>v.id));
        for(const section of sections) {
            const selected = evidenceBySection.get(section);
            if (contents && (selected.length || section.missing) && /^(Introduction|Background|Methodology|Conclusion)$/i.test(section.title)) {
                destinations.set(section.title, pptx._slides.length + 1);
            }
            if (!selected.length) {
                if (section.missing) {
                    const slide = newSlide(pptx, section.title, pptx._slides.length + 1);
                    const message = missingSection;
                    record(slide,section.title,[message]);
                    addText(slide, message, {x:.8,y:1.7,w:11.6,h:1.5});
                    note(slide, message + "\n\n" + sourceNote(meta,1));
                }
                continue;
            }
            for(const [index, group] of groupEvidence(selected).entries()) {
                const slide=newSlide(pptx,section.title+(index?' (continued)':''),pptx._slides.length+1);
                record(slide,section.title+(index?' (continued)':''),group.map(item=>item.text),[...new Set(group.map(item=>item.page))]);
                for(const [j,e]of group.entries())addText(slide,e.text,{x:.78,y:1.45+j*1.52,w:11.7,h:1.32},{fontSize:21,bullet:{indent:15},paraSpaceAfterPt:12,objectName:'vb-b0-'+j});
                const contexts=[...new Set(group.map(e=>e.context))];
                note(slide,contexts.map(t=>t+'\n'+sourceNote(meta,group.find(e=>e.context===t).page)).join('\n\n'));
                addText(slide,`Source: PDF pages ${[...new Set(group.map(e=>e.page))].join(', ')}`,{x:.8,y:6.7,w:11.6,h:.3},{fontSize:11,color:'62758A'});
            }
            const maxPage=Math.max(...section.pages);
            for(const v of visuals.filter(v=>remaining.has(v.id)&&v.page<=maxPage)) {await addVisual(v);remaining.delete(v.id);}
        }
        for(const v of visuals.filter(v=>remaining.has(v.id)))await addVisual(v);
        if (contents) {
            destinations.set('Source journal', pptx._slides.length + 1);
            record(contents,'Contents',[...destinations.keys()]);
            Array.from(destinations).forEach(([title, slide], index) => addText(contents, title,
                {x:.8, y:1.35 + index * .78, w:11.5, h:.5},
                {fontSize:22, color:'076E7B', hyperlink:{slide, tooltip:'Go to ' + title}}));
        }
        const appendix=[];
        for(const page of pages) {
            const im=images.get(page.number),slide=newSlide(pptx,`Source journal — page ${page.number}`,pptx._slides.length+1);
            record(slide,`Source journal — page ${page.number}`,[],[page.number],await thumbnail(im.data));
            const box=contain(im.width,im.height,{x:.45,y:1,w:12.43,h:6});
            slide.addImage({data:'image/png;base64,'+im.data.toString('base64'),...box,objectName:`journal-source-page-${page.number}`,altText:`Complete original PDF page ${page.number}`});
            note(slide,`${page.blocks.map(b=>b.text).join('\n\n')}\n\n${sourceNote(meta,page.number)}`);
            appendix.push({page:page.number,slide:pptx._slides.length,imageHash:digest(im.data),imageWidth:im.width,imageHeight:im.height,box});
        }
        let deck=Buffer.from(await pptx.write({outputType:'nodebuffer',compression:true}));
        if (motion === 'keynote') deck = (await addNativeMotion(deck)).bytes;
        if (reviewOutput) manifest.generatedReview = generatedReview;

        deck=await officeCompatiblePdfDeck(deck);
        const verification=await verifyJournalDeck(deck,{pages:pages.length,visuals:mapping,appendix,notes,includeSpeakerNotes});
        manifest.slides=pptx._slides.length;manifest.mapping=mapping;manifest.appendix=appendix;manifest.verification=verification;
        if(visuals.some(v=>v.kind==='graphical-abstract'))manifest.warnings.push('Unnumbered graphical abstract included.');
        manifest.warnings.push('Automatic visual regions require review; complete original pages are included as a coverage safeguard.');
        return {bytes:deck,manifest,...(captureSource?{extractedSource:pages.map(p=>`\n## Source page ${p.number}\n`+p.lines.map(l=>l.text).join("\n")).join("\n")}:{}),notesBySlide:notes,notes:notes.map((n,i)=>`Slide ${i+1}\n${n}`).join('\n\n---\n\n')};
    } finally {await fs.rm(dir,{recursive:true,force:true});}
}

export async function verifyJournalDeck(bytes,{pages,visuals,appendix,notes,includeSpeakerNotes=true}) {
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
    for(let i=0;includeSpeakerNotes&&i<notes.length;i++) {
        const xml=await zip.file(`ppt/notesSlides/notesSlide${i+1}.xml`)?.async('string');
        if(!xml||!notes[i].trim()||!xml.includes('PDF page'))throw Error('JOURNAL_NOTES_FAILED');
        const normalize=s=>s.replace(/\s+/g,' ').trim();
        const actual=normalize([...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m=>decodeJournalXml(m[1])).join(' '));
        if(!actual.includes(normalize(notes[i])))throw Error('JOURNAL_NOTES_FAILED');
    }
    return {passed:true,sourcePages:pages,mappedVisuals:visuals.length,slides:notes.length,originalImagesVerified:true,aspectRatiosVerified:true,notesVerified:includeSpeakerNotes};
}
