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
  function openAuth(){authModal?.classList.remove('hidden');document.documentElement.style.overflow='hidden';}
  function closeAuth(){authModal?.classList.add('hidden');document.documentElement.style.overflow='';}
  document.querySelectorAll('[data-pricing-auth-close]').forEach(node=>node.addEventListener('click',closeAuth));
  document.querySelector('#pricing-signin')?.addEventListener('click',()=>{window.location.href=`/auth/login?return_to=${encodeURIComponent('/pricing')}`;});
  document.querySelector('#pricing-register')?.addEventListener('click',()=>{window.location.href=`/auth/register?return_to=${encodeURIComponent('/pricing')}`;});

  function pendingJob(){
    const fromUrl=new URL(window.location.href).searchParams.get('job');
    if(fromUrl){sessionStorage.setItem('notepreso.pendingJob',fromUrl);return fromUrl;}
    return sessionStorage.getItem('notepreso.pendingJob')||sessionStorage.getItem('notepreso.lastPreviewJob')||'';
  }
  const jobId=pendingJob();
  if(jobId){
    document.querySelector('#continue-status-label').textContent='Preview ready to continue after Pro activation';
    document.querySelector('#continue-job-name').textContent=`Presentation job ${jobId.slice(0,8)}…`;
  }

  async function checkout(product='pro', triggerButton=null){
    const state=await authState();

    if(!state?.authenticated){
      // Preserve the chosen product/provider across Keycloak sign-in.
      sessionStorage.setItem('notepreso.checkoutIntent',product);
      sessionStorage.setItem('notepreso.checkoutProvider',selectedProvider);
      window.location.assign('/auth/login?return_to=/pricing');
      return;
    }

    if(!selectedProvider){
      window.alert('No payment provider is currently available.');
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
      if(res.status===402){showNotice('This presentation still needs an active Pro plan and enough AI Slide Credits to continue.','error');return false;}
      throw new Error(data.detail||'Unable to continue this presentation.');
    }catch(err){showNotice(err.message||'Unable to continue this presentation.','error');return false;}
    finally{if(button)button.disabled=false;}
  }

  async function resumePendingIfPro(){
    if(!jobId) return;
    const state=await authState();
    if(!state?.authenticated) return;
    const button=document.querySelector('#continue-now');
    if(button){button.classList.remove('hidden');button.addEventListener('click',()=>void continuePreview(jobId),{once:false});}
    try{
      const res=await fetch('/api/v1/account/plan',{headers:{Accept:'application/json'}});
      if(!res.ok)return;
      const plan=await res.json();
      if(plan.plan==='pro') await continuePreview(jobId);
    }catch(_){/* manual button remains available */}
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

      if(jobId){
        await continuePreview(jobId);
      }

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
      'Pro is active. Preparing your pending presentation…'
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

  if(authenticatedAtLoad) void authState();
  void handleReturn().then(()=>resumePendingIfPro()).then(()=>resumeCheckoutAfterLogin());
})();
