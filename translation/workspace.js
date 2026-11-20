'use strict';
const $=s=>document.querySelector(s),form=$('#form'),file=$('#file'),source=$('#source'),target=$('#target'),fit=$('#fit'),legacy=$('#legacy'),downloads=$('#downloads'),statusEl=$('#status'),submit=$('#submit'),retry=$('#retry');
async function loadLanguages(){const {languages}=await api('/api/languages');for(const lang of languages){source.add(new Option(lang==='auto'?'Detect automatically':lang,lang));if(lang!=='auto')target.add(new Option(lang,lang));}target.value='Indonesian';summary();}
let csrf='',job=null,polling=false;
// A new visit starts clean; saved translations remain available in Recent jobs.
try{localStorage.removeItem('np.translation.job');}catch(_){}
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
function message(text,title='READY'){
 const isFailure=['FAILED','RECOVERED','NEEDS REVIEW','CHECK STATUS','SIGN IN','PRO REQUIRED','RECONNECTING','UPLOAD ERROR','VALIDATION FAILED'].includes(title);
 const section=$('#job-status');section.hidden=false;section.classList.toggle('job-error',isFailure);
 statusEl.setAttribute('role',isFailure?'alert':'status');statusEl.textContent=text;$('#status-title').textContent=title;
 if(isFailure&&title!=='RECONNECTING')section.scrollIntoView({block:'nearest'});
}
function summary(){ $('#generation-summary').textContent=`Translate slides and speaker notes into ${target.value}. 1 AI Credit per slide. Your source file stays unchanged.`; }
target.addEventListener('change',summary);
file.addEventListener('change',()=>{legacy.closest('label').hidden=!file.files[0]?.name.toLowerCase().endsWith('.ppt');$('#file-label').textContent=file.files[0]?`${file.files[0].name} · ${(file.files[0].size/1048576).toFixed(1)} MB`:'Your original file stays unchanged.';});
async function api(url,options={},onProgress){
 const headers={...(options.headers||{}),...(options.method==='POST'?{'X-CSRF-Token':csrf}:{})};
 const r=onProgress
  ? await window.NotePresoUpload.request(url,{...options,headers,timeout:300000},onProgress)
  : await fetch(url,{...options,headers,signal:AbortSignal.timeout(30000)});
 if(r.status===413){const error=Error('The file limit is 100 MB.');error.status=413;throw error;}
 let d;try{d=await r.json();}catch{const e=Error('The response could not be confirmed. Your saved job can be reopened.');e.status=r.status;throw e;}
 if(!r.ok){const e=Error(typeof d.detail==='string'?d.detail:'The request could not be completed. Check the saved job before retrying.');e.status=r.status;throw e;}return d;
}
async function refreshHistory(){try{
 const d=await api('/api/jobs');const list=$('#history-list');list.replaceChildren();
 if(!d.jobs.length){const p=document.createElement('p');p.className='help';p.textContent='No translation jobs yet.';list.append(p);}
 for(const row of d.jobs){const item=document.createElement('article');item.className='history-item';const info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=row.filename||'PowerPoint';detail.textContent=`${row.status} · ${row.target} · ${row.slides} slides${row.created_at?' · '+new Date(row.created_at*1000).toLocaleString():''}`;info.append(name,detail);const actions=document.createElement('div');actions.className='history-actions';const view=document.createElement('button');view.type='button';view.className='secondary';view.textContent=row.status==='failed'?'View / retry':'View job';view.addEventListener('click',()=>{job=row.id;downloads.replaceChildren();retry.hidden=true;void poll();$('#job-status').scrollIntoView({block:'center',behavior:'smooth'});});actions.append(view);if(row.status==='completed'){const a=document.createElement('a');a.className='download';a.textContent='Download PPTX';a.href='/api/jobs/'+row.id+'/result';actions.append(a);}item.append(info,actions);list.append(item);}
 }catch(e){$('#history-list').textContent=e.message;}}
async function refreshAccount(){try{const d=await api('/api/account');$('#account').textContent=`${d.account.plan_name} · ${d.account.credits.total} AI Credits available`;$('#balance').textContent=d.account.credits.total;$('#plan-name').textContent=d.account.plan_name;if(d.account.plan!=='pro'){submit.disabled=true;location.replace('/');}window.dispatchEvent(new CustomEvent('np-session-updated'));}catch(e){$('#account').textContent=e.message;}}
async function poll(){
 if(polling||!job)return;polling=true;let failures=0;
 try{while(job){try{
  const current=job,d=await api('/api/jobs/'+current);if(current!==job)continue;failures=0;
  message(['failed','recovered','needs_review'].includes(d.status)?d.message+' Job '+current:d.message,(d.status||'processing').replaceAll('_',' ').toUpperCase());$('#status-count').textContent=d.total_segments?`${d.completed_segments||0} / ${d.total_segments} segments`:'';$('#progress-bar').style.width=d.status==='completed'?'100%':d.total_segments?`${Math.min(95,100*(d.completed_segments||0)/d.total_segments)}%`:'5%';
  if(d.status==='recovered'){
   downloads.replaceChildren();
   for(const [label,suffix] of [['Download recovery PPTX','recovery'],['Review unfinished content','recovery-report']]){
    const link=document.createElement('a');link.className='download';link.textContent=label;link.href='/api/jobs/'+current+'/'+suffix;downloads.append(link);
   }
   retry.hidden=false;submit.disabled=false;await Promise.all([refreshAccount(),refreshHistory()]);break;
  }
  if(d.status==='completed'){downloads.replaceChildren();for(const [label,suffix,cls]of [['Download result PPTX','result','download'],['Review report','report','btn secondary']]){const a=document.createElement('a');a.className=cls;a.textContent=label;a.href='/api/jobs/'+job+'/'+suffix;downloads.append(a);}submit.disabled=false;await Promise.all([refreshAccount(),refreshHistory()]);break;}
  if(['failed','needs_review'].includes(d.status)){retry.hidden=d.status!=='failed';submit.disabled=false;await Promise.all([refreshAccount(),refreshHistory()]);break;}
 }catch(e){if(e.status===401){message('Sign in again to view your job. Processing continues on the server.','SIGN IN');$('#login').hidden=false;break;}if(e.status===403){message(e.message,'PRO REQUIRED');submit.disabled=true;break;}if(e.status===404){job=null;message('The saved job is not available on this account. Choose a file to start a new job.');submit.disabled=false;break;}message('Connection interrupted. Reconnecting to your saved job…','RECONNECTING');failures++;}
 await new Promise(r=>setTimeout(r,Math.min(30000,1500*2**Math.min(failures,4))));}}finally{polling=false;}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();const f=file.files[0];if(!f)return;if(f.size>100*1024*1024){message('The file limit is 100 MB.','UPLOAD ERROR');return;}if(f.name.toLowerCase().endsWith('.ppt')&&!legacy.checked){message('Allow legacy PPT conversion in settings, or save the file as PPTX in PowerPoint first.','UPLOAD ERROR');return;}
 if(!/\.(ppt|pptx|ppsx|potx)$/i.test(f.name)){message('Choose a PPTX, PPSX, POTX, or legacy PPT file. Convert PDFs to PowerPoint in Presentation first.','UPLOAD ERROR');return;}
 if(!confirm('Translate this presentation using 1 shared NotePreso AI Credit per slide? Speaker notes are included.'))return;
 submit.disabled=true;retry.hidden=true;downloads.replaceChildren();message('Preparing upload…','UPLOADING');const id=crypto.randomUUID();
 const upload=window.NotePresoUpload.indicator(statusEl);
 let phase='upload';
 $('#status-count').textContent='';
 $('#progress-bar').style.width='0%';
 try{const q=new URLSearchParams({filename:f.name,job_id:id,source:source.value,target:target.value,fit:fit.value,allow_legacy:legacy.checked});await api('/api/jobs?'+q,{method:'POST',body:f},progress=>{
   phase=progress.phase;
   upload.update(progress);
   message(window.NotePresoUpload.describe(progress,'Upload complete. Validating the PowerPoint and preparing translation…'),phase==='upload'?'UPLOADING':'VALIDATING');
  });upload.hide();job=id;await refreshHistory();await poll();}
 catch(err){
  upload.hide();
  const failedPhase=err.phase||phase;
  message(err.message,failedPhase==='upload'||err.status===413?'UPLOAD ERROR':'VALIDATION FAILED');
  submit.disabled=false;
  if(failedPhase==='analysis'&&!err.status)try{await api('/api/jobs/'+id);job=id;await poll();}catch{}
 }finally{upload.remove();}
});
retry.addEventListener('click',async()=>{try{retry.hidden=true;message('Resuming your saved job…','RESUMING');await api('/api/jobs/'+job+'/retry',{method:'POST'});await poll();}catch(e){message(e.message,'CHECK STATUS');retry.hidden=false;}});
(async()=>{submit.disabled=true;try{
 if(location.hash.startsWith('#ticket=')){const ticket=location.hash.slice(8);history.replaceState(null,'',location.pathname);await api('/api/auth/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});}
 const session=await api('/api/session');if(!session.authenticated){return;}csrf=session.csrf_token;$('#login').hidden=true;submit.disabled=false;await loadLanguages();await Promise.all([refreshAccount(),refreshHistory()]);
 }catch(e){message(e.message,'SIGN IN');}})();
