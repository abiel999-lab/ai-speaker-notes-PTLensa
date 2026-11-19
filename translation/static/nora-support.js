/* NotePreso Nora adapter. No account, payment, or document data is forwarded. */
(() => {
  'use strict';
  const script = document.currentScript;
  const preview = script?.dataset.preview === 'true' && ['localhost','127.0.0.1'].includes(location.hostname);
  const hosts=['notepreso.com','www.notepreso.com','presentation.notepreso.com','translation.notepreso.com'];
  if ((!preview && !hosts.includes(location.hostname)) || window.__npNora) return;
  if (/^\/(auth|login|admin|api|docs|redoc|realms)(\/|$)/.test(location.pathname)) return;
  window.__npNora = true;
  const root = document.createElement('section'); root.id='np-nora'; root.setAttribute('aria-label','NotePreso support');
  root.innerHTML=`<button id="np-nora-launch" type="button" aria-expanded="false" aria-controls="np-nora-panel">Chatbot Support</button>
  <section id="np-nora-panel" hidden aria-labelledby="np-nora-title"><button id="np-nora-close" type="button" aria-label="Close support notice">×</button><h2 id="np-nora-title">Nora | NotePreso Support</h2><p>Chat with our AI assistant or request human support. By starting, you agree to share your messages with Cekat.AI. Please don’t share sensitive information. <a href="https://notepreso.com/legal#support-chat">Privacy details</a>.</p><label><input type="checkbox" id="np-nora-consent"> I agree to connect to Cekat.AI for support.</label><button type="button" id="np-nora-start" disabled>Start chat</button><p id="np-nora-status" role="status"></p><p><a href="https://notepreso.com/support">Contact support instead</a></p></section>`;
  document.body.append(root);
  const launcher=root.querySelector('#np-nora-launch'), panel=root.querySelector('#np-nora-panel'), start=root.querySelector('#np-nora-start'), status=root.querySelector('#np-nora-status');
  let loading=false, loaded=false, failed=false, timer;
  launcher.addEventListener('click',()=>{panel.hidden=!panel.hidden; launcher.setAttribute('aria-expanded',String(!panel.hidden)); if(!panel.hidden)root.querySelector('#np-nora-close').focus();});
  function close(){panel.hidden=true;launcher.setAttribute('aria-expanded','false');launcher.focus();}
  root.querySelector('#np-nora-close').addEventListener('click',close);
  root.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  root.querySelector('#np-nora-consent').addEventListener('change',e=>{start.disabled=!e.target.checked||loading;});
  // Validate the vendor's legacy toggle event before its own listener receives it.
  window.addEventListener('message',e=>{if(e.data?.action==='toggleChat' && (e.origin!=='https://live.cekat.ai'||e.source!==document.getElementById('iframe1')?.contentWindow))e.stopImmediatePropagation();});
  function fail(){clearTimeout(timer);loading=false;failed=true;document.getElementById('iframe2-chat-container')?.remove();start.disabled=true;status.textContent='Chat could not be loaded. Please use Contact support instead, or reload this page to try again.';}
  start.addEventListener('click',()=>{
    if(loading||loaded||!root.querySelector('#np-nora-consent').checked)return;
    if(window.mychat||document.getElementById('iframe1')){fail();return;}
    loading=true;start.disabled=true;status.textContent='Connecting to Nora…';
    // Official embed: positive offsetX places launcher on right; bottom-left opens toward left.
    window.mychat={server:'https://live.cekat.ai/widget.js',iframeWidth:'440px',iframeHeight:'calc(100dvh - 100px)',accessKey:'NotePreso-TawWFQU9',offsetX:16,offsetY:72,position:'bottom-left'};
    const q=[];window.Cekat=function(){q.push(arguments);};window.Cekat.q=q;
    const vendor=document.createElement('script'); vendor.async=true;vendor.src=window.mychat.server;vendor.referrerPolicy='no-referrer';
    vendor.onerror=fail;
    vendor.onload=()=>{
      if(failed){document.getElementById('iframe2-chat-container')?.remove();return;}
      const frame=document.getElementById('iframe1');if(!frame){fail();return;}
      frame.title='Nora — NotePreso support chat';
      // This is an iframe navigation check, not proof the upstream chat API is healthy.
      frame.addEventListener('load',()=>{if(!loading)return;clearTimeout(timer);loaded=true;loading=false;panel.hidden=true;launcher.hidden=true;window.Cekat.open();},{once:true});
    };
    timer=setTimeout(fail,15000);document.head.append(vendor);
  });
  // Keep both launchers away from the existing analytics cookie banner.
  const sync=()=>{if(failed)document.getElementById('iframe2-chat-container')?.remove();const banner=document.querySelector('.np-cookie-consent');const hide=!!banner&&!banner.hidden&&getComputedStyle(banner).display!=='none';root.classList.toggle('np-nora-obscured',hide);document.getElementById('iframe2-chat-container')?.classList.toggle('np-nora-obscured',hide);};
  new MutationObserver(sync).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});sync();
})();
