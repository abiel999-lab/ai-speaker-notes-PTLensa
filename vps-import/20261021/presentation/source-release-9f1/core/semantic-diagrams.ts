import type { SceneObject, SceneSlide, SourceDocument, ThemeId } from "./types.js";
import { THEMES } from "./palette.js";

/** Phase 8E: semantic, native-editable diagrams, not charts or invented facts.
 * Source text, source IDs, object order and grouping are immutable here.
 * Diagram placement is deliberately skipped when geometry cannot fit.
 */
export function composeSemanticDiagram(
  slide: SceneSlide,
  doc: SourceDocument,
  theme: ThemeId,
  wrap: (text: string, width: number, pt: number) => string[],
  height: (lines: number, pt: number) => number,
  fontScale = 1,
  accentOverride?: string | null,
): boolean {
  if (slide.layout !== "process" && slide.layout !== "timeline") return false;
  const source = new Map(doc.blocks.map((b) => [b.id, b]));
  const texts = slide.objects.filter((o) => o.type === "text" && !!o.sourceId);
  const lists = texts.filter((o) => source.get(o.sourceId!)?.kind === "list");
  if (lists.length < 3 || lists.length > 5) return false;
  if (new Set(lists.map((o) => o.sourceId)).size !== lists.length) return false;
  // Only whole, contiguous list blocks: never reorganize a partial source block.
  if (lists.some((o) => o.text !== source.get(o.sourceId!)?.text)) return false;
  const first = texts.indexOf(lists[0]);
  if (first < 0 || texts.slice(first).some((o) => !lists.includes(o))) return false;
  const lead = texts.slice(0, first);
  if (lead.some((o) => o.y + o.h > 3.0)) return false;
  const startY = Math.max(1.68, ...lead.map((o) => o.y + o.h + 0.34));
  const palette = THEMES[theme];
  const accent = accentOverride || palette.accent;
  const shapes: SceneObject[] = [];

  if (slide.layout === "process") {
    // Only a genuine three-stage sequence receives horizontal flow arrows.
    if (lists.length !== 3 || lists.some((o) => (o.text || "").length > 95)) return false;
    const size = Math.max(15, 17 * fontScale);
    const cardW = 3.72, gap = 0.43, left = 0.69, textW = 3.26;
    const placed = lists.map((object) => ({object, lines:wrap(object.text || "",textW,size)}));
    const boxH = Math.max(1.64, ...placed.map((p) => height(p.lines.length,size) + 0.55));
    if (startY + boxH > 6.72 || boxH > 3.2) return false;
    for (let i = 0; i < placed.length; i++) {
      const x = left + i * (cardW+gap);
      const p = placed[i];
      shapes.push({type:"shape",shape:"rect",x,y:startY,w:cardW,h:boxH,fill:palette.panel});
      shapes.push({type:"shape",shape:"rect",x,y:startY,w:cardW,h:0.075,fill:accent});
      shapes.push({type:"shape",shape:"ellipse",x:x+0.23,y:startY+0.24,w:0.17,h:0.17,fill:accent});
      p.object.x=x+0.23;
      p.object.y=startY+(boxH-height(p.lines.length,size))/2+0.12;
      p.object.w=textW;p.object.h=height(p.lines.length,size);
      p.object.fontSize=size;p.object.lines=p.lines;p.object.text=p.lines.join("");
      if (i < 2) {
        // Connect each consecutive stage using fully editable lines and nodes.
        shapes.push({type:"shape",shape:"line",x:x+cardW,y:startY+boxH/2,w:gap,h:0.005,fill:accent});
        shapes.push({type:"shape",shape:"ellipse",x:x+cardW+gap/2-0.05,y:startY+boxH/2-0.05,w:0.1,h:0.1,fill:accent});
      }
    }
  } else {
    // Source-ordered, vertical timeline with native milestones and a rail.
    if (lists.some((o) => (o.text || "").length > 165)) return false;
    const size=Math.max(15,17*fontScale), textW=9.96;
    const placed=lists.map(object=>({object,lines:wrap(object.text||"",textW,size)}));
    const rowH=placed.map(p=>Math.max(0.80,height(p.lines.length,size)+0.24));
    const gap=0.16;
    const total=rowH.reduce((a,b)=>a+b,0)+gap*(rowH.length-1);
    if (startY+total>6.73) return false;
    const centerYs:number[]=[];
    let y=startY;
    for (let i=0;i<placed.length;i++) {
      const p=placed[i],h=rowH[i];
      shapes.push({type:"shape",shape:"rect",x:1.64,y,w:10.97,h,fill:palette.panel});
      shapes.push({type:"shape",shape:"rect",x:1.64,y,w:0.068,h,fill:accent});
      centerYs.push(y+h/2);
      p.object.x=1.94;p.object.y=y+(h-height(p.lines.length,size))/2;
      p.object.w=textW;p.object.h=height(p.lines.length,size);
      p.object.fontSize=size;p.object.lines=p.lines;p.object.text=p.lines.join("");
      y+=h+gap;
    }
    shapes.push({type:"shape",shape:"line",x:1.09,y:centerYs[0],w:0.005,h:centerYs.at(-1)!-centerYs[0],fill:accent});
    for (const cy of centerYs) {
      shapes.push({type:"shape",shape:"ellipse",x:0.985,y:cy-0.105,w:0.215,h:0.215,fill:accent});
      shapes.push({type:"shape",shape:"line",x:1.20,y:cy,w:0.44,h:0.005,fill:accent});
    }
  }
  // Remove only the default small bullet markers and wide content card backdrops.
  // Text/table/image objects are NEVER removed or reordered.
  slide.objects=slide.objects.filter(o=>!(o.type==="shape"&&(
    (o.shape==="rect"&&o.w>5&&o.x<=0.7&&o.y>0.74&&o.y<6.7&&o.h>0.17&&o.h<3.5)||
    (o.shape==="ellipse"&&o.w<=0.16&&o.h<=0.16&&o.x>=0.64&&o.x<1.25)||
    (o.shape==="line"&&slide.layout==="timeline"&&o.x>=0.72&&o.x<0.75&&o.w<=0.02)
  )));
  slide.objects.unshift(...shapes);
  return true;
}
