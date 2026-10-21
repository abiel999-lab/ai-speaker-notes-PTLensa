AI Speaker Notes v0.2.8 - Large Deck / Vision Limit Fix
=======================================================

Purpose
-------
Removes the old hard rejection at 80 AI slides / 60 Vision slides.
Large presentations are already generated in small OPENAI_BATCH_SIZE batches,
so slide count is no longer used as a preflight rejection criterion.

What remains protected
----------------------
- PPTX upload and package size validation
- extracted source/context character guardrail
- estimated per-job API cost guardrail
- per-request timeout and retries
- resume checkpoints
- per-slide Vision fallback
- concurrent job limits

Important
---------
This means "no fixed slide-count cap", not unlimited RAM/API budget.
Very large or text-heavy decks can still be rejected by context-size or cost
safety guardrails, which is intentional.

User-visible changes
--------------------
- GPT label is neutral: GPT-5.6 (no Sol/Luna label in the UI)
- Hero card shows Automatic batching / No fixed slide-count cap
- How to Use explains large-deck batching and remaining safety guardrails

How to install
--------------
1. Stop the local server (Ctrl+C).
2. Extract this ZIP directly into the ai-speaker-notes-mvp folder.
3. Choose Replace/Overwrite when prompted.
4. Do NOT replace or delete your existing .env file. This patch does not contain .env.
5. Run: .\scripts\run.ps1
6. Hard refresh browser: Ctrl+Shift+R

Regression validation performed
-------------------------------
- Root test suite: 56 passed
- backend test suite: 56 passed
- local-mvp test suite: 56 passed
- JavaScript syntax checks: PASS
- Python compile check: PASS
- Actual PPT Climate Risk deck preflight: 72 slides / Vision / Replace All accepted
  and split into 18 AI batches at OPENAI_BATCH_SIZE=4.
