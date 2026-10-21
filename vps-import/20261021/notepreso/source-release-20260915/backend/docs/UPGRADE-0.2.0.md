# Upgrade to v0.2.0

Use a fresh directory rather than copying files over v0.1.x.

```powershell
cd D:\kerja\PT_lensa_Makmur_Sejahtera\folder_kerja\ai-speaker-notes-mvp-v0.2.0
.\scripts\setup.ps1
.\scripts\verify.ps1
.\scripts\run.ps1
```

Confirm:

```text
GET /health -> version 0.2.0
```

For OpenAI, edit `.env` locally, add `OPENAI_API_KEY`, then restart. Run:

```powershell
.\scripts\diagnose-ai.ps1
```

If vision is enabled, the diagnostic must show a LibreOffice executable and `Renderer ready : True`. If you want to validate AI before installing LibreOffice, set `OPENAI_USE_VISION=false`, restart, and use a small disposable deck.
