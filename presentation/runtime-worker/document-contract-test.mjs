import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {createApp} from './server-dist/server/app.js';import {documentPlanFormatFor} from './server-dist/server/document-plan.js';
let failure='';globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://api.openai.com/v1/responses');const body=JSON.parse(init.body),context=JSON.parse(body.input),p=body.text.format.schema.properties.slides.items.properties;
 assert.equal(p.title.maxLength,100);assert.equal(p.points.maxItems,3);assert.equal(p.points.items.maxLength,220);assert.deepEqual(p.sourceIds.items.enum,context.documents.map(d=>d.sourceId));assert.equal(p.visualIds.maxItems,0);assert.ok(context.documents[0].text.length>60000);
 const ids=context.documents.map(d=>d.sourceId),slide=(kind,title)=>({kind,title,points:['Source-grounded scientific explanation.'],visualIds:[],sourceIds:ids});
 const result={slides:[slide('cover','Research presentation'),slide('content','Methods'),slide('content','Results'),slide('references','References')]};if(failure==='schema')result.slides[1].title='x'.repeat(101);
 return Response.json({status:'completed',output:[{content:failure==='empty'?[]:[{type:'output_text',text:failure==='json'?'invalid-json':JSON.stringify(result)}]}]});};
const root=await fs.mkdtemp(path.join(os.tmpdir(),'document-contract-'));const {app}=await createApp({root,production:false,origin:'http://localhost:14310',host:'127.0.0.1',port:14310,render:false,key:'fixture-only',model:'gpt-6-luna',localAdmin:false});
try{
 const workspace={kind:'document',brief:'Explain this research',policy:'draft',resources:[{id:randomUUID(),name:'Research.txt',role:'content',text:'Research evidence. '.repeat(5000)}]};
 async function request(){return app.inject({method:'POST',url:'/api/workspace/draft',headers:{host:'localhost:14310'},payload:{workspace,model:'gpt-6.1-terra',language:'English',reasoningEffort:'high',sections:3}});}
 let response=await request();assert.equal(response.statusCode,200,response.body);assert.equal(response.json().slideCount,4);
 for(const [type,code]of [['schema','DOCUMENT_PLAN_SCHEMA_INVALID'],['json','DOCUMENT_PLAN_JSON_INVALID'],['empty','DOCUMENT_PLAN_EMPTY_OUTPUT']]){failure=type;response=await request();assert.equal(response.statusCode,422,response.body);assert.equal(response.json().error,code);}
 const id=randomUUID(),sourceId=workspace.resources[0].id;const visualFormat=documentPlanFormatFor({visuals:[{assetId:id}],documents:[{sourceId}]});assert.deepEqual(visualFormat.schema.properties.slides.items.properties.visualIds.items.enum,[id]);
 console.log(JSON.stringify({status:'passed',longDocument:true,providerAndValidatorConstraintsAligned:true,knownIdsOnly:true,schemaJsonEmptyDiagnostics:true,paidApiCalls:0}));
}finally{await app.close();}
