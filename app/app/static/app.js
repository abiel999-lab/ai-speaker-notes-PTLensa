const form=document.querySelector('#job-form');
const submit=document.querySelector('#submit');
const statusBox=document.querySelector('#status');
const statusTitle=document.querySelector('#status-title');
const statusCount=document.querySelector('#status-count');
const statusMessage=document.querySelector('#status-message');
function showNotesStatus(message, failed=false) {
  statusBox.classList.toggle('np-job-error',failed);
  statusMessage.setAttribute('role',failed?'alert':'status');
  statusMessage.textContent=message;
  if(failed){statusBox.classList.remove('hidden');statusBox.scrollIntoView({block:'nearest'});}
}
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
const upgradeResult=document.querySelector('#upgrade-result');
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
let lastRenderedJob=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function updateModeWarning(){replaceWarning.classList.toggle('hidden',notesMode.value!=='replace_all');}
function updateWordLimitField(){const custom=noteLength.value==='Custom';customWordField.classList.toggle('hidden',!custom);customWordLimit.disabled=!custom;customWordLimit.required=custom;}
function instructionWordCount(value){return value.trim()?value.trim().split(/\s+/u).length:0;}
function updateCustomInstructionsCount(){const count=instructionWordCount(customInstructions.value);customInstructionsCount.textContent=String(count);customInstructions.setCustomValidity(count>5000?'Use 5000 words or fewer':'');}
notesMode.addEventListener('change',updateModeWarning);noteLength.addEventListener('change',updateWordLimitField);customInstructions.addEventListener('input',updateCustomInstructionsCount);updateModeWarning();updateWordLimitField();updateCustomInstructionsCount();

fileInput.addEventListener('change', () => {
  const selected = fileInput.files?.[0];
  fileSelected.classList.toggle('hidden', !selected);
  fileSelected.textContent = selected ? `${t('selected')}: ${selected.name}` : '';
});
['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.add('dragging');}));
['dragleave','drop'].forEach(type=>dropZone.addEventListener(type,e=>{e.preventDefault();dropZone.classList.remove('dragging');}));
dropZone.addEventListener('drop',e=>{const files=e.dataTransfer.files;if(files?.length){const dt=new DataTransfer();dt.items.add(files[0]);fileInput.files=dt.files;fileInput.dispatchEvent(new Event('change'));}});

document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{
  const preset=btn.dataset.preset;
  if(preset==='student'){document.querySelector('#audience').value='Mahasiswa';document.querySelector('#depth').value='Medium';noteLength.value='100-250 kata';}
  if(preset==='academic'){document.querySelector('#audience').value='Akademisi';document.querySelector('#depth').value='High';noteLength.value='100-250 kata';}
  if(preset==='concise'){document.querySelector('#audience').value='Umum';document.querySelector('#depth').value='Low';noteLength.value='<100 kata';}
  updateWordLimitField();
}));

function metric(label,value){return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;}
function localizedStatus(value){const key=String(value||'processing').toLowerCase();return t(key)||key;}
function renderResult(job){
    const verify = document.querySelector('#preview-email-verify');
    verify?.classList.toggle('hidden', !job.can_verify_email);
    if(verify && job.can_verify_email) verify.href = `/auth/verify-preview-email?job_id=${encodeURIComponent(job.id)}&origin=workspace`;
  lastRenderedJob=job;
  resultMetrics.innerHTML=[metric(t('notesGenerated'),Number(job.generated_notes_count)||0),metric(t('existingPreserved'),Number(job.preserved_existing_notes_count)||0)].join('');
  resultMetrics.classList.remove('hidden');
  const warnings=job.warnings||[];warningList.innerHTML=warnings.map(w=>`<div class="warning-item">Warning:  ${escapeHtml(w)}</div>`).join('');warningList.classList.toggle('hidden',!warnings.length);
  usageSummary.textContent='';
  usageSummary.classList.add('hidden');
}
function escapeHtml(v){const d=document.createElement('div');d.textContent=String(v);return d.innerHTML;}

async function poll(jobId){
  sessionStorage.setItem('np.activeNotesJob',jobId);
  let reconnectAttempt=0;
  for(;;){
    let response,job;
    try{
      response=await fetch(`/api/v1/jobs/${jobId}`,{headers:apiHeaders({Accept:'application/json'}),signal:AbortSignal.timeout(30000)});
      if([408,429,500,502,503,504].includes(response.status))throw new Error('TEMPORARY_STATUS');
      if(response.ok)job=await response.json();
      reconnectAttempt=0;
    }catch(error){
      statusTitle.textContent='RECONNECTING';
      statusMessage.textContent='Connection interrupted. Your job remains on the server. Reconnecting without starting it again…';
      await sleep(Math.min(30000,1000*2**Math.min(++reconnectAttempt,5)));continue;
    }
    if(response.status===401){window.location.href='/auth/login?return_to=/app';return;}
    if(response.status===404)sessionStorage.removeItem('np.activeNotesJob');
    if(!response.ok)throw new Error('Unable to read processing status.');
    statusTitle.textContent=localizedStatus(job.status).toUpperCase();showNotesStatus(window.notePresoJobSummary(job));statusCount.textContent=window.notePresoSlideProgress(job)?.label||'';
    const pct=job.status==='completed'?100:window.notePresoSlideProgress(job)?.percent??5;progressBar.style.width=`${Math.max(5,pct)}%`;
    if(job.status==='completed'){
      sessionStorage.removeItem('np.activeNotesJob');
      retry.classList.add('hidden');renderResult(job);window.NotePresoNotes?.show(job,document.querySelector('#status'));download.href=job.download_url;download.classList.remove('hidden');chatResult.href=`/chat?job=${job.id}`;chatResult.classList.remove('hidden');if(job.preview_limited&&Number(job.remaining_unprocessed_slides||0)>0){upgradeResult.href=`/pricing?job=${job.id}`;upgradeResult.textContent=`Unlock ${job.remaining_unprocessed_slides} remaining slide${Number(job.remaining_unprocessed_slides)===1?'':'s'}`;upgradeResult.classList.remove('hidden');sessionStorage.setItem('notepreso.pendingJob',job.id);}else{upgradeResult.classList.add('hidden');}submit.disabled=false;await loadHistory();return;
    }
    if(job.status==='failed'){sessionStorage.removeItem('np.activeNotesJob');submit.disabled=false;retry.classList.remove('hidden');throw new Error((job.error||'Processing failed.')+' Job '+job.id);}
    await sleep(750);
  }
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(submit.disabled || referenceLoading)return;
  updateCustomInstructionsCount();if(!customInstructions.reportValidity())return;
  window.NotePresoLimit.clearWorkspace();
  if(!csrfToken) await authState();
  if(window.NotePresoPreflight&&!(await window.NotePresoPreflight.confirm(form,fileInput.files?.[0])))return;
  if (submit.disabled || referenceLoading) return;
  statusBox.querySelector(':scope > .notes-preview')?.remove();
  document.querySelector('#preview-email-verify')?.classList.add('hidden');
  submit.disabled=true;download.classList.add('hidden');chatResult.classList.add('hidden');retry.classList.add('hidden');upgradeResult.classList.add('hidden');resultMetrics.classList.add('hidden');usageSummary.classList.add('hidden');warningList.classList.add('hidden');statusBox.classList.remove('hidden');statusTitle.textContent=t('uploadingLabel');showNotesStatus(t('uploading'));progressBar.style.width='5%';
  let upload;
  let uploadPhase='upload';
  try{
    if (!window.NotePresoUpload) throw Error('Upload tools did not load. Refresh this page and try again.');
    upload = window.NotePresoUpload.indicator(statusMessage);
    const response=await window.NotePresoUpload.request('/api/v1/jobs',{headers:apiHeaders({'X-Requested-With':'fetch'}),body:new FormData(form),timeout:300000},progress=>{
      uploadPhase=progress.phase;
      upload.update(progress);
      progressBar.style.width='0%';
      statusTitle.textContent=progress.phase==='upload'?t('uploadingLabel'):'VALIDATING';
      showNotesStatus(window.NotePresoUpload.describe(progress,'Upload complete. Validating the PowerPoint before processing…'));
    });
    upload.hide();
    if(response.status===413)throw Error('This file exceeds the upload size limit.');
    if(response.status>=500)throw Error('The server could not confirm this submission. Check Recent jobs before retrying.');

    const payload=await response.json();if(response.status===401){window.location.href='/auth/login?return_to=/app';return;}if(response.status===402){const detail=(payload&&typeof payload.detail==='object')?payload.detail:{};if(window.NotePresoLimit.workspace(detail,fileInput.files?.[0]?.name,form)){submit.disabled=false;if(window.loadAccountPlan)void window.loadAccountPlan();return;}const pending=String(detail.job_id||'');if(pending){sessionStorage.setItem('notepreso.pendingJob',pending);window.location.href=`/pricing?job=${encodeURIComponent(pending)}&reason=credits`;return;}window.location.href='/pricing?reason=limit';return;}if(!response.ok)throw new Error(payload.detail||'Upload failed.');lastJobId=payload.id;if(window.loadAccountPlan)void window.loadAccountPlan();uploadPhase='processing';await poll(payload.id);
  }catch(error){statusTitle.textContent=(error.phase||uploadPhase)==='upload'?'UPLOAD FAILED':(error.phase||uploadPhase)==='analysis'?'VALIDATION FAILED':t('failed').toUpperCase();showNotesStatus(error.message,true);submit.disabled=false;if(window.loadAccountPlan)void window.loadAccountPlan();}
  finally{upload?.remove();}
});

retry.addEventListener('click',async()=>{
  if(!lastJobId||retry.disabled)return;submit.disabled=true;retry.disabled=true;statusBox.querySelector(':scope > .notes-preview')?.remove();statusTitle.textContent=t('retryingLabel');showNotesStatus(t('retrying'));
  try{const response=await fetch(`/api/v1/jobs/${lastJobId}/retry`,{method:'POST',headers:apiHeaders({'X-Requested-With':'fetch',Accept:'application/json'})});const payload=await response.json();if(!response.ok)throw new Error(payload.detail||'Retry failed.');retry.classList.add('hidden');await poll(lastJobId);}catch(error){statusTitle.textContent=t('failed').toUpperCase();showNotesStatus(error.message,true);submit.disabled=false;retry.classList.remove('hidden');}finally{retry.disabled=false;}
});

async function deleteJob(id){
  if(!window.confirm(getLanguage()==='id'?'Delete job dan file terkait sekarang?':'Delete this job and its files now?'))return;
  const res=await fetch(`/api/v1/jobs/${id}`,{method:'DELETE',headers:apiHeaders({'X-Requested-With':'fetch'})});if(!res.ok&&res.status!==204){let p={};try{p=await res.json();}catch{}alert(p.detail||'Delete failed.');return;}await loadHistory();
}
async function loadHistory(){
  try{const res=await fetch('/api/v1/jobs?limit=8',{headers:apiHeaders({Accept:'application/json'})});if(!res.ok)return;const jobs=await res.json();if(!jobs.length){historyList.innerHTML=`<p class="help">${t('noJobs')}</p>`;return;}historyList.innerHTML=jobs.map(job=>`<div class="history-item"><div><strong>${escapeHtml(job.original_filename)}</strong><small>${escapeHtml(job.status)} | ${new Date(job.updated_at).toLocaleString()}${job.model?` | ${escapeHtml(job.model)}`:''}</small></div><div class="history-actions">${job.status==='completed'?`<a class="btn primary history-download-btn" href="${job.download_url || `/api/v1/jobs/${job.id}/download`}">${t('download')}</a><a class="btn secondary" href="/chat?job=${job.id}">${t('openChat')}</a>`:job.status==='failed'?`<button class="btn secondary" type="button" data-retry-job="${job.id}">Retry saved job</button>`:''}<button class="danger-btn" type="button" data-delete-job="${job.id}">${t('delete')}</button></div></div>`).join('');historyList.querySelectorAll('[data-retry-job]').forEach(b=>b.addEventListener('click',()=>{if(submit.disabled||retry.disabled)return;lastJobId=b.dataset.retryJob;statusBox.classList.remove('hidden');retry.click();}));historyList.querySelectorAll('[data-delete-job]').forEach(b=>b.addEventListener('click',()=>deleteJob(b.dataset.deleteJob)));}catch{}
}

document.addEventListener('DOMContentLoaded',async()=>{if(await ensureAuth())loadHistory();});

document.addEventListener('asn:languagechange',()=>{ if(lastRenderedJob) renderResult(lastRenderedJob); loadHistory(); });


// Check reference text before processing the presentation.
const referenceInput = document.querySelector('#reference-document');
const referenceStatus = document.querySelector('#reference-error');
const referenceMessages = {
  DOCUMENT_TEXT_LIMIT: 'This document contains more than 120,000 characters. Split it or upload the sections you need.',
  DOCUMENT_SIZE_LIMIT: 'Choose a non-empty reference document up to 10 MB.',
  DOCUMENT_ENCODING: 'Save the text or Markdown file as UTF-8 and try again.',
  DOCUMENT_PAGE_LIMIT: 'Choose a reference PDF with up to 80 pages.',
  DOCUMENT_HAS_NO_SELECTABLE_TEXT: 'No selectable text was found. Run OCR on a scanned PDF first.',
  PDF_PASSWORD_REQUIRED: 'Unlock the PDF before uploading it.',
};
let referenceLoading = false;
referenceInput?.addEventListener('change', async () => {
  if (referenceLoading) return;
  const review = document.querySelector('#reference-review');
  const preview = document.querySelector('#reference-preview');
  const selected = referenceInput.files[0];
  review.hidden = true;
  preview.value = '';
  referenceStatus.textContent = '';
  if (!selected) return;
  referenceLoading = true;
  referenceInput.disabled = true;
  let indicator;
  let invalid = false;
  try {
    if (selected.size === 0 || selected.size > 10 * 1024 * 1024) {
      invalid = true;
      throw Error(referenceMessages.DOCUMENT_SIZE_LIMIT);
    }
    referenceStatus.setAttribute('role', 'status');
    referenceStatus.textContent = 'Checking your account before uploading the reference…';
    if (!csrfToken) await authState();
    const body = new FormData();
    body.append('file', selected);
    indicator = window.NotePresoUpload.indicator(referenceStatus);
    const response = await window.NotePresoUpload.request('/api/v1/documents/extract', {
      headers: apiHeaders({'X-Requested-With': 'fetch'}), body, timeout: 180000,
    }, progress => {
      indicator.update(progress);
      referenceStatus.textContent = window.NotePresoUpload.describe(progress, 'Upload complete. Extracting reference text…');
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      invalid = [400, 413, 415, 422].includes(response.status);
      throw Error(referenceMessages[data?.detail] ?? 'The reference could not be read. Check the file or try again.');
    }
    if (typeof data?.text !== 'string') throw Error('The server did not return reference text. Try again.');
    preview.value = data.text;
    review.hidden = false;
    referenceStatus.textContent = 'Reference text is ready to review.';
  } catch (error) {
    if (invalid) referenceInput.value = '';
    referenceStatus.setAttribute('role', 'alert');
    referenceStatus.textContent = error.message;
  } finally {
    indicator?.remove();
    referenceInput.disabled = false;
    referenceLoading = false;
    if (invalid) referenceInput.dispatchEvent(new Event('notepreso:reference-invalid'));
  }
});

// Resume status polling after reauthentication or a browser reload. Never repeat POST /jobs here.
{const resume=()=>{const active=sessionStorage.getItem('np.activeNotesJob');if(active&&/^[0-9a-f-]{36}$/i.test(active)){lastJobId=active;statusBox.classList.remove('hidden');submit.disabled=true;void poll(active).catch(error=>{submit.disabled=false;showNotesStatus(error.message,true);});}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',resume,{once:true});else resume();}
