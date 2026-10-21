(()=>{
  'use strict';
  const body=document.body;
  const env=String(body?.dataset.paddleEnvironment||'production').toLowerCase();
  const token=String(body?.dataset.paddleClientToken||'');
  const returnUrl=String(body?.dataset.returnUrl||'/app?billing=success');
  const status=document.querySelector('#paddle-checkout-status');
  const transactionId=new URLSearchParams(window.location.search).get('_ptxn')||'';
  const product=sessionStorage.getItem('notepreso.pendingBillingProduct')||'pro';
  const names={pro:'NotePreso Pro',topup_250:'250 AI Slide Credits',
    topup_500:'500 AI Slide Credits',topup_750:'750 AI Slide Credits'};
  const title=document.querySelector('.paddle-checkout-card h1');
  if(title) title.textContent=names[product]||'NotePreso Checkout';
  let completed=false;
  function setStatus(message){if(status) status.textContent=message;}
  const sleep=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));

  async function confirmAndReturn(){
    if(completed) return;
    completed=true;
    setStatus('Payment submitted. Verifying your credits automatically…');
    const product=sessionStorage.getItem('notepreso.pendingBillingProduct')||'pro';
    const isTopup=product.startsWith('topup_');
    const beforeRaw=sessionStorage.getItem('notepreso.topupBefore');
    const before=beforeRaw!==null?Number(beforeRaw):null;
    // Account status is trusted only from NotePreso's authenticated backend.
    // Never grant Pro or credits based only on a browser checkout event.
    for(let n=0;n<45;n++){
      try{
        const response=await fetch('/api/v1/account/plan',{
          headers:{Accept:'application/json'},cache:'no-store',credentials:'same-origin'
        });
        if(response.status===401){
          window.location.assign('/auth/login?return_to=/app');
          return;
        }
        if(response.ok){
          const plan=await response.json();
          const topup=Number(plan?.credits?.topup??plan?.credits?.stored_topup??0);
          const confirmed=isTopup
            ? plan?.plan==='pro'&&before!==null&&topup>before
            : plan?.plan==='pro'&&plan?.credits?.active===true;
          if(confirmed){
            window.location.replace('/app?billing=success');
            return;
          }
        }
      }catch(_){ /* Retry after transient network errors. */ }
      await sleep(2000);
    }
    // Still return to the app: it keeps refreshing without falsely claiming
    // the credit was granted while the payment remains unconfirmed.
    window.location.replace('/app?billing=success');
  }

  window.addEventListener('load',()=>{
    if(!window.Paddle||!token){setStatus('Paddle Checkout could not be initialized.');return;}
    if(!/^txn_[a-zA-Z0-9]+$/.test(transactionId)){
      setStatus('Paddle transaction is missing or invalid.');return;
    }
    try{
      if(env==='sandbox') window.Paddle.Environment.set('sandbox');
      window.Paddle.Initialize({token,eventCallback:event=>{
        if(event?.name==='checkout.completed') void confirmAndReturn();
        if(event?.name==='checkout.closed'&&!completed)
          setStatus('Checkout closed. You can return to NotePreso and try again.');
      }});
      setStatus('Secure Paddle Checkout');
      window.Paddle.Checkout.open({
        transactionId,
        settings:{
          displayMode:'inline',variant:'one-page',
          frameTarget:'paddle-inline-checkout',
          frameInitialHeight:'720',
          frameStyle:'width:100%;min-width:312px;background-color:transparent;border:none;',
          theme:'light',locale:'en',successUrl:returnUrl
        }
      });
    }catch(error){
      console.error('Paddle checkout init failed',error);
      setStatus('Paddle Checkout could not be opened.');
    }
  });
})();
