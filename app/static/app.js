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
let lastJobId = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function updateModeWarning() {
  replaceWarning.classList.toggle('hidden', notesMode.value !== 'replace_all');
}

notesMode.addEventListener('change', updateModeWarning);
updateModeWarning();

async function poll(jobId) {
  for (;;) {
    const response = await fetch(`/api/v1/jobs/${jobId}`, {headers: {'Accept': 'application/json'}});
    if (!response.ok) throw new Error('Unable to read processing status.');
    const job = await response.json();
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
        const recovery = (job.resumed_slide_count || job.recovered_slide_count)
          ? ` · resumed ${job.resumed_slide_count} · recovered ${job.recovered_slide_count}`
          : '';
        const warning = (job.warnings && job.warnings.length) ? ` · warning: ${job.warnings[0]}` : '';
        usageSummary.textContent = `${job.model} · ${job.total_tokens.toLocaleString()} tokens · ${job.request_count} API request(s) · vision ${visionLabel} · preflight $${preflight} · actual estimate $${cost}${recovery}${warning}`;
        usageSummary.classList.remove('hidden');
      } else {
        usageSummary.classList.add('hidden');
      }
      download.href = job.download_url;
      download.classList.remove('hidden');
      submit.disabled = false;
      return;
    }
    if (job.status === 'failed') {
      submit.disabled = false;
      retry.classList.remove('hidden');
      throw new Error(job.error || 'Processing failed.');
    }
    await sleep(750);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (notesMode.value === 'replace_all') {
    const approved = window.confirm(
      'Mode “Ganti semua” akan mengganti speaker notes yang sudah ada pada file hasil. Lanjutkan?'
    );
    if (!approved) return;
  }
  if (engine.value === 'openai') {
    const approved = window.confirm(
      `Mode OpenAI akan mengirim konten slide${useVision.value === 'true' ? ' dan screenshot target slide' : ''} ke OpenAI API dan menggunakan kredit API. Lanjutkan?`
    );
    if (!approved) return;
  }

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
    const response = await fetch('/api/v1/jobs', {
      method: 'POST',
      headers: {'X-Requested-With': 'fetch'},
      body: new FormData(form),
    });
    const payload = await response.json();
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
  statusTitle.textContent = 'RETRYING';
  statusMessage.textContent = 'Retrying failed job and reusing compatible AI checkpoints';
  try {
    const response = await fetch(`/api/v1/jobs/${lastJobId}/retry`, {
      method: 'POST',
      headers: {'X-Requested-With': 'fetch', 'Accept': 'application/json'},
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Retry request failed.');
    retry.classList.add('hidden');
    await poll(lastJobId);
  } catch (error) {
    statusTitle.textContent = 'FAILED';
    statusMessage.textContent = error.message;
    retry.classList.remove('hidden');
  } finally {
    retry.disabled = false;
  }
});
