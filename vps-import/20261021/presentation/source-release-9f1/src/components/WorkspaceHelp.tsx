import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Language } from "../studio/types";

/** A bookmarkable guide page; the workspace retains its draft while it is open. */
export function WorkspaceHelp({ lang, onBack }: { lang: Language; onBack: () => void }) {
  const id = lang === "id";
  const steps = [
    ["Add your content", "Paste your original text or upload a TXT/Markdown document (up to 2 MB). Select the appropriate reading mode. You can also select Generate a draft from a topic, then review and accept the generated text as your source. NotePreso preserves the source wording during presentation generation."],
    ["Choose Template or Creative AI", "Template provides preset styles and in-app text/design editing after generation. Creative AI uses GPT-6 Luna to design a custom composition from your brief; Creative results can be previewed and downloaded, but cannot yet be edited in the app."],
    ["Customize your presentation", "For Creative AI, write a visual design brief, optionally request a target slide count, and select up to 12 JPG/PNG images with helpful descriptions. Enable Interactive topic and quiz links to connect existing labels to slides. Select Keynote under PowerPoint motion for native entrances, slide transitions, and navigation."],
    ["Generate and track usage", "Select Generate presentation and wait for the result. Creative AI makes at most one Luna composition request; if the design cannot pass layout checks or the provider is unavailable, NotePreso attempts a local, source-safe fallback without another paid AI request. A fallback may simplify the design or require more slides. Security and file-integrity checks can still stop a job. AI tokens and Estimated USD reflect the usage that was reported for each version and today."],
    ["Review the result", "Check that the slides contain all your source text, readable layouts, and the uploaded images. Review navigation under Links on this slide, and open the validation report when available. In Template mode, you can revise text/design in the app; Creative AI currently provides preview and download only. A web preview is static, not an animation preview."],
    ["Download and present", "Download PowerPoint or PDF (when rendering is ready); filenames follow your project name. Download the validation report if you need export details. Open the PPTX in desktop PowerPoint and press F5 to test Keynote-style motion and clickable menu/quiz links. PDFs and web previews do not play motion. If PowerPoint reports a repaired file, verify it before sharing and report the issue. Your slide content can use any supported source language; the application UI is English."],
  ];
  return <article className="workspace-help-page" aria-labelledby="workspace-help-title">
    <a href="/app" className="workspace-help-back" onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); onBack();
    }}><ArrowLeft size={16} />{id ? "Kembali ke workspace" : "Back to workspace"}</a>
    <header className="workspace-help-hero">
      <p className="eyebrow">NotePreso · PowerPoint Maker</p>
      <h1 id="workspace-help-title" tabIndex={-1}>{id ? "Cara Penggunaan" : "How to Use"}</h1>
      <p>{id ? "Dari teks Anda menjadi presentasi PowerPoint yang dapat diedit. Ikuti enam langkah berikut." :
        "Turn your words into an editable PowerPoint presentation. Follow these six steps."}</p>
    </header>
    <ol className="workspace-help-steps">{steps.map(([title, description], index) => <li key={title}>
      <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div><h2>{title}</h2><p>{description}</p></div>
    </li>)}</ol>
    <footer className="workspace-help-footer">
      <div><strong>{id ? "Siap membuat presentasi?" : "Ready to make a presentation?"}</strong>
        <p>{id ? "Kembali ke workspace untuk melanjutkan pekerjaan Anda." : "Return to the workspace to continue your work."}</p></div>
      <button type="button" className="button primary" onClick={onBack}>
        {id ? "Buka workspace" : "Open workspace"}<ArrowRight size={16} />
      </button>
    </footer>
  </article>;
}
