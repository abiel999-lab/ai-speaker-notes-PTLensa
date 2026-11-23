import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const server = pathToFileURL(path.resolve('server-dist/server') + path.sep);
const { createApp } = await import(new URL('app.js', server));
const { createJournalDeck } = await import(new URL('journal-service.js', server));

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'notepreso-pdf-math-qa-'));
const origin = 'localhost:14310';
const { app } = await createApp({ root, production: false, host: '127.0.0.1', port: 14310, origin: `http://${origin}`, render: false, model: 'gpt-6-luna' });
const send = async (method, url, payload, status = 200) => {
    const response = await app.inject({ method, url, payload, headers: { host: origin } });
    assert.equal(response.statusCode, status, response.body.slice(0, 1000));
    return response;
};
globalThis.fetch = () => { throw Error('Unexpected external request in Full Copy'); };
try {
    const filename = process.argv[2] ?? new URL('./vector-math.pdf', import.meta.url).pathname;
    const name = path.basename(filename);
    const base64 = (await fs.readFile(filename)).toString('base64');
    const uploaded = (await send('POST', '/api/document/import', { name, base64 })).json();
    const { source, documentId, visuals, pdfPages, orderedVisuals, inlineImageCount } = uploaded;
    assert.equal(inlineImageCount, 2, JSON.stringify(uploaded));
    assert.match(source, /\\\[\nI=\\int_0\^2/);
    assert.match(source, /\\unsupported/);
    const workspace = { kind: 'document', brief: '', policy: 'draft', resources: [
        { id: randomUUID(), name, text: source, documentId, visuals, pdfPages, orderedVisuals, inlineImageCount, role: 'full-copy' },
    ] };
    const prepared = (await send('POST', '/api/workspace/draft', { workspace, model: 'gpt-6-luna', language: 'English', sections: 3 })).json();
    const project = (await send('POST', '/api/projects', { name: 'PDF Math QA', source: prepared.source, mode: 'markdown', workspace })).json().project;
    const { id } = (await send('POST', `/api/projects/${project.id}/generate`, {
        settings: { theme: 'ivory', mode: 'markdown', images: false, creationMode: 'creative', model: 'gpt-6-luna', useAI: false },
    }, 202)).json().generation;
    let job;
    const deadline = Date.now() + 30000;
    do {
        job = (await send('GET', `/api/generations/${id}`)).json().generation;
        assert.notEqual(job.status, 'failed', job.error);
        if (job.status !== 'ready') await new Promise(resolve => setTimeout(resolve, 250));
    } while (job.status !== 'ready' && Date.now() < deadline);
    assert.equal(job.status, 'ready');
    assert.equal(job.report.documentCoverage.verifiedPdfPictures, 2);
    const objects = job.scene.slides.flatMap(slide => slide.objects);
    const before = objects.findIndex(object => object.text?.startsWith('Before the displayed formula'));
    const crop = objects.findIndex(object => object.inlineSourceImage && object.altText.startsWith('Vector detail'));
    const after = objects.findIndex(object => object.text?.startsWith('After the displayed formula'));
    assert.ok(before >= 0 && crop > before && after > crop);
    assert.equal(objects.filter(object => object.equation).length, 1);
    const exported = await send('GET', `/api/generations/${id}/export`);
    const zip = await JSZip.loadAsync(exported.rawPayload);
    const slides = (await Promise.all(Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .map(name => zip.file(name).async('string')))).join('\n');
    assert.match(slides, /eq-part-/);
    assert.match(slides, /∫/);
    assert.doesNotMatch(slides, /\\frac\{1\}\{2\}/);
    assert.match(slides, /\\unsupported/);
    const journal = await createJournalDeck(Buffer.from(base64, 'base64'), name, {
        standardHeadings: true, journalRole: 'full-copy', reviewOutput: true, signal: AbortSignal.timeout(30000),
    });
    assert.equal(journal.manifest.appendix.length, 1);
    assert.equal(journal.manifest.mapping.length, 1);
    assert.equal(journal.manifest.verification.documentCoverage.verifiedPdfPictures, 2);
    const journalZip = await JSZip.loadAsync(journal.bytes);
    const journalSlides = (await Promise.all(Object.keys(journalZip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .map(name => journalZip.file(name).async('string')))).join('\n');
    assert.match(journalSlides, /eq-part-/);
    assert.match(journalSlides, /∫/);
    assert.doesNotMatch(journalSlides, /\\frac\{1\}\{2\}/);
    console.log(JSON.stringify({ status: 'passed', vectorAndEmbeddedImages: 2, renderedEquations: 1, slides: job.scene.slides.length, journalSlides: journal.manifest.slides }));
} finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
}
