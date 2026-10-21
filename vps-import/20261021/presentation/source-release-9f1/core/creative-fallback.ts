/** Source-first local Creative rescue layout.
 * No AI or network calls. Keeps every source atom unchanged and in order.
 * The geometry quality validator and final PPTX fidelity validator remain active.
 */
import { WIDTH, HEIGHT, textHeight, wrapText } from "./layout.js";
import { validateScene } from "./fidelity.js";
import { THEMES } from "./palette.js";
import type { Scene, SceneObject, SceneSlide, SourceDocument, ThemeId } from "./types.js";

export interface RescueAtom {
  key: string; sourceId: string; text: string; kind: string;
  role?: string; rows?: string[][];
}
export interface RescueOptions {
  assets?: { id: string; description: string }[];
  slideCount?: number | null;
  interactiveLinks?: boolean;
  motion?: boolean;
}
interface Placement { objects: SceneObject[]; height: number; font: number; }
interface Layout { objects: SceneObject[]; font: number; columns: number; }
const TOP = .72;
const GAP = .14;
const LIMIT = 80;
function bottom(motion: boolean) { return motion ? 6.60 : HEIGHT - .48; }
function isHeading(atom: RescueAtom) { return atom.kind === "heading"; }
function lineFont(atom: RescueAtom, base: number) {
  return isHeading(atom) ? Math.min(45, Math.max(20, base * (atom.role === "title" ? 1.65 : 1.32))) : base;
}
function atomPlacement(atom: RescueAtom, x: number, y: number, w: number, base: number, fg: string, bg: string): Placement | null {
  const pt = lineFont(atom, base);
  if (atom.rows) {
    const count = atom.rows[0]?.length || 0;
    const cellWidth = w / count - .24;
    if (count === 0 || cellWidth < .13) return null;
    const cellLines = atom.rows.map(row => row.map(value => wrapText(value, cellWidth, base)));
    const rowHeights = cellLines.map(row => Math.max(...row.map(lines => textHeight(lines.length, base))) + .22);
    const h = rowHeights.reduce((a, b) => a + b, 0) + .08;
    return { height: h, font: base, objects: [{ type: "table", x, y, w, h, sourceId: atom.sourceId,
      rows: atom.rows, cellLines, rowHeights, fontSize: base, color: fg, fill: bg }] };
  }
  const lines = atom.text.split("\n").flatMap(line => wrapText(line, w, pt, isHeading(atom)));
  const h = textHeight(lines.length, pt) + .10;
  return { height: h, font: pt, objects: [{ type: "text", x, y, w, h, text: atom.text, lines,
    sourceId: atom.sourceId, fontSize: pt, bold: isHeading(atom), color: fg, align: "left" }] };
}
function arrangement(atoms: RescueAtom[], x: number, width: number, base: number,
  columns: number, color: string, background: string, motion: boolean): Layout | null {
  const ends = columns === 1 ? [atoms.length] : Array.from({ length: atoms.length - 1 }, (_, i) => i + 1);
  let best: Layout | null = null;
  let bestDepth = Infinity;
  for (const split of ends) {
    const colWidth = columns === 1 ? width : (width - .40) / 2;
    const coords = [TOP, TOP];
    const content: SceneObject[] = [];
    let good = true;
    for (let i = 0; i < atoms.length; i++) {
      const side = i < split ? 0 : 1;
      const colX = x + (side === 1 ? colWidth + .40 : 0);
      const placement = atomPlacement(atoms[i], colX, coords[side], colWidth, base, color, background);
      if (!placement || coords[side] + placement.height > bottom(motion) + .002) { good = false; break; }
      content.push(...placement.objects);
      coords[side] += placement.height + GAP;
    }
    if (!good) continue;
    const depth = Math.max(...coords);
    if (depth < bestDepth) { bestDepth = depth; best = { objects: content, font: base, columns }; }
  }
  return best;
}
function fitGroup(atoms: RescueAtom[], motion: boolean, allowInline: boolean, fg: string, bg: string): { layout: Layout; inline: boolean } | null {
  // Keep a legible minimum font. Every candidate uses measured native objects;
  // images never overlay content when placed inline.
  for (const base of [23, 21, 19, 17, 15, 14]) {
    if (allowInline) {
      const side = arrangement(atoms, .72, 7.55, base, 1, fg, bg, motion);
      if (side) return { layout: side, inline: true };
    }
    const full = arrangement(atoms, .80, WIDTH - 1.6, base, 1, fg, bg, motion);
    if (full) return { layout: full, inline: false };
    const two = arrangement(atoms, .80, WIDTH - 1.6, base, 2, fg, bg, motion);
    if (two) return { layout: two, inline: false };
  }
  return null;
}
function splitOversizedAtom(atom: RescueAtom): [RescueAtom, RescueAtom] | null {
  if (atom.rows) {
    if (atom.rows.length < 2) return null;
    const middle = Math.floor(atom.rows.length / 2);
    const first = atom.rows.slice(0, middle), second = atom.rows.slice(middle);
    return [{ ...atom, rows: first, text: first.map(r => r.join("\t")).join("\n") },
      { ...atom, rows: second, text: second.map(r => r.join("\t")).join("\n") }];
  }
  if (atom.text.length < 2) return null;
  let point = Math.floor(atom.text.length / 2);
  const boundary = atom.text.lastIndexOf(" ", point);
  if (boundary > point / 2) point = boundary + 1;
  return [{ ...atom, text: atom.text.slice(0, point) }, { ...atom, text: atom.text.slice(point) }];
}
function initialGroups(atoms: RescueAtom[], target?: number | null): RescueAtom[][] {
  const heads = atoms.flatMap((a, i) => isHeading(a) ? [i] : []);
  if (target && heads.length === target && heads[0] === 0) {
    return heads.map((start, i) => atoms.slice(start, heads[i + 1] ?? atoms.length));
  }
  if (target && target <= atoms.length) {
    // Deterministic order-preserving weighted partition. Avoid empty pages.
    const parts: RescueAtom[][] = [];
    let start = 0;
    for (let page = 0; page < target; page++) {
      const remaining = target - page;
      if (remaining === 1) { parts.push(atoms.slice(start)); break; }
      const remainingWeight = atoms.slice(start).reduce((s, a) => s + a.text.length + 75, 0);
      const desired = remainingWeight / remaining;
      let weight = 0, cut = start + 1;
      while (cut < atoms.length - remaining + 1) {
        const nextWeight = atoms[cut].text.length + 75;
        if (weight >= desired && isHeading(atoms[cut])) break;
        if (weight + nextWeight > desired && weight > 0) break;
        weight += nextWeight; cut++;
      }
      parts.push(atoms.slice(start, cut)); start = cut;
    }
    return parts;
  }
  const groups: RescueAtom[][] = [];
  for (const atom of atoms) {
    if (isHeading(atom) || !groups.length) groups.push([]);
    groups[groups.length - 1].push(atom);
  }
  return groups;
}
function linkTarget(atom: RescueAtom, current: number, sectionByTitle: Map<string, number>, menu: number | undefined): number | undefined {
  const words = atom.text.trim().toLocaleLowerCase("id-ID");
  if (menu && /^(kembali ke peta|kembali ke menu|back to menu|back to map)$/i.test(words) && current !== menu) return menu;
  if (/^(ulangi kuis|retry quiz)$/i.test(words)) {
    const quiz = [...sectionByTitle].find(([title]) => /kuis|quiz/.test(title))?.[1];
    if (quiz && quiz !== current) return quiz;
  }
  if (/^[a-d][.)]\s+/i.test(words) && /kuis|quiz/.test([...sectionByTitle.keys()].join(" "))) {
    const answer = [...sectionByTitle].find(([title]) => /^(jawaban|answer)\b/.test(title))?.[1];
    if (answer && answer !== current) return answer;
  }
  const found = sectionByTitle.get(words);
  if (found && found !== current) return found;
  // Prefix aliases only for exact existing, source-grounded topic labels.
  if (/^buka /i.test(words)) {
    const title = words.replace(/^buka /, "");
    const target = sectionByTitle.get(title);
    if (target && target !== current) return target;
  }
  return undefined;
}
/** Never accepts provider-determined coordinates, words, or asset paths. */
export function buildCreativeRescueScene(doc: SourceDocument, atoms: RescueAtom[], theme: ThemeId, opts: RescueOptions = {}): { scene: Scene; warning: string } {
  if (!atoms.length) throw new Error("CREATIVE_SOURCE_LIMIT");
  const requested = opts.slideCount || null;
  const groups = initialGroups(atoms, requested);
  const motion = opts.motion === true;
  const palette = THEMES[theme];
  const assets = (opts.assets || []).filter(a => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(a.id)).slice(0, 12);
  const slides: SceneSlide[] = [];
  // Split overly dense groups into more slides. Never truncate text or reduce
  // font below 14pt to satisfy an impossible target count.
  const queue = [...groups];
  while (queue.length) {
    const group = queue.shift()!;
    const index = slides.length;
    const asset = assets.length ? assets[index % assets.length] : undefined;
    const useImage = !!asset;
    const background = useImage ? "#09192A" : palette.bg;
    const fg = useImage ? "#FFFFFF" : palette.fg;
    const fitted = fitGroup(group, motion, useImage && group.length <= 5, fg, background);
    if (!fitted) {
      if (slides.length + queue.length + 2 > LIMIT) throw new Error("CREATIVE_SOURCE_TOO_DENSE");
      if (group.length === 1) {
        const pieces = splitOversizedAtom(group[0]);
        if (!pieces) throw new Error("CREATIVE_SOURCE_TOO_DENSE");
        queue.unshift([pieces[0]], [pieces[1]]);
      } else {
        const half = Math.max(1, Math.floor(group.length / 2));
        queue.unshift(group.slice(0, half), group.slice(half));
      }
      continue;
    }
    const { inline, layout } = fitted;
    const objects: SceneObject[] = [];
    if (asset) {
      if (inline) objects.push({ type: "image", x: 8.78, y: .85, w: 3.83, h: motion ? 5.48 : 5.8,
        asset: asset.id, backgroundImage: false, imageTreatment: "none" });
      else objects.push({ type: "image", x: 0, y: 0, w: WIDTH, h: HEIGHT, asset: asset.id,
        backgroundImage: true, imageTreatment: "dark", imageTextSide: "full" });
    }
    objects.push({ type: "shape", shape: "rect", x: .35, y: .33, w: .65, h: .045,
      fill: palette.accent, fillOpacity: 1 });
    objects.push(...layout.objects);
    slides.push({ id: "creative-rescue-" + index, layout: "editorial", background,
      blockIds: [...new Set(group.map(a => a.sourceId))], objects });
  }
  if (slides.length > LIMIT) throw new Error("SLIDE_LIMIT");
  const sectionByTitle = new Map<string, number>();
  const headings = atoms.filter(isHeading);
  for (const [i, slide] of slides.entries()) {
    const texts = slide.objects.filter(o => o.type === "text");
    for (const t of texts) {
      if (headings.some(a => a.sourceId === t.sourceId && a.text === t.text)) {
        const key = t.text!.trim().toLocaleLowerCase("id-ID");
        if (!sectionByTitle.has(key)) sectionByTitle.set(key, i + 1);
      }
    }
  }
  const menu = [...sectionByTitle].find(([title]) => /peta|topic map|exploration map|menu/.test(title))?.[1];
  if (opts.interactiveLinks) for (const [i, slide] of slides.entries()) {
    for (const object of slide.objects) {
      if (object.type !== "text") continue;
      const atom = atoms.find(a => a.text === object.text && a.sourceId === object.sourceId);
      if (!atom) continue;
      const target = linkTarget(atom, i + 1, sectionByTitle, menu);
      if (target) object.targetSlide = target;
    }
  }
  const scene: Scene = { theme, sourceHash: doc.sha256, version: "creative-rescue-1", slides,
    ...(opts.interactiveLinks && menu ? { menuSlide: menu } : {}) };
  const report = validateScene(doc, scene);
  if (!report.passed) throw new Error("CREATIVE_RESCUE_FIDELITY_FAILED");
  return { scene, warning: requested && slides.length !== requested
    ? `Creative layout was rebuilt locally. Requested ${requested} slides; ${slides.length} were necessary to keep all original content readable.`
    : "Creative layout was rebuilt locally to preserve every source block and produce an editable presentation." };
}
