(() => {
  'use strict';
  function view(detail, filename) {
    const quota = detail.code === 'free_weekly_limit', unavailable = detail.code === 'quota_unavailable';
    const limit = Number(detail.limit), validLimit = Number.isSafeInteger(limit) && limit > 0;
    const resetLabel = quota && window.NotePresoReset?.format(detail.resets_at);
    let reset = resetLabel ? `Previews reset ${resetLabel}.` : '';
    if (quota && !reset) reset = 'Reset time is unavailable. Please check again later or contact Help.';
    return {
      heading: quota ? 'Your weekly free previews are used' : unavailable ? 'Preview availability could not be checked' : 'Choose how to continue',
      message: quota ? (validLimit ? `You have used all ${limit} free previews this week. Wait for the reset or go Pro to process full decks.` : 'Your weekly free preview limit has been reached. Wait for the reset or view Pro options.') : unavailable ? 'Please try again shortly. This is not a processing failure.' : 'This request needs a different plan or additional credits. View your options before continuing.',
      reset,
      file: filename ? `Selected file: ${filename}` : '',
      retry: unavailable,
      upgrade: !unavailable
    };
  }
  function home(modal, detail, filename, pricingHref) {
    const state = view(detail, filename);
    modal.querySelector('#limit-title').textContent = state.heading;
    modal.querySelector('#limit-message').textContent = state.message;
    modal.querySelector('#limit-reset').textContent = state.reset;
    modal.querySelector('#limit-file').textContent = state.file;
    const upgrade = modal.querySelector('#limit-pricing'); upgrade.href = pricingHref; upgrade.hidden = !state.upgrade;
    modal.querySelector('#limit-retry').hidden = !state.retry;
    return state;
  }
  function workspace(detail, filename, form) {
    if (!['free_weekly_limit','quota_unavailable'].includes(detail.code)) return false;
    const state = view(detail, filename), status = document.querySelector('#status');
    status.classList.remove('hidden'); status.querySelector('#status-title').textContent = detail.code === 'free_weekly_limit' ? 'FREE LIMIT REACHED' : 'PLEASE TRY AGAIN';
    status.querySelector('#status-count').textContent = ''; status.querySelector('.progress').hidden = true;
    status.querySelector('#status-message').textContent = state.message;
    let panel = status.querySelector('[data-preview-limit]');
    if (!panel) { panel = document.createElement('div'); panel.dataset.previewLimit = 'true'; panel.className = 'preview-limit-panel'; status.append(panel); }
    panel.replaceChildren();
    for (const text of [state.file, state.reset]) if (text) { const p = document.createElement('p'); p.textContent = text; panel.append(p); }
    if (state.upgrade) { const link = document.createElement('a'); link.className = 'btn primary'; link.href = '/pricing?reason=free_weekly_limit'; link.textContent = 'View Pro options'; panel.append(link); }
    if (state.retry) { const button = document.createElement('button'); button.type='button'; button.className='btn secondary'; button.textContent='Try again'; button.addEventListener('click',()=>form.requestSubmit()); panel.append(button); }
    const help = document.createElement('a'); help.className='btn secondary';help.href='/support';help.textContent='Help';panel.append(help);
    return true;
  }
  function clearWorkspace() {
    document.querySelector('[data-preview-limit]')?.remove();
    const progress = document.querySelector('#status .progress'); if(progress) progress.hidden=false;
  }
  window.NotePresoLimit = {view,home,workspace,clearWorkspace};
})();
