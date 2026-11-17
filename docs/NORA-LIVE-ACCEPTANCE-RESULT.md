# Nora — live acceptance dan kesiapan image kandidat

17 November 2026. Status: kandidat dibangun; BELUM cutover produksi.

## Hasil aktual terbaru
- User login sendiri dengan akun uji melalui Keycloak di browser. SSO ke Presentation dan Translator berhasil membuka workspace Pro dengan saldo shared credits yang konsisten. Tidak ada file diunggah, generation dijalankan, atau kredit dipakai pada pemeriksaan ini. Ini smoke test login live, bukan pengujian widget di produksi karena widget belum dirilis.
- Backup Paddle prelive yang ada diverifikasi sebagai sandbox (sandbox-api.paddle.com, API key sandbox dan client token test). Konfigurasi produksi tidak diganti.
- Adapter Paddle aktual membuat transaksi sandbox txn_01m7mct1kt0v097ste37dx1qan. Checkout HTML/JS aplikasi aktual dirender di localhost dengan client token sandbox dan banner QA. Kartu uji resmi Paddle digunakan; tidak memakai kartu sungguhan.
- Sandbox API mengonfirmasi status completed, total USD11.10 (data sandbox, bukan biaya live). Subscription sandbox sub_01m7md2jxa3nyde5cp876kt24e dibatalkan segera setelah verifikasi; status akhir canceled.
- Transaksi sandbox tidak terdaftar di database checkout live. Saldo/entitlement live tidak diubah. Tes ini tidak membuktikan delivery webhook otomatis ke database staging; jangan menganggap rekonsiliasi kredit live sudah diuji dengan transaksi ini.
- Contact form live sudah terbukti sampai INBOX, referensi SUP-F71EBB1DAA; lihat laporan delivery terpisah.

## Cekat
- Usage terbaru masih 100 MAU / 2.000 AI Credits, sisa96 MAU /1.954 credits saat diperiksa. Billing tetap menunjukkan paket Pro3.000 MAU /15.000 responses. Belum ada konfirmasi unit atau limit efektif dari provider.
- Laporan bug teknis dimasukkan melalui form feedback akun Cekat mengenai mismatch kuota, default English, Retry awal sesi, followup cancellation dan retensi. Setelah Submit Bug Report, UI menampilkan Submitting lalu dialog tertutup. Tidak ada nomor tiket atau jawaban provider yang ditampilkan; jangan mengklaim entitlement sudah diperbaiki.
- Tombol Click here to activate membuka WhatsApp Account Manager resmi dari dashboard; tombol tersebut tidak langsung mengaktifkan akun.
- Screenshot user menunjukkan permintaan aktivasi sudah dikirim ke Cekat AI Support dan dibalas "sore kak, mohon ditunggu ya kak". Ini acknowledgement, bukan konfirmasi aktivasi/kuota.
- Tidak mengirim ulang permintaan WhatsApp, tidak menambah plan/topup, dan tidak menghubungkan WhatsApp/Instagram sebagai channel. Followup tetap OFF.

## Image dan rollback
Empat image kandidat privat dibangun dari image container produksi yang diinspeksi saat build, dengan overlay file terpilih dari revision0901b06. Rincian SHA image dan hash file berada di candidate-images.json. Notes17 file overlay, contact3, Presentation5, Translator6. Pemeriksaan syntax tiap image PASS. Semua container/image live diverifikasi tetap sama sebelum/sesudah build. Image belum dipush ke registry publik atau dipasang menggantikan produksi.

Contact candidate menyertakan healthcheck yang benar ke /_contact_health. Backup inspect/config runtime lengkap empat container disimpan privat di server (mode0700/0600), bukan di Git. Build image tidak menyalin env/secret baru ke konteks overlay. Base image tetap image aktif internal server; jangan mempublikasikan image atau file inspect tersebut.

Rollback saat cutover nanti: simpan container/image lama dan definisi runtime; mulai dari canary satu layanan, pertahankan network aliases/mount/env sesuai backup privat, periksa health dan HTTPS/CSP. Jika gagal, pulihkan image/config lama. Tidak ada migrasi DB yang menjadi bagian perubahan widget. Pastikan tidak ada job generation aktif sebelum restart/swap. Jangan mengganti semua layanan sekaligus. Memuat image baru dapat menjalankan lifecycle startup aplikasi lama; prosedur recovery/retention harus ditinjau saat cutover.

## Gate tersisa
1. Provider menyelesaikan aktivasi/entitlement atau pemilik memberi keputusan eksplisit mengenai batas Usage terendah yang masih tampil; jangan mengasumsikan paket Billing sudah berlaku pada runtime.
2. Default visitor UI English resmi, Retry saat session initialization, retensi dan cancellation followup masih perlu jawaban Cekat. Tidak memodifikasi iframe lintas domain.
3. Browser hardware keyboard mobile dan outage WebSocket/API setelah iframe load belum diuji penuh. Timeout script/HTTP503 sudah diuji terpisah dan bukan pengganti tes transport Cekat.
4. HTTPS full-suite candidate canary dan verifikasi callback rekonsiliasi sandbox ke staging belum dilakukan; sandbox checkout dan login live smoke telah selesai sebagaimana batas di atas.
5. Minta persetujuan cutover konkret sebelum mengganti produksi. Main tidak diubah.

Referensi: https://developer.paddle.com/sdks/sandbox/ ; https://developer.paddle.com/concepts/payment-methods/card/ ; https://developer.paddle.com/api-reference/subscriptions/cancel-subscription.md .
