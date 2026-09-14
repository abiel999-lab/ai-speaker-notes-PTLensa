const form=document.querySelector('#job-form');
const submit=document.querySelector('#submit');
const statusBox=document.querySelector('#status');
const statusTitle=document.querySelector('#status-title');
const statusCount=document.querySelector('#status-count');
const statusMessage=document.querySelector('#status-message');
const progressBar=document.querySelector('#progress-bar');
const download=document.querySelector('#download');
const chatResult=document.querySelector('#chat-result');
const notesMode=document.querySelector('#notes-mode');
const engine=document.querySelector('#engine');
const replaceWarning=document.querySelector('#replace-warning');
const resultMetrics=document.querySelector('#result-metrics');
const usageSummary=document.querySelector('#usage-summary');
const warningList=document.querySelector('#warning-list');
const useVision=document.querySelector('#use-vision');
const retry=document.querySelector('#retry');
const noteLength=document.querySelector('#note-length');
const customWordField=document.querySelector('#custom-word-field');
const customWordLimit=document.querySelector('#custom-word-limit');
const customInstructions=document.querySelector('#custom-instructions');
const customInstructionsCount=document.querySelector('#custom-instructions-count');
const fileInput=document.querySelector('#file');
const fileSelected=document.querySelector('#file-selected');
const dropZone=document.querySelector('#drop-zone');
const historyList=document.querySelector('#history-list');
let lastJobId=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function updateModeWarning(){replaceWarning.classList.toggle('hidden',notesMode.value!=='replace_all');}
function updateWordLimitField(){const custom=noteLength.value==='Custom';customWordField.classList.toggle('hidden',!custom);customWordLimit.disabled=!custom;customWordLimit.required=custom;}
function updateCustomInstructionsCount(){customInstructionsCount.textContent=String(customInstructions.value.length);}
notesMode.addEventListener('change',updateModeWarning);noteLength.addEventListener('change',updateWordLimitField);customInstructions.addEventListener('input',updateCustomInstructionsCount);updateModeWarning();updateWordLimitField();updateCustomInstructionsCount();

fileInput.addEventListener('change',()=>{if(fileInput.files?.[0]){fileSelected.textContent=`${t('selected')}: ${fileInput.files[0].name}`;fileSelected.classList.remove('hidden');}});
['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.add('dragging');}));
['dragleave','drop'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.remove('dragging');}));
dropZone.addEventListener('drop',e=>{const files=e.dataTransfer.files;if(files?.length){const dt=new DataTransfer();dt.items.add(files[0]);fileInput.files=dt.files;fileInput.dispatchEvent(new Event('change'));}});

document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{
  const preset=btn.dataset.preset;
  if(preset==='student'){document.querySelector('#audience').value='Mahasiswa';document.querySelector('#depth').value='Medium';noteLength.value='100-250 kata';document.querySelector('#language').value='Bahasa Indonesia';}
  if(preset==='academic'){document.querySelector('#audience').value='Akademisi';document.querySelector('#depth').value='High';noteLength.value='100-250 kata';}
  if(preset==='concise'){document.querySelector('#audience').value='Umum';document.querySelector('#depth').value='Low';noteLength.value='<100 kata';}
  updateWordLimitField();
}));

function metric(label,value){return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;}
function renderResult(job){
  const visual=job.vision_target_count?`${job.vision_rendered_count}/${job.vision_target_count}`:(job.used_vision?'On':'—');
  resultMetrics.innerHTML=[metric('Notes generated',job.generated_notes_count),metric('Existing preserved',job.preserved_existing_notes_count),metric('Visual coverage',visual),metric('Hidden slides',job.hidden_slide_count||0)].join('');
  resultMetrics.classList.remove('hidden');
  const warnings=job.warnings||[];warningList.innerHTML=warnings.map(w=>`<div class="warning-item">⚠ ${escapeHtml(w)}</div>`).join('');warningList.classList.toggle('hidden',!warnings.length);
  if(job.provider==='openai'){
    const cost=Number(job.estimated_cost_usd||0).toFixed(4),preflight=Number(job.preflight_estimated_cost_usd||0).toFixed(4);
    usageSummary.textContent=`${job.model} · ${Number(job.total_tokens||0).toLocaleString()} tokens · ${job.request_count} request(s) · estimated $${cost} (preflight $${preflight})`;
    usageSummary.classList.remove('hidden');
  }else usageSummary.classList.add('hidden');
}
function escapeHtml(v){const d=document.createElement('div');d.textContent=String(v);return d.innerHTML;}

async function poll(jobId){
  for(;;){
    const response=await fetch(`/api/v1/jobs/${jobId}`,{headers:apiHeaders({Accept:'application/json'})});
    if(response.status===401){window.location.href='/login';return;}
    if(!response.ok)throw new Error('Unable to read processing status.');
    const job=await response.json();
    statusTitle.textContent=(job.status||'processing').toUpperCase();statusMessage.textContent=job.error||job.message;statusCount.textContent=job.progress_total?`${job.progress_current}/${job.progress_total}`:'';
    const pct=job.progress_total?(job.progress_current/job.progress_total)*100:5;progressBar.style.width=`${Math.max(5,pct)}%`;
    if(job.status==='completed'){
      retry.classList.add('hidden');renderResult(job);download.href=job.download_url;download.classList.remove('hidden');chatResult.href=`/chat?job=${job.id}`;chatResult.classList.remove('hidden');submit.disabled=false;await loadHistory();return;
    }
    if(job.status==='failed'){submit.disabled=false;retry.classList.remove('hidden');throw new Error(job.error||'Processing failed.');}
    await sleep(750);
  }
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!csrfToken) await authState();
  if(notesMode.value==='replace_all'&&!window.confirm(t('confirmReplace')))return;
  if(engine.value==='openai'&&!window.confirm(t('confirmAI')))return;
  submit.disabled=true;download.classList.add('hidden');chatResult.classList.add('hidden');retry.classList.add('hidden');resultMetrics.classList.add('hidden');usageSummary.classList.add('hidden');warningList.classList.add('hidden');statusBox.classList.remove('hidden');statusTitle.textContent='UPLOADING';statusMessage.textContent=t('uploading');progressBar.style.width='5%';
  try{
    const response=await fetch('/api/v1/jobs',{method:'POST',headers:apiHeaders({'X-Requested-With':'fetch'}),body:new FormData(form)});
    const payload=await response.json();if(response.status===401){window.location.href='/login';return;}if(!response.ok)throw new Error(payload.detail||'Upload failed.');lastJobId=payload.id;await poll(payload.id);
  }catch(error){statusTitle.textContent='FAILED';statusMessage.textContent=error.message;submit.disabled=false;}
});

retry.addEventListener('click',async()=>{
  if(!lastJobId)return;retry.disabled=true;statusTitle.textContent='RETRYING';statusMessage.textContent='Retrying failed job and reusing safe checkpoints…';
  try{const response=await fetch(`/api/v1/jobs/${lastJobId}/retry`,{method:'POST',headers:apiHeaders({'X-Requested-With':'fetch',Accept:'application/json'})});const payload=await response.json();if(!response.ok)throw new Error(payload.detail||'Retry failed.');retry.classList.add('hidden');await poll(lastJobId);}catch(error){statusTitle.textContent='FAILED';statusMessage.textContent=error.message;retry.classList.remove('hidden');}finally{retry.disabled=false;}
});

async function deleteJob(id){
  if(!window.confirm(getLanguage()==='id'?'Hapus job dan file terkait sekarang?':'Delete this job and its files now?'))return;
  const res=await fetch(`/api/v1/jobs/${id}`,{method:'DELETE',headers:apiHeaders({'X-Requested-With':'fetch'})});if(!res.ok&&res.status!==204){let p={};try{p=await res.json();}catch{}alert(p.detail||'Delete failed.');return;}await loadHistory();
}
async function loadHistory(){
  try{const res=await fetch('/api/v1/jobs?limit=8',{headers:apiHeaders({Accept:'application/json'})});if(!res.ok)return;const jobs=await res.json();if(!jobs.length){historyList.innerHTML=`<p class="help">${t('noJobs')}</p>`;return;}historyList.innerHTML=jobs.map(job=>`<div class="history-item"><div><strong>${escapeHtml(job.original_filename)}</strong><small>${escapeHtml(job.status)} · ${new Date(job.updated_at).toLocaleString()}${job.model?` · ${escapeHtml(job.model)}`:''}</small></div><div class="history-actions">${job.status==='completed'?`<a class="btn secondary" href="/chat?job=${job.id}">${t('openChat')}</a>`:''}<button class="danger-btn" type="button" data-delete-job="${job.id}">${t('delete')}</button></div></div>`).join('');historyList.querySelectorAll('[data-delete-job]').forEach(b=>b.addEventListener('click',()=>deleteJob(b.dataset.deleteJob)));}catch{}
}

document.addEventListener('DOMContentLoaded',async()=>{if(await ensureAuth())loadHistory();});
