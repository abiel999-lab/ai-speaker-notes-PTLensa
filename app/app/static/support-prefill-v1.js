(() => {
  'use strict';

  const form = document.querySelector('[data-support-prefill]');
  if (!form) return;

  const name = form.elements.namedItem('name');
  const email = form.elements.namedItem('email');
  const hint = form.querySelector('#np-prefill-note');
  if (!(name instanceof HTMLInputElement) || !(email instanceof HTMLInputElement) || !hint) return;

  const edited = new Set();
  for (const field of [name, email]) {
    field.addEventListener('input', () => edited.add(field));
    field.addEventListener('change', () => edited.add(field));
  }

  function fill(field, value) {
    if (edited.has(field) || field.value || document.activeElement === field || !value || value.length > field.maxLength) return false;
    field.value = value;
    if (!field.validity.valid) {
      field.value = '';
      return false;
    }
    return true;
  }

  async function prefill() {
    try {
      const response = await fetch('/api/v1/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const state = await response.json();
      if (state.authenticated !== true) return;

      const replyAddress = typeof state.email === 'string' ? state.email.trim() : '';
      const displayName = typeof state.display_name === 'string' ? state.display_name.trim() : '';
      const filledName = !displayName.includes('@') && fill(name, displayName);
      const filledEmail = fill(email, replyAddress);
      hint.hidden = !(filledName || filledEmail);
    } catch (_) {
      // Keep the form available for manual entry if the session check fails.
    }
  }

  void prefill();
})();
