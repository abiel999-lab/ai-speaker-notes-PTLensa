import {journalArtDesigner} from './journal-art.js';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { generationDirectory } from './artifacts.js';
import { recordPresentationFailure } from './job-failure-events.js';
import { createJournalDeck,decodeJournal } from './journal-service.js';
import { renderExportedSlides } from './pptx-slide-viewer.js';
import { JOURNAL_BUILDING, journalIsBuilding } from './journal-state.js';

// Existing app hooks enforce origin, session CSRF and the Presentation Pro gate.
export function registerJournalRoutes(app,{auth,enabled=false,failureRoot,repo,artKey,generate=createJournalDeck,render=renderExportedSlides}) {
    let busy=false;
    function framed(result, previews) {
        const sizes=previews.map(image=>image.length);
        const meta=Buffer.from(JSON.stringify({slides:result.manifest.slides,pptxBytes:result.bytes.length,sizes}));
        const length=Buffer.alloc(4);
        length.writeUInt32BE(meta.length);
        return [length,meta,result.bytes,...previews];
    }
    async function runJournal(job, bytes, payload, log) {
        const signal=AbortSignal.timeout(420000);
        try {
            let result, recovery;
            const options={...payload,signal,standardHeadings:true,
                ...(artKey&&!payload.sourcePagesOnly?{artDirection:journalArtDesigner({
                    key:artKey,repo,ownerId:job.ownerId,jobId:job.id,generateCoverArtwork:payload.generateCoverArtwork,model:payload.artModel,signal,
                })}:{})};
            try { result=await generate(bytes,payload.name,options); }
            catch(error) {
                if(payload.sourcePagesOnly || signal.aborted ||
                    !['DOCUMENT_SLIDE_LIMIT','DOCUMENT_CONTENT_TOO_DENSE','SOURCE_FIDELITY_FAILED','EXPORTED_TEXT_MISMATCH','DOCUMENT_VISUAL_EXPORT_MISMATCH'].includes(error.message))throw error;
                recovery='source-pages';
                log.warn({id:job.id,code:error.message},'Journal editable layout fell back to original pages');
                result=await generate(bytes,payload.name,{...options,sourcePagesOnly:true,editableSource:false});
            }
            let previews=[];
            try { previews=await render(result.bytes,result.manifest.slides,signal); }
            catch(error) { log.warn({id:job.id,code:error.message},'Journal preview unavailable'); }
            const dir=generationDirectory(failureRoot,job);
            await fs.mkdir(dir,{recursive:true,mode:0o700});
            const output=path.join(dir,'journal-result.bin');
            await pipeline(Readable.from(framed(result,previews)),createWriteStream(output,{flags:'wx',mode:0o600}));
            await repo.compareAndSaveJob(job,{...job,status:'ready',stage:'Ready',
                journal:{...job.journal,slides:result.manifest.slides,recovery,deckArt:result.manifest.deckArt}});
        } catch(error) {
            const code=/^JOURNAL_[A-Z_]+$/.test(error.message)?error.message:'JOURNAL_GENERATION_FAILED';
            await repo.compareAndSaveJob(job,{...job,status:'failed',stage:'Failed',error:code});
            if(failureRoot)await recordPresentationFailure(failureRoot,{id:job.id,owner:job.ownerId,code,stage:'Journal export',status:'failed'},error);
        } finally { busy=false; }
    }
    if (repo) {
        const config={rateLimit:{max:4,timeWindow:'1 hour'}};
        app.post('/api/journal/projects/:id/export',{preHandler:auth,bodyLimit:68*1024*1024,config},async(req,reply)=>{
            if(!enabled)return reply.code(404).send({error:'JOURNAL_DISABLED'});
            const project=await repo.getProject(req.params.id,req.user.id);
            if(!project)return reply.code(404).send({error:'PROJECT_NOT_FOUND'});
            const previous=project.latestId && await repo.job(project.latestId,req.user.id);
            if(previous && !['ready','failed','cancelled'].includes(previous.status)){
                if(previous.journal && Date.now()-Date.parse(previous.createdAt)>480000)
                    await repo.compareAndSaveJob(previous,{...previous,status:'failed',stage:'Failed',error:'JOURNAL_ANALYSIS_TIMEOUT'});
                else if(previous.journal)return reply.code(202).send({id:previous.id});
                else return reply.code(409).send({error:'JOURNAL_BUSY'});
            }
            if(busy)return reply.code(429).send({error:'JOURNAL_BUSY'});
            const {base64, ...payload}=req.body || {};
            let bytes;
            try { bytes=decodeJournal({...payload,base64}); }
            catch { return reply.code(400).send({error:'JOURNAL_INVALID'}); }
            const {name,fontFamily,fontScale,density,includeSpeakerNotes,interactiveLinks,motion,presenterContext,journalRole,sourcePagesOnly}=payload;
            const job={id:randomUUID(),projectId:project.id,ownerId:project.ownerId,status:JOURNAL_BUILDING,
                kind:'journal',stage:'Creating PowerPoint',createdAt:new Date().toISOString(),
                settings:{theme:'ivory',fontFamily,fontScale,density,includeSpeakerNotes,interactiveLinks,motion,model:payload.artModel,generateCoverArtwork:payload.generateCoverArtwork},
                journal:{name,presenterContext,journalRole,sourcePagesOnly}};
            busy=true;
            try {
                if(!await repo.startJournalJob(project,job)){
                    busy=false;
                    return reply.code(409).send({error:'JOURNAL_BUSY'});
                }
            } catch (error) { busy=false; throw error; }
            void runJournal(job,bytes,payload,req.log).catch(error=>req.log.error({id:job.id,code:error.message},'Journal job persistence failed'));
            return reply.code(202).send({id:job.id});
        });
        app.get('/api/journal/projects/:id/job',{preHandler:auth},async(req,reply)=>{
            const project=await repo.getProject(req.params.id,req.user.id);
            const job=project?.latestId && await repo.job(project.latestId,req.user.id);
            if(!job?.journal)return reply.code(404).send({error:'JOURNAL_JOB_NOT_FOUND'});
            const running=journalIsBuilding(job);
            const expired=running&&Date.now()-Date.parse(job.createdAt)>480000;
            return reply.header('Cache-Control','private, no-store').send({id:job.id,status:expired?'failed':running?'building':job.status,
                settings:job.settings,journal:job.journal,error:expired?'JOURNAL_ANALYSIS_TIMEOUT':job.error});
        });
        app.get('/api/journal/projects/:id/result/:job',{preHandler:auth},async(req,reply)=>{
            const job=await repo.job(req.params.job,req.user.id);
            if(!job?.journal||job.projectId!==req.params.id||job.status!=='ready')
                return reply.code(404).send({error:'JOURNAL_JOB_NOT_FOUND'});
            const output=path.join(generationDirectory(failureRoot,job),'journal-result.bin');
            const stats=await fs.stat(output).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
            if(!stats)return reply.code(404).send({error:'JOURNAL_JOB_NOT_FOUND'});
            return reply.header('Cache-Control','private, no-store').header('Content-Length',String(stats.size))
                .type('application/octet-stream').send(createReadStream(output));
        });
    }
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
            const artDirection=action==='export'&&artKey&&!sourcePagesOnly?journalArtDesigner({
                key:artKey,repo,ownerId:req.user.id,generateCoverArtwork:req.body.generateCoverArtwork,model:req.body.artModel,signal:controller.signal,
            }):undefined;
            const result=await generate(bytes,name,{
                artDirection,
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
                const parts=framed(result,previews);
                return reply.header('Cache-Control','private, no-store').type('application/octet-stream')
                    .header('Content-Length',String(parts.reduce((size,part)=>size+part.length,0)))
                    .send(Readable.from(parts));
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
