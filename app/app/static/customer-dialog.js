(() => {
  'use strict';
  let current = null;

  function controls(dialog) {
    return [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
      .filter(node => node.getClientRects().length > 0);
  }

  function open(dialog, initial, trigger) {
    if (!dialog || current) return;
    const returnFocus = trigger || document.activeElement;
    const overflow = document.documentElement.style.overflow;
    const siblings = new Map();
    for (let node = dialog; node.parentElement; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling !== node) {
          siblings.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      if (node.parentElement === document.body) break;
    }
    current = { dialog, returnFocus, overflow, siblings };
    dialog.classList.remove('hidden');
    document.documentElement.style.overflow = 'hidden';
    (controls(dialog).find(node => node === initial) || controls(dialog)[0])?.focus();
  }

  function close(dialog) {
    if (current?.dialog !== dialog) return;
    const { returnFocus, overflow, siblings } = current;
    current = null;
    dialog.classList.add('hidden');
    for (const [node, inert] of siblings) node.inert = inert;
    document.documentElement.style.overflow = overflow;
    if (returnFocus?.isConnected) returnFocus.focus();
  }

  document.addEventListener('keydown', event => {
    if (!current) return;
    const { dialog } = current;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(dialog);
    } else if (event.key === 'Tab') {
      const nodes = controls(dialog);
      const first = nodes[0], last = nodes.at(-1);
      const active = document.activeElement;
      if (!first || !dialog.contains(active) || active === (event.shiftKey ? first : last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  });

  window.NotePresoDialog = { open, close };
})();
