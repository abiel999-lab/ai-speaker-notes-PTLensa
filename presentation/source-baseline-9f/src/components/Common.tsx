import { AlertCircle, X, Layers, LockKeyhole } from "lucide-react";
import type { ThemeId, TemplateId } from "../../core/types";
import { THEMES } from "../../core/palette";
import { errorMessage } from "../api";
import type { Language } from "../studio/types";
/** Same Lensa mark used by NotePreso admin and Keycloak; this is a product sub-brand. */
export function Brand() {
  return (
    <a className="brand np-brand" href="/" aria-label="NotePreso PowerPoint Maker homepage">
      <img src="/lensa-logo.png" className="np-brand-logo" width="36" height="33" alt="" />
      <span className="np-brand-text">
        <strong>NotePreso</strong>
        <small>PowerPoint Maker</small>
      </span>
    </a>
  );
}
/** UI language is English; retained as a no-op for existing component props. */
export function LanguageButton(_props: { lang: Language; setLang: (l: Language) => void }) { return null; }
export function ErrorBanner({
  error,
  lang,
  dismiss,
}: {
  error: unknown;
  lang: Language;
  dismiss: () => void;
}) {
  if (!error) return null;
  const info = errorMessage(error, lang);
  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={19} />
      <div>
        <strong>{info.message}</strong>
        <small>
          {info.code}
          {info.requestId && " · " + info.requestId}
        </small>
      </div>
      <button
        className="icon-button"
        aria-label="Dismiss error"
        onClick={dismiss}
      >
        <X size={17} />
      </button>
    </div>
  );
}
export function ThemePreview({
  theme,
  template = "editorial",
}: {
  theme: ThemeId;
  template?: TemplateId;
}) {
  const p = THEMES[theme];
  return (
    <svg
      className="theme-preview"
      viewBox="0 0 240 135"
      role="img"
      aria-label={`${p.label} ${template} design preview`}
    >
      <rect width="240" height="135" fill={p.bg} />
      {template === "studio" ? (
        <>
          <rect width="240" height="4" fill={p.accent} />
          <rect x="198" width="42" height="135" fill={p.panel} />
          <circle cx="219" cy="28" r="10" fill={p.accent} />
        </>
      ) : template === "minimal" ? (
        <rect x="19" y="15" width="4" height="4" fill={p.accent} />
      ) : template === "executive" ? (
        <rect width="4" height="135" fill={p.accent} />
      ) : (
        <>
          <rect x="20" y="20" width="21" height="2" fill={p.accent} />
          <circle cx="221" cy="125" r="24" fill={p.accent} />
        </>
      )}
      <rect x="20" y="47" width="137" height="8" rx="1" fill={p.fg} />
      <rect x="20" y="63" width="110" height="8" rx="1" fill={p.fg} />
      {[87, 94, 101].map((y, i) => (
        <rect
          key={y}
          x="20"
          y={y}
          width={105 - i * 13}
          height="2"
          fill={p.fg}
          opacity=".4"
        />
      ))}
    </svg>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="toggle-control"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <i className={checked ? "switch on" : "switch"}>
        <b />
      </i>
    </button>
  );
}
export function IntegrityBadge({ label }: { label: string }) {
  return (
    <span className="integrity-badge">
      <LockKeyhole size={13} />
      {label}
    </span>
  );
}
export function LocalBadge() {
  return (
    <span className="local-badge">
      <Layers size={13} />
      Local workspace
    </span>
  );
}
