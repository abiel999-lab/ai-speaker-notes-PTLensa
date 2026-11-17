#!/usr/bin/env node
/** Destructive only to the test project it creates. No paid AI calls. */
const base = new URL(process.env.QA_ORIGIN || 'http://127.0.0.1:4310');
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol)) {
  throw new Error('QA_LOCAL_ONLY: refusing to access non-loopback application');
}
if (base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('QA_ORIGIN must be a bare local origin');
}
const origin = base.origin;
async function call(url, { method = 'GET', body } = {}) {
  const response = await fetch(origin + '/api' + url, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: body ? { 'content-type': 'application/json', Origin: origin } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`${method} ${url}: ${response.status} ${data.error || 'REQUEST_FAILED'}`);
  }
  if (url.endsWith('/export')) return response.arrayBuffer();
  return response.json();
}
let projectId;
let finished = false;
try {
  const health = await call('/health');
  if (!health.ok) throw new Error('Health check failed');
  const capabilities = await call('/capabilities');
  if (capabilities.mode !== 'local') throw new Error('QA requires local mode');
  const { source } = await call('/sample');
  const { project } = await call('/projects', {
    method: 'POST',
    body: { name: `QA automated smoke ${Date.now()}`, source, mode: 'markdown' },
  });
  projectId = project.id;
  const { generation } = await call(`/projects/${project.id}/generate`, {
    method: 'POST',
    body: { settings: {
      theme: 'ivory', mode: 'markdown', useAI: false, images: false,
      template: 'editorial', density: 'comfortable', fontScale: 1,
    } },
  });
  const deadline = Date.now() + 150000;
  let job;
  do {
    await new Promise(resolve => setTimeout(resolve, 1000));
    ({ generation: job } = await call(`/generations/${generation.id}`));
    if (['failed', 'cancelled', 'ready'].includes(job.status)) break;
  } while (Date.now() < deadline);
  if (job.status !== 'ready') throw new Error(`Generation incomplete: ${job.status} ${job.error || ''}`);
  if (!job.report?.passed || !job.report?.exportVerified) throw new Error('Source fidelity verification failed');
  const validation = await call(`/generations/${generation.id}/validation`);
  if (!validation.passed || !validation.orderValid) throw new Error('PowerPoint validation failed');
  const pptx = new Uint8Array(await call(`/generations/${generation.id}/export`));
  if (pptx.length < 20000 || pptx[0] !== 0x50 || pptx[1] !== 0x4B)
    throw new Error('PowerPoint file does not have a valid ZIP header');
  finished = true;
  console.log(JSON.stringify({ result: 'PASS', projectId, generationId: generation.id,
    slides: job.scene?.slides.length, bytes: pptx.length,
    originalTextVerified: true, aiCharged: false, renderedPreview: job.preview === 'rendered' }, null, 2));
} catch (error) {
  console.error('LOCAL_SMOKE_FAIL:', error instanceof Error ? error.message : 'UNKNOWN_ERROR');
  process.exitCode = 1;
} finally {
  if (projectId && finished) {
    try {
      await call('/projects/' + projectId, { method: 'DELETE' });
      console.log('QA test project deleted; other data untouched.');
    } catch { console.error('QA test project could not be deleted, id:', projectId); }
  } else if (projectId) {
    console.error('QA test project retained for investigation, id:', projectId);
  }
}
