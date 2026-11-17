import JSZip from 'jszip';
export async function withoutSpeakerNotes(bytes){
 const zip=await JSZip.loadAsync(bytes);
 for(const name of Object.keys(zip.files))if(/^ppt\/notes(?:Slides|Masters)\//.test(name))zip.remove(name);
 for(const name of Object.keys(zip.files).filter(n=>n.endsWith('.rels'))){const file=zip.file(name);if(file)zip.file(name,(await file.async('string')).replace(/<Relationship\b[^>]*Type="[^"]*\/(?:notesSlide|notesMaster)"[^>]*\/>/g,''));}
 const presentation=zip.file('ppt/presentation.xml');zip.file('ppt/presentation.xml',(await presentation.async('string')).replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/g,''));
 zip.file('[Content_Types].xml',(await zip.file('[Content_Types].xml').async('string')).replace(/<Override\b[^>]*PartName="\/ppt\/notes(?:Slides|Masters)\/[^>]*\/>/g,''));
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
