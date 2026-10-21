import pptxgen from "pptxgenjs";
import path from "node:path";
import { THEMES } from "./layout.js";
import type { Scene, SourceDocument } from "./types.js";
import { validateScene, verifyPptx } from "./fidelity.js";
import { notesForScene } from "./notes.js";
import { softenImageScrims } from "./image-scrim.js";
import { sceneFeatures, verifyInternalSlideLinks } from "./scene-features.js";
import { addNativeMotion, navigationPosition } from "./motion.js";
export async function exportPptx(
  doc: SourceDocument,
  scene: Scene,
  imagePaths: Record<string, string> = {},
  motion: "none" | "keynote" = "none",
) {
  const features = sceneFeatures(scene);
  const check = validateScene(doc, scene);
  if (!check.passed) throw new Error("SOURCE_FIDELITY_FAILED");
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "";
  pptx.subject = "";
  pptx.title = "";
  pptx.company = "";
  pptx.theme = { headFontFace: "Arial", bodyFontFace: "Arial" };
  let object = 0;
  const t = THEMES[scene.theme];
  const speakerNotes = notesForScene(doc, scene);
  let navigationSlides = 0;
  for (const [slideIndex, s] of scene.slides.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: s.background.slice(1) };
    slide.addNotes(speakerNotes[slideIndex]);
    for (const o of s.objects) {
      const name = o.sourceId
        ? `vb-${o.sourceId}-${object++}`
        : `design-${object++}`;
      if (o.type === "shape")
        slide.addShape(
          pptx.ShapeType[o.shape || "rect"],
          {
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
          },
        );
      if (o.type === "image") {
        const file = o.asset && imagePaths[o.asset];
        if (!file && o.asset && o.asset !== "city") throw new Error("IMAGE_NOT_FOUND");
        slide.addImage({ path: file || path.resolve("public/assets/city.jpg"), x: o.x, y: o.y, w: o.w, h: o.h,
          sizing: { type: "crop", w: o.w, h: o.h }, objectName: name });
        if (o.imageTreatment && o.imageTreatment !== "none") slide.addShape(pptx.ShapeType.rect, {
          x: o.backgroundImage && o.imageTextSide === "right" ? 13.333333 - 8.4 : o.x,
          y: o.y, w: o.backgroundImage && ["left", "right"].includes(o.imageTextSide || "") ? 8.4 : o.w, h: o.h,
          fill: { color: o.imageTreatment === "dark" ? "0D1323" : "FFFFFF", transparency: o.imageTreatment === "dark" ? 14 : 10 },
          line: { transparency: 100 }, objectName: "image-scrim-" + object,
        });
        if (o.backgroundImage && o.imageTreatment && o.imageTreatment !== "none" && ["left", "right"].includes(o.imageTextSide || "")) slide.addShape(pptx.ShapeType.rect, {
          x: o.imageTextSide === "left" ? 8.4 : 13.333333 - 8.4 - .75, y: o.y, w: .75, h: o.h,
          fill: { color: o.imageTreatment === "dark" ? "0D1323" : "FFFFFF" }, line: { transparency: 100 },
          objectName: `image-scrim-edge-${o.imageTextSide}-${o.imageTreatment}-${object}`,
        });
      }
      if (o.type === "text")
        slide.addText(o.text || "", {
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
          fontFace: "Arial",
          fontSize: o.fontSize,
          bold: o.bold,
          align: o.align || "left",
          color: o.color!.slice(1),
          margin: 0,
          breakLine: false,
          paraSpaceAfter: 0,
          lineSpacing: o.fontSize! * 1.28,
          valign: "top",
          objectName: name,
          lang: "en-US",
          ...(o.targetSlide ? { hyperlink: { slide: o.targetSlide, tooltip: "Go to slide " + o.targetSlide } } : {}),
        });
      if (o.type === "table")
        slide.addTable(
          o.rows!.map((row) => row.map((text) => ({ text }))),
          {
            x: o.x,
            y: o.y,
            w: o.w,
            h: o.h,
            fontFace: "Arial",
            fontSize: o.fontSize,
            color: o.color!.slice(1),
            fill: { color: o.fill!.slice(1) },
            border: { type: "solid", pt: 0.5, color: t.bg.slice(1) },
            margin: 0.1,
            autoPage: false,
            objectName: name,
          },
        );
    }
    if (motion === "keynote") {
      const position = navigationPosition(s);
      if (position) {
        const controls = [{ shape: pptx.ShapeType.actionButtonBackPrevious, to: slideIndex, label: "Previous slide" },
          { shape: pptx.ShapeType.actionButtonHome, to: scene.menuSlide || 1, label: scene.menuSlide ? "Topic menu" : "First slide" },
          { shape: pptx.ShapeType.actionButtonForwardNext, to: slideIndex + 2, label: "Next slide" }];
        for (const [i, control] of controls.entries())
          if (control.to >= 1 && control.to <= scene.slides.length) slide.addShape(control.shape, {
            x: position.x + i * .43, y: position.y, w: .32, h: .32,
            fill: { color: "F7F8F4" }, line: { color: "354238", width: .7 },
            hyperlink: { slide: control.to, tooltip: control.label }, objectName: "navigation-" + i,
          });
        navigationSlides++;
      }
    }
  }
  let bytes = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  if (scene.slides.some(s => s.objects.some(o => o.backgroundImage && ["left", "right"].includes(o.imageTextSide || "")))) bytes = await softenImageScrims(bytes);
  const motionResult = motion === "keynote" ? await addNativeMotion(bytes) : null;
  if (motionResult) bytes = motionResult.bytes;
  await verifyInternalSlideLinks(bytes);
  const report = await verifyPptx(doc, bytes);
  report.quality = check.quality;
  if (features.links || features.uploadedImages || features.menuSlide) report.interactive = features;
  if (motionResult) report.motion = { preset: "keynote", animatedObjects: motionResult.animatedObjects,
    transitionSlides: motionResult.transitionSlides, navigationSlides, preview: "static" };
  if (!report.passed) throw new Error("EXPORTED_TEXT_MISMATCH");
  return { bytes, report };
}
