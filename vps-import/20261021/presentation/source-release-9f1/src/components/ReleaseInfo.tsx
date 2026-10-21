import { useEffect, useRef, useState } from "react";
import { History, Info, X } from "lucide-react";
import { RELEASE } from "../../core/release";
import type { Language } from "../studio/types";

/** Release details are bundled into the UI, not fetched from an external service. */
export function ReleaseInfo({ lang, location }: { lang: Language; location: "workspace" | "homepage" }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const tr = (english: string, indonesian: string) => lang === "en" ? english : indonesian;
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>("button, a[href]") || []);
      if (!focusable.length) return;
      if (e.shiftKey && document.activeElement === focusable[0]) {
        e.preventDefault();
        focusable.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === focusable.at(-1)) {
        e.preventDefault();
        focusable[0].focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      trigger.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button type="button" ref={trigger}
        className={location === "workspace" ? "release-trigger version-badge" : "release-trigger release-home"}
        aria-label={tr(`Application version ${RELEASE.version}. What's new`, `Versi aplikasi ${RELEASE.version}. Apa yang baru`)}
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}>
        <Info size={14} aria-hidden="true" />
        <span>v{RELEASE.version}</span>
        <span className="release-stage">{tr("Preview", "Pratinjau")}</span>
      </button>
      {open && (
        <div className="release-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="release-dialog" role="dialog" aria-modal="true"
            aria-label={tr("What's new in NotePreso PowerPoint Maker", "Pembaruan NotePreso PowerPoint Maker")}
            ref={panel}>
            <div className="release-dialog-head">
              <div>
                <p className="release-kicker"><History size={15} /> {tr("RELEASE NOTES", "CATATAN PEMBARUAN")}</p>
                <h2>{tr("What's New", "Apa yang Baru")}</h2>
                <p className="release-current">v{RELEASE.version} · {RELEASE.stage} · {RELEASE.date}</p>
              </div>
              <button className="icon-button" aria-label={tr("Close release notes", "Tutup catatan pembaruan")}
                onClick={() => setOpen(false)}><X size={20}/></button>
            </div>
            <div className="release-dialog-body">
              {RELEASE.history.map((entry) => (
                <article key={entry.version + entry.title.en} className="release-entry">
                  <div className="release-entry-heading">
                    <strong>{entry.phase}</strong>
                    <small>v{entry.version}</small>
                  </div>
                  <h3>{entry.title[lang]}</h3>
                  <ul>{entry.changes.map((item) => <li key={item.en}>{item[lang]}</li>)}</ul>
                </article>
              ))}
              <p className="release-disclaimer">
                {tr("Local development preview. Not a public or production release.", "Pratinjau pengembangan lokal. Belum merupakan rilis publik atau production.")}
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
