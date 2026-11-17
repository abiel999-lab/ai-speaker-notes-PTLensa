(() => {
  'use strict';
  const authenticatedAtLoad=document.body.dataset.authenticated==='true';
  const authModal=document.querySelector('#pricing-auth-modal');
  const checkoutButton=document.querySelector('#pro-checkout');
  const topupButtons=[
    ...document.querySelectorAll('[data-topup-product]')
  ];
  const providerButtons=[...document.querySelectorAll('.provider-button')];

  const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('.site-nav');
  menu?.addEventListener('click',()=>{const open=nav.classList.toggle('menu-open');menu.setAttribute('aria-expanded',String(open));});
  let selectedProvider=providerButtons[0]?.dataset.provider||'';
  let csrfToken=null;

  function money(button){
    const currency=String(button.dataset.currency||'').toUpperCase();
    let price=Number(button.dataset.price||0);
    if(button.dataset.minor==='true') price/=100;
    if(!currency||!price) return 'Price unavailable';
    const digits=currency==='IDR'?0:2;
    return new Intl.NumberFormat(currency==='IDR'?'id-ID':'en-US',{style:'currency',currency,maximumFractionDigits:digits}).format(price);
  }
  providerButtons.forEach((button,index)=>{
    button.querySelector('[data-price-output]').textContent=money(button);
    if(index===0) button.classList.add('selected');
    button.addEventListener('click',()=>{
      selectedProvider=button.dataset.provider||'';
      providerButtons.forEach(item=>item.classList.toggle('selected',item===button));
      updatePrimaryPrice(button);
    });
  });
  function updatePrimaryPrice(button){
    // Customer-facing plan pricing is fixed at $10/month.
    // Provider buttons only select the secure checkout processor.
    if(!button) return;
  }
  updatePrimaryPrice(providerButtons[0]);

  async function authState(){
    try{const res=await fetch('/api/v1/auth/me',{headers:{Accept:'application/json'}});if(!res.ok)return null;const data=await res.json();csrfToken=data.csrf_token||null;return data;}catch(_){return null;}
  }
  let actionNoticeTarget=null;
  function openAuth(){
    window.NotePresoDialog.open(authModal, document.querySelector('#pricing-signin'), actionNoticeTarget);
  }
  function closeAuth(){window.NotePresoDialog.close(authModal);}
  document.querySelectorAll('[data-pricing-auth-close]').forEach(node=>node.addEventListener('click',closeAuth));
  document.querySelector('#pricing-signin')?.addEventListener('click',()=>{window.location.href=`/auth/login?return_to=${encodeURIComponent('/pricing')}`;});
  document.querySelector('#pricing-register')?.addEventListener('click',()=>{window.location.href=`/auth/register?return_to=${encodeURIComponent('/pricing')}`;});

  const checkoutUnavailable=Boolean(checkoutButton?.disabled);
  const topupUnavailable=new Map(topupButtons.map(button=>[button,button.disabled]));
  let pricingPlan=null;
  let verifiedJob=null;
  function pendingJob(){
    const raw=new URL(location.href).searchParams.get('job')||sessionStorage.getItem('notepreso.pendingJob')||sessionStorage.getItem('notepreso.lastPreviewJob')||'';
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw))return '';
    return raw.toLowerCase();
  }
  const jobId=pendingJob();
  function activePro(plan){return plan?.plan==='pro'&&plan?.credits?.active===true;}
  async function readPlan(){
    try{const res=await fetch('/api/v1/account/plan',{headers:{Accept:'application/json'},cache:'no-store'});if(!res.ok)return null;const data=await res.json();return ['free','pro'].includes(data?.plan)&&typeof data?.credits?.active==='boolean'?data:null;}catch(_){return null;}
  }
  async function renderPricingState(){
    const state=await authState();
    if(!state){if(checkoutButton)checkoutButton.disabled=true;topupButtons.forEach(b=>b.disabled=true);document.querySelector('#plan-action-note').textContent='Unable to confirm your account. Refresh to try again.';return;}
    pricingPlan=state.authenticated?await readPlan():null;
    const pro=activePro(pricingPlan);
    if(checkoutButton){
      checkoutButton.textContent=pro?'Current plan':state.authenticated?'Subscribe to Pro →':'Sign in to subscribe →';
      checkoutButton.disabled=pro||checkoutUnavailable||(state.authenticated&&!pricingPlan);
    }
    providerButtons.forEach(b=>{b.hidden=pro;});
    const providerList=document.querySelector('#provider-list');
    if(providerList){providerList.hidden=pro;providerList.classList.toggle('single-provider',providerButtons.length===1);if(providerButtons.length===1&&!providerList.querySelector('.provider-explanation')){const note=document.createElement('p');note.className='provider-explanation';note.textContent='Secure checkout with Paddle.';providerList.append(note);}}
    document.querySelector('#manage-current-plan').hidden=!pro;
    document.querySelector('#plan-action-note').textContent=pro?'Pro is active. Your subscription is shared across both apps.':state.authenticated&&!pricingPlan?'Unable to confirm your plan. Refresh to try again.':'';
    const freeLink=document.querySelector('.free-card .price-secondary');
    if(state.authenticated&&freeLink){freeLink.href='/app';freeLink.textContent='Open workspace →';}
    topupButtons.forEach(b=>{
      const amount=b.dataset.topupProduct.split('_')[1];
      b.disabled=Boolean(topupUnavailable.get(b))||(state.authenticated&&!pro);
      b.textContent=pro?'Buy '+amount+' AI Credits →':state.authenticated?'Requires active Pro':'Sign in to buy '+amount+' AI Credits →';
      let note=b.parentElement.querySelector('.topup-requirement');
      if(!note){note=document.createElement('p');note.className='topup-requirement';b.after(note);}
      note.textContent=pro?'One-time purchase. Added to your shared AI Credits balance.':state.authenticated?'Credit top-ups require an active Pro subscription.':'An active Pro subscription is required for credit top-ups.';
    });
    if (pricingPlan?.plan === 'free') window.NotePresoReset?.render(pricingPlan.presentation_period_end);
    return state;
  }

  async function checkout(product='pro', triggerButton=null){
    actionNoticeTarget=triggerButton||checkoutButton;
    const state=await authState();

    if(!state?.authenticated){
      // Preserve the chosen product/provider across Keycloak sign-in.
      sessionStorage.setItem('notepreso.checkoutIntent',product);
      sessionStorage.setItem('notepreso.checkoutProvider',selectedProvider);
      window.location.assign('/auth/login?return_to=/pricing');
      return;
    }

    if(product==='pro'){
      const current=await readPlan();
      if(!current){showNotice('Unable to verify your plan. Refresh before starting checkout.','error');return;}
      if(activePro(current)){await renderPricingState();return;}
    }

    if(!selectedProvider){
      showNotice('Checkout is currently unavailable. Please contact Support.','error');
      return;
    }

    const isTopup=String(product).startsWith('topup_');
    const button=isTopup?triggerButton:checkoutButton;

    if(isTopup){
      try{
        const planRes=await fetch('/api/v1/account/plan',{
          headers:{Accept:'application/json'}
        });

        if(!planRes.ok){
          throw new Error('Unable to verify your Pro subscription.');
        }

        const plan=await planRes.json();

        sessionStorage.setItem(
          'notepreso.topupBefore',
          String(
            Number(
              plan.credits?.topup
              ?? plan.credits?.stored_topup
              ?? 0
            )
          )
        );

        if(plan.plan!=='pro'||plan.credits?.active!==true){
          showNotice('An active Pro subscription is required before buying a credit top-up.','error');
          return;
        }
      }catch(err){
        showNotice(err.message||'Unable to verify your Pro subscription.','error');
        return;
      }
    }

    if(button) button.disabled=true;

    try{
      const res=await fetch('/api/v1/billing/checkout',{
        method:'POST',
        headers:{
          Accept:'application/json',
          'Content-Type':'application/json',
          'X-Requested-With':'fetch',
          'X-CSRF-Token':csrfToken||''
        },
        body:JSON.stringify({
          provider:selectedProvider,
          product
        })
      });

      const raw=await res.text();
      let data={};

      try{
        data=raw?JSON.parse(raw):{};
      }catch(_){
        data={detail:raw};
      }

      if(res.status===401){
        if(button)button.disabled=false;
        openAuth();
        return;
      }

      if(!res.ok){
        throw new Error(data.detail||'Unable to start checkout.');
      }

      sessionStorage.setItem(
        'notepreso.pendingBillingProduct',
        product
      );

      try{if(product==='pro')window.NotePresoAnalytics?.checkout(data.reference_id);}catch{}
      window.location.href=data.checkout_url;
    }catch(err){
      showNotice(err.message||'Unable to start checkout.','error');
      if(button) button.disabled=false;
    }
  }

  checkoutButton?.addEventListener(
    'click',
    ()=>void checkout('pro',checkoutButton)
  );

  topupButtons.forEach(button=>{
    button.addEventListener(
      'click',
      ()=>void checkout(
        button.dataset.topupProduct||'',
        button
      )
    );
  });

  function showNotice(message,kind='success'){
    if(actionNoticeTarget){
      let inline=actionNoticeTarget.parentElement.querySelector('.checkout-inline-notice');
      if(!inline){inline=document.createElement('p');inline.className='checkout-inline-notice pricing-action-note';inline.setAttribute('role','status');actionNoticeTarget.after(inline);}
      inline.textContent=message;
    }
    const node=document.querySelector('#billing-notice');if(!node)return;node.textContent=message;node.className=`billing-notice ${kind==='error'?'error':''}`.trim();node.classList.remove('hidden');
  }

  async function waitForPro(){
    for(let i=0;i<12;i++){
      const res=await fetch('/api/v1/account/plan',{headers:{Accept:'application/json'}});
      if(res.status===401) return false;
      if(res.ok){const plan=await res.json();if(plan.plan==='pro')return true;}
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    return false;
  }
  async function waitForTopup(previousTopup){
    for(let i=0;i<15;i++){
      const res=await fetch(
        '/api/v1/account/plan',
        {headers:{Accept:'application/json'}}
      );

      if(res.status===401) return false;

      if(res.ok){
        const plan=await res.json();

        const current=Number(
          plan.credits?.topup
          ?? plan.credits?.stored_topup
          ?? 0
        );

        if(current>previousTopup){
          return current;
        }
      }

      await new Promise(
        resolve=>setTimeout(resolve,2000)
      );
    }

    return false;
  }

  async function continuePreview(job){
    actionNoticeTarget=document.querySelector('#continue-now');
    if(!job) return false;
    const state=await authState();if(!state?.authenticated)return false;
    const button=document.querySelector('#continue-now');
    if(button) button.disabled=true;
    try{
      let endpoint=`/api/v1/jobs/${job}/continue`;

      const stateRes=await fetch(
        `/api/v1/jobs/${job}`,
        {
          headers:{
            Accept:'application/json',
            'X-Requested-With':'fetch'
          }
        }
      );

      if(stateRes.ok){
        const state=await stateRes.json();

        if(
          state.status==='failed'
          && Number(state.credit_required||0)>0
          && state.preview_limited!==true
        ){
          endpoint=`/api/v1/jobs/${job}/retry`;
        }
      }

      const res=await fetch(
        endpoint,
        {
          method:'POST',
          headers:{
            Accept:'application/json',
            'X-Requested-With':'fetch',
            'X-CSRF-Token':csrfToken||''
          }
        }
      );
      let data={};try{data=await res.json();}catch(_){data={};}
      if(res.ok){sessionStorage.removeItem('notepreso.pendingJob');showNotice('Pro is active. Your full presentation has been queued and will continue in the workspace.');document.querySelector('#continue-status-label').textContent='Full presentation queued';document.querySelector('#continue-open-app').href='/app';button?.classList.add('hidden');return true;}
      if(res.status===409){sessionStorage.removeItem('notepreso.pendingJob');showNotice('Pro is active. This presentation is already configured for full processing.');document.querySelector('#continue-status-label').textContent='Full presentation already unlocked';button?.classList.add('hidden');return true;}
      if(res.status===402){showNotice('This presentation still needs an active Pro plan and enough AI Credits to continue.','error');return false;}
      throw new Error(data.detail||'Unable to continue this presentation.');
    }catch(err){showNotice(err.message||'Unable to continue this presentation.','error');return false;}
    finally{if(button)button.disabled=false;}
  }

  async function resumePendingIfPro(){
    if(!jobId)return;
    const state=await authState();if(!state?.authenticated)return;
    document.querySelector('#continue-card').hidden=false;
    const label=document.querySelector('#continue-status-label'),name=document.querySelector('#continue-job-name');
    try{
      const res=await fetch('/api/v1/jobs/'+encodeURIComponent(jobId),{headers:{Accept:'application/json'},cache:'no-store'});
      if(!res.ok){label.textContent='Preview unavailable for this account. Open Workspace to select a deck.';return;}
      const job=await res.json();
      if(String(job.id).toLowerCase()!==jobId)throw Error('Unexpected presentation');
      verifiedJob=job;sessionStorage.setItem('notepreso.pendingJob',jobId);
      const banner=document.querySelector('#deck-context');
      banner.hidden=false;document.querySelector('#deck-context-name').textContent=job.original_filename||'Your presentation';
      name.textContent=job.original_filename||'Your presentation';
      const remaining=Number(job.remaining_unprocessed_slides);
      const generated=Number(job.generated_notes_count);
      const ready=job.status==='completed'&&job.preview_limited===true&&Number.isFinite(remaining)&&remaining>0;
      document.querySelector('#deck-context-status').textContent=ready?'YOUR PREVIEW IS READY':'YOUR PRESENTATION';
      document.querySelector('#deck-context-summary').textContent=ready
        ? (Number.isFinite(generated)?generated+' speaker notes generated · ':'')+remaining+' slides remaining. Continue the same deck after Pro is active; no re-upload needed.'
        : 'Open Workspace to view the current processing status.';
      const download=document.querySelector('#deck-context-download');
      if(job.download_url==='/api/v1/jobs/'+jobId+'/download'){download.href=job.download_url;download.hidden=false;}
      const plan=await readPlan();pricingPlan=plan;
      label.textContent=ready?(activePro(plan)?'Pro is active. Continue the remaining slides below.':'Your preview is saved. Pro is required to continue.'):'Check this presentation in Workspace.';
      const button=document.querySelector('#continue-now');
      if(ready&&activePro(plan)&&button){button.classList.remove('hidden');button.textContent='Continue '+remaining+' remaining slides →';button.onclick=()=>void continuePreview(jobId);}
    }catch(_){label.textContent='Unable to load your preview. Refresh or open Workspace.';}
  }
  async function handleReturn(){
    const url=new URL(window.location.href);const billing=url.searchParams.get('billing');if(billing!=='success'&&billing!=='cancelled')return;
    url.searchParams.delete('billing');history.replaceState({},'',url.pathname+url.search+url.hash);
    const product=sessionStorage.getItem(
      'notepreso.pendingBillingProduct'
    )||'pro';

    if(billing==='cancelled'){
      sessionStorage.removeItem(
        'notepreso.pendingBillingProduct'
      );
      showNotice(
        'Checkout was canceled. Your current plan and credit balance have not changed.',
        'error'
      );
      return;
    }

    if(product.startsWith('topup_')){
      const previousTopup=Number(
        sessionStorage.getItem(
          'notepreso.topupBefore'
        )||'0'
      );

      showNotice(
        'Payment submitted. Waiting for Paddle to confirm your top-up credits…'
      );

      const currentTopup=await waitForTopup(
        previousTopup
      );

      if(currentTopup===false){
        showNotice(
          'Payment was submitted, but the new credits have not been confirmed yet. Refresh this page in a moment.',
          'error'
        );
        return;
      }

      sessionStorage.removeItem(
        'notepreso.pendingBillingProduct'
      );
      sessionStorage.removeItem(
        'notepreso.topupBefore'
      );

      showNotice(
        `Top-up confirmed. Your stored top-up balance is now ${Number(currentTopup).toLocaleString()} credits.`
      );

      await renderPricingState();

      return;
    }

    showNotice(
      'Payment submitted. Waiting for the provider to confirm Pro access…'
    );

    const active=await waitForPro();

    if(!active){
      showNotice(
        'Payment was submitted, but Pro has not been confirmed yet. Refresh this page in a moment if the provider is still processing the payment.',
        'error'
      );
      return;
    }

    sessionStorage.removeItem(
      'notepreso.pendingBillingProduct'
    );

    showNotice(
      'Pro is active. Continue your saved preview below when ready.'
    );
  }

  async function resumeCheckoutAfterLogin(){
    const product=sessionStorage.getItem('notepreso.checkoutIntent');
    if(!product || !['pro','topup_250','topup_500','topup_750'].includes(product)) return;
    const state=await authState();
    if(!state?.authenticated) return;
    const preferred=sessionStorage.getItem('notepreso.checkoutProvider');
    sessionStorage.removeItem('notepreso.checkoutIntent');
    sessionStorage.removeItem('notepreso.checkoutProvider');
    if(preferred && providerButtons.some(button=>button.dataset.provider===preferred)){
      selectedProvider=preferred;
      providerButtons.forEach(button=>button.classList.toggle('selected',button.dataset.provider===preferred));
    }
    const button=product==='pro'?checkoutButton:
      topupButtons.find(element=>element.dataset.topupProduct===product);
    await checkout(product,button||null);
  }

  void renderPricingState().then(()=>handleReturn()).then(()=>renderPricingState()).then(()=>resumePendingIfPro()).then(()=>resumeCheckoutAfterLogin());
})();

