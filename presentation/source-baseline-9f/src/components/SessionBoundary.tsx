import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { Brand, ErrorBanner } from "./Common";
import type { Language } from "../studio/types";
import { ChevronDown, LogOut } from "lucide-react";
import { UsageSummary } from "./UsageSummary";

interface Session {
  authentication: "none" | "oidc";
  user: { id: string; email: string; name?: string | null } | null;
}
const SessionContext = createContext<Session | null>(null);
function clearDesignDrafts(clearPosition = false) {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("verbatim-design:") || (clearPosition && key.startsWith("np-workspace-position:"))) sessionStorage.removeItem(key);
  } catch { /* Storage may be disabled by the browser. */ }
}
export function SessionBoundary({ children, lang }: { children: ReactNode; lang: Language }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let stopped = false;
    api<Session>("/session").then(s => { if (!stopped) setSession(s); })
      .catch(e => { if (!stopped) setError(e); });
    let checking = false;
    const expired = () => {
      if (checking) return;
      checking = true;
      // A 401 on an individual API request is not proof that the browser's
      // login is gone. Recheck the session before a destructive redirect.
      api<Session>("/session")
        .then(next => {
          if (stopped) return;
          if (next.authentication === "oidc" && !next.user) clearDesignDrafts();
          setSession(next);
        })
        .catch(e => { if (!stopped) setError(e); })
        .finally(() => { checking = false; });
    };
    window.addEventListener("verbatim-auth-expired", expired);
    return () => { stopped = true; window.removeEventListener("verbatim-auth-expired", expired); };
  }, []);
  useEffect(() => {
    if (session?.authentication === "oidc" && !session.user)
      window.location.replace("/api/auth/login?returnTo=" +
        encodeURIComponent(window.location.pathname + window.location.search));
  }, [session]);
  const id = lang === "id";
  if (error) return <main className="auth-preview-page"><Brand />
    <ErrorBanner error={error} lang={lang} dismiss={() => setError(null)} />
    <button className="button primary" onClick={() => window.location.reload()}>{id ? "Coba lagi" : "Retry"}</button>
  </main>;
  if (!session || (session.authentication === "oidc" && !session.user))
    return <main className="loading-screen"><Brand /><p role="status">{id ? "Memuat…" : "Loading…"}</p></main>;
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
/** Key transient navigation state by the verified OIDC subject, not email or display name. */
export function useWorkspaceIdentity() {
  const session = useContext(SessionContext);
  return session?.authentication === "oidc" ? session.user?.id || "unauthenticated" : "local";
}
export function AccountControls({ lang }: { lang: Language }) {
  const session = useContext(SessionContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  if (session?.authentication !== "oidc" || !session.user) return null;
  async function logout() {
    setBusy(true); setError(false);
    try {
      await api("/auth/logout", "POST", {});
      clearDesignDrafts(true);
      window.location.assign("/");
    } catch { setBusy(false); setError(true); }
  }
  const email = session.user.email !== "Signed-in user" ? session.user.email : "";
  const label = session.user.name || (email ? email.split("@")[0] : (lang === "id" ? "Akun" : "Account"));
  const parts = label.trim().split(/\s+/u);
  const initials = [parts[0], ...(parts.length > 1 ? [parts.at(-1)!] : [])]
    .map(part => Array.from(part)[0] || "").join("").toLocaleUpperCase();
  return <div className="account-controls">
    <details ref={menu} className="account-menu" onKeyDown={event => {
      if (event.key === "Escape") {
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
      <summary aria-label={lang === "id" ? "Menu akun" : "Account menu"}>
        <span className="account-avatar" aria-hidden="true">{initials}</span>
        <span className="account-email" title={label}><bdi>{label}</bdi></span>
        <ChevronDown size={13} aria-hidden="true" />
      </summary>
      <div className="account-menu-content">
        <p className="account-menu-label"><strong><bdi>{label}</bdi></strong></p>
        {email && <p className="account-menu-email"><bdi>{email}</bdi></p>}
        <UsageSummary lang={lang} />
      </div>
    </details>
    <button type="button" className="button account-signout" disabled={busy} onClick={logout}
      aria-label={lang === "id" ? "Keluar" : "Sign out"} title={lang === "id" ? "Keluar" : "Sign out"}>
      <LogOut size={14} aria-hidden="true" /><span>{lang === "id" ? "Keluar" : "Sign out"}</span>
    </button>
    {error && <span className="account-error" role="alert">{lang === "id" ? "Gagal keluar. Coba lagi." : "Sign out failed. Retry."}</span>}
  </div>;
}
