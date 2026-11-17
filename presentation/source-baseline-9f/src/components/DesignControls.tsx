import { useState } from "react";
import { Check, RotateCcw, Save, Trash2 } from "lucide-react";
import { THEMES } from "../../core/palette";
import type { Settings, ThemeId, TemplateId } from "../../core/types";
import type { Language } from "../studio/types";
import { ThemePreview } from "./Common";
type BrandPreset = {
  id: string;
  name: string;
  theme: ThemeId;
  template: TemplateId;
  accent: string | null;
};
const PRESET_KEY = "verbatim-brand-presets-v1";
function readPresets(): BrandPreset[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(PRESET_KEY) || "[]");
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item) =>
          typeof item?.id === "string" &&
          typeof item?.name === "string" &&
          item.name.length <= 40 &&
          item.theme in THEMES &&
          ["editorial", "minimal", "studio", "executive"].includes(
            item.template,
          ) &&
          (item.accent === null || /^#[0-9a-fA-F]{6}$/.test(item.accent)),
      )
      .slice(0, 12);
  } catch {
    return [];
  }
}
export function DesignControls({
  settings: s,
  onChange,
  lang,
  disabled = false,
  compact = false,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  lang: Language;
  disabled?: boolean;
  compact?: boolean;
}) {
  const tr = (en: string, id: string) => (lang === "en" ? en : id);
  const [presets, setPresets] = useState<BrandPreset[]>(readPresets);
  const [presetName, setPresetName] = useState("");
  function savePreset() {
    const name = presetName.trim().slice(0, 40);
    if (!name || presets.length >= 12) return;
    const next: BrandPreset[] = [
      ...presets,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        theme: s.theme,
        template: s.template || "editorial",
        accent: s.accent || null,
      },
    ];
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresets(next);
    setPresetName("");
  }
  function removePreset(id: string) {
    const next = presets.filter((preset) => preset.id !== id);
    window.localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresets(next);
  }
  return (
    <div className={compact ? "design-controls compact" : "design-controls"}>
      {!compact && (
        <fieldset disabled={disabled} className="brand-presets">
          <legend>{tr("Reusable brand style", "Gaya merek tersimpan")}</legend>
          <div className="preset-save-row">
            <input
              aria-label="Brand preset name"
              value={presetName}
              maxLength={40}
              onChange={(event) => setPresetName(event.target.value)}
              placeholder={tr("Preset name", "Nama preset")}
            />
            <button
              className="button quiet"
              disabled={!presetName.trim() || presets.length >= 12}
              onClick={savePreset}
            >
              <Save size={14} />
              {tr("Save style", "Simpan gaya")}
            </button>
          </div>
          {!!presets.length && (
            <div className="preset-list">
              {presets.map((preset) => (
                <span key={preset.id}>
                  <button
                    aria-label={`Apply brand preset ${preset.name}`}
                    onClick={() =>
                      onChange({
                        ...s,
                        theme: preset.theme,
                        template: preset.template,
                        accent: preset.accent,
                      })
                    }
                  >
                    <i
                      style={{
                        background:
                          preset.accent || THEMES[preset.theme].accent,
                      }}
                    />
                    {preset.name}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete brand preset ${preset.name}`}
                    onClick={() => removePreset(preset.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="help-text">
            {tr(
              "Saved in this browser. Presets contain design settings only, never source text.",
              "Tersimpan di browser ini. Preset hanya berisi pengaturan desain, bukan teks sumber.",
            )}
          </p>
        </fieldset>
      )}
      <fieldset disabled={disabled}>
        <legend>{tr("Color theme", "Tema warna")}</legend>
        <div className="palette-grid">
          {(Object.keys(THEMES) as ThemeId[]).map((theme) => (
            <button
              key={theme}
              aria-label={`Theme ${theme}`}
              aria-pressed={s.theme === theme}
              className={s.theme === theme ? "palette selected" : "palette"}
              onClick={() => onChange({ ...s, theme, accent: null })}
            >
              {!compact && <ThemePreview theme={theme} template={s.template} />}
              <span>
                <i
                  style={{
                    background: THEMES[theme].bg,
                    borderColor: THEMES[theme].accent,
                  }}
                />
                {THEMES[theme].label}
                {s.theme === theme && <Check size={13} />}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>{tr("Composition style", "Gaya komposisi")}</legend>
        <div className="template-grid">
          {(
            ["editorial", "minimal", "studio", "executive"] as TemplateId[]
          ).map((template) => (
            <button
              key={template}
              aria-label={`Template ${template}`}
              aria-pressed={(s.template || "editorial") === template}
              className={
                (s.template || "editorial") === template ? "selected" : ""
              }
              onClick={() => onChange({ ...s, template })}
            >
              <ThemePreview theme={s.theme} template={template} />
              <span>{template}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>{tr("Typography & spacing", "Tipografi & jarak")}</legend>
        <label className="field">
          {tr("Content spacing", "Jarak konten")}
          <select
            aria-label="Content spacing"
            value={s.density || "comfortable"}
            onChange={(e) =>
              onChange({ ...s, density: e.target.value as Settings["density"] })
            }
          >
            <option value="comfortable">{tr("Comfortable", "Longgar")}</option>
            <option value="compact">{tr("Compact", "Compact")}</option>
          </select>
        </label>
        <label className="field">
          {tr("Text scale", "Skala teks")}
          <span className="range-row">
            <input
              aria-label="Text scale"
              type="range"
              min="85"
              max="115"
              step="5"
              value={Math.round((s.fontScale || 1) * 100)}
              onChange={(e) =>
                onChange({ ...s, fontScale: Number(e.target.value) / 100 })
              }
            />
            <output>{Math.round((s.fontScale || 1) * 100)}%</output>
          </span>
        </label>
        <label className="field">
          {tr("Accent color", "Warna aksen")}
          <span className="color-row">
            <input
              aria-label="Accent color"
              type="color"
              value={s.accent || THEMES[s.theme].accent}
              onChange={(e) => onChange({ ...s, accent: e.target.value })}
            />
            <code>{s.accent || THEMES[s.theme].accent}</code>
            <button
              className="icon-button"
              aria-label="Reset accent"
              onClick={() => onChange({ ...s, accent: null })}
            >
              <RotateCcw size={14} />
            </button>
          </span>
        </label>
        <p className="help-text">
          {tr(
            "Long content flows to another slide. The source is never shortened.",
            "Konten panjang dilanjutkan ke slide berikutnya. Sumber tidak dipersingkat.",
          )}
        </p>
      </fieldset>
    </div>
  );
}
