// Independent workflow: never replaces or saves an existing presentation.
const session = await fetch('/api/session',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).catch(()=>null);
if(session?.user){
 const capability=await fetch('/api/journal/capabilities',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).catch(()=>null);
 if(capability?.enabled)mount();
}
function mount(){
 const style=document.createElement('link');style.rel='stylesheet';style.href='/assets/journal-to-ppt-v1.css';document.head.append(style);
 const launcher=document.createElement('button');launcher.type='button';launcher.className='np-journal-launch';launcher.textContent='Journal to PPT';document.body.append(launcher);
 const dialog=document.createElement('dialog');dialog.className='np-journal-dialog';
 // Static markup only. All strings from the PDF enter through textContent.
 dialog.innerHTML='<form method="dialog"><button class="np-journal-close" aria-label="Close">×</button></form><h2>Journal to PPT</h2><p>Upload a research journal PDF to create a presentation with a cover, original visuals, source-based points and speaker notes. Complete source pages are included.</p><label>Research journal PDF<input type="file" accept="application/pdf,.pdf"></label><p class="np-journal-summary" role="status" aria-live="polite"></p><button class="np-journal-export" type="button" disabled>Create PPTX</button>';
 document.body.append(dialog);
 const input=dialog.querySelector('input'),status=dialog.querySelector('[role=status]'),button=dialog.querySelector('.np-journal-export');
 let payload=null,controller=null;
 launcher.onclick=()=>dialog.showModal();
 dialog.addEventListener('close',()=>{controller?.abort();controller=null;input.value='';payload=null;button.disabled=true;input.disabled=false;status.textContent='';});
 const errors={JOURNAL_OCR_REQUIRED:'This PDF needs OCR before it can be converted.',JOURNAL_PAGE_LIMIT:'Use a PDF with at most 40 pages.',JOURNAL_BUSY:'Another journal is being processed. Please try again shortly.',JOURNAL_STRUCTURE_REVIEW_REQUIRED:'The journal sections could not be identified. Please use a journal with readable text.',AUTH_REQUIRED:'Please sign in again.',CSRF_REJECTED:'Please refresh the page and try again.'};
 async function request(action,signal){
  const response=await fetch('/api/journal/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken||''},body:JSON.stringify(payload),signal});
  if(!response.ok){const e=await response.json().catch(()=>({}));throw Error(errors[e.error]||'The journal could not be processed. Please try again.');}
  return response;
 }
 input.onchange=async()=>{
  controller?.abort();const own=new AbortController();controller=own;payload=null;button.disabled=true;
  const file=input.files[0];if(!file)return;
  if(!/\.pdf$/i.test(file.name)||file.size>10*1024*1024){status.textContent='Choose a PDF smaller than 10 MiB.';return;}
  status.textContent='Reading journal structure and visual inventory…';
  try{
   const data=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));
   if(own.signal.aborted)return;
   payload={name:file.name,base64:btoa(binary)};
   const manifest=await(await request('inspect',own.signal)).json();
   if(own.signal.aborted)return;
   status.textContent=`${manifest.metadata.title}. ${manifest.pages} pages; ${manifest.visuals.filter(v=>v.kind==='figure').length} figures; ${manifest.visuals.filter(v=>v.kind==='table').length} tables; ${manifest.visuals.filter(v=>v.kind==='graphical-abstract').length} graphical abstracts. All source pages will also be included.`;
   button.disabled=false;
  }catch(error){if(!own.signal.aborted&&error.name!=='AbortError')status.textContent=error.message;}
 };
 button.onclick=async()=>{
  controller?.abort();const own=new AbortController();controller=own;button.disabled=true;input.disabled=true;status.textContent='Creating your presentation, preserving original visuals and adding speaker notes…';
  try{
   const response=await request('export',own.signal),blob=await response.blob();
   if(own.signal.aborted)return;
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='journal-presentation.pptx';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   status.textContent='Your PPTX is ready. Review the slide content and the original journal visuals before presenting.';
  }catch(error){if(!own.signal.aborted&&error.name!=='AbortError')status.textContent=error.message;}
  finally{if(controller===own){input.disabled=false;button.disabled=!payload;}}
 };
}
