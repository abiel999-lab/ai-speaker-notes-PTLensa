import { parseSource } from './source.js';
import { textHeight, textWidth, wrapText } from './layout.js';
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
    const maxSlides = settings.maxSlides ?? 80;
    const fontScale = settings.fontScale ?? 1;
    const gap = settings.density === 'compact' ? 0.08 : 0.14;
    const maxY = 6.92;
    const x = 0.82;
    const w = 11.69;
    let slide;
    let y;
    const startSlide = (cover = false) => {
        if (slides.length >= maxSlides) throw Error('DOCUMENT_SLIDE_LIMIT');
        slide = {
            id: `full-copy-${slides.length}`, layout: cover ? 'cover' : 'editorial',
            background: cover ? '#142C42' : '#F8FAFC', blockIds: [], objects: [],
        };
        slides.push(slide);
        y = cover ? 1.12 : 0.71;
        slide.objects.push({ type: 'shape', shape: 'rect', x, y: y - 0.24, w: 0.66, h: 0.045, fill: '#188679' });
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
            const minimumHeight = asset.standalone && slide?.blockIds.length === 1
                ? Math.min(desiredHeight, 1.6) : Math.min(desiredHeight, Math.max(2.5, desiredHeight * .7));
            if (!slide || maxY - y - .6 < minimumHeight) startSlide();
            const h=Math.min(desiredHeight,maxY-y-.6);
            const reserve=asset.trailingPunctuation ? .34 : 0;
            const width=Math.min(h*ratio,w-reserve), height=width/ratio;
            const graphic={type:'image',asset:asset.assetId,x:x+(w-reserve-width)/2,y,w:width,h:height,fit:'contain',
                imageTreatment:'none',altText:asset.caption,originalPdfHash:asset.hash,inlineSourceImage:true};
            slide.objects.push(graphic);
            punctuationAnchor=asset.trailingPunctuation && asset.sourceOffset===offset ? {asset,graphic} : undefined;
            slide.documentCaption ||= asset.caption;
            y = asset.standalone ? maxY : y + Math.max(height,reserve) + gap;
        }
        return punctuationAnchor;
    }
    function addInlineRun(index) {
        const first=doc.blocks[index], image=inlineAssets[nextImage];
        if(image?.inlineRunStart!==first.start || !Number.isFinite(image.inlineRunEnd)) return index;
        const end=image.inlineRunEnd;
        const blocks=[];
        for(let i=index;i<doc.blocks.length && doc.blocks[i].start<end;i++) blocks.push(doc.blocks[i]);
        if(blocks.length<2 || blocks.some(block=>block.kind!=='paragraph'||block.equation))return index;
        const graphics=[];
        for(let i=nextImage;i<inlineAssets.length && inlineAssets[i].sourceOffset<end;i++){
            const asset=inlineAssets[i];
            if(asset.inlineRunStart!==first.start || asset.inlineRunEnd!==end)return index;
            graphics.push(asset);
        }
        const items=[...blocks.map(block=>({block,offset:block.start})),
            ...graphics.map(asset=>({asset,offset:asset.sourceOffset}))]
            .sort((a,b)=>a.offset-b.offset||Number(!!b.asset)-Number(!!a.asset));
        const measure=(item,font)=>item.block
            ? {w:textWidth(item.block.text,font)*1.045+.055,h:font/72*1.25+.06}
            : {w:Math.max(.18,font/72*.92*item.asset.width/item.asset.height),h:font/72*.92};
        const font=[19,18,17,16].map(value=>value*fontScale).find(value=>
            items.reduce((width,item)=>width+measure(item,value).w+.025,0)<=w);
        if(!font)return index;
        const rowHeight=font/72*1.25+.06;
        if(!slide||y+rowHeight>maxY)startSlide();
        let left=x;
        for(const item of items){
            const {w:width,h:height}=measure(item,font);
            if(item.block){
                slide.blockIds.push(item.block.id);
                slide.objects.push({type:'text',sourceId:item.block.id,text:item.block.text,x:left,y,w:width,h:height,
                    fontSize:font,fontFamily:settings.fontFamily,color:slide.layout==='cover'?'#F8FAFC':'#243746'});
            }else{
                const asset=item.asset;
                slide.objects.push({type:'image',asset:asset.assetId,x:left,y:y+(rowHeight-height)/2,w:width,h:height,
                    fit:'contain',imageTreatment:'none',altText:asset.caption,originalPdfHash:asset.hash,inlineSourceImage:true});
                slide.documentCaption ||= asset.caption;
            }
            left+=width+.025;
        }
        nextImage+=graphics.length;
        y+=rowHeight+gap;
        return index+blocks.length;
    }
    for (let index=0;index<doc.blocks.length;index++) {
        const block=doc.blocks[index];
        const anchor=addImagesThrough(block.start);
        const next=addInlineRun(index);
        if(next>index){index=next-1;continue;}
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
                const equationPreview=equationParts(block.text,{x,y,w,h});
                const panelWidth=Math.min(w+.26,Math.max(1.3,...equationPreview.map(part=>part.x+part.w-x))+.42);
                slide.objects.push({type:'shape',shape:'rect',x:x-.13,y:y-.05,w:panelWidth,h:h+.08,
                    fill:slide.layout==='cover'?'#203C53':'#E8F3F2'});
                add(block, { type:'text', text:block.text, equation:true, equationPreview, h,
                    color:slide.layout === 'cover' ? '#F8FAFC' : '#193940' });
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
            if (y + fullHeight > maxY && fullHeight <= maxY - 0.71 && slide.blockIds.length &&
                (!settings.keepTableCaption || doc.blocks.find(item => item.id === slide.blockIds.at(-1))?.kind !== 'heading')) startSlide();
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
        const subheading=block.text.length<105 && /^(?:Langkah|Step)\s+\d+\s*[:.)–-]/i.test(block.text);
        const bold = heading || subheading;
        const fontSize = (heading ? (block.level === 1 ? 36 : block.level === 2 ? 28 : 23) : subheading?21:19) * fontScale;
        const contentWidth = w * (settings.fontFamily && settings.fontFamily !== 'Arial' ? 0.81 : 0.9);
        const lines = block.text.split('\n').flatMap((line, i) => wrapText(line, contentWidth, fontSize, bold).map((part, j) => ({ part, lineBreak: i > 0 && j === 0 })));
        const lineSpacing = fontSize * (settings.density === 'compact' ? 1.17 : 1.24);
        let from = 0;
        while (from < lines.length) {
            let count = Math.floor((maxY - y - 0.12) * 72 / lineSpacing);
            if (count < 1 || ((heading||subheading) && count < Math.min(3, lines.length - from)) ||
                (count===1 && lines.length-from===2)) {
                startSlide();
                count = Math.floor((maxY - y - 0.12) * 72 / lineSpacing);
            }
            const parts = lines.slice(from, from + count);
            const text = parts.map(({ part, lineBreak }) => (lineBreak ? '\n' : '') + part).join('');
            add(block, { type: 'text', text, lines:parts.map(({part})=>part), fontSize, fontFamily: settings.fontFamily, lineSpacing, bold,
                color: slide.layout === 'cover' ? '#F8FAFC' : bold ? '#142C42' : '#243746', h: parts.length * lineSpacing / 72 + 0.08 });
            from += parts.length;
            if (from < lines.length) startSlide();
        }
    }
    addImagesThrough(Infinity);
    const separatedAssets=assets.filter(asset=>asset.visualKind!=='inline');
    const requiredImages = separatedAssets.filter(asset => asset.visualKind !== 'pdf-detail').length;
    let remainingDetails = maxSlides - slides.length - requiredImages;
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
    slides.splice(settings.pdfPagesAtEnd ? slides.length : slides.length ? 1 : 0, 0, ...pdfSlides);
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
