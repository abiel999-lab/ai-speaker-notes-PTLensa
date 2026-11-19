import {withoutSpeakerNotes} from './document-notes.js';
import{fontForText}from'./script-fonts.js';
import{fitEquationScene}from'./equation-layout.js';
import sharp from'sharp';
import{reserveStructuredChart}from'./chart-tables.js';
import{semanticGraph,drawSemanticGraph}from'./semantic-graphs.js';
import{isEquation,drawEquation}from'./native-equations.js';
import{visualCoverTitle,visualCoverSubtitle,technicalSectionTitle}from'./visual-cover.js';
import pptxgen from "pptxgenjs";
import { reserveAutomaticTableChart } from "./automatic-table-chart.js";
import { reserveCoverBranding, drawCoverBranding, cleanAuthor, coverBrandingLayout } from "./cover-branding.js";
import { normalizeSlideObjectIds } from "./pptx-object-ids.js";
import { finalizePptxPackage } from "./pptx-package.js";
import path from "node:path";
import { THEMES } from "./layout.js";
import { validateScene, verifyPptx } from "./fidelity.js";
import { notesForScene } from "./notes.js";
import { softenImageScrims } from "./image-scrim.js";
import { sceneFeatures, verifyInternalSlideLinks } from "./scene-features.js";
import { addNativeMotion, navigationPosition } from "./motion.js";
import { planDeckMotion } from "./motion-director.js";
import { planNativeChart, reserveNativeChartSpace } from "./native-charts.js";
import { composeCreativeCover, marginGraphics } from "./editorial-stage.js";
import { composeSourceInfographic } from "./source-infographics.js";
import { auditDesignScene } from "./design-audit.js";
import { searchSafeDesignCandidates } from "./design-candidate-search.js";
function preferredFont(text,doc,family) { const font=fontForText(text,doc.raw,doc.presentationLanguage); return font==='Arial'&&family ? family : font; }
export async function exportPptx(doc, scene, imagePaths = {}, motion = "none", branding) {
    const features = sceneFeatures(scene);
    const check = validateScene(doc, scene);
    if (!check.passed)
        throw new Error("SOURCE_FIDELITY_FAILED");
    // Chart-first is strictly optional. Reflow is accepted only if the *whole*
    // reflowed deck still passes original source fidelity and collision checks.
    // The validated Luna scene is the fallback if even one safety check fails.
    const t = THEMES[scene.theme];
    const optimization = scene.documentMode?{scene,report:{status:'document-source-layout'}}:searchSafeDesignCandidates(doc, scene);
    const designScene = optimization.scene;
    let preparedSlides = designScene.slides.map(original => {
        if(scene.documentMode||original.documentVisual)return {slide:original,chart:null};
        // Data charts take precedence over optional photographic backgrounds.
        // Keep the uploaded photo library and all other slide photos unchanged.
        if(original.objects.some(o=>o.type==='table')&&original.objects.some(o=>o.type==='image'&&o.backgroundImage)){
            const plain={...original,objects:original.objects.filter(o=>!(o.type==='image'&&o.backgroundImage))};
            const chart=reserveAutomaticTableChart(plain);
            if(chart&&validateScene(doc,{...designScene,slides:designScene.slides.map(s=>s===original?chart.slide:s)}).passed)return chart;
        }

        const structured=reserveStructuredChart(original);if(structured&&validateScene(doc,{...designScene,slides:designScene.slides.map(s=>s===original?structured.slide:s)}).passed)return structured;
        const graph=semanticGraph(original);if(graph&&validateScene(doc,{...designScene,slides:designScene.slides.map(s=>s===original?graph.slide:s)}).passed)return{slide:graph.slide,chart:null,graph:graph.graph};
        const sourceVisual = composeSourceInfographic(original, t.accent);
        const cover = sourceVisual || composeCreativeCover(original, t.accent, t.panel);
        const base = cover && validateScene(doc, { ...designScene, slides: designScene.slides.map(s => s === original ? cover : s) }).passed ? cover : original;
        const autoTable = reserveAutomaticTableChart(base);
        if (autoTable && validateScene(doc, { ...designScene, slides: designScene.slides.map(s => s === original ? autoTable.slide : s) }).passed)
            return autoTable;
        const existing = planNativeChart(base);
        if (existing)
            return { slide: base, chart: existing };
        const reserved = reserveNativeChartSpace(base);
        if (!reserved)
            return { slide: base, chart: null };
        const candidate = { ...designScene, slides: designScene.slides.map(s => s === original ? reserved.slide : s) };
        return validateScene(doc, candidate).passed ? reserved : { slide: base, chart: null };
    });
    let exportScene = { ...designScene, slides: preparedSlides.map(s => s.slide) };
    exportScene = reserveCoverBranding(doc, exportScene, branding);
    preparedSlides[0] = { slide: exportScene.slides[0], chart: branding ? null : preparedSlides[0].chart };
    const mathFit=scene.fullCopy?{scene:exportScene,changed:[]}:fitEquationScene(doc,exportScene);exportScene=mathFit.scene;
    preparedSlides=preparedSlides.map((p,i)=>({...p,slide:exportScene.slides[i],...(mathFit.changed.includes(i)?{chart:null,graph:null}:{})}));
    // Re-verify the complete assembled deck: no optimization may change source.
    if (!validateScene(doc, exportScene).passed)
        throw new Error("SOURCE_FIDELITY_FAILED");
    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = cleanAuthor(branding?.author);
    pptx.subject = "";
    pptx.title = "";
    pptx.company = "";
    pptx.theme = { headFontFace: fontForText(doc.raw,doc.raw,doc.presentationLanguage), bodyFontFace: fontForText(doc.raw,doc.raw,doc.presentationLanguage) };
    let object = 0;
    const speakerNotes = notesForScene(doc, scene);
    let navigationSlides = 0;
    for (const [slideIndex, prepared] of preparedSlides.entries()) {
        const s = prepared.slide;
        const slide = pptx.addSlide();
        slide.background = { color: s.background.slice(1) };
        if(!scene.documentMode||scene.includeSpeakerNotes)slide.addNotes(speakerNotes[slideIndex]);
        if(s.sectionTitle&&s.objects[0]?.sourceId)slide.addText(technicalSectionTitle(doc,s.objects[0].sourceId),{x:.78,y:.13,w:11.78,h:.32,fontFace:fontForText(technicalSectionTitle(doc,s.objects[0].sourceId),doc.raw,doc.presentationLanguage),fontSize:14,color:t.muted.slice(1),margin:0,objectName:'np-section-title-'+s.objects[0].sourceId});
        if(s.id==='np-visual-cover'){
            slide.addText(visualCoverTitle(doc),{x:.86,y:1.65,w:7.25,h:2.4,fontFace:fontForText(visualCoverTitle(doc),doc.raw,doc.presentationLanguage),fontSize:46,bold:true,color:'FFFFFF',margin:0,objectName:'np-visual-cover-title'});
            if(visualCoverSubtitle(doc))slide.addText(visualCoverSubtitle(doc),{x:.88,y:4.45,w:10.8,h:1.15,fontFace:fontForText(visualCoverSubtitle(doc),doc.raw,doc.presentationLanguage),fontSize:21,color:'BFD9F3',margin:0,objectName:'np-visual-cover-subtitle'});
        }
        // Export-only editable margin accents, never over source or native charts.
        for (const g of marginGraphics(s, slideIndex, preparedSlides.length, t.accent, prepared.chart?.region)) {
            slide.addShape(pptx.ShapeType[g.shape || "rect"], {
                x: g.x, y: g.y, w: g.w, h: g.h,
                fill: { color: (g.fill || t.accent).slice(1), transparency: (1 - (g.fillOpacity ?? 1)) * 100 },
                line: { color: (g.stroke || g.fill || t.accent).slice(1),
                    transparency: g.shape === "line" ? (1 - (g.fillOpacity ?? 1)) * 100 : 100,
                    width: g.strokeWidth ?? .8 },
                objectName: `design-margin-${slideIndex}-${g.y}`,
            });
        }
        for (const o of s.objects) {
            const name = o.sourceId
                ? `vb-${o.sourceId}-${object++}`
                : `design-${object++}`;
            if (o.type === "shape")
                slide.addShape(pptx.ShapeType[o.shape || "rect"], {
                    x: o.x,
                    y: o.y,
                    w: o.w,
                    h: o.h,
                    fill: { color: (o.fill || t.panel).slice(1), transparency: (1 - (o.fillOpacity ?? 1)) * 100 },
                    line: {
                        color: (o.stroke || o.fill || t.panel).slice(1),
                        transparency: o.stroke ? 0 : o.shape === "line" ? (1 - (o.fillOpacity ?? 1)) * 100 : 100,
                        width: o.strokeWidth ?? 0.8,
                    },
                    objectName: name,
                });
            if (o.type === "image") {
                const file = o.asset && imagePaths[o.asset];
                if (!file && o.asset && o.asset !== "city")
                    throw new Error("IMAGE_NOT_FOUND");
                const imageFile=file||path.resolve("public/assets/city.jpg");
                const meta=await sharp(imageFile).metadata();if(!meta.width||!meta.height)throw Error("IMAGE_NOT_FOUND");const ratio=meta.width/meta.height;let sizing;
                if(o.backgroundImage&&o.fit!=="contain")sizing={x:o.x,y:o.y,w:ratio*o.h,h:o.h,sizing:{type:"cover",w:o.w,h:o.h}};else{const w=Math.min(o.w,o.h*ratio),h=w/ratio;sizing={x:o.x+(o.w-w)/2,y:o.y+(o.h-h)/2,w,h};}
                slide.addImage({ path:imageFile,...sizing, altText: o.altText, objectName: o.inlineSourceImage
                    ? 'ordered-source-image-'+o.asset : motion === "keynote" && !o.backgroundImage ? `motion-inline-image-${object}` : name });
                if (o.imageTreatment && o.imageTreatment !== "none")
                    slide.addShape(pptx.ShapeType.rect, {
                        x: o.backgroundImage && o.imageTextSide === "right" ? 13.333333 - 8.4 : o.x,
                        y: o.y, w: o.backgroundImage && ["left", "right"].includes(o.imageTextSide || "") ? 8.4 : o.w, h: o.h,
                        fill: { color: o.imageTreatment === "dark" ? "0D1323" : "FFFFFF", transparency: o.imageTreatment === "dark" ? 14 : 10 },
                        line: { transparency: 100 }, objectName: "image-scrim-" + object,
                    });
                if (o.backgroundImage && o.imageTreatment && o.imageTreatment !== "none" && ["left", "right"].includes(o.imageTextSide || ""))
                    slide.addShape(pptx.ShapeType.rect, {
                        x: o.imageTextSide === "left" ? 8.4 : 13.333333 - 8.4 - .75, y: o.y, w: .75, h: o.h,
                        fill: { color: o.imageTreatment === "dark" ? "0D1323" : "FFFFFF" }, line: { transparency: 100 },
                        objectName: `image-scrim-edge-${o.imageTextSide}-${o.imageTreatment}-${object}`,
                    });
            }
            if(!scene.fullCopy&&o.type==="text"&&isEquation(o.text)){drawEquation(slide,pptx,o,name);continue;}
            if (o.type === "text")
                slide.addText(o.text || "", {
                    x: o.x,
                    y: o.y,
                    w: o.w,
                    h: o.h,
                    fontFace: preferredFont(o.text||o.rows?.flat().join(" ")||"",doc,o.fontFamily),
                    fontSize: o.fontSize,
                    bold: o.bold,
                    align: o.align || "left",
                    color: o.color.slice(1),
                    margin: 0,
                    breakLine: false,
                    paraSpaceAfter: 0,
                    lineSpacing: o.lineSpacing ?? o.fontSize * 1.28,
                    valign: "top",
                    objectName: name,
                    lang: "en-US",
                    ...(o.targetSlide ? { hyperlink: { slide: o.targetSlide, tooltip: "Go to slide " + o.targetSlide } } : {}),
                });
            if (o.type === "table")
                slide.addTable(o.rows.map((row, index) => row.map((text) => {
                    const rowIndex=(o.firstRow??0)+index;
                    const style=scene.fullCopy?{bold:rowIndex===0,color:rowIndex===0?'FFFFFF':'20332B',fill:{color:rowIndex===0?'153D34':rowIndex%2?'FFFDF9':'EBE8DE'}}:{};
                    return {text, options:{fontFace:preferredFont(text,doc,o.fontFamily),...style}};
                })), {
                    x: o.x,
                    y: o.y,
                    w: o.w,
                    h: o.h,
                    fontFace: preferredFont(o.text||o.rows?.flat().join(" ")||"",doc,o.fontFamily),
                    fontSize: o.fontSize,
                    color: o.color.slice(1),
                    fill: { color: o.fill.slice(1) },
                    border: { type: "solid", pt: 0.5, color: t.bg.slice(1) },
                    margin: 0.1,
                    autoPage: false,
                    ...(o.columnWidths?{colW:o.columnWidths}:{}),
                    objectName: name,
                });
        }
        // Native PowerPoint chart (not a raster image). Data is copied only from
        // unmodified, source-bearing labels on the same slide. Chart placement
        // is restricted to free space and cannot obscure text or uploaded images.
        const nativeChart = prepared.chart;
        if (nativeChart) {
            slide.addChart(nativeChart.type==="line"?pptx.ChartType.line:pptx.ChartType.bar, nativeChart.series||[{
                    name: nativeChart.unit,
                    labels: nativeChart.labels,
                    values: nativeChart.values,
                }], {
                ...nativeChart.region,
                showLegend: (nativeChart.series?.length||1)>1,
                legendFontSize:14,legendColor:t.fg.slice(1),legendPos:"b",
                showValue: true,
                showTitle: false,
                ...(nativeChart.type==="line"?{showMarker:true,markerSize:5,lineSize:2.5}:{barDir:"bar"}),
                catAxisLabelFontFace: fontForText(doc.raw,doc.raw,doc.presentationLanguage),
                catAxisLabelFontSize: 14,
                catAxisLabelColor: t.fg.slice(1),
                valAxisLabelFontSize: 12,
                valAxisTitle: nativeChart.unit,
                valAxisTitleFontSize: 12,
                valAxisLabelColor: t.fg.slice(1),
                dataLabelColor: t.fg.slice(1),
                dataLabelFontSize: 14,
                chartColors: [t.accent.slice(1),"F0B44C","8272D8"],
                ...(motion === "keynote" ? { objectName: "motion-native-chart" } : {}),
                chartArea: { fill: { color: s.background.slice(1), transparency: 0 } },
                plotArea: { fill: { color: s.background.slice(1), transparency: 0 } },
            });
        }
        if(prepared.graph)drawSemanticGraph(slide,pptx,prepared.graph,doc,t);
        if (slideIndex === 0 && branding)
            drawCoverBranding(slide, pptx, { ...branding, background: s.background },coverBrandingLayout(branding));
        if (motion === "keynote") {
            const position = navigationPosition(s);
            if (position) {
                const controls = [{ shape: pptx.ShapeType.actionButtonBackPrevious, to: slideIndex, label: "Previous slide" },
                    { shape: pptx.ShapeType.actionButtonHome, to: scene.menuSlide || 1, label: scene.menuSlide ? "Topic menu" : "First slide" },
                    { shape: pptx.ShapeType.actionButtonForwardNext, to: slideIndex + 2, label: "Next slide" }];
                for (const [i, control] of controls.entries())
                    if (control.to >= 1 && control.to <= scene.slides.length)
                        slide.addShape(control.shape, {
                            x: position.x + i * .43, y: position.y, w: .32, h: .32,
                            fill: { color: "F7F8F4" }, line: { color: "354238", width: .7 },
                            hyperlink: { slide: control.to, tooltip: control.label }, objectName: "navigation-" + i,
                        });
                navigationSlides++;
            }
        }
    }
    let bytes = (await pptx.write({ outputType: "nodebuffer" }));
    bytes = await normalizeSlideObjectIds(bytes);
    if (exportScene.slides.some(s => s.objects.some(o => o.backgroundImage && ["left", "right"].includes(o.imageTextSide || ""))))
        bytes = await softenImageScrims(bytes);
    const motionStoryboard = motion === "keynote" ? planDeckMotion(exportScene, preparedSlides.map(p => p.chart ? 1 : 0)) : null;
    const motionResult = motionStoryboard ? await addNativeMotion(bytes, motionStoryboard) : null;
    if (motionResult)
        bytes = motionResult.bytes;
    bytes = await finalizePptxPackage(bytes);
    if(scene.documentMode&&!scene.includeSpeakerNotes)bytes=await withoutSpeakerNotes(bytes);
    await verifyInternalSlideLinks(bytes);
    const pdfPictures = new Map();
    for (const [index, slide] of exportScene.slides.entries()) {
        const pictures = slide.objects.filter(object => object.type === "image" && object.originalPdfHash);
        if (pictures.length) pdfPictures.set(index, pictures);
    }
    const report = await verifyPptx(doc, bytes, branding, pdfPictures);
    report.quality = validateScene(doc, exportScene).quality;
    // The export report now includes source-private, geometry-only design diagnostics.
    // Visual judgment requires the actual rendered deck and remains a manual release gate.
    report.designAudit = auditDesignScene(exportScene, preparedSlides.map(p => p.chart ? 1 : 0));
    report.designSearch = optimization.diagnostic;
    if(scene.documentMode)report.documentCoverage=scene.documentCoverage;
    if(pdfPictures.size)report.documentCoverage={...report.documentCoverage,verifiedPdfPictures:[...pdfPictures.values()].flat().length};
    if (features.links || features.uploadedImages || features.menuSlide)
        report.interactive = features;
    if (motionStoryboard)
        report.motionDirection = {
            kind: motionStoryboard.kind, summary: motionStoryboard.summary,
            families: motionStoryboard.slides.map(s => s.family),
        };
    if (motionResult)
        report.motion = { preset: "keynote", animatedObjects: motionResult.animatedObjects,
            transitionSlides: motionResult.transitionSlides, navigationSlides, preview: "static" };
    report.mathLayoutRepairedSlides=mathFit.changed.map(i=>i+1);
    report.reworkVisuals={nativeCharts:preparedSlides.filter(p=>p.chart).length,semanticDiagrams:preparedSlides.filter(p=>p.graph).length,sourceTables:doc.blocks.filter(b=>b.kind==="table").length,exportedTables:exportScene.slides.flatMap(s=>s.objects).filter(o=>o.type==="table").length};
    if (!report.passed)
        throw new Error("EXPORTED_TEXT_MISMATCH");
    return { bytes, report };
}
