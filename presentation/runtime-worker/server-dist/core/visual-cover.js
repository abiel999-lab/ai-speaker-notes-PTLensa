/** A separate, minimal cover. Source content remains on subsequent slides. */
export function visualCoverTitle(doc){
 const text=doc.raw.toLowerCase();if(text.includes('interpolasi')&&text.includes('ekstrapolasi'))return 'Interpolasi dan Ekstrapolasi';
 return(doc.blocks.find(b=>b.kind==='heading'&&!/^(?:[A-Z]\. |Slide\s+\d|Materi siap|Hasil pemeriksaan|Cara memakai)/i.test(b.text))?.text||doc.blocks.find(b=>b.text.length<150)?.text||'Presentasi').slice(0,160);
}
export function withVisualCover(doc,scene,requested){if(requested!=null)return scene;if(scene.slides[0]?.id==='np-visual-cover')return scene;
 const title=visualCoverTitle(doc);return{...scene,menuSlide:scene.menuSlide?scene.menuSlide+1:undefined,slides:[{id:'np-visual-cover',blockIds:[],layout:'cover',background:'#082B52',coverTitle:title,objects:[]},...scene.slides.map(s=>({...s,layout:s.layout==='cover'?'editorial':s.layout,objects:s.objects.map(o=>o.targetSlide?{...o,targetSlide:o.targetSlide+1}:o)}))]};
}

export function visualCoverSubtitle(doc){return doc.blocks.filter(b=>b.kind==='heading'&&/^Slide\s+\d+\s*[—–-]\s*Kasus\s/i.test(b.text)).map(b=>b.text.replace(/^Slide\s+\d+\s*[—–-]\s*/i,'')).slice(0,3).join('\n');}

export function technicalSectionTitle(doc,id){const index=doc.blocks.findIndex(b=>b.id===id);if(index<0)return '';return doc.blocks.slice(0,index).reverse().find(b=>b.kind==='heading')?.text||'';}
