/** Fixed public hosts only, no arbitrary model URLs, redirects, SVG or credentials. */
import fs from 'node:fs/promises';import path from 'node:path';import {randomUUID} from 'node:crypto';import sharp from 'sharp';
import {PHOTO_TOPICS} from '../core/automatic-visuals.js';
const API='https://commons.wikimedia.org/w/api.php';
const UA='NotePreso/1.0 (presentation media search; https://notepreso.com/support)';
const clean=v=>String(v||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|quot);/g,' ').replace(/[\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
function mediaUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(u.hostname)||u.username||u.password||u.port||!u.pathname.startsWith('/wikipedia/commons/')||/\.svg(?:\/|$)/i.test(u.pathname)||u.hash)return null;for(const key of u.searchParams.keys())if(!['utm_source','utm_campaign','utm_content'].includes(key))return null;u.search='';return u.href;}catch{return null;}}
export function allowedMediaUrl(value){return !!mediaUrl(value);}

async function boundedBody(response,limit){
 if(Number(response.headers.get('content-length')||0)>limit){await response.body?.cancel();throw Error('VISUAL_TOO_LARGE');}
 const out=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit){await response.body.cancel().catch(()=>{});throw Error('VISUAL_TOO_LARGE');}out.push(chunk);}return Buffer.concat(out);
}
export function acceptedPhoto(page){
 const info=page?.imageinfo?.[0],m=info?.extmetadata||{};
 if(/\b(mosaic|collage|montage)\b/i.test(page?.title||''))return null;
 if(!info||!['image/jpeg','image/png'].includes(info.mime)||!allowedMediaUrl(info.thumburl)||Number(info.width)<600||Number(info.height)<400)return null;
 const license=clean(m.LicenseShortName?.value);
 if(!/^(CC0(?: 1\.0)?|Public domain|CC BY(?:-SA)? (?:2\.0|2\.5|3\.0|4\.0))$/i.test(license))return null;
 if(m.Restrictions?.value&&clean(m.Restrictions.value))return null;
 const artist=String(m.Artist?.value||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|quot);/g,' ').replace(/[\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim();if(!artist||artist.length>12000)return null;
 let source;try{source=new URL(info.descriptionurl);if(source.protocol!=='https:'||source.hostname!=='commons.wikimedia.org'||!source.pathname.startsWith('/wiki/File:'))return null;}catch{return null;}
 const lu=String(m.LicenseUrl?.value||'').replace(/^http:/,'https:');const publicDomain=/^(CC0|Public domain)/i.test(license);
 if(!publicDomain){const expected='https://creativecommons.org/licenses/'+(license.includes('BY-SA')?'by-sa':'by')+'/'+license.split(' ').at(-1)+'/';if(lu.replace(/\/?$/,'/')!==expected)return null;}
 const title=clean(page.title).replace(/^File:/,'');
 return {url:mediaUrl(info.thumburl),title,credit:{title,artist,license,licenseUrl:publicDomain?(license.startsWith('CC0')?'https://creativecommons.org/publicdomain/zero/1.0/':'https://commons.wikimedia.org/wiki/Help:Public_domain'):lu,source:source.href,changes:'Resized and cropped to fit the slide'}};
}
export function createPhotoResolver({root,projectId,fetcher=fetch,timeoutMs=60000,maxPhotos=8}){
 if(!/^[0-9a-f-]{36}$/i.test(projectId))throw Error('Invalid project');
 const paths={},credits=[],cache=new Map(),seen=new Set();const deadline=Date.now()+timeoutMs;let downloaded=0;
 async function request(url,limit){if(Date.now()>=deadline)throw Error('VISUAL_TIMEOUT');const r=await fetcher(url,{headers:{'User-Agent':UA,Accept:url.startsWith(API)?'application/json':'image/jpeg,image/png'},redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(url.startsWith(API)?20000:12000,deadline-Date.now())))});if(!r.ok)throw Error('VISUAL_PROVIDER_UNAVAILABLE');return boundedBody(r,limit);}
 async function resolve(topic){
  if(!PHOTO_TOPICS.includes(topic)||topic==='none'||downloaded>=maxPhotos)return null;
  // Repeated topics use native illustrations instead of repeating stock photos.
  if(cache.has(topic))return null;cache.set(topic,true);
  const params=new URLSearchParams({action:'query',format:'json',generator:'search',gsrsearch:topic+' filetype:bitmap -intitle:logo -intitle:flag -intitle:portrait',gsrnamespace:'6',gsrlimit:'5',prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'1280',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|Restrictions'});
  let payload;try{payload=JSON.parse((await request(API+'?'+params,600000)).toString());}catch{return null;}
  const pages=Object.values(payload.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0));
  for(const page of pages){
   const hit=acceptedPhoto(page);if(!hit||seen.has(hit.credit.source))continue;
   try{
    const raw=await request(hit.url,6000000);
    const meta=await sharp(raw,{limitInputPixels:24000000,animated:false}).metadata();if(!['jpeg','png'].includes(meta.format)||meta.pages>1)continue;
    const bytes=await sharp(raw,{limitInputPixels:24000000}).rotate().resize({width:1280,height:960,fit:'inside',withoutEnlargement:true}).flatten({background:'#FFFFFF'}).jpeg({quality:84}).toBuffer();
    const id=randomUUID(),dir=path.join(root,'assets',projectId);await fs.mkdir(dir,{recursive:true});const file=path.join(dir,id+'.jpg');await fs.writeFile(file,bytes,{flag:'wx',mode:0o600});
    paths[id]=file;seen.add(hit.credit.source);downloaded++;credits.push(hit.credit);return {id,credit:hit.credit};
   }catch{/* Reject invalid images and continue; never fail the presentation. */}
  }
  return null;
 }
 return {resolve,paths,credits};
}
