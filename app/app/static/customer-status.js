(() => {
  'use strict';
  window.notePresoSlideProgress = job => {
    const done = Number(job.generated_notes_count);
    const total = Number(job.target_slide_count);
    if (!Number.isInteger(done) || !Number.isInteger(total) || done < 0 || total <= 0 || done > total) return null;
    if (job.status === 'completed') return { label: `${done} of ${total} slides ready`, percent: 100 };
    if (job.status !== 'processing') return null;
    return { label: `${done} of ${total} slides drafted`, percent: Math.round(100 * done / total) };
  };
  window.notePresoJobSummary = job => {
    const count = value => Math.max(0, Math.floor(Number(value) || 0));
    const indonesian = typeof getLanguage === 'function' && getLanguage() === 'id';
    if (job.status === 'completed') {
      const generated = count(job.generated_notes_count), preserved = count(job.preserved_existing_notes_count);
      return indonesian
        ? `Notes ditambahkan ke ${generated} slide. ${preserved} notes yang sudah ada dipertahankan. File hasil siap diunduh.`
        : `Notes added to ${generated} slide${generated === 1 ? '' : 's'}. ${preserved} existing note${preserved === 1 ? '' : 's'} kept. Your file is ready to download.`;
    }
    if (job.status === 'queued') return indonesian ? 'File Anda menunggu giliran untuk diproses.' : 'Your presentation is waiting to be processed.';
    if (job.status === 'processing') return indonesian ? 'Sedang menyiapkan notes untuk presentasi Anda.' : 'Preparing speaker notes for your presentation.';
    return job.error || job.message || '';
  };
})();
