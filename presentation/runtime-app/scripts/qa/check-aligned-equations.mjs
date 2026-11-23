import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { buildFullCopyScene, parseFullCopySource } from '../../server-dist/core/full-copy.js';
import { equationParts } from '../../server-dist/core/native-equations.js';
import { exportPptx } from '../../server-dist/core/export.js';
import { pdfMultilineEquationAt } from '../../server-dist/server/pdf-vector-regions.js';

const aligned = String.raw`\[
\begin{aligned}
T &= \frac{2-0}{2}[(0+1)+(2+1)] \\
  &= 4
\end{aligned}
\]`;
const gathered = String.raw`\[
\begin{gathered}
\int_{0}^{2}(x+1)\,dx \\
= [x^2/2+x]_{0}^{2} = 4
\end{gathered}
\]`;
const region = { x: 1, y: 1, w: 11, h: 3 };
const parts = equationParts(aligned, region);
const importedBlock = pdfMultilineEquationAt(['[', String.raw`\int_{0}^{2}(x+1)\,dx`, '= 4', ']'], 0);
assert.equal(importedBlock.end, 3);
assert.equal(equationParts(importedBlock.text, region).filter(part => part.s === '4').length, 1);
assert.equal(pdfMultilineEquationAt(['[', 'References', 'See appendix', ']'], 0), undefined);
assert.equal(pdfMultilineEquationAt(['[', String.raw`\frac{1}{2}`, '[', ']'], 0), undefined);
const equals = parts.filter(part => part.s === '=');
assert.equal(equals.length, 2);
assert.ok(Math.abs(equals[0].x - equals[1].x) < 1e-6);
assert.ok(equals[1].y > equals[0].y + 0.3);
assert.equal(parts.filter(part => part.t === 'line').length, 1);
assert.throws(() => equationParts(aligned, { ...region, h: 0.1 }), /MATH_LAYOUT_SPACE/);
assert.throws(() => equationParts(String.raw`\[\begin{aligned}x &= 1 \\ \end{aligned}\]`, region), /MATH_SYNTAX/);
assert.equal(equationParts(String.raw`\[\begin{aligned}\text{A & B} &= 4\end{aligned}\]`, region).filter(part => part.s === 'A & B').length, 1);

const doc = parseFullCopySource('# Integral\n\n## Trapezoidal rule\n\n' + aligned + '\n\n## Analytical check\n\n' + gathered);
const scene = buildFullCopyScene(doc, []);
assert.equal(scene.slides.flatMap(slide => slide.objects).filter(object => object.equation).length, 2);
const { bytes, report } = await exportPptx(doc, scene);
assert.ok(report.passed && report.exportVerified);
const archive = await JSZip.loadAsync(bytes);
const slides = await Promise.all(archive.file(/^ppt\/slides\/slide\d+\.xml$/).map(file => file.async('string')));
assert.equal(slides.join('').match(/name="eq-anchor-/g)?.length, 2);
assert.doesNotMatch(slides.join(''), /\\(?:begin|end|frac)\b/);

const root = await mkdtemp(path.join(tmpdir(), 'equation-regression-'));
const file = path.join(root, 'integral.pptx');
await writeFile(file, bytes);
const render = spawnSync('soffice', ['-env:UserInstallation=file://' + root + '/office', '--headless', '--convert-to', 'pdf', '--outdir', root, file], { timeout: 90000 });
assert.equal(render.status, 0, render.stderr?.toString());
const pdfFile = path.join(root, 'integral.pdf');
assert.ok((await readFile(pdfFile)).length > 0);
const extracted = spawnSync('pdftotext', [pdfFile, '-'], { encoding: 'utf8' });
assert.equal(extracted.status, 0, extracted.stderr);
assert.match(extracted.stdout, /∫/);
assert.match(extracted.stdout, /4/);
console.log(JSON.stringify({ nativeEquations: 2, alignedRows: 2, slides: slides.length, exportVerified: true, renderedPdf: true }));
