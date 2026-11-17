import{reserveAutomaticTableChart as legacyTableChart}from'./table-chart-legacy-v2.js';
/** Only literal two-column source tables with an explicit shared unit. */
import {wrapText,textHeight} from './layout.js';
export function reserveAutomaticTableChart(slide){
 const existing=legacyTableChart(slide);if(existing)return existing;
 if(!/^creative-(?:rescue-)?\d+$/.test(slide.id)||slide.objects.some(o=>o.type==='image'))return null;
 const tables=slide.objects.filter(o=>o.type==='table');if(tables.length!==1)return null;
 const table=tables[0],rows=table.rows;if(!rows||rows.length<4||rows.length>9||rows.some(r=>r.length!==2))return null;
 const header=rows[0][1],unit=header.match(/\b(USD|EUR|IDR|MW|kWh|people|orang|NTU|mg\/L|kg\/L|kg\/jam|L\/jam|jam|menit)\b|%/i)?.[0];if(!unit)return null;
 const data=rows.slice(1);if(data.some(r=>/\b(total|subtotal|jumlah|average|rata-rata)\b/i.test(r[0])))return null;
 const values=data.map(r=>/^\d+(?:[.,]\d{1,2})?%?$/.test(r[1].trim())?Number(r[1].replace('%','').replace(',','.').trim()):NaN);
 if(values.some(v=>!Number.isFinite(v)||v<0||v>1e9||unit==='%'&&v>100)||new Set(data.map(r=>r[0])).size!==data.length)return null;
 // No mixed units or silent conversion of locale-specific separators.
 if(unit!=='%'&&data.some(r=>/%/.test(r[1])))return null;
 const items=slide.objects.filter(o=>['text','table'].includes(o.type));if(items.some(o=>!o.sourceId))return null;
 for(const font of [18,16,14]){
  const placed=[];let y=.60;
  for(const [i,o]of items.entries()){
   if(o.type==='text'){
    const size=Math.max(14,Math.min(o.fontSize||font,i===0?28:font)),lines=o.text.split('\n').flatMap(v=>wrapText(v,6.30,size,!!o.bold)),h=textHeight(lines.length,size)*1.20+.13;
    placed.push({...o,x:.75,y,w:6.30,h,fontSize:size,lines});y+=h+.18;
   }else{
    const cellLines=rows.map(r=>r.map(v=>wrapText(v,2.90,font))),rowHeights=cellLines.map(r=>Math.max(...r.map(v=>textHeight(v.length,font)))+.25),h=rowHeights.reduce((a,b)=>a+b,0)*1.15+.12;
    placed.push({...o,x:.75,y,w:6.30,h,fontSize:font,cellLines,rowHeights});y+=h+.18;
   }
  }
  if(y>6.60)continue;
  return {slide:{...slide,objects:placed},chart:{region:{x:7.60,y:1.70,w:4.90,h:4.70},type:data.every(r=>/^\d+(?:[.,]\d+)?$/.test(r[0].trim()))?'line':'bar',unit:header,labels:data.map(r=>r[0]),values}};
 }
 return null;
}
