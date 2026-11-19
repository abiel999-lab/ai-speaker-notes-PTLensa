/* NotePreso Nora adapter. Load the Cekat widget when the visitor opens chat. */
(() => {
  'use strict';
  const preview = document.currentScript?.dataset.preview === 'true' &&
    ['localhost', '127.0.0.1'].includes(location.hostname);
  const hosts = ['notepreso.com', 'www.notepreso.com', 'presentation.notepreso.com', 'translation.notepreso.com'];
  if ((!preview && !hosts.includes(location.hostname)) || window.__npNora) return;
  if (/^\/(auth|login|admin|api|docs|redoc|realms)(\/|$)/.test(location.pathname)) return;
  window.__npNora = true;

  const vendorOrigin = 'https://live.cekat.ai';
  const root = document.createElement('section');
  root.id = 'np-nora';
  root.setAttribute('aria-label', 'NotePreso support');
  root.innerHTML = '<button id="np-nora-launch" type="button">Chatbot Support</button>' +
    '<p id="np-nora-status" role="status"></p>' +
    '<a id="np-nora-fallback" href="https://notepreso.com/support" hidden>Contact support</a>';
  document.body.append(root);
  const launcher = root.querySelector('button');
  const status = root.querySelector('#np-nora-status');
  const fallback = root.querySelector('#np-nora-fallback');
  let loading = false;
  let failed = false;
  let timer;
  let vendor;

  // Block spoofed toggle messages before the vendor's legacy listener receives them.
  window.addEventListener('message', event => {
    if (event.data?.action === 'toggleChat' &&
      (event.origin !== vendorOrigin || event.source !== document.getElementById('iframe1')?.contentWindow)) {
      event.stopImmediatePropagation();
    }
  });

  function fail() {
    clearTimeout(timer);
    failed = true;
    loading = false;
    vendor?.remove();
    document.getElementById('iframe2-chat-container')?.remove();
    fallback.hidden = false;
    status.textContent = 'Chat is unavailable.';
    if (document.activeElement === launcher) fallback.focus();
    launcher.hidden = true;
  }

  launcher.addEventListener('click', () => {
    if (loading || failed || launcher.hidden) return;
    if (window.mychat || document.getElementById('iframe1')) {
      fail();
      return;
    }
    loading = true;
    launcher.setAttribute('aria-disabled', 'true');
    launcher.textContent = 'Opening chat…';
    // Positive offsetX anchors the launcher on the right; the widget opens left.
    window.mychat = {
      server: vendorOrigin + '/widget.js',
      iframeWidth: '440px',
      iframeHeight: 'calc(100dvh - 100px)',
      accessKey: 'NotePreso-TawWFQU9',
      offsetX: 16,
      offsetY: 72,
      position: 'bottom-left',
    };
    const queue = [];
    window.Cekat = function () { queue.push(arguments); };
    window.Cekat.q = queue;
    vendor = document.createElement('script');
    vendor.async = true;
    vendor.src = window.mychat.server;
    vendor.referrerPolicy = 'no-referrer';
    vendor.onerror = fail;
    vendor.onload = () => {
      const frame = document.getElementById('iframe1');
      if (failed || !frame) {
        fail();
        return;
      }
      frame.title = 'Nora — NotePreso support chat';
      frame.addEventListener('load', () => {
        if (!loading) return;
        try {
          window.Cekat.open();
        } catch {
          fail();
          return;
        }
        clearTimeout(timer);
        loading = false;
        if (document.activeElement === launcher) frame.focus();
        launcher.hidden = true;
      }, { once: true });
    };
    timer = setTimeout(fail, 15000);
    document.head.append(vendor);
  });

  function syncBanner() {
    const widget = document.getElementById('iframe2-chat-container');
    if (failed) widget?.remove();
    const banner = document.querySelector('.np-cookie-consent');
    const hide = !!banner && !banner.hidden && getComputedStyle(banner).display !== 'none';
    root.classList.toggle('np-nora-obscured', hide);
    widget?.classList.toggle('np-nora-obscured', hide);
  }
  new MutationObserver(syncBanner).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'],
  });
  syncBanner();
})();
