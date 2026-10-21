# Upgrade to 0.1.2

Recommended for the current Windows development machine:

1. Stop the old server with `Ctrl+C`.
2. Keep the old project folder as a backup.
3. Extract 0.1.2 into a fresh folder, for example `ai-speaker-notes-mvp-0.1.2`.
4. Run:

```powershell
.\scripts\setup.ps1
.\scripts\run.ps1
```

Do not copy the old `.venv` into the new folder. If you want to reuse configuration, copy only your `.env` and review the new `MAX_CONCURRENT_JOBS` setting.

## Acceptance check

Open the URL printed by the runner and verify:

```text
/health
/health/ready
/docs
```

Then test the real 42-slide deck twice:

- first with the safe default `Hanya isi slide tanpa notes`;
- optionally with `Ganti semua speaker notes` on a disposable copy only.

The safe-default run should report existing notes and preserve them unchanged.
