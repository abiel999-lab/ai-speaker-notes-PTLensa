import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { CreativeAssets } from "./CreativeAssets";
import { DesignControls } from "./DesignControls";
import { Toggle, IntegrityBadge } from "./Common";
import { en, id } from "../i18n";
import type { Studio } from "../studio/useStudio";
import type { Language } from "../studio/types";
export function DesignStep({
  studio: s,
  lang,
  back,
}: {
  studio: Studio;
  lang: Language;
  back: () => void;
}) {
  const t = lang === "en" ? en : id;
  return (
    <section className="design-step">
      <div className="step-intro">
        <p className="eyebrow">02 / VISUAL DIRECTION</p>
        <h1>{t.styleTitle}</h1>
        <p>{t.styleLead}</p>
      </div>
      <div className="creation-mode-picker" role="group" aria-label="Creation mode">
        <button type="button" aria-pressed={s.settings.creationMode !== "creative"} disabled={s.active || s.busy}
          onClick={() => s.setSettings(v => ({ ...v, creationMode: "template", motion: "none" }))}><strong>Template</strong><span>Choose a style. Edit design and text after generation.</span></button>
        <button type="button" aria-pressed={s.settings.creationMode === "creative"} disabled={s.active || s.busy || !s.caps.ai}
          onClick={() => s.setSettings(v => ({ ...v, creationMode: "creative", useAI: true, images: false, creativeQuality: "efficient", motion: v.creationMode === "creative" ? v.motion : "keynote" }))}><strong>Creative AI</strong><span>Describe a custom composition. Preview and download only.</span></button>
      </div>
      <div className="design-step-grid">
        <div className="design-main-card">
          {s.settings.creationMode === "creative" ? <div className="creative-brief-field">
            <h2>Describe your creative direction</h2>
            <p>Ask for custom composition, colors, typography, geometric visuals, strong hierarchy and slide rhythm. Your source wording stays intact; no template layout is selected.</p>
            <label className="field">Design brief<textarea aria-label="Creative design brief" rows={8} maxLength={3000}
              placeholder="For example: A bold editorial presentation with an off-center title, dark navy backgrounds, lime accents, oversized headings and geometric visual storytelling."
              value={s.settings.creativePrompt || ""} disabled={s.active || s.busy}
              onChange={e => s.setSettings(v => ({ ...v, creativePrompt: e.target.value }))} /></label>
            <p className="help-text">Creative composition uses GPT-6 Luna. Token usage and Estimated USD include reported repair attempts.</p>
            <label className="field">Target slide count<input type="number" min={1} max={40} placeholder="Auto" aria-label="Creative target slide count"
              value={s.settings.creativeSlideCount ?? ""} disabled={s.busy || s.active}
              onChange={e => s.setSettings(v => ({ ...v, creativeSlideCount: e.target.value === "" ? null : Number(e.target.value) }))} /></label>
            <p className="help-text">Leave empty for Auto, or request exactly 1–40 slides. Provide enough source blocks; all your words must fit.</p>
            <Toggle label="Interactive topic and quiz links" checked={s.settings.interactiveLinks === true} disabled={s.busy || s.active}
              onChange={interactiveLinks => s.setSettings(v => ({ ...v, interactiveLinks }))} />
            <p className="help-text">Luna can link existing menu labels, topic references and quiz choices to other slides. Include those words in your source. No extra questions or answers are invented.</p>
            <CreativeAssets studio={s} />
            <label className="field">PowerPoint motion<select aria-label="PowerPoint motion" value={s.settings.motion || "none"}
              disabled={s.active || s.busy} onChange={e => s.setSettings(v => ({ ...v, motion: e.target.value as "none" | "keynote" }))}>
              <option value="keynote">Keynote · entrances, transitions &amp; navigation</option><option value="none">Static</option>
            </select></label>
            <p className="help-text">Play motion in desktop PowerPoint Slide Show. Web previews and PDF are static. Text appears progressively; slides advance when you choose. No macros required.</p>
            <p className="help-text">Creative AI fixes common layout collisions locally when safe. If validation still fails, one paid AI repair may occur. Each AI response is included in token usage.</p>
          </div> : <DesignControls
            settings={s.settings}
            onChange={s.setSettings}
            lang={lang}
            disabled={s.active || s.busy}
          />}
        </div>
        <aside className="generation-options">
          <IntegrityBadge label={t.keep} />
          <h2>
            {lang === "en" ? "Generation settings" : "Pengaturan generation"}
          </h2>
          <Toggle
            label={s.settings.creationMode === "creative" ? "AI custom composition" : t.ai}
            checked={s.settings.useAI}
            disabled={s.settings.creationMode === "creative" || !s.caps.ai || s.active || s.busy}
            onChange={(v) => s.setSettings((x) => ({ ...x, useAI: v }))}
          />
          <p className="help-text">{s.settings.creationMode === "creative" ? "AI follows your design brief and preserves your source words." : s.caps.ai ? t.aiHelp : t.aiOff}</p>
          {s.settings.creationMode !== "creative" && <label className="field">
            {lang === "en" ? "Presentation purpose" : "Tujuan presentasi"}
            <select
              aria-label="Presentation purpose"
              value={s.settings.intent || "auto"}
              disabled={s.active || s.busy}
              onChange={(event) =>
                s.setSettings((current) => ({
                  ...current,
                  intent: event.target.value as NonNullable<
                    typeof current.intent
                  >,
                }))
              }
            >
              <option value="auto">Auto</option>
              <option value="executive">
                {lang === "en" ? "Executive briefing" : "Brief eksekutif"}
              </option>
              <option value="educational">
                {lang === "en" ? "Educational" : "Edukasi"}
              </option>
              <option value="proposal">
                {lang === "en" ? "Proposal" : "Proposal"}
              </option>
              <option value="report">
                {lang === "en" ? "Report" : "Laporan"}
              </option>
            </select>
          </label>}
          <div className="field" role="group" aria-label="AI model">
            <strong>AI model</strong>
            <span className="local-badge">GPT-6 Luna · fixed model</span>
          </div>
          <p className="help-text">
            {lang === "en"
              ? "Configured means a key is present. Successful model usage is shown after generation."
              : "Configured berarti key tersedia. Pemakaian model yang berhasil ditampilkan setelah generation."}
          </p>
          {s.settings.creationMode !== "creative" && <><Toggle
            label={t.photos}
            checked={s.settings.images}
            disabled={s.active || s.busy}
            onChange={(v) => s.setSettings((x) => ({ ...x, images: v }))}
          />
          <p className="help-text">{t.photosHelp}</p></>}
          <div className="generation-summary">
            <span>
              {s.analysis?.words || 0} {t.words}
            </span>
            <span>
              {s.analysis?.blocks.length || 0} {t.blocks}
            </span>
            <span>16:9 · PPTX</span>
          </div>
        </aside>
      </div>
      <div className="step-footer">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={15} />
          {t.back}
        </button>
        <button
          className="button primary"
          onClick={s.start}
          disabled={!s.draft.source.trim() || s.busy || s.active || (s.settings.creationMode === "creative" && (!s.settings.creativePrompt?.trim() || (s.settings.creativeAssets || []).some(a => !a.description.trim()) || (s.settings.creativeSlideCount != null && (!Number.isInteger(s.settings.creativeSlideCount) || s.settings.creativeSlideCount < 1 || s.settings.creativeSlideCount > 40))))}
        >
          {s.busy ? (
            <Loader2 size={17} className="spin" />
          ) : (
            <Sparkles size={17} />
          )}{" "}
          {t.generate}
        </button>
      </div>
    </section>
  );
}
