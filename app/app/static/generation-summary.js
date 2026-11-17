(() => {
  'use strict';
  document.querySelectorAll('[data-generation-summary]').forEach(summary => {
    const form = summary.closest('form');
    const language = form?.querySelector('[name="language"]');
    const notesMode = form?.querySelector('[name="notes_mode"]');
    if (!form || !language || !notesMode) return;

    function update() {
      const indonesian = typeof getLanguage === 'function' && getLanguage() === 'id';
      const mode = notesMode.value;
      const descriptions = indonesian ? {
        missing_only: 'Hanya isi notes kosong: notes yang sudah ada tetap dalam bahasa aslinya.',
        append: 'Tambahkan notes baru setelah notes yang sudah ada.',
        replace_all: 'Ganti semua notes: notes yang sudah ada akan diganti pada file hasil.'
      } : {
        missing_only: 'Fill empty notes only: existing notes stay in their original language.',
        append: 'Add new notes after existing notes.',
        replace_all: 'Replace all notes: existing notes will be replaced in the output copy.'
      };
      const outputLanguage = language.selectedOptions[0]?.textContent.trim() || language.value;
      summary.textContent = indonesian
        ? `Bahasa notes: ${outputLanguage}. ${descriptions[mode] || ''} File asli tetap tidak berubah.`
        : `Notes in ${outputLanguage}. ${descriptions[mode] || ''} Your original file stays unchanged.`;
      summary.classList.toggle('generation-summary--replace', mode === 'replace_all');
    }

    language.addEventListener('change', update);
    notesMode.addEventListener('change', update);
    form.addEventListener('reset', () => setTimeout(update, 0));
    document.addEventListener('asn:languagechange', update);
    update();
  });
})();
