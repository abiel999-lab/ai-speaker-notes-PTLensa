import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { recordPresentationFailure } from './job-failure-events.js';
import { createJournalDeck,decodeJournal } from './journal-service.js';
import { renderExportedSlides } from './pptx-slide-viewer.js';

// No repository, provider, billing or permanent project writes are performed.
// Existing app hooks enforce origin, session CSRF and the Presentation Pro gate.
export function registerJournalRoutes(app,{auth,enabled=false,failureRoot,generate=createJournalDeck,render=renderExportedSlides}) {
    let busy=false;
    app.get('/api/journal/capabilities',{preHandler:auth},async()=>({enabled,maxBytes:50*1024*1024,maxPages:40,maxSourceCopyPages:200}));
    for(const action of ['inspect','export'])app.post(`/api/journal/${action}`,{
        bodyLimit:68*1024*1024,preHandler:auth,
        config:{rateLimit:{max:4,timeWindow:'1 hour'}}
    },async(req,reply)=>{
        if(!enabled)return reply.code(404).send({error:'JOURNAL_DISABLED'});
        if(busy)return reply.code(429).header('Retry-After','30').send({error:'JOURNAL_BUSY',requestId:req.id});
        let bytes;try{bytes=decodeJournal(req.body);}catch{return reply.code(400).send({error:'JOURNAL_INVALID',requestId:req.id});}
        busy=true;
        const controller=new AbortController();
        const abort=()=>controller.abort();
        const timer=setTimeout(abort,action==='export'&&req.body.renderPreview?420000:240000);
        req.raw.once('aborted',abort);
        reply.raw.once('close',abort);
        try {
            const {name,fontFamily,fontScale,density,includeSpeakerNotes,interactiveLinks,presenterContext,motion,reviewOutput,sourcePagesOnly,editableSource,renderPreview,journalRole} = req.body;
            const result=await generate(bytes,name,{
                signal:controller.signal,inspectOnly:action==='inspect',standardHeadings:true,
                fontFamily,fontScale,density,includeSpeakerNotes,interactiveLinks,presenterContext,motion,reviewOutput:reviewOutput&&!renderPreview,sourcePagesOnly,editableSource,journalRole,
            });
            if(action==='inspect')return reply.header('Cache-Control','private, no-store').send(result.manifest);
            if(renderPreview){
                let previews=[];
                try { previews=await render(result.bytes,result.manifest.slides,controller.signal); }
                catch(error) {
                    if(controller.signal.aborted)throw error;
                    req.log.warn({requestId:req.id,code:error.message},'PowerPoint preview render unavailable');
                }
                const sizes=previews.map(image=>image.length);
                const meta=Buffer.from(JSON.stringify({slides:result.manifest.slides,pptxBytes:result.bytes.length,sizes}));
                const length=Buffer.alloc(4);
                length.writeUInt32BE(meta.length);
                return reply.header('Cache-Control','private, no-store').type('application/octet-stream')
                    .header('Content-Length',String(4+meta.length+result.bytes.length+sizes.reduce((a,b)=>a+b,0)))
                    .send(Readable.from([length,meta,result.bytes,...previews]));
            }
            if(reviewOutput){
                const review = Buffer.from(JSON.stringify(result.manifest.generatedReview));
                const length = Buffer.alloc(4);
                length.writeUInt32BE(review.length);
                return reply.header('Cache-Control','private, no-store').type('application/octet-stream')
                    .header('Content-Length',String(length.length+review.length+result.bytes.length))
                    .send(Readable.from([length,review,result.bytes]));
            }
            return reply.header('Cache-Control','private, no-store')
                .header('Content-Type','application/vnd.openxmlformats-officedocument.presentationml.presentation')
                .header('Content-Disposition','attachment; filename="journal-presentation.pptx"')
                .header('X-Journal-Source-Pages',String(result.manifest.pages))
                .header('X-Journal-Visuals',String(result.manifest.visuals.length))
                .send(result.bytes);
        }catch(error){
            const code=/^JOURNAL_(INVALID|PAGE_SIZE|PAGE_LIMIT|TEXT_LIMIT|OCR_REQUIRED|STRUCTURE_REVIEW_REQUIRED|TOOLS_UNAVAILABLE|PDF_UNREADABLE|PDF_PASSWORD_REQUIRED|LAYOUT_LIMIT|ANALYSIS_TIMEOUT|COVERAGE_FAILED|NOTES_FAILED)$/.test(error.message)?error.message:'JOURNAL_GENERATION_FAILED';
            if (failureRoot && !req.raw.aborted && !reply.raw.destroyed)
                await recordPresentationFailure(failureRoot, {id:randomUUID(),owner:req.user?.id,code,stage:`Journal ${action}`,status:'failed'},error);
            req.log.warn({code,action,requestId:req.id},'PDF processing failed');
            return reply.code(code==='JOURNAL_TOOLS_UNAVAILABLE'?503:422).send({error:code,requestId:req.id});
        }finally{
            clearTimeout(timer);req.raw.removeListener('aborted',abort);reply.raw.removeListener('close',abort);busy=false;
        }
    });
}
