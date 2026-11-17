# Nora / NotePreso — hasil integrasi preview, 17 November 2026

Status: IMPLEMENTED IN PREVIEW; NOT APPROVED FOR PRODUCTION.

## Pemeriksaan awal
- Repo main: ada51bd32e31f98d86131eb5b85bda28bfd88b94; working tree bersih sebelum perubahan.
- App aktif Python/FastAPI; hash main.py dan home.html cocok dengan snapshot repo.
- Image utama: sha256:9c010b47a0e7669627d3308087b1a402957cc47988b27af0909598a1b2844398, restart unless-stopped.
- Nginx meneruskan apex ke actia-notepreso-app:8000; /support ke sidecar. Admin/login/presentation/translation memakai virtual host berbeda.
- Kondisi awal: aplikasi utama healthy; contact sidecar dan translator monitor sudah unhealthy. Tidak diperbaiki dalam perubahan widget.
- Backup file sebelum perubahan: production-before.tgz; belum ada perubahan/cutover website produksi.

## Cekat yang diverifikasi langsung
- Channel f58503cb-6f56-41d9-8c4f-7905a7aac64d, Nora | NotePreso Support.
- Agent CS Testing - Actia; human Actia Carbon; agent dan KB tidak dibuat ulang.
- User Info Requirement OFF: nama/telepon tidak wajib.
- Bottom Right / Open to Left tersimpan. Embed resmi tetap position bottom-left; source widget resmi menunjukkan offsetX positif menentukan tombol kanan dan position menentukan arah popup.
- AI resolve 30 menit; human resolve OFF.
- Followup 15 menit dicadangkan lalu dihapus dari jadwal aktif dan disimpan; reload UI mengonfirmasi daftar kosong. Ini tidak membuktikan bahwa job lama yang sudah terantre telah dibatalkan. Belum ada pembuktian scheduler mencegah followup setelah takeover/resolve, jadi jangan aktifkan kembali.
- Usage 1.970/2.000 credit tersisa dan 97/100 MAU pada saat pemeriksaan; Billing Pro menampilkan 3.000 MAU / 15.000 AI response. Angka credit dan response tidak boleh dianggap unit yang sama. Konflik entitlement belum terselesaikan; perlu Cekat. Tidak membeli paket/topup atau mengaktifkan biaya tambahan otomatis.
- Bahasa akun English berbeda dari UI pengunjung. Source resmi livechat-core default id, menyimpan pilihan livechat_language di origin Cekat. Tidak ditemukan konfigurasi default English pada channel/embed/SDK yang ditinjau. Pilihan EN manual bekerja dan bertahan. Tidak memakai parameter tebakan atau manipulasi iframe lintas domain.

## Perubahan file
- app/app/static/nora-support.js: adapter modular, allowlist apex+public routes, consent eksplisit sebelum request Cekat, tidak meneruskan identitas/session/document/payment data dari app, timeout/error fallback; validasi sumber pesan legacy toggle.
- app/app/static/nora-support.css: branding biru, panel responsif, keyboard focus, offset di atas cookie settings, sembunyikan saat banner cookie terbuka.
- app/app/templates/{home,pricing,how_to,legal}.html: include adapter; legal mendapat pemberitahuan pemrosesan chat.
- app/app/main.py: HANYA pengecualian CSP exact host/routes untuk script/frame resmi dan style attributes widget; tidak mengubah logika login/database/pembayaran.
- Deployment scope awal: /, /pricing, /how-to, /legal pada notepreso.com. /app, login, checkout, /chat, sidecar /support, www, dan subdomain tidak diberi widget otomatis. /support tetap fallback yang tersedia.

## Hasil testing
| Test | Hasil |
|---|---|
| Python AST / JS syntax | PASS |
| Guard 8 excluded hosts/routes | PASS |
| CSP 21 host/route combinations | PASS |
| Before consent: no Cekat script/iframe | PASS (DOM inspection; not a packet capture) |
| Consent + official widget real load | PASS |
| FAQ Speaker Notes + Presentation Generator | PASS, jawaban English dari Nora |
| Desktop 1280x720 | PASS; widget 400x540, x849 y108, no horizontal overflow |
| Mobile 390x844 | PASS; fullscreen 390x844, no horizontal overflow; touch/soft keyboard hardware belum diuji |
| Human handoff online | PASS, assigned Actia Carbon |
| Human takeover + manual reply | PASS, balasan diterima widget |
| Resolve + new active session | PASS; sesi 1 dan 2 berakhir, session 2 dimulai setelah reload |
| Offline handoff | PASS, system: Pending because there are no online Agents |
| General FAQ offline | NOT PASS: pesan awal berstatus Retry; pesan handoff selanjutnya berhasil. Perlu reproduksi dan tindak lanjut Cekat |
| Vendor script unavailable | PASS via CSP-block fixture; fallback /support tampil |
| Cookie banner overlap | PASS pada fixture memakai CSS/class banner existing; launcher hidden lalu muncul setelah reject |
| Follow-up cancellation | NOT PROVEN; jadwal dinonaktifkan. Belum observasi 15 menit untuk job terantre |

Preview menggunakan HTML publik aktual dan asset snapshot, melalui localhost:8765. Backend/API sengaja disconnected (503); bukan full-stack staging. FAQ dan handoff memakai layanan Cekat sungguhan, membuat percakapan QA USER-NHu910; kedua sesi diselesaikan. Status human dipulihkan Online. Login, upload/generation, database, pembayaran, admin, dan app Presentation tidak diuji regresi end-to-end dalam static preview dan tidak diubah.

## Risiko / gate sebelum produksi
1. Cekat mengonfirmasi entitlement efektif Usage vs Billing tanpa pembelian otomatis.
2. Cekat menyediakan default UI English resmi atau pemilik menerima secara eksplisit UI awal ID dengan EN manual.
3. Reproduksi dan selesaikan Retry pada pesan awal sesi baru; validasi backend outage setelah script berhasil dimuat (iframe load bukan jaminan API siap).
4. Konfirmasi retensi, subprocessor, transfer internasional, dan proses penghapusan chat dari provider untuk finalisasi privacy notice.
5. Verifikasi tidak ada followup lama terantre; scheduling tetap OFF.
6. Selesaikan preview full-stack terisolasi dan smoke test HTTPS/CSP sebelum cutover. Contact sidecar unhealthy adalah risiko fallback existing; halaman render publik dapat diverifikasi, pengiriman email tidak diuji.
7. Script vendor mutable (live URL) dan punya legacy message handler. Adapter memvalidasi sumber toggle, tetapi ketergantungan vendor tetap perlu dipantau.

## Cutover dan rollback (BELUM DIJALANKAN)
- Jangan menjalankan deploy sebelum gate di atas selesai dan ada persetujuan cutover dari user.
- Backup inspect/config produksi disimpan secara privat di server; jangan commit env/secrets.
- Build image candidate berbasis image aktif yang tercatat; COPY hanya tujuh file perubahan. Tidak migrasi DB, tidak ubah secrets/network alias atau virtual host lain.
- Jalankan full-stack canary terisolasi dengan konfigurasi staging; capture HTTPS/CSP header dan lakukan smoke test empat public routes serta checkout/login tetap tanpa Cekat.
- Saat disetujui, ganti service utama menggunakan definisi runtime yang dipertahankan; rekam old container/image dan alias. Jangan menimpa image lama.
- Jika gagal: kembalikan service ke image/container lama dan definisi runtime tersimpan, lalu verifikasi health, halaman utama, login redirect, checkout headers dan subdomain. Tidak ada rollback DB karena tidak ada migrasi.
- Emergency disable: hapus include nora-support dari empat template atau gunakan image lama; reload browser meniadakan vendor. Existing browser sessions tidak dapat ditarik kembali secara instan. Backup restore telah diuji ke direktori sementara, bukan ke produksi.
- Rollback followup: salin prompt/delay dari followup-backup.json melalui UI HANYA setelah cancellation semantics dibuktikan; jangan aktifkan otomatis saat rollback website.

Referensi vendor yang diperiksa: https://live.cekat.ai/widget.js ; https://live.cekat.ai/?chat=NotePreso-TawWFQU9 ; https://docs.cekat.ai/ai-and-platform/connected-platforms/web-livechat-inbox .
