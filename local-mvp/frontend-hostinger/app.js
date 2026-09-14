const cfg = window.AISPEAKER_CONFIG || {};
const API_BASE = String(cfg.apiBaseUrl || '').replace(/\/$/, '');
const form = document.querySelector('#job-form');
const submit = document.querySelector('#submit');
const statusBox = document.querySelector('#status');
const statusTitle = document.querySelector('#status-title');
const statusCount = document.querySelector('#status-count');
const statusMessage = document.querySelector('#status-message');
const progressBar = document.querySelector('#progress-bar');
const download = document.querySelector('#download');
const notesMode = document.querySelector('#notes-mode');
const engine = document.querySelector('#engine');
const replaceWarning = document.querySelector('#replace-warning');
const resultSummary = document.querySelector('#result-summary');
const usageSummary = document.querySelector('#usage-summary');
const useVision = document.querySelector('#use-vision');
const retry = document.querySelector('#retry');
const demoKey = document.querySelector('#demo-key');
let lastJobId = null;
let lastDownloadUrl = null;
let lastFilename = 'presentation-with-speaker-notes.pptx';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const apiUrl = (path) => `${API_BASE}${path}`;

function accessHeaders(extra = {}) {
  const key = demoKey.value.trim();
  if (key) sessionStorage.setItem('aispeaker-demo-key', key);
  return {...extra, ...(key ? {'X-Demo-Key': key} : {})};
}

function updateModeWarning() {
  replaceWarning.classList.toggle('hidden', notesMode.value !== 'replace_all');
}
notesMode.addEventListener('change', updateModeWarning);
updateModeWarning();

demoKey.value = sessionStorage.getItem('aispeaker-demo-key') || '';

async function loadCapabilities() {
  if (!API_BASE || API_BASE.includes('PASTE_CLOUD_RUN_URL_HERE')) {
    document.querySelector('#backend-state').textContent = 'Not configured';
    document.querySelector('#backend-version').textContent = 'Edit config.js';
    submit.disabled = true;
    return;
  }
  try {
    const response = await fetch(apiUrl('/api/v1/capabilities'), {headers: {'Accept': 'application/json'}});
    if (!response.ok) throw new Error('Backend unavailable');
    const data = await response.json();
    document.querySelector('#backend-state').textContent = 'Ready';
    document.querySelector('#backend-version').textContent = `v${data.version}`;
    document.querySelector('#openai-state').textContent = data.openai_configured ? 'Ready' : 'Not configured';
    document.querySelector('#openai-model').textContent = data.openai_model || '-';
    document.querySelector('#vision-state').textContent = data.vision_ready ? 'Ready' : (data.vision_enabled ? 'Renderer missing' : 'Disabled');
    document.querySelector('#vision-renderer').textContent = data.renderer || 'Text-only available';
    document.querySelector('#upload-help').textContent = `Maksimum ${data.max_upload_mb} MB. File asli tidak dimodifikasi.`;
    if (!data.vision_ready) useVision.querySelector('option[value="true"]').disabled = true;
    if (data.demo_access_required) demoKey.required = true;
  } catch (error) {
    document.querySelector('#backend-state').textContent = 'Offline';
    document.querySelector('#backend-version').textContent = error.message;
  }
}

async function poll(jobId) {
  for (;;) {
    const response = await fetch(apiUrl(`/api/v1/jobs/${jobId}`), {headers: accessHeaders({'Accept': 'application/json'})});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'Unable to read processing status.');
    const job = payload;
    statusTitle.textContent = job.status.toUpperCase();
    statusMessage.textContent = job.error || job.message;
    statusCount.textContent = job.progress_total ? `${job.progress_current}/${job.progress_total}` : '';
    const pct = job.progress_total ? (job.progress_current / job.progress_total) * 100 : 5;
    progressBar.style.width = `${Math.max(5, pct)}%`;

    if (job.status === 'completed') {
      retry.classList.add('hidden');
      resultSummary.textContent = `Existing notes: ${job.existing_notes_count} · Generated: ${job.generated_notes_count} · Preserved: ${job.preserved_existing_notes_count}`;
      resultSummary.classList.remove('hidden');
      if (job.provider === 'openai') {
        const cost = Number(job.estimated_cost_usd || 0).toFixed(4);
        const preflight = Number(job.preflight_estimated_cost_usd || 0).toFixed(4);
        const visionLabel = job.used_vision ? `on (${job.vision_renderer || 'renderer'})` : 'off';
        usageSummary.textContent = `${job.model} · ${Number(job.total_tokens || 0).toLocaleString()} tokens · ${job.request_count} API request(s) · vision ${visionLabel} · preflight $${preflight} · actual estimate $${cost}`;
        usageSummary.classList.remove('hidden');
      }
      lastDownloadUrl = job.download_url;
      lastFilename = `${job.original_filename.replace(/\.pptx$/i, '')}-with-speaker-notes.pptx`;
      download.classList.remove('hidden');
      submit.disabled = false;
      return;
    }
    if (job.status === 'failed') {
      submit.disabled = false;
      retry.classList.remove('hidden');
      throw new Error(job.error || 'Processing failed.');
    }
    await sleep(1000);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (notesMode.value === 'replace_all' && !window.confirm('Mode “Ganti semua” akan mengganti speaker notes pada file hasil. Lanjutkan?')) return;
  if (engine.value === 'openai' && !window.confirm(`OpenAI akan memproses konten slide${useVision.value === 'true' ? ' dan screenshot target slide' : ''} serta menggunakan kredit API. Lanjutkan?`)) return;

  submit.disabled = true;
  download.classList.add('hidden');
  retry.classList.add('hidden');
  resultSummary.classList.add('hidden');
  usageSummary.classList.add('hidden');
  statusBox.classList.remove('hidden');
  statusTitle.textContent = 'UPLOADING';
  statusMessage.textContent = 'Uploading and validating PowerPoint package';
  progressBar.style.width = '5%';

  try {
    const response = await fetch(apiUrl('/api/v1/jobs'), {
      method: 'POST',
      headers: accessHeaders({'X-Requested-With': 'fetch'}),
      body: new FormData(form),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'Upload failed.');
    lastJobId = payload.id;
    await poll(payload.id);
  } catch (error) {
    statusTitle.textContent = 'FAILED';
    statusMessage.textContent = error.message;
    submit.disabled = false;
  }
});

retry.addEventListener('click', async () => {
  if (!lastJobId) return;
  retry.disabled = true;
  try {
    const response = await fetch(apiUrl(`/api/v1/jobs/${lastJobId}/retry`), {
      method: 'POST',
      headers: accessHeaders({'X-Requested-With': 'fetch', 'Accept': 'application/json'}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'Retry failed.');
    retry.classList.add('hidden');
    await poll(lastJobId);
  } catch (error) {
    statusTitle.textContent = 'FAILED';
    statusMessage.textContent = error.message;
  } finally {
    retry.disabled = false;
  }
});

download.addEventListener('click', async () => {
  if (!lastDownloadUrl) return;
  download.disabled = true;
  try {
    const response = await fetch(apiUrl(lastDownloadUrl), {headers: accessHeaders()});
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || 'Download failed.');
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = lastFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  } catch (error) {
    statusMessage.textContent = error.message;
  } finally {
    download.disabled = false;
  }
});

loadCapabilities();
