import sharp from 'sharp';

const equationDelimiters = new Map([['\\[', '\\]'], ['$$', '$$'], ['[', ']']]);
function formatPdfMath(formula) {
    return formula.replace(/\\mathrm\{([\p{L}/]+)\^(-?\d+)\}/gu,'\\mathrm{$1}^{$2}');
}

export function pdfEquationAt(lines, index) {
    const delimiter = lines[index]?.trim();
    const formula = lines[index + 1]?.trim();
    const closing = lines[index + 2]?.trim();
    if (!formula) return;
    if (delimiter === '\\[' && closing === '\\]' || delimiter === '$$' && closing === '$$' ||
        delimiter === '[' && closing === ']' && /\\[a-zA-Z]+/.test(formula)) {
        return `\\[\n${formatPdfMath(formula)}\n\\]`;
    }
}

export function pdfMultilineEquationAt(lines, start) {
    const open = lines[start]?.trim();
    const close = equationDelimiters.get(open);
    if (!close) return;
    const rows = [];
    for (let index = start + 1; index < Math.min(lines.length, start + 14); index++) {
        const text = lines[index].trim();
        if (text === close) {
            if (rows.length < 2 || !rows.some(row => /\\[a-zA-Z]+/.test(row))) return;
            if (rows.some(row => /\\(?:begin|end)\s*\{|\\\\/.test(row))) return;
            // A PDF may wrap immediately before or after a visible operator.
            // Preserve all tokens and keep other rows separate.
            const grouped = [];
            for (const row of rows.map(formatPdfMath)) {
                const previous = grouped.at(-1);
                if (previous && (/(?:[=+−-]|\\(?:times|cdot|approx))$/.test(previous) ||
                    /^\\(?:times|cdot)(?![A-Za-z])/.test(row))) {
                    grouped[grouped.length - 1] += ' ' + row;
                } else {
                    grouped.push(row);
                }
            }
            const body = grouped.length === 1 ? grouped[0] :
                ['\\begin{gathered}', grouped.join(' \\\\n'), '\\end{gathered}'].join('\n');
            return { end: index, text: ['\\[', body, '\\]'].join('\n') };
        }
        if (!text || /^\s*(?:\\\[|\$\$|\[|\\\]|\])\s*$/.test(text)) return;
        rows.push(text);
    }
}

const numericCell = /^[−+-]?\d+(?:[.,]\d+)*(?:\s*[–−-]\s*\d+(?:[.,]\d+)*)?$/u;

export function normalizePdfTextEvents(textEvents, visuals, lines) {
    const byPosition = new Map(lines.map(line=>[line.yMin+':'+line.xMin,line]));
    const rows = [];
    for (const event of textEvents) {
        const line = byPosition.get(event.y+':'+event.x);
        if (!line || line.text!==event.text) continue;
        const row=rows.at(-1);
        if (row && Math.abs(line.yMin-row.y)<=2) row.items.push({line,event});
        else rows.push({y:line.yMin,items:[{line,event}]});
    }
    for (const row of rows) {
        if(row.items.length<2 || row.items.length>5 || !row.items.some(({line})=>line.text.length>=14)) continue;
        const text=[...row.items].sort((a,b)=>a.line.xMin-b.line.xMin);
        const left=text[0].line.xMin,right=text.at(-1).line.xMax;
        const bottom=Math.max(...text.map(({line})=>line.yMax));
        const graphics=visuals.filter(({vector,region})=>vector && !region.sourceTable &&
            region.x>left && region.x+region.w<=right+1 && region.w<=85 && region.h<=30 &&
            region.y>=row.y-4 && region.y+region.h<=bottom+4);
        if(!graphics.length || graphics.some(event=>event.inlineRun)) continue;
        const items=[
            ...text.map(({event,line})=>({event,left:line.xMin,right:line.xMax})),
            ...graphics.map(event=>({event,left:event.region.x,right:event.region.x+event.region.w}))
        ].sort((a,b)=>a.left-b.left);
        if (items.some((item,index)=>index && (item.left-items[index-1].right < -2 || item.left-items[index-1].right > 15))) continue;
        const run={assets:[]};
        for (const {event} of items) {
            event.inlineRun=run;
            event.y=row.y;
        }
    }
    const plain=(line)=>line.text.length>=15 && !/^(?:[#\[\]$*]|\d+\s*[.)]|(?:Langkah|Step)\s+\d+)/i.test(line.text) &&
        !/[\\|]/.test(line.text);
    const removed=new Set();
    let previous;
    for (const row of rows) {
        const item=row.items.length===1?row.items[0]:undefined;
        if(!item || item.event.inlineRun || !plain(item.line)){previous=undefined;continue;}
        const {line,event}=item;
        const before=previous?.last;
        if(before && Math.abs(before.xMin-line.xMin)<4 && Math.abs(before.font-line.font)<1.2 &&
            line.yMin-before.yMin>=before.font*.7 && line.yMin-before.yMin<=before.font*1.25 &&
            before.xMax-before.xMin>=line.font*20 && /^\p{Ll}/u.test(line.text) &&
            !/[.!?:;]$/.test(before.text) &&
            !visuals.some(visual=>visual.y>=before.yMin && visual.y<=line.yMin)){
            previous.event.text+=' '+event.text;
            previous.last=line;
            removed.add(event);
        }else previous={event,last:line};
    }
    return textEvents.filter(event=>!removed.has(event));
}

export function pdfShortNumericGridAt(lines, start, visuals) {
    const cells = lines.slice(start, start + 4);
    if (cells.length !== 4 || cells.some(cell => !numericCell.test(cell.text))) return;
    const first = cells.slice(0, 2).sort((a,b)=>a.xMin-b.xMin);
    const second = cells.slice(2).sort((a,b)=>a.xMin-b.xMin);
    const spacing = second[0].yMin - first[0].yMin;
    if (spacing < 12 || spacing > 32 || first[1].xMin-first[0].xMax < 24 ||
        Math.abs(first[0].yMin-first[1].yMin)>1.4 || Math.abs(second[0].yMin-second[1].yMin)>1.4 ||
        second.some((cell,column)=>Math.abs(cell.xMax-first[column].xMax)>3)) return;
    const previous=lines[start-1], next=lines[start+4];
    if ((previous && first[0].yMin-previous.yMin < spacing+4) ||
        (next && next.yMin-second[0].yMin < spacing+4)) return;
    const left=first[0].xMin-24, right=first[1].xMax+20;
    const nearby=visuals.filter(({region})=>region.x < right && region.x+region.w > left);
    const headers=nearby.filter(({region})=>region.y+region.h <= first[0].yMin &&
        first[0].yMin-region.y < 32);
    if (headers.length < 2 || nearby.some(({region})=>region.y < second[0].yMax &&
        region.y+region.h > first[0].yMin)) return;
    return {
        end:start+3,
        text:[first,second].map(row=>row.map(cell=>cell.text).join('    ')).join('\n'),
    };
}

export function pdfNumericTables(lines, visuals = []) {
    const bands = [];
    for (const [index, line] of lines.entries()) {
        const band = bands.at(-1);
        if (band && line.yMin - band.top <= 1.4) band.items.push({ line, index });
        else bands.push({ top: line.yMin, items: [{ line, index }] });
    }
    const grids = new Map();
    for (let i = 1; i < bands.length - 2; i++) {
        const first = bands[i];
        const cells = [...first.items].sort((a, b) => a.line.xMin - b.line.xMin);
        if (cells.length < 2 || cells.length > 8 || cells.some(({ line }) => !numericCell.test(line.text))) continue;
        const anchors = cells.map(({ line }) => line.xMax);
        if (anchors.some((edge, column) => column && edge - anchors[column - 1] < 24)) continue;
        const spacing = bands[i + 1].top - first.top;
        if (spacing < 12 || spacing > 45) continue;
        const rows = [];
        let next = i;
        for (; next < bands.length; next++) {
            const band = bands[next];
            if (Math.abs(band.top - first.top - (next - i) * spacing) > 4) break;
            const entries = [...band.items].sort((a, b) => a.line.xMin - b.line.xMin);
            if (entries.length !== anchors.length || entries.some(({ line }, column) =>
                !numericCell.test(line.text) || Math.abs(line.xMax - anchors[column]) > 4)) break;
            rows.push(entries.map(({ line }) => line.text));
        }
        if (rows.length < 3) continue;
        const header = bands[i - 1];
        if (Math.abs(first.top - header.top - spacing) > 5) continue;
        const words = header.items.flatMap(({ line }) => line.words).sort((a, b) => a.xMin - b.xMin);
        const left = Math.min(...words.map(word => word.xMin), cells[0].line.xMin);
        const right = anchors.at(-1) + 4;
        const bottom = Math.max(...bands[next - 1].items.map(({ line }) => line.yMax));
        const rowVisuals = visuals.map(({ region }) => region).filter(region =>
            region.x < right && region.x + region.w > left && region.y < bottom && region.y + region.h > first.top);
        let visualColumn = false;
        let headerEdges = anchors;
        if (rowVisuals.length) {
            // Recognize a single image-only column only when every row contains
            // exactly one similarly positioned image between the same text columns.
            if (rowVisuals.length !== rows.length) continue;
            const images = [...rowVisuals].sort((a, b) => a.y - b.y);
            const imageRight = Math.max(...images.map(image => image.x + image.w));
            const imageLeft = Math.min(...images.map(image => image.x));
            const column = anchors.findIndex(anchor => anchor > imageRight);
            if (column <= 0 || imageLeft <= anchors[column - 1] + 3 || images.some((image, row) =>
                Math.abs(image.x - images[0].x) > 5 ||
                Math.abs(image.w - images[0].w) > 7 ||
                !bands[i + row].items.some(({ line }) =>
                    image.y + image.h / 2 >= line.yMin - 2 && image.y + image.h / 2 <= line.yMax + 2) ||
                bands[i + row].items.some(({ line }) => line.xMin < imageRight + 2 && line.xMax > imageLeft - 2))) continue;
            const nextCellLeft = Math.min(...bands.slice(i, next).flatMap(band => band.items)
                .filter(({ line }) => line.xMin > imageRight).map(({ line }) => line.xMin));
            if (!Number.isFinite(nextCellLeft) || nextCellLeft - imageRight < 12) continue;
            headerEdges = [...anchors];
            headerEdges[column - 1] = (anchors[column - 1] + imageLeft) / 2;
            headerEdges.splice(column, 0, (imageRight + nextCellLeft) / 2);
            anchors.splice(column, 0, (imageRight + nextCellLeft) / 2);
            for (const row of rows) row.splice(column, 0, '');
            visualColumn = true;
        }
        const headerCells = anchors.map(() => []);
        for (const word of words) {
            const column = headerEdges.findIndex(edge => word.xMax <= edge + 4);
            if (column >= 0) headerCells[column].push(word);
        }
        const headings = headerCells.map(group => group.map(word => word.text).join(' '));
        if (headerCells.flat().length !== words.length || headings.some(cell => !cell || /[|\\]/.test(cell))) continue;
        const headerBottom = Math.max(...header.items.map(({ line }) => line.yMax));
        const headerVisuals = visuals.map(({ region }) => region).filter(region =>
            region.y < headerBottom && region.y + region.h > header.top &&
            region.x < right && region.x + region.w > left - 18);
        const incomplete = headings.map(cell => !/\p{L}{2}/u.test(cell));
        const mixed = visualColumn || incomplete.some(Boolean);
        if (mixed && headings.some((cell, column) => incomplete[column] &&
            (!/^\(\s*\)$/u.test(cell) || (visualColumn && !headerVisuals.some(region =>
                region.x < anchors[column] + 4 && region.x + region.w > (anchors[column - 1] ?? left - 18)))))) continue;
        if (!visualColumn && incomplete.filter(Boolean).length > headings.length / 2) continue;
        const sourceLeft = Math.min(left, ...headerVisuals.map(region => region.x));
        const sourceTop = Math.min(header.top, ...headerVisuals.map(region => region.y));
        const sourceRegion = mixed ? {
            x: Math.max(0, sourceLeft - 4), y: Math.max(0, sourceTop - 4),
            w: right - Math.max(0, sourceLeft - 4) + 4, h: bottom - Math.max(0, sourceTop - 4) + 4,
        } : undefined;
        const wrap = row => '| ' + row.join(' | ') + ' |';
        const start = header.items[0].index;
        const end = bands[next - 1].items.at(-1).index;
        grids.set(start, { end, sourceRegion, text: ['', wrap(headings), wrap(anchors.map(() => '---')), ...rows.map(wrap), ''].join('\n') });
        i = next - 1;
    }
    return grids;
}

// Poppler's text and image inventories do not include text drawn as paths.
// Find compact ink regions still present on the rendered page after masking
// known words and embedded images. Work at a fixed pixels-per-point scale.
export async function findPdfVectorRegions(image, page, images) {
    const { data, info } = await sharp(image.data).flatten({ background: 'white' })
        .resize({ width: Math.ceil(page.width * 2), height: Math.ceil(page.height * 2), fit: 'fill', withoutEnlargement: true })
        .greyscale().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const sx = width / page.width;
    const sy = height / page.height;

    function mask(x, y, right, bottom, padding) {
        const left = Math.max(0, Math.floor((x - padding) * sx));
        const end = Math.min(width, Math.ceil((right + padding) * sx));
        if (left >= end) return;
        for (let row = Math.max(0, Math.floor((y - padding) * sy)); row < Math.min(height, Math.ceil((bottom + padding) * sy)); row++) {
            data.fill(255, row * width + left, row * width + end);
        }
    }

    for (const line of page.lines) {
        for (const word of line.words) mask(word.xMin, word.yMin, word.xMax, word.yMax, 1.4);
    }
    for (const { x, y, w, h } of images) mask(x, y, x + w, y + h, 2);

    const regions = [];
    const rowJoin = Math.ceil(3.5 * sy);
    const columnJoin = Math.ceil(10 * sx);
    let firstRow = -1;
    let lastRow = -1;

    function addBand(top, bottom) {
        if ((bottom - top + 1) / sy > 66 || (bottom - top + 1) / sy < 3) return;
        const columns = new Uint16Array(width);
        for (let row = top; row <= bottom; row++) {
            for (let col = 0; col < width; col++) {
                if (data[row * width + col] < 120) columns[col]++;
            }
        }

        let start = -1;
        let end = -1;
        function addRegion() {
            const w = (end - start + 1) / sx;
            if (start < 0 || w < 4 || w > page.width * 0.8) return;
            let minRow = bottom;
            let maxRow = top;
            let ink = 0;
            for (let row = top; row <= bottom; row++) {
                for (let col = start; col <= end; col++) {
                    if (data[row * width + col] >= 120) continue;
                    minRow = Math.min(minRow, row);
                    maxRow = row;
                    ink++;
                }
            }
            const h = (maxRow - minRow + 1) / sy;
            if (h < 3 || ink / (sx * sy) < 5 || ink / ((end - start + 1) * (maxRow - minRow + 1)) > 0.85) return;
            if (start / sx < 7 || end / sx > page.width - 7 || minRow / sy < 7 || maxRow / sy > page.height - 7) return;
            regions.push({ x: start / sx - 1.5, y: minRow / sy - 1.5, w: w + 3, h: h + 3 });
        }
        for (let col = 0; col < width; col++) {
            if (!columns[col]) continue;
            if (start >= 0 && col - end > columnJoin) {
                addRegion();
                start = -1;
            }
            if (start < 0) start = col;
            end = col;
        }
        addRegion();
    }

    for (let row = 0; row < height; row++) {
        const pixels = data.subarray(row * width, (row + 1) * width);
        let ink = 0;
        for (const value of pixels) if (value < 120) ink++;
        if (!ink || ink > width * 0.45) continue;
        if (firstRow >= 0 && row - lastRow > rowJoin) {
            addBand(firstRow, lastRow);
            firstRow = -1;
        }
        if (firstRow < 0) firstRow = row;
        lastRow = row;
    }
    if (firstRow >= 0) addBand(firstRow, lastRow);
    return regions;
}
