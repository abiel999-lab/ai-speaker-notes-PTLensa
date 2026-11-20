(() => {
  'use strict';

  const body = document.body;
  const authenticatedAtLoad = body.dataset.authenticated === 'true';
  const previewSlides = Number(body.dataset.previewSlides || 5);
  const fileInput = document.querySelector('#home-file');
  const drop = document.querySelector('#home-drop');
  const fileTitle = document.querySelector('#home-file-title');
  const fileMeta = document.querySelector('#home-file-meta');
  const form = document.querySelector('#home-preview-form');
  const generate = document.querySelector('#home-generate');
  const authModal = document.querySelector('#auth-modal');
  const limitModal = document.querySelector('#limit-modal');
  const authFileName = document.querySelector('#auth-file-name');
  const instruction = document.querySelector('#home-instructions');
  const instructionCount = document.querySelector('#home-instructions-count');
  let csrfToken = null;
  let currentFile = null;
  let currentJobId = null;
  let authPopup = null;
  let authPollTimer = null;
  let autoContinueAfterAuth = false;
  let homePlan = null;
  let planRequest = null;
  function loadHomePlan() {
    if (homePlan || planRequest) return;
    planRequest = fetch('/api/v1/account/plan', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(plan => {
        if (!['free', 'pro'].includes(plan?.plan)) return;
        homePlan = plan.plan;
        if (homePlan === "free") window.NotePresoReset?.render(plan.presentation_period_end);
        if (homePlan !== 'pro') return;
        for (const item of document.querySelectorAll('[data-home-plan-copy]')) item.textContent = item.dataset.homePlanCopy;
        for (const item of document.querySelectorAll('[data-home-free-only]')) item.hidden = true;
      })
      .catch(() => {})
      .finally(() => { planRequest = null; });
  }
  if (authenticatedAtLoad) loadHomePlan();

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const formatBytes = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  let activeModal = null;
  let modalReturnFocus = null;
  let previousOverflow = '';
  const backgroundState = new Map();
  function focusable(modal) {
    return Array.from(modal.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(node => node.getClientRects().length && !node.closest('[inert]'));
  }
  function openModal(modal) {
    if (!modal) return;
    if (!activeModal) {
      modalReturnFocus = document.activeElement;
      previousOverflow = document.documentElement.style.overflow;
      Array.from(document.body.children).forEach(node => {
        if (node === authModal || node === limitModal || ['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)) return;
        backgroundState.set(node, node.inert);
        node.inert = true;
      });
    } else if (activeModal !== modal) activeModal.classList.add('hidden');
    activeModal = modal;
    modal.classList.remove('hidden');
    document.documentElement.style.overflow = 'hidden';
    const options = focusable(modal);
    (options.find(node => node.matches('.auth-primary')) || options[0])?.focus();
  }
  function closeModal(modal) {
    modal?.classList.add('hidden');
    if (activeModal !== modal) return;
    activeModal = null;
    backgroundState.forEach((wasInert, node) => { node.inert = wasInert; });
    backgroundState.clear();
    document.documentElement.style.overflow = previousOverflow;
    (modalReturnFocus?.isConnected ? modalReturnFocus : generate)?.focus();
  }
  document.addEventListener('keydown', event => {
    if (!activeModal) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      autoContinueAfterAuth = false;
      closeModal(activeModal);
    } else if (event.key === 'Tab') {
      const nodes = focusable(activeModal), first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !activeModal.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !activeModal.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
  });

  async function authState(){
    try{
      const res = await fetch('/api/v1/auth/me', {headers:{Accept:'application/json'}});
      if(!res.ok) return null;
      const state = await res.json();
      csrfToken = state.csrf_token || null;
      if (state.authenticated) loadHomePlan();
      return state;
    }catch(_){ return null; }
  }

  function apiHeaders(extra={}){
    const headers = {...extra};
    if(csrfToken) headers['X-CSRF-Token'] = csrfToken;
    return headers;
  }

  function chooseFile(file){
    if(!file) return;
    currentFile = file;
    fileTitle.textContent = file.name;
    fileMeta.textContent = `${formatBytes(file.size)} · ready for preview`;
    drop.classList.add('has-file');
    authFileName.textContent = file.name;
  }

  fileInput?.addEventListener('change', () => chooseFile(fileInput.files?.[0]));
  ['dragenter','dragover'].forEach(type => drop?.addEventListener(type, event => {event.preventDefault();drop.classList.add('dragging');}));
  ['dragleave','drop'].forEach(type => drop?.addEventListener(type, event => {event.preventDefault();drop.classList.remove('dragging');}));
  drop?.addEventListener('drop', event => {
    const file=event.dataTransfer?.files?.[0];
    if(!file) return;
    const transfer = new DataTransfer(); transfer.items.add(file); fileInput.files=transfer.files; chooseFile(file);
  });

  instruction?.addEventListener('input', () => {instructionCount.textContent=String(instruction.value.length);});

  function authUrl(mode){
    const route = mode === 'register' ? '/auth/register' : '/auth/login';
    return `${route}?return_to=${encodeURIComponent('/auth/popup-complete')}`;
  }

  function openAuthPopup(mode){
    const width=520,height=720;
    const left=Math.max(0,(window.screen.width-width)/2);
    const top=Math.max(0,(window.screen.height-height)/2);
    authPopup = window.open(authUrl(mode),'notepreso-auth',`popup=yes,width=${width},height=${height},left=${left},top=${top}`);
    if (!authPopup) {
      const fallback = document.querySelector('#auth-popup-fallback');
      const link = fallback.querySelector('a');
      link.href = authUrl(mode);
      link.textContent = mode === 'register' ? 'Create an account in a new tab' : 'Open sign-in in a new tab';
      fallback.querySelector('[role="status"]').textContent = 'Your browser blocked the popup. Open the account page in a new tab, then return here. Your selected file stays on this page.';
      fallback.classList.remove('hidden');
      link.focus();
      return;
    }
    document.querySelector('#auth-popup-fallback')?.classList.add('hidden');
    authPopup.focus();
    if(authPollTimer) window.clearInterval(authPollTimer);
    authPollTimer=window.setInterval(async()=>{
      const state=await authState();
      if(state?.authenticated){
        window.clearInterval(authPollTimer);authPollTimer=null;
        try{if(authPopup&&!authPopup.closed)authPopup.close();}catch(_){}
        closeModal(authModal);
        if(autoContinueAfterAuth){autoContinueAfterAuth=false;await startGeneration();}
      }else if(authPopup?.closed){
        window.clearInterval(authPollTimer);authPollTimer=null;
      }
    },1000);
  }

  document.querySelector('#auth-recheck')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    const state = await authState();
    button.disabled = false;
    if (!state?.authenticated) {
      document.querySelector('#auth-popup-fallback [role="status"]').textContent = 'Sign-in is not finished. Complete it in the other tab and try again.';
      button.focus();
      return;
    }
    document.querySelector('#auth-popup-fallback')?.classList.add('hidden');
    closeModal(authModal);
    if (autoContinueAfterAuth) {
      autoContinueAfterAuth = false;
      await startGeneration();
    }
  });

  document.querySelector('#auth-signin')?.addEventListener('click',()=>openAuthPopup('login'));
  document.querySelector('#auth-register')?.addEventListener('click',()=>openAuthPopup('register'));
  document.querySelectorAll('[data-auth-close]').forEach(node=>node.addEventListener('click',()=>{autoContinueAfterAuth=false;closeModal(authModal);}));
  document.querySelectorAll('[data-limit-close]').forEach(node=>node.addEventListener('click',()=>closeModal(limitModal)));

  window.addEventListener('message', async event => {
    if(event.origin !== window.location.origin || event.data?.type !== 'notepreso:auth-complete') return;
    if(authPopup && !authPopup.closed) authPopup.close();
    const state = await authState();
    if(!state?.authenticated) return;
    closeModal(authModal);
    if(autoContinueAfterAuth){ autoContinueAfterAuth=false; await startGeneration(); }
  });

  function showJob(){ document.querySelector('#home-job')?.classList.remove('hidden'); }
  function setJobProgress(state,title,message,slideProgress=null){
    showJob();
    document.querySelector('#home-job-state').textContent=state;
    document.querySelector('#home-job-title').textContent=title||currentFile?.name||'Presentation';
    document.querySelector('#home-job-message').textContent=message||'';
    document.querySelector('#home-job-count').textContent=slideProgress?.label||'';
    const pct=slideProgress?.percent??(state==='Notes ready'||state==='Preview ready'?100:5);
    document.querySelector('#home-job-bar').style.width=pct+'%';
  }

  async function pollJob(jobId){
    for(;;){
      const res=await fetch(`/api/v1/jobs/${jobId}`,{headers:apiHeaders({Accept:'application/json'})});
      if(res.status===401){ openModal(authModal); return; }
      if(!res.ok) throw new Error('Unable to read presentation status.');
      const job=await res.json();
      const status = job.status === 'completed'
        ? (homePlan === 'pro' ? 'Notes ready' : 'Preview ready')
        : job.status === 'queued' ? 'Waiting to start' : job.status === 'processing' ? 'Processing' : job.status;
      setJobProgress(status, job.original_filename, window.notePresoJobSummary(job), window.notePresoSlideProgress(job));
      if(job.status==='completed'){
        generate.disabled=false;
        document.querySelector('#home-job-result').classList.remove('hidden');
        document.querySelector('#home-job-actions').classList.remove('hidden');
        document.querySelector('#home-job-generated').textContent=String(job.generated_notes_count||0);
        document.querySelector('#home-job-remaining').textContent=String(job.remaining_unprocessed_slides||0);
        const download=document.querySelector('#home-download');
        download.href=job.download_url||`/api/v1/jobs/${job.id}/download`;
        const unlock=document.querySelector('#home-unlock');
        unlock.href=`/pricing?job=${encodeURIComponent(job.id)}`;
        if(Number(job.remaining_unprocessed_slides||0)<=0){
          unlock.textContent='Open workspace →'; unlock.href='/app';
        }
        window.NotePresoNotes?.show(job,document.querySelector('#home-job'));
        sessionStorage.setItem('notepreso.lastPreviewJob',job.id);
        return;
      }
      if(job.status==='failed'){ generate.disabled=false; throw new Error(job.error||'Processing could not finish.'); }
      await sleep(900);
    }
  }

  async function startGeneration(){
    if(generate.disabled)return;
    if(!currentFile){ fileInput?.click(); return; }
    const state=await authState();
    if(!state?.authenticated){
      autoContinueAfterAuth=true;
      openModal(authModal);
      return;
    }
    if(window.NotePresoPreflight&&!(await window.NotePresoPreflight.confirm(form,currentFile)))return;
    generate.disabled=true;
    document.querySelector('#home-job > .notes-preview')?.remove();
    document.querySelector('#home-job-result')?.classList.add('hidden');
    document.querySelector('#home-job-actions')?.classList.add('hidden');
    setJobProgress('Uploading',currentFile.name,'Uploading and validating your PowerPoint…');
    const data=new FormData(form);
    data.set('file',currentFile,currentFile.name);
    const upload=window.NotePresoUpload.indicator(document.querySelector('#home-job-message'));
    let uploadPhase='upload';
    try{
      const res=await window.NotePresoUpload.request('/api/v1/jobs',{headers:apiHeaders({'X-Requested-With':'fetch'}),body:data,timeout:300000},progress=>{
        uploadPhase=progress.phase;
        upload.update(progress);
        setJobProgress(progress.phase==='upload'?'Uploading':'Validating',currentFile.name,
          window.NotePresoUpload.describe(progress,'Upload complete. Validating the PowerPoint before processing…'));
      });
      upload.hide();
      if(res.status===413)throw Error('This file exceeds the upload size limit.');
      if(res.status>=500)throw Error('The server could not confirm this submission. Check your workspace before retrying.');
      let payload={}; try{payload=await res.json();}catch(_){payload={};}
      if(res.status===401){ autoContinueAfterAuth=true; openModal(authModal); return; }
      if(res.status===402){
        generate.disabled=false;

        const detail=(
          payload
          && typeof payload.detail==='object'
        )
          ? payload.detail
          : {};

        const pending=String(detail.job_id||'');
        currentJobId=pending||null;
        if(pending)sessionStorage.setItem('notepreso.pendingJob',pending);
        const href=pending?`/pricing?job=${encodeURIComponent(pending)}&reason=credits`:'/pricing?reason='+encodeURIComponent(detail.code||'limit');
        const limitState=window.NotePresoLimit.home(limitModal,detail,currentFile?.name,href);
        setJobProgress(detail.code==='free_weekly_limit'?'Free limit reached':detail.code==='quota_unavailable'?'Please try again':'Choose a plan',currentFile.name,limitState.message);
        openModal(limitModal);
        return;
      }
      if(!res.ok) throw new Error(payload.detail||'Upload failed.');
      uploadPhase='processing';
      currentJobId=payload.id;
      sessionStorage.setItem('notepreso.pendingJob',payload.id);
      await pollJob(payload.id);
    }catch(error){
      generate.disabled=false;
      setJobProgress((error.phase||uploadPhase)==='upload'?'Upload failed':(error.phase||uploadPhase)==='analysis'?'Validation failed':'Processing failed',
        currentFile.name,error.message||'Something went wrong.');
    }finally{upload.remove();}
  }

  document.querySelector('#limit-retry')?.addEventListener('click',()=>{closeModal(limitModal);void startGeneration();});
  form?.addEventListener('submit',event=>{event.preventDefault();void startGeneration();});

  document.querySelectorAll('[data-scroll-upload]').forEach(node=>node.addEventListener('click',()=>{
    document.querySelector('#try-card')?.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>fileInput?.focus(),500);
  }));

  const header=document.querySelector('#site-header');
  const onScroll=()=>header?.classList.toggle('scrolled',window.scrollY>24);
  onScroll(); window.addEventListener('scroll',onScroll,{passive:true});

  const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('.site-nav');
  menu?.addEventListener('click',()=>{const open=nav.classList.toggle('menu-open');menu.setAttribute('aria-expanded',String(open));});

  const revealObserver='IntersectionObserver' in window?new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');revealObserver.unobserve(entry.target);}});},{threshold:.15}):null;
  document.querySelectorAll('.reveal').forEach(node=>revealObserver?revealObserver.observe(node):node.classList.add('visible'));

  const demoNotes=[
    'Start with the headline result: revenue increased 18.4% year over year. Give the audience a moment to register the scale of the change before moving into the drivers.',
    'Point to the rising bars as evidence of consistent quarterly momentum. Avoid reading every number; emphasize the direction of travel and the strongest period.',
    'Close by connecting revenue growth to the margin improvement. This creates a natural transition into the next slide on regional performance.'
  ];
  let demoIndex=0,demoTimer=null;
  function typeDemo(){
    const note=document.querySelector('#demo-note'),stage=document.querySelector('#demo-stage'),step=document.querySelector('#demo-step'),progress=document.querySelector('#demo-progress'),label=document.querySelector('#demo-progress-label');
    if(!note) return;
    const text=demoNotes[demoIndex%demoNotes.length];
    note.textContent=''; stage.textContent='Generating presentation narrative'; step.textContent='Narrative';
    let i=0;
    const typer=setInterval(()=>{
      i+=2; note.textContent=text.slice(0,i);
      if(i>=text.length){
        clearInterval(typer); stage.textContent='Speaker notes ready'; step.textContent='Ready';
        const slide=4+demoIndex; label.textContent=`Slide ${String(slide).padStart(2,'0')} of 18`; progress.style.width=`${Math.min(88,24+(demoIndex*17)%70)}%`;
        demoIndex++; demoTimer=setTimeout(typeDemo,1900);
      }
    },24);
  }
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches) typeDemo(); else {const n=document.querySelector('#demo-note');if(n)n.textContent=demoNotes[0];}

  if(authenticatedAtLoad) void authState();
})();

