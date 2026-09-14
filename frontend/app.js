const cfg = window.AISPEAKER_CONFIG || {};
const API_BASE = String(cfg.apiBaseUrl || '').replace(/\/$/, '');
const $ = (selector) => document.querySelector(selector);
const form = $('#job-form');
const submit = $('#submit');
const statusBox = $('#status');
const statusTitle = $('#status-title');
const statusCount = $('#status-count');
const statusMessage = $('#status-message');
const progressBar = $('#progress-bar');
const download = $('#download');
const notesMode = $('#notes-mode');
const engine = $('#engine');
const replaceWarning = $('#replace-warning');
const resultSummary = $('#result-summary');
const usageSummary = $('#usage-summary');
const warningList = $('#warning-list');
const diagnostics = $('#diagnostics');
const useVision = $('#use-vision');
const retry = $('#retry');
const noteLength = $('#note-length');
const customWordField = $('#custom-word-field');
const customWordLimit = $('#custom-word-limit');
const customInstructions = $('#custom-instructions');
const customInstructionsCount = $('#custom-instructions-count');
const fileInput = $('#file');
const fileName = $('#file-name');
const dropZone = $('#drop-zone');
let lastJobId = null;
let lastDownloadUrl = null;
let lastFilename = 'presentation-with-speaker-notes.pptx';
let currentLang = localStorage.getItem('ai-speaker-ui-lang') || 'id';

const copy = {
  id: {
    eyebrow:'AI POWERPOINT WORKFLOW', heroTitle:'Speaker notes yang lebih aman, jelas, dan tahan terhadap file PowerPoint nyata.', heroLead:'Upload PPTX, pilih gaya narasi, lalu sistem memeriksa struktur deck, menganalisis teks dan visual, menjaga notes lama, serta memvalidasi file hasil sebelum diunduh.', reliabilityTitle:'Reliability-first processing', reliabilityText:'Hidden slide, image-only slide, renderer fallback, checkpoint, dan integrity validation ditangani sebagai bagian dari pipeline.', backendLabel:'Backend', visionLabel:'Visual analysis', workspaceKicker:'NEW JOB', workspaceTitle:'Process presentation', safeBadge:'Original file stays untouched', uploadTitle:'Choose PowerPoint file', uploadHint:'Drag & drop or click to browse .pptx', aiSettingsTitle:'AI settings', aiSettingsHelp:'Atur bahasa, audiens, kedalaman, dan target panjang narasi.', generatorLabel:'Generator', languageLabel:'Bahasa output', audienceLabel:'Audiens', depthLabel:'Kedalaman analisis', depthHelp:'Medium direkomendasikan untuk keseimbangan kualitas, waktu, dan biaya.', lengthLabel:'Jumlah kata per slide', lengthHelp:'Slide judul atau transisi dapat lebih singkat bila memang tidak membutuhkan narasi panjang.', customLimitLabel:'Batas kata custom', customLimitHelp:'30–600 kata per slide.', instructionsLabel:'Instruksi tambahan <em>opsional</em>', safetyTitle:'Visual & safety', safetyHelp:'Pilih bagaimana visual dianalisis dan bagaimana notes lama diperlakukan.', visionModeLabel:'Mode analisis', visionOption:'Text + image analysis — recommended', textOnlyOption:'Text-only — lower cost', visionHelp:'Mode visual direkomendasikan untuk grafik, diagram, gambar, dan slide yang teksnya sedikit.', notesModeLabel:'Speaker notes existing', missingOnlyOption:'Isi hanya slide tanpa notes — safest', appendOption:'Tambahkan ke notes lama', replaceOption:'Ganti semua notes', notesModeHelp:'Default menjaga speaker notes yang sudah ada.', privacyText:'File upload divalidasi sebagai paket PPTX. Aplikasi tidak mengambil gambar eksternal dari URL untuk mencegah akses jaringan yang tidak aman.', processButton:'Process presentation', jobStatusLabel:'JOB STATUS', diagSlides:'Visual coverage', diagHidden:'Hidden slides', diagImage:'Image-dominant', diagExternal:'External media', downloadButton:'Download result PPTX', retryButton:'Retry failed job', feature1Title:'Hidden-slide aware', feature1Text:'Nomor slide dipertahankan saat renderer menemui hidden slides, sehingga gambar tidak bergeser ke slide yang salah.', feature2Title:'Per-slide recovery', feature2Text:'Satu slide gagal dirender tidak lagi mematikan Vision untuk seluruh deck.', feature3Title:'Package integrity', feature3Text:'Output diperiksa ulang agar struktur OOXML dan visible content tetap aman.', feature4Title:'Resume & checkpoints', feature4Text:'Retry dapat memakai hasil AI yang sudah valid agar tidak selalu mengulang dari awal.'
  },
  en: {
    eyebrow:'AI POWERPOINT WORKFLOW', heroTitle:'Safer, clearer speaker notes built for real-world PowerPoint files.', heroLead:'Upload a PPTX, choose the narration style, and the system will inspect the deck structure, analyze text and visuals, preserve existing notes, and validate the output before download.', reliabilityTitle:'Reliability-first processing', reliabilityText:'Hidden slides, image-only slides, renderer fallback, checkpoints, and integrity validation are handled as part of the pipeline.', backendLabel:'Backend', visionLabel:'Visual analysis', workspaceKicker:'NEW JOB', workspaceTitle:'Process presentation', safeBadge:'Original file stays untouched', uploadTitle:'Choose PowerPoint file', uploadHint:'Drag & drop or click to browse .pptx', aiSettingsTitle:'AI settings', aiSettingsHelp:'Choose output language, audience, reasoning depth, and note length.', generatorLabel:'Generator', languageLabel:'Output language', audienceLabel:'Audience', depthLabel:'Analysis depth', depthHelp:'Medium is recommended for a balance of quality, speed, and cost.', lengthLabel:'Words per slide', lengthHelp:'Title or transition slides may be shorter when extra narration would be artificial.', customLimitLabel:'Custom word limit', customLimitHelp:'30–600 words per slide.', instructionsLabel:'Additional instructions <em>optional</em>', safetyTitle:'Visual & safety', safetyHelp:'Choose how visuals are analyzed and how existing notes should be handled.', visionModeLabel:'Analysis mode', visionOption:'Text + image analysis — recommended', textOnlyOption:'Text-only — lower cost', visionHelp:'Visual mode is recommended for charts, diagrams, images, and slides with little extractable text.', notesModeLabel:'Existing speaker notes', missingOnlyOption:'Fill only slides without notes — safest', appendOption:'Append to existing notes', replaceOption:'Replace all notes', notesModeHelp:'The default preserves existing speaker notes.', privacyText:'Uploads are validated as PPTX packages. The application does not fetch external image URLs, reducing unsafe network access.', processButton:'Process presentation', jobStatusLabel:'JOB STATUS', diagSlides:'Visual coverage', diagHidden:'Hidden slides', diagImage:'Image-dominant', diagExternal:'External media', downloadButton:'Download result PPTX', retryButton:'Retry failed job', feature1Title:'Hidden-slide aware', feature1Text:'Slide numbers stay aligned when renderers encounter hidden slides, preventing the wrong image from being matched to a slide.', feature2Title:'Per-slide recovery', feature2Text:'One slide rendering failure no longer disables Vision for the entire deck.', feature3Title:'Package integrity', feature3Text:'The output is checked again so OOXML structure and visible content remain intact.', feature4Title:'Resume & checkpoints', feature4Text:'Retries can reuse valid AI work instead of starting over every time.'
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const apiUrl = (path) => `${API_BASE}${path}`;
const t = (key) => (copy[currentLang] && copy[currentLang][key]) || key;

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('ai-speaker-ui-lang', lang);
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = t(el.dataset.i18n);
    if (value.includes('<em>')) el.innerHTML = value; else el.textContent = value;
  });
  document.querySelectorAll('.lang-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.lang === lang));
  customInstructions.placeholder = lang === 'id'
    ? 'Contoh: gunakan gaya akademik, tekankan implikasi kebijakan, pertahankan istilah teknis tertentu.'
    : 'Example: use an academic tone, emphasize policy implications, and preserve specific technical terms.';
  updateModeWarning();
}

document.querySelectorAll('.lang-btn').forEach((btn) => btn.addEventListener('click', () => applyLanguage(btn.dataset.lang)));

function updateModeWarning() {
  replaceWarning.classList.toggle('hidden', notesMode.value !== 'replace_all');
  replaceWarning.textContent = currentLang === 'id'
    ? 'Mode ini mengganti seluruh speaker notes pada file hasil. File upload asli tetap tidak disentuh.'
    : 'This mode replaces all speaker notes in the output file. The original upload remains untouched.';
}
notesMode.addEventListener('change', updateModeWarning);

function updateWordLimitField() {
  const custom = noteLength.value === 'Custom';
  customWordField.classList.toggle('hidden', !custom);
  customWordLimit.disabled = !custom;
  customWordLimit.required = custom;
}
noteLength.addEventListener('change', updateWordLimitField);

function updateCustomInstructionsCount() { customInstructionsCount.textContent = String(customInstructions.value.length); }
customInstructions.addEventListener('input', updateCustomInstructionsCount);

function showFileName(file) {
  if (!file) return;
  const mb = (file.size / (1024 * 1024)).toFixed(2);
  fileName.textContent = `${file.name} · ${mb} MB`;
}
fileInput.addEventListener('change', () => showFileName(fileInput.files[0]));
['dragenter','dragover'].forEach((name) => dropZone.addEventListener(name, (e) => { e.preventDefault(); dropZone.classList.add('dragover'); }));
['dragleave','drop'].forEach((name) => dropZone.addEventListener(name, (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); }));
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const dt = new DataTransfer(); dt.items.add(file); fileInput.files = dt.files; showFileName(file);
});

async function loadCapabilities() {
  if (!API_BASE || API_BASE.includes('PASTE_CLOUD_RUN_URL_HERE')) {
    $('#backend-state').textContent = 'Not configured'; $('#backend-version').textContent = 'Edit config.js'; submit.disabled = true; return;
  }
  try {
    const response = await fetch(apiUrl('/api/v1/capabilities'), {headers:{Accept:'application/json'}});
    if (!response.ok) throw new Error('Backend unavailable');
    const data = await response.json();
    $('#backend-state').textContent = 'Ready'; $('#backend-version').textContent = `v${data.version}`;
    $('#openai-state').textContent = data.openai_configured ? 'Ready' : 'Not configured'; $('#openai-model').textContent = data.openai_model || '-';
    $('#vision-state').textContent = data.vision_ready ? 'Ready' : (data.vision_enabled ? 'Renderer missing' : 'Disabled'); $('#vision-renderer').textContent = data.renderer || 'Text-only available';
    $('#upload-help').textContent = currentLang === 'id' ? `Maksimum ${data.max_upload_mb} MB. File asli tidak dimodifikasi.` : `Maximum ${data.max_upload_mb} MB. The original file is not modified.`;
    if (!data.vision_ready) useVision.querySelector('option[value="true"]').disabled = true;
  } catch (error) { $('#backend-state').textContent = 'Offline'; $('#backend-version').textContent = error.message; submit.disabled = true; }
}

function showWarnings(warnings) {
  const items = Array.isArray(warnings) ? warnings : [];
  warningList.innerHTML = '';
  if (!items.length) { warningList.classList.add('hidden'); return; }
  items.forEach((item) => { const p = document.createElement('p'); p.textContent = `⚠ ${item}`; warningList.appendChild(p); });
  warningList.classList.remove('hidden');
}

function showDiagnostics(job) {
  diagnostics.classList.remove('hidden');
  const target = Number(job.vision_target_count || 0); const rendered = Number(job.vision_rendered_count || 0);
  $('#diag-vision').textContent = target ? `${rendered}/${target}` : '—';
  $('#diag-hidden').textContent = String(job.hidden_slide_count || 0);
  $('#diag-images').textContent = String(job.image_dominant_slide_count || 0);
  $('#diag-external').textContent = String(job.external_image_count || 0);
}

async function poll(jobId) {
  for (;;) {
    const response = await fetch(apiUrl(`/api/v1/jobs/${jobId}`), {headers:{Accept:'application/json'}});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'Unable to read processing status.');
    const job = payload;
    statusTitle.textContent = job.status.toUpperCase(); statusMessage.textContent = job.error || job.message;
    statusCount.textContent = job.progress_total ? `${job.progress_current}/${job.progress_total}` : '';
    const pct = job.progress_total ? (job.progress_current / job.progress_total) * 100 : 5; progressBar.style.width = `${Math.max(5, pct)}%`;
    if (job.status === 'completed') {
      retry.classList.add('hidden'); showDiagnostics(job); showWarnings(job.warnings);
      resultSummary.textContent = currentLang === 'id'
        ? `Notes lama: ${job.existing_notes_count} · Dibuat: ${job.generated_notes_count} · Dipertahankan: ${job.preserved_existing_notes_count}`
        : `Existing notes: ${job.existing_notes_count} · Generated: ${job.generated_notes_count} · Preserved: ${job.preserved_existing_notes_count}`;
      resultSummary.classList.remove('hidden');
      if (job.provider === 'openai') {
        const cost = Number(job.estimated_cost_usd || 0).toFixed(4); const preflight = Number(job.preflight_estimated_cost_usd || 0).toFixed(4);
        const imageLabel = job.used_vision ? `${job.vision_rendered_count || 0}/${job.vision_target_count || 0} via ${job.vision_renderer || 'renderer'}` : 'off';
        usageSummary.textContent = `${job.model} · ${Number(job.total_tokens || 0).toLocaleString()} tokens · ${job.request_count} API request(s) · visual ${imageLabel} · preflight $${preflight} · estimate $${cost}`;
        usageSummary.classList.remove('hidden');
      }
      lastDownloadUrl = job.download_url; lastFilename = `${job.original_filename.replace(/\.pptx$/i,'')}-with-speaker-notes.pptx`; download.classList.remove('hidden'); submit.disabled = false; return;
    }
    if (job.status === 'failed') { submit.disabled = false; retry.classList.remove('hidden'); throw new Error(job.error || 'Processing failed.'); }
    await sleep(900);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (notesMode.value === 'replace_all') {
    const msg = currentLang === 'id' ? 'Mode “Ganti semua” akan mengganti speaker notes pada file hasil. Lanjutkan?' : 'Replace all will overwrite speaker notes in the output file. Continue?';
    if (!window.confirm(msg)) return;
  }
  if (engine.value === 'openai') {
    const msg = currentLang === 'id' ? `OpenAI akan memproses konten slide${useVision.value === 'true' ? ' dan screenshot slide' : ''} serta menggunakan kredit API. Lanjutkan?` : `OpenAI will process slide content${useVision.value === 'true' ? ' and slide screenshots' : ''} and use API credits. Continue?`;
    if (!window.confirm(msg)) return;
  }
  submit.disabled = true; download.classList.add('hidden'); retry.classList.add('hidden'); resultSummary.classList.add('hidden'); usageSummary.classList.add('hidden'); warningList.classList.add('hidden'); diagnostics.classList.add('hidden'); statusBox.classList.remove('hidden');
  statusTitle.textContent = 'UPLOADING'; statusMessage.textContent = currentLang === 'id' ? 'Mengunggah dan memvalidasi paket PowerPoint…' : 'Uploading and validating PowerPoint package…'; progressBar.style.width = '5%';
  try {
    const response = await fetch(apiUrl('/api/v1/jobs'), {method:'POST', headers:{'X-Requested-With':'fetch'}, body:new FormData(form)});
    const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.detail || 'Upload failed.'); lastJobId = payload.id; await poll(payload.id);
  } catch (error) { statusTitle.textContent = 'FAILED'; statusMessage.textContent = error.message; submit.disabled = false; }
});

retry.addEventListener('click', async () => {
  if (!lastJobId) return; retry.disabled = true;
  try {
    const response = await fetch(apiUrl(`/api/v1/jobs/${lastJobId}/retry`), {method:'POST', headers:{'X-Requested-With':'fetch',Accept:'application/json'}}); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.detail || 'Retry failed.'); retry.classList.add('hidden'); await poll(lastJobId);
  } catch (error) { statusTitle.textContent = 'FAILED'; statusMessage.textContent = error.message; } finally { retry.disabled = false; }
});

download.addEventListener('click', async () => {
  if (!lastDownloadUrl) return; download.disabled = true;
  try {
    const response = await fetch(apiUrl(lastDownloadUrl)); if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.detail || 'Download failed.'); }
    const blob = await response.blob(); const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = lastFilename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (error) { statusMessage.textContent = error.message; } finally { download.disabled = false; }
});

applyLanguage(currentLang); updateWordLimitField(); updateCustomInstructionsCount(); loadCapabilities();
