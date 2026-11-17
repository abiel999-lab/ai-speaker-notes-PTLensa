# Nora — perluasan seluruh halaman pengguna

Status: kandidat staging; BELUM cutover produksi.

Launcher memakai position:fixed, kanan bawah, warna #2B44C7 sesuai channel Nora, panel membuka ke kiri, offset 72px agar berada di atas Cookie settings. Saat banner cookie aktif, launcher disembunyikan sementara. Mobile chat resmi fullscreen; notice responsif sudah dikoreksi agar tidak terpotong scrollbar.

Cakupan kandidat: template/halaman HTML website utama (workspace, chat, support, checkout milik NotePreso, legal, guide, pricing dan halaman error), Presentation index/workspace serta Translator workspace/guide. Admin dan login/callback tidak diinjeksikan. API dan file non-HTML tidak diberi CSP tambahan. Checkout eksternal Paddle tidak dimodifikasi. Halaman terlindungi tetap mengarahkan pengunjung ke login jika belum autentikasi. www diizinkan adapter, tetapi canonical dan izin proxy tetap perlu diuji HTTPS pada cutover.

Arsitektur: satu adapter yang disalin identik sebagai asset first-party tiga aplikasi; policy CSP Python pure dan hook onSend Fastify terbatas HTML. Script/frame live.cekat.ai diizinkan tanpa menghapus izin Paddle. Tidak ada data akun, dokumen, kredensial atau pembayaran yang diteruskan melalui SDK. Consent diminta per pemuatan halaman; kesinambungan sesi chat mengikuti penyimpanan origin Cekat. Belum ada persetujuan lintas domain yang dibagikan otomatis.

Pengujian selesai:
- 96 kombinasi host/path/content-type serta idempotensi CSP dan preservasi origin Paddle: PASS.
- Syntax Python dan JS adapter/server: PASS.
- Contact sidecar: render, health, invalid input, foreign origin, konfigurasi pengiriman kosong, keberhasilan mailer tiruan, kegagalan mailer tiruan: PASS. Tidak mengirim email sungguhan.
- Translator: 8 regression tests PASS memakai config sintetis dan mocked billing. Dua assertion lama diperbarui karena aplikasi aktif sekarang redirect ke SSO/pricing, bukan halaman sign-in lama.
- Presentation: existing document contract test PASS; schema/JSON/empty-output diagnostic dan provider constraint diuji dengan fetch tiruan, 0 paid API calls.
- Presentation CSP hook: 12 kombinasi host/path PASS. Full-app injection memakai hostname publik diblokir oleh guard keamanan konfigurasi lokal; guard dipertahankan. Full-stack staging Presentation dengan OIDC tetap diperlukan sebelum production.
- Website backend staging merender halaman publik dengan include widget; halaman terproteksi tetap 303 sebelum autentikasi.
- Browser staging: fixed CSS, warna rgb(43,68,199), fallback absolut ke website utama. Mobile 390px panel left21/right363 dan tidak overflow.

Temuan tambahan:
- Contact service produksi merespons /_contact_health dengan status ok. Healthcheck existing salah menggunakan /health. Untuk rollout sidecar gunakan test CMD python urllib.request.urlopen('http://127.0.0.1:8000/_contact_health',timeout=3). Tidak mengubah produksi saat diagnosis.
- token-pricing.js terlewat dari snapshot repo lama akibat filter nama token. Modul kode non-rahasia dipulihkan dari container Presentation aktif ke kandidat dan diperlukan agar kontrak berjalan.

Belum terbukti / penghambat:
- Kuota Cekat Usage vs Billing; default English resmi; Retry pada awal sesi baru; retensi dan cancellation job followup masih belum dikonfirmasi provider. Draf pertanyaan sudah tersedia tetapi belum dikirim.
- Followup tetap OFF. WhatsApp/Instagram tidak diaktifkan. Broadcast bukan bagian adapter dan belum dibuat.
- Pengiriman email sampai inbox, transaksi Paddle sandbox, login Keycloak end-to-end, hardware keyboard mobile, serta jaringan vendor lambat/putus setelah iframe load belum diuji ulang lintas semua aplikasi.
- Staging menggunakan SQLite dan dependency image aktif; bukan replika PostgreSQL/Keycloak. Presentation terbaru hanya tersedia sebagai compiled runtime; source TypeScript terbaru belum ditemukan.
- Contact privacy/consent sebelum vendor berlaku; detail retensi provider tetap perlu dilengkapi sebelum publikasi final.
- Catatan backlog screenshot seperti memory notes, payment FB, menu fitur dan Markdown-ke-PPT belum memiliki spesifikasi; tidak diubah pada pekerjaan integrasi Nora ini.

Rencana rollout: setelah gate terselesaikan, minta persetujuan cutover. Backup image dan definisi runtime tiga app + sidecar secara privat, build candidate dari image aktif dengan overlay file allowlist, canary satu layanan dahulu, lalu roll out bertahap. Periksa HTTPS/CSP dan widget saat sudah login. Rollback masing-masing layanan ke image/config lama; tidak ada migrasi DB. Tetap simpan semua image lama. Jangan melakukan penggantian seluruh suite sekaligus tanpa smoke test per layanan.
