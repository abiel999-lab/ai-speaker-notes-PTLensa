/**
 * Source-grounded presenter notes. The content is computed from the *final*
 * scene rather than from an AI model or guessed talking points.
 * Note: source preservation verification applies only to slide content;
 * speaker notes are explicitly labelled as derived helper text.
 */
import type { Scene, SceneSlide, SourceDocument } from "./types.js";

const MAX_NOTES_CHARS = 30000;

export function slideNotes(slide: SceneSlide, slideNumber: number, total: number): string {
  const chunks = slide.objects.flatMap((item) => {
    if (!item.sourceId) return [];
    if (item.type === "text" && item.text) return [item.text];
    if (item.type === "table" && item.rows)
      return [item.rows.map((row) => row.join(" | ")).join("\n")];
    return [];
  });
  const text = chunks.join("\n\n");
  const header = `Slide ${slideNumber} of ${total} — Source-based presenter notes`;
  const warning = "These notes repeat the slide source; no AI commentary was generated.";
  // Limit note size without cutting a Unicode surrogate pair in half.
  const allowed = MAX_NOTES_CHARS - header.length - warning.length - 100;
  const clipped = text.length > allowed;
  const safeBody = clipped ? Array.from(text).slice(0, allowed).join("") : text;
  return `${header}\n${warning}\n\n${safeBody}${clipped ? "\n\n[NOTES TRUNCATED: consult the original slide for complete content]" : ""}`;
}

export function notesForScene(doc: SourceDocument, scene: Scene): string[] {
  if (scene.sourceHash !== doc.sha256) throw new Error("SOURCE_CHANGED");
  return scene.slides.map((slide, i) => slideNotes(slide, i + 1, scene.slides.length));
}

export function notesTranscript(doc: SourceDocument, scene: Scene): string {
  return `NotePreso | PowerPoint Maker — Presenter Notes\nSource fingerprint: ${doc.sha256}\nGenerated from slide text, not an AI commentary.\n\n` + notesForScene(doc, scene).join("\n\n---\n\n") + "\n";
}
