import assert from 'node:assert/strict';
import { pdfNumericTables } from '../../server-dist/server/pdf-vector-regions.js';
import { buildFullCopyScene, parseFullCopySource } from '../../server-dist/core/full-copy.js';
import { exportPptx } from '../../server-dist/core/export.js';
import JSZip from 'jszip';

function line(text, xMax, yMin) {
    const word = { text, xMin: xMax - text.length * 4, xMax, yMin, yMax: yMin + 12 };
    return { ...word, words: [word] };
}
const lines = [
    line('Waktu (jam)', 185, 40), line('Debit (L/s)', 300, 40),
    line('0', 185, 62), line('10', 300, 62),
    line('1', 185, 84), line('14', 300, 84),
    line('2', 185, 106), line('18', 300, 106),
];
const grid = pdfNumericTables(lines).get(0);
assert.equal(grid.end, lines.length - 1);
assert.equal(pdfNumericTables(lines.slice(0, 6)).size, 0);
assert.equal(pdfNumericTables(lines, [{ region: { x: 191, y: 83, w: 3, h: 3 } }]).size, 0);
assert.equal(pdfNumericTables(lines.map((item, i) => i === 5 ? line('14', 280, 84) : item)).size, 0);
const mixed = lines.map((item, i) => i === 1 ? line('( )', 300, 40) : item);
const mixedGrid = pdfNumericTables(mixed).get(0);
assert.ok(mixedGrid.sourceRegion.w > 100 && mixedGrid.sourceRegion.h > 68);
assert.equal(pdfNumericTables(mixed.map((item, i) => i === 0 ? line('( )', 185, 40) : item)).size, 0);
assert.deepEqual(parseFullCopySource(mixedGrid.text).blocks[0].cells.slice(1), [['0','10'], ['1','14'], ['2','18']]);
const imageLines = [lines[0], line('Rumus', 242, 40), ...lines.slice(1)];
const cellImages = [62, 84, 106].map(y => ({ region: { x: 213, y: y + 1, w: 25, h: 10 } }));
const withImageColumn = pdfNumericTables(imageLines, cellImages).get(0);
assert.ok(withImageColumn.sourceRegion);
assert.deepEqual(parseFullCopySource(withImageColumn.text).blocks[0].cells,
    [['Waktu (jam)', 'Rumus', 'Debit (L/s)'], ['0', '', '10'], ['1', '', '14'], ['2', '', '18']]);
assert.equal(pdfNumericTables(imageLines, cellImages.slice(0, 2)).size, 0);
const expected = [['Waktu (jam)', 'Debit (L/s)'], ['0','10'], ['1','14'], ['2','18']];
const doc = parseFullCopySource('# Data debit\n' + grid.text);
assert.deepEqual(doc.blocks.find(block => block.kind === 'table').cells, expected);
const { bytes, report } = await exportPptx(doc, buildFullCopyScene(doc, []));
assert.ok(report.passed && report.exportVerified);
const pptx = await JSZip.loadAsync(bytes);
const slides = await Promise.all(pptx.file(/^ppt\/slides\/slide\d+\.xml$/).map(file => file.async('string')));
assert.ok(slides.some(xml => xml.includes('<a:tbl>')));
console.log('Editable numeric table and source fidelity verified');
