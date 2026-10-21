# Production Deployment — AI Speaker Notes v1.0.0

Target public URL:

```text
https://aispeakernote.lensalingkungantech.com
```

## Topology

```text
User
  |
  v
Hostinger/cPanel DNS
  |
  v
VPS public IP
  |
  +-- Nginx :443
       |
       +-- /                 -> FastAPI 127.0.0.1:8000
       +-- /auth/realms/*    -> Keycloak 127.0.0.1:8081
       +-- /auth/resources/* -> Keycloak 127.0.0.1:8081

Docker private network
  +-- app
  +-- PostgreSQL
  +-- Keycloak
```

PostgreSQL dan Keycloak tidak diekspos ke internet. Keycloak Admin UI diblokir oleh Nginx dan dikelola melalui SSH port forwarding.

## 1. DNS di Hostinger/cPanel

Buat A record:

```text
Type : A
Name : aispeakernote
Value: <PUBLIC_IP_VPS>
TTL  : 300 atau default
```

Verifikasi dari PC:

```powershell
nslookup aispeakernote.lensalingkungantech.com 8.8.8.8
```

Jangan lanjut SSL sebelum DNS mengarah ke public IP VPS yang benar.

## 2. Siapkan VPS

Ubuntu 22.04/24.04:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx
```

Install Docker Engine + Compose plugin dari repository resmi Docker jika belum tersedia.

Clone repository:

```bash
sudo mkdir -p /opt/ai-speaker-notes
sudo chown "$USER":"$USER" /opt/ai-speaker-notes
cd /opt/ai-speaker-notes
git clone <YOUR_GITHUB_REPOSITORY_URL> .
```

## 3. Production secrets

```bash
cp deploy/production.env.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

Generate secret contoh:

```bash
openssl rand -base64 48
```

Semua `CHANGE_ME` wajib diganti.

## 4. Nginx + HTTPS

Sebelum certificate tersedia, aktifkan HTTP config sementara atau jalankan Certbot setelah A record resolve.

Copy config:

```bash
sudo cp deploy/nginx/aispeakernote.lensalingkungantech.com.conf /etc/nginx/sites-available/aispeakernote.conf
sudo ln -sfn /etc/nginx/sites-available/aispeakernote.conf /etc/nginx/sites-enabled/aispeakernote.conf
```

Untuk issuance pertama, pastikan blok port 80 aktif dan certificate path pada blok 443 belum membuat `nginx -t` gagal. Cara paling mudah adalah:

```bash
sudo certbot certonly --nginx -d aispeakernote.lensalingkungantech.com
```

Setelah certificate tersedia:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Start production stack

```bash
chmod +x deploy/deploy-v1.sh
./deploy/deploy-v1.sh
```

Check:

```bash
docker compose --env-file .env.prod -f docker-compose.production.yml ps
curl -fsS http://127.0.0.1:8000/health/ready
```

## 6. Keycloak admin access

Admin Console sengaja tidak diekspos publik. Dari PC lokal:

```bash
ssh -L 8081:127.0.0.1:8081 <VPS_USER>@<VPS_IP>
```

Lalu buka:

```text
http://127.0.0.1:8081/auth/admin/
```

Login menggunakan `KEYCLOAK_ADMIN_USERNAME` dan `KEYCLOAK_ADMIN_PASSWORD` dari `.env.prod`.

Realm `ai-speaker-notes` dan confidential client `ai-speaker-notes` di-import otomatis saat first startup. Buat user production dari Keycloak Admin Console.

## 7. Production verification

```bash
curl -I https://aispeakernote.lensalingkungantech.com/
curl https://aispeakernote.lensalingkungantech.com/health/live
curl https://aispeakernote.lensalingkungantech.com/health/ready
```

Browser checklist:

1. Root redirects ke Keycloak saat belum login.
2. Login theme memakai branding Lensa Lingkungan.
3. Login berhasil dan Dashboard menampilkan v1.0.0.
4. User A hanya melihat job/chat User A.
5. Upload PPTX -> Vision -> output PPTX berhasil.
6. Existing notes preserve/append/replace tetap bekerja.
7. Large deck >60 slides tetap diproses dengan batching.
8. Exact slide RAG dan follow-up same-slide bekerja.
9. General chat bekerja tanpa PPT.
10. Logout menghapus local session dan menuju Keycloak logout.

## 8. Backups

Database:

```bash
./deploy/backup-v1.sh
```

Selain database dump, snapshot/backup Docker volume `app_data` karena di sana file PPTX/output disimpan.

## 9. Upgrade workflow

```bash
cd /opt/ai-speaker-notes
git pull --ff-only
./deploy/deploy-v1.sh
```

Jangan melakukan `docker compose down -v` di production karena `-v` menghapus database dan file volume.
