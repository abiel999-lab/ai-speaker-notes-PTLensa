import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import JSZip from 'jszip';

function run(command,args,signal,env) {
    signal.throwIfAborted();
    return new Promise((resolve,reject) => {
        const child=spawn(command,args,{stdio:'ignore',env:{...process.env,...env}});
        const stop=()=>child.kill('SIGKILL');
        signal.addEventListener('abort',stop,{once:true});
        child.once('error',reject);
        child.once('close',(code,exitSignal)=>{
            signal.removeEventListener('abort',stop);
            if(code===0&&!signal.aborted) resolve();
            else reject(Error('PREVIEW_RENDER_FAILED:'+path.basename(command)+':'+(exitSignal||code)));
        });
    });
}

async function previewPackage(bytes,xml,slideList,ids,start,end) {
    const zip=await JSZip.loadAsync(bytes);
    const inBatch=number=>number>start&&number<=end;
    const visibleMedia=new Set();
    for(const name of Object.keys(zip.files)) {
        if(/^ppt\/notes(?:Slides|Masters)\//.test(name)) {
            zip.remove(name);
            continue;
        }
        const slide=name.match(/^ppt\/slides\/(?:_rels\/)?slide(\d+)\.xml(?:\.rels)?$/);
        if(slide&&!inBatch(Number(slide[1]))) {
            zip.remove(name);
            continue;
        }
        if(slide && name.endsWith('.xml')) {
            const markup=await zip.file(name).async('string');
            // Animation and hidden presenter notes are outside this static
            // preview. Leave them intact in the downloadable PPTX.
            zip.file(name,markup.replace(/<p:(timing|transition)\b[^>]*>[\s\S]*?<\/p:\1>/g,'')
                .replace(/<a:hlinkClick\b[^>]*\br:id="rId\d+"[^>]*\/>/g,''));
        }
        if(name.endsWith('.rels')&&zip.file(name)) {
            let relationships=await zip.file(name).async('string');
            const withoutOffscreenSlides=relationships.replace(/<Relationship\b[^>]*Type="[^"]+\/notes(?:Slide|Master)"[^>]*\/>/g,'').replace(
                /<Relationship\b[^>]*Type="[^"]+\/slide"[^>]*Target="(?:(?:\.\.\/)?slides\/)?slide(\d+)\.xml"[^>]*\/>/g,
                (tag,number)=>inBatch(Number(number))?tag:'');
            if(withoutOffscreenSlides!==relationships) {
                relationships=withoutOffscreenSlides;
                zip.file(name,relationships);
            }
            for(const match of relationships.matchAll(/Target="(?:\.\.\/)?media\/([^"]+)"/g)) visibleMedia.add('ppt/media/'+match[1]);
        }
    }
    for(const name of Object.keys(zip.files)){
        if(name.startsWith('ppt/media/')&&!zip.files[name].dir&&!visibleMedia.has(name))zip.remove(name);
    }
    const types=zip.file('[Content_Types].xml');
    zip.file(types.name,(await types.async('string')).replace(/<Override\b[^>]*PartName="\/([^"]+)"[^>]*\/>/g,
        (tag,name)=>zip.file(name)?tag:''));
    zip.file('ppt/presentation.xml',xml.replace(slideList,'<p:sldIdLst>'+ids.slice(start,end).join('')+'</p:sldIdLst>')
        .replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/g,''));
    return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}

export async function renderExportedSlides(bytes,count,signal) {
    const deadline=AbortSignal.any([signal,AbortSignal.timeout(300000)]);
    const folder=await fs.mkdtemp(path.join(os.tmpdir(),'notepreso-slide-viewer-'));
    try {
        const fontSource=fileURLToPath(new URL('../../assets/fonts/notepreso-fonts.conf',import.meta.url));
        const fontConfig=path.join(folder,'fonts.conf');
        const fontDir=path.dirname(fontSource).replaceAll('&','&amp;').replaceAll('<','&lt;');
        const fonts=(await fs.readFile(fontSource,'utf8')).replace('<dir prefix="relative">.</dir>','<dir>'+fontDir+'</dir>');
        await fs.writeFile(fontConfig,fonts,{mode:0o600});
        const useBatches=count>64||bytes.length>12*1024*1024;
        const zip=useBatches?await JSZip.loadAsync(bytes):null;
        const xml=zip?await zip.file('ppt/presentation.xml').async('string'):null;
        const slideList=xml?.match(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/)?.[0];
        const ids=slideList?.match(/<p:sldId\b[^>]*\/>/g);
        if(useBatches&&ids?.length!==count)throw Error('PREVIEW_SLIDE_COUNT_MISMATCH');
        const batches=[];
        if(zip){
            let start=0,pictures=0;
            for(let index=0;index<count;index++){
                const slide=await zip.file('ppt/slides/slide'+(index+1)+'.xml')?.async('string');
                const next=slide ? (slide.match(/<p:pic>/g)||[]).length : 1;
                if(index>start&&(pictures+next>30||index-start>=120)){
                    batches.push([start,index]);
                    start=index;
                    pictures=0;
                }
                pictures+=next;
            }
            batches.push([start,count]);
        }else batches.push([0,count]);
        const images=[];
        let size=0;
        for(const [start,end] of batches) {
            deadline.throwIfAborted();
            const batch=path.join(folder,'batch-'+start);
            await fs.mkdir(batch);
            const input=path.join(batch,'presentation.pptx');
            const pdf=path.join(batch,'presentation.pdf');
            // Restrict the slide list in a temporary copy only. This bounds
            // the renderer's memory while preserving the original slide parts.
            const payload=zip?await previewPackage(bytes,xml,slideList,ids,start,end):bytes;
            await fs.writeFile(input,payload,{mode:0o600});
            await run(process.env.SOFFICE_BIN||'soffice',[
                '-env:UserInstallation='+pathToFileURL(path.join(folder,'profile')).href,
                '--headless','--convert-to','pdf:impress_pdf_Export','--outdir',batch,input,
            ],deadline,{FONTCONFIG_FILE:fontConfig});
            await run(process.env.PDFTOPPM_BIN||'pdftoppm',[
                '-jpeg','-jpegopt','quality=80','-scale-to','1100',pdf,path.join(batch,'slide'),
            ],deadline);
            const files=(await fs.readdir(batch)).filter(name=>/^slide-\d+\.jpg$/.test(name))
                .sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
            if(files.length!==end-start)throw Error('PREVIEW_SLIDE_COUNT_MISMATCH');
            for(const name of files) {
                deadline.throwIfAborted();
                const image=await fs.readFile(path.join(batch,name));
                size+=image.length;
                if(size>60*1024*1024 || image[0]!==0xff || image[1]!==0xd8
                    || image.at(-2)!==0xff || image.at(-1)!==0xd9)throw Error('PREVIEW_RENDER_INVALID');
                images.push(image);
            }
            await fs.rm(batch,{recursive:true,force:true});
        }
        return images;
    } finally {
        await fs.rm(folder,{recursive:true,force:true});
    }
}
