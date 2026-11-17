import { useRef, useState } from "react";
import {
  Upload,
  FileText,
  ArrowRight,
  ShieldCheck,
  Loader2,
  Sparkles,
} from "lucide-react";
import { api, ApiError } from "../api";
import { en, id } from "../i18n";
import type { Studio } from "../studio/useStudio";
import type { Language } from "../studio/types";
export function SourceStep({
  studio: s,
  lang,
  next,
}: {
  studio: Studio;
  lang: Language;
  next: () => void;
}) {
  const t = lang === "en" ? en : id;
  const file = useRef<HTMLInputElement>(null);
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("General");
  const [purpose, setPurpose] = useState<"overview" | "training" | "pitch" | "report">("overview");
  const [sections, setSections] = useState(6);
  const [draftBusy, setDraftBusy] = useState(false);
  const [generated, setGenerated] = useState<{ title: string; source: string; attribution: string } | null>(null);
  const translate = (english: string, indonesian: string) => lang === "en" ? english : indonesian;
  async function authorDraft() {
    setDraftBusy(true);
    setGenerated(null);
    s.setError(null);
    try {
      const { draft } = await api<{ draft: { title: string; source: string; attribution: string } }>("/prompt-drafts", "POST", {
        topic, audience, purpose, sections,
        language: "English",
      });
      setGenerated(draft);
    } catch (e) {
      s.setError(e);
    } finally {
      setDraftBusy(false);
    }
  }
  function acceptDraft() {
    if (!generated) return;
    if (s.draft.source.trim() && !window.confirm(translate(
      "Replace the text currently in this editor with the reviewed AI draft?",
      "Ganti teks yang saat ini ada di editor dengan draf AI yang sudah diperiksa?",
    ))) return;
    s.edit({ name: generated.title, source: generated.source, mode: "markdown" });
    s.setSettings(v => ({ ...v, mode: "markdown" }));
    setGenerated(null);
  }
  async function importFile(f?: File) {
    if (!f) return;
    s.setBusy(true);
    s.setError(null);
    try {
      if (f.size > 2 * 1024 * 1024) throw new ApiError("SOURCE_TOO_LARGE");
      const bytes = new Uint8Array(await f.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.slice(i, i + 8192));
      const mode = f.name.toLowerCase().endsWith(".md")
        ? "markdown"
        : "literal";
      const result = await api("/import", "POST", {
        name: f.name,
        base64: btoa(binary),
        mode,
      });
      s.edit({
        name: f.name.replace(/\.(txt|md)$/i, ""),
        source: result.source,
        mode,
      });
      s.setSettings((v) => ({ ...v, mode }));
    } catch (e) {
      s.setError(e);
    } finally {
      s.setBusy(false);
    }
  }
  return (
    <section className="source-step">
      <div className="step-intro">
        <p className="eyebrow">01 / ORIGINAL CONTENT</p>
        <h1>{t.addContent}</h1>
        <p>{t.sourceLead}</p>
      </div>
      <details className="prompt-authoring" open={new URLSearchParams(window.location.search).has("author")}>
        <summary><Sparkles size={18} /> {translate("Generate a draft from a topic", "Buat draf dari sebuah topik")}</summary>
        <div className="prompt-authoring-body">
          <p>{translate(
            "AI can write a new presentation draft. Your topic is sent to the configured AI provider. Review and approve the text before it enters Preserve Source mode. Sections are not guaranteed slide counts.",
            "AI dapat menulis draf presentasi baru. Topik dikirim ke penyedia AI yang dikonfigurasi. Periksa dan setujui teks sebelum masuk ke mode Preserve Source. Jumlah bagian tidak selalu sama dengan jumlah slide.",
          )}</p>
          {!s.caps.ai && <p role="status" className="notice">{translate(
            "AI authoring is not configured in this local workspace. Add an API key securely before using this feature.",
            "AI belum dikonfigurasi dalam workspace lokal. Tambahkan API key secara aman untuk memakai fitur ini.",
          )}</p>}
          <label className="field" htmlFor="author-topic">
            {translate("Topic and instructions", "Topik dan instruksi")}
            <textarea id="author-topic" rows={4} maxLength={1500} value={topic}
              onChange={e => setTopic(e.target.value)} disabled={draftBusy || s.active}
              placeholder={translate("e.g. Strategies to reduce urban emissions for city government leaders", "Contoh: Strategi pengurangan emisi perkotaan bagi pimpinan pemerintah daerah")} />
          </label>
          <div className="prompt-authoring-grid">
            <label className="field" htmlFor="author-audience">{translate("Audience", "Audiens")}
              <input id="author-audience" value={audience} minLength={2} maxLength={160}
                onChange={e => setAudience(e.target.value)} disabled={draftBusy || s.active} />
            </label>
            <label className="field" htmlFor="author-purpose">{translate("Purpose", "Tujuan")}
              <select id="author-purpose" value={purpose} onChange={e => setPurpose(e.target.value as typeof purpose)} disabled={draftBusy || s.active}>
                <option value="overview">{translate("Overview", "Ikhtisar")}</option>
                <option value="training">{translate("Training", "Pelatihan")}</option>
                <option value="pitch">Pitch</option>
                <option value="report">{translate("Report", "Laporan")}</option>
              </select>
            </label>
            <label className="field" htmlFor="author-sections">{translate("Content sections (3–12)", "Bagian konten (3–12)")}
              <select id="author-sections" value={sections} onChange={e => setSections(Number(e.target.value))} disabled={draftBusy || s.active}>
                {Array.from({ length: 10 }, (_, i) => i + 3).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="button primary" onClick={() => void authorDraft()}
            disabled={draftBusy || s.busy || s.active || !s.caps.ai || topic.trim().length < 12 || audience.trim().length < 2}>
            {draftBusy ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />}
            {translate("Draft with AI", "Buat draf dengan AI")}
          </button>
          {generated && <section className="prompt-draft-review" aria-label={translate("AI draft review", "Pemeriksaan draf AI")}>
            <h3>{translate("Review AI-generated content", "Periksa konten hasil AI")}</h3>
            <p>{translate("AI can make mistakes. Verify all facts, names and figures. Nothing has been saved or replaced yet.",
              "AI dapat membuat kesalahan. Periksa seluruh fakta, nama, dan angka. Belum ada yang disimpan atau diganti.")}</p>
            <textarea aria-label={translate("Editable AI draft", "Draf AI yang dapat diedit")} value={generated.source} rows={12}
              onChange={e => setGenerated(v => v ? { ...v, source: e.target.value } : v)} />
            <div className="prompt-draft-actions">
              <button type="button" className="button quiet" onClick={() => setGenerated(null)}>{translate("Discard", "Buang draf")}</button>
              <button type="button" className="button primary" onClick={acceptDraft} disabled={!generated.source.trim() || s.busy || s.active}>
                {translate("Use this reviewed draft", "Gunakan draf yang telah diperiksa")}
              </button>
            </div>
          </section>}
        </div>
      </details>
      <div className="source-card">
        <label className="field" htmlFor="project-name">
          {t.rename}
          <input
            id="project-name"
            maxLength={120}
            value={s.draft.name}
            onChange={(e) => s.edit({ name: e.target.value })}
            disabled={s.active}
            placeholder={t.namePlaceholder}
          />
        </label>
        <input
          hidden
          ref={file}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          onChange={(e) => {
            importFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          className="upload-zone"
          disabled={s.busy || s.active}
          onClick={() => file.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!s.active && !s.busy) importFile(e.dataTransfer.files[0]);
          }}
        >
          <span>
            <Upload size={23} />
          </span>
          <strong>{t.upload}</strong>
          <small>{t.uploadHelp}</small>
        </button>
        <div className="source-paste-label">
          <span>{t.paste}</span>
          <button
            className="text-button"
            disabled={s.busy || s.active}
            onClick={s.sample}
          >
            {t.sample}
            <FileText size={14} />
          </button>
        </div>
        <textarea
          aria-label={t.original}
          spellCheck={false}
          disabled={s.active}
          value={s.draft.source}
          onChange={(e) => s.edit({ source: e.target.value })}
          placeholder={t.placeholder}
        />
        <div className="source-meta">
          <span>
            {s.analysis?.words || 0} {t.words} ·{" "}
            {s.analysis?.blocks.length || 0} {t.blocks}
          </span>
          <span>
            <ShieldCheck size={14} />
            {t.keep}
          </span>
        </div>
        <label className="field reading-mode">
          {t.importMode}
          <select
            aria-label={t.importMode}
            disabled={s.active}
            value={s.draft.mode}
            onChange={(e) => {
              const mode = e.target.value as "literal" | "markdown";
              s.edit({ mode });
              s.setSettings((v) => ({ ...v, mode }));
            }}
          >
            <option value="markdown">{t.markdown}</option>
            <option value="literal">{t.literal}</option>
          </select>
        </label>
        <p className="help-text">
          {s.draft.mode === "markdown" ? t.markdownHelp : t.literalHelp}
        </p>
      </div>
      <div className="step-footer">
        <span>
          <ShieldCheck size={17} />
          {t.keepHelp}
        </span>
        <button
          className="button primary"
          disabled={!s.draft.source.trim() || s.busy || s.active || !s.analysis}
          onClick={next}
        >
          {s.busy ? (
            <Loader2 size={17} className="spin" />
          ) : (
            <ArrowRight size={17} />
          )}{" "}
          {t.continue}
        </button>
      </div>
    </section>
  );
}
