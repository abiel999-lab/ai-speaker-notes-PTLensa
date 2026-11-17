import{isEquation,equationParts}from'./native-equations.js';
import{wrapText,textHeight}from'./layout.js';
import{validateScene}from'./fidelity.js';
const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>.015&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>.015;
function fits(o){if(!isEquation(o.text))return true;try{equationParts(o.text,o);return true;}catch(e){if(e.message!=='MATH_LAYOUT_SPACE')throw e;return false;}}
function measure(o,x,y,w,font){
 if(o.type==='table'){const cellLines=o.rows.map(row=>row.map(v=>wrapText(v,w/row.length-.24,font))),rowHeights=cellLines.map(row=>Math.max(...row.map(lines=>textHeight(lines.length,font)))+.2);return{...o,x,y,w,h:rowHeights.reduce((a,b)=>a+b,0)*1.12+.1,fontSize:font,cellLines,rowHeights};}
 if(isEquation(o.text)){const parts=equationParts(o.text,{x:0,y:0,w,h:5.8});return{...o,x,y,w,h:Math.max(.6,...parts.map(p=>p.y+p.h))+.1,lines:[o.text]};}
 const size=o.bold?Math.min(o.fontSize||28,28):font,lines=o.text.split('\n').flatMap(s=>wrapText(s,w,size,!!o.bold));return{...o,x,y,w,h:textHeight(lines.length,size)*1.18+.12,fontSize:size,lines};
}
export function fitEquationScene(doc,scene){
 const changed=[];let result={...scene,slides:[...scene.slides]};
 for(let index=0;index<result.slides.length;index++){
  const original=result.slides[index];if(original.objects.every(fits))continue;
  // First use only free space around the failing equation; retain all other geometry.
  let candidate={...original,objects:original.objects.map(o=>({...o}))};
  for(let i=0;i<candidate.objects.length;i++){
   const o=candidate.objects[i];if(fits(o))continue;const others=candidate.objects.filter((_,j)=>j!==i).filter(v=>['text','table','image'].includes(v.type)&&!v.backgroundImage);
   let found;
   search:for(const w of[o.w,Math.min(11.78,12.55-o.x),11.78])for(const h of[Math.max(o.h,.8),1.1,1.45,1.9,2.5])for(const x of[o.x,.78]){
    const v={...o,x,w,h};if(x+w>12.56||v.y+h>6.35||others.some(b=>overlap(v,b))||!fits(v))continue;
    const trial={...candidate,objects:candidate.objects.map((v,j)=>j===i?{...o,x,w,h}:v)};
    if(validateScene(doc,{...result,slides:result.slides.map((s,j)=>j===index?trial:s)}).passed){found=trial;break search;}
   }
   if(found)candidate=found;
  }
  let trial={...result,slides:result.slides.map((s,j)=>j===index?candidate:s)};
  if(!candidate.objects.every(fits)||!validateScene(doc,trial).passed){
   // Reflow only this slide. Source text, tables, equations, links and slide count stay intact.
   const content=original.objects.filter(o=>o.type==='text'||o.type==='table');const images=original.objects.filter(o=>o.type==='image');let repaired;
   const title=content[0]?.bold&&!isEquation(content[0].text)?content[0]:null,body=title?content.slice(1):content;
   for(const font of[20,19,18,17,16]){
    const heading=title?measure(title,.78,.5,11.78,28):null,top=heading?heading.y+heading.h+.2:.62;
    for(const columns of[1,2]){
     if(images.length&&columns===2)continue;const w=images.length?7.8:columns===1?11.78:5.67;
     const splits=columns===1?[body.length]:Array.from({length:body.length-1},(_,i)=>i+1);
     for(const split of splits){let objects=heading?[heading]:[],ok=true;
      for(let col=0;col<columns;col++){let y=top;const list=columns===1?body:col===0?body.slice(0,split):body.slice(split);for(const o of list){const v=measure(o,.78+col*6.11,y,w,font);objects.push(v);y+=v.h+.16;}if(y>6.35)ok=false;}
      if(!ok)continue;
      for(let n=0;n<images.length;n++)objects.push({...images[n],backgroundImage:false,imageTreatment:'none',fit:'contain',x:9,y:1+n*(4.8/images.length),w:3.4,h:4.5/images.length});
      const slide={...original,objects};const attempt={...result,slides:result.slides.map((s,j)=>j===index?slide:s)};
      if(objects.every(fits)&&validateScene(doc,attempt).passed){repaired=attempt;break;}
     }if(repaired)break;
    }if(repaired)break;
   }
   if(!repaired)throw Error('MATH_LAYOUT_SPACE');result=repaired;
  }else result=trial;
  changed.push(index);
 }
 return{scene:result,changed};
}
