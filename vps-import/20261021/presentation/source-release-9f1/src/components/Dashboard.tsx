import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  ArrowUpRight,
  Copy,
  Trash2,
  FolderOpen,
  Clock,
  Layers,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  FileUp,
} from "lucide-react";
import { api } from "../api";
import { ThemePreview } from "./Common";
import type { Language, ProjectSummary } from "../studio/types";
import type { Studio } from "../studio/useStudio";
export function Dashboard({
  studio: s,
  lang,
  onNew,
  onOpen,
  onStart,
}: {
  studio: Studio;
  lang: Language;
  onNew: () => void;
  onOpen: (id: string) => void;
  onStart: (source: string) => Promise<void>;
}) {
  const [starter, setStarter] = useState("");
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("recent"),
    [filter, setFilter] = useState("all");
  const tr = (en: string, id: string) => (lang === "en" ? en : id);
  useEffect(() => {
    const timer = setTimeout(() => {
      void s.searchProjects({ search: query, sort, filter }).catch(s.setError);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, sort, filter, s.searchProjects]);
  const projects = [...s.projects]
    .filter(
      (p) =>
        p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
        (filter === "all" ||
          (filter === "ready"
            ? p.latest?.status === "ready"
            : p.latest?.status !== "ready")),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  async function duplicate(p: ProjectSummary) {
    s.setBusy(true);
    s.setError(null);
    try {
      const result = await api("/projects/" + p.id + "/duplicate", "POST");
      await s.refresh();
      onOpen(result.project.id);
    } catch (e) {
      s.setError(e);
    } finally {
      s.setBusy(false);
    }
  }
  async function remove(p: ProjectSummary) {
    if (
      !window.confirm(
        tr(
          "Delete this project and its generated files?",
          "Hapus proyek ini dan seluruh hasil generation?",
        ),
      )
    )
      return;
    try {
      await api("/projects/" + p.id, "DELETE");
      await s.refresh();
    } catch (e) {
      s.setError(e);
    }
  }
  return (
    <section className="dashboard">
      <div className="creation-hero">
        <div className="creation-hero-copy">
          <div className="creation-kicker"><Sparkles size={14} /> {tr("YOUR PRESENTATION WORKSPACE", "WORKSPACE PRESENTASI")}</div>
          <h1>{tr("Make every word look its best.", "Tampilkan setiap kata dengan lebih baik.")}</h1>
          <p>{tr(
            "Turn your own writing into a professionally designed, editable presentation. Your words stay exactly as written.",
            "Ubah teks Anda menjadi presentasi profesional yang bisa diedit. Setiap kata tetap sama persis.",
          )}</p>
        </div>
        <div className="creation-composer">
          <label htmlFor="dashboard-source">{tr("Start with your content", "Mulai dari teks Anda")}</label>
          <textarea
            id="dashboard-source"
            aria-label={tr("Presentation source draft", "Draf sumber presentasi")}
            value={starter}
            onChange={(e) => setStarter(e.target.value)}
            placeholder={tr("Paste your outline, meeting notes, or Markdown text…", "Tempel outline, catatan rapat, atau teks Markdown…")}
            spellCheck={false}
          />
          <div className="creation-composer-actions">
            <div className="creation-format"><ShieldCheck size={15} /> {tr("Preserve source · PPTX", "Teks utuh · PPTX")}</div>
            <button type="button" className="button primary" disabled={!starter.trim() || s.busy} onClick={() => void onStart(starter).catch(s.setError)}>
              {tr("Continue to design", "Lanjut ke desain")} <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="creation-shortcuts">
          <button type="button" onClick={onNew} disabled={s.busy}>
            <span className="shortcut-icon"><FileUp size={19} /></span>
            <span><strong>{tr("Upload a document", "Unggah dokumen")}</strong><small>TXT / Markdown</small></span>
            <ArrowRight size={16} />
          </button>
          <button type="button" onClick={onNew} disabled={s.busy}>
            <span className="shortcut-icon"><Plus size={19} /></span>
            <span><strong>{tr("Start from scratch", "Mulai dari awal")}</strong><small>{tr("Create using your words", "Buat dengan teks Anda")}</small></span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      <div className="library-heading">
        <div>
          <p className="eyebrow">{tr("YOUR LIBRARY", "PERPUSTAKAAN ANDA")}</p>
          <h2>{tr("Recent presentations", "Presentasi terbaru")}</h2>
        </div>
        <button className="button" onClick={onNew} disabled={s.busy}>
          <Plus size={17} /> {tr("New presentation", "Presentasi baru")}
        </button>
      </div>
      <div className="dashboard-stats">
        <div>
          <FolderOpen size={20} />
          <strong>{s.projects.length}</strong>
          <span>{tr("Presentations loaded", "Presentasi dimuat")}</span>
        </div>
        <div>
          <Layers size={20} />
          <strong>
            {s.projects.filter((p) => p.latest?.status === "ready").length}
          </strong>
          <span>{tr("Ready among loaded results", "Siap dari hasil dimuat")}</span>
        </div>
        <div>
          <ShieldCheck size={20} />
          <strong>Source verified</strong>
          <span>
            {tr("Original wording preserved", "Teks asli dipertahankan")}
          </span>
        </div>
      </div>
      <div className="library-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label={tr("Search projects", "Cari proyek")}
            value={query}
            maxLength={120}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Search presentations…", "Cari presentasi…")}
          />
        </label>
        <select
          aria-label="Project status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">
            {tr("All presentations", "Semua presentasi")}
          </option>
          <option value="ready">{tr("Ready", "Siap")}</option>
          <option value="drafts">
            {tr("Draft / processing", "Draf / diproses")}
          </option>
        </select>
        <select
          aria-label="Sort projects"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">
            {tr("Recently updated", "Terakhir diperbarui")}
          </option>
          <option value="name">{tr("Name A–Z", "Nama A–Z")}</option>
        </select>
      </div>
      <div className="project-grid">
        <button className="new-project-card" onClick={onNew}>
          <span>
            <Plus size={25} />
          </span>
          <strong>{tr("Create something new", "Buat presentasi baru")}</strong>
          <small>TXT / MARKDOWN → POWERPOINT</small>
        </button>
        {projects.map((p) => (
          <article className="project-card" key={p.id}>
            <button
              className="project-cover"
              onClick={() => onOpen(p.id)}
              aria-label={tr("Open ", "Buka ") + p.name}
            >
              {p.latest?.status === "ready" &&
              p.latest.preview === "rendered" ? (
                <img
                  src={`/api/generations/${p.latest.id}/preview/0`}
                  alt={p.name}
                  loading="lazy"
                />
              ) : (
                <ThemePreview
                  theme={p.latest?.theme || "ivory"}
                  template="minimal"
                />
              )}
              <span className={`project-status ${p.latest?.status || "draft"}`}>
                {p.latest?.status || tr("Draft", "Draf")}
              </span>
            </button>
            <div className="project-info">
              <h2 title={p.name}>{p.name}</h2>
              <p>
                <Clock size={12} />
                {new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(
                  new Date(p.updatedAt),
                )}
                <span>
                  {p.latest?.slides || 0} {tr("slides", "slide")}
                </span>
              </p>
              <div>
                <button className="text-button" onClick={() => onOpen(p.id)}>
                  {tr("Open presentation", "Buka presentasi")}
                  <ArrowUpRight size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={tr("Duplicate ", "Duplikasi ") + p.name}
                  disabled={s.busy}
                  onClick={() => duplicate(p)}
                >
                  <Copy size={15} />
                </button>
                <button
                  className="icon-button danger"
                  aria-label={tr("Delete ", "Hapus ") + p.name}
                  onClick={() => remove(p)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {s.nextOffset !== null && <button className="button quiet" disabled={s.listBusy}
        onClick={s.loadMore}>{s.listBusy ? tr("Loading…", "Memuat…") : tr("Load more presentations", "Muat presentasi berikutnya")}</button>}
      {query && !projects.length && (
        <div className="empty-message">
          {tr("No matching presentations.", "Tidak ada presentasi yang cocok.")}
        </div>
      )}
    </section>
  );
}
