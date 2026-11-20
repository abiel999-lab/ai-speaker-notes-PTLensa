(() => {
  const form = document.querySelector('#job-form');
  const status = document.querySelector('#notes-draft-status');
  const fields = ['model', 'language', 'audience', 'depth', 'note_length', 'custom_word_limit',
    'custom_instructions', 'use_vision', 'notes_mode'];
  const files = ['file', 'reference_document'];
  const touched = new Set();
  let database;
  let owner;

  function openDrafts() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('notepreso-speaker-notes', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function key(name) { return `${owner}:${name}`; }

  function save(names) {
    if (!database) return;
    const transaction = database.transaction('drafts', 'readwrite');
    const store = transaction.objectStore('drafts');
    names.forEach(name => {
      const input = form.elements.namedItem(name);
      store.put(files.includes(name) ? input.files[0] ?? null : input.value, key(name));
    });
    transaction.oncomplete = () => { status.textContent = 'Draft saved on this device.'; };
    transaction.onabort = storageUnavailable;
  }

  function storageUnavailable() {
    status.textContent = 'This browser could not save the draft. Keep this tab open to keep your selections.';
  }

  function remember(event) {
    const {name, type} = event.target;
    if (!fields.includes(name) && !files.includes(name)) return;
    if (type === 'file' && event.type === 'input') return;
    touched.add(name);
    save([name]);
  }

  form.addEventListener('input', remember);
  form.addEventListener('change', remember);
  // File changes from drag-and-drop and file validation can be non-bubbling.
  files.forEach(name => form.elements.namedItem(name).addEventListener('change', event => {
    if (!event.bubbles) remember(event);
  }));
  form.elements.reference_document.addEventListener('notepreso:reference-invalid', remember);
  form.addEventListener('click', event => {
    if (!event.target.closest('[data-preset]')) return;
    const presetFields = ['audience', 'depth', 'note_length'];
    presetFields.forEach(name => touched.add(name));
    save(presetFields);
  });

  async function restore() {
    const response = await fetch('/api/v1/auth/me', {cache: 'no-store', signal: AbortSignal.timeout(15000)});
    if (!response.ok) return;
    const auth = await response.json();
    if (!auth.authenticated || !auth.username) return;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth.username));
    owner = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const storeDatabase = await openDrafts();
    const store = storeDatabase.transaction('drafts').objectStore('drafts');
    const values = await Promise.all([...fields, ...files].map(name => new Promise((resolve, reject) => {
      const request = store.get(key(name));
      request.onsuccess = () => resolve([name, request.result]);
      request.onerror = () => reject(request.error);
    })));

    let restored = false;
    const pending = [...touched];
    for (const [name, value] of values) {
      if (touched.has(name) || value == null) continue;
      const input = form.elements.namedItem(name);
      if (files.includes(name)) {
        if (!(value instanceof File)) continue;
        const transfer = new DataTransfer();
        transfer.items.add(value);
        input.files = transfer.files;
      } else {
        if (input instanceof HTMLSelectElement && !Array.from(input.options).some(option => option.value === value && !option.disabled)) continue;
        input.value = value;
      }
      input.dispatchEvent(new Event('change', {bubbles: true}));
      restored = true;
    }
    if (restored) {
      form.elements.custom_instructions.dispatchEvent(new Event('input', {bubbles: true}));
      status.textContent = 'Draft restored from this device.';
    }
    database = storeDatabase;
    if (pending.length) save(pending);
  }

  document.addEventListener('DOMContentLoaded', () => { void restore().catch(storageUnavailable); }, {once: true});
})();
