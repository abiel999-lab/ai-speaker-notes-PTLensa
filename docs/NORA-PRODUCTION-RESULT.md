# Nora — hasil deployment produksi

17 November 2026. Status: LIVE setelah persetujuan eksplisit pemilik. Laporan ini menggantikan status belum-cutover pada laporan kandidat terdahulu.

## Hasil yang dapat dilihat
- https://notepreso.com/
- https://presentation.notepreso.com/app
- https://translation.notepreso.com/

Launcher sticky/fixed kanan bawah memakai warna NotePreso #2B44C7. Klik Chat with Nora, baca pemberitahuan privasi, beri persetujuan lalu Start chat. SDK Cekat baru dimuat setelah persetujuan. Widget mobile memenuhi viewport. Login/auth, admin dan endpoint API dikecualikan.

## Perubahan file
- Notes: app/app/core/support_widget.py, main.py, static/nora-support.js/css, template halaman pengguna, legal/privacy dan halaman error.
- Presentation: presentation/runtime-app/dist/index.html, dist/assets/nora-support.js/css dan server-dist/server/app.js untuk kebijakan CSP. Aset halaman 404 memakai /assets/. server/token-pricing.js dipulihkan dari runtime agar snapshot tidak kehilangan modul yang diperlukan; aturan harga tidak diubah.
- Translator: translation/nora_policy.py, production_app.py, production.html, guide.html, static/nora-support.js/css.
- Contact: website-support/app/contact_sidecar.py, core/support_widget.py dan templates/support.html.
- Dokumen dan bukti pengujian berada di docs/NORA-* serta nora-*.json. Konfigurasi rahasia dan inspect container lengkap tidak masuk Git.

## Deployment dan backup
Empat layanan diganti satu per satu dari snapshot writable-layer runtime live agar hotfix yang sudah berjalan ikut terjaga. Overlay hanya file terpilih. Env, mount rahasia, perintah startup, batas resource, network alias dan IP dipertahankan. Satu bind template contact lama dilepas agar tidak menutupi template baru; healthcheck contact diperbaiki ke /_contact_health.

Layanan aktif: actia-notepreso-app-live-rotated, notepreso-contact-ui-20261026t050754z, actia-presentation-app, actia-translation-app. Semuanya running/healthy. Tidak ada migrasi database; worker generation dan konfigurasi login/pembayaran tidak diganti. Pemeriksaan antrian tidak menemukan pekerjaan aktif sebelum swap. Ada restart singkat saat masing-masing layanan diganti.

Backup privat: /home/actiaAdmin26/nora-production-cutover-20261117 (direktori 0700, inspect 0600). Container sebelum deployment masih tersedia dengan akhiran -pre-nora-20261117. Jangan hapus backup atau publikasikan image snapshot internal yang mungkin berisi data runtime.

## Pengujian
- 10 pemeriksaan HTTPS: delapan halaman publik HTTP200 dengan widget dan CSP Cekat; login dan admin tanpa widget. Tiga aset adapter identik SHA256. Bukti: nora-production-verification.json.
- Browser produksi: workspace Notes, Presentation dan Translator terbuka; launcher/consent tampil; sesi SSO akun uji mempertahankan Pro dan 67 shared credits. Tidak menjalankan generation berbayar.
- FAQ produksi: Nora menjelaskan speaker notes ditambahkan pada salinan output dan berkas PowerPoint asli tidak berubah.
- Desktop dan viewport mobile 390x844: widget dapat digunakan, mobile tanpa overflow horizontal. Pengujian viewport bukan bukti keyboard fisik semua perangkat.
- Pengujian sebelumnya: 96 kasus scope/CSP, 8 regression Translator, kontrak Presentation dengan model tiruan, OIDC signed-token/PKCE/nonce/replay, validasi dan kegagalan contact, vendor HTTP503 serta script terlambat 18 detik ditangani fallback setelah timeout15 detik.
- Handoff online/offline, takeover manual, pertanyaan umum ketika admin offline dan resolve telah diuji pada channel yang sama sebelum deployment; tidak mengklaim seluruh skenario diulang sesudah cutover.
- Contact form aktual sampai INBOX billing@actiacarbon.com, referensi SUP-F71EBB1DAA.
- Checkout sandbox selesai dan subscription sandbox langsung dibatalkan. Tidak ada tagihan live, perubahan saldo atau konfigurasi pembayaran live. Rekonsiliasi webhook staging belum teruji ujung-ke-ujung.

## Batas dan risiko tersisa
- UI visitor baru Cekat dapat berbahasa Indonesia. EN dipilih lewat selector resmi; tidak memodifikasi iframe lintas origin. Default English permanen menunggu dukungan resmi provider.
- Usage 100 MAU/2.000 AI Credits bertentangan dengan Billing 3.000 MAU/15.000 responses. Gunakan batas terendah sebagai asumsi operasional hingga konfirmasi provider; tidak mengaktifkan top-up/biaya otomatis.
- Follow-up OFF karena cancellation sesudah human takeover/resolve belum terbukti aman. Human auto resolve OFF. WhatsApp/Instagram tidak diaktifkan.
- Bug Retry pada pesan pertama sesi baru, retensi data serta transport/WebSocket outage setelah iframe berhasil dimuat masih memerlukan tindak lanjut provider. Fallback script gagal/timeout sudah diuji dan bukan bukti transport penuh.
- Identitas/kontak untuk pertanyaan umum dan praktik retensi provider tetap perlu ditinjau bersama kebijakan channel; jangan menjanjikan anonimitas atau periode penghapusan yang belum dikonfirmasi. Pemberitahuan/persetujuan tersedia sebelum SDK dimuat.

## Rollback
Jalankan dari operator tepercaya hanya jika ada regresi. Script dan backup sudah tersedia di server:

    ssh actia-ai-stable
    sudo python3 /home/actiaAdmin26/nora-production-cutover.py rollback notes
    sudo python3 /home/actiaAdmin26/nora-production-cutover.py rollback contact
    sudo python3 /home/actiaAdmin26/nora-production-cutover.py rollback presentation
    sudo python3 /home/actiaAdmin26/nora-production-cutover.py rollback translation

Pilih hanya layanan yang bermasalah. Script mengembalikan container sebelum Nora beserta network/IP asli; tidak mengubah database. Setelah rollback periksa health, HTTPS, login dan halaman terkait. Jangan menjalankan ulang prepare/deploy pada state cutover yang sudah selesai. Perubahan Git saja tidak otomatis mengembalikan container.

Kesiapan: integrasi web sudah LIVE dan lulus smoke test; ini bukan klaim seluruh risiko/fitur Cekat selesai. Pantau kuota pada dashboard, error contact serta keluhan visitor; jangan aktifkan follow-up atau channel tambahan sebelum verifikasi.
