# Upgrade to v0.2.4

## Recommended on Windows

1. Stop the current server with `Ctrl+C`.
2. Back up the private environment file:

```powershell
Copy-Item .env .env.before-v0.2.4.backup
```

3. Extract v0.2.4 into a **new folder** when possible. Copy only `.env` from the old project into the new folder.
4. Run:

```powershell
.\scripts\setup.ps1
.\scripts\verify.ps1
.\scripts\diagnose-ai.ps1
```

Expected automated suite: `37 passed`.

5. Before the next paid job, optionally estimate the real deck:

```powershell
.\scripts\preflight-cost.ps1 -Path ".\your-deck.pptx" -Vision -Depth Mendalam -NotesMode replace_all
```

6. Start the app:

```powershell
.\scripts\run.ps1
```

## New environment settings

Existing `.env` files may omit these safely because defaults exist, but adding them makes behavior explicit:

```env
OPENAI_SEMANTIC_RETRIES=2
OPENAI_RESUME_CHECKPOINTS=true
OPENAI_VISION_FALLBACK_TO_TEXT=true
POWERPOINT_RENDER_TIMEOUT_SECONDS=120
OPENAI_MAX_ESTIMATED_JOB_COST_USD=1.00
OPENAI_VISION_ESTIMATED_INPUT_TOKENS_PER_SLIDE=1100
```

## Retry behavior

If a job fails after some AI batches complete, do not upload the same file as a brand-new job immediately. Use **Retry failed job** so v0.2.4 can reuse compatible checkpointed notes and avoid duplicate API spend.
