import opentype from "opentype.js";
import path from "node:path";
import fs from "node:fs";
import type {
  SourceDocument,
  Plan,
  Scene,
  SceneSlide,
  SceneObject,
  ThemeId,
  VisualSettings,
} from "./types.js";
import { validatePlan } from "./planner.js";
import { enrichSceneVisuals } from "./visual-grammar.js";
import { composeNativeCards } from "./visual-grid.js";
import { composeSemanticDiagram } from "./semantic-diagrams.js";
import { composeAdaptivePanels } from "./adaptive-panels.js";
import { composeReferenceRows } from "./reference-layout.js";
function loadFont(file: string) {
  const data = fs.readFileSync(path.resolve(file));
  return opentype.parse(
    data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer,
  );
}
const regular = loadFont("assets/fonts/LiberationSans-Regular.ttf");
const boldFont = loadFont("assets/fonts/LiberationSans-Bold.ttf");
import { THEMES } from "./palette.js";
export { THEMES } from "./palette.js";
export const WIDTH = 13.333333,
  HEIGHT = 7.5;
export function textWidth(text: string, pt: number, bold = false) {
  return (
    (bold ? boldFont : regular).getAdvanceWidth(text, pt, { kerning: true }) /
    72
  );
}
export function wrapText(
  text: string,
  width: number,
  pt: number,
  bold = false,
): string[] {
  if (!text) return [""];
  let current = "";
  const out: string[] = [];
  for (const token of text.match(/\S+\s*|\s+/gu) || []) {
    if (textWidth(current + token, pt, bold) <= width) {
      current += token;
      continue;
    }
    if (current) {
      out.push(current);
      if (out.length > 4000) throw new Error("SLIDE_LIMIT");
      current = "";
    }
    if (textWidth(token, pt, bold) <= width) {
      current = token;
      continue;
    }
    for (const cp of token) {
      if (current && textWidth(current + cp, pt, bold) > width) {
        out.push(current);
        if (out.length > 4000) throw new Error("SLIDE_LIMIT");
        current = "";
      }
      current += cp;
    }
  }
  if (current || !out.length) out.push(current);
  return out;
}
export function textHeight(lines: number, pt: number) {
  return (lines * pt * 1.28) / 72 + 0.045;
}
function decorate(
  slide: SceneSlide,
  t: typeof THEMES.midnight,
  layout: string,
  options: VisualSettings,
) {
  const template = options.template || "editorial";
  if (template === "minimal") {
    slide.objects.push({
      type: "shape",
      shape: "rect",
      x: 0.66,
      y: 0.55,
      w: 0.12,
      h: 0.12,
      fill: t.accent,
    });
    if (layout === "section" || layout === "cover")
      slide.objects.push({
        type: "shape",
        shape: "line",
        x: 0.66,
        y: 6.87,
        w: 11.8,
        h: 0.01,
        fill: t.accent,
      });
  } else if (template === "studio") {
    slide.objects.push({
      type: "shape",
      shape: "rect",
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.13,
      fill: t.accent,
    });
    if (["section", "cover", "statement"].includes(layout))
      slide.objects.push(
        {
          type: "shape",
          shape: "rect",
          x: 11.5,
          y: 0.13,
          w: 1.833,
          h: 7.37,
          fill: t.panel,
        },
        {
          type: "shape",
          shape: "ellipse",
          x: 11.76,
          y: 0.62,
          w: 0.75,
          h: 0.75,
          fill: t.accent,
        },
      );
  } else if (template === "executive") {
    slide.objects.push(
      {
        type: "shape",
        shape: "rect",
        x: 0,
        y: 0,
        w: 0.13,
        h: 7.5,
        fill: t.accent,
      },
      {
        type: "shape",
        shape: "line",
        x: 0.66,
        y: 7.03,
        w: 12,
        h: 0.005,
        fill: t.panel,
      },
    );
  } else {
    slide.objects.push({
      type: "shape",
      shape: "line",
      x: 0.66,
      y: 0.57,
      w: 0.6,
      h: 0.005,
      fill: t.accent,
    });
    if (["cover", "section", "statement"].includes(layout))
      slide.objects.push(
        {
          type: "shape",
          shape: "rect",
          x: 11.6,
          y: 0,
          w: 1.733,
          h: 7.5,
          fill: t.panel,
        },
        {
          type: "shape",
          shape: "ellipse",
          x: 10.83,
          y: 4.7,
          w: 1.55,
          h: 1.55,
          fill: t.accent,
        },
      );
    else
      slide.objects.push({
        type: "shape",
        shape: "line",
        x: 0.66,
        y: 7.03,
        w: 12,
        h: 0.005,
        fill: t.panel,
      });
  }
}
export function buildScene(
  doc: SourceDocument,
  plan: Plan,
  theme: ThemeId,
  options: VisualSettings = {},
): Scene {
  validatePlan(doc, plan);
  const palette = THEMES[theme];
  if (!palette) throw new Error("THEME_INVALID");
  const t = { ...palette, accent: options.accent || palette.accent };
  const result: SceneSlide[] = [];
  const gridEligible = new Set<string>();
  for (const planned of plan.slides) {
    const firstSceneIndex = result.length;
    let slide!: SceneSlide;
    let y = 0.93;
    let column = 0;
    let contentStart = 1.0;
    const compact = planned.layout === "columns";
    let columnWidth = compact ? 5.67 : 12;
    const photo = planned.layout === "photo" && !!planned.imageId;
    if (photo) columnWidth = 7.48;
    const create = (continued = false) => {
      slide = {
        id: `scene${result.length}`,
        layout: continued ? "editorial" : planned.layout,
        background: t.bg,
        objects: [],
        blockIds: [],
      };
      decorate(slide, t, slide.layout, options);
      if (!continued && planned.layout === "timeline")
        slide.objects.push({
          type: "shape",
          shape: "line",
          x: 0.73,
          y: 1.38,
          w: 0.005,
          h: 4.95,
          fill: t.panel,
        });
      result.push(slide);
      if (result.length > 80) throw new Error("SLIDE_LIMIT");
      y = 0.93;
      column = 0;
      contentStart = 0.93;
      if (photo)
        slide.objects.push({
          type: "image",
          asset: planned.imageId || "city",
          x: 9.05,
          y: 0.0,
          w: 4.283,
          h: 7.5,
        });
    };
    create();
    for (const id of planned.blockIds) {
      const b = doc.blocks.find((x) => x.id === id)!;
      if (b.kind === "table" && b.cells) {
        const cols = b.cells[0].length;
        if (cols > 6) throw new Error("TABLE_TOO_WIDE");
        const font = 17 * (options.fontScale || 1);
        const colWidth = 12 / cols;
        const rowHeight = (row: string[]) =>
          Math.max(
            ...row.map((v) =>
              textHeight(wrapText(v, colWidth - 0.28, font).length, font),
            ),
          ) + 0.18;
        let rows: string[][] = [];
        let height = 0;
        let part = 0;
        const put = () => {
          if (!rows.length) return;
          slide.objects.push({
            type: "table",
            sourceId: b.id,
            rows,
            cellLines: rows.map((row) =>
              row.map((v) => wrapText(v, colWidth - 0.28, font)),
            ),
            rowHeights: rows.map(rowHeight),
            text: rows.map((r) => r.join("\t")).join("\n"),
            x: 0.66,
            y,
            w: 12,
            h: height,
            fontSize: font,
            color: t.fg,
            fill: t.panel,
          });
          if (!slide.blockIds.includes(b.id)) slide.blockIds.push(b.id);
          y += height + 0.24;
          rows = [];
          height = 0;
          part++;
        };
        for (const row of b.cells) {
          const rh = rowHeight(row);
          if (rh > 5.6) throw new Error("TABLE_CELL_TOO_LONG");
          if (y + height + rh > 6.78) {
            put();
            create(true);
          }
          rows.push(row);
          height += rh;
        }
        put();
        continue;
      }
      // Standalone Markdown section separators are source text, not decoration.
      // Retain their original glyph for export, but keep them from consuming an
      // entire content row or pushing the following heading down the page.
      if (b.text.trim() === "*" && b.text.length <= 3 &&
          planned.blockIds.length > 1) {
        const markerFont = Math.max(14, 16 * (options.fontScale || 1));
        const originalLines = wrapText(b.text, 1.2, markerFont);
        slide.objects.push({ type: "text", sourceId: b.id, text: b.text,
          lines: originalLines, x: 0.68, y: 0.54, w: 1.2,
          h: textHeight(originalLines.length, markerFont), fontSize: markerFont,
          bold: false, color: t.accent });
        slide.blockIds.push(b.id);
        continue;
      }
      const isHeading = b.kind === "heading";
      let size = isHeading
        ? 30
        : b.kind === "reference" || b.kind === "code"
          ? 17
          : options.density === "compact"
            ? 19
            : 21;
      let weight = isHeading;
      const titleOnly = planned.blockIds.every((blockId) => {
        const block = doc.blocks.find(item => item.id === blockId)!;
        return block.kind === "heading" || block.text.trim() === "*";
      });
      const hero =
        (titleOnly && isHeading && b.text.length < 220) ||
        (["cover", "section"].includes(planned.layout) &&
         planned.blockIds.length === 1 && b.text.length < 220);
      const opening = result.length === 1 && planned.blockIds.length === 1 &&
        b.kind === "paragraph" && b.text.length >= 110 && b.text.length <= 450;
      // Keep long or multi-block source material readable. A statement is a
      // single, concise source paragraph, never an entire list or report section.
      const statement = planned.layout === "statement" &&
        planned.blockIds.length === 1 && b.kind === "paragraph" &&
        b.text.length > 20 && b.text.length <= 200;
      if (hero) {
        size = isHeading ? 42 : 34;
        columnWidth = 9.9;
        y = 2.02;
      }
      if (opening) {
        // A source paragraph can form a strong opening visual without
        // inventing a presentation title or dropping a single character.
        size = 26;
        columnWidth = 7.90;
        y = 1.45;
      }
      if (statement && !opening) {
        size = 28;
        columnWidth = 9.85;
        y = Math.max(y, 1.7);
      }
      size *= options.fontScale || 1;
      const textW =
        (isHeading ? (photo ? 7.48 : 11.8) : columnWidth) -
        (b.kind === "list" && !/^\s*\d+[.)]/.test(b.text) ? 0.2 : 0);
      const lines = wrapText(b.text, textW, size, weight);
      let offset = 0;
      while (offset < lines.length) {
        let available = 6.75 - y;
        const fullHeight = textHeight(lines.length, size);
        // Keep a block together whenever it fits on a fresh column/page.
        if (
          offset === 0 &&
          fullHeight > available &&
          fullHeight <= 6.75 - contentStart
        ) {
          if (compact && !isHeading && column === 0) {
            column = 1;
            y = contentStart;
          } else create(true);
          continue;
        }
        let count = Math.floor((available - 0.06) / ((size * 1.28) / 72));
        if (count < 1) {
          if (compact && !isHeading && column === 0) {
            column = 1;
            y = contentStart;
          } else create(true);
          continue;
        }
        if (
          isHeading &&
          offset === 0 &&
          textHeight(lines.length, size) > available &&
          textHeight(lines.length, size) <= 5.82
        ) {
          create(true);
          continue;
        }
        const take = Math.min(count, lines.length - offset);
        const chunk = lines.slice(offset, offset + take);
        const text = chunk.join("");
        const h = textHeight(chunk.length, size);
        const obj: SceneObject = {
          type: "text",
          sourceId: b.id,
          text,
          lines: chunk,
          x: column === 0 ? 0.66 : 7.0,
          y,
          w: textW,
          h,
          fontSize: size,
          bold: weight,
          color: t.fg,
        };
        if (["process", "cards"].includes(planned.layout) && !isHeading)
          slide.objects.push({
            type: "shape",
            shape: "rect",
            x: planned.layout === "cards" ? obj.x - 0.12 : 0.5,
            y: obj.y - 0.05,
            w: planned.layout === "cards" ? obj.w + 0.24 : 12.25,
            h: obj.h + 0.12,
            fill: t.panel,
          });
        if (planned.layout === "timeline" && !isHeading) {
          slide.objects.push({
            type: "shape",
            shape: "ellipse",
            x: obj.x,
            y: y + 0.04,
            w: 0.14,
            h: 0.14,
            fill: t.accent,
          });
          obj.x += 0.36;
          obj.w -= 0.36;
        } else if (b.kind === "list" && !/^\s*\d+[.)]/.test(b.text)) {
          slide.objects.push({
            type: "shape",
            shape: "ellipse",
            x: obj.x,
            y: y + 0.1,
            w: 0.075,
            h: 0.075,
            fill: t.accent,
          });
          obj.x += 0.2;
        }
        slide.objects.push(obj);
        if (!slide.blockIds.includes(b.id)) slide.blockIds.push(b.id);
        y += obj.h + 0.22;
        offset += take;
        if (isHeading) {
          contentStart = y;
          column = 0;
        }
        if (offset < lines.length) {
          if (compact && !isHeading && column === 0) {
            column = 1;
            y = contentStart;
          } else create(true);
        }
      }
    }
    // Apply source-anchored offsets after text wrapping and continuations are planned.
    // A block that flows onto multiple slides moves consistently across its parts.
    // Never move decorations, or alter source text, reading order or source IDs.
    if (!planned.offsets)
      for (const generated of result.slice(firstSceneIndex)) gridEligible.add(generated.id);
    if (planned.offsets)
      for (const generated of result.slice(firstSceneIndex))
        for (const object of generated.objects) {
          if ((object.type !== "text" && object.type !== "table") || !object.sourceId)
            continue;
          const offset = planned.offsets[object.sourceId];
          if (offset) {
            object.x += offset.dx;
            object.y += offset.dy;
          }
        }
  }
  if (result.length > 80) throw new Error("SLIDE_LIMIT");
  // Safe, native editable card layouts for manageable lists; skip every
  // layout with ambiguous source fragments or insufficient free space.
  for (const slide of result)
    if (gridEligible.has(slide.id)) {
      const referencesApplied = composeReferenceRows(slide, doc, theme, wrapText, textHeight, options.fontScale || 1, options.accent);
      const semanticApplied = !referencesApplied && composeSemanticDiagram(slide, doc, theme, wrapText, textHeight, options.fontScale || 1, options.accent);
      const cardsApplied = !referencesApplied && !semanticApplied && composeNativeCards(slide, doc, theme, wrapText, textHeight, options.fontScale || 1, options.accent);
      if (!referencesApplied && !semanticApplied && !cardsApplied)
        composeAdaptivePanels(slide, doc, theme, wrapText, textHeight, options.fontScale || 1, options.accent);
    }
  for (const s of result)
    for (const o of s.objects) {
      if (
        o.type === "text" &&
        (o.x < 0 ||
          o.y < 0 ||
          o.x + o.w > WIDTH + 0.02 ||
          o.y + o.h > HEIGHT - 0.4)
      )
        throw new Error("LAYOUT_BOUNDS");
    }
  return enrichSceneVisuals({
    slides: result,
    theme,
    sourceHash: doc.sha256,
    version: "layout-v6-universal",
  }, options);
}
