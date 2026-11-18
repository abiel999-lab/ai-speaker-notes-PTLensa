# Follow-up: evidence and wait boundary

Status OFF. Official sources inspected18November2026:
- https://docs.cekat.ai/chat-setting/ai-followups
- https://docs.cekat.ai/ai-and-platform/chat/conversation-list

The first source documents configuring delay, prompt, Exact Chat and handoff after sending. The second describes status changes at takeover and stopping AI after handoff when that option is enabled. Neither inspected page establishes that already scheduled followups are canceled on takeover or resolve. Stopping AI responses is not proof of cancellation of queued followups. No guarantee inferred from either source.

Existing global and agent Followups lists were empty. Do not turn on a prompt-only guard. Obtain provider confirmation of actual scheduler cancellation semantics and an isolated test path without affecting customer sessions.

Acceptance matrix: lastAI atT0,15min followup. (1) no reply remains eligible: one send only; (2) user replies beforeT+15: zero old followups; (3) human takeover beforeT+15: zero followups; (4) resolve beforeT+15: zero followups; (5) takeover+reply+resolve: zero; (6) reopen: no stale followup from old session; (7) provider retry/outage recovery: no duplicate or stale send. Observe until past scheduled execution and after retries. Capture session ID, state transitions, scheduler cancellation receipt and actual send history; redact content and IDs from public artifacts. Only after all required cases pass may15min be enabled. Never activate top-up automatically.

Provider questions prepared: entitlement mismatch, effective MAU/credit units, Business on Development banner/WhatsApp activation, default English and Retry bug, cancellation on reply/takeover/resolve/reopen and retry recovery. No support message sent by this document.
