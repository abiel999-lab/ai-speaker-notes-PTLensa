import {wrapText,textHeight} from './layout.js';
import {validateScene} from './fidelity.js';

// Source blocks stay in strict order; originals are inserted only by asset UUID
// from the server-owned plan, never by an ambiguous Figure/Table number.
export function buildDocumentScene(doc,plan,settings={}){
 if(plan.sourceHash!==doc.sha256)throw Error('DOCUMENT_PLAN_REQUIRED');
 const groups=[];for(const b of doc.blocks){if(b.kind==='heading')groups.push([]);if(!groups.length)throw Error('DOCUMENT_PLAN_STRUCTURE');groups.at(-1).push(b);}
 if(groups.length!==plan.slides.length)throw Error('DOCUMENT_PLAN_STRUCTURE');
 const assets=new Map(plan.assets.map(a=>[a.assetId,a])),seen=new Set();
 const slides=groups.map((blocks,i)=>{
  const p=plan.slides[i],cover=i===0,visual=p.visualIds[0],asset=visual&&assets.get(visual),objects=[];
  if(visual&&(!asset||seen.has(visual)||!p.sourceIds.includes(asset.sourceId)))throw Error('DOCUMENT_PLAN_VISUAL_SOURCE');
  if(visual)seen.add(visual);
  function text(b,x,y,w,h,font,bold=false,color='#142E4C'){
   const lines=wrapText(b.text,w,font,bold),need=textHeight(lines.length,font)*1.16+.08;
   if(need>h)throw Object.assign(Error('DOCUMENT_CONTENT_TOO_DENSE'),{layoutDiagnostic:{slide:i+1,block:b.id,lines:lines.length,font,need,h}});
   objects.push({type:'text',sourceId:b.id,text:b.text,x,y,w,h,fontSize:font,bold,color,lines});
  }
  objects.push({type:'shape',shape:'rect',x:.6,y:cover?1.22:.42,w:.72,h:.055,fill:'#18A9BF'});
  const customCover=cover&&settings.coverAssetId;
  const titleHeight=cover?1.75:1.3;
  const titleFont=(cover?[34,32,30,28,26,24,22]:[26,24,22]).find(font=>textHeight(wrapText(blocks[0].text,12.03,font,true).length,font)*1.16+.08<=titleHeight);
  if(!titleFont)throw Error('DOCUMENT_CONTENT_TOO_DENSE');
  text(blocks[0],.65,cover?1.55:.6,12.03,titleHeight,titleFont,true);
  const points=blocks.slice(1,-1),citation=blocks.at(-1);
  if(asset){
   // Wide scientific charts need width; tall diagrams need height. In both
   // cases the entire evidence panel is contained, never cropped or redrawn.
   const wide=asset.width/asset.height>=1.8&&points.length<=2&&points.every(b=>wrapText(b.text,points.length===1?11.8:5.72,17).length<=2);
   if(wide){
    objects.push({type:'image',asset:visual,x:.6,y:1.95,w:12.13,h:3.65,fit:'contain',imageTreatment:'none'});
    points.forEach((b,index)=>text(b,.72+index*6.1,5.82,points.length===1?11.8:5.72,1.02,17));
   }else{
    objects.push({type:'image',asset:visual,x:.55,y:1.95,w:8.25,h:4.83,fit:'contain',imageTreatment:'none'});
    let y=2.1;for(const b of points){const h=textHeight(wrapText(b.text,3.4,18).length,18)*1.32+.14;text(b,9.15,y,3.4,h,18);y+=h+.28;}
    if(y>6.75)throw Error('DOCUMENT_CONTENT_TOO_DENSE');
   }
  }else{
   const width=customCover?7.05:11.8,font=customCover?20:cover?23:24;
   let y=cover?3.55:2.17;for(const b of points){const h=textHeight(wrapText(b.text,width,font).length,font)*1.32+.16;text(b,.72,y,width,h,font);y+=h+.34;}
   if(y>6.6)throw Error('DOCUMENT_CONTENT_TOO_DENSE');
   if(customCover)objects.push({type:'image',asset:customCover,x:8.15,y:3.45,w:4.5,h:3.2,fit:'contain',imageTreatment:'none'});
  }
  text(citation,.65,6.94,12.03,.44,11,false,'#54677C');
  return {id:'document-slide-'+i,layout:cover?'cover':'editorial',documentVisual:!!asset,documentSourceIds:p.sourceIds,documentAssetIds:p.visualIds,background:'#FFFFFF',blockIds:blocks.map(b=>b.id),objects};
 });
 if(seen.size!==assets.size)throw Error('DOCUMENT_PLAN_INCOMPLETE');
 const scene={theme:'ivory',sourceHash:doc.sha256,documentMode:true,documentCoverage:{expected:assets.size,included:seen.size,sourceBound:true},slides};
 if(!validateScene(doc,scene).passed)throw Error('SOURCE_FIDELITY_FAILED');return scene;
}
