# Phase 9E Cinematic Composer — 1.0.0-dev.9e

Creative AI now composes selected project images with editable source text, optional exact slide counts and internal topic/quiz links. GPT-6 Luna remains the only model. Images come from uploads; no image-generation provider is called. See [Phase 9E](docs/PHASE9E_CINEMATIC_COMPOSER.md) for capabilities, acceptance and maintenance. Native PPTX motion is retained; web/PDF previews remain static. Earlier release notes below are historical and superseded.

# Phase 9D.1 Luna Only — 1.0.0-dev.9d.1

All new Creative requests use GPT-6 Luna only, even when an older saved job contains Premium settings. The model selector has been removed. Creative design improvements, source fidelity, native PowerPoint motion and Estimated USD are retained. See [current Phase 9D guide](docs/PHASE9D_CREATIVE_MOTION.md). Earlier release notes below are historical and superseded.

# Phase 9D Creative Motion — 1.0.0-dev.9d

Creative AI now offers explicit Astra Premium / Luna Efficient composition, stronger native geometry and hierarchy, source-safe panels, and native PowerPoint entrances/transitions/navigation. Per-model historical USD snapshots keep Premium usage distinct from Luna. See [Phase 9D](docs/PHASE9D_CREATIVE_MOTION.md) for installation, capabilities and acceptance. Web/PDF previews are static; play effects in desktop PowerPoint Slide Show. Real-account AI quality and PowerPoint playback must pass locally before VPS work.

The release notes below are historical; Phase 9D supersedes earlier statements about fixed Creative models and unavailable motion.

# Phase 9C estimated USD — 1.0.0-dev.9c.2

Estimated API cost now appears beside token counts, with rate snapshots, reported cache/tier adjustments and explicit unknown amounts. See [cost visibility](docs/PHASE9C_ESTIMATED_USD.md) and [dashboard design test](docs/PHASE9C_DESIGN_TEST.md). This patch does not add PowerPoint animations; motion testing remains pending that feature's implementation.

# Phase 9C login recovery — 1.0.0-dev.9c.1

Login starts on the configured hostname before its browser-bound cookie is created. Failed callbacks now return safe reason codes and a request ID. The real Keycloak incident remains pending user retry; see [login recovery](docs/PHASE9C_LOGIN_RECOVERY.md). Product modes and VPS/admin ordering remain as documented below.

# Phase 9C — 1.0.0-dev.9c

English-only customer UI, separate Template / Creative AI modes, revisioned Template text editing and visible provider-reported token usage. Active installation and acceptance guide: [Phase 9C](docs/PHASE9C_PRODUCT_MODES.md). Upgrade from unchanged `1.0.0-dev.9b.2`; existing login/configuration and customer artifacts are retained. Real Creative AI/PowerPoint acceptance precedes VPS deployment and the NotePreso admin integration.

Earlier release notes below are historical; the 9C guide supersedes older language and editing descriptions.

# Guide and profile hotfix — 1.0.0-dev.9b.2

How to Use is now a dedicated `/app/how-to` page. Navigation retains the active workspace draft and supports browser Back/Forward. Account names come from the verified OIDC profile and update at sign-in. After upgrading, sign out and sign in once to populate names for accounts created by earlier versions. See [hotfix guide](docs/PHASE9B_GUIDE_PROFILE.md).

# Navbar hotfix — 1.0.0-dev.9b.1

Workspace navigation follows the compact NotePreso layout: Projects, Workspace, How to Use, Support and Legal, with no AI Chat. A local creation guide keeps the draft open. Support and Legal open the existing NotePreso pages in a new tab. Version details appear beneath the brand, usage is inside the account menu, and account/sign-out controls remain aligned. See [hotfix guide](docs/PHASE9B_NAVBAR.md).

# Phase 9B — 1.0.0-dev.9b

Local beta: admission dan kuota transaksional, lease worker, outbox recovery, rate limit Redis bersama, pencarian proyek bertahap, serta tampilan pemakaian harian. [Panduan aktif dan batas pengujian](docs/PHASE9B_BETA_HARDENING.md).

Login biasa dan Google pada 9A.1 telah dikonfirmasi pengguna. Deployment publik/VPS belum dilakukan; mode production tetap diblokir. Detail MVP di bawah menjelaskan fitur dasarnya.

# Verbatim — Proyek 2 v1.0.0

> **Phase 1 patch (14 Oct 2026):** customer top navbar, improved dashboard composer, separate admin sidebar, fail-closed unauthenticated production mode. See [docs/PHASE1_FOUNDATION.md](docs/PHASE1_FOUNDATION.md). This is a local source patch awaiting full build/tests, not a production-ready v1.0.0.

Aplikasi lokal NotePreso Presentation untuk Pak Arie: TXT/Markdown menjadi PowerPoint native yang editable. Sumber dipertahankan, AI memilih komposisi, dan ekspor diperiksa terhadap teks sumber. Nama Verbatim masih nama kerja. Layanan NotePreso lain tetap terpisah.

## Instalasi lokal saat ini

Panduan aktif: [Phase 9C](docs/PHASE9C_PRODUCT_MODES.md). Gunakan installer 9C pada source `1.0.0-dev.9b.2`; konfigurasi OIDC yang sudah berhasil dipertahankan. Docker memublikasikan aplikasi hanya pada `127.0.0.1:4310`. Homepage Try langsung menuju login Keycloak untuk pengunjung yang belum login.

## Instalasi baru

Node.js 24 dan Python 3, atau Docker Desktop:

```powershell
python setup.py
docker compose up -d --build
```

Setup meminta API key secara tersembunyi dan tidak menimpa `.env` yang sudah ada. Mode Node langsung: `npm ci`, `npm run build`, `npm start`. Tanpa `DATABASE_URL`/`REDIS_URL`, aplikasi memakai SQLite serta antrean dalam proses. Docker memakai PostgreSQL dan Redis dengan worker terpisah.

## Yang tersedia

- Homepage preview, galeri enam tema, dan FAQ ID/EN.
- Dashboard proyek dengan pencarian/filter/sort di server, pagination, duplikasi, dan thumbnail hasil render.
- Upload TXT/Markdown, paste, contoh Pemda, serta mode pembacaan yang eksplisit.
- Enam palet, empat gaya komposisi, sepuluh layout, tujuan presentasi, serta preset brand yang dapat dipakai ulang di browser lokal.
- Empat gaya komposisi: Editorial, Minimal, Studio, dan Executive.
- Editor dengan filmstrip, canvas, zoom, serta tab Outline, Design, Assets, dan Source.
- Outline terkunci sumber untuk menggeser batas grup tanpa mengubah urutan, menghapus, atau menduplikasi teks.
- Penggantian layout grup sumber, AI restyle satu slide, split/merge grup, skala teks, jarak, warna aksen, keyboard undo/redo, version restore, dan pemulihan draf desain per sesi.
- Preview perubahan desain tanpa job baru atau pemanggilan OpenAI. Apply membuat versi ekspor baru dengan source snapshot yang sama.
- Unggah JPEG/PNG berbeda untuk tiap slide, hingga 2 MiB dan 16 megapiksel; referensi kota opsional.
- Source check, fingerprint, versi, status AI/fallback, model, dan token respons yang tercatat.
- Ekspor native PPTX, PDF dari hasil render aktual, laporan validasi JSON, dan mode presentasi dengan keyboard.
- Quality gate memblokir source mismatch, overflow, dan overlap konten sebelum ekspor dinyatakan terverifikasi.
- Autosave terserialisasi dan revision checking untuk mencegah tab lain menimpa sumber diam-diam.
- Admin lokal read-only: jumlah proyek, status job, trace engine/model, durasi, dan token. Tidak ada mutasi akun, kredensial, atau isi dokumen.

Penggantian layout berlaku untuk **grup sumber**, yang bisa menghasilkan beberapa slide ketika kontennya panjang. Split/merge memakai ID blok berurutan; tidak menghapus, menduplikasi, atau mengubah kata. Layout yang tidak cocok dinonaktifkan atau ditolak.

## Kontrak teks

Byte sumber disimpan utuh dengan SHA-256. Markdown yang dikenali menjadi format; karakter sintaks yang tidak dikenal tetap terlihat. Mode literal mempertahankan karakter Markdown sebagai teks. Source ledger memeriksa seluruh byte, sedangkan validator scene dan OOXML memeriksa visible-text contract per blok, termasuk urutan. Teks tidak disembunyikan dalam speaker notes untuk mengurangi kepadatan slide.

AI hanya mengembalikan ID blok, layout, dan pilihan aset yang diperbolehkan. Renderer mengambil copy langsung dari sumber. Plan yang menghilangkan, menambah, menduplikasi, atau mengurutkan ulang blok ditolak. Ekspor memeriksa lagi teks dalam PPTX sebelum download. Batas: 2 MiB, 20.000 kata, 80 slide; kegagalan tidak menghasilkan dokumen yang dipotong.

## AI

Mulai Phase 8B, semua panggilan AI menggunakan `gpt-6-luna` secara eksklusif. `.env` instalasi lama tidak diubah; nilai `OPENAI_MODEL` lama diabaikan. Pilihan model pada langkah Design bersifat read-only. Kunci tetap di backend dan tidak pernah dikirim ke frontend.

Toggle AI/configured hanya berarti ada key. Setelah generation, Source → AI trace menampilkan `used`, `fallback`, `disabled`, atau `manual`, beserta model/alasan. Request memakai Responses API, JSON Schema ketat, `store:false`, timeout, dan batas output. `store:false` bukan janji zero retention seluruh API.

Jika layanan AI menolak request, aplikasi mempertahankan source dan menggunakan planner aturan dengan kode alasan yang terlihat. Preview desain manual tidak memanggil OpenAI. Tombol AI restyle hanya meminta metadata komposisi untuk satu grup slide dan tidak boleh menghasilkan teks. Token pada admin hanya mencakup respons berhasil yang direkam sejak v0.2.0; bukan rekonsiliasi billing, dan respons provider yang ditolak atau job lama dapat tidak tercatat.

Pengujian pengembangan memakai mock AI. Uji AI live 8G dengan Luna telah dilaporkan PASS oleh pengguna; uji generation melalui akun nyata setelah upgrade 9B tetap diperlukan. Akses model mengikuti project/billing OpenAI pengguna.

## Dokumentasi dan pemeriksaan

- [Architecture](docs/ARCHITECTURE.md): batas modul, lifecycle, penyimpanan, dan arah scaling.
- [API](docs/API.md): kontrak request, status, dan error.
- [Security](docs/SECURITY.md): batas lokal, data, upload, dan kontrol sebelum akses publik.
- [Testing](docs/TESTING.md): pemeriksaan otomatis dan UAT Windows.
- [Validation report](docs/VALIDATION_v100.json): hasil build, test, audit, fidelity, dan render v1.0.0.
- [Local upgrade](docs/LOCAL_UPGRADE_v100.md): patch, rebuild, backup, rollback.
- [Changelog](CHANGELOG.md): perilaku akhir tiap rilis.

```powershell
npm run build
npm test
npm audit --omit=dev
npm run sample
```

Dependensi runtime dipin; `ioredis@5.8.2` adalah dependensi produksi, bukan devDependency. TypeScript memeriksa strict types dan unused imports. Kode dipisahkan dalam modul dan diformat; opsional: `npx prettier@3.6.2 --write "src/**/*.{ts,tsx,css}" "server/*.ts" "core/*.ts"`.

## Batas rilis lokal

Belum ada Keycloak, user management, pembayaran/kuota per akun, public sharing, real-time collaboration, editor drag-and-drop bebas, atau impor PDF/DOCX/PPTX. Tahap tersebut mengikuti domain dan migrasi VPS. Tidak ada janji jumlah pengguna serentak sebelum load test pada server tujuan.

Pengujian browser nyata/perangkat responsive dan PowerPoint Windows perlu dilakukan oleh pengguna. Environment pengembangan memiliki DOM simulator dan LibreOffice, tetapi tidak memiliki browser executable, Docker daemon, PostgreSQL, Redis server, atau API key live. Full Docker integration baru perlu diverifikasi pada instalasi pengguna. Font visual untuk CJK/RTL/simbol kompleks belum dinyatakan lengkap.

Foto referensi berasal dari PPTX V2 yang diberikan pengguna untuk prototipe internal. Untuk distribusi publik, gunakan aset dengan izin yang jelas. Liberation Sans dibundel dengan SIL OFL; PPTX menggunakan Arial, dengan font kompatibel pada renderer Linux.

Phase 8E notes: `docs/PHASE8E_SEMANTIC_DIAGRAMS.md`.

## Phase 8F — Adaptive Editorial Visuals

Source-safe native panels for short editorial lists and full-width bibliography rows. Details: [docs/PHASE8F_ADAPTIVE_VISUALS.md](docs/PHASE8F_ADAPTIVE_VISUALS.md). Luna remains the only AI model; data charts are not generated without structured numeric sources. This local preview is not public-production-ready.


Phase 8G: broader multi-genre source-fidelity quality gates and safe statement typography. Local-only; not public production ready. See docs/PHASE8G_UNIVERSAL_QUALITY.md.
