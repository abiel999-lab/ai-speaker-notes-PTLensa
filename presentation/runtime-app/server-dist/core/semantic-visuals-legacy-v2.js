/** Native editable diagrams selected from real source lists, preserving every text atom. */
import{wrapText,textHeight}from'./layout.js';
export function sourceDiagram(slide,doc,kind,accent){
 if(!['process','timeline','comparison','metrics'].includes(kind))return null;
 const rgb=[1,3,5].map(i=>parseInt(slide.background.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);const fg=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#111111':'#FFFFFF';
 const source=new Map(doc.blocks.map(b=>[b.id,b]));const text=slide.objects.filter(o=>o.type==='text'&&o.sourceId);
 const indices=text.map((o,i)=>source.get(o.sourceId)?.kind==='list'?i:-1).filter(i=>i>=0);
 if(indices.length<2||indices.length>8||slide.objects.some(o=>o.type==='table'))return null;
 const first=indices[0],last=indices.at(-1);if(indices.length!==last-first+1)return null;
 const nodes=text.slice(first,last+1),lead=text.slice(0,first),tail=text.slice(last+1);if(!lead.length||lead.length>3||tail.length>2)return null;
 if(nodes.some(o=>source.get(o.sourceId)?.text!==o.text))return null;
 if(kind==='timeline'){
  const years=nodes.map(o=>Number(o.text.match(/\b((?:19|20|21)\d{2})\b/)?.[1]));
  if(years.some(y=>!y)||years.some((y,i)=>i&&y<years[i-1]))return null;
 }
 const measure=(o,x,y,w,size)=>{const lines=o.text.split('\n').flatMap(v=>wrapText(v,w,size,!!o.bold));return{...o,x,y,w,color:fg,fontSize:size,lines,h:textHeight(lines.length,size)*1.19+.12};};
 for(const font of [23,21,19,17]){
  let y=.48;const placed=[];for(const [i,o]of lead.entries()){const p=measure(o,.76,y,11.8,i===0?Math.min(32,o.fontSize||32):font);placed.push(p);y+=p.h+.16;}
  if(y>2.5)continue;const top=Math.max(y+.20,1.85),bottom=6.53;const footer=tail.map(o=>measure(o,.76,0,11.8,17));const reserved=footer.reduce((s,o)=>s+o.h+.14,0);const available=bottom-top-reserved;const vertical=kind==='timeline'||nodes.length>4||nodes.some(o=>o.text.length>100);
  const art=[];let ok=true;
  if(vertical){
   const heights=nodes.map(o=>measure(o,1.58,0,10.82,font).h),gap=.18,total=heights.reduce((a,b)=>a+b,0)+gap*(nodes.length-1);if(total>available)continue;
   let rowY=top;const centers=[];
   for(const [i,o]of nodes.entries()){const p=measure(o,1.58,rowY,10.82,font);placed.push(p);centers.push(rowY+p.h/2);rowY+=p.h+gap;}
   if(['process','timeline'].includes(kind)){
    art.push({type:'shape',shape:'line',x:1.12,y:centers[0],w:.005,h:Math.max(.005,centers.at(-1)-centers[0]),fill:accent,stroke:accent,strokeWidth:2});
    for(const cy of centers)art.push({type:'shape',shape:'ellipse',x:1.025,y:cy-.095,w:.19,h:.19,fill:accent});
   }else for(const cy of centers)art.push({type:'shape',shape:'rect',x:1.10,y:cy-.15,w:.07,h:.30,fill:accent});
  }else{
   const gap=.40,w=(11.80-gap*(nodes.length-1))/nodes.length;
   for(const [i,o]of nodes.entries()){const x=.76+i*(w+gap),p=measure(o,x,top+.30,w,font);if(p.h>available-.4){ok=false;break;}placed.push(p);art.push({type:'shape',shape:'rect',x,y:top,w,h:.055,fill:accent});if(kind==='process'&&i<nodes.length-1)art.push({type:'shape',shape:'chevron',x:x+w+.11,y:top+.5,w:.18,h:.28,fill:accent});}
  }
  if(!ok)continue;let footerY=bottom-reserved;for(const o of footer){placed.push({...o,y:footerY});footerY+=o.h+.14;}
  // Picture assets can remain available on other slides; semantic diagrams take priority here.
  return{...slide,objects:[...art,...placed],visualCredits:[],automaticVisual:{kind}};
 }
 return null;
}
