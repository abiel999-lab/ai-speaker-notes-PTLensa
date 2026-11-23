import sharp from 'sharp';

export function pdfEquationAt(lines, index) {
    const delimiter = lines[index]?.trim();
    const formula = lines[index + 1]?.trim();
    const closing = lines[index + 2]?.trim();
    if (!formula) return;
    if (delimiter === '\\[' && closing === '\\]' || delimiter === '$$' && closing === '$$' ||
        delimiter === '[' && closing === ']' && /\\[a-zA-Z]+/.test(formula)) {
        return `\\[\n${formula}\n\\]`;
    }
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
