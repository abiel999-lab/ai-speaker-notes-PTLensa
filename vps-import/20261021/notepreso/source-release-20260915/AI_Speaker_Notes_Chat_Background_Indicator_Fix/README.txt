AI Speaker Notes — Persistent Chat Processing Indicator Fix

Purpose:
- Persist a processing assistant placeholder BEFORE the OpenAI call starts.
- When the user leaves Chat AI and returns, PostgreSQL history still shows the answer as processing.
- Chat page polls every 2 seconds and automatically replaces the processing bubble with the final answer.
- Reopens the last selected chat/presentation after returning to /chat.
- Prevents duplicate prompts and Clear Chat while an answer is still processing.
- Marks failed responses visibly instead of silently looking stuck.
- Works for both General Chat and presentation RAG chat.

The PowerShell installer backs up modified files under:
.patch-backups/chat-processing-<timestamp>
