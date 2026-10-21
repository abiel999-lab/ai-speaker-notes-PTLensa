import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  ShieldCheck,
  Layers,
  FileText,
  LockKeyhole,
} from "lucide-react";
import { Brand, LanguageButton, ThemePreview } from "./Common";
import { ReleaseInfo } from "./ReleaseInfo";
import { THEMES } from "../../core/palette";
import type { ThemeId } from "../../core/types";
import type { Language } from "../studio/types";
/** Illustrative only: these numbers are not taken from customer projects. */
const DEMO_SLIDES = [
  {
    overline: "Q3 PERFORMANCE",
    title: { en: "Revenue grew", id: "Pendapatan naik" },
    highlight: "18.4%",
    suffix: "YoY",
    bars: [32, 46, 58, 73, 90],
    metrics: [{ value: "+18.4%", en: "Revenue", id: "Pendapatan" }, { value: "+7.2%", en: "Margin", id: "Margin" }],
    note: { en: "Present the key message. Source-based speaker notes are included in the editable export.", id: "Sampaikan pesan utama. Catatan presenter berbasis sumber tersedia dalam hasil ekspor yang bisa diedit." },
  },
  {
    overline: "OPERATIONS",
    title: { en: "Time saved", id: "Waktu hemat" },
    highlight: "32%",
    suffix: "monthly",
    bars: [23, 37, 52, 74, 88],
    metrics: [{ value: "32%", en: "Efficiency", id: "Efisiensi" }, { value: "14h", en: "Saved / week", id: "Hemat / pekan" }],
    note: { en: "Describe the workflow improvement. Speaker notes follow the original source rather than replacing slide text.", id: "Jelaskan perbaikan alur kerja. Catatan presenter mengikuti sumber asli tanpa menggantikan teks slide." },
  },
  {
    overline: "CAMPAIGN REVIEW",
    title: { en: "Audience reach", id: "Jangkauan audiens" },
    highlight: "+24%",
    suffix: "growth",
    bars: [28, 43, 62, 71, 96],
    metrics: [{ value: "+24%", en: "Reach", id: "Jangkauan" }, { value: "4.8%", en: "Engagement", id: "Interaksi" }],
    note: { en: "Highlight the outcome, then walk through the evidence. Charts and figures shown here are illustrative.", id: "Soroti hasilnya, lalu jelaskan bukti pendukung. Grafik dan angka di sini hanya ilustrasi." },
  },
] as const;

export function Homepage({
  lang,
  setLang,
}: {
  lang: Language;
  setLang: (l: Language) => void;
}) {
  const [theme, setTheme] = useState<ThemeId>("ivory");
  const [activeSlide, setActiveSlide] = useState(0);
  const [navFloating, setNavFloating] = useState(false);
  const [demoPaused, setDemoPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  // The marketing header remains accessible as a floating pill after scrolling.
  // This is local to the homepage: the /app workspace header is untouched.
  useEffect(() => {
    const syncFloating = () => setNavFloating((previous) => {
      const next = window.scrollY > 32;
      return previous === next ? previous : next;
    });
    syncFloating();
    window.addEventListener("scroll", syncFloating, { passive: true });
    return () => window.removeEventListener("scroll", syncFloating);
  }, []);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const syncMotion = () => setReducedMotion(media.matches);
    syncMotion();
    media.addEventListener?.("change", syncMotion);
    return () => media.removeEventListener?.("change", syncMotion);
  }, []);
  useEffect(() => {
    if (reducedMotion || demoPaused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActiveSlide((index) => (index + 1) % DEMO_SLIDES.length);
    }, 5300);
    return () => window.clearInterval(timer);
  }, [reducedMotion, demoPaused]);
  const preview = DEMO_SLIDES[activeSlide];
  const tr = (en: string, id: string) => (lang === "en" ? en : id);
  const p = THEMES[theme];
  return (
    <div className="home np7d-home" id="product">
      <header className={`home-nav np7d-nav np7e-site-header np7f-floating-header${navFloating ? " is-floating" : ""}`}>
        <div className="np7e-nav-inner">
          <Brand />
        <nav aria-label={tr("Homepage", "Beranda")}>
          <a href="#product">{tr("Product", "Produk")}</a>
          <a href="#workflow">{tr("How it works", "Cara kerja")}</a>
          <a href="#designs">{tr("Templates", "Template")}</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="np7d-nav-actions">
          <LanguageButton lang={lang} setLang={setLang} />
          <a className="button primary np7d-nav-cta" href="/app">
            {tr("Try PowerPoint Maker", "Coba PowerPoint Maker")}
            <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
        </div>
      </header>
      <main>
        <section className="hero np7d-hero" aria-labelledby="np-hero-title">
          <div className="np7d-hero-intro">
            <p className="np7d-eyebrow"><span className="np7d-live-dot" /> {tr("Your content in. Editable PowerPoint out.", "Teks Anda masuk. PowerPoint editable keluar.")}</p>
            <h1 id="np-hero-title">
              {tr("Turn your ideas into", "Ubah ide Anda menjadi")}<br />
              <em>{tr("presentation-ready", "slide PowerPoint")}</em><br />
              {tr("slides.", "profesional.")}
            </h1>
            <p className="np7d-lede">{tr(
              "Start with a text document or a topic. Shape the design, review the source, and export slides you can edit in PowerPoint.",
              "Mulai dari dokumen teks atau topik. Atur desain, periksa teks sumber, dan ekspor slide yang bisa diedit di PowerPoint.",
            )}</p>
            <div className="np7d-trust-line">
              <span><Check size={14} /> TXT / Markdown</span>
              <span><Check size={14} /> {tr("Editable PPTX", "PPTX editable")}</span>
              <span><ShieldCheck size={14} /> {tr("Source verification", "Verifikasi sumber")}</span>
            </div>
          </div>
          <div className="np7d-stage">
            <div className="np7d-start-card">
              <p className="np7d-section-kicker">{tr("TRY IT WITH YOUR CONTENT", "COBA DENGAN KONTEN ANDA")}</p>
              <h2>{tr("Start with your words.", "Mulai dari teks Anda.")}</h2>
              <p className="np7d-start-caption">{tr(
                "Choose how you'd like to begin. Your document stays yours.",
                "Pilih cara memulai. Dokumen dan teks sumber tetap milik Anda.",
              )}</p>
              <a className="np7d-source-action" href="/app?new=1">
                <span className="np7d-source-icon"><FileText size={22} /></span>
                <span className="np7d-source-text">
                  <strong>{tr("Upload TXT or Markdown", "Unggah TXT atau Markdown")}</strong>
                  <small>{tr("Open the workspace to upload or paste your text", "Buka workspace untuk unggah atau tempel teks")}</small>
                </span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>
              <div className="np7d-divider"><span>{tr("or begin with AI", "atau mulai dengan AI")}</span></div>
              <a className="np7d-topic-link" href="/app?new=1&author=1">
                <span className="np7d-topic-icon"><Layers size={19} /></span>
                <span><strong>{tr("Generate from a topic", "Buat dari topik")}</strong><small>{tr("Review the AI draft before creating slides", "Periksa draf AI sebelum membuat slide")}</small></span>
                <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a className="button primary np7d-main-cta" href="/app?new=1">
                {tr("Create PowerPoint", "Buat PowerPoint")} <ArrowRight size={17} aria-hidden="true" />
              </a>
              <p className="np7d-footnote"><LockKeyhole size={12} /> {tr("Local development preview · No public account access", "Pratinjau lokal · Belum ada akses akun publik")}</p>
            </div>
            <div className="np7d-product-demo np7e-animated-demo"
              aria-label={tr("Animated illustrative PowerPoint editor preview", "Animasi ilustrasi editor PowerPoint")}
              onMouseEnter={() => setDemoPaused(true)}
              onMouseLeave={() => setDemoPaused(false)}
              onFocusCapture={() => setDemoPaused(true)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDemoPaused(false);
              }}>
              <div className="np7d-demo-top">
                <span className="np7d-window-dots" aria-hidden="true"><i /><i /><i /></span>
                <span>Quarterly-Review.pptx</span>
                <span className="np7d-demo-tag"><span /> {tr("Illustrative preview", "Ilustrasi")}</span>
              </div>
              <div className="np7d-demo-body">
                <div className="np7d-filmstrip np7e-slide-picker" aria-label={tr("Sample slides", "Contoh slide")}>
                  {DEMO_SLIDES.map((slide, index) => (
                    <button type="button" key={slide.overline}
                      aria-label={tr(`Preview slide ${index + 1}`, `Lihat slide ${index + 1}`)}
                      aria-pressed={activeSlide === index}
                      className={activeSlide === index ? "active" : ""}
                      onClick={() => setActiveSlide(index)}>
                      {String(index + 1).padStart(2, "0")}<span />
                    </button>
                  ))}
                </div>
                <div className="np7d-demo-slide-wrap" aria-live="off">
                  <div key={activeSlide} className="np7d-demo-slide np7e-animated-slide" style={{background: p.bg, color:p.fg}}>
                    <div className="np7d-slide-overline" style={{color:p.accent}}>{preview.overline}</div>
                    <div className="np7d-slide-title">{preview.title[lang]}<br/><strong style={{color:p.accent}}>{preview.highlight}</strong> {preview.suffix}</div>
                    <div className="np7d-chart" role="img" aria-label={tr("Illustrative growth bar chart", "Ilustrasi grafik batang pertumbuhan")}>
                      {preview.bars.map((height,i)=><div key={i} className="np7d-chart-bar np7e-growing-bar"
                        style={{height:`${height}%`, background:p.accent, animationDelay:`${i * 105}ms`}} />)}
                    </div>
                    <div className="np7d-slide-metrics">
                      {preview.metrics.map((metric)=><span key={metric.en}><strong>{metric.value}</strong>{metric[lang]}</span>)}
                    </div>
                  </div>
                </div>
                <div className="np7d-demo-inspector">
                  <span className="np7d-panel-eyebrow">{tr("SLIDE EDITOR", "EDITOR SLIDE")}</span>
                  <h3>{tr("Shape your story", "Atur presentasi")}</h3>
                  <div className="np7d-demo-tags"><span>{tr("Themes", "Tema")}</span><span>{tr("Layout", "Layout")}</span><span>{tr("Notes", "Catatan")}</span></div>
                  <div className="np7d-demo-note">
                    <span>{tr(`Slide ${activeSlide + 1} · Presenter notes`, `Slide ${activeSlide + 1} · Catatan presenter`)}</span>
                    <p key={activeSlide} className="np7e-note-fade">{preview.note[lang]}</p>
                  </div>
                  <div className="np7d-demo-foot"><ShieldCheck size={14} /> {tr("Text coverage checked", "Cakupan teks diperiksa")}</div>
                </div>
              </div>
              <div className="np7d-demo-status">
                <span>{tr(`Sample ${activeSlide + 1} / ${DEMO_SLIDES.length}`, `Contoh ${activeSlide + 1} / ${DEMO_SLIDES.length}`)}</span>
                <div aria-label={tr("Theme previews", "Pratinjau tema")}>
                  {(["midnight", "ivory", "sage", "cobalt"] as ThemeId[]).map(t => (
                    <button type="button" key={t} aria-label={`Preview ${t}`} aria-pressed={theme === t}
                      title={`${THEMES[t].label} theme`} onClick={() => setTheme(t)}
                      style={{background:THEMES[t].bg, borderColor:theme === t ? THEMES[t].accent : "#718a79"}} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="workflow" className="home-section workflow-section">
          <div className="section-title">
            <p className="eyebrow">FROM SOURCE TO SLIDE</p>
            <h2>
              {tr(
                "A simple flow.\nA careful result.",
                "Alur sederhana.\nHasil yang diperiksa.",
              )}
            </h2>
          </div>
          <div className="workflow-grid">
            {[
              [
                FileText,
                "01",
                tr("Bring your source", "Masukkan sumber"),
                tr(
                  "Paste your text or upload a TXT or Markdown file. Review the reading mode before generating.",
                  "Tempel teks atau unggah TXT/Markdown. Periksa mode pembacaan sebelum generation.",
                ),
              ],
              [
                Layers,
                "02",
                tr("Set a visual direction", "Tentukan arah visual"),
                tr(
                  "Choose a theme, a template, and the spacing. AI can suggest how your source blocks fit together.",
                  "Pilih tema, template, dan jarak. AI dapat membantu mengatur komposisi blok sumber.",
                ),
              ],
              [
                ShieldCheck,
                "03",
                tr("Review and export", "Periksa dan ekspor"),
                tr(
                  "Refine the layout, check source coverage, then export native PowerPoint elements.",
                  "Sesuaikan layout, periksa cakupan sumber, lalu ekspor elemen PowerPoint native.",
                ),
              ],
            ].map(([Icon, n, title, description]) => {
              const I = Icon as typeof FileText;
              return (
                <article key={String(n)}>
                  <div>
                    <I size={24} />
                    <span>{String(n)}</span>
                  </div>
                  <h3>{String(title)}</h3>
                  <p>{String(description)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section id="designs" className="home-section design-gallery">
          <div className="section-title horizontal">
            <div>
              <p className="eyebrow">CONSIDERED BY DESIGN</p>
              <h2>
                {tr(
                  "A direction for every deck.",
                  "Arah visual untuk setiap presentasi.",
                )}
              </h2>
            </div>
            <a href="/app?new=1" className="text-button">
              {tr("Start designing", "Mulai mendesain")}
              <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="gallery-grid">
            {(
              [
                "midnight",
                "ivory",
                "sage",
                "cobalt",
                "solar",
                "graphite",
              ] as ThemeId[]
            ).map((t, i) => (
              <a key={t} href="/app?new=1">
                <ThemePreview
                  theme={t}
                  template={i % 2 ? "minimal" : "studio"}
                />
                <div>
                  <strong>{THEMES[t].label}</strong>
                  <span>{i % 2 ? "Minimal" : "Studio"}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
        <section id="principles" className="home-section principle-section">
          <ShieldCheck size={35} />
          <div>
            <p className="eyebrow">THE SOURCE PRESERVATION PRINCIPLE</p>
            <h2>
              {tr(
                "Every word belongs to you.",
                "Setiap kata tetap milik Anda.",
              )}
            </h2>
            <p>
              {tr(
                "The presentation uses your original text. AI selects compositions; it does not rewrite paragraphs, invent titles, or hide excess content in speaker notes. Long content continues on another slide.",
                "Presentasi memakai teks asli. AI memilih komposisi tanpa parafrase, judul tambahan, atau menyembunyikan konten di notes. Teks panjang dilanjutkan ke slide berikutnya.",
              )}
            </p>
          </div>
          <a className="button primary" href="/app">
            {tr("Open the studio", "Buka studio")}
            <ArrowRight size={17} />
          </a>
        </section>
        <section id="faq" className="home-section faq">
          <p className="eyebrow">A FEW DETAILS</p>
          <h2>{tr("Before you begin.", "Sebelum mulai.")}</h2>
          {[
            [
              tr("Will the text be rewritten?", "Apakah teks ditulis ulang?"),
              tr(
                "No. The renderer reads the source directly. Markdown markers can become formatting; literal mode keeps those characters visible.",
                "Tidak. Renderer membaca sumber langsung. Marker Markdown bisa menjadi format; mode literal mempertahankan karakter tersebut.",
              ),
            ],
            [
              tr(
                "Is the PowerPoint editable?",
                "Apakah PowerPoint bisa diedit?",
              ),
              tr(
                "Text, shapes, and supported tables are native PowerPoint elements. Images remain image objects.",
                "Teks, shape, dan tabel yang didukung berupa elemen native PowerPoint. Gambar tetap menjadi objek gambar.",
              ),
            ],
            [
              tr(
                "Does this local preview require login?",
                "Apakah preview lokal memerlukan login?",
              ),
              tr(
                "No. This is a shared local workspace. Keycloak and individual accounts are planned before public deployment.",
                "Tidak. Ini workspace lokal bersama. Keycloak dan akun individual disiapkan sebelum deployment publik.",
              ),
            ],
            [
              tr("When is my text sent to AI?", "Kapan teks dikirim ke AI?"),
              tr(
                "Only when AI layout selection is enabled. Layout preview and manual design changes do not call OpenAI.",
                "Hanya ketika pemilihan layout AI diaktifkan. Preview layout dan perubahan desain manual tidak memanggil OpenAI.",
              ),
            ],
          ].map(([title, body]) => (
            <details key={title}>
              <summary>{title}</summary>
              <p>{body}</p>
            </details>
          ))}
        </section>
      </main>
      <footer className="home-footer">
        <Brand />
        <ReleaseInfo lang={lang} location="homepage" />
        <a href="/app">
          {tr("Go to workspace", "Buka workspace")}
          <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}
