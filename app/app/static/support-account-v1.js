
(() => {
  'use strict';
  async function showAccount() {
    const actions = document.querySelector('.topbar .nav-actions');
    if (!actions || actions.querySelector('.account-actions')) return;
    try {
      const state = await authState();
      if (!state.authenticated) return;
      const group = document.createElement('div');
      group.className = 'account-actions';
      group.innerHTML = '<span class="plan-chip" data-plan-chip>Plan</span><div class="account-chip"><span class="account-avatar" aria-hidden="true"></span><span class="account-name"></span></div><button class="logout-btn" type="button" data-logout aria-label="Sign out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m11-7h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Sign out</span></button>';
      const name = state.display_name || state.username || state.email || 'Account';
      group.querySelector('.account-name').textContent = name;
      group.querySelector('.account-avatar').textContent = Array.from(name)[0].toUpperCase();
      group.querySelector('.account-chip').title = name;
      actions.append(group);
      if (typeof window.loadAccountPlan === 'function') {
        await window.loadAccountPlan();
      }
    } catch (_) {
      console.warn('NotePreso account details could not be loaded');
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showAccount, { once: true });
  } else {
    void showAccount();
  }
})();
