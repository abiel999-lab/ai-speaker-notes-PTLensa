(()=>{
'use strict';
const csrf=document.querySelector('meta[name="csrf-token"]')?.content||'';
const t=value=>window.adminT?window.adminT(value):value;
const localeTag=window.ADMIN_LOCALE_TAG||'en-US';
const page=document.body.dataset.adminPage||'overview';
const rowsEl=document.querySelector('#user-rows');
const detailEl=document.querySelector('#user-detail');
const searchEl=document.querySelector('#user-search');
const addButton=document.querySelector('#add-user');
const runtimeAlert=document.querySelector('#runtime-alert');
const modal=document.querySelector('#user-modal');
const form=document.querySelector('#user-form');
const managementStatus=document.querySelector('#management-status');
const jobsEl=document.querySelector('#activity-jobs');
const chatsEl=document.querySelector('#activity-chats');
const activityUserSelect=document.querySelector('#activity-user-select');
const activityScopeSummary=document.querySelector('#activity-scope-summary');
const chatAccessModal=document.querySelector('#chat-access-modal');
const chatAccessForm=document.querySelector('#chat-access-form');
const chatContentView=document.querySelector('#chat-content-view');
let users=[];
let selectedId=null;
let managementReady=document.body.dataset.managementReady==='true';

const fmtDate=value=>value?new Intl.DateTimeFormat(localeTag,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
const fmtDateOnly=value=>value?new Intl.DateTimeFormat(localeTag,{dateStyle:'medium'}).format(new Date(value)):'—';
const fmtBytes=value=>{if(value===null||value===undefined)return '—';const units=['B','KB','MB','GB'];let n=Number(value),i=0;while(n>=1024&&i<units.length-1){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${units[i]}`;};
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const providerLabel=value=>{if(!value)return '—';const v=String(value).trim();return v?v.charAt(0).toUpperCase()+v.slice(1):'—';};
const billingStateLabel=value=>({active:t('Paid · Active'),expiring:t('Paid · Expiring'),expired:t('Expired'),pending:t('Payment pending'),past_due:t('Past due'),inactive:t('Inactive'),free:t('Free')})[value]||t('Free');
function billingCountsFromUsers(items=[]){const pro=items.filter(u=>u.plan==='pro').length;return {users:items.length,pro_users:pro,free_users:Math.max(0,items.length-pro),expiring_pro:items.filter(u=>u.billing_state==='expiring').length,expired_subscriptions:items.filter(u=>u.billing_state==='expired').length,pending_payments:items.filter(u=>u.billing_state==='pending').length,past_due_subscriptions:items.filter(u=>u.billing_state==='past_due').length};}
function planBadge(user){const plan=user?.plan==='pro'?'pro':'free';return el('span',`plan-badge ${plan}`,plan==='pro'?t('PRO'):t('FREE'));}

async function api(path,options={}){const {timeoutMs=6000,...fetchOptions}=options;const headers={'Accept':'application/json','X-Requested-With':'fetch',...(fetchOptions.headers||{})};if(fetchOptions.body)headers['Content-Type']='application/json';if(fetchOptions.method&&fetchOptions.method!=='GET')headers['X-CSRF-Token']=csrf;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const res=await fetch(path,{...fetchOptions,headers,signal:controller.signal});let payload={};try{payload=await res.json();}catch{}if(!res.ok)throw new Error(payload.detail||`Request failed (${res.status})`);return payload;}catch(err){if(err?.name==='AbortError')throw new Error(t('Request timed out. Check the database tunnel or Keycloak connection.'));throw err;}finally{clearTimeout(timer);}}

function showAlert(message){if(!runtimeAlert)return;runtimeAlert.textContent=message||'';runtimeAlert.classList.toggle('hidden',!message);}
function setManagementStatus(ready,message=''){if(!managementStatus)return;managementStatus.classList.remove('checking','ready','error');managementStatus.classList.add(ready?'ready':'error');const label=managementStatus.querySelector('span');if(label)label.textContent=ready?t('Keycloak management ready'):(message||t('Keycloak management unavailable'));}
function setStat(id,value){const node=document.querySelector(id);if(node)node.textContent=value??0;}
function setStats(c={}){setStat('#stat-users',c.users??0);setStat('#stat-jobs',c.jobs??0);setStat('#stat-chats',c.chat_threads??0);setStat('#stat-completed',c.completed_jobs??0);setStat('#stat-failed',c.failed_jobs??0);setStat('#stat-banned',c.banned_users??0);setStat('#stat-free-users',c.free_users??0);setStat('#stat-pro-users',c.pro_users??0);setStat('#stat-expiring-pro',c.expiring_pro??0);setStat('#stat-expired-pro',c.expired_subscriptions??0);}

async function refreshManagementStatus(){try{const data=await api('/api/v1/admin/keycloak-status',{timeoutMs:2500});managementReady=!!data.ready;if(addButton)addButton.disabled=!managementReady;setManagementStatus(managementReady,data.error||'');}catch(err){managementReady=false;if(addButton)addButton.disabled=true;setManagementStatus(false,err.message);}}
async function loadSummary(){try{showAlert('');const data=await api('/api/v1/admin/summary');managementReady=!!data.management_ready;if(addButton)addButton.disabled=!managementReady;setStats(data.counts||{});setManagementStatus(managementReady);void refreshManagementStatus();}catch(err){showAlert(err.message);void refreshManagementStatus();}}

function filteredUsers(){if(!searchEl)return users;const q=(searchEl.value||'').trim().toLowerCase();if(!q)return users;return users.filter(u=>[u.display_name,u.username,u.email,u.plan_name,u.billing_provider,u.billing_state].some(v=>(v||'').toLowerCase().includes(q)));}
function renderUsers(){
  if(!rowsEl)return;
  const list=filteredUsers();
  const count=document.querySelector('#user-count');
  if(count)count.textContent=t(`${list.length} of ${users.length} users`);
  rowsEl.replaceChildren();
  if(!list.length){const tr=el('tr');const td=el('td','empty-cell',t('No users found.'));td.colSpan=7;tr.append(td);rowsEl.append(tr);return;}
  for(const u of list){
    const tr=el('tr',u.id===selectedId?'selected':'');
    tr.dataset.id=u.id;
    const userTd=el('td','user-cell');
    userTd.append(el('strong','',u.display_name||u.username),el('span','',`@${u.username}`));
    const planTd=el('td','plan-cell');
    planTd.append(planBadge(u),el('small','',billingStateLabel(u.billing_state)));
    const billingTd=el('td','billing-cell');
    const billingPrimary=u.billing_provider?providerLabel(u.billing_provider):'—';
    let billingSecondary=t('No expiry');
    if(u.valid_until){billingSecondary=`${u.billing_state==='expired'?t('Expired'):t('Valid until')} ${fmtDateOnly(u.valid_until)}`;}
    else if(u.billing_state==='pending'){billingSecondary=t('Awaiting payment');}
    billingTd.append(el('strong','',billingPrimary),el('small','',billingSecondary));
    const statusTd=el('td');
    statusTd.append(el('span',`status-dot ${u.banned?'banned':''}`,u.banned?t('Banned'):t('Active')));
    tr.append(userTd,el('td','',u.email||'—'),planTd,billingTd,statusTd,el('td','',String(u.job_count??0)),el('td','',fmtDate(u.last_login_at)));
    tr.addEventListener('click',()=>selectUser(u.id));
    rowsEl.append(tr);
  }
}

function applyDirectoryData(data,keepSelection=true){users=data.users||[];managementReady=!!data.management_ready;if(addButton)addButton.disabled=!managementReady;const counts={...(data.counts||{}),...billingCountsFromUsers(users)};setStats(counts);if(page==='users'){if(!keepSelection||!users.some(u=>u.id===selectedId)){selectedId=null;showEmptyDetail();}renderUsers();}if(page==='activity')populateActivityUserFilter();}
async function enrichDirectoryFromKeycloak(keepSelection=true){try{const data=await api('/api/v1/admin/users?source=merged',{timeoutMs:3500});applyDirectoryData(data,keepSelection);setManagementStatus(!!data.management_ready,data.management_error||'');if(data.management_error)showAlert(data.management_error);if(page==='users'&&selectedId&&users.some(u=>u.id===selectedId))void selectUser(selectedId,false);}catch(err){setManagementStatus(false,err.message);}}
async function loadDirectorySummary(keepSelection=true,{enrich=true}={}){try{showAlert('');const data=await api('/api/v1/admin/users?source=database',{timeoutMs:4500});applyDirectoryData(data,keepSelection);setManagementStatus(!!data.management_ready);if(page==='users'&&selectedId)void selectUser(selectedId,false);if(enrich&&page==='users')setTimeout(()=>void enrichDirectoryFromKeycloak(keepSelection),120);void refreshManagementStatus();}catch(err){showAlert(err.message);void refreshManagementStatus();if(rowsEl){rowsEl.innerHTML=`<tr><td colspan="7" class="empty-cell">${t('Could not load users.')}</td></tr>`;}}}

function showEmptyDetail(){if(!detailEl)return;detailEl.replaceChildren();const wrap=el('div','admin-empty-detail');const icon=el('span','admin-empty-icon');icon.textContent='◎';wrap.append(icon,el('strong','',t('Select a user')),el('span','',t('User profile, PowerPoint history, and saved chat activity will appear here.')));detailEl.append(wrap);}
function metaBox(label,value){const box=el('div');box.append(el('span','',label),el('strong','',value||'—'));return box;}
function actionButton(text,cls,handler){const b=el('button',`btn ${cls||'secondary'}`,text);b.type='button';b.addEventListener('click',handler);return b;}

function populateActivityUserFilter(){if(!activityUserSelect)return;const requested=new URLSearchParams(window.location.search).get('user')||activityUserSelect.value||'';activityUserSelect.replaceChildren();const all=el('option','','All users · metadata only');all.value='';activityUserSelect.append(all);for(const u of users){const option=el('option','',`${u.display_name||u.username}${u.email?` · ${u.email}`:''}`);option.value=u.id;activityUserSelect.append(option);}if(requested&&users.some(u=>u.id===requested))activityUserSelect.value=requested;updateActivityScopeSummary();}
function selectedActivityUser(){if(!activityUserSelect||!activityUserSelect.value)return null;return users.find(u=>u.id===activityUserSelect.value)||null;}
function updateActivityScopeSummary(){if(!activityScopeSummary)return;const user=selectedActivityUser();activityScopeSummary.replaceChildren();const left=el('div');const avatar=el('span','activity-scope-avatar',(user?.display_name||user?.username||'A').slice(0,1).toUpperCase());const copy=el('div');copy.append(el('small','','Current scope'),el('strong','',user?(user.display_name||user.username):'All users'),el('p','',user?(user.email||`@${user.username}`):'Showing metadata across the application database.'));left.append(avatar,copy);activityScopeSummary.append(left,el('span','activity-scope-lock','Content remains locked until explicitly opened'));}

async function selectUser(id,repaint=true){if(!detailEl)return;selectedId=id;if(repaint)renderUsers();detailEl.replaceChildren(el('div','admin-empty-detail','Loading user…'));try{const data=await api(`/api/v1/admin/users/${encodeURIComponent(id)}`);renderDetail(data.user,data.jobs||[],data.chats||[]);}catch(err){detailEl.replaceChildren();const box=el('div','admin-empty-detail');box.append(el('strong','','Could not load user'),el('span','',err.message));detailEl.append(box);}}

function renderDetail(user,jobs,chats){
  if(!detailEl)return;
  detailEl.replaceChildren();
  const wrap=el('div','detail-content');
  const head=el('div','detail-head');
  const title=el('div');
  title.append(el('h2','',user.display_name||user.username),el('p','',user.email||user.username));
  const badges=el('div','detail-badges');
  badges.append(planBadge(user),el('span',`detail-badge ${user.banned?'banned':''}`,user.banned?t('Banned'):t('Active')));
  head.append(title,badges);
  wrap.append(head);

  const billingPanel=el('div',`billing-summary ${user.plan==='pro'?'pro':'free'}`);
  const billingCopy=el('div');
  billingCopy.append(el('small','',t('ACCOUNT PLAN')),el('strong','',user.plan==='pro'?t('Pro access'):t('Free access')),el('span','',billingStateLabel(user.billing_state)));
  const billingExpiry=el('div','billing-summary-expiry');
  billingExpiry.append(el('small','',t('Valid until')),el('strong','',user.valid_until?fmtDateOnly(user.valid_until):'—'),el('span','',user.billing_provider?providerLabel(user.billing_provider):t('No billing provider')));
  billingPanel.append(billingCopy,billingExpiry);
  wrap.append(billingPanel);

  const actions=el('div','detail-actions');
  if(managementReady){actions.append(actionButton('Edit','secondary',()=>openEdit(user)));actions.append(actionButton(user.banned?'Unban':'Ban','secondary',()=>toggleBan(user)));actions.append(actionButton('Delete user & files','danger-action',()=>deleteUser(user)));}
  wrap.append(actions);

  const messageCount=(chats||[]).reduce((sum,thread)=>sum+(thread.message_count||0),0);
  const meta=el('div','detail-meta');
  meta.append(
    metaBox('Plan',user.plan==='pro'?'PRO':'FREE'),
    metaBox('Billing status',billingStateLabel(user.billing_state)),
    metaBox('Billing provider',providerLabel(user.billing_provider)),
    metaBox('Valid until',user.valid_until?fmtDate(user.valid_until):'—'),
    metaBox('Auto renew',user.auto_renew?t('Yes'):t('No')),
    metaBox('Username',user.username),
    metaBox('Keycloak ID',user.id),
    metaBox('Registered',fmtDate(user.database_created_at||user.keycloak_created_at)),
    metaBox('Last login',fmtDate(user.last_login_at)),
    metaBox('Database record',user.database_record?t('Yes'):t('No')),
    metaBox('Uploaded jobs',String(user.job_count??jobs.length)),
    metaBox('Chat threads',String(chats.length)),
    metaBox('Chat messages',String(messageCount))
  );
  wrap.append(meta);

  const section=el('div','file-section');const sh=el('div','file-section-head');sh.append(el('h3','',t('Uploaded presentations')),el('small','',`${jobs.length} record${jobs.length===1?'':'s'}`));section.append(sh);const list=el('div','file-list');if(!jobs.length){list.append(el('div','admin-empty-detail',t('No uploaded PowerPoint files for this user.')));}else{for(const job of jobs){const item=el('article','file-item');item.append(el('strong','',job.filename));const metaLine=el('div','file-meta');metaLine.append(el('span','',job.status),el('span','',fmtDate(job.created_at)),el('span','',`Job ${job.id}`),el('span','',`Input ${fmtBytes(job.input_bytes)}`));if(job.output_bytes!==null)metaLine.append(el('span','',`Output ${fmtBytes(job.output_bytes)}`));if(job.language)metaLine.append(el('span','',job.language));if(job.model)metaLine.append(el('span','',job.model));if(job.total_tokens)metaLine.append(el('span','',`${job.total_tokens} tokens`));item.append(metaLine);if(job.error)item.append(el('div','file-error',job.error));list.append(item);}}section.append(list);wrap.append(section);
  const chatSection=el('div','file-section chat-section');const ch=el('div','file-section-head');ch.append(el('h3','',t('Saved chat activity')),el('small','',`${chats.length} thread${chats.length===1?'':'s'} · ${messageCount} messages`));chatSection.append(ch);const privacy=el('div','detail-privacy-note');privacy.append(el('strong','',t('Chat content is protected')),el('span','',t('This panel shows metadata only. Open Presentations & chat to request audited conversation access.')));chatSection.append(privacy);const chatList=el('div','chat-admin-list');if(!chats.length){chatList.append(el('div','admin-empty-detail',t('No saved chat activity for this user.')));}else{for(const thread of chats){const card=el('article','chat-admin-thread');const titleRow=el('div','chat-admin-thread-head');titleRow.append(el('strong','',thread.mode==='rag'?t('Presentation chat'):t('General chat')),el('span','',fmtDate(thread.updated_at)));card.append(titleRow);const threadMeta=el('div','file-meta');threadMeta.append(el('span','',`Thread ${thread.id}`));if(thread.job_id)threadMeta.append(el('span','',`Job ${thread.job_id}`));threadMeta.append(el('span','',`${thread.message_count||0} messages`));card.append(threadMeta);chatList.append(card);}const open=actionButton(t('Open activity & privacy controls'),'secondary',()=>{window.location.href=`/admin/activity?user=${encodeURIComponent(user.id)}`;});chatSection.append(open);}chatSection.append(chatList);wrap.append(chatSection);detailEl.append(wrap);
}

function openModal(mode,user=null){if(!modal)return;document.querySelector('#user-modal-title').textContent=mode==='create'?t('Add user'):t('Edit user');document.querySelector('#form-user-id').value=user?.id||'';document.querySelector('#form-username').value=user?.username||'';document.querySelector('#form-email').value=user?.email||'';document.querySelector('#form-first-name').value=user?.first_name||'';document.querySelector('#form-last-name').value=user?.last_name||'';document.querySelector('#form-email-verified').checked=!!user?.email_verified;const create=document.querySelector('#create-password-fields');create.classList.toggle('hidden',mode!=='create');document.querySelector('#form-password').required=mode==='create';document.querySelector('#form-password').value='';document.querySelector('#form-temporary-password').checked=true;document.querySelector('#form-error').classList.add('hidden');modal.dataset.mode=mode;modal.classList.remove('hidden');document.querySelector('#form-username').focus();}
function closeModal(){if(!modal||!form)return;modal.classList.add('hidden');form.reset();}
function openEdit(user){openModal('edit',user);}
async function toggleBan(user){const verb=user.banned?'unban':'ban';if(!confirm(t(`${user.banned?'Unban':'Ban'} ${user.username}?`)))return;try{await api(`/api/v1/admin/users/${encodeURIComponent(user.id)}/${verb}`,{method:'POST'});await loadDirectorySummary();}catch(err){showAlert(err.message);}}
async function deleteUser(user){if(!confirm(t(`Delete ${user.username} from Keycloak and remove this user's stored jobs/files? This cannot be undone.`)))return;try{await api(`/api/v1/admin/users/${encodeURIComponent(user.id)}`,{method:'DELETE'});selectedId=null;showEmptyDetail();await loadDirectorySummary(false);}catch(err){showAlert(err.message);}}

function activityMeta(items){const wrap=el('div','activity-meta');for(const item of items.filter(Boolean))wrap.append(el('span','',item));return wrap;}
function privacyButton(thread){const b=actionButton('View conversation','privacy-action',()=>openChatAccess(thread));const lock=el('span','privacy-lock','🔒');b.prepend(lock);return b;}
function renderActivity(data){setStats(data.counts||{});updateActivityScopeSummary();if(jobsEl){jobsEl.replaceChildren();const jobs=data.jobs||[];if(!jobs.length)jobsEl.append(el('div','activity-empty','No presentation records are available for this user scope.'));for(const job of jobs){const item=el('article','activity-item');const head=el('div','activity-item-head');const copy=el('div');copy.append(el('h4','',job.filename||'Presentation'),el('p','',`${job.owner_name||'Unknown user'}${job.owner_email?` · ${job.owner_email}`:''}`));head.append(copy,el('span',`activity-badge ${job.status||''}`,job.status||'unknown'));item.append(head,activityMeta([fmtDate(job.created_at),job.model,job.language,job.total_tokens?`${job.total_tokens} tokens`:null,job.estimated_cost_usd!==null&&job.estimated_cost_usd!==undefined?`$${Number(job.estimated_cost_usd).toFixed(4)} est.`:null]));jobsEl.append(item);}}
if(chatsEl){chatsEl.replaceChildren();const chats=data.chats||[];if(!chats.length)chatsEl.append(el('div','activity-empty','No saved chat threads are available for this user scope.'));for(const thread of chats){const item=el('article','activity-item chat-metadata-item');const head=el('div','activity-item-head');const copy=el('div');copy.append(el('h4','',thread.mode==='rag'?'Presentation chat':'General chat'),el('p','',`${thread.owner_name||'Unknown user'}${thread.owner_email?` · ${thread.owner_email}`:''}`));head.append(copy,el('span','activity-badge privacy','Metadata only'));item.append(head,activityMeta([fmtDate(thread.updated_at),thread.job_id?`Job ${thread.job_id}`:null,`Thread ${thread.id}`,`${thread.message_count||0} messages`]));const footer=el('div','activity-item-actions');const note=el('span','privacy-inline-note','Content hidden by default');footer.append(note,privacyButton(thread));item.append(footer);chatsEl.append(item);}}}
async function loadActivity(){try{showAlert('');const owner=activityUserSelect?.value||new URLSearchParams(window.location.search).get('user')||'';const path=owner?`/api/v1/admin/activity?owner=${encodeURIComponent(owner)}`:'/api/v1/admin/activity';const data=await api(path,{timeoutMs:5000});if(Array.isArray(data.users)){users=data.users;populateActivityUserFilter();}renderActivity(data);}catch(err){showAlert(err.message);if(jobsEl)jobsEl.innerHTML=`<div class="activity-empty">${t('Could not load presentation activity.')}</div>`;if(chatsEl)chatsEl.innerHTML=`<div class="activity-empty">${t('Could not load chat activity.')}</div>`;}}
function resetChatAccess(){if(!chatAccessModal)return;chatAccessModal.classList.add('hidden');chatAccessForm?.classList.remove('hidden');chatContentView?.classList.add('hidden');chatContentView?.replaceChildren();const form=chatAccessForm;if(form)form.reset();const err=document.querySelector('#chat-access-error');if(err)err.classList.add('hidden');}
function openChatAccess(thread){if(!chatAccessModal||!chatAccessForm)return;document.querySelector('#chat-access-thread-id').value=thread.id;const meta=document.querySelector('#chat-access-thread-meta');if(meta){meta.replaceChildren();meta.append(metaBox('User',thread.owner_name||thread.owner||'Unknown user'),metaBox('Thread',String(thread.id)),metaBox('Messages',String(thread.message_count||0)),metaBox('Last activity',fmtDate(thread.updated_at)));}chatContentView?.replaceChildren();chatContentView?.classList.add('hidden');chatAccessForm.classList.remove('hidden');chatAccessModal.classList.remove('hidden');document.querySelector('#chat-access-reason')?.focus();}
function renderConversation(data){if(!chatContentView)return;chatContentView.replaceChildren();const top=el('div','chat-content-audit');top.append(el('strong','','Access recorded'),el('span','',`${data.access?.reason_label||'Authorized access'} · This view has been written to the audit log.`));chatContentView.append(top);const messages=el('div','audited-message-list');for(const msg of data.thread?.messages||[]){const card=el('article',`audited-message ${msg.role==='assistant'?'assistant':''}`);const head=el('div','audited-message-head');head.append(el('strong','',msg.role==='assistant'?'AI assistant':'User'),el('span','',fmtDate(msg.created_at)));card.append(head,el('p','',msg.content||''));messages.append(card);}if(!(data.thread?.messages||[]).length)messages.append(el('div','activity-empty','This thread contains no messages.'));chatContentView.append(messages,actionButton('Close conversation','secondary',resetChatAccess));}


if(searchEl)searchEl.addEventListener('input',renderUsers);
if(addButton)addButton.addEventListener('click',()=>openModal('create'));
if(modal){document.querySelector('#modal-close')?.addEventListener('click',closeModal);document.querySelector('#modal-cancel')?.addEventListener('click',closeModal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.classList.contains('hidden'))closeModal();});}
if(form)form.addEventListener('submit',async event=>{event.preventDefault();const error=document.querySelector('#form-error');error.classList.add('hidden');const mode=modal.dataset.mode;const body={username:document.querySelector('#form-username').value.trim(),email:document.querySelector('#form-email').value.trim()||null,first_name:document.querySelector('#form-first-name').value.trim()||null,last_name:document.querySelector('#form-last-name').value.trim()||null,email_verified:document.querySelector('#form-email-verified').checked};if(mode==='create'){body.password=document.querySelector('#form-password').value;body.temporary_password=document.querySelector('#form-temporary-password').checked;}const submit=document.querySelector('#form-submit');submit.disabled=true;try{if(mode==='create'){const data=await api('/api/v1/admin/users',{method:'POST',body:JSON.stringify(body)});selectedId=data.user.id;}else{const id=document.querySelector('#form-user-id').value;await api(`/api/v1/admin/users/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(body)});selectedId=id;}closeModal();await loadDirectorySummary();}catch(err){error.textContent=err.message;error.classList.remove('hidden');}finally{submit.disabled=false;}});

if(activityUserSelect)activityUserSelect.addEventListener('change',async()=>{const user=activityUserSelect.value;const url=new URL(window.location.href);if(user)url.searchParams.set('user',user);else url.searchParams.delete('user');window.history.replaceState({},'',url);updateActivityScopeSummary();await loadActivity();});
if(chatAccessModal){document.querySelector('#chat-access-close')?.addEventListener('click',resetChatAccess);document.querySelector('#chat-access-cancel')?.addEventListener('click',resetChatAccess);chatAccessModal.addEventListener('click',e=>{if(e.target===chatAccessModal)resetChatAccess();});}
if(chatAccessForm)chatAccessForm.addEventListener('submit',async event=>{event.preventDefault();const error=document.querySelector('#chat-access-error');error.classList.add('hidden');const threadId=document.querySelector('#chat-access-thread-id').value;const reason=document.querySelector('#chat-access-reason').value;const note=document.querySelector('#chat-access-note').value.trim();const submit=document.querySelector('#chat-access-submit');submit.disabled=true;try{const data=await api(`/api/v1/admin/chat-threads/${encodeURIComponent(threadId)}/reveal`,{method:'POST',body:JSON.stringify({reason,note:note||null})});chatAccessForm.classList.add('hidden');chatContentView.classList.remove('hidden');renderConversation(data);}catch(err){error.textContent=err.message;error.classList.remove('hidden');}finally{submit.disabled=false;}});

(async()=>{if(page==='overview'){await loadSummary();return;}if(page==='activity'){await loadActivity();void refreshManagementStatus();return;}await loadDirectorySummary(false,{enrich:true});})();

/* NOTEPRESO_ADMIN_AUTOSYNC_V2 */

let adminAutoSyncBusy = false;

async function syncOverviewFromKeycloak() {
  try {
    /*
     * Calling the merged directory performs the safe
     * Keycloak -> application reconciliation first.
     */
    const merged = await api(
      '/api/v1/admin/users?source=merged',
      {timeoutMs: 5000}
    );

    /*
     * Operational KPIs remain sourced from PostgreSQL.
     */
    const summary = await api(
      '/api/v1/admin/summary',
      {timeoutMs: 4500}
    );

    const mergedUsers = Array.isArray(merged.users)
      ? merged.users
      : [];

    const counts = {
      ...(summary.counts || {})
    };

    /*
     * Identity KPIs use the merged Keycloak view so
     * Overview and User Management always agree.
     */
    counts.users = mergedUsers.length;

    counts.banned_users = mergedUsers.filter(
      user => !!user.banned
    ).length;

    Object.assign(counts, billingCountsFromUsers(mergedUsers));

    setStats(counts);

    managementReady = !!merged.management_ready;

    setManagementStatus(
      managementReady,
      merged.management_error || ''
    );

    if (merged.management_error) {
      showAlert(merged.management_error);
    } else {
      showAlert('');
    }

    void refreshManagementStatus();

  } catch (err) {
    console.warn(
      'Overview Keycloak sync failed:',
      err
    );

    /*
     * Fail safe:
     * keep showing database KPIs rather than blanking
     * the dashboard when Keycloak is temporarily down.
     */
    await loadSummary();
  }
}

async function runAdminAutoSync() {
  if (
    adminAutoSyncBusy ||
    document.hidden
  ) {
    return;
  }

  if (
    page !== 'users' &&
    page !== 'overview'
  ) {
    return;
  }

  adminAutoSyncBusy = true;

  try {
    if (page === 'users') {
      await enrichDirectoryFromKeycloak(true);
    }

    if (page === 'overview') {
      await syncOverviewFromKeycloak();
    }
  } catch (err) {
    console.warn(
      'Admin auto-sync failed:',
      err
    );
  } finally {
    adminAutoSyncBusy = false;
  }
}

if (
  page === 'users' ||
  page === 'overview'
) {
  /*
   * Initial live sync shortly after the fast
   * database-first page render.
   */
  window.setTimeout(
    () => void runAdminAutoSync(),
    1200
  );

  /*
   * Keep the active admin page fresh.
   */
  window.setInterval(
    () => void runAdminAutoSync(),
    30000
  );

  /*
   * Refresh immediately when returning to the tab.
   */
  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        void runAdminAutoSync();
      }
    }
  );
}


})();
