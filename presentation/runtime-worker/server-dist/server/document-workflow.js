import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import JSZip from 'jszip';
import {createJournalDeck,decodeJournal} from './journal-service.js';
import {readDocx} from '../core/structured-import.js';
import {decodeSource} from '../core/source.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const ownerKey=id=>createHash('sha256').update(id).digest('hex');
const uuid=/^[0-9a-f-]{36}$/;
export async function documentManifest(root,owner,id){
 if(!uuid.test(id))throw Error('DOCUMENT_INVALID');
 const dir=path.join(root,'document-imports',ownerKey(owner),id);
 return {dir,manifest:JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'))};
}
export async function snapshotDocumentAssets(project,root){
 if(project.workspace?.kind!=='document')return [];
 const result=[];
 for(const resource of project.workspace.resources.filter(r=>r.documentId&&r.role==='content')){
  const {dir,manifest}=await documentManifest(root,project.ownerId,resource.documentId);
  for(const v of manifest.visuals){
   const target=path.join(root,'assets',project.id);await fs.mkdir(target,{recursive:true});
   const bytes=await fs.readFile(path.join(dir,v.assetId+'.png'));
   if(createHash('sha256').update(bytes).digest('hex')!==v.hash)throw Error('DOCUMENT_INVALID');
   await fs.writeFile(path.join(target,v.assetId+'.image.png'),bytes,{mode:0o600});
   result.push({...v,sourceId:resource.id,documentId:resource.documentId,sourceName:resource.name});
  }
 }
 return result;
}
export async function documentVisualCount(project,root){
 let count=0;if(project.workspace?.kind!=='document')return 0;
 for(const r of project.workspace.resources.filter(r=>r.documentId&&r.role==='content'))count+=(await documentManifest(root,project.ownerId,r.documentId)).manifest.visuals.length;
 return count;
}
export function appendDocumentVisuals(scene,assets){
 const slides=scene.slides.map(s=>({...s,objects:[...s.objects]}));
 for(const asset of assets){
  const visual={id:'document-'+asset.assetId,layout:'photo',background:'#FFFFFF',documentVisual:true,documentCaption:asset.caption,objects:[{type:'image',asset:asset.assetId,x:.5,y:.8,w:12.33,h:6.1,fit:'contain',imageTreatment:'none'}]};
  const label=asset.caption.match(/^(?:Figure|Fig\.?|Table)\s*\d+/i)?.[0];
  const index=label?slides.findIndex(s=>s.objects.some(o=>o.text?.includes(label))):-1;
  if(index>=0)slides.splice(index+1,0,visual);else slides.push(visual);
 }
 return {...scene,documentMode:true,documentCoverage:{expected:assets.length,included:assets.length},slides};
}
export function registerDocumentRoutes(app,{auth,cfg}){
 let busy=false;
 app.post('/api/document/import',{preHandler:auth,bodyLimit:14*1024*1024,config:{rateLimit:{max:8,timeWindow:'1 hour'}}},async(req,reply)=>{
  if(busy)return reply.code(429).send({error:'JOURNAL_BUSY'});
  const body=req.body;
  if(!body||typeof body.name!=='string'||body.name.length>120||typeof body.base64!=='string'||body.base64.length>14*1024*1024||!/\.(pdf|docx|md|txt)$/i.test(body.name))return reply.code(400).send({error:'DOCUMENT_INVALID'});
  const bytes=Buffer.from(body.base64,'base64');if(bytes.length>10*1024*1024||bytes.toString('base64')!==body.base64)return reply.code(400).send({error:'DOCUMENT_SIZE_LIMIT'});
  busy=true;
  try{
   let source,title=body.name.replace(/\.[^.]+$/,''),visuals=[],images=[];
   if(/\.(pdf|docx)$/i.test(body.name)){
    let pdf=bytes;
    if(/\.docx$/i.test(body.name)){
     await readDocx(bytes,{referenceOnly:true});
     const temporaryRoot=path.resolve(os.tmpdir()),dir=await fs.mkdtemp(path.join(temporaryRoot,'document-word-'));
     if(path.dirname(dir)!==temporaryRoot)throw Error('DOCUMENT_INVALID');
     try{await fs.writeFile(path.join(dir,'source.docx'),bytes,{mode:0o600});await promisify(execFile)('soffice',['-env:UserInstallation='+pathToFileURL(path.join(dir,'profile')).href,'--headless','--convert-to','pdf','--outdir',dir,path.join(dir,'source.docx')],{timeout:90000,env:{...process.env,FONTCONFIG_FILE:'/app/assets/fonts/notepreso-fonts.conf'}});pdf=await fs.readFile(path.join(dir,'source.pdf'));}finally{await fs.rm(dir,{recursive:true,force:true});}
    }else decodeJournal({name:body.name,base64:body.base64});
    const result=await createJournalDeck(pdf,body.name,{signal:AbortSignal.timeout(240000),captureSource:true});
    source=result.extractedSource;title=result.manifest.metadata.title;
    const zip=await JSZip.loadAsync(result.bytes);const media=new Map();
    for(const file of Object.values(zip.files).filter(f=>/^ppt\/media\//.test(f.name)&&!f.dir)){const data=await file.async('nodebuffer');media.set(createHash('sha256').update(data).digest('hex'),data);}
    for(const visual of result.manifest.visuals){const mapped=result.manifest.mapping.find(v=>v.id===visual.id),data=media.get(mapped.imageHash),assetId=randomUUID();if(!data)throw Error('DOCUMENT_INVALID');images.push({assetId,data});visuals.push({assetId,caption:visual.caption,page:visual.page,hash:mapped.imageHash});}
   }else source=/\.docx$/i.test(body.name)?await readDocx(bytes,{referenceOnly:true}):decodeSource(bytes);
   if(!source?.trim()||source.length>240000)throw Error('DOCUMENT_TEXT_LIMIT');
   const documentId=randomUUID(),dir=path.join(cfg.root,'document-imports',ownerKey(req.user.id),documentId);
   await fs.mkdir(dir,{recursive:true,mode:0o700});
   for(const image of images)await fs.writeFile(path.join(dir,image.assetId+'.png'),image.data,{mode:0o600});
   await fs.writeFile(path.join(dir,'source.txt'),source,{mode:0o600});
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({title,visuals,sourceHash:createHash('sha256').update(bytes).digest('hex')}),{mode:0o600});
   return {source,title,documentId,visuals:visuals.length};
  }catch(e){return reply.code(422).send({error:/^(JOURNAL_|DOCUMENT_)/.test(e.message)?e.message:'DOCUMENT_INVALID'});}finally{busy=false;}
 });
}
