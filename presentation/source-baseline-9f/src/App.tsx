import { CreativeReview } from "./components/CreativeReview";
import { TokenUsage } from "./components/TokenUsage";
import { SessionBoundary, useWorkspaceIdentity } from "./components/SessionBoundary";
import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Homepage } from "./components/Homepage";
import { WorkspaceHelp } from "./components/WorkspaceHelp";
import { UserNavigation } from "./components/UserNavigation";
import { Dashboard } from "./components/Dashboard";
import { Editor } from "./components/Editor";
import { SourceStep } from "./components/SourceStep";
import { DesignStep } from "./components/DesignStep";
import {
  Brand,
  ErrorBanner,
} from "./components/Common";
import { useStudio } from "./studio/useStudio";
import type { Language } from "./studio/types";
import { en, id } from "./i18n";
export default function App() {
  const lang: Language = "en";
  const setLang = () => {};
  useEffect(() => {
    document.documentElement.lang = "en";
    localStorage.removeItem("vb-language");
  }, []);
  const path = window.location.pathname;
  if (path === "/") return <Homepage lang={lang} setLang={setLang} />;
  if (path === "/app" || path.startsWith("/app/")) return <SessionBoundary lang={lang}><Workspace lang={lang} setLang={setLang} /></SessionBoundary>;
  return (
    <main className="not-found-page">
      <Brand />
      <h1>Page not found</h1>
      <p>This presentation workspace does not have a separate admin panel.</p>
      <a className="button primary" href="/app">Open workspace</a>
    </main>
  );
}
function Workspace({
  lang,
  setLang,
}: {
  lang: Language;
  setLang: (l: Language) => void;
}) {
  const s = useStudio();
  const identity = useWorkspaceIdentity();
  const positionKey = "np-workspace-position:" + identity;
  const savedPosition = useRef<{ projectId: string; step: "source" | "design" | "review" } | null>(null);
  const restoredOnce = useRef(false);
  if (!restoredOnce.current) {
    restoredOnce.current = true;
    try {
      const params = new URLSearchParams(window.location.search);
      const value = !params.has("new") && params.has("project")
        ? { projectId: params.get("project"), step: params.get("step") || "source" }
        : JSON.parse(window.sessionStorage.getItem(positionKey) || "null");
      if (!params.has("new") && value && typeof value.projectId === "string" && /^[0-9a-f-]{36}$/i.test(value.projectId) &&
          ["source", "design", "review"].includes(value.step)) savedPosition.current = value;
    } catch { /* Storage is optional. */ }
  }
  const [restoring, setRestoring] = useState(!!savedPosition.current);
  const t = lang === "en" ? en : id;
  const tr = (en: string, id: string) => (lang === "en" ? en : id);
  const [view, setView] = useState<"dashboard" | "studio">(() =>
    new URLSearchParams(window.location.search).has("new") || savedPosition.current
      ? "studio"
      : "dashboard",
  );
  const [helpPage, setHelpPage] = useState(() => window.location.pathname === "/app/how-to");
  useEffect(() => {
    const sync = () => setHelpPage(window.location.pathname === "/app/how-to");
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function navigateHelp(show: boolean) {
    if (show === helpPage) return;
    window.history.pushState(null, "", show ? "/app/how-to" : "/app");
    setHelpPage(show);
  }
  function switchView(next: "dashboard" | "studio") {
    setView(next); navigateHelp(false);
  }
  useEffect(() => {
    document.title = helpPage
      ? (lang === "id" ? "Cara Penggunaan" : "How to Use") + " | NotePreso PowerPoint Maker"
      : "NotePreso | PowerPoint Maker";
    if (helpPage) {
      document.getElementById("workspace-help-title")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [helpPage, lang, s.loading]);
  const [step, setStep] = useState<"source" | "design" | "review">(() => savedPosition.current?.step || "source");
  useEffect(() => {
    if (s.loading || !restoring) return;
    const previous = savedPosition.current;
    savedPosition.current = null;
    if (!previous) { setRestoring(false); return; }
    void s.open(previous.projectId).finally(() => setRestoring(false));
  }, [s.loading, restoring]);
  useEffect(() => {
    if (s.loading || restoring) return;
    try {
      const address = new URL(window.location.href);
      if (view === "studio" && s.draft.id) {
        window.sessionStorage.setItem(positionKey, JSON.stringify({ projectId: s.draft.id, step }));
        // Only the opaque project identifier and UI step are in the URL; never
        // store presentation text, image contents, credentials or tokens there.
        address.searchParams.delete("new");
        address.searchParams.set("project", s.draft.id);
        address.searchParams.set("step", step);
      } else if (view === "dashboard") {
        window.sessionStorage.removeItem(positionKey);
        address.searchParams.delete("project");
        address.searchParams.delete("step");
        address.searchParams.delete("new");
      }
      if (address.href !== window.location.href) {
        window.history.replaceState(window.history.state, "", address.pathname + address.search + address.hash);
      }
    } catch { /* Browser storage is optional. */ }
  }, [s.loading, restoring, s.draft.id, view, step, positionKey]);
  useEffect(() => {
    if (s.job?.status === "ready") setStep("review");
  }, [s.job?.id, s.job?.status]);
  async function newProject() {
    try {
      if (s.draft.source.trim()) await s.save();
      s.reset();
      try { window.sessionStorage.removeItem(positionKey); } catch { /* Optional. */ }
      // Do not let an old project ID in the browser URL re-open the previous
      // draft after a subsequent login/reload.
      const address = new URL(window.location.href);
      address.searchParams.delete("project"); address.searchParams.delete("step");
      window.history.replaceState(window.history.state, "", address.pathname + address.search + address.hash);
      setStep("source");
      switchView("studio");
    } catch (e) {
      s.setError(e);
    }
  }
  async function beginFromText(source: string) {
    if (!source.trim()) return;
    await newProject();
    s.edit({ source, mode: "markdown" });
    setStep("source");
  }
  async function open(id: string) {
    try {
      if (s.draft.source.trim()) await s.save();
      await s.open(id);
      switchView("studio");
      setStep("source");
    } catch (e) {
      s.setError(e);
    }
  }
  const editing = !helpPage && view === "studio" && step === "review" && s.job?.settings.creationMode !== "creative";
  if (s.loading)
    return (
      <div className="loading-screen">
        <Brand />
        <Loader2 className="spin" size={22} />
      </div>
    );
  return (
    <div className={`app-shell ${editing ? "editing" : ""} ${helpPage ? "how-to-layout" : ""} ${view === "dashboard" ? "np7d-dashboard-layout" : ""}`}>
      <UserNavigation
        view={helpPage ? "help" : view}
        onView={switchView}
        onHelp={() => navigateHelp(true)}
        onCreate={newProject}
        creating={s.busy}
        lang={lang}
        setLang={setLang}
      />
      <TokenUsage generationId={s.job?.id} active={s.active} />
      <main className="app-main">
        {helpPage && <WorkspaceHelp lang={lang} onBack={() => navigateHelp(false)} />}
        <div className="workspace-view" hidden={helpPage}>
        {view === "studio" && <header className="app-topbar">
          <div>
            <button
              className="icon-button"
              aria-label="Back to projects"
              onClick={() => setView("dashboard")}
            >
              <ArrowLeft size={18} />
            </button>
            <strong title={s.draft.name}>{s.draft.name || t.namePlaceholder}</strong>
            <span className={`save-status ${s.saveState}`}>
              {s.saveState === "failed" ? tr("Save failed", "Gagal menyimpan") : t[s.saveState]}
            </span>
            {s.saveState === "failed" && (
              <button className="text-button" onClick={() => s.save().catch(s.setError)}>
                {t.retry}
              </button>
            )}
          </div>
        </header>}
        <ErrorBanner
          error={s.error}
          lang={lang}
          dismiss={() => s.setError(null)}
        />
        {view === "dashboard" ? (
          <Dashboard studio={s} lang={lang} onNew={newProject} onOpen={open} onStart={beginFromText} />
        ) : (
          <>
            <nav className="steps-bar" aria-label="Creation steps">
              {(["source", "design", "review"] as const).map((v, i) => (
                <button
                  key={v}
                  aria-label={t[v]}
                  aria-current={step === v ? "step" : undefined}
                  className={step === v ? "active" : ""}
                  disabled={
                    (v === "review" && !s.job?.scene) ||
                    (v === "design" && !s.draft.source.trim())
                  }
                  onClick={() => setStep(v)}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {t[v]}
                </button>
              ))}
              <span className="steps-caption">
                <ShieldCheck size={14} />
                {tr("Your content, your control.", "Teks Anda tetap utuh.")}
              </span>
            </nav>
            <div
              className={`studio-content ${editing ? "editor-content" : ""}`}
            >
              {step === "source" ? (
                <SourceStep
                  studio={s}
                  lang={lang}
                  next={() => setStep("design")}
                />
              ) : step === "design" ? (
                <DesignStep
                  studio={s}
                  lang={lang}
                  back={() => setStep("source")}
                />
              ) : (
                s.job?.settings.creationMode === "creative" ? <CreativeReview studio={s} /> : <Editor studio={s} lang={lang} />
              )}
            </div>
          </>
        )}
        {(s.active ||
          s.job?.status === "failed" ||
          s.job?.status === "cancelled") &&
          view === "studio" && (
            <div className="job-status" role="status">
              <span className="job-status-icon">
                {s.active ? (
                  <Loader2 size={21} className="spin" />
                ) : (
                  <AlertCircle size={21} />
                )}
              </span>
              <div>
                <strong>
                  {s.active
                    ? t.progress
                    : s.job?.status === "failed"
                      ? t.failed
                      : t.cancelled}
                </strong>
                <p>{s.active ? s.job?.stage : s.job?.error || t.cancelled}</p>
                {s.active && <progress value={s.job!.progress} max="100" />}
              </div>
              <button
                className="button quiet"
                disabled={s.busy}
                onClick={s.active ? s.cancel : s.start}
              >
                {s.active ? t.cancel : t.retry}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
