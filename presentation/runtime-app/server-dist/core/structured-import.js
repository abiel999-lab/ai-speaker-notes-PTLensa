import JSZip from'jszip';import{XMLParser}from'fast-xml-parser';
const xml=new XMLParser({ignoreAttributes:false,preserveOrder:true,trimValues:false,processEntities:true,parseTagValue:false});
function children(n,key){return n[key]||[];}
function text(nodes){let out='';for(const n of nodes||[]){if(n['w:t'])out+=n['w:t'].map(x=>x['#text']??'').join('');else if(n['w:tab'])out+='\t';else if(n['w:br'])out+='\n';else for(const[k,v]of Object.entries(n))if(k!==':@'&&Array.isArray(v))out+=text(v);}return out;}
function find(nodes,key){for(const n of nodes||[]){if(n[key])return n[key];for(const[k,v]of Object.entries(n))if(k!==':@'&&Array.isArray(v)){const r=find(v,key);if(r)return r;}}return null;}
export async function readDocx(bytes, { referenceOnly = false } = {}) {
 let z;
 try {
  z = await JSZip.loadAsync(bytes);
 } catch {
  throw Error('DOCUMENT_INVALID');
 }
 let total=0;for(const[name,f]of Object.entries(z.files)){if(name.startsWith('/')||name.split('/').includes('..')||/vbaProject|embeddings\//i.test(name))throw Error('DOCUMENT_UNSAFE');total+=f._data?.uncompressedSize||0;if(total>32*1024*1024)throw Error('DOCUMENT_SIZE_LIMIT');}const f=z.file('word/document.xml');if(!f)throw Error('DOCUMENT_INVALID');const s=await f.async('string');if(/<!DOCTYPE|<!ENTITY/i.test(s))throw Error('DOCUMENT_UNSAFE');if(/<m:oMath/.test(s))throw Error('DOCUMENT_MATH_REVIEW_REQUIRED');const tree=xml.parse(s),body=find(tree,'w:body');if(!body)throw Error('DOCUMENT_INVALID');const lines=[];
 for(const n of body){if(n['w:p']){const value=text(n['w:p']).trim();if(!value)continue;const props=n['w:p'].find(x=>x['w:pPr'])?.['w:pPr']||[];const style=props.find(x=>x['w:pStyle'])?.[':@']?.['@_w:val']||'';const heading=String(style).match(/^(?:Heading|heading|Titre)([1-6])$/);lines.push(heading?'#'.repeat(Number(heading[1]))+' '+value:props.some(x=>x['w:numPr'])?'- '+value:value);}else if(n['w:tbl']){const rows=n['w:tbl'].filter(x=>x['w:tr']).map(row=>row['w:tr'].filter(x=>x['w:tc']).map(cell=>text(cell['w:tc']).trim().replace(/[\r\n\t]+/g,' ')));if(!rows.length)continue;if (rows.some(row => row.length !== rows[0].length || row.some(value => value.includes('|')))) {
  if (!referenceOnly) throw Error('DOCUMENT_TABLE_REVIEW_REQUIRED');
  // Keep every cell's text in source order for reference-only material.
  lines.push(...rows.map(row => row.join(' · ')), '');
  continue;
 }lines.push('| '+rows[0].join(' | ')+' |','| '+rows[0].map(()=>'---').join(' | ')+' |',...rows.slice(1).map(row=>'| '+row.join(' | ')+' |'));}lines.push('');}
 const source=lines.join('\n').trim();if(!source)throw Error('DOCUMENT_EMPTY');if(source.length>240000)throw Error('DOCUMENT_TEXT_LIMIT');return source;}
// Recover only explicit tab-separated grids. Do not guess columns from ordinary spaces.
export function recoverTabTables(raw){const lines=raw.split(/\r?\n/),out=[];for(let i=0;i<lines.length;i++){const line=lines[i];if(!line.includes('\t')||line.includes('|')){out.push(line);continue;}const group=[line.split('\t')];let j=i+1;while(j<lines.length&&lines[j].includes('\t')&&!lines[j].includes('|')&&lines[j].split('\t').length===group[0].length){group.push(lines[j++].split('\t'));}if(group.length<2||group[0].length<2||group[0].length>10){out.push(line);continue;}out.push('| '+group[0].map(x=>x.trim()).join(' | ')+' |','| '+group[0].map(()=>'---').join(' | ')+' |',...group.slice(1).map(row=>'| '+row.map(x=>x.trim()).join(' | ')+' |'));i=j-1;}return out.join('\n');}
