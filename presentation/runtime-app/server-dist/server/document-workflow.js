import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {createJournalDeck,decodeJournal} from './journal-service.js';
import {readDocxWithImages} from '../core/structured-import.js';
import {decodeSource} from '../core/source.js';
const ownerKey=id=>createHash('sha256').update(id).digest('hex');
const uuid=/^[0-9a-f-]{36}$/;
export async function documentManifest(root,owner,id){
 if(!uuid.test(id))throw Error('DOCUMENT_INVALID');
 const dir=path.join(root,'document-imports',ownerKey(owner),id);
 return {dir,manifest:JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'))};
}
export function visualsForResource(manifest, role) {
 return role === 'full-copy' && manifest.fullCopyVisuals ? manifest.fullCopyVisuals : manifest.visuals;
}
export async function snapshotDocumentAssets(project,root){
 if(project.workspace?.kind!=='document')return [];
 const result=[];
 for(const resource of project.workspace.resources.filter(r=>r.documentId&&['content','full-copy'].includes(r.role))){
  const {dir,manifest}=await documentManifest(root,project.ownerId,resource.documentId);
  for(const v of visualsForResource(manifest,resource.role)){
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
 for(const r of project.workspace.resources.filter(r=>r.documentId&&['content','full-copy'].includes(r.role)))count+=visualsForResource((await documentManifest(root,project.ownerId,r.documentId)).manifest,r.role).length;
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
 app.post('/api/document/import',{preHandler:auth,bodyLimit:68*1024*1024,config:{rateLimit:false}},async(req,reply)=>{
  if(busy)return reply.code(429).send({error:'JOURNAL_BUSY'});
  const body=req.body;
  if(!body||typeof body.name!=='string'||body.name.length>120||typeof body.base64!=='string'||body.base64.length>68*1024*1024||!/\.(pdf|docx|md|txt)$/i.test(body.name))return reply.code(400).send({error:'DOCUMENT_INVALID'});
  const bytes=Buffer.from(body.base64,'base64');if(bytes.length>50*1024*1024||bytes.toString('base64')!==body.base64)return reply.code(400).send({error:'DOCUMENT_SIZE_LIMIT'});
  busy=true;
  try{
   let source,fullCopyVisuals,title=body.name.replace(/\.[^.]+$/,''),visuals=[],images=[],pdfPages;
   const storeVisual=({data,...metadata})=>{
    const assetId=randomUUID();
    images.push({assetId,data});
    return {...metadata,assetId,hash:createHash('sha256').update(data).digest('hex')};
   };
   if(/\.pdf$/i.test(body.name)){
    decodeJournal({name:body.name,base64:body.base64});
    const result=await createJournalDeck(bytes,body.name,{signal:AbortSignal.timeout(240000),capturePdfVisuals:true});
    source=result.extractedSource;title=result.title;
    pdfPages=result.pageCount;
    visuals=result.figures.map(storeVisual);
    fullCopyVisuals=result.fullCopyVisuals.map(storeVisual);
   }else if(/\.docx$/i.test(body.name)){
    const word=await readDocxWithImages(bytes);
    source=word.source||`# ${title}`;
    fullCopyVisuals=[];
    for(const image of word.images){
     let data;
     try{data=await sharp(image.data,{limitInputPixels:32e6}).resize({width:2200,height:2200,fit:'inside',withoutEnlargement:true}).png().toBuffer();}
     catch{throw Error('DOCUMENT_IMAGE_EXTRACTION_FAILED');}
     fullCopyVisuals.push(storeVisual({...image,data,page:1}));
    }
    visuals=fullCopyVisuals;
   }else source=decodeSource(bytes);
   if(!source?.trim()||source.length>240000)throw Error('DOCUMENT_TEXT_LIMIT');
   const documentId=randomUUID(),dir=path.join(cfg.root,'document-imports',ownerKey(req.user.id),documentId);
   await fs.mkdir(dir,{recursive:true,mode:0o700});
   for(const image of images)await fs.writeFile(path.join(dir,image.assetId+'.png'),image.data,{mode:0o600});
   await fs.writeFile(path.join(dir,'source.txt'),source,{mode:0o600});
   const orderedVisuals=fullCopyVisuals!==undefined;
   await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({title,visuals,fullCopyVisuals,orderedVisuals,sourceHash:createHash('sha256').update(bytes).digest('hex')}),{mode:0o600});
   return {source,title,documentId,visuals:visuals.length,pdfPages,orderedVisuals,inlineImageCount:fullCopyVisuals?.length};
  }catch(e){const code=/^(JOURNAL_|DOCUMENT_)/.test(e.message)?e.message:'DOCUMENT_INVALID';console.warn(JSON.stringify({event:'document_import_failed',code,requestId:req.id}));return reply.code(422).send({error:code,requestId:req.id});}finally{busy=false;}
 });
}
