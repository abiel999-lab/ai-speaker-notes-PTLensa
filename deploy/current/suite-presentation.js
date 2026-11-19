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
    ['Journal to PPT', presentation + '/app?tool=journal', 'Turn a research journal into one PowerPoint'],
    ['Translation', translation + '/', 'Translate slides and speaker notes']];
  const secondary = [['Help', notes + '/support'], ['Guide', productHome + 'how-to'], ['Terms', notes + '/terms'], ['Privacy', notes + '/privacy'], ['Refund Policy', notes + '/refund-policy']];
  const destinations = [home, ...primary, ...products, ...secondary];
  function footer() {
    const originals = [...document.querySelectorAll('footer')].filter(node => node.id !== 'np-global-footer' && !node.closest('dialog, [role="dialog"], .creative-review'));
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
  let accountOpen = false, session = null, csrf = '', sessionBusy = false;
  let localButtons = [];
  const link = ([name, href], className = 'nav-link') => {
    const u = new URL(href);
    const current = u.origin === location.origin && u.pathname === location.pathname;
    return `<a class="${className}" href="${href}"${current?' aria-current="page"':''}>${name}</a>`;
  };
  const workspaceActive = (href) => {
    const destination = new URL(href);
    if (destination.origin !== location.origin) return false;
    if (!isPresentation) return true;
    const journalOpen = location.pathname === '/app' && new URLSearchParams(location.search).get('tool') === 'journal';
    return (destination.searchParams.get('tool') === 'journal') === journalOpen;
  };
  const syncCurrentWorkspace = () => {
    for (const option of shadow.querySelectorAll('.workspace-option')) {
      if (workspaceActive(option.href)) option.setAttribute('aria-current', 'true');
      else option.removeAttribute('aria-current');
    }
  };
  window.addEventListener('np:workspace-format', syncCurrentWorkspace);
  window.addEventListener('popstate', syncCurrentWorkspace);
  const productLink = (entry) => {
    const [name, href, hint] = entry;
    const active = workspaceActive(href);
    const icon = name === 'Speaker Notes' ? '<path d="M5 4h14v13H9l-4 3zM8 8h8M8 12h6"/>' :
      name === 'Presentation' ? '<path d="M3 5h18v12H3zM12 17v4M8 21h8M8 13l3-3 2 2 3-4"/>' :
      '<path d="M3 5h11M8 3v2m4 0c0 5-4 8-8 10m2-7c2 3 4 5 7 6m1 6 4-10 4 10m-6-3h4"/>';
    const symbol = `<span class="workspace-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>`;
    return `<a class="panel-link workspace-option" href="${href}"${active?' aria-current="true"':''}>${symbol}<span class="workspace-copy"><strong>${name}</strong><small>${hint}</small></span><span class="workspace-arrow" aria-hidden="true">→</span></a>`;
  };
  const chevron = '<span class="chevron" aria-hidden="true"></span>';
  const workspaceLinks = products.map(productLink).join('');
  const documentationLinks = secondary.map(entry => link(entry, 'panel-link')).join('');
  const navigation = (label) => `<nav class="${label}-nav" aria-label="Main navigation">
    ${link(home)}
    <details class="workspace-menu">
      <summary>Workspace ${chevron}</summary>
      <div class="nav-panel">${workspaceLinks}<div class="local-tools"></div></div>
    </details>
    ${primary.map(entry => link(entry)).join('')}
    <details class="documentation-menu">
      <summary>Documentation ${chevron}</summary>
      <div class="nav-panel">${documentationLinks}</div>
    </details>
  </nav>`;

  const workspace = isTranslation ? '/' : isPresentation ? '/app' : notes + '/app';
  const login = isTranslation ? '/auth/login' : isPresentation ? '/api/auth/login'
    : '/auth/login?return_to=' + encodeURIComponent(location.pathname);
  const assetPath = isPresentation ? '/assets/' : '/static/';
  const controlsStyle = document.createElement('link');
  controlsStyle.rel = 'stylesheet';
  controlsStyle.href = assetPath + 'workspace-accessible-controls.css?v=5';
  document.head.append(controlsStyle);
  shadow.innerHTML = `<link rel="stylesheet" href="${assetPath}site-header-responsive.css">
    <div class="bar">
      <a class="brand" href="${home[1]}" aria-label="NotePreso home"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+CjxyZWN0IHdpZHRoPSIzNiIgaGVpZ2h0PSIzNiIgcng9IjciIGZpbGw9IiNGN0Y5RkMiLz4KPHBhdGggZD0iTTE2IDI1SDVhMiAyIDAgMCAxLTItMlY3YTIgMiAwIDAgMSAyLTJoMjNhMiAyIDAgMCAxIDIgMnY5IgogZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMTcyQjREIiBzdHJva2Utd2lkdGg9IjIuNSIvPgo8cGF0aCBkPSJNMTAgMTB2NWg1YTUgNSAwIDEgMS01LTVaIiBmaWxsPSIjMTcyQjREIi8+CjxwYXRoIGQ9Ik0xOCAxMGg4TTE4IDE0aDYiIHN0cm9rZT0iIzE3MkI0RCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHJlY3QgeD0iMTYiIHk9IjE4IiB3aWR0aD0iMTgiIGhlaWdodD0iMTMiIHJ4PSIzIiBmaWxsPSIjMDg3RjhDIi8+CjxwYXRoIGQ9Ik0yMCAyM2gxME0yMCAyN2g3IiBzdHJva2U9IiNGN0Y5RkMiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+Cjwvc3ZnPg==" alt="" width="36" height="36"><span><strong>NotePreso</strong><small>Your expertise. Clearly spoken.</small></span></a>
      ${navigation('desktop')}
      <div class="desktop-account session-slot"><a class="sign-in" href="${workspace}">Account</a></div>
      <button class="toggle" type="button" aria-label="Open navigation menu"
        aria-haspopup="dialog" aria-controls="mobile-menu" aria-expanded="false">
        <span class="menu-icon" aria-hidden="true"></span><span class="toggle-label">Menu</span>
      </button>
    </div>
    <dialog id="mobile-menu" class="drawer" aria-labelledby="mobile-menu-title">
      <div class="drawer-heading">
        <span id="mobile-menu-title">Menu</span>
        <button type="button" class="close" aria-label="Close navigation menu" autofocus>×</button>
      </div>
      <div class="drawer-content">
        ${navigation('mobile')}
        <div class="drawer-account session-slot"><a class="sign-in" href="${workspace}">Account</a></div>
      </div>
    </dialog>`;

  const toggle = shadow.querySelector('.toggle');
  const drawer = shadow.querySelector('.drawer');
  const slots = [...shadow.querySelectorAll('.session-slot')];
  const desktopMenus = [...shadow.querySelectorAll('.desktop-nav details')];
  const mobileMenus = [...drawer.querySelectorAll('details')];
  let restoreOverflow = null;

  function closeDesktopMenus(except) {
    for (const menu of desktopMenus) {
      if (menu !== except) menu.open = false;
    }
  }

  function setAccountOpen(open) {
    accountOpen = open;
    shadow.querySelector('.profile')?.setAttribute('aria-expanded', String(open));
    const panel = shadow.querySelector('.account-panel');
    if (panel) panel.hidden = !open;
  }

  function openMenu() {
    closeDesktopMenus();
    setAccountOpen(false);
    restoreOverflow ??= document.documentElement.style.overflow;
    drawer.scrollTop = 0;
    drawer.showModal();
    document.documentElement.style.overflow = 'hidden';
    toggle.setAttribute('aria-expanded', 'true');
  }

  drawer.addEventListener('close', () => {
    if (drawer.open) return;
    document.documentElement.style.overflow = restoreOverflow ?? '';
    restoreOverflow = null;
    toggle.setAttribute('aria-expanded', 'false');
    for (const menu of mobileMenus) menu.open = false;
  });

  function renderSession() {
    for (const slot of slots) {
      if (session === null) {
        slot.innerHTML = `<a class="sign-in" href="${workspace}">Account</a>`;
        continue;
      }
      if (!session.authenticated) {
        slot.innerHTML = `<a class="sign-in" href="${login}">Sign in</a>`;
        continue;
      }

      const name = session.name || 'Your account';
      const initial = Array.from(name.trim())[0] || 'U';
      const plan = session.plan ? `<span class="plan">${esc(session.plan)}</span>` : '';
      const identity = `<span class="avatar" aria-hidden="true">${esc(initial.toUpperCase())}</span>
        <span class="identity"><strong>${esc(name)}</strong>${plan}</span>`;
      const actions = `<a class="panel-link" href="${workspace}">Open workspace</a>
        <a class="panel-link" href="${notes}/pricing">Manage plan</a>
        <button class="panel-link" type="button" data-sign-out>Sign out</button>`;

      if (slot.classList.contains('desktop-account')) {
        slot.innerHTML = `<button class="profile" type="button"
          aria-label="Account menu for ${esc(name)}" aria-controls="account-panel"
          aria-expanded="${accountOpen}">${identity}${chevron}</button>
          <div id="account-panel" class="account-panel" ${accountOpen ? '' : 'hidden'}>${actions}</div>`;
      } else {
        slot.innerHTML = `<div class="session-identity">${identity}</div>
          <div class="session-actions">${actions}</div>`;
      }
    }
  }
  async function refreshSession() {
    if(sessionBusy)return;sessionBusy=true;
    try {
      const response=await fetch(isPresentation?'/api/session':'/api/v1/auth/me',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('Session unavailable');const data=await response.json();
      const authenticated=isPresentation?!!data.user:!!data.authenticated;
      const next={authenticated,name:isPresentation?(data.user?.name||'Your account'):(data.display_name||data.username||'Your account'),plan:''};
      csrf=isPresentation?(data.csrfToken||''):(data.csrf_token||'');
      if(authenticated){
        try{const res=await fetch(isPresentation?'/api/platform/account':'/api/v1/account/plan',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(res.ok){const value=await res.json(),plan=isPresentation?value.account?.plan:value.plan;if(['free','pro'].includes(plan))next.plan=plan==='pro'?'Pro':'Free';}}catch(_){}
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
    button.disabled = true;
    try {
      let keycloak;
      if (isPresentation) {
        keycloak = await logoutRequest(notes + '/_notepreso/logout-notes');
        await logoutRequest('/api/auth/logout', csrf);
      } else {
        const response = await fetch(presentation + '/_notepreso/logout-session', {
          credentials: 'include', cache: 'no-store',
        });
        if (!response.ok) throw Error('Presentation session unavailable');
        const current = await response.json();
        if (current.user) {
          if (!current.csrfToken) throw Error('Presentation session cannot be signed out');
          await logoutRequest(presentation + '/_notepreso/logout-presentation', current.csrfToken);
        }
        keycloak = await logoutRequest('/api/v1/auth/logout', csrf);
      }
      const redirect = new URL(keycloak.redirect_url || '/', notes);
      if (isPresentation && redirect.origin === 'https://login.notepreso.com') {
        redirect.searchParams.set('post_logout_redirect_uri', presentation + '/');
      }
      location.assign(redirect.href);
    } catch (_) {
      button.disabled = false;
      button.textContent = 'Retry sign out';
    }
  }
  shadow.addEventListener('click', event => {
    const target = event.target;
    if (target.closest('.toggle')) {
      if (!drawer.open) openMenu();
      return;
    }
    if (target.closest('.close') || target === drawer) {
      drawer.close();
      return;
    }
    if (target.closest('.profile')) {
      closeDesktopMenus();
      setAccountOpen(!accountOpen);
      return;
    }
    const logout = target.closest('[data-sign-out]');
    if (logout) {
      void signOut(logout);
      return;
    }
    const proxy = target.closest('[data-local-action]');
    if (proxy) {
      if (drawer.open) drawer.close();
      closeDesktopMenus();
      localButtons[Number(proxy.dataset.localAction)]?.click();
      return;
    }
    if (target.closest('a') && drawer.open && !event.ctrlKey && !event.metaKey) drawer.close();
  });

  for (const menu of desktopMenus) {
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      closeDesktopMenus(menu);
      setAccountOpen(false);
    });
  }

  function dismissOutside(event) {
    if (drawer.open) return;
    const path = event.composedPath();
    const activeMenu = desktopMenus.find(menu => path.includes(menu));
    closeDesktopMenus(activeMenu);
    if (!path.includes(shadow.querySelector('.desktop-account'))) setAccountOpen(false);
  }

  document.addEventListener('click', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
  shadow.addEventListener('focusin', dismissOutside);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || drawer.open) return;
    const menu = desktopMenus.find(item => item.open);
    if (menu) {
      event.preventDefault();
      menu.open = false;
      menu.querySelector('summary').focus();
    } else if (accountOpen) {
      event.preventDefault();
      setAccountOpen(false);
      shadow.querySelector('.profile')?.focus();
    }
  });

  matchMedia('(min-width: 1024px)').addEventListener('change', event => {
    if (event.matches && drawer.open) {
      drawer.close();
      shadow.querySelector('.desktop-nav .nav-link').focus();
    } else if (!event.matches) {
      closeDesktopMenus();
      setAccountOpen(false);
    }
  });
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
    const toolLabels = tools.map(button => button.textContent.trim()
      || button.getAttribute('aria-label') || 'Workspace action');
    const signature = JSON.stringify(toolLabels);
    localButtons = tools;
    if (signature !== localSignature) {
      localSignature = signature;
      const actions = toolLabels.map((label, index) =>
        `<button type="button" data-local-action="${index}">${esc(label)}</button>`).join('');
      for (const node of shadow.querySelectorAll('.local-tools')) node.innerHTML = actions;
    }
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
  window.addEventListener('focus',()=>{void refreshSession();});window.addEventListener('pageshow',()=>{void refreshSession();});

})();
