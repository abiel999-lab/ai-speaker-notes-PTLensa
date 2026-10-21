# Upgrade to v0.1.3

## Why this release exists

v0.1.2 introduced a deliberately strict OOXML integrity validator. On a real, complex PowerPoint deck, a full `python-pptx` save can normalize or rewrite unrelated Office XML even when the slides still look correct in PowerPoint. The integrity validator correctly refuses to release such an output.

v0.1.3 changes the write-back strategy: the original PPTX package is preserved and only notes-related XML/relationships are modified. Existing notes slides are patched directly. `python-pptx` is used only to generate notes scaffolding for slides that do not yet have a notes part.

## Recommended Windows upgrade

Do not merge the new source over a running old folder. Keep the old build as a rollback copy.

```powershell
# 1. Stop the old server with Ctrl+C.
# 2. Extract v0.1.3 into a new folder, for example:
cd D:\kerja\PT_lensa_Makmur_Sejahtera\folder_kerja\ai-speaker-notes-mvp-v0.1.3

# 3. Install/update dependencies and editable metadata.
.\scripts\setup.ps1

# 4. Verify before starting the web app.
.\scripts\verify.ps1

# 5. Start.
.\scripts\run.ps1
```

Expected setup output includes:

```text
Setup complete. App version: 0.1.3
```

After startup, verify:

```text
http://127.0.0.1:<port>/health
http://127.0.0.1:<port>/docs
```

`/health` must report `"version": "0.1.3"`.

## If you want the exact reason from a failed v0.1.2 job

From the old v0.1.2 project folder:

```powershell
$latest = Get-ChildItem .\storage\jobs -Recurse -Filter error.log |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

$latest.FullName
Get-Content $latest.FullName
```

v0.1.3 also prints the full traceback to the server console, while the browser receives a safe integrity-specific message.
