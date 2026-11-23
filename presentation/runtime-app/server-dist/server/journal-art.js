import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { trackedFetch } from './provider-usage.js';
import { designDeckArt } from './deck-art-direction.js';
import { buildFullCopyScene, parseFullCopySource } from '../core/full-copy.js';

export function journalArtDesigner({key,repo,ownerId,jobId,generateCoverArtwork,signal,model='gpt-6-luna'}) {
    const id=jobId||randomUUID();
    let timeLimit;
    const request=(phase,provider)=> {
        const fetcher=trackedFetch(repo,ownerId,phase,id,provider);
        return (url,init)=>fetcher(url,{...init,signal:AbortSignal.any([init.signal,timeLimit])});
    };
    return (doc,scene,directory,options={})=>{
        timeLimit ||= AbortSignal.any([signal,AbortSignal.timeout(120000)].filter(Boolean));
        return designDeckArt(doc,scene,{
            jobId:id,directory,assetDirectory:path.join(directory,'journal-art'),key,model,effort:'xhigh',
            generateCoverArtwork,allowSectionArtwork:options.allowSectionArtwork,
            fetchDesign:request('journal-art-direction',model),
            fetchImage:request('journal-cover-image','gpt-image-2.5-sunburst'),
        });
    };
}

export async function journalNativeTheme(artDirection, meta, sections, directory) {
    const title=meta.title.replace(/[\r\n]+/g,' ').slice(0,180);
    const context=sections.flatMap(section=>section.paragraphs||[]).slice(0,4)
        .map(paragraph=>paragraph.text).join(' ').replace(/[\r\n]+/g,' ').slice(0,1600);
    try{
        const doc=parseFullCopySource('# '+(title||'Research presentation')+'\n\n'+context);
        return await artDirection(doc,buildFullCopyScene(doc,[]),directory,{allowSectionArtwork:false});
    }catch{return undefined;}
}

export function styleJournalCover(pptx,cover,design) {
    if(!design?.palette)return;
    const {dark,accent}=design.palette;
    cover.background={color:dark.slice(1)};
    if(design.artwork){
        cover.addImage({path:design.artwork.imagePath,x:0,y:0,w:13.333333,h:7.5,
            objectName:'journal-cover-decoration',altText:'AI-generated decorative cover artwork'});
        cover.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333333,h:7.5,
            fill:{color:dark.slice(1),transparency:22},line:{transparency:100}});
    }
    cover.addShape(pptx.ShapeType.rect,{x:0,y:0,w:.12,h:7.5,fill:{color:accent.slice(1)},line:{transparency:100}});
}
