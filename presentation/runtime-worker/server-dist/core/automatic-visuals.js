import {sourceDiagram}from "./semantic-visuals-v2.js";
/** Source-preserving, native editable visuals. AI selects hints, never source text. */
import { wrapText, textHeight, THEMES } from './layout.js';
import { validateScene } from './fidelity.js';
export const PHOTO_TOPICS = ['none','solar energy','wind farm','forest','mangrove','ocean coast','river','city skyline','public transport','agriculture','recycling','water treatment','data center','computer technology','classroom','research laboratory','healthcare','construction','logistics','business meeting','electric vehicle','manufacturing','biodiversity','flood resilience'];
export const VISUAL_KINDS = ['none','photo','illustration','process','timeline','comparison','metrics','chart'];
const patterns = [
 ['solar energy',/\b(solar|surya|photovoltaic)\b/i],['wind farm',/\b(wind|angin)\b/i],['mangrove',/\b(mangrove|bakau)\b/i],['forest',/\b(forest|hutan|deforestation)\b/i],['ocean coast',/\b(coast|ocean|marine|pesisir|laut|pantai)\b/i],['river',/\b(river|sungai)\b/i],['public transport',/\b(transit|public transport|transportasi umum|railway)\b/i],['agriculture',/\b(agricultur|farming|pertanian|pangan)/i],['recycling',/\b(recycl|waste|sampah|daur ulang)/i],['water treatment',/\b(water|air bersih|sanitasi|sanitation)\b/i],['data center',/\b(data center|pusat data)\b/i],['computer technology',/\b(software|digital|computer|teknologi|artificial intelligence)\b/i],['classroom',/\b(education|school|student|pendidikan|sekolah)\b/i],['research laboratory',/\b(research|laboratory|penelitian)\b/i],['healthcare',/\b(health|medical|hospital|kesehatan)\b/i],['construction',/\b(construction|building|konstruksi)\b/i],['logistics',/\b(logistic|supply chain|logistik)\b/i],['business meeting',/\b(business|company|management|bisnis|perusahaan)\b/i],['electric vehicle',/\b(electric vehicle|kendaraan listrik)\b/i],['manufacturing',/\b(manufactur|factory|pabrik|industri)/i],['biodiversity',/\b(biodiversity|wildlife|keanekaragaman)\b/i],['flood resilience',/\b(flood|banjir)\b/i],['city skyline',/\b(city|urban|kota)\b/i]];
export function inferVisualHint(slide,index=1) {
 const text=slide.objects.filter(o=>o.sourceId).map(o=>o.text||o.rows?.flat().join(' ')||'').join('\n');
 const topic=patterns.find(([,rx])=>rx.test(text))?.[0]||'none';
 const count=slide.objects.filter(o=>o.type==='text'&&o.sourceId).length;
 let kind=topic==='none'?'none':'photo';
 if(index>0&&count>=3&&count<=7){
  if(/\b(19|20|21)\d{2}\b.*\n[\s\S]*\b(19|20|21)\d{2}\b/.test(text))kind='timeline';
  else if(/\b(process|workflow|steps|stages|proses|tahap|langkah)\b/i.test(text))kind='process';
  else if(/\b(compare|comparison|versus|options|perbandingan|alternatif|opsi)\b/i.test(text))kind='comparison';
  else if((text.match(/\d+(?:[.,]\d+)?\s*%/g)||[]).length>=3)kind='metrics';
 }
 return {kind,topic};
}
export function safeVisualHint(hint,slide,index){
 if(!hint||!VISUAL_KINDS.includes(hint.kind)||!PHOTO_TOPICS.includes(hint.topic))return inferVisualHint(slide,index);
 return {kind:hint.kind,topic:hint.topic};
}
const txt=o=>o.type==='text'&&o.sourceId&&typeof o.text==='string';
function measure(o,x,y,w,size) {
 const lines=o.text.split('\n').flatMap(v=>wrapText(v,w,size,!!o.bold));
 return {...o,x,y,w,fontSize:size,lines,h:textHeight(lines.length,size)*1.20+.13};
}
/** Reflow only source text; preserve source IDs, exact bytes and reading order. */
export function reserveVisualPanel(slide,cover=false) {
 if(slide.objects.some(o=>o.type==='image'||o.type==='table')||slide.objects.some(o=>o.type==='text'&&!txt(o)))return null;
 const items=slide.objects.filter(txt);if(!items.length||items.length>16)return null;
 // Author and logo regions remain outside this panel on the opening cover.
 const region=cover?{x:8.60,y:2.65,w:3.96,h:2.95}:{x:8.10,y:1.65,w:4.40,h:4.70};
 for(const base of [22,20,18,16,14]){
  let y=cover?1.15:.60;const placed=[];
  for(const [i,o]of items.entries()){
   const size=i===0?Math.min(o.fontSize||30,cover?42:30):Math.min(o.fontSize||20,base);
   const p=measure(o,.75,y,cover?7.02:6.92,Math.max(14,size));placed.push(p);y+=p.h+(i===0?.24:.15);
  }
  if(y> (cover?5.72:6.55))continue;
  return {slide:{...slide,objects:placed},region};
 }
 return null;
}
const shape=(kind,x,y,w,h,fill,extra={})=>({type:'shape',shape:kind,x,y,w,h,fill,...extra});
/** A topic illustration is ornamental, never a statistical representation. */
export function topicIllustration(region,topic,accent,panel) {
 const {x,y,w,h}=region, out=[];const X=v=>x+v*w,Y=v=>y+v*h;
 const rect=(a,b,c,d,f=accent)=>out.push(shape('rect',X(a),Y(b),c*w,d*h,f));
 const dot=(a,b,c,f=accent)=>out.push(shape('ellipse',X(a),Y(b),c*w,c*w,f));
 if(['forest','mangrove','biodiversity','agriculture'].includes(topic)){
  for(let i=0;i<3;i++){const a=.14+i*.25;rect(a+.055,.43,.035,.39);dot(a-.025,.20,.20);dot(a-.06,.34,.27);}
  rect(.09,.85,.80,.025);
 }else if(['ocean coast','river','water treatment','flood resilience'].includes(topic)){
  for(let i=0;i<4;i++)out.push(shape('wave',X(.07),Y(.18+i*.17),w*.86,h*.095,accent));
 }else if(['solar energy','wind farm'].includes(topic)){
  dot(.71,.07,.16);for(let i=0;i<2;i++)for(let j=0;j<3;j++)rect(.08+j*.23,.40+i*.17,.20,.13);
  rect(.25,.75,.025,.13);rect(.66,.75,.025,.13);rect(.15,.88,.65,.025);
 }else if(['classroom','research laboratory'].includes(topic)){
  rect(.10,.20,.36,.57);rect(.50,.20,.36,.57);rect(.475,.17,.025,.65);
  for(let i=0;i<3;i++){rect(.16,.32+i*.13,.22,.018,panel);rect(.57,.32+i*.13,.22,.018,panel);}
 }else if(topic==='healthcare'){
  rect(.36,.15,.25,.72);rect(.12,.39,.73,.24);
 }else if(['computer technology','data center'].includes(topic)){
  rect(.09,.17,.82,.58);rect(.15,.24,.70,.42,panel);rect(.46,.75,.08,.10);rect(.30,.85,.40,.025);
  for(let i=0;i<3;i++)rect(.23,.34+i*.08,.50,.018);
 }else if(['manufacturing','construction','city skyline'].includes(topic)){
  for(let i=0;i<4;i++){const a=.08+i*.22,b=.25+(i%2)*.14;rect(a,b,.18,.64-b);for(let k=0;k<3;k++)rect(a+.04,b+.08+k*.09,.09,.025,panel);}
  rect(.05,.90,.90,.025);
 }else{
  for(let i=0;i<3;i++){dot(.12+i*.29,.20,.14);rect(.09+i*.29,.45,.20,.34);}
  rect(.08,.83,.82,.025);
 }
 return out;
}
function diagram(slide,kind,accent,panel) {
 if(slide.objects.some(o=>['image','table'].includes(o.type)))return null;
 const items=slide.objects.filter(txt);if(items.length<3||items.length>6)return null;
 const [head,...body]=items;
 if(body.some(o=>o.text.length>230))return null;
 const years=body.map(o=>o.text.match(/\b((?:19|20|21)\d{2})\b/)?.[1]);
 if(kind==='timeline'&&(years.some(v=>!v)||years.some((v,i)=>i>0&&Number(v)<Number(years[i-1]))))return null;
 const explicitProcess=/\b(process|workflow|steps|stages|proses|tahap|langkah)\b/i.test(items.map(o=>o.text).join('\n'));
 const connector=kind==='timeline'||(kind==='process'&&explicitProcess);
 for(const font of [22,20,18,16,14]){
  const heading=measure(head,.75,.48,11.82,Math.min(30,head.fontSize||30));if(heading.h>1.14)continue;
  const placed=[heading],art=[];let ok=true;
  const vertical=kind==='timeline'||body.length>3;const gap=.23;
  for(const [i,o]of body.entries()){
   const x=vertical?1.85:.84+i*4.14,y=vertical?1.91+i*(4.40/body.length):2.47,w=vertical?10.25:3.56;
   const p=measure(o,x,y,w,font);const max=vertical?4.40/body.length-gap:3.30;
   if(p.h>max){ok=false;break;}placed.push(p);
   art.push(shape('rect',x-.17,y-.12,.055,Math.max(.55,p.h+.24),accent));
   if(connector){
    if(vertical){art.push(shape('ellipse',1.02,y+.05,.19,.19,accent));if(i<body.length-1)art.push(shape('line',1.115,y+.24,.005,4.40/body.length-.20,accent,{stroke:accent,strokeWidth:1.4}));}
    else if(i<body.length-1)art.push(shape('chevron',x+w+.13,y+.23,.27,.35,accent));
   }
  }
  if(ok)return {...slide,objects:[...art,...placed],automaticVisual:{kind}};
 }
 return null;
}
export async function enrichAutomaticVisuals(doc,input,{resolvePhoto,maxPhotos=8}={}) {
 let scene=structuredClone(input);const t=THEMES[scene.theme];let photos=0;const summary={photos:0,diagrams:0,illustrations:0,skipped:0};
 for(let i=0;i<scene.slides.length;i++){
  const original=scene.slides[i];if(i===0){summary.skipped++;continue;}const inferred=inferVisualHint(original,i);let hint=['process','timeline','comparison','metrics'].includes(inferred.kind)?inferred:safeVisualHint(original.visualHint,original,i);
  const listItems=original.objects.filter(o=>o.type==='text'&&doc.blocks.find(b=>b.id===o.sourceId)?.kind==='list');
  if(doc.blocks.some(b=>b.equation)&&listItems.length>=2&&listItems.length<=8&&!['process','timeline','comparison','metrics'].includes(original.visualHint?.kind))hint={kind:listItems.every(o=>/^\d+[.)]\s/.test(o.text))?'process':'metrics',topic:hint.topic};
  if(hint.kind==='none'){summary.skipped++;continue;}
  let candidate;
  if(i>0&&['process','timeline','comparison','metrics'].includes(hint.kind))candidate=sourceDiagram(original,doc,hint.kind,t.accent);
  if(!candidate&&hint.kind!=='chart'&&hint.topic!=='none'&&!original.objects.some(o=>o.type==='image')){
   const panel=reserveVisualPanel(original,i===0);
   if(panel){
    let photo;
    if(hint.kind==='photo'&&resolvePhoto&&photos<maxPhotos){try{photo=await resolvePhoto(hint.topic);}catch{/* optional provider unavailable */}}
    if(photo){candidate={...panel.slide,objects:[...panel.slide.objects,{type:'image',...panel.region,asset:photo.id}],visualCredits:[photo.credit],automaticVisual:{kind:'photo'}};}
    else if(hint.kind==='illustration'&&!['ocean coast','river','water treatment','flood resilience','none'].includes(hint.topic))candidate={...panel.slide,objects:[...topicIllustration(panel.region,hint.topic,t.accent,t.panel),...panel.slide.objects],automaticVisual:{kind:'illustration'}};
   }
  }
  if(!candidate){summary.skipped++;continue;}
  const trial={...scene,slides:scene.slides.map((s,j)=>j===i?candidate:s)};
  // The immutable document remains authoritative; no weakened source validation.
  if(!validateScene(doc,trial).passed){summary.skipped++;continue;}
  scene=trial;const kind=candidate.automaticVisual.kind;if(kind==='photo'){photos++;summary.photos++;}else if(kind==='illustration')summary.illustrations++;else summary.diagrams++;
 }
 return {scene,summary};
}
