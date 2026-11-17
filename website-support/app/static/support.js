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


// NOTEPRESO MAILTO-ONLY SUPPORT 2026-10-01
document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector("[data-copy-support-email]");
  const status = document.getElementById("support-copy-status");

  if (!button) return;

  button.addEventListener("click", async () => {
    const email = button.dataset.copySupportEmail || "";

    if (!email) return;

    try {
      await navigator.clipboard.writeText(email);

      button.textContent = "Email copied";
      if (status) {
        status.textContent = `${email} copied to clipboard.`;
      }

      window.setTimeout(() => {
        button.textContent = "Copy email address";
        if (status) status.textContent = "";
      }, 2500);
    } catch (_) {
      if (status) {
        status.textContent = `Copy this address: ${email}`;
      }
    }
  });
});
