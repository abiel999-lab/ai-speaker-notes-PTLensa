import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';import JSZip from 'jszip';
import {createApp} from './server-dist/server/app.js';
import {documentDraftContext,saveDocumentPlan,loadDocumentPlan} from './server-dist/server/document-plan.js';
import {buildDocumentScene} from './server-dist/core/document-scene.js';
import {snapshotDocumentAssets,documentManifest} from './server-dist/server/document-workflow.js';
import {parseSource} from './server-dist/core/source.js';
import {validateScene} from './server-dist/core/fidelity.js';
import {exportPptx} from './server-dist/core/export.js';
import {createQuote,acceptQuote} from './server-dist/server/platform-generation.js';
import {generationDirectory} from './server-dist/server/artifacts.js';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'document-quality-'));
const cfg={root,production:false,origin:'http://localhost:14310',host:'127.0.0.1',port:14310,render:false,key:'fixture-only',model:'gpt-6-luna',localAdmin:false};
let calls=[],lastContext,invalidResponse=false;
function fixture(context){
 const ids=context.documents.filter(d=>d.role==='content').map(d=>d.sourceId);
 const slides=[{kind:'cover',title:'Research evidence: biochar and coal power emissions',points:['Two studies with distinct methods and evidence.'],visualIds:[],sourceIds:ids}];
 for(const a of context.visuals){const caption=a.caption.replace(/\s+/g,' ');slides.push({kind:'content',title:caption.slice(0,87),points:[caption.slice(0,110),'Original scientific evidence from the cited study.'],visualIds:[a.assetId],sourceIds:[a.sourceId]});}
 while(slides.length<context.targetSlides-1)slides.push({kind:'content',title:'Research scope and limitations',points:['Interpret evidence within the scope of each study.'],visualIds:[],sourceIds:ids});
 slides.push({kind:'references',title:'References',points:context.documents.filter(d=>d.role==='content').map(d=>d.title.slice(0,210)),visualIds:[],sourceIds:ids});
 return {slides};
}
globalThis.fetch=async(url,init)=>{
 if(String(url).endsWith('/account'))return Response.json({account:{plan:'pro',credits:{total:10000}}});
 assert.equal(String(url),'https://api.openai.com/v1/responses','No photos or second design request allowed');
 const body=JSON.parse(init.body);calls.push(body);
 let output;if(body.text.format.name==='document_slide_plan'){lastContext=JSON.parse(body.input);output=fixture(lastContext);if(invalidResponse)output.slides[1].sourceIds=[lastContext.documents[1].sourceId];}
 else output={source:'# Brief presentation\n\n## Results\nOriginal brief content.'};
 return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]});
};
const {app,repo}=await createApp(cfg),headers={host:'localhost:14310'};const resources=[];
async function draft(workspace){return app.inject({method:'POST',url:'/api/workspace/draft',headers,payload:{workspace,model:'gpt-6.1-terra',language:'English',reasoningEffort:'high',sections:11}});}
try{
 for(const [name,expected] of [['RE-13078-v8i3-249-265',7],['s44408-025-00002-4',13]]){
  const response=await app.inject({method:'POST',url:'/api/document/import',headers,payload:{name:name+'.pdf',base64:(await fs.readFile('/fixtures/'+name+'.pdf')).toString('base64')}});
  assert.equal(response.statusCode,200,response.body.slice(0,300));const imported=response.json();assert.equal(imported.visuals,expected);
  resources.push({id:randomUUID(),name:name+'.pdf',role:'content',documentId:imported.documentId,visuals:expected,text:imported.source});
  const single={kind:'document',brief:'Explain the research accurately',policy:'draft',resources:[resources.at(-1)]};
  const drafted=await draft(single);assert.equal(drafted.statusCode,200,drafted.body);assert.equal(drafted.json().visualCount,expected);
  console.log(JSON.stringify({singleDocument:name,visuals:expected,slides:drafted.json().slideCount,textCharacters:imported.source.length}));
 }
 const workspace={kind:'document',brief:'Generate approximately 18â€“22 slides, preserve all original figures and tables.',policy:'draft',resources};
 const drafted=await draft(workspace);assert.equal(drafted.statusCode,200,drafted.body);assert.equal(drafted.json().slideCount,22);assert.equal(drafted.json().visualCount,20);
 assert.equal(calls.at(-1).model,'gpt-6.1-terra');assert.equal(calls.at(-1).reasoning.effort,'high');
 const source=drafted.json().source;assert.ok(!/Slide \d|Section \d/.test(source));
 const saved=await app.inject({method:'POST',url:'/api/projects',headers,payload:{name:'QA two-journal fixture',source,workspace,mode:'markdown'}});assert.equal(saved.statusCode,200,saved.body);const project=saved.json().project;
 const plan=await loadDocumentPlan(project,root),assets=await snapshotDocumentAssets(project,root),doc=parseSource(source),scene=buildDocumentScene(doc,plan);
 assert.equal(assets.length,20);assert.equal(scene.slides.length,22);assert.equal(scene.slides.at(-1).documentAssetIds.length,0);assert.equal(scene.slides[0].layout,'cover');
 assert.equal(scene.slides.filter(s=>s.layout==='cover').length,1);assert.equal(scene.slides.flatMap(s=>s.documentAssetIds).length,20);
 assert.ok(assets.filter(a=>/^(?:Figure|Fig\.?)\s*1\b/i.test(a.caption)).length>=2,'Both documents have Figure/Fig. 1');
 for(const s of scene.slides.filter(s=>s.documentVisual)){const a=assets.find(a=>a.assetId===s.documentAssetIds[0]);assert.ok(s.documentSourceIds.includes(a.sourceId));assert.ok(s.objects.filter(o=>o.type==='text').length>=3,'Explanation accompanies every visual');}
 assert.equal(validateScene(doc,scene).passed,true);
 await assert.rejects(loadDocumentPlan({...project,ownerId:'another-user'},root),/DOCUMENT_PLAN_REQUIRED/);
 await assert.rejects(documentManifest(root,'another-user',resources[0].documentId));
 await assert.rejects(loadDocumentPlan({...project,source:source+'changed'},root),/DOCUMENT_PLAN_REQUIRED/);
 await assert.rejects(loadDocumentPlan({...project,workspace:{...workspace,resources:resources.map(r=>({...r,role:'reference'}))}},root),/DOCUMENT_PLAN_REQUIRED/);
 const invalid=fixture(lastContext);invalid.slides[1].sourceIds=[resources[1].id];await assert.rejects(saveDocumentPlan(root,project.ownerId,workspace,lastContext,invalid),/DOCUMENT_PLAN_VISUAL_SOURCE/);
 const missing=fixture(lastContext);missing.slides[1].visualIds=[];await assert.rejects(saveDocumentPlan(root,project.ownerId,workspace,lastContext,missing),/DOCUMENT_PLAN_INCOMPLETE/);
 const repeated=fixture(lastContext);repeated.slides[2].visualIds=repeated.slides[1].visualIds;await assert.rejects(saveDocumentPlan(root,project.ownerId,workspace,lastContext,repeated),/DOCUMENT_PLAN_VISUAL_SOURCE/);
 const late=fixture(lastContext);late.slides.at(-1).visualIds=late.slides[1].visualIds;await assert.rejects(saveDocumentPlan(root,project.ownerId,workspace,lastContext,late),/DOCUMENT_PLAN_STRUCTURE/);
 const dense=fixture(lastContext);dense.slides[1].points=['Dense '.repeat(35),'Dense '.repeat(35)];const repaged=await saveDocumentPlan(root,project.ownerId,workspace,lastContext,dense);assert.ok(repaged.slideCount>22);assert.ok(repaged.source.includes('Dense '.repeat(34).trim()));
 const flexible=await saveDocumentPlan(root,project.ownerId,workspace,{...lastContext,targetSlides:21},fixture(lastContext));assert.equal(flexible.slideCount,22);
 const issuer='https://fixture.invalid/realms/test',subject='00000000-0000-4000-8000-000000000001',user={id:'oidc-'+createHash('sha256').update(issuer+'\0'+subject).digest('hex'),platformIdentity:{issuer,subject}};
 const settings={theme:'ivory',mode:'markdown',images:false,useAI:true,documentMode:true,creationMode:'creative',creativePrompt:workspace.brief,model:'gpt-6.1-terra',reasoningEffort:'high',presentationLanguage:'English',coverAssetId:null};
 const quote=await createQuote(project,settings,user,{...cfg,oidc:{issuer},platform:{url:'http://notepreso-platform-notes:8000',secret:'a'.repeat(64)}});assert.equal(quote.maxSlides,22);assert.equal(quote.maxCredits,66);assert.ok(acceptQuote(quote.token,project,settings,user,{...cfg,oidc:{issuer},platform:{url:'http://notepreso-platform-notes:8000',secret:'a'.repeat(64)}}));
 const before=calls.length,queued=await app.inject({method:'POST',url:'/api/projects/'+project.id+'/generate',headers,payload:{settings}});assert.equal(queued.statusCode,202,queued.body);let job;
 for(let i=0;i<300;i++){job=await repo.job(queued.json().generation.id);if(['ready','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(job.status,'ready',job.error||JSON.stringify(job));assert.equal(calls.length,before,'Worker must not call creative AI or language AI again');assert.equal(job.scene.slides.length,22);assert.equal(job.report.documentCoverage.included,20);
 const bytes=await fs.readFile(path.join(generationDirectory(root,job),'presentation.pptx')),zip=await JSZip.loadAsync(bytes);
 const media=[];for(const f of Object.values(zip.files).filter(f=>/^ppt\/media\//.test(f.name)&&!f.dir))media.push(createHash('sha256').update(await f.async('nodebuffer')).digest('hex'));
 for(const asset of assets)assert.ok(media.includes(asset.hash),'Original image bytes preserved');assert.equal(new Set(media).size,20,'No external image');
 assert.ok(!Object.keys(zip.files).some(n=>/^ppt\/notes/.test(n)));const xml=(await Promise.all(Object.values(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f.name)).map(f=>f.async('string')))).join('');assert.ok(!xml.includes('srcRect'),'No crops');
 if(process.env.QA_OUTPUT){await fs.writeFile(path.join(process.env.QA_OUTPUT,'fixture.pptx'),bytes);await fs.writeFile(path.join(process.env.QA_OUTPUT,'scene.json'),JSON.stringify(job.scene));await fs.writeFile(path.join(process.env.QA_OUTPUT,'report.json'),JSON.stringify(job.report,null,2));}
 const brief=await draft({kind:'brief',brief:'Explain this topic',policy:'draft',resources:[]});assert.equal(brief.statusCode,200,brief.body);assert.ok(brief.json().source.includes('Brief presentation'));
 invalidResponse=true;const rejected=await draft(workspace);assert.equal(rejected.statusCode,422);assert.equal(rejected.json().error,'DOCUMENT_PLAN_VISUAL_SOURCE');
 console.log(JSON.stringify({status:'passed',actualWorker:true,totalSlides:22,sourceVisuals:20,figureTableCollisionsBoundToSource:true,allOriginalBytes:true,noCrop:true,noNotes:true,noExternalPhotos:true,singleCover:true,referencesLast:true,exactQuote:true,ownerAndSourceIsolation:true,rejectMissingDuplicateLateWrongSource:true,briefWorkflow:true,realPaidCalls:0}));
}finally{await app.close();}
