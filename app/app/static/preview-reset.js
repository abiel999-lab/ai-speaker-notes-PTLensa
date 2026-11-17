(() => {
  'use strict';

  function parse(value) {
    if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function formatDate(date) {
    const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    return formatter.format(date) + ' (' + formatter.resolvedOptions().timeZone + ')';
  }

  function format(value) {
    const date = parse(value);
    return date ? formatDate(date) : '';
  }

  function upcoming(value, now = new Date()) {
    const serverDate = parse(value);
    if (serverDate && serverDate > now) return formatDate(serverDate);

    // Free quota is a Jakarta calendar week. Monday 00:00 in Jakarta is Sunday 17:00 UTC.
    const boundary = new Date(now);
    boundary.setUTCDate(boundary.getUTCDate() - boundary.getUTCDay());
    boundary.setUTCHours(17, 0, 0, 0);
    if (boundary <= now) boundary.setUTCDate(boundary.getUTCDate() + 7);
    return formatDate(boundary);
  }

  let accountReset;
  function render(value = accountReset) {
    accountReset = value;
    const labels = document.querySelectorAll('[data-free-reset]');
    if (!labels.length) return;
    const reset = upcoming(value);
    for (const label of labels) label.textContent = reset;
  }

  window.NotePresoReset = { format, upcoming, render };
  render();
  window.addEventListener('pageshow', () => render());
  window.addEventListener('focus', () => render());
})();
