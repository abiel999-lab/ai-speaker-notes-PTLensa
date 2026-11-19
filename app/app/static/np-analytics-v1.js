/* NotePreso analytics. Public-page analytics preferences, shared across NotePreso subdomains.
 * Load once, from a self-hosted external script. No noscript tracking beacon.
 */
(() => {
  'use strict';
  if (window.NotePresoAnalytics) return;
  const GA='G-V08V0SFC35', PIXEL='1678143196995735';
  const KEY='np_tracking_v1', AGE=180*86400, VERSION=1;
  const titles={'/':'NotePreso','/pricing':'NotePreso Pricing','/how-to':'NotePreso Guide'};
  let confirmedConversion=false;
  const ownedHost=['notepreso.com','www.notepreso.com','presentation.notepreso.com'].includes(location.hostname);
  function publicPage(){return ownedHost && (Object.hasOwn(titles,location.pathname)||confirmedConversion);}
  let consent={analytics:false,marketing:false}, startedGA=false, startedMeta=false;
  let lastChoice='', banner, settings;
  function read(){
    try {
      const raw=document.cookie.split('; ').find(v=>v.startsWith(KEY+'='));
      if(!raw)return null;
      const c=JSON.parse(decodeURIComponent(raw.slice(KEY.length+1)));
      if(c.v!==VERSION||!Number.isFinite(c.at)||c.at>Date.now()||Date.now()-c.at>AGE*1000||
        typeof c.analytics!=='boolean'||typeof c.marketing!=='boolean')return null;
      return c;
    } catch{return null;}
  }
  function gtag(){window.dataLayer.push(arguments);}
  function load(src){const s=document.createElement('script');s.async=true;s.src=src;s.referrerPolicy='no-referrer';document.head.appendChild(s);}
  function cleanLocation(){
    // Never change application-owned URL state (billing returns, tokens, etc.).
    // Unknown parameters suppress tracking for this document.
    const u=new URL(location.href), clean=new URL(u.origin+u.pathname);
    const allowed=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','fbclid'];
    if(u.hash||[...u.searchParams.keys()].some(k=>!allowed.includes(k)))return null;
    for(const k of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){
      const value=u.searchParams.get(k);
      if(value && /^[A-Za-z0-9_-]{1,100}$/.test(value))clean.searchParams.set(k,value);
    }
    // Click identifiers are retained only after separate marketing consent.
    if(consent.marketing)for(const k of ['gclid','gbraid','wbraid','fbclid']){
      const value=u.searchParams.get(k);
      if(value && /^[A-Za-z0-9_.-]{1,512}$/.test(value))clean.searchParams.set(k,value);
    }
    return clean.href;
  }
  function safeReferrer(){try{return document.referrer?new URL(document.referrer).origin+'/':'';}catch{return '';}}
  function start(){
    if(!publicPage())return;
    const page=cleanLocation();
    if(!page)return;
    if(consent.analytics && !startedGA && !window.gtag){
      startedGA=true;window.dataLayer=window.dataLayer||[];window.gtag=gtag;
      gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      gtag('consent','update',{analytics_storage:'granted',ad_storage:consent.marketing?'granted':'denied',ad_user_data:consent.marketing?'granted':'denied',ad_personalization:'denied'});
      gtag('js',new Date());
      // The Google tag sends its standard PageView from config. Do not send
      // a second manual page_view alongside the provider's automatic event.
      gtag('config',GA,{allow_google_signals:false,allow_ad_personalization_signals:false,
        cookie_domain:'notepreso.com',page_location:page,page_title:titles[location.pathname]||'NotePreso Payment Confirmation',page_referrer:safeReferrer()});
      load('https://www.googletagmanager.com/gtag/js?id='+GA);
    }
    // Meta receives the document URL automatically. Only clean public pages
    // and referrers without query/fragment can load it.
    let refOK=true;try{const r=document.referrer&&new URL(document.referrer);refOK=!r||(!r.search&&!r.hash);}catch{refOK=false;}
    if(consent.marketing && page===location.href && refOK && !startedMeta && !window.fbq){
      startedMeta=true;
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
        t=b.createElement(e);t.async=!0;t.src=v;t.referrerPolicy='no-referrer';s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
      }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('set','autoConfig',false,PIXEL);
      window.fbq('consent','grant');window.fbq('init',PIXEL);window.fbq('track','PageView');
    }
  }
  function eraseCookies(){
    for(const entry of document.cookie.split(';')){
      const name=entry.trim().split('=')[0];
      if(!/^(_ga(?:_|$)|_gid$|_gat|_fbp$|_fbc$|_gcl_)/.test(name))continue;
      for(const domain of ['', '; Domain=notepreso.com','; Domain=.notepreso.com'])
        document.cookie=name+'=; Max-Age=0; Path=/; Secure; SameSite=Lax'+domain;
    }
  }
  function choose(analytics,marketing){
    const revoke=(consent.analytics&&!analytics)||(consent.marketing&&!marketing);
    const value={v:VERSION,at:Date.now(),analytics:!!analytics,marketing:!!marketing};
    document.cookie=KEY+'='+encodeURIComponent(JSON.stringify(value))+'; Max-Age='+AGE+'; Domain=notepreso.com; Path=/; Secure; SameSite=Lax';
    consent=value;lastChoice=JSON.stringify(read());
    if(revoke){
      window['ga-disable-'+GA]=true;
      if(window.fbq)window.fbq('consent','revoke');
      eraseCookies();location.reload();return;
    }
    banner.hidden=true;start();
  }
  function event(name,params={}){
    // A closed event vocabulary prevents arbitrary application data leaking.
    const current=read();
    if(!current||JSON.stringify(current)!==lastChoice||!cleanLocation()||!publicPage()||!['registration_start','account_access_start','checkout_start'].includes(name))return;
    const fields=name==='checkout_start'?{product:'pro'}:{};
    if(consent.analytics&&startedGA)gtag('event',name==='checkout_start'?'begin_checkout':name,fields);
    if(consent.marketing&&startedMeta)window.fbq(name==='checkout_start'?'track':'trackCustom',name==='checkout_start'?'InitiateCheckout':name,fields);
  }
  function button(text,handler,parent){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',handler);parent.appendChild(b);return b;}
  function ui(){
    if(!publicPage())return;
    banner=document.createElement('section');banner.className='np-cookie-consent';banner.setAttribute('aria-label','Cookie preferences');
    const p=document.createElement('p');p.textContent='Optional cookies help us measure visits with Google Analytics and advertising with Meta. We do not send your presentation content. Choose analytics only, accept both, or reject optional cookies. You can change your choice at any time.';banner.appendChild(p);
    const a=document.createElement('a');a.href='https://notepreso.com/privacy';a.textContent='Privacy policy';banner.appendChild(a);
    const actions=document.createElement('div');banner.appendChild(actions);
    button('Reject optional',()=>choose(false,false),actions);button('Analytics only',()=>choose(true,false),actions);button('Accept both',()=>choose(true,true),actions);
    document.body.appendChild(banner);
    settings=button('Privacy choices',()=>{banner.hidden=false;},document.body);settings.className='np-cookie-settings';
    function placeChoices(){const nav=document.querySelector('#np-global-footer nav');if(nav){nav.appendChild(settings);return true;}settings.hidden=true;return false;}
    if(placeChoices())settings.hidden=false;else {const observer=new MutationObserver(()=>{if(placeChoices()){settings.hidden=false;observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});}
    const c=read();if(c){consent=c;banner.hidden=true;start();lastChoice=JSON.stringify(c);}else{choose(true,true);}
    // Consent is shared only among NotePreso subdomains. A changed choice in
    // another tab forces a fresh document, unloading all optional trackers.
    window.addEventListener('focus',()=>{if(JSON.stringify(read())!==lastChoice)location.reload();});
    document.addEventListener('click',e=>{
      if(e.target.closest?.('#auth-register,#pricing-register')){event('registration_start');return;}
      const checkoutButton=e.target.closest?.('#pro-checkout');
      if(checkoutButton&&/^Sign in/i.test(checkoutButton.textContent||'')){event('account_access_start');return;}
      const a=e.target.closest?.('a[href]');if(a){try{const u=new URL(a.href);if(u.hostname==='notepreso.com'&&u.pathname==='/auth/register')event('registration_start');else if(['notepreso.com','presentation.notepreso.com'].includes(u.hostname)&&['/auth/login','/api/auth/login'].includes(u.pathname))event('account_access_start');}catch{}}
    },true);
  }
  async function confirmPurchase(){
    // This method is called only on the generic Paddle checkout page after
    // the existing completion handler runs. The webhook remains the truth.
    try{
      if(!ownedHost||location.pathname!=='/paddle/checkout')return;
      const c=read();if(!c||(!c.analytics&&!c.marketing))return;
      const reference=sessionStorage.getItem('np.analytics.checkout');
      if(!reference)return;
      const auth=await fetch('/api/v1/auth/me',{cache:'no-store'});
      if(!auth.ok)return;const me=await auth.json();if(!me.authenticated||!me.csrf_token)return;
      const response=await fetch('/api/v1/analytics/purchase-claim',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf_token,'X-Requested-With':'fetch'},body:JSON.stringify({reference_id:reference})});
      if(!response.ok)return;const {receipt:r}=await response.json();
      if(!r||!Array.isArray(r.channels)||!/^[-0-9a-f]{36}$/.test(r.event_id)||!Number.isFinite(r.value)||r.value<=0||!/^[A-Z]{3}$/.test(r.currency))return;
      // The payment client already captured its transaction ID in its closure.
      // Remove the provider query before loading either analytics vendor.
      history.replaceState(history.state,'','/paddle/checkout');
      document.title='NotePreso Payment Confirmation';confirmedConversion=true;
      consent=c;lastChoice=JSON.stringify(c);start();
      if(r.channels.includes('ga4')&&c.analytics&&startedGA)gtag('event','purchase',{transaction_id:r.event_id,value:r.value,currency:r.currency,items:[{item_id:'pro',item_name:'NotePreso Pro',quantity:1,price:r.value}]});
      if(r.channels.includes('meta')&&c.marketing&&startedMeta)window.fbq('track','Purchase',{value:r.value,currency:r.currency,content_ids:['pro'],content_type:'product'},{eventID:r.event_id});
      sessionStorage.removeItem('np.analytics.checkout');
    }catch{/* Analytics failures never interrupt billing or activation. */}
  }
  function checkout(reference){try{const c=read();if(!c||(!c.analytics&&!c.marketing)||!/^[-A-Za-z0-9_]{1,64}$/.test(reference)||sessionStorage.getItem('np.analytics.checkout')===reference)return;sessionStorage.setItem('np.analytics.checkout',reference);event('checkout_start');}catch{}}
  window.NotePresoAnalytics={event,checkout,confirmPurchase};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ui,{once:true});else ui();
})();

