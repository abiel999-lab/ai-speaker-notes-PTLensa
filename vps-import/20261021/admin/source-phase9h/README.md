# AI Speaker Notes — Production v1.0.0

AI Speaker Notes adalah aplikasi produksi PT Lensa Makmur Sejahtera untuk membaca PowerPoint, menganalisis teks dan visual, membuat speaker notes, serta menyediakan Chat AI berbasis RAG per slide.

## Production stack

- FastAPI + Jinja UI
- PostgreSQL untuk user metadata, job metadata, audit trail, dan chat history
- Keycloak OIDC untuk multi-user login
- Durable Docker volume untuk PPTX/output/checkpoint/render artifacts
- LibreOffice headless renderer untuk Vision di Linux
- OpenAI GPT-5.6 untuk generation dan Chat AI
- Nginx reverse proxy + HTTPS
- Domain: `https://aispeakernote.lensalingkungantech.com`

## v1.0.0 guarantees

- Per-user isolation menggunakan stable Keycloak `sub` sebagai ownership key.
- Existing notes mendukung preserve, append, dan replace.
- Hidden slides ditangani dengan temporary normalized rendering copy tanpa mengubah hidden state file asli.
- Vision tidak memiliki fixed slide-count cap; large decks diproses melalui automatic batching.
- Chat AI mendukung exact-slide RAG, natural-language slide selection, follow-up same-slide context, general chat, hallucination guard, input/turn limits.
- PPTX original tidak diubah; output dibuat sebagai file baru.
- Chat history dan job metadata persistent di PostgreSQL.
- File artifacts persistent pada mounted storage volume.
- Secure session cookie, CSRF protection, same-origin protection, security headers, upload package validation, OLE/macro guardrails, and cost guardrails.

## Local development

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Local mode tetap dapat menggunakan file-store fallback jika `DATABASE_URL` kosong dan `APP_ENV=development`.

## Local Keycloak admin dashboard

This build includes a compact administrator console at `/admin` with Keycloak user CRUD, ban/unban, and per-user uploaded presentation history. Protected browser routes now redirect straight to the existing `aispeaker` Keycloak realm; `/login` is only a compatibility redirect. For local setup, including the exact `http://127.0.0.1:8001/auth/callback` Keycloak redirect URI, see `docs_ADMIN_LOGIN_LOCAL.md` and `deploy/admin-local.env.example`.

## Production deployment

Gunakan file berikut:

```text
docker-compose.production.yml
deploy/production.env.example
deploy/deploy-v1.sh
deploy/nginx/aispeakernote.lensalingkungantech.com.conf
deploy/keycloak/ai-speaker-notes-realm.json
deploy/keycloak/themes/lensa-ai/
```

Lihat `deploy/README_DEPLOY.md` untuk langkah production deployment lengkap.

## Tests

```bash
OPENAI_API_KEY='' AUTH_ENABLED=false DATABASE_URL='' APP_ENV=development python -m pytest -q
```

Release v1.0.0 harus lulus seluruh regression suite sebelum deployment.

## Secrets

Jangan commit file berikut:

```text
.env
.env.prod
*.pem
*.key
backups/
storage/
```

Gunakan secret unik dan panjang untuk PostgreSQL, Keycloak, OIDC client, dan application session.


## Local admin data integration update

- The user-facing app and `/admin` use the same `DATABASE_URL`. Presentation history is stored in `jobs`; persistent AI chat is stored in `chat_threads` and `chat_messages`; login/application users are stored in `users`.
- `/admin` user detail now reads both presentation jobs and saved chat threads/messages for that Keycloak user subject.
- Admin access is granted only when the signed Keycloak token contains the configured `ADMIN_ROLE` (default `admin`). Username-based admin bypasses are not used.
- The local launcher can reuse the existing `KEYCLOAK_CLIENT_SECRET` from a sibling `ai-speaker-notes-mvp/.env` when the new `.env` still contains a placeholder. It never prints the secret.
- If Keycloak rejects the OIDC client credentials, the callback now returns a clear configuration error instead of an unhandled 500 traceback.
