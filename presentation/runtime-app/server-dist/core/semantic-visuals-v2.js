import{sourceDiagram as legacyDiagram}from'./semantic-visuals-legacy-v2.js';
import{wrapText,textHeight}from'./layout.js';
/** Reflow intact source lists into connected native diagrams, with no AI/network calls. */
export function sourceDiagram(slide,doc,kind,accent){
 if(!['process','timeline','comparison','metrics'].includes(kind)||slide.objects.some(o=>o.type==='table'||o.type==='image'))return legacyDiagram(slide,doc,kind,accent);
 const map=new Map(doc.blocks.map(b=>[b.id,b]));const text=slide.objects.filter(o=>o.type==='text'&&o.sourceId);const ix=text.map((o,i)=>map.get(o.sourceId)?.kind==='list'?i:-1).filter(i=>i>=0);
 if(ix.length<2||ix.length>8||ix.at(-1)-ix[0]+1!==ix.length)return null;
 const lead=text.slice(0,ix[0]),nodes=text.slice(ix[0],ix.at(-1)+1),tail=text.slice(ix.at(-1)+1);
 if(lead.length>3||tail.length>3||nodes.some(o=>o.text!==map.get(o.sourceId)?.text)||slide.objects.some(o=>o.type==='text'&&!o.sourceId))return null;
 const dark=[1,3,5].reduce((sum,i,j)=>sum+parseInt(slide.background.slice(i,i+2),16)*[.2126,.7152,.0722][j],0)<140,fg=dark?'#FFFFFF':'#14243D';
 const measure=(o,x,y,w,font)=>{const lines=o.text.split('\n').flatMap(s=>wrapText(s,w,font,!!o.bold));return{...o,x,y,w,fontSize:font,color:fg,lines,h:textHeight(lines.length,font)*1.18+.12};};
 for(const font of [22,21,20,19,18]){
  let y=.58,placed=[],art=[];for(const [i,o]of lead.entries()){const p=measure(o,.8,y,11.7,i===0?30:19);placed.push(p);y+=p.h+.14;}if(y>2.5)continue;
  const cols=kind==='timeline'?1: nodes.length<=3?nodes.length:2,gap=.55,w=(11.4-gap*(cols-1))/cols;
  const rows=[];for(let i=0;i<nodes.length;i+=cols)rows.push(nodes.slice(i,i+cols).map((o,j)=>measure(o,1.02+j*(w+gap),0,w-.24,font)));
  let cursor=y+.25;const centers=[];
  for(const row of rows){const h=Math.max(kind==='timeline'?.40:.75,...row.map(o=>o.h));for(const [j,o]of row.entries()){
   placed.push({...o,y:cursor+.12});centers.push({x:o.x-.17,y:cursor+.12,h});
   art.push({type:'shape',shape:'line',x:o.x-.19,y:cursor-.02,w:w-.10,h:0,fill:accent,stroke:accent,strokeWidth:1.6});
   if(cols>1&&j<row.length-1&&kind==='process')art.push({type:'shape',shape:'chevron',x:o.x+w-.12,y:cursor+.25,w:.20,h:.28,fill:accent});
  }cursor+=h+(kind==='timeline'?.18:.55);}
  // Row-to-row source order remains left-to-right. The return connector runs in the gutter.
  if(kind==='process'&&rows.length>1)for(let r=0;r<rows.length-1;r++){
   const last=centers[Math.min((r+1)*cols,nodes.length)-1],next=centers[(r+1)*cols];const yy=last.y+last.h+.18;
   art.push({type:'shape',shape:'line',x:next.x-.12,y:yy,w:last.x-next.x+.12,h:0,fill:accent,stroke:accent,strokeWidth:1.2});
   art.push({type:'shape',shape:'line',x:next.x-.12,y:yy,w:0,h:Math.max(.06,next.y-yy),fill:accent,stroke:accent,strokeWidth:1.2});
  }
  if(kind==='timeline')for(let i=0;i<centers.length;i++){const c=centers[i];art.push({type:'shape',shape:'ellipse',x:.74,y:c.y+.08,w:.12,h:.12,fill:accent});if(i+1<centers.length)art.push({type:'shape',shape:'line',x:.80,y:c.y+.20,w:0,h:centers[i+1].y-c.y-.12,fill:accent,stroke:accent,strokeWidth:1.5});}
  y=cursor;for(const o of tail){const p=measure(o,.8,y,11.7,18);placed.push(p);y+=p.h+.12;}if(y>6.58)continue;
  return{...slide,objects:[...art,...placed],visualCredits:[],automaticVisual:{kind}};
 }
 return null;
}
