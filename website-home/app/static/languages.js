(() => {
  'use strict';

  const normalize = text => String(text).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();

  function setupLanguageSearch(input) {
    const select = document.getElementById(input.dataset.languageFilter);
    if (!select || input.dataset.languageSearchReady === 'true') return;
    input.dataset.languageSearchReady = 'true';
    const options = Array.from(select.options, option => option.cloneNode(true));
    const status = document.createElement('small');
    status.className = 'speaker-language-match-count';
    status.id = `${select.id}-matches`;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    input.setAttribute('aria-controls', select.id);
    input.setAttribute('aria-describedby', status.id);
    select.after(status);

    function filterOptions() {
      const selected = select.value;
      const query = normalize(input.value);
      const matches = options.filter(option => normalize(
        `${option.textContent} ${option.value} ${option.dataset.languageSearch || ''}`
      ).includes(query));
      const visible = matches.slice();
      const current = options.find(option => option.value === selected);
      const kept = current && !visible.some(option => option.value === selected);
      // Search must never silently change the language submitted by the form.
      if (kept) visible.unshift(current);
      select.replaceChildren(...visible.map(option => option.cloneNode(true)));
      select.value = selected;
      if (!query) status.textContent = '';
      else if (!matches.length) status.textContent = 'No matching languages. Current selection retained.';
      else status.textContent = `${matches.length} matching option${matches.length === 1 ? '' : 's'}.${kept ? ' Current selection retained.' : ''}`;
    }

    input.addEventListener('input', filterOptions);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); select.focus(); }
      if (event.key === 'Escape') { input.value = ''; filterOptions(); }
    });
    select.addEventListener('change', () => {
      // Restore the complete catalog after an explicit language selection.
      input.value = '';
      filterOptions();
    });
    select.form?.addEventListener('reset', () => {
      input.value = '';
      select.replaceChildren(...options.map(option => option.cloneNode(true)));
      status.textContent = '';
    });
    filterOptions();
  }

  const setup = () => document.querySelectorAll('[data-language-filter]').forEach(setupLanguageSearch);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
