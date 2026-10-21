AI Speaker Notes v1.0.0 — Completed History Download Fix

Problem:
If a job finishes while the user leaves the dashboard/logs out and later returns,
the history card showed only "Open AI Chat" and "Delete". The download button
was only shown by the live polling result UI.

Fix:
Completed history items now render:
- Download result PPTX
- Open AI Chat
- Delete

The patch edits the existing files in-place instead of replacing the whole app.js,
so other recent source changes are preserved.

Run from the project root:
  powershell -ExecutionPolicy Bypass -File .\apply-download-history-patch.ps1

Then rebuild the app container.
