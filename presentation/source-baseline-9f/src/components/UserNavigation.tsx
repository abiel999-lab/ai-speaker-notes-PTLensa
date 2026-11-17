import { AccountControls } from "./SessionBoundary";
import { Plus } from "lucide-react";
import { Brand, LanguageButton } from "./Common";
import { ReleaseInfo } from "./ReleaseInfo";
import type { Language } from "../studio/types";
import { en, id } from "../i18n";

type View = "dashboard" | "studio" | "help";

/** Global customer navigation only. The editor's filmstrip/inspector are separate. */
export function UserNavigation({
  view,
  onView,
  onHelp,
  onCreate,
  creating,
  lang,
  setLang,
}: {
  view: View;
  onView: (view: "dashboard" | "studio") => void;
  onHelp: () => void;
  onCreate: () => void;
  creating: boolean;
  lang: Language;
  setLang: (lang: Language) => void;
}) {
  const t = lang === "en" ? en : id;
  const tr = (english: string, indonesian: string) =>
    lang === "en" ? english : indonesian;

  return (
    <header className="user-topnav">
      <div className="user-topnav-inner">
        <div className="workspace-brand">
          <Brand />
          <ReleaseInfo lang={lang} location="workspace" />
        </div>
        <nav
          className="user-topnav-links"
          aria-label={tr("Main navigation", "Navigasi utama")}
        >
          <button
            type="button"
            aria-current={view === "dashboard" ? "page" : undefined}
            className={view === "dashboard" ? "selected" : ""}
            onClick={() => onView("dashboard")}
          >
            {t.projects}
          </button>
          <button
            type="button"
            aria-current={view === "studio" ? "page" : undefined}
            className={view === "studio" ? "selected" : ""}
            onClick={() => onView("studio")}
          >
            {t.workspace}
          </button>
          <a href="/app/how-to" aria-current={view === "help" ? "page" : undefined}
            className={view === "help" ? "selected" : ""}
            onClick={event => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); onHelp();
            }}>{tr("How to Use", "Cara Penggunaan")}</a>
          <a href="https://notepreso.com/support" target="_blank" rel="noopener noreferrer">
            {tr("Support", "Bantuan")}
          </a>
          <a href="https://notepreso.com/legal" target="_blank" rel="noopener noreferrer">Legal</a>
        </nav>
        <div className="user-topnav-actions">
          <LanguageButton lang={lang} setLang={setLang} />
          <AccountControls lang={lang} />
          <button
            type="button"
            className="button primary user-create-button"
            aria-label={tr("Create", "Buat")}
            title={tr("Create", "Buat")}
            onClick={onCreate}
            disabled={creating}
          >
            <Plus size={15} />
            <span>{tr("Create", "Buat")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
