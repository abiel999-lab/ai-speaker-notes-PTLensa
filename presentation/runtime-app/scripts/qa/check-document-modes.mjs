import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../../server-dist/server/app.js';
import { loadDocumentPlan } from '../../server-dist/server/document-plan.js';
import { buildFullCopyScene, parseFullCopySource } from '../../server-dist/core/full-copy.js';
import { buildDocumentScene } from '../../server-dist/core/document-scene.js';
import { parseSource } from '../../server-dist/core/source.js';
import { exportPptx } from '../../server-dist/core/export.js';

const root = await mkdtemp(path.join(tmpdir(), 'document-modes-'));
const host = 'localhost:14310';
const headers = {host};
const {app} = await createApp({
  root, production:false, origin:'http://'+host, host:'127.0.0.1', port:14310,
  render:false, key:'synthetic-fixture-only', model:'gpt-6-luna', localAdmin:false,
});
const calls=[];
let providerFailure = false;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), 'https://api.openai.com/v1/responses');
  const request=JSON.parse(init.body), context=JSON.parse(request.input);
  calls.push({request,context});
  if(providerFailure)return Response.json({error:'fixture only'},{status:503});
  const sourceIds=context.documents.map(d=>d.sourceId);
  const make=(kind,title,points)=>({kind,title,points,sourceIds,visualIds:[]});
  const slides=[
    make('cover','Water treatment decision',['Overview for the workshop']),
    make('content','Two measured rates',['Tuesday sampling measured 14 liters per second.',
      'Wednesday sampling measured 18 liters per second.']),
    make('content','Interpretation',['Compare only measurements taken at the same sampling point.']),
    make('references','References',['Treatment plant table and monitoring record.']),
  ];
  return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({slides})}]}]});
};
const workspace=(role,text,brief='')=>({kind:'document',policy:'draft',brief,
  resources:[{id:randomUUID(),name:'Monitoring record.md',role,text}]});
const request=(url,payload)=>app.inject({method:'POST',url,headers,payload});
const draft=(ws,model='gpt-6-luna')=>request('/api/workspace/draft',{workspace:ws,model,language:'English',sections:3});
const okay=response=>{assert.equal(response.statusCode,200,response.body.slice(0,400));return response.json();};
const bad=(response,status,code)=>{assert.equal(response.statusCode,status,response.body.slice(0,400));assert.equal(response.json().error,code);};

try {
  const exactSource='# Treatment plant\n\n## Tuesday\n\n14 liters per second.\n\n## Wednesday\n\n18 liters per second.';
  const exact=workspace('slide-content',exactSource);
  const draftExact=okay(await draft(exact));
  assert.equal(draftExact.source,exactSource);
  assert.equal(draftExact.slideCount,3);
  assert.equal(draftExact.outline,undefined);
  assert.equal(calls.length,0);
  const {project}=okay(await request('/api/projects',{name:'Exact',workspace:exact,mode:'markdown',source:exactSource}));
  const exactPlan=await loadDocumentPlan(project,root);
  assert.equal(exactPlan.version,2);
  const exactDoc=parseFullCopySource(exactSource);
  const exactExport=await exportPptx(exactDoc,buildFullCopyScene(exactDoc,exactPlan.assets));
  assert.ok(exactExport.report.exportVerified);
  bad(await draft(workspace('slide-content','No headings')),422,'DOCUMENT_SLIDE_HEADINGS_REQUIRED');
  bad(await draft({...exact,resources:[...exact.resources,...workspace('full-copy','Copied content.').resources]}),422,'DOCUMENT_MIXED_COPY_MODE');
  const copied=okay(await draft(workspace('full-copy','A copied statement.')));
  assert.equal(copied.source,'A copied statement.');

  const ref=workspace('reference','Tuesday 14 L/s, Wednesday 18 L/s.','Compare these readings for student engineers.');
  const original=okay(await draft(ref,'gpt-6.1-terra'));
  assert.match(calls.at(-1).request.instructions,/answers the user's brief/);
  assert.equal(calls.at(-1).request.model,'gpt-6.1-terra');
  assert.equal(calls.at(-1).context.documents[0].role,'reference');
  assert.equal(calls.at(-1).request.text.format.schema.properties.slides.items.properties.visualIds.maxItems,0);
  assert.equal(original.slideCount,4);
  assert.equal(original.outline,undefined);
  bad(await draft({...ref,brief:''}),400,'BRIEF_REQUIRED');
  const general=workspace('content',ref.resources[0].text,'Explain the source.');
  const generalResponse=okay(await draft(general));
  assert.match(calls.at(-1).request.instructions,/academic presentation/);
  assert.equal(generalResponse.slideCount,4);
  providerFailure=true;
  bad(await draft(ref),422,'CONTENT_DRAFT_UNAVAILABLE');
  assert.equal(okay(await draft(general)).recovery,true);
  providerFailure=false;

  for (const endpoint of ['/api/workspace/outline/suggest','/api/workspace/outline/revise']) {
    assert.equal((await request(endpoint,{})).statusCode,404);
  }
  const {project:referenceProject}=okay(await request('/api/projects',{
    name:'Reference',source:original.source,workspace:ref,mode:'markdown',
  }));
  await assert.rejects(loadDocumentPlan({...referenceProject,ownerId:'different-owner'},root),/DOCUMENT_PLAN_REQUIRED/);
  const referenceDoc=parseSource(original.source,'markdown'), referencePlan=await loadDocumentPlan(referenceProject,root);
  assert.equal(buildDocumentScene(referenceDoc,referencePlan).slides[1].layout,'columns');
  const exported=await exportPptx(referenceDoc,buildDocumentScene(referenceDoc,referencePlan));
  assert.ok(exported.report.exportVerified);
  const pptx=path.join(root,'reference.pptx'), pdf=path.join(root,'reference.pdf');
  await writeFile(pptx,exported.bytes);
  execFileSync('soffice',['-env:UserInstallation=file://'+root+'/office','--headless','--convert-to','pdf','--outdir',root,pptx],{timeout:90000});
  const text=execFileSync('pdftotext',[pdf,'-'],{encoding:'utf8',timeout:10000});
  assert.match(text,/Two measured rates/);
  assert.match(text,/14\s+liters\s+per\s+second/);
  assert.match(text,/18\s+liters\s+per\s+second/);
  console.log(JSON.stringify({slideContent:true,fullCopy:true,generalDocument:true,referenceOnly:true,
    directGeneration:true,ownerIsolation:true,editablePowerPoint:true,renderedPdf:true,paidCalls:0}));
} finally {
  await app.close();
  await rm(root,{recursive:true,force:true});
}
