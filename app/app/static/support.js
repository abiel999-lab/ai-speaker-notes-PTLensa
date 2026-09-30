let supportCsrfToken = null;

async function supportAuthState() {
  const res = await fetch('/api/v1/auth/me', { headers: { Accept: 'application/json' } });
  if (!res.ok) return { authenticated: false };
  const data = await res.json();
  supportCsrfToken = data.csrf_token || null;
  return data;
}

async function supportLogout() {
  if (!supportCsrfToken) await supportAuthState();
  const headers = { 'X-Requested-With': 'fetch' };
  if (supportCsrfToken) headers['X-CSRF-Token'] = supportCsrfToken;
  const res = await fetch('/api/v1/auth/logout', { method: 'POST', headers });
  let target = '/login';
  try {
    const data = await res.json();
    if (data && data.redirect_url) target = data.redirect_url;
  } catch (_) {}
  window.location.href = target;
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-support-logout]')) {
    event.preventDefault();
    supportLogout();
  }
});
