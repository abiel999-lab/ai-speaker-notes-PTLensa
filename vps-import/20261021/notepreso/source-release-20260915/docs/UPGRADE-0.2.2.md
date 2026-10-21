# Upgrade to v0.2.2

## Main change

Vision no longer requires LibreOffice on a Windows workstation that already has Microsoft PowerPoint. `SLIDE_RENDERER=auto` prefers PowerPoint COM and falls back to LibreOffice. Vision is selected per job from the UI, while Text-only remains the low-cost default.

## Recommended upgrade

Keep your existing `.env` private. Either extract the full release into a new folder and copy only your `.env`, or apply the update overlay over v0.2.1.

After upgrade:

```powershell
.\scripts\setup.ps1
.\scripts\verify.ps1
.\scripts\diagnose-ai.ps1
```

Expected:

```text
App version        : 0.2.2
OpenAI configured  : True
Renderer ready     : True
Renderer provider  : powerpoint
```

If PowerPoint is not detected, LibreOffice is still supported.

Then run the no-cost renderer test:

```powershell
.\scripts\test-vision-renderer.ps1
```

Only after the rendered PNGs look correct should you start the server and select Vision for a paid OpenAI job.

## `.env`

For Vision capability:

```env
SLIDE_RENDERER=auto
OPENAI_USE_VISION=true
```

Your existing OpenAI key/model/cost settings remain unchanged.
