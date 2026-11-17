/** Only literal two-column source tables with an explicit shared unit. */
import {wrapText,textHeight} from './layout.js';
export function reserveAutomaticTableChart(slide){
 if(!/^creative-(?:rescue-)?\d+$/.test(slide.id)||slide.objects.some(o=>o.type==='image'))return null;
 const tables=slide.objects.filter(o=>o.type==='table');if(tables.length!==1)return null;
 const table=tables[0],rows=table.rows;if(!rows||rows.length<4||rows.length>9||rows.some(r=>r.length!==2))return null;
 const header=rows[0][1],unit=header.match(/\b(USD|EUR|IDR|MW|kWh|people|orang)\b|%/i)?.[0];if(!unit)return null;
 const data=rows.slice(1);if(data.some(r=>/\b(total|subtotal|jumlah|average|rata-rata)\b/i.test(r[0])))return null;
 const values=data.map(r=>/^\d+(?:\.\d+)?%?$/.test(r[1].trim())?Number(r[1].replace('%','').trim()):NaN);
 if(values.some(v=>!Number.isFinite(v)||v<0||v>1e9||unit==='%'&&v>100)||new Set(data.map(r=>r[0])).size!==data.length)return null;
 // No mixed units or silent conversion of locale-specific separators.
 if(unit!=='%'&&data.some(r=>/%/.test(r[1])))return null;
 const items=slide.objects.filter(o=>['text','table'].includes(o.type));if(items.some(o=>!o.sourceId))return null;
 for(const font of [18,16,14]){
  const placed=[];let y=.55;const index=items.indexOf(table),before=items.slice(0,index),after=items.slice(index+1);
  const rgb=[1,3,5].map(i=>parseInt(slide.background.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),fg=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#111111':'#FFFFFF';
  const measure=(o,y,w,size)=>{const lines=o.text.split('\n').flatMap(v=>wrapText(v,w,size,!!o.bold)),h=textHeight(lines.length,size)*1.2+.12;return{...o,x:.75,y,w,h,fontSize:size,lines,color:fg};};
  for(const [i,o]of before.entries()){const p=measure(o,y,11.80,i===0?Math.min(30,o.fontSize||30):Math.max(16,font));placed.push(p);y+=p.h+.13;}
  const tableY=y+.12,cellLines=rows.map(r=>r.map(v=>wrapText(v,2.90,font))),rowHeights=cellLines.map(r=>Math.max(...r.map(v=>textHeight(v.length,font)))+.25),h=rowHeights.reduce((a,b)=>a+b,0)*1.15+.12;
  placed.push({...table,x:.75,y:tableY,w:6.30,h,fontSize:font,cellLines,rowHeights,color:fg,fill:slide.background});y=tableY+h+.18;
  for(const o of after){const p=measure(o,y,11.80,16);placed.push(p);y+=p.h+.12;}
  if(y>6.65||h<2.2)continue;
  return{slide:{...slide,objects:placed},chart:{region:{x:7.60,y:tableY+.05,w:4.90,h:h-.10},unit:header,labels:data.map(r=>r[0]),values}};
 }
 return null;
}
