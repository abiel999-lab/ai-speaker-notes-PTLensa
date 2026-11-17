/** Product release metadata. Keep the version in sync with package.json and Compose. */
export const RELEASE = {
  version: "1.0.0-dev.9f.1",
  stage: "Local Creative Always-Generate Preview",
  phase: "Phase 9F.1",
  date: "2026-10-19",
  history: [
    {
      phase: "Phase 9F.1", version: "1.0.0-dev.9f.1",
      title: { en: "Project-based download filenames", id: "Nama file download sesuai nama proyek" },
      changes: [
        { en: "Name PPTX, PDF and validation-report downloads using the owning project's name.", id: "Penamaan PPTX, PDF, dan laporan validasi mengikuti nama proyek pemilik." },
        { en: "Sanitize unsafe characters and preserve international characters in standards-compliant download headers without renaming stored artifacts.", id: "Membersihkan karakter berbahaya dan menjaga aksara internasional pada header download tanpa mengubah artefak tersimpan." },
      ],
    },
    {
      phase: "Phase 9F", version: "1.0.0-dev.9f",
      title: { en: "Creative Always Generate with source-safe fallback", id: "Creative Always Generate with source-safe fallback" },
      changes: [
        { en: "After one Luna attempt, rebuild invalid Creative compositions locally instead of failing or paying for a layout retry.", id: "After one Luna attempt, rebuild invalid Creative compositions locally instead of failing or paying for a layout retry." },
        { en: "Preserve uploaded images, editable text, verified links, and native PowerPoint motion; disclose fallback and slide-count changes.", id: "Preserve uploaded images, editable text, verified links, and native PowerPoint motion; disclose fallback and slide-count changes." },
        { en: "Locally reflow overlapping or overflowing source text without changing its words or interactive links; re-run strict fidelity validation before export.", id: "Locally reflow overlapping or overflowing source text without changing its words or interactive links; re-run strict fidelity validation before export." },
        { en: "Preserve project and creation step across reload and reauthentication using an access-controlled project URL; keep source and credentials out of the URL.", id: "Preserve project and creation step across reload and reauthentication using an access-controlled project URL; keep source and credentials out of the URL." },
        { en: "Compose selected project images with editable source text, protected image scrims and native fade edges.", id: "Compose selected project images with editable source text, protected image scrims and native fade edges." },
        { en: "Request an exact slide count and link existing topic labels or quiz choices to verified internal slide targets.", id: "Request an exact slide count and link existing topic labels or quiz choices to verified internal slide targets." },
        { en: "Keep GPT-6 Luna only. Validate source wording, actual exported slide relationships and fully decoded preview images.", id: "Keep GPT-6 Luna only. Validate source wording, actual exported slide relationships and fully decoded preview images." },
      ],
    },
    {
      phase: "Phase 9D", version: "1.0.0-dev.9d.1",
      title: { en: "Luna-only Creative motion", id: "Luna-only Creative motion" },
      changes: [
        { en: "Fix all new Creative model requests to GPT-6 Luna, including older saved Premium settings.", id: "Fix all new Creative model requests to GPT-6 Luna, including older saved Premium settings." },
        { en: "Remove the Premium model selector while retaining native motion, complete source text and historical cost snapshots.", id: "Remove the Premium model selector while retaining native motion, complete source text and historical cost snapshots." },
      ],
    },
    {
      phase: "Phase 9D", version: "1.0.0-dev.9d",
      title: { en: "Premium Creative and native PowerPoint motion", id: "Premium Creative and native PowerPoint motion" },
      changes: [
        { en: "Choose Luna or Astra for custom composition, with model-specific historical USD snapshots.", id: "Choose Luna or Astra for custom composition, with model-specific historical USD snapshots." },
        { en: "Create stronger hierarchy, aligned text, native geometric storytelling and source-safe panels.", id: "Create stronger hierarchy, aligned text, native geometric storytelling and source-safe panels." },
        { en: "Export progressive text/table entrances, slide transitions and internal navigation without macros. Web and PDF previews remain static.", id: "Export progressive text/table entrances, slide transitions and internal navigation without macros. Web and PDF previews remain static." },
      ],
    },
    {
      phase: "Phase 9C", version: "1.0.0-dev.9c.2",
      title: { en: "Estimated USD next to AI tokens", id: "Estimated USD next to AI tokens" },
      changes: [
        { en: "Show estimated API cost for this version and today, including recorded repair/failure responses.", id: "Show estimated API cost for this version and today, including recorded repair/failure responses." },
        { en: "Snapshot published Luna rates and reported cache/tier details; missing usage remains unknown and historical estimates retain their recorded prices.", id: "Snapshot published Luna rates and reported cache/tier details; missing usage remains unknown and historical estimates retain their recorded prices." },
      ],
    },
    {
      phase: "Phase 9C", version: "1.0.0-dev.9c.1",
      title: { en: "Consistent login origin and safe failure reasons", id: "Consistent login origin and safe failure reasons" },
      changes: [
        { en: "Start login on the configured application hostname before setting its browser-bound cookie.", id: "Start login on the configured application hostname before setting its browser-bound cookie." },
        { en: "Return fixed failure reasons and a request ID without exposing tokens, callback parameters or provider bodies.", id: "Return fixed failure reasons and a request ID without exposing tokens, callback parameters or provider bodies." },
      ],
    },
    {
      phase: "Phase 9C", version: "1.0.0-dev.9c",
      title: { en: "Template editing, Creative AI and token visibility", id: "Template editing, Creative AI and token visibility" },
      changes: [
        { en: "The application UI is English-only and the OIDC login requests English.", id: "The application UI is English-only and the OIDC login requests English." },
        { en: "Template text edits create verified source/export revisions without an AI call; earlier exports remain downloadable.", id: "Template text edits create verified source/export revisions without an AI call; earlier exports remain downloadable." },
        { en: "Creative AI generates custom geometry and typography from a visual brief, with preview and download-only review.", id: "Creative AI generates custom geometry and typography from a visual brief, with preview and download-only review." },
        { en: "Provider-reported input/output tokens are visible per version and per day, including recorded repair/failure responses.", id: "Provider-reported input/output tokens are visible per version and per day, including recorded repair/failure responses." },
      ],
    },
    {
      phase: "Phase 9B", version: "1.0.0-dev.9b.2",
      title: { en: "Guide page and account names", id: "Halaman panduan dan nama akun" },
      changes: [
        { en: "How to Use has its own URL, with browser Back/Forward support and the current draft retained.", id: "Cara Penggunaan memiliki URL sendiri, mendukung Back/Forward browser, dan mempertahankan draf yang sedang dibuka." },
        { en: "Names from verified OIDC login profiles appear in the navbar and refresh on sign-in without changing account ownership.", id: "Nama dari profil login OIDC terverifikasi tampil di navbar dan diperbarui saat login tanpa mengubah pemilik akun." },
      ],
    },
    {
      phase: "Phase 9B", version: "1.0.0-dev.9b.1",
      title: { en: "Compact workspace navigation", id: "Navigasi workspace yang ringkas" },
      changes: [
        { en: "Home is replaced by How to Use, Support and Legal; the creation guide opens without leaving the draft.", id: "Home diganti Cara Penggunaan, Bantuan, dan Legal; panduan dibuka tanpa meninggalkan draf." },
        { en: "Version details move under the brand, with usage inside the account menu and aligned sign-out controls.", id: "Versi dipindahkan ke bawah merek, pemakaian masuk menu akun, dan kontrol keluar ditata sejajar." },
      ],
    },
    {
      phase: "Phase 9B", version: "1.0.0-dev.9b",
      title: { en: "Account limits and recoverable jobs", id: "Batas akun dan pemulihan job" },
      changes: [
        { en: "Admit jobs and reserve account quotas in one transaction, including concurrent requests.", id: "Penerimaan job dan reservasi kuota akun dilakukan dalam satu transaksi, termasuk permintaan bersamaan." },
        { en: "Worker leases and attempt-specific exports protect against duplicate delivery; committed jobs can be redelivered after queue outages.", id: "Lease worker dan ekspor per upaya melindungi dari pengiriman ganda; job tersimpan dapat dikirim ulang setelah gangguan antrean." },
        { en: "Shared Redis request limits, paginated project search, and visible daily usage support the local beta.", id: "Batas request Redis bersama, pencarian proyek bertahap, dan pemakaian harian tersedia untuk beta lokal." },
      ],
    },
    {
      phase: "Phase 9A", version: "1.0.0-dev.9a.1",
      title: { en: "Direct sign-in from the homepage", id: "Langsung login dari beranda" },
      changes: [
        { en: "Unauthenticated workspace visits go directly to Keycloak without another sign-in screen.", id: "Pengunjung workspace yang belum login langsung diarahkan ke Keycloak tanpa halaman masuk tambahan." },
        { en: "Keep the selected text or topic creation route after sign-in, using an allowlisted return path.", id: "Pilihan membuat dari teks atau topik tetap dibawa setelah login melalui tujuan kembali yang dibatasi." },
      ],
    },
    {
      phase: "Phase 9A", version: "1.0.0-dev.9a",
      title: { en: "Local account authentication and usage limits", id: "Autentikasi akun lokal dan batas pemakaian" },
      changes: [
        { en: "Optional OIDC sign-in uses PKCE, validated ID tokens and server-side sessions.", id: "Login OIDC opsional memakai PKCE, ID token terverifikasi dan sesi di server." },
        { en: "Accounts access only their own projects; existing local projects retain their original owner.", id: "Akun hanya mengakses proyek sendiri; proyek lokal lama mempertahankan pemiliknya." },
        { en: "Daily database-backed account limits cover generation and AI request attempts; public deployment remains disabled.", id: "Batas harian per akun tersimpan di database untuk upaya generation dan AI; deployment publik tetap dinonaktifkan." },
      ],
    },
    {
      phase: "Phase 8G",
      version: "1.0.0-dev.8g",
      title: { en: "Multi-genre quality gates and safe statement typography", id: "Uji kualitas lintas materi dan tipografi pernyataan yang aman" },
      changes: [
        { en: "Protect mixed bullet and paragraph slides against statement-style text enlargement.", id: "Melindungi slide campuran daftar dan paragraf dari pembesaran teks gaya statement." },
        { en: "Use abstract geometric accents without chart-shaped, ungrounded metric bars.", id: "Menggunakan aksen geometris abstrak tanpa bentuk batang metrik yang tidak didukung data." },
        { en: "Test business, education, finance, technical, multilingual and citation documents for exact source fidelity and editable PPTX.", id: "Menguji dokumen bisnis, edukasi, keuangan, teknis, multibahasa, dan referensi untuk preservasi teks serta PPTX editable." },
      ],
    },
    {
      phase: "Phase 8F",
      version: "1.0.0-dev.8f",
      title: { en: "Adaptive editorial panels and readable references", id: "Panel editorial adaptif dan referensi yang lebih mudah dibaca" },
      changes: [
        { en: "Compatible short source lists gain native editable two- or three-column panels, even on editorial slides.", id: "Daftar sumber pendek yang sesuai mendapatkan panel native editable dua atau tiga kolom, termasuk pada slide editorial." },
        { en: "Long citation URLs gain full-width, readable source-preserving bibliography rows.", id: "URL referensi panjang mendapat baris bibliografi selebar halaman yang tetap mempertahankan teks asli." },
        { en: "Dense content, image/table slides and manual offsets retain safe layouts; no invented data charts or words.", id: "Konten padat, slide gambar/tabel, dan posisi manual tetap memakai layout aman; tanpa grafik data atau kata-kata buatan." },
      ],
    },
    {
      phase: "Phase 8E",
      version: "1.0.0-dev.8e",
      title: { en: "Native semantic process diagrams and timelines", id: "Diagram proses dan linimasa native yang bermakna" },
      changes: [
        { en: "Short three-stage source sequences become native editable horizontal flow diagrams with connectors; no added claims or numbers.", id: "Urutan tiga tahap yang singkat menjadi diagram alur horizontal editable dengan penghubung; tanpa membuat klaim atau angka baru." },
        { en: "Compatible timeline lists become vertically connected milestones while preserving literal source text and order.", id: "Daftar linimasa yang sesuai menjadi tonggak vertikal terhubung dengan teks serta urutan asli tetap utuh." },
        { en: "Dense lists and manual block offsets keep the previous safe layout; Luna remains the only AI model.", id: "Daftar padat dan blok yang digeser manual tetap memakai layout aman sebelumnya; Luna tetap satu-satunya model AI." },
      ],
    },
    {
      phase: "Phase 8D",
      version: "1.0.0-dev.8d",
      title: { en: "Evidence-driven visual composition", id: "Komposisi visual berdasarkan hasil audit" },
      changes: [
        { en: "More distinctive native slide openings and high-contrast chapter dividers without invented source titles.", id: "Slide pembuka lebih kuat dan pemisah bab kontras tanpa membuat judul sumber baru." },
        { en: "Compatible source lists become editable two-column cards when geometry permits; otherwise the previous safe layout remains.", id: "Daftar sumber yang sesuai menjadi kartu dua kolom editable jika ruang cukup; jika tidak, layout aman sebelumnya dipertahankan." },
        { en: "Literal Markdown markers are preserved, presentation text stays exact, and Luna-only planning remains unchanged.", id: "Penanda Markdown tetap terjaga, teks presentasi tetap persis, dan perencanaan Luna-only tidak berubah." },
      ],
    },
    {
      phase: "Phase 8B",
      version: "1.0.0-dev.8b",
      title: { en: "Luna-only AI and source-locked slide planning", id: "AI Luna saja dan perencanaan slide terkunci" },
      changes: [
        { en: "GPT-6 Luna is the only AI model in server jobs, draft authoring, and slide design.", id: "GPT-6 Luna menjadi satu-satunya model AI untuk job, draf, dan desain slide." },
        { en: "Source blocks and groupings are locked in code; AI only selects compatible slide compositions.", id: "Blok teks dan kelompok slide dikunci oleh kode; AI hanya memilih komposisi slide yang kompatibel." },
        { en: "Strict live AI acceptance checks still reject provider fallback and verify PPTX source fidelity.", id: "Pengujian AI live tetap menolak fallback dan memverifikasi keutuhan teks PPTX." },
      ],
    },
    {
      phase: "Phase 8B",
      version: "1.0.0-dev.8b",
      title: { en: "Visual polish and Pak Arie live AI acceptance test", id: "Penyempurnaan visual dan pengujian AI live Pak Arie" },
      changes: [
        { en: "Editable geometric accents, progress rails, and visual hierarchy with no changes to source words.", id: "Aksen geometris, garis progres, dan hierarki visual editable tanpa mengubah teks sumber." },
        { en: "Strict live AI UAT rejects hidden fallback and validates the exported PowerPoint.", id: "Tes AI live yang ketat menolak fallback tersembunyi dan memvalidasi PowerPoint hasil ekspor." },
        { en: "Built-in Pemda source used for opt-in AI testing; no public login or infrastructure change.", id: "Contoh Pemda digunakan untuk tes AI atas persetujuan pengguna; tanpa mengubah login atau infrastruktur publik." },
      ],
    },
    {
      phase: "Phase 7F",
      version: "1.0.0-dev.7f",
      title: { en: "Floating homepage navigation on scroll", id: "Navbar homepage mengambang saat scroll" },
      changes: [
        { en: "Homepage navbar stays visible when scrolling and becomes a rounded floating bar.", id: "Navbar homepage tetap terlihat saat scroll dan berubah menjadi bar mengambang membulat." },
        { en: "Workspace navigation remains unchanged; shared menu alignment is preserved.", id: "Navbar workspace tidak diubah; alignment menu yang sudah rapi tetap dipertahankan." },
        { en: "Reduced-motion preference is respected, with no change to slide preview autoplay.", id: "Preferensi reduced motion dihormati, tanpa mengubah animasi preview slide." },
      ],
    },
    {
      phase: "Phase 7E",
      version: "1.0.0-dev.7e",
      title: { en: "Unified navigation and animated homepage preview", id: "Navigasi sejajar dan animasi preview homepage" },
      changes: [
        { en: "Homepage navigation follows document scrolling without a sticky frame or border.", id: "Navbar homepage ikut scroll halaman, tanpa bingkai sticky atau border mengganggu." },
        { en: "Homepage and workspace use consistent menu alignment and responsive breakpoints.", id: "Homepage dan workspace menggunakan alignment menu serta breakpoint responsif yang sama." },
        { en: "Illustrative slides rotate automatically; pause on interaction and respect reduced motion.", id: "Slide ilustrasi berganti otomatis, berhenti saat interaksi dan menghormati pengaturan reduced motion." },
      ],
    },
    {
      phase: "Phase 7D",
      version: "1.0.0-dev.7d",
      title: { en: "Simpler NotePreso-inspired homepage and navigation", id: "Homepage dan navigasi lebih sederhana ala NotePreso" },
      changes: [
        { en: "Homepage navigation stays in normal document flow and is not sticky.", id: "Navigasi homepage tidak sticky dan mengikuti alur halaman." },
        { en: "A centered headline, two clear starting routes, and an illustrative PowerPoint editor appear above the fold.", id: "Headline tengah, dua pilihan memulai, dan ilustrasi editor PowerPoint tampil di bagian awal homepage." },
        { en: "Workspace navigation is simplified; the version and What's New remain accessible.", id: "Navigasi workspace disederhanakan; versi dan panel Apa yang Baru tetap tersedia." },
      ],
    },
    {
      phase: "Phase 7C",
      version: "1.0.0-dev.7c",
      title: { en: "Visual canvas positioning", id: "Menggeser blok langsung di kanvas" },
      changes: [
        { en: "Select and drag text/table source blocks directly on the slide canvas.", id: "Pilih dan tarik blok teks/tabel langsung dari kanvas slide." },
        { en: "Keyboard arrows work for accessible positioning with 0.05/0.10/0.25-inch steps.", id: "Tombol panah mendukung pergeseran presisi 0,05/0,10/0,25 inci." },
        { en: "Existing source protection, undo/redo, PPTX persistence and quality validation still apply.", id: "Perlindungan sumber, undo/redo, penyimpanan ke PPTX, dan validasi kualitas tetap berlaku." },
      ],
    },
    {
      phase: "Phase 7B",
      version: "1.0.0-dev.7b",
      title: { en: "Visible application version and precise positioning", id: "Versi aplikasi dan pengaturan posisi presisi" },
      changes: [
        { en: "Application version is visible in the workspace and homepage.", id: "Versi aplikasi terlihat di workspace dan homepage." },
        { en: "What's New panel explains changes in each development phase.", id: "Panel Apa yang Baru menjelaskan pembaruan setiap fase." },
        { en: "Position editor supports 0.05, 0.10, and 0.25-inch steps.", id: "Editor posisi mendukung langkah 0,05, 0,10, dan 0,25 inci." },
      ],
    },
    {
      phase: "Phase 7A",
      version: "1.0.0",
      title: { en: "Source-anchored position editor", id: "Editor posisi dengan perlindungan teks sumber" },
      changes: [
        { en: "Select and nudge text or table blocks; undo, redo, and reset position.", id: "Pilih dan geser blok teks/tabel; undo, redo, dan reset posisi." },
        { en: "Position settings persist into PPTX and undergo layout validation.", id: "Pengaturan posisi tersimpan sampai PPTX dan melewati validasi tata letak." },
        { en: "Split and merge preserve source-block position settings.", id: "Split dan merge mempertahankan pengaturan posisi blok sumber." },
      ],
    },
    {
      phase: "Phase 6",
      version: "1.0.0",
      title: { en: "Presenter notes", id: "Catatan presenter" },
      changes: [
        { en: "Source-grounded speaker notes in editable PPTX.", id: "Speaker notes berbasis sumber pada PPTX yang dapat diedit." },
        { en: "Notes preview and presenter transcript TXT export.", id: "Pratinjau notes dan ekspor naskah presenter TXT." },
      ],
    },
    {
      phase: "Phases 4–5",
      version: "1.0.0",
      title: { en: "AI content drafts and reliability", id: "Draf konten AI dan peningkatan keandalan" },
      changes: [
        { en: "Generate-from-topic draft flow with review before use.", id: "Alur draf dari topik dengan peninjauan sebelum digunakan." },
        { en: "Provider error handling, token tracking, and export checks.", id: "Penanganan error AI, pencatatan token, dan pemeriksaan ekspor." },
      ],
    },
  ],
} as const;
