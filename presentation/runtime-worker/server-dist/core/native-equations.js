import{fontForText}from'./script-fonts.js';
/** Native editable equation glyphs, fractions and scripts, verified against source. */
import{textWidth}from'./layout.js';
const symbols={eta:'η',rho:'ρ',approx:'≈',times:'×',cdot:'·',le:'≤',leq:'≤',ge:'≥',geq:'≥',alpha:'α',beta:'β',Delta:'Δ',sigma:'σ',mu:'μ',pi:'π',pm:'±',infty:'∞'};
export const isEquation=s=>typeof s==='string'&&/^\s*\\\[[\s\S]*\\\]\s*$/.test(s);
function syntax(source){
 let s=source.trim().slice(2,-2).replace(/\r?\n/g,' '),i=0,depth=0;if(!s.trim()||s.length>6000)throw Error('MATH_SYNTAX');
 const group=()=>{if(++depth>80)throw Error('MATH_UNSUPPORTED');while(i<s.length&&/\s/.test(s[i]))i++;if(i>=s.length)throw Error('MATH_SYNTAX');let n;if(s[i]==='{'){i++;n=seq('}');if(s[i++]!=='}')throw Error('MATH_SYNTAX');}else n=atom();depth--;return n;};
 function atom(){let c=s[i++];if(c==='\\'){let m=s.slice(i).match(/^[A-Za-z]+/),cmd=m?.[0]||s[i++]||'';if(m)i+=cmd.length;if(cmd==='frac')return{t:'frac',a:group(),b:group()};if(cmd==='text'||cmd==='mathrm'||cmd==='operatorname'){if(s[i++]!=='{')throw Error('MATH_SYNTAX');let depth=1,text='';while(i<s.length&&depth){let v=s[i++];if(v==='{')depth++;if(v==='}')depth--;if(depth)text+=v;}return{t:'text',s:text};}if(cmd==='left'||cmd==='right')return atom();if(Object.hasOwn(symbols,cmd))return{t:'text',s:symbols[cmd]};if([' ','%',',',';','!','{','}'].includes(cmd))return{t:'text',s:cmd==='%'?'%':cmd==='{'||cmd==='}'?cmd:' '};throw Error('MATH_UNSUPPORTED');}if(c==='{'){i--;return group();}return{t:'text',s:c||''};}
 function seq(end){let nodes=[];while(i<s.length&&s[i]!==end){if(s[i]==='^'||s[i]==='_'){let kind=s[i++],last=nodes.pop();if(!last)throw Error('MATH_SYNTAX');nodes.push({t:'script',base:last,kind,script:group()});}else nodes.push(atom());}return{t:'seq',nodes};}
 const result=seq(null);if(i!==s.length)throw Error('MATH_SYNTAX');return result;
}
function box(n,pt){
 if(n.t==='text'){let h=pt/72;return{w:Math.max(.008,textWidth(n.s,pt)),up:h*.82,down:h*.30,parts:[{t:'text',s:n.s,x:0,y:-h*.82,w:Math.max(.012,textWidth(n.s,pt)+.035),h:h*1.25,pt}]};}
 if(n.t==='seq'){let x=0,up=0,down=0,parts=[];for(let child of n.nodes){const b=box(child,pt);parts.push(...b.parts.map(p=>({...p,x:p.x+x})));x+=b.w;up=Math.max(up,b.up);down=Math.max(down,b.down);}return{w:x,up,down,parts};}
 if(n.t==='frac'){const a=box(n.a,pt*.83),b=box(n.b,pt*.83),gap=pt/72*.12,w=Math.max(a.w,b.w)+.18,ay=-gap-a.down-.035,by=gap+b.up+.035;return{w,up:a.up-ay,down:b.down+by,parts:[...a.parts.map(p=>({...p,x:p.x+(w-a.w)/2,y:p.y+ay})),{t:'line',x:0,y:0,w,h:.002},...b.parts.map(p=>({...p,x:p.x+(w-b.w)/2,y:p.y+by}))]};}
 const a=box(n.base,pt),b=box(n.script,pt*.65),dy=n.kind==='^'?-a.up*.72:a.down+b.up*.6;return{w:a.w+b.w,up:Math.max(a.up,b.up-dy),down:Math.max(a.down,b.down+dy),parts:[...a.parts,...b.parts.map(p=>({...p,x:p.x+a.w,y:p.y+dy}))]};
}
export function equationParts(source,region){
 const ast=syntax(source);for(const pt of [28,26,24,22,20,18,16,14]){const b=box(ast,pt);if(b.w<=region.w-.12&&b.up+b.down<=region.h-.04)return b.parts.filter(p=>p.t==='line'||p.s.trim()).map(p=>({...p,x:region.x+p.x+.04,y:region.y+p.y+b.up+.02}));}throw Error('MATH_LAYOUT_SPACE');
}
export function drawEquation(slide,pptx,o,name){
 const id=name.replace(/^vb-/,'');const parts=equationParts(o.text,o);
 // The anchor records geometry only. Visible glyphs and fraction bars are verified below.
 slide.addText('',{x:o.x,y:o.y,w:o.w,h:o.h,margin:0,objectName:'eq-anchor-'+id});
 parts.forEach((p,i)=>{const objectName='eq-part-'+id+'-'+i;if(p.t==='line')slide.addShape(pptx.ShapeType.line,{x:p.x,y:p.y,w:p.w,h:.002,line:{color:o.color.slice(1),width:1.25},objectName});else slide.addText(p.s,{x:p.x,y:p.y,w:p.w,h:p.h,fontFace:fontForText(p.s),fontSize:p.pt,color:o.color.slice(1),margin:0,breakLine:false,paraSpaceAfter:0,lineSpacing:p.pt,valign:'top',objectName});});
 return parts;
}
export function verifyEquations(shapes,doc,paragraphText){
 const out=[];const names=new Map(shapes.map(s=>[s['p:nvSpPr']?.['p:cNvPr']?.['@_name']||'',s]));
 for(const [name,anchor]of names){const m=name.match(/^eq-anchor-(b\d+)-(\d+)$/);if(!m)continue;const block=doc.blocks.find(b=>b.id===m[1]);if(!block||!isEquation(block.text))throw Error('MATH_EXPORT_MISMATCH');const off=anchor['p:spPr']['a:xfrm']['a:off'],ext=anchor['p:spPr']['a:xfrm']['a:ext'];const region={x:Number(off['@_x'])/914400,y:Number(off['@_y'])/914400,w:Number(ext['@_cx'])/914400,h:Number(ext['@_cy'])/914400};const parts=equationParts(block.text,region);
 for(const [i,p]of parts.entries()){const actual=names.get('eq-part-'+m[1]+'-'+m[2]+'-'+i);if(!actual)throw Error('MATH_EXPORT_MISMATCH');if(p.t==='text'&&paragraphText(actual['p:txBody'])!==p.s)throw Error('MATH_EXPORT_MISMATCH');const xf=actual['p:spPr']?.['a:xfrm'];if(!xf||Math.abs(Number(xf['a:off']['@_x'])/914400-p.x)>.005||Math.abs(Number(xf['a:off']['@_y'])/914400-p.y)>.005)throw Error('MATH_EXPORT_MISMATCH');if(Math.abs(Number(xf['a:ext']['@_cx'])/914400-p.w)>.005||Math.abs(Number(xf['a:ext']['@_cy'])/914400-p.h)>.005)throw Error('MATH_EXPORT_MISMATCH');if(p.t==='line'&&actual['p:spPr']?.['a:prstGeom']?.['@_prst']!=='line')throw Error('MATH_EXPORT_MISMATCH');}
 const extras=[...names.keys()].filter(n=>n.startsWith('eq-part-'+m[1]+'-'+m[2]+'-'));if(extras.length!==parts.length)throw Error('MATH_EXPORT_MISMATCH');out.push({pos:Number(anchor['p:nvSpPr']['p:cNvPr']['@_id']),id:block.id,text:block.text});}
 return out;
}
