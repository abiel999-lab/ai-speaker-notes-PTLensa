import path from 'node:path';
import fs from 'node:fs/promises';
import { buildFullCopyScene } from '../core/full-copy.js';
import { exportPptx } from '../core/export.js';
import { digest } from '../core/journal.js';
import { hash } from '../core/source.js';
import { pdfEquationAt } from './pdf-vector-regions.js';

const captionPattern = /^(Table(?:\s*Table)?|Figure(?:\s*Figure)?|Fig\.?)\s*([A-Z]?\d+)\s*[.:]/i;
const requiredSections = ['Introduction', 'Methodology', 'Conclusion'];

function sectionHeading(text) {
    const match = text.match(/^(?:(\d+(?:\.\d+)*)\.?\s+)?(.+)$/);
    const [, number, title] = match;
    if (/^(Introduction|(?:Research )?Background)$/i.test(title)) return { title, key: 'Introduction', level: 2 };
    if (/^(?:(?:Data|Materials|Patients) and )?(?:Methods?|Methodology)(?: and Materials)?$|^Experimental (?:Methods|Procedures|Section)$|^Study Design$/i.test(title)) {
        return { title: 'Methodology', key: 'Methodology', original: title, level: 2 };
    }
    if (/^(?:Summary and )?Conclusions?\b(?:\s+(?:and|&|with)\s+[\p{L} ]+)?$/iu.test(title)) {
        return { title: 'Conclusion', key: 'Conclusion', original: title, level: 2 };
    }
    if (/^(Abstract|References|Bibliography|Acknowledg(?:e)?ments?|Supplementary Materials|Appendix(?: [A-Z])?)$/i.test(title)) return { title, level: 2 };
    if (number && title.length <= 80 && /^[\p{Lu}][\p{L}\d :()/’'–-]+$/u.test(title) && !/\b(?:shows?|indicat(?:es?|ors?)|presents?|reports?)\s.+[.]$/i.test(title)) {
        return { title, level: number.includes('.') ? 3 : 2 };
    }
    return null;
}

function paragraphs(layout, dictionary) {
    const entries = [];
    let pending = [];
    let indent;
    const flush = () => {
        if (pending.length) {
            const text = pending.reduce((joined, line) => {
                const before = joined.match(/([\p{L}]+)-$/u);
                const after = line.match(/^([\p{Ll}]+)/u);
                if (!before || !after) return [joined, line].filter(Boolean).join(' ');
                return (dictionary.has((before[1] + after[1]).toLowerCase()) ? joined.slice(0, -1) : joined) + line;
            }, '');
            entries.push({ kind: 'paragraph', text });
        }
        pending = [];
    };
    const lines = layout.split('\n');
    const nonempty = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.trim());
    const displayedEquations = new Map();
    const mathLines = nonempty.map(({ line }) => line);
    for (let index = 0; index + 2 < nonempty.length; index++) {
        const equation = pdfEquationAt(mathLines, index);
        if (!equation) continue;
        displayedEquations.set(nonempty[index].index, { equation, end: nonempty[index + 2].index });
        index += 2;
    }
    for (let index = 0; index < lines.length; index++) {
        const equation = displayedEquations.get(index);
        if (equation) {
            flush();
            entries.push({ kind: 'paragraph', text: equation.equation, equation: true });
            index = equation.end;
            indent = undefined;
            continue;
        }
        const line = lines[index];
        const text = line.trim().replace(/\u00ad/g, '');
        if (!text) {
            flush();
            indent = undefined;
            continue;
        }
        const abstract = text.match(/^Abstract:\s*(.+)$/i);
        const heading = abstract ? { title: 'Abstract', level: 2 } : sectionHeading(text);
        if (heading) {
            flush();
            entries.push({ kind: 'heading', ...heading, text: heading.title });
            if (heading.original && heading.original.toLowerCase() !== heading.title.toLowerCase()) {
                entries.push({ kind: 'paragraph', text: heading.original });
            }
            if (abstract) pending.push(abstract[1]);
            continue;
        }
        const margin = line.search(/\S/u);
        if (pending.length && indent !== undefined && margin > indent + 2) flush();
        indent = Math.min(indent ?? margin, margin);
        // Keep displayed formulas, column labels and scientific symbols from the source.
        pending.push(text.replace(/ {2,}/g, ' '));
    }
    flush();
    return entries;
}

function rawReading(text) {
    const lines = text.trim().split('\n');
    const key = value => (value.toLowerCase().match(/[\p{L}\d]+/gu) ?? []).join(' ');
    const anchors = new Map();
    for (const [index, line] of lines.entries()) {
        const words = key(line + ' ' + (lines[index + 1] ?? '')).split(' ');
        if (words.length < 9 || !line.trim()) continue;
        const anchor = words.slice(0, 9).join(' ');
        const earlier = anchors.get(anchor);
        if (earlier !== undefined) {
            const prior = key(lines.slice(earlier, index).join(' ')).split(' ');
            const following = key(lines.slice(index).join(' ')).split(' ');
            const compared = Math.min(40, prior.length, following.length);
            const same = new Set(following.slice(0, compared + 4));
            const exact = prior.length === following.length && prior.join(' ') === following.join(' ');
            if (exact || (compared >= 12 && prior.slice(0, compared).filter(word => same.has(word)).length >= compared * .85)) {
                // Replace the earlier overlapping text layer as a whole.
                return [...lines.slice(0, earlier), ...lines.slice(index)].join('\n');
            }
        } else anchors.set(anchor, index);
    }
    return text;
}

// Infer a grid from recurring gaps in Poppler's physical-layout text.
function tableCells(layout) {
    const bands = layout.split('\n').filter(line => line.trim()).map(line =>
        [...line.matchAll(/\S.*?(?= {2,}|\s*$)/g)].map(match =>
            ({ text: match[0], start: match.index, end: match.index + match[0].length })));
    const columnCounts = new Map();
    for (const band of bands) columnCounts.set(band.length, (columnCounts.get(band.length) ?? 0) + 1);
    const columns = Math.max(0, ...[...columnCounts].filter(([count, repeats]) => count > 1 && repeats >= 2).map(([count]) => count));
    if (columns < 2 || columns > 12 || bands.length < 3 || bands.some(band => band.length > columns + 1)) return null;
    const examples = bands.filter(band => band.length === columns);
    const sorted = values => values.sort((a, b) => a - b);
    const centers = examples[0].map((_, i) => {
        const values = sorted(examples.map(row => (row[i].start + row[i].end) / 2));
        return values[Math.floor(values.length / 2)];
    });
    const boundaries = centers.slice(1).map((center, i) => (center + centers[i]) / 2);
    let reliableRows = 0;
    const rows = bands.map(band => {
        if (band.length === columns) reliableRows++;
        const row = Array(columns).fill('');
        for (const [i, cell] of band.entries()) {
            const center = (cell.start + cell.end) / 2;
            const boundary = boundaries.findIndex(edge => center < edge);
            const col = band.length === columns ? i : boundary < 0 ? columns - 1 : boundary;
            row[col] = [row[col], cell.text].filter(Boolean).join(' ');
        }
        return row;
    });
    if (reliableRows < 2 || rows.some(row => row.some(cell => cell.length > 320))) return null;
    const combined = [];
    for (const row of rows) {
        const previous = combined.at(-1);
        if (previous && row[0] === '' && row.some(Boolean) &&
            row.every((cell, i) => !cell || (/^\([−+\-]?\d[\d.]*\)$/.test(cell) && /^\s*[−+\-]?\d/.test(previous[i])))) {
            // Statistical standard errors stay with their coefficients across slides.
            row.forEach((cell, i) => { if (cell) previous[i] += ' ' + cell; });
        } else combined.push(row);
    }
    return combined;
}

function region(page, top, bottom, left = 0, right = page.width) {
    return { x: left, y: top, w: right - left, h: bottom - top };
}

async function horizontalRules(image, page, rasterize) {
    const { data, width, height } = await rasterize(image);
    const found = [];
    for (let y = 0; y < height; y++) {
        let run = 0, started = 0, first = 0, last = 0;
        for (let x = 0; x < width; x++) {
            if (data[y * width + x] < 115) {
                if (!run) started = x;
                run++;
                if (run > last - first) { first = started; last = x + 1; }
            } else run = 0;
        }
        if (last - first < width * .22) continue;
        const current = { y: y / height * page.height, left: first / width * page.width, right: last / width * page.width };
        if (current.y - (found.at(-1)?.y ?? -100) < 2) found[found.length - 1] = current;
        else found.push(current);
    }
    return found;
}

function tableBounds(page, entry, nextTop, rules) {
    const headingEnd = entry.end;
    const top = rules.find(rule => rule.y >= headingEnd - 1 && rule.y <= headingEnd + 27);
    if (!top) return null;
    const matching = rules.filter(rule => rule.y > top.y + 4 && rule.y < nextTop &&
        Math.abs(rule.left - top.left) < 7 && Math.abs(rule.right - top.right) < 7);
    let bottom;
    for (const rule of matching) {
        const between = page.lines.filter(line => line.yMin > (bottom ?? top).y + 1 && line.yMax < rule.y - 1);
        // A new prose paragraph breaks an otherwise identical page-wide ruling.
        if (bottom && between.some(line => line.text.length > 110 && line.font > entry.line.font * 1.11)) break;
        bottom = rule;
    }
    if (!bottom) return null;
    return region(page, top.y - 1, bottom.y + 1, Math.max(0, top.left - 3), Math.min(page.width, top.right + 3));
}

function pageEnd(page) {
    return page.lines.find(line => line.yMin > page.height * .92 && /^(?:\d+\s+of\s+\d+|\d+)$/.test(line.text.trim()))?.yMin ?? page.height;
}

async function pageEntries(page, image, { readRegion, rasterize, vectorRegions, signal, dictionary }) {
    const first = page.number === 1;
    const abstract = first && page.lines.find(line => /^Abstract(?:\s|[.:]|$)/i.test(line.text));
    const intro = first && page.lines.find(line => /^\d*\.?\s*(?:Introduction|Background)$/i.test(line.text));
    const peerReviewOverlay = !first && page.lines.some(line => line.yMin < page.height * .1 && /FOR PEER REVIEW/i.test(line.text));
    const start = first ? Math.max(0, (abstract || intro)?.yMin - 2 || page.height * .07) : peerReviewOverlay ? page.height * .095 : 0;
    const hasSidebar = abstract && page.lines.some(line => line.xMax < abstract.xMin - 5 &&
        /^\s*(?:Citation:|Academic Editor:|Copyright:)/i.test(line.text));
    const textLeft = hasSidebar ? Math.max(0, abstract.xMin - 4) : 0;
    const end = pageEnd(page);
    const running = /^\s*(?:\d+\s+of\s+\d+|\d+|[^\n]+?\s+\d+\s+of\s+\d+)\s*$/;
    const read = async (box, raw = false) => {
        if (box.h <= 2 || box.w <= 2) return '';
        signal?.throwIfAborted();
        const text = (await readRegion(page, box, raw)).replace(/\f/g, '');
        const lines = text.split('\n').filter(line => !(raw &&
            /^\s*[^\n]{1,90}\s+\d{4},\s*\d+,\s*x\s+FOR PEER REVIEW\s+\d+\s+of\s+\d+\s*$/i.test(line)));
        if (box.y < 3) {
            let top;
            while ((top = lines.findIndex(line => line.trim())) >= 0 && running.test(lines[top])) lines[top] = '';
        }
        if (box.y + box.h >= end - 2) {
            const bottom = lines.findLastIndex(line => line.trim());
            if (bottom >= 0 && /^\s*(?:\d+|\d+\s+of\s+\d+)\s*$/.test(lines[bottom])) lines[bottom] = '';
        }
        return raw ? rawReading(lines.join('\n')) : lines.join('\n');
    };
    const captions = [];
    for (const line of page.lines) {
        const match = captionPattern.exec(line.text);
        if (!match || line.yMin < start || line.yMax > end ||
            captions.some(entry => Math.abs(entry.line.yMin - line.yMin) < 4 && entry.number === match[2])) continue;
        const kind = /^table/i.test(match[1]) ? 'table' : 'figure';
        const sameCaption = page.lines.filter(next => next.block === line.block &&
            next.yMin >= line.yMin && next.yMin < line.yMin + 43);
        captions.push({ kind, line, number: match[2].toUpperCase(), end: Math.max(...sameCaption.map(next => next.yMax), line.yMax) });
    }
    const useRawProse = peerReviewOverlay || captions.some(entry => entry.kind === 'figure');
    const vectorDetails = (await vectorRegions(page, image)).filter(box =>
        !page.lines.some(line => line.yMin < box.y + box.h - 1 && line.yMax > box.y + 1)).slice(0, 16);
    const prose = async (top, bottom) => {
        const content = [];
        let next = top;
        for (const box of vectorDetails) {
            if (box.y < next || box.y + box.h > bottom || box.x < textLeft) continue;
            content.push(...paragraphs(await read(region(page, next, box.y, textLeft), useRawProse), dictionary));
            content.push({ kind: 'visual', box, vector: true, text: 'Vector detail · PDF page ' + page.number });
            next = box.y + box.h;
        }
        content.push(...paragraphs(await read(region(page, next, bottom, textLeft), useRawProse), dictionary));
        return content;
    };
    const rules = captions.some(entry => entry.kind === 'table') ? await horizontalRules(image, page, rasterize) : [];
    const entries = [];
    let cursor = start;
    for (const [i, caption] of captions.entries()) {
        const next = captions[i + 1]?.line.yMin ?? end;
        const captionTop = caption.line.yMin - 1;
        const captionBottom = Math.min(next - 1, caption.end + 1);
        if (captionTop < cursor - 2) continue;
        const label = (caption.kind === 'table' ? 'Table ' : 'Figure ') + caption.number;
        const captionText = paragraphs(await read(region(page, captionTop, captionBottom), caption.kind === 'figure'), dictionary)
            .map(item => item.text).join(' ');
        const title = captionText.startsWith(label) ? captionText : label;
        if (caption.kind === 'table') {
            const box = tableBounds(page, caption, next - 2, rules);
            if (box) {
                entries.push(...await prose(cursor, captionTop), { kind: 'heading', text: title, level: 2 });
                const cells = tableCells(await read(region(page, box.y + 1, box.y + box.h - 1, box.x, box.x + box.w)));
                entries.push(cells ? { kind: 'table', cells, label } : { kind: 'visual', box, text: title, label });
                cursor = box.y + box.h;
            }
            continue;
        }
        const before = page.lines.filter(line => line.yMax < captionTop - 9 &&
            line.yMin >= cursor && line.font >= caption.line.font * 1.08 && line.text.length >= 70);
        const lastProse = before.sort((a, b) => b.yMax - a.yMax)[0];
        const top = Math.max(cursor, page.height * .075, (lastProse?.yMax ?? cursor) + 3);
        if (captionTop - top < 27) continue;
        const imageBox = region(page, top, captionTop, page.width * .035, page.width * .965);
        entries.push(...await prose(cursor, top), { kind: 'heading', text: title, level: 2 },
            { kind: 'visual', box: imageBox, text: title, label });
        cursor = captionBottom;
    }
    entries.push(...await prose(cursor, end));
    return entries.map(entry => ({ ...entry, page: page.number }));
}

export async function buildJournalFullCopy(pages, images, manifest, options) {
    const { dir, cropImage, thumbnail, signal, artDirection, fontFamily, fontScale, density, includeSpeakerNotes, interactiveLinks, presenterContext, motion, reviewOutput } = options;
    const dictionary = new Set(pages.flatMap(page => page.lines).flatMap(line => line.words)
        .flatMap(word => word.text.toLowerCase().match(/[\p{L}]+/gu) ?? []));
    const entries = [];
    for (const page of pages) entries.push(...await pageEntries(page, images.get(page.number), { ...options, dictionary }));
    for (const key of requiredSections) {
        if (entries.some(entry => entry.key === key)) continue;
        const before = entries.findIndex(entry => key === 'Introduction' ? entry.level === 2 && entry.text !== 'Abstract'
            : key === 'Methodology' ? /^(Results|Discussion|Conclusion)/i.test(entry.text ?? '')
            : /^(References|Bibliography|Appendix)$/i.test(entry.text ?? ''));
        entries.splice(before < 0 ? entries.length : before, 0, { kind: 'heading', text: key, key, level: 2 },
            { kind: 'paragraph', text: 'No matching section was identified. See the original journal pages.' });
        manifest.warnings.push('Section not identified: ' + key);
    }
    const intro = entries.find(entry => entry.key === 'Introduction').text;
    const links = [intro, 'Methodology', 'Conclusion', 'Original journal pages'];
    const { metadata } = manifest;
    const cover = [
        { kind: 'heading', level: 1, text: metadata.title, page: 1 },
        ...[metadata.authors, metadata.doi && 'DOI ' + metadata.doi].filter(Boolean).map(text => ({ kind: 'paragraph', text, page: 1 })),
    ];
    if (interactiveLinks) cover.push({ kind: 'heading', level: 2, text: 'Contents' },
        ...links.map(text => ({ kind: 'paragraph', text, navigation: true })));
    entries.unshift(...cover);

    const blocks = [], ledger = [], assets = [], imagePaths = {};
    let raw = '';
    const assetFrom = async (data, width, height, properties) => {
        const assetId = 'journal-' + assets.length;
        imagePaths[assetId] = path.join(dir, assetId + '.png');
        await fs.writeFile(imagePaths[assetId], data, { mode: 0o600 });
        assets.push({ ...properties, assetId, width, height, hash: digest(data) });
    };
    for (const entry of entries) {
        signal?.throwIfAborted();
        if (entry.kind === 'visual') {
            const page = pages[entry.page - 1];
            const image = await cropImage(images.get(entry.page), page, entry.box);
            if (!image) throw Error('JOURNAL_COVERAGE_FAILED');
            await assetFrom(image.data, image.width, image.height, {
                visualKind: 'inline', sourceOffset: raw.length, caption: entry.text, page: entry.page, label: entry.label,
                ...(entry.vector ? { pdfRegionHeight: entry.box.h } : { standalone: true }),
            });
            continue;
        }
        const start = raw.length;
        const text = entry.cells ? entry.cells.map(row => row.join('\t')).join('\n') : entry.text;
        raw += text + '\n';
        const id = 'b' + blocks.length;
        blocks.push({ ...entry, id, start, end: raw.length, raw: text + '\n', text });
        ledger.push({ start, end: raw.length, role: 'content' });
    }
    for (const page of pages) {
        const image = images.get(page.number);
        await assetFrom(image.data, image.width, image.height, {
            visualKind: 'pdf-page', caption: 'Original journal · page ' + page.number, page: page.number,
        });
    }
    const doc = { raw, sha256: hash(raw), mode: 'text', blocks, ledger, words: raw.trim().split(/\s+/u).length, version: 'source-v1' };
    let scene = buildFullCopyScene(doc, assets, {
        fontFamily, fontScale, density, includeSpeakerNotes, maxSlides: 320,
        pdfPagesAtEnd: true, keepTableCaption: true,
    });
    const byId = new Map(blocks.map(block => [block.id, block]));
    const byAsset = new Map(assets.map(asset => [asset.assetId, asset]));
    const destinations = new Map();
    manifest.appendix = [];
    manifest.mapping = [];
    const indices = new Map();
    for (const [index, slide] of scene.slides.entries()) {
        const slideNumber = index + 1;
        for (const id of slide.blockIds) {
            const block = byId.get(id);
            if (block.key && !destinations.has(block.text)) destinations.set(block.text, slideNumber);
            if (block.label && !indices.has(block.label)) indices.set(block.label, slideNumber);
            if (block.text === 'Contents' && interactiveLinks) scene.menuSlide = slideNumber;
        }
        for (const object of slide.objects.filter(item => item.type === 'image')) {
            const asset = byAsset.get(object.asset);
            const mapping = { page: asset.page, slide: slideNumber, imageHash: asset.hash, id: asset.label || asset.assetId };
            if (asset.visualKind === 'pdf-page') manifest.appendix.push(mapping);
            else manifest.mapping.push(mapping);
        }
    }
    if (interactiveLinks) {
        destinations.set('Original journal pages', manifest.appendix[0].slide);
        for (const slide of scene.slides) for (const object of slide.objects) {
            if (byId.get(object.sourceId)?.navigation) object.targetSlide = destinations.get(object.text);
        }
    }
    const notes = scene.slides.map((slide, i) => {
        const sourcePages = [...new Set([...slide.blockIds.map(id => byId.get(id).page),
            ...slide.objects.filter(object => object.type === 'image').map(object => byAsset.get(object.asset).page)].filter(Boolean))];
        return [i === 0 && presenterContext.trim(), sourcePages.length && ('PDF ' + (sourcePages.length > 1 ? 'pages ' : 'page ') + sourcePages.join(', ')),
            metadata.doi && 'DOI ' + metadata.doi].filter(Boolean).join('\n\n');
    });
    if (includeSpeakerNotes) scene.speakerNotes = notes;
    // Use the journal's existing fade transition for long document decks.
    scene.uniformMotion = true;
    if (manifest.appendix.length !== pages.length) throw Error('JOURNAL_COVERAGE_FAILED');
    if(artDirection){
        try {
            const design=await artDirection(doc,scene,dir);
            scene=design.scene;
            if(design.artwork) imagePaths[design.artwork.id]=design.artwork.imagePath;
            manifest.deckArt=design.summary;
        } catch {
            signal?.throwIfAborted();
        }
    }
    signal?.throwIfAborted();
    const deck = await exportPptx(doc, scene, imagePaths, motion, undefined, fontFamily);
    manifest.slides = scene.slides.length;
    manifest.tables = blocks.filter(block => block.kind === 'table').map(block =>
        ({ label: block.label, page: block.page, slide: indices.get(block.label), rows: block.cells.length, columns: block.cells[0].length }));
    manifest.verification = deck.report;
    if (reviewOutput) {
        manifest.generatedReview = [];
        for (const slide of scene.slides) {
            const text = slide.objects.filter(object => object.type === 'text').map(object => object.text);
            const image = slide.objects.find(object => object.type === 'image');
            manifest.generatedReview.push({
                title: slide.documentCaption ?? text[0]?.slice(0, 160) ?? metadata.title,
                items: text,
                pages: [...new Set(slide.blockIds.map(id => byId.get(id).page).filter(Boolean))],
                ...(image && { image: await thumbnail(imagePaths[image.asset]) }),
            });
        }
    }
    return { bytes: deck.bytes, manifest, notesBySlide: notes, notes: notes.join('\n\n---\n\n') };
}
