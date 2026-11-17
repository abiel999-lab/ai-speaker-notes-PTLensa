# Nora — acceptance lanjutan

Hasil baru (17 November 2026):

1. Login lokal staging dengan akun sintetis PASS. /app dan /chat menjadi HTTP200 dengan include widget dan CSP. /login dan /auth/popup-complete tidak memuat widget. Secret akun staging dibaca hanya dalam container dan tidak dicetak.
2. Checkout: Origin asing ditolak HTTP403; Origin staging yang terdaftar dengan CSRF valid menghasilkan HTTP400 Selected payment provider is not available ketika pembayaran dimatikan. Ini membuktikan fail-closed, BUKAN transaksi Paddle sandbox sukses. /paddle/checkout sesudah login mengembalikan503 karena provider disabled.
3. OIDC Presentation: roundtrip issuer loopback sintetis PASS. Discovery, code challenge PKCE S256, nonce, JWKS/RS256 signed ID token, sesi terautentikasi, penolakan replay callback, dan logout/revokasi sesi teruji. Production guard tidak dilemahkan. Ini bukan login Keycloak produksi atau validasi entitlement Pro lintas layanan nyata.
4. Browser vendor timeout: fixture menunda script18detik, lebih lama dari batas15detik. Fallback support tetap tampil dan iframe/container vendor yang terlambat dihapus. Frame count0 sesudah script tiba.
5. Browser vendor HTTP503: fallback tampil PASS. Normal fixture iframe tetap dimuat PASS sesudah perubahan timeout. Tidak ada provider yang dihubungi pada fixture.

Perubahan kode baru: failed-state pada adapter dan pembersihan container vendor yang muncul terlambat. Salinan adapter pada Notes/Presentation/Translator identik. Tidak mengubah login, billing, database, atau provider config produksi.

Penghambat yang masih tersisa:
- Cekat harus mengonfirmasi kuota efektif Usage vs Billing, konfigurasi resmi default English, pembatalan followup terantre, retensi, dan masalah Retry sesi baru. Draf pertanyaan sudah tersedia, belum dikirim. Followup tetap OFF.
- Email contact benar-benar sampai inbox belum dibuktikan dengan pesan uji nyata. Validasi/mailer-failure sudah diuji dengan transport tiruan.
- Transaksi Paddle sandbox, login Keycloak aktual, HTTPS full-suite, hardware keyboard mobile, dan outage koneksi WebSocket/API setelah iframe dimuat belum diuji. Jangan menyamakan timeout script dengan pengujian seluruh transport Cekat.
- Script vendor tidak menyediakan sinyal readiness API yang terverifikasi; iframe load bukan jaminan sesi siap mengirim. Masalah Retry harus ditangani bersama Cekat.

Keputusan: kandidat makin lengkap, tetapi BELUM production-ready. Tidak cutover, tidak membeli/topup, tidak mengaktifkan WhatsApp/Instagram/broadcast. Setelah external gate selesai, jalankan canary HTTPS per layanan dengan rollback image lama sebelum memperluas produksi.
