# Backend staging — hasil lanjutan

Backend NotePreso nyata berjalan di container notepreso-nora-isolated-20261117, branch feat/nora-support-preview, image dependensi yang sama dengan layanan aktif. Source kandidat dipasang read-only. Network internal terpisah, tanpa mount data/secret produksi, database SQLite baru di tmpfs. Pembayaran, SMTP dan OpenAI tidak dikonfigurasi. Staging bukan replika PostgreSQL/Keycloak/Paddle produksi.

PASS: homepage, pricing, guide, legal HTTP 200 dengan satu include Nora dan CSP Cekat. Login, workspace dan checkout HTTP 303 menuju autentikasi tanpa include Nora/CSP Cekat. Endpoint auth/me dan asset JS HTTP 200. Hasil mentah: backend-checks.json.

Browser berhasil membuka HTML yang dirender backend melalui SSH tunnel privat dan proxy loopback localhost:8766. Proxy hanya mengganti Host menjadi notepreso.com dan menambahkan atribut preview lokal pada tag adapter; tidak memodifikasi source kandidat. Panel consent tampil dan Start chat disabled sebelum checkbox dipilih. Screenshot: backend-staging.jpg. Tidak ada endpoint staging yang sengaja dipublikasikan. Browser menjalankan koneksi vendor langsung; backend staging tidak punya egress internet.

Batas pengujian: belum ada transaksi sandbox, login Keycloak nyata, simulasi jaringan browser lambat/putus, pengujian keyboard mobile perangkat fisik, atau pengujian ulang sesi Cekat baru pada backend ini. Tes FAQ/handoff vendor dan mobile dari tahap sebelumnya tetap berlaku sebagai hasil preview sebelumnya, bukan diklaim sebagai pengujian full-stack baru. Retry sesi baru belum terselesaikan. Entitlement, English default dan retensi provider masih menunggu jawaban Cekat.

Draf CEKAT-SUPPORT-DRAFT.txt sudah siap disalin; belum dikirim ke pihak mana pun. Produksi dan main tidak diubah. Followup tidak diaktifkan kembali. Cutover belum dilakukan dan tetap memerlukan persetujuan user setelah blocker diselesaikan.

Staging dapat dihentikan tanpa menyentuh produksi dengan docker stop notepreso-nora-isolated-20261117. Database tmpfs bersifat disposable. SSH tunnel dan proxy lokal bersifat preview sementara; bukan layanan publik permanen.
