import JSZip from'jszip';import{XMLParser}from'fast-xml-parser';
import { posix } from 'node:path';
const xml=new XMLParser({ignoreAttributes:false,preserveOrder:true,trimValues:false,processEntities:true,parseTagValue:false});
function children(n,key){return n[key]||[];}
function text(nodes){let out='';for(const n of nodes||[]){if(n['w:t'])out+=n['w:t'].map(x=>x['#text']??'').join('');else if(n['w:tab'])out+='\t';else if(n['w:br'])out+='\n';else for(const[k,v]of Object.entries(n))if(k!==':@'&&Array.isArray(v))out+=text(v);}return out;}
function find(nodes,key){for(const n of nodes||[]){if(n[key])return n[key];for(const[k,v]of Object.entries(n))if(k!==':@'&&Array.isArray(v)){const r=find(v,key);if(r)return r;}}return null;}
export async function readDocxWithImages(bytes) {
    const archive=await JSZip.loadAsync(bytes).catch(()=>{throw Error('DOCUMENT_INVALID');});
    let total=0;
    for(const file of Object.values(archive.files)){
        const original=file.unsafeOriginalName||file.name;
        if(original.startsWith('/')||original.split('/').includes('..')||/vbaProject|embeddings\//i.test(original))throw Error('DOCUMENT_UNSAFE');
        total+=file._data?.uncompressedSize||0;
        if(total>32*1024*1024)throw Error('DOCUMENT_SIZE_LIMIT');
    }
    const readXml=async file=>{
        const data=await archive.file(file)?.async('string');
        if(/<!DOCTYPE|<!ENTITY/i.test(data||''))throw Error('DOCUMENT_UNSAFE');
        return data||'';
    };
    const document=await readXml('word/document.xml');
    if(/<m:oMath/.test(document))throw Error('DOCUMENT_MATH_REVIEW_REQUIRED');
    const body=find(xml.parse(document),'w:body');
    if(!body)throw Error('DOCUMENT_INVALID');
    const relationships=new XMLParser({ignoreAttributes:false,parseTagValue:false}).parse(
        await readXml('word/_rels/document.xml.rels')).Relationships?.Relationship;
    const targets=new Map((Array.isArray(relationships)?relationships:relationships?[relationships]:[])
        .filter(rel=>rel['@_Type']?.endsWith('/image')&&rel['@_TargetMode']!=='External')
        .map(rel=>[rel['@_Id'],rel['@_Target']]));
    let source='';
    const images=[];
    const append=value=>{if(value.trim())source+=(source?'\n\n':'')+value.trim();};
    const addImage=async id=>{
        const target=targets.get(id);
        const file=target?.startsWith('/')?posix.normalize(target).slice(1):target&&posix.join('word',target);
        if(!file?.startsWith('word/media/'))throw Error('DOCUMENT_IMAGE_EXTRACTION_FAILED');
        const data=await archive.file(file)?.async('nodebuffer');
        if(!data)throw Error('DOCUMENT_IMAGE_EXTRACTION_FAILED');
        if(images.length>=200)throw Error('DOCUMENT_IMAGE_LIMIT');
        images.push({data,sourceOffset:source.length+(source?2:0),visualKind:'inline',caption:`Image ${images.length+1} from Word`});
    };
    async function paragraph(nodes){
        const props=find(nodes,'w:pPr')||[];
        const style=props.find(node=>node['w:pStyle'])?.[':@']?.['@_w:val']||'';
        const heading=String(style).match(/^(?:Heading|heading|Titre)([1-6])$/);
        let prefix=heading?'#'.repeat(Number(heading[1]))+' ':props.some(node=>node['w:numPr'])?'- ':'';
        let pending='';
        const flush=()=>{if(pending.trim()){append(prefix+pending);prefix='';pending='';}};
        async function walk(children){
            for(const node of children){
                if(node['w:t']||node['w:tab']||node['w:br']){pending+=text([node]);continue;}
                const id=node[':@']?.['@_r:embed']||(node['v:imagedata']&&node[':@']?.['@_r:id']);
                if((node['a:blip']||node['v:imagedata'])&&id){flush();await addImage(id);continue;}
                if(node['mc:AlternateContent']){
                    const choice=node['mc:AlternateContent'].find(item=>item['mc:Choice']&&
                        (find(item['mc:Choice'],'a:blip')||find(item['mc:Choice'],'v:imagedata')));
                    await walk(choice?.['mc:Choice']||find(node['mc:AlternateContent'],'mc:Fallback')||[]);
                    continue;
                }
                if(node['w:pPr'])continue;
                for(const [key,value] of Object.entries(node))if(key!==':@'&&Array.isArray(value))await walk(value);
            }
        }
        await walk(nodes);
        flush();
    }
    async function blocks(nodes){
        for(const node of nodes){
            if(node['w:p']) await paragraph(node['w:p']);
            else if(node['w:tbl']){
                const table=node['w:tbl'];
                if(find(table,'a:blip')||find(table,'v:imagedata')){await blocks(table);continue;}
                const rows=table.filter(item=>item['w:tr']).map(row=>row['w:tr']
                    .filter(item=>item['w:tc']).map(cell=>text(cell['w:tc']).trim().replace(/[\r\n\t]+/g,' ').replaceAll('|','\\|')));
                if(!rows.length)continue;
                if(rows.every(row=>row.length===rows[0].length)){
                    const format=row=>'| '+row.join(' | ')+' |';
                    append([format(rows[0]),format(rows[0].map(()=> '---')),...rows.slice(1).map(format)].join('\n'));
                }else for(const row of rows)append(row.join(' · '));
            }else{
                for(const key of ['w:sdt','w:sdtContent','w:customXml','w:tr','w:tc'])
                    if(node[key])await blocks(node[key]);
            }
        }
    }
    await blocks(body);
    if(!source&&!images.length)throw Error('DOCUMENT_EMPTY');
    return {source,images};
}
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
