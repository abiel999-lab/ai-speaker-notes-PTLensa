import{fontForText}from'./script-fonts.js';
import{wrapText,textHeight}from'./layout.js';
const split=s=>s.split(/,\s*|\s+and\s+/).map(v=>v.trim()).filter(Boolean);
export function semanticGraph(slide){if(slide.objects.some(o=>o.type==='table'||o.type==='image'||o.text?.trim().startsWith('\\[')))return null;const items=slide.objects.filter(o=>o.type==='text'&&o.sourceId);if(items.length<3||items.length>9)return null;
 const lanes=[];for(const o of items){const m=o.text.match(/\b(?:path|pipeline) (?:contains|is) (.+?)\./i);if(m){const labels=split(m[1]);if(labels.length>=3&&labels.length<=6)lanes.push(labels.map(label=>({label,sourceId:o.sourceId,start:o.text.indexOf(label),end:o.text.indexOf(label)+label.length})));}}
 let graph;if(lanes.length&&lanes.length<=2)graph={kind:'lanes',lanes};
 else{const steps=items.filter(o=>/^\d+[.)]\s/.test(o.text));if(steps.length>=3&&steps.length<=6)graph={kind:'sequence',lanes:[steps.map(o=>({label:o.text,sourceId:o.sourceId,start:0,end:o.text.length}))]};
 else if(/deployment|gate/i.test(items[0].text)&&items.filter(o=>/^If /i.test(o.text)).length>=2){graph={kind:'decision',lanes:[items.slice(1,5).map(o=>({label:o.text,sourceId:o.sourceId,start:0,end:o.text.length}))]};}}
 if(!graph)return null;
 for(const font of[20,19,18,17,16]){let y=.55,placed=[];for(const[i,o]of items.entries()){const size=i===0?28:font,lines=o.text.split('\n').flatMap(s=>wrapText(s,6.05,size,!!o.bold)),h=textHeight(lines.length,size)*1.18+.12;placed.push({...o,x:.65,y,w:6.05,h,fontSize:size,lines});y+=h+.16;}if(y>6.55)continue;return{slide:{...slide,objects:placed},graph:{...graph,region:{x:7.2,y:1.1,w:5.4,h:5.2}}};}return null;}
export function drawSemanticGraph(slide,pptx,graph,doc,colors){let count=0;const lines=[];for(const lane of graph.lanes){for(const node of lane){const b=doc.blocks.find(b=>b.id===node.sourceId);if(!b||b.text.slice(node.start,node.end)!==node.label)throw Error('DIAGRAM_SOURCE_INVALID');}}
 const r=graph.region;
 if(graph.kind==='decision'){
  const nodes=graph.lanes[0];const boxes=[{x:r.x+1.05,y:r.y,w:3.3,h:1.0},{x:r.x,y:r.y+1.45,w:2.5,h:1.65},{x:r.x+2.9,y:r.y+1.45,w:2.5,h:1.65},{x:r.x+2.9,y:r.y+3.65,w:2.5,h:1.45}];
  nodes.forEach((n,i)=>{const b=boxes[i];slide.addShape(pptx.ShapeType[i===0?'flowChartDecision':'roundRect'],{...b,fill:{color:colors.panel.slice(1)},line:{color:colors.accent.slice(1),width:1.3},objectName:'source-decision-node-'+i});slide.addText(n.label,{x:b.x+.14,y:b.y+.08,w:b.w-.28,h:b.h-.16,fontFace:fontForText(n.label,doc.raw,doc.presentationLanguage),fontSize:14,color:colors.fg.slice(1),margin:0,valign:'mid',align:'center',objectName:'np-derived-'+n.sourceId+'-'+n.start+'-'+n.end+'-'+i});});
  const line=(x,y,w,h,id,arrow=false)=>slide.addShape(pptx.ShapeType.line,{x,y,w,h,line:{color:colors.accent.slice(1),width:1.5,...arrow?{endArrowType:'triangle'}:{}},objectName:'source-decision-edge-'+id});
  line(r.x+2.7,r.y+1,0,.23,'stem');line(r.x+1.25,r.y+1.23,2.9,0,'fork');line(r.x+1.25,r.y+1.23,0,.22,'fail',true);line(r.x+4.15,r.y+1.23,0,.22,'pass',true);if(nodes.length>3)line(r.x+4.15,r.y+3.1,0,.55,'monitor',true);return nodes.length;
 }
 const cols=graph.lanes.length,gap=.35,w=(r.w-gap*(cols-1))/cols;
 for(let lane=0;lane<cols;lane++){const nodes=graph.lanes[lane],step=r.h/nodes.length;for(let i=0;i<nodes.length;i++){const n=nodes[i],x=r.x+lane*(w+gap),y=r.y+i*step,h=Math.min(.78,step-.18);const shape=graph.kind==='decision'&&i===0?'flowChartDecision':'roundRect';
 slide.addShape(pptx.ShapeType[shape],{x,y,w,h,rectRadius:.08,fill:{color:colors.panel.slice(1)},line:{color:colors.accent.slice(1),width:1.2},objectName:'source-graph-node-'+count});slide.addText(n.label,{x:x+.12,y:y+.06,w:w-.24,h:h-.12,fontFace:fontForText(n.label,doc.raw,doc.presentationLanguage),fontSize:graph.kind==='sequence'?14:16,color:colors.fg.slice(1),margin:0,valign:'mid',align:'center',objectName:'np-derived-'+n.sourceId+'-'+n.start+'-'+n.end+'-'+count++});if(i<nodes.length-1)slide.addShape(pptx.ShapeType.line,{x:x+w/2,y:y+h,w:0,h:step-h,line:{color:colors.accent.slice(1),width:1.6,endArrowType:'triangle'},objectName:'source-graph-edge-'+count});}}
 return count;}
