AI Speaker Notes v0.2.8 — Chat Follow-up + General Chat Patch

Fixes:
1. Follow-up references such as "same slide", "this slide", "slide ini", "slide yang sama",
   "slide tersebut", and "slide tadi" now resolve to the last single-slide context.
   Example: Slide 4 -> "Now explain the same slide in Indonesian" stays on Slide 4 only.
2. When no PowerPoint is selected, Chat AI now works as a normal general chatbot.
   General chat has NO access to presentation/job files and never pretends it inspected a deck.
3. A General Chat card is available alongside completed presentation jobs.
4. Slide # is disabled in General Chat and enabled only in presentation RAG mode.
5. General chat history is server-side, bounded by the same turn/message limits, isolated per user,
   and expires using the configured job retention window.
6. Clear Chat works in both General Chat and presentation chat.
7. Chat page displays neutral "GPT-5.6" branding while the backend may route to its configured model.

Safety retained:
- Same-origin / API access checks
- CSRF on mutating chat requests
- Message and turn limits
- No access to secrets or other users' job files
- Presentation exact-slide isolation

Validation performed:
- Python compile: PASS
- JavaScript syntax: PASS
- Full automated test suite: 59 passed

Apply:
Extract this ZIP over the ai-speaker-notes-mvp project root and overwrite existing files.
Then restart: .\scripts\run.ps1
Hard refresh browser: Ctrl+Shift+R
