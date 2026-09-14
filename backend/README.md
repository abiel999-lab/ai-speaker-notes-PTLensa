# AI Speaker Notes PT Lensa — Complete Source v0.2.8

Bundle ini sengaja dipisah jelas agar tidak membingungkan saat deployment.

## Struktur

```text
ai-speaker-notes-v0.2.8-COMPLETE/
├── backend/       Backend FastAPI untuk Google Cloud Run
├── frontend/      Frontend static untuk Hostinger public_html/aispeakernote
└── local-mvp/     Full/local MVP untuk development dan testing Windows
```

## 1. Backend Cloud Run

Folder `backend/` berisi mesin aplikasi:

- FastAPI
- PPTX parser
- OOXML speaker-notes writer
- OpenAI generator
- Vision renderer
- LibreOffice support
- integrity validation
- checkpoint/resume
- cost preflight/guardrail
- Dockerfile Cloud Run
- deployment script

Deploy dari folder ini:

```bash
cd backend
export PROJECT_ID="ai-speaker-notes-demo"
export REGION="asia-southeast2"
./deploy/cloudrun-deploy.sh
```

Sebelum deploy, Secret Manager harus sudah memiliki:

- `openai-api-key`
- `ai-speaker-demo-key`

Jangan pernah commit `.env` atau API key.

## 2. Frontend Hostinger

Upload **isi** folder `frontend/` ke:

```text
public_html/aispeakernote/
```

Isi utamanya:

```text
index.html
app.css
app.js
config.js
```

Setelah Cloud Run selesai, edit `frontend/config.js`:

```js
window.AISPEAKER_CONFIG = {
  apiBaseUrl: "https://URL-CLOUD-RUN-KAMU"
};
```

URL user tetap:

```text
https://demo.studioimpactid.com/aispeakernote/
```

## 3. Local MVP

Folder `local-mvp/` adalah source lengkap untuk development Windows yang sebelumnya sudah diuji dengan PowerPoint renderer.

Contoh:

```powershell
cd local-mvp
.\scripts\setup.ps1
.\scripts\verify.ps1
.\scripts\run.ps1
```

## Arsitektur Deployment

```text
User
  ↓
https://demo.studioimpactid.com/aispeakernote/
  ↓
Hostinger frontend
  ↓ HTTPS
Google Cloud Run backend
  ↓
LibreOffice headless + PPT processing
  ↓
OpenAI API
```



## Upgrade 0.2.8

v0.2.8 adds the white/green responsive UI, bilingual How to Use and Legal pages, optional login, bounded presentation-aware Chat AI, GPT-5.6 Sol quality mode with hard input/cost limits, manual data deletion, interrupted-job recovery, and additional file-security guardrails. See `docs/UPGRADE-0.2.8.md`.

## Hardening 0.2.7

Release ini menambahkan hidden-slide-aware rendering, partial Vision recovery, visual structure diagnostics, contradiction guard, serta UI bilingual Indonesia/English. Lihat `docs/HARDENING-0.2.7.md`.
