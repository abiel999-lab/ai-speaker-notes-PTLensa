import { parseSource } from './source.js';
import { textHeight, wrapText } from './layout.js';
import { validateScene } from './fidelity.js';
import { equationParts } from './native-equations.js';

export function parseFullCopySource(source) {
    const doc = parseSource(source, 'markdown', { tolerateMalformedMarkup: true });
    for (const block of doc.blocks) {
        if (block.kind === 'table' && (block.cells[0].length > 9 || block.cells.some(row => row.some(cell => cell.length > 320)))) {
            // A very wide or tall grid remains readable as its original Markdown.
            block.kind = 'code';
            block.text = block.raw.replace(/\r\n?/g, '\n').replace(/\n$/, '');
        }
    }
    return doc;
}

export function buildFullCopyScene(doc, assets, settings = {}) {
    const slides = [];
    const fontScale = settings.fontScale ?? 1;
    const gap = settings.density === 'compact' ? 0.12 : 0.22;
    const maxY = 6.9;
    const x = 0.82;
    const w = 11.69;
    let slide;
    let y;
    const startSlide = (cover = false) => {
        if (slides.length >= 80) throw Error('DOCUMENT_SLIDE_LIMIT');
        slide = {
            id: `full-copy-${slides.length}`, layout: cover ? 'cover' : 'editorial',
            background: cover ? '#153D34' : '#F8F5EF', blockIds: [], objects: [],
        };
        slides.push(slide);
        y = cover ? 1.12 : 0.71;
        slide.objects.push({ type: 'shape', shape: 'rect', x, y: y - 0.26, w: 0.66, h: 0.04, fill: '#AD8346' });
    };
    const add = (block, object) => {
        if (slide.blockIds.at(-1) !== block.id) slide.blockIds.push(block.id);
        slide.objects.push({ ...object, sourceId: block.id, x, y, w });
        y += object.h + gap;
    };
    const inlineAssets = assets.filter(asset=>asset.visualKind==='inline')
        .sort((first,second)=>first.sourceOffset-second.sourceOffset);
    let nextImage=0;
    function addImagesThrough(offset){
        let punctuationAnchor;
        while(nextImage<inlineAssets.length&&inlineAssets[nextImage].sourceOffset<=offset){
            const asset=inlineAssets[nextImage++];
            const ratio=asset.width/asset.height;
            if(!Number.isFinite(ratio)||ratio<=0)throw Error('DOCUMENT_IMAGE_EXTRACTION_FAILED');
            const desiredHeight=asset.pdfRegionHeight
                ?Math.min(1.7,w/ratio,Math.max(.34,asset.pdfRegionHeight/33))
                :Math.min(5.4,w/ratio);
            if(!slide||maxY-y-.6<Math.min(desiredHeight,Math.max(2.5,desiredHeight*.7))) startSlide();
            const h=Math.min(desiredHeight,maxY-y-.6);
            const reserve=asset.trailingPunctuation ? .34 : 0;
            const width=Math.min(h*ratio,w-reserve), height=width/ratio;
            const graphic={type:'image',asset:asset.assetId,x:x+(w-reserve-width)/2,y,w:width,h:height,fit:'contain',
                imageTreatment:'none',altText:asset.caption,originalPdfHash:asset.hash,inlineSourceImage:true};
            slide.objects.push(graphic);
            punctuationAnchor=asset.trailingPunctuation && asset.sourceOffset===offset ? {asset,graphic} : undefined;
            slide.documentCaption ||= asset.caption;
            y += Math.max(height,reserve) + gap;
        }
        return punctuationAnchor;
    }
    for (const block of doc.blocks) {
        const anchor=addImagesThrough(block.start);
        if(anchor?.asset.trailingPunctuation===block.text){
            const icon=anchor.graphic, h=.32;
            slide.blockIds.push(block.id);
            slide.objects.push({type:'text',sourceId:block.id,text:block.text,
                x:icon.x+icon.w+.02,y:icon.y+Math.max(0,icon.h-h),w:.28,h,
                fontSize:17,fontFamily:settings.fontFamily,color:slide.layout==='cover'?'#F8F5EF':'#24332D'});
            continue;
        }
        const heading = block.kind === 'heading';
        if (!slide || (heading && (block.level <= 2 || y > 5.55) && slide.blockIds.length)) startSlide(!slides.length && heading && block.level === 1);
        if (block.equation) {
            let parts;
            try {
                parts = equationParts(block.text, { x: 0, y: 0, w, h: 5 });
            } catch (error) {
                // Invalid or unsupported source markup remains visible as supplied.
                if (!['MATH_SYNTAX','MATH_UNSUPPORTED','MATH_LAYOUT_SPACE'].includes(error.message)) throw error;
            }
            if (parts?.length) {
                const h = Math.max(...parts.map(part => part.y + part.h)) + .15;
                if (y + h > maxY) startSlide();
                add(block, { type:'text', text:block.text, equation:true, h,
                    color:slide.layout === 'cover' ? '#F8F5EF' : '#24332D' });
                continue;
            }
        }
        if (block.kind === 'table') {
            const columns = block.cells[0].length;
            const weights = block.cells[0].map((_, column) => Math.sqrt(Math.max(3, ...block.cells.map(row => Math.min(80, row[column].length)))));
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
            const columnWidths = weights.map(weight => 0.75 + (w - 0.75 * columns) * weight / totalWeight);
            const fontSize = Math.min(17.5, columns > 6 ? 12.5 : 15.5) * fontScale;
            const rowHeights = block.cells.map((row, rowIndex) => Math.max(0.38, ...row.map((text, i) =>
                textHeight(wrapText(text, (columnWidths[i] - 0.24) * 0.88, fontSize, rowIndex === 0).length, fontSize) + 0.22
            )));
            const fullHeight = rowHeights.reduce((sum, height) => sum + height, 0);
            if (y + fullHeight > maxY && fullHeight <= maxY - 0.71 && slide.blockIds.length) startSlide();
            let rowIndex = 0;
            while (rowIndex < block.cells.length) {
                const rows = [];
                const firstRow = rowIndex;
                let h = 0;
                while (rowIndex < block.cells.length) {
                    const row = block.cells[rowIndex];
                    const rowHeight = rowHeights[rowIndex];
                    if (y + h + rowHeight > maxY) break;
                    rows.push(row);
                    rowIndex++;
                    h += rowHeight;
                }
                if (rows.length) add(block, { type: 'table', rows, h, firstRow, columnWidths, fontSize, fontFamily: settings.fontFamily, color: '#20332B', fill: '#FFFDF9' });
                else if (!slide.blockIds.length && slide.layout !== 'cover') throw Error('DOCUMENT_CONTENT_TOO_DENSE');
                if (rowIndex < block.cells.length) startSlide();
            }
            continue;
        }
        const bold = heading;
        const fontSize = (heading ? (block.level === 1 ? 35 : block.level === 2 ? 27 : 23) : 19) * fontScale;
        const contentWidth = w * (settings.fontFamily && settings.fontFamily !== 'Arial' ? 0.81 : 0.9);
        const lines = block.text.split('\n').flatMap((line, i) => wrapText(line, contentWidth, fontSize, bold).map((part, j) => ({ part, lineBreak: i > 0 && j === 0 })));
        const lineSpacing = fontSize * (settings.density === 'compact' ? 1.24 : 1.38);
        let from = 0;
        while (from < lines.length) {
            let count = Math.floor((maxY - y - 0.12) * 72 / lineSpacing);
            if (count < 1 || (heading && count < Math.min(3, lines.length - from))) {
                startSlide();
                count = Math.floor((maxY - y - 0.12) * 72 / lineSpacing);
            }
            const parts = lines.slice(from, from + count);
            const text = parts.map(({ part, lineBreak }) => (lineBreak ? '\n' : '') + part).join('');
            add(block, { type: 'text', text, fontSize, fontFamily: settings.fontFamily, lineSpacing, bold, color: slide.layout === 'cover' ? '#F8F5EF' : heading ? '#153D34' : '#24332D', h: parts.length * lineSpacing / 72 + 0.12 });
            from += parts.length;
            if (from < lines.length) startSlide();
        }
    }
    addImagesThrough(Infinity);
    const separatedAssets=assets.filter(asset=>asset.visualKind!=='inline');
    const requiredImages = separatedAssets.filter(asset => asset.visualKind !== 'pdf-detail').length;
    let remainingDetails = 80 - slides.length - requiredImages;
    if (remainingDetails < 0) throw Error('DOCUMENT_SLIDE_LIMIT');
    let included = inlineAssets.length;
    const pdfSlides = [];
    for (const asset of separatedAssets) {
        if (asset.visualKind === 'pdf-detail') {
            if (remainingDetails === 0) continue;
            remainingDetails--;
        }
        if (asset.visualKind === 'pdf-page' || asset.visualKind === 'pdf-detail') {
            pdfSlides.push({
                id: `full-copy-pdf-${asset.assetId}`, layout: 'photo', background: '#FFFFFF',
                blockIds: [], documentVisual: true, documentCaption: asset.caption,
                objects: [{ type: 'image', asset: asset.assetId, x: 0.15, y: 0.12,
                    w: 13.03, h: 7.26, fit: 'contain', imageTreatment: 'none',
                    altText: asset.caption, originalPdfHash: asset.hash }],
            });
        } else {
            startSlide();
            slide.layout = 'photo';
            slide.documentVisual = true;
            slide.objects.push({ type: 'image', asset: asset.assetId, x, y, w, h: 6.12, fit: 'contain', imageTreatment: 'none' });
        }
        included++;
    }
    // Keep the first text slide for titles and optional branding, then show the
    // source pages and their close-ups before the rest of the extracted text.
    slides.splice(slides.length ? 1 : 0, 0, ...pdfSlides);
    const scene = {
        theme: 'ivory', sourceHash: doc.sha256, documentMode: true, fullCopy: true,
        includeSpeakerNotes: settings.includeSpeakerNotes === true,
        documentCoverage: {
            expected: included, included, sourceBound: true,
            pdfPages: assets.filter(asset => asset.visualKind === 'pdf-page').length,
            skippedOptionalDetails: assets.length - included,
        }, slides,
    };
    if (!slides.length || !validateScene(doc, scene).passed) throw Error('SOURCE_FIDELITY_FAILED');
    return scene;
}
