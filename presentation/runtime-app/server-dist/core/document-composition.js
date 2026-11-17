import{reserveVisualPanel,PHOTO_TOPICS,VISUAL_KINDS}from'./automatic-visuals.js';
import{technicalSectionTitle}from'./visual-cover.js';
/** Topic-aware pagination for technical source documents. Every atom stays in order. */
import{creativeAtoms}from'./creative.js';import{isEquation,equationParts}from'./native-equations.js';import{wrapText,textHeight,THEMES}from'./layout.js';import{validateScene}from'./fidelity.js';
export function composeTechnicalDocument(doc,theme='midnight',assets=[],reference){
 const palette=THEMES[theme],atoms=creativeAtoms(doc),slides=[];let objects=[],y=.62;
 const flush=()=>{if(!objects.length)return;slides.push({id:'creative-rescue-'+slides.length,layout:'editorial',sectionTitle:doc.blocks.find(b=>b.id===objects[0].sourceId)?.kind==='heading'?'':technicalSectionTitle(doc,objects[0].sourceId),background:palette.bg,blockIds:[...new Set(objects.map(o=>o.sourceId))],objects});objects=[];y=.62;};
 for(let i=0;i<atoms.length;i++){
  const a=atoms[i],source=doc.blocks.find(b=>b.id===a.sourceId);let o;
  const heading=source?.kind==='heading';
  if(heading&&objects.some(o=>!o.bold))flush();
  if(a.rows){
   if(objects.some(o=>!o.bold))flush();const font=17,col=(11.78/a.rows[0].length)-.24,cellLines=a.rows.map(r=>r.map(v=>wrapText(v,col,font))),rowHeights=cellLines.map(r=>Math.max(...r.map(v=>textHeight(v.length,font)))+.20),h=rowHeights.reduce((a,b)=>a+b,0)*1.12+.10;
   if(y+h>6.55)flush();o={type:'table',sourceId:a.sourceId,x:.78,y,w:11.78,h,rows:a.rows,cellLines,rowHeights,fontSize:font,color:palette.fg,fill:palette.bg};objects.push(o);y+=h+.2;flush();continue;
  }
  if(isEquation(a.text)){
   const p=equationParts(a.text,{x:0,y:0,w:11.78,h:4.6}),height=Math.max(1.12,Math.max(...p.map(v=>v.y+v.h))+.16);o={type:'text',sourceId:a.sourceId,text:a.text,x:.78,y,w:11.78,h:height,fontSize:24,color:palette.fg,bold:false,lines:[a.text]};
  }else{
   const font=heading?28:source?.kind==='code'?15:19,lines=a.text.split('\n').flatMap(v=>wrapText(v,11.78,font,heading)),h=textHeight(lines.length,font)*1.17+.12;o={type:'text',sourceId:a.sourceId,text:a.text,x:.78,y,w:11.78,h,fontSize:font,color:palette.fg,bold:heading,lines};
  }
  // Keep a short contiguous source process together before pagination.
  const prior=atoms[i-1],priorSource=prior&&doc.blocks.find(b=>b.id===prior.sourceId);
  if(source?.kind==='list'&&priorSource?.kind!=='list'){
   let groupHeight=0;for(let j=i;j<atoms.length;j++){const b=doc.blocks.find(v=>v.id===atoms[j].sourceId);if(b?.kind!=='list')break;const lines=atoms[j].text.split('\n').flatMap(v=>wrapText(v,11.78,19));groupHeight+=textHeight(lines.length,19)*1.17+.30;}
   if(groupHeight<=5.93&&y+groupHeight>6.55){flush();o.y=y;}
  }
  if(y+o.h>6.55){flush();o.y=y;}if(o.h>5.93)throw Error('TECHNICAL_CONTENT_TOO_DENSE');objects.push(o);y+=o.h+.18;
  const next=atoms[i+1],nextSource=next&&doc.blocks.find(b=>b.id===next.sourceId);
  if(source?.kind==='list'&&nextSource?.kind!=='list')flush();
 }
 flush();
 // Merge a small trailing continuation into free space on the preceding page.
 for(let i=slides.length-1;i>0;i--){const current=slides[i],previous=slides[i-1];if(current.objects.some(o=>o.type!=='text'||o.bold)||current.objects.reduce((n,o)=>n+(o.text||'').length,0)>120)continue;
  const bottom=Math.max(.62,...previous.objects.map(o=>o.y+o.h));let y=bottom+.22;const moved=current.objects.map(o=>{const v={...o,y};y+=o.h+.18;return v;});if(y>6.55){
   if(previous.objects.some(o=>o.type!=='text'||isEquation(o.text)))continue;
   let yy=.62;const together=[...previous.objects,...current.objects].map(o=>{const font=o.bold?o.fontSize:18,lines=o.text.split('\n').flatMap(v=>wrapText(v,11.78,font,!!o.bold)),h=textHeight(lines.length,font)*1.17+.12;const v={...o,x:.78,y:yy,w:11.78,h,fontSize:font,lines};yy+=h+.14;return v;});if(yy>6.55)continue;previous.objects=together;
  }else previous.objects.push(...moved);previous.blockIds=[...new Set([...previous.blockIds,...current.blockIds])];slides.splice(i,1);
 }
 if(slides.length>79)throw Error('SLIDE_LIMIT');const scene={theme,sourceHash:doc.sha256,slides};
 for(const slide of scene.slides){const ids=new Set(slide.blockIds);const best=(reference?.slides||[]).map(s=>({slide:s,score:(s.blockIds||[]).filter(id=>ids.has(id)).length})).sort((a,b)=>b.score-a.score)[0];if(best?.score>0){slide.referencePhotoIds=best.slide.objects.filter(o=>o.type==='image').map(o=>o.asset);const hint=best.slide.visualHint;if(hint&&VISUAL_KINDS.includes(hint.kind)&&PHOTO_TOPICS.includes(hint.topic))slide.visualHint={kind:hint.kind,topic:hint.topic};}}
 const available=(assets||[]).filter(a=>/^[a-f0-9-]{36}$/i.test(a.id||'')).slice(0,12);const remaining=[...available];let used=0;
 for(let i=0;i<scene.slides.length&&remaining.length;i++){
  const original=scene.slides[i];
  if(original.objects.some(o=>o.type==='table'||isEquation(o.text)||doc.blocks.find(b=>b.id===o.sourceId)?.kind==='list'))continue;
  const reserved=reserveVisualPanel(original,false);if(!reserved)continue;
  const preferred=remaining.findIndex(a=>(original.referencePhotoIds||[]).includes(a.id));const picked=preferred>=0?preferred:0;const photo=remaining[picked],candidate={...reserved.slide,objects:[...reserved.slide.objects,{type:'image',...reserved.region,asset:photo.id}]};
  const trial={...scene,slides:scene.slides.map((s,j)=>j===i?candidate:s)};
  if(validateScene(doc,trial).passed){scene.slides[i]=candidate;remaining.splice(picked,1);used++;}
 }
 if(!validateScene(doc,scene).passed)throw Error('SOURCE_FIDELITY_FAILED');return scene;
}
