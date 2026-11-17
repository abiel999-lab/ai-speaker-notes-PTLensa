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

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const formatBytes = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  function openModal(modal){ modal?.classList.remove('hidden'); document.documentElement.style.overflow='hidden'; }
  function closeModal(modal){ modal?.classList.add('hidden'); if(authModal?.classList.contains('hidden') && limitModal?.classList.contains('hidden')) document.documentElement.style.overflow=''; }

  async function authState(){
    try{
      const res = await fetch('/api/v1/auth/me', {headers:{Accept:'application/json'}});
      if(!res.ok) return null;
      const state = await res.json();
      csrfToken = state.csrf_token || null;
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
    if(!authPopup){ window.location.href = `${mode==='register'?'/auth/register':'/auth/login'}?return_to=${encodeURIComponent('/app')}`; return; }
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

  document.querySelector('#auth-signin')?.addEventListener('click',()=>openAuthPopup('login'));
  document.querySelector('#auth-register')?.addEventListener('click',()=>openAuthPopup('register'));
  document.querySelectorAll('[data-auth-close]').forEach(node=>node.addEventListener('click',()=>closeModal(authModal)));
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
  function setJobProgress(state,title,message,current,total){
    showJob();
    document.querySelector('#home-job-state').textContent=state;
    document.querySelector('#home-job-title').textContent=title||currentFile?.name||'Presentation';
    document.querySelector('#home-job-message').textContent=message||'';
    document.querySelector('#home-job-count').textContent=total?`${current}/${total}`:'';
    const pct=total?Math.max(5,Math.min(100,(current/total)*100)):5;
    document.querySelector('#home-job-bar').style.width=`${pct}%`;
  }

  async function pollJob(jobId){
    for(;;){
      const res=await fetch(`/api/v1/jobs/${jobId}`,{headers:apiHeaders({Accept:'application/json'})});
      if(res.status===401){ openModal(authModal); return; }
      if(!res.ok) throw new Error('Unable to read presentation status.');
      const job=await res.json();
      setJobProgress(job.status==='completed'?'Preview ready':job.status,job.original_filename,job.error||job.message,job.progress_current,job.progress_total);
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
        sessionStorage.setItem('notepreso.lastPreviewJob',job.id);
        return;
      }
      if(job.status==='failed'){ generate.disabled=false; throw new Error(job.error||'Processing could not finish.'); }
      await sleep(900);
    }
  }

  async function startGeneration(){
    if(!currentFile){ fileInput?.click(); return; }
    const state=await authState();
    if(!state?.authenticated){
      autoContinueAfterAuth=true;
      openModal(authModal);
      return;
    }
    generate.disabled=true;
    document.querySelector('#home-job-result')?.classList.add('hidden');
    document.querySelector('#home-job-actions')?.classList.add('hidden');
    setJobProgress('Uploading',currentFile.name,'Uploading and validating your PowerPoint…',0,0);
    const data=new FormData(form);
    data.set('file',currentFile,currentFile.name);
    try{
      const res=await fetch('/api/v1/jobs',{method:'POST',headers:apiHeaders({'X-Requested-With':'fetch'}),body:data});
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

        if(pending){
          currentJobId=pending;
          sessionStorage.setItem(
            'notepreso.pendingJob',
            pending
          );
        }

        document.querySelector('#limit-pricing').href=currentJobId
          ? `/pricing?job=${encodeURIComponent(currentJobId)}&reason=credits`
          : '/pricing?reason=limit';

        openModal(limitModal);
        return;
      }
      if(!res.ok) throw new Error(payload.detail||'Upload failed.');
      currentJobId=payload.id;
      sessionStorage.setItem('notepreso.pendingJob',payload.id);
      await pollJob(payload.id);
    }catch(error){
      generate.disabled=false;
      setJobProgress('Could not process',currentFile.name,error.message||'Something went wrong.',0,0);
    }
  }

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
