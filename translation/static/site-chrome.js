(() => {
  'use strict';
  const notes = 'https://notepreso.com';
  const presentation = 'https://presentation.notepreso.com';
  const translation = 'https://translation.notepreso.com';
  const isPresentation = location.hostname === 'presentation.notepreso.com';
  const isTranslation = location.hostname === 'translation.notepreso.com';
  const productHome = (isTranslation ? translation : isPresentation ? presentation : notes) + '/';
  const home = ['Home', notes + '/'];
  const primary = isPresentation ? [['Projects', presentation + '/app'], ['Pricing', notes + '/pricing']]
    : isTranslation ? [['Pricing', notes + '/pricing']]
    : [['Chat', notes + '/chat'], ['Pricing', notes + '/pricing']];
  const products = [['Speaker Notes', notes + '/app', 'Add notes to your slides'],
    ['Presentation', presentation + '/app', 'Create and manage presentations'],
    ['Translation', translation + '/', 'Translate slides and speaker notes']];
  const secondary = [['Help', notes + '/support'], ['Guide', productHome + 'how-to'], ['Terms', notes + '/terms'], ['Privacy', notes + '/privacy'], ['Refund Policy', notes + '/refund-policy']];
  const destinations = [home, ...primary, ...products, ...secondary];
  function footer() {
    const originals = [...document.querySelectorAll('footer')].filter(node => node.id !== 'np-global-footer' && !node.closest('dialog, [role="dialog"]'));
    if (!originals.length) return;
    originals.forEach(node => { node.dataset.npReplacedFooter = 'true'; });
    if (document.getElementById('np-global-footer')) return;
    const result = document.createElement('footer'); result.id = 'np-global-footer';
    const brand = document.createElement('a'); brand.href = productHome; brand.setAttribute('aria-label', 'NotePreso home');
    brand.textContent = 'NotePreso';
    const nav = document.createElement('nav'); nav.setAttribute('aria-label', 'Footer navigation');
    destinations.forEach(([label, href]) => { const a = document.createElement('a'); a.textContent = label; a.href = href; nav.append(a); });
    const identity = document.createElement('p'); identity.textContent = 'NotePreso · by Actia Carbon';
    result.append(brand, nav, identity); document.body.append(result);
  }
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const header = document.createElement('header'); header.id = 'np-global-header';
  const shadow = header.attachShadow({mode:'open'});
  let menuOpen = false, accountOpen = false, session = null, csrf = '', sessionBusy = false;
  let restoreOverflow = '', priorFocus = null;
  const inertState = new Map();
  let localButtons = [];
  const link = ([name, href]) => {
    const u = new URL(href);
    const current = u.origin === location.origin && u.pathname === location.pathname;
    return `<a href="${href}"${current?' aria-current="page"':''}>${name}</a>`;
  };
  const productLink = (entry) => {
    const [name, href, hint] = entry;
    const active = new URL(href).origin === location.origin;
    return `<a class="workspace-option" href="${href}"${active?' aria-current="true"':''}><span><strong>${name}</strong><small>${hint}</small></span><span class="workspace-arrow" aria-hidden="true">→</span></a>`;
  };
  const controlsStyle = document.createElement('link');
  controlsStyle.rel = 'stylesheet';
  controlsStyle.href = (isPresentation ? '/assets/' : '/static/') + 'workspace-accessible-controls.css?v=2';
  document.head.append(controlsStyle);
  shadow.innerHTML = `<link rel="stylesheet" href="${isPresentation?'/assets':'/static'}/site-header-readable.css?v=1">
    <div class="bar"><a class="brand" href="${home[1]}" aria-label="NotePreso home"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+CjxyZWN0IHdpZHRoPSIzNiIgaGVpZ2h0PSIzNiIgcng9IjciIGZpbGw9IiNGN0Y5RkMiLz4KPHBhdGggZD0iTTE2IDI1SDVhMiAyIDAgMCAxLTItMlY3YTIgMiAwIDAgMSAyLTJoMjNhMiAyIDAgMCAxIDIgMnY5IgogZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTcyQjREIiBzdHJva2Utd2lkdGg9IjIuNSIvPgo8cGF0aCBkPSJNMTAgMTB2NWg1YTUgNSAwIDEgMS01LTVaIiBmaWxsPSIjMTcyQjREIi8+CjxwYXRoIGQ9Ik0xOCAxMGg4TTE4IDE0aDYiIHN0cm9rZT0iIzE3MkI0RCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHJlY3QgeD0iMTYiIHk9IjE4IiB3aWR0aD0iMTgiIGhlaWdodD0iMTMiIHJ4PSIzIiBmaWxsPSIjMDg3RjhDIi8+CjxwYXRoIGQ9Ik0yMCAyM2gxME0yMCAyN2g3IiBzdHJva2U9IiNGN0Y5RkMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+Cjwvc3ZnPg==" alt="" width="36" height="36"><span><strong>NotePreso</strong><small>Your expertise. Clearly spoken.</small></span></a>
    <nav class="desktop-nav" aria-label="Main navigation">${link(home)}<details class="more workspace-menu"><summary>Workspace <span class="chevron" aria-hidden="true">⌄</span></summary><div class="more-panel">${products.map(productLink).join('')}<div class="local-desktop"></div></div></details>${primary.map(link).join('')}<details class="more documentation-menu"><summary>Documentation <svg class="chevron" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><div class="more-panel">${secondary.map(link).join('')}</div></details></nav>
    <div class="desktop-account session-slot"><a class="sign-in" href="${isTranslation?'/auth/login':isPresentation?'/api/auth/login':'/auth/login?return_to='+encodeURIComponent(location.pathname)}">Account</a></div>
    <button class="toggle" type="button" aria-label="Open navigation menu" aria-controls="mobile-menu" aria-expanded="false"><span class="menu-lines" aria-hidden="true"></span></button></div>
    <div class="backdrop" hidden></div><section id="mobile-menu" class="drawer" role="dialog" aria-label="Navigation menu" aria-modal="true" hidden><div class="drawer-heading">Menu<button type="button" class="close" aria-label="Close navigation menu">×</button></div><nav class="mobile-nav" aria-label="Mobile navigation">${link(home)}<details class="mobile-workspace"><summary>Workspace</summary>${products.map(productLink).join('')}</details>${primary.map(link).join('')}<details class="mobile-documentation"><summary>Documentation</summary>${secondary.map(link).join('')}</details></nav><div class="local-mobile"></div><div class="drawer-account session-slot"></div></section>`;
  const toggle = shadow.querySelector('.toggle'), drawer = shadow.querySelector('.drawer'), backdrop = shadow.querySelector('.backdrop');
  const slots = [...shadow.querySelectorAll('.session-slot')];
  function closeMenu(returnFocus=true) {
    if (!menuOpen) return;
    menuOpen=false; drawer.hidden=true; backdrop.hidden=true; toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-label','Open navigation menu');
    inertState.forEach((wasInert,node)=>{node.inert=wasInert;}); inertState.clear(); document.documentElement.style.overflow=restoreOverflow;
    if(returnFocus)(priorFocus?.isConnected?priorFocus:toggle).focus();
  }
  function openMenu() {
    priorFocus=shadow.activeElement || document.activeElement; menuOpen=true; accountOpen=false;
    restoreOverflow=document.documentElement.style.overflow;
    [...document.body.children].forEach(node=>{if(node!==header&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)){inertState.set(node,node.inert);node.inert=true;}});
    document.documentElement.style.overflow='hidden'; drawer.hidden=false; backdrop.hidden=false; toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Close navigation menu');
    shadow.querySelector('.close').focus();
  }
  function renderSession() {
    slots.forEach(slot=>{
      if(session===null){slot.innerHTML=`<a class="sign-in" href="${isTranslation?'/':isPresentation?'/app':notes+'/app'}">Account</a>`;return;}
      if(!session.authenticated){slot.innerHTML=`<a class="sign-in" href="${isTranslation?'/auth/login':isPresentation?'/api/auth/login':'/auth/login?return_to='+encodeURIComponent(location.pathname)}">Sign in <span aria-hidden="true">↗</span></a>`;return;}
      const name=session.name||'Your account', initial=Array.from(name.trim())[0]||'U', plan=session.plan?`<span class="plan">${esc(session.plan)}</span>`:'';
      const identity=`<span class="avatar" aria-hidden="true">${esc(initial.toUpperCase())}</span><span class="identity"><strong>${esc(name)}</strong>${plan}</span>`;
      if(slot.classList.contains('desktop-account'))slot.innerHTML=`<button class="profile" type="button" aria-label="Account menu" aria-expanded="${accountOpen}">${identity}<svg class="chevron" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="account-panel" ${accountOpen?'':'hidden'}><a href="${isTranslation?'/':isPresentation?'/app':notes+'/app'}">Open workspace</a><a href="${notes}/pricing">Manage plan</a><button type="button" data-sign-out>Sign out</button></div>`;
      else slot.innerHTML=`<div class="session-identity">${identity}</div><div class="session-actions"><a href="${isTranslation?'/':isPresentation?'/app':notes+'/app'}">My workspace</a><button type="button" data-sign-out>Sign out</button></div>`;
    });
  }
  async function refreshSession() {
    if(sessionBusy)return;sessionBusy=true;
    try {
      const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('Session unavailable');const data=await response.json();
      const authenticated=isPresentation?!!data.user:!!data.authenticated;
      const next={authenticated,name:isPresentation?(data.user?.name||'Your account'):(data.display_name||data.username||'Your account'),plan:''};
      csrf=isPresentation?(data.csrfToken||''):(data.csrf_token||'');
      if(authenticated){
        try{const res=await fetch('/api/account',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(res.ok){const value=await res.json(),plan=value.account?.plan;if(value.profile?.display_name)next.name=value.profile.display_name;if(['free','pro'].includes(plan))next.plan=plan==='pro'?'Pro':'Free';}}catch(_){}
      }
      if(JSON.stringify(session)!==JSON.stringify(next)){session=next;renderSession();}
    } catch (_) { if(session===null)renderSession(); }
    finally {sessionBusy=false;}
  }
  async function logoutRequest(url, token='') {
    const response = await fetch(url, {
      method: 'POST', credentials: 'include',
      headers: token ? {'X-CSRF-Token':token} : {},
    });
    if (!response.ok) throw Error('Sign out unavailable');
    return response.json();
  }
  async function signOut(button) {
    button.disabled=true;
    try { await logoutRequest('/api/auth/logout',csrf); location.assign('/'); }
    catch (_) { button.disabled=false;button.textContent='Retry sign out'; }
  }
  shadow.addEventListener('click',event=>{
    if(event.target.closest('.toggle')){menuOpen?closeMenu():openMenu();return;}
    if(event.target.closest('.close,.backdrop')){closeMenu();return;}
    if(event.target.closest('.profile')){accountOpen=!accountOpen;if(accountOpen)shadow.querySelectorAll('.desktop-nav .more').forEach(menu=>{menu.open=false;});renderSession();return;}
    const logout=event.target.closest('[data-sign-out]');if(logout){void signOut(logout);return;}
    const proxy=event.target.closest('[data-local-action]');if(proxy){closeMenu(false);localButtons[Number(proxy.dataset.localAction)]?.click();return;}
    if(event.target.closest('a'))closeMenu(false);
  });
  const desktopMenus=[...shadow.querySelectorAll('.desktop-nav .more')];
  desktopMenus.forEach(menu=>menu.addEventListener('toggle',()=>{
    if(!menu.open)return;
    desktopMenus.filter(other=>other!==menu).forEach(other=>{other.open=false;});
    if(accountOpen){accountOpen=false;renderSession();}
  }));
  document.addEventListener('click',event=>{if(!event.composedPath().includes(header))desktopMenus.forEach(menu=>{menu.open=false;});});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(menuOpen){event.preventDefault();closeMenu();}if(accountOpen){accountOpen=false;renderSession();shadow.querySelector('.profile')?.focus();}shadow.querySelectorAll('.more,.mobile-workspace,.mobile-documentation').forEach(menu=>{menu.open=false;});}
    if(event.key==='Tab'&&menuOpen){const nodes=[...drawer.querySelectorAll('a[href],button:not([disabled])')].filter(n=>n.getClientRects().length),first=nodes[0],last=nodes.at(-1),active=shadow.activeElement;if(event.shiftKey&&active===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}}
  });
  document.addEventListener('click',event=>{if(!event.composedPath().includes(header)&&accountOpen){accountOpen=false;renderSession();}});
  matchMedia('(max-width: 900px)').addEventListener('change',()=>closeMenu(false));
  let localSignature='';
  function mountHeader() {
    const originals=[...document.querySelectorAll('header.topbar,header.site-header,header.np7d-nav,header.user-topnav')];
    if(!originals.length)return;
    if(!header.isConnected){
      if(!document.getElementById('np-global-header-space')){const space=document.createElement('div');space.id='np-global-header-space';space.setAttribute('aria-hidden','true');document.body.prepend(space);}
      document.body.prepend(header);
    }
    originals.forEach(node=>{node.dataset.npReplacedHeader='true';});
    const buttons=[...document.querySelectorAll('header.user-topnav .user-topnav-links button,header.user-topnav .user-create-button,header .language-toggle button,header .language-button')].filter(button=>!(button.matches('.user-topnav-links button')&&button.textContent.trim()==='Editor'));
    const tools = isPresentation ? buttons.filter(button=>!button.matches('.user-create-button,.user-topnav-links button')) : buttons;
    const signature=tools.map(button=>button.textContent.trim()).join('|');localButtons=tools;
    if(signature!==localSignature){localSignature=signature;for(const node of shadow.querySelectorAll('.local-desktop,.local-mobile'))node.innerHTML=tools.length?`<p class="local-title">Workspace tools</p>`+tools.map((button,i)=>`<button type="button" data-local-action="${i}">${esc(button.textContent.trim()||button.getAttribute('aria-label')||'Workspace action')}</button>`).join(''):'';}
  }

  let skipLink;
  function mountSkipLink() {
    const main = document.querySelector('main, [role="main"]');
    if (!main) return;
    if (!main.id) main.id = 'np-main-content';
    if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
    main.classList.add('np-skip-target');
    if (!skipLink) {
      skipLink = document.querySelector('a.start-skip, a.pricing-skip') || document.createElement('a');
      skipLink.className = 'np-skip-link';
      skipLink.textContent = 'Skip to main content';
      skipLink.addEventListener('click', event => {
        const target = document.getElementById(skipLink.hash.slice(1));
        if (!target) return;
        event.preventDefault();
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
      });
    }
    skipLink.href = '#' + main.id;
    if (document.body.firstElementChild !== skipLink) document.body.prepend(skipLink);
  }
  let scheduled=false;
  function enhance(){scheduled=false;mountHeader();mountSkipLink();footer();}
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(enhance);}}
  function start(){enhance();void refreshSession();const root=document.getElementById('root');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  window.addEventListener('np-session-updated',()=>{void refreshSession();});window.addEventListener('focus',()=>{void refreshSession();});window.addEventListener('pageshow',()=>{void refreshSession();});

})();
