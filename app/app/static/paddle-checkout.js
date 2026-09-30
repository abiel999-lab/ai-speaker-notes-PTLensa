(()=>{
  const body=document.body;
  const env=String(body?.dataset.paddleEnvironment||'production').toLowerCase();
  const token=String(body?.dataset.paddleClientToken||'');
  const returnUrl=String(body?.dataset.returnUrl||'/');
  const status=document.querySelector('#paddle-checkout-status');
  const transactionId=new URLSearchParams(window.location.search).get('_ptxn')||'';

  function setStatus(message){if(status) status.textContent=message;}

  window.addEventListener('load',()=>{
    if(!window.Paddle||!token){
      setStatus('Paddle Checkout could not be initialized.');
      return;
    }
    if(!transactionId.startsWith('txn_')){
      setStatus('Paddle transaction is missing or invalid.');
      return;
    }

    try{
      if(env==='sandbox') window.Paddle.Environment.set('sandbox');

      window.Paddle.Initialize({
        token,
        eventCallback:(event)=>{
          if(event?.name==='checkout.completed'){
            setStatus('Payment submitted. Waiting for secure confirmation…');
            window.setTimeout(()=>{window.location.assign(returnUrl);},1200);
          }
          if(event?.name==='checkout.closed'){
            setStatus('Checkout closed. You can return to NotePreso and try again.');
          }
        }
      });

      setStatus('Secure Paddle Checkout');

      window.Paddle.Checkout.open({
        transactionId,
        settings:{
          displayMode:'inline',
          variant:'one-page',
          frameTarget:'paddle-inline-checkout',
          frameInitialHeight:'720',
          frameStyle:'width:100%;min-width:312px;background-color:transparent;border:none;',
          theme:'light',
          locale:'en',
          successUrl:returnUrl
        }
      });
    }catch(error){
      console.error('Paddle checkout init failed',error);
      setStatus('Paddle Checkout could not be opened.');
    }
  });
})();
