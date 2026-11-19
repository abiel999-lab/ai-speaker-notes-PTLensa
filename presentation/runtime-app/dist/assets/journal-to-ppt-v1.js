// Research journal format lives in the document workspace.
const attach = () => {
 const host=document.getElementById('np-journal-mode');
 if(host && !host.firstChild)mount(host);
};
new MutationObserver(attach).observe(document.body,{subtree:true,childList:true});
attach();

function mount(host){
 const details=document.createElement('details');
 const title=document.createElement('summary');
 title.textContent='Research journal (PDF)';
 details.append(title);
 const dialog=document.createElement('div');dialog.className='np-journal-form';
 // Static markup only. All strings from the PDF enter through textContent.
 dialog.innerHTML='<p>Upload one research journal PDF (up to 10 MB and 40 pages) to create one PowerPoint with Introduction or Background, Methodology, and Conclusion. The original pages are included.</p><label>Research journal PDF<input type="file" accept="application/pdf,.pdf"></label><label>PowerPoint font<select id="np-journal-font"><option>Arial</option><option>Aptos</option><option>Calibri</option><option>Cambria</option><option>Century Gothic</option><option>Comic Sans MS</option><option>Garamond</option><option>Georgia</option><option>Helvetica</option><option>Inter</option><option>Lato</option><option>Montserrat</option><option>Open Sans</option><option>Poppins</option><option>Roboto</option><option>Segoe UI</option><option>Tahoma</option><option>Times New Roman</option><option>Trebuchet MS</option><option>Verdana</option></select></label><p class="np-journal-summary" role="status" aria-live="polite"></p><button class="np-journal-export" type="button" disabled>Create PPTX</button>';
 details.append(dialog);host.append(details);
 const input=dialog.querySelector('input'),status=dialog.querySelector('[role=status]'),button=dialog.querySelector('.np-journal-export');
 let payload=null,controller=null;
 const font=dialog.querySelector('#np-journal-font');
 if (new URLSearchParams(location.search).get('tool') === 'journal') {
  details.open=true;
  const url=new URL(location.href);url.searchParams.delete('tool');history.replaceState(history.state,'',url);
 }
 const errors={JOURNAL_OCR_REQUIRED:'This PDF needs OCR before it can be converted.',JOURNAL_PAGE_LIMIT:'Use a PDF with at most 40 pages.',JOURNAL_BUSY:'Another journal is being processed. Please try again shortly.',JOURNAL_STRUCTURE_REVIEW_REQUIRED:'The journal sections could not be identified. Please use a journal with readable text.',AUTH_REQUIRED:'Please sign in again.',CSRF_REJECTED:'Please refresh the page and try again.'};
 async function request(action,signal){
  const session=await fetch('/api/session',{credentials:'same-origin',cache:'no-store',signal}).then(r=>r.ok?r.json():null);
  if(!session?.user)throw Error(errors.AUTH_REQUIRED);
  const response=await fetch('/api/journal/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken||''},body:JSON.stringify({...payload,fontFamily:font.value}),signal});
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
