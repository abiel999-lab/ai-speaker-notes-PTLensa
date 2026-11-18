# Feedback production release — 18 November 2026

## Live changes
- /support now includes Feedback / feature request, accepted by server validation and labeled in outgoing support email. Message placeholder asks which tool, expected behavior and actual behavior. Existing transport, recipient, reference, rate limit, honeypot and origin checks preserved. No new database or automatic ticket system.
- Cekat now has Feedback label (brand cyan12B5C9) and Condition5 in existing Nora AI Actions & Routing. Four existing categories and transfer condition retained. Saved and reloaded successfully. Official Preview fixture reported: Successfully executed tool calls — Label Feedback assigned successfully. Reply acknowledged the suggestion;7Cekatcredits displayed. This proves provider Preview categorization, not a new live-customer ticket/notification test.
- Acceptance uncovered existing CSP builder issue on Support: empty baseline became script-src live.cekat.ai only, blocking first-party JS. Default fallback now includes self when no default-src exists. Support now runs site navigation/account prefill and Nora launcher again. Existing default-src inheritance, nonce and Paddle directives preserved; auth/admin/API excluded.
- Source hardening also mirrored in app/app/core/support_widget.py for consistent future builds; current Notes runtime has an existing nonempty CSP and was not restarted for this source-only backport.

## QA
- Isolated candidate tests passed: feedback option, accepted POST with SUP reference using fake mailer, invalid category400, foreign origin403, email failure502 with fallback. Actual email sends in these tests:0. Historical delivery to support inbox was verified previously; new category was not sent to real inbox in this release.
- CSP regression passed: empty baseline allows self, default inheritance, nonce and Paddle preserved, excluded auth/admin/API paths.
- Production browser: form category selectable, Main navigation rendered, account prefill active, Nora root present. Desktop and390x844 viewport no horizontal overflow. Viewport reset after test. No live form submitted.
- Existing memory persistence passed with actual current Notes code in isolated SQLite: jobs/chat stored, store recreation preserves history, different owners, deck scopes and general/RAG separated. Zero model calls. This verifies existing stored conversation/history, not a newly built semantic cross-document memory.
- Prior release Markdown→PPTX fixture and contract tests remain passed. No generation/payment worker changes in this release.

## Existing operating hours, now verified
Cekat Working Hours auto agent online/offline checkbox is checked. Actia Carbon weekly display Mon–Fri08:00–12:00 and13:00–17:00; Sat/Sun00:00–00:00. No values edited. Timezone not explicit on this view; Followups settings separately labels schedule Jakarta Time. Do not infer weekend semantics or promise response SLA without confirmation. Nora already has welcome message and status-aware human-unavailable instructions.

## Followup decision
Global Followups list has0entries; agent Followups remains empty. Global Add Follow Up dialog offers Auto Followup After AI and Auto Followup using Label, but no visible explicit cancellation guard for human takeover/resolve. Dialog canceled without saving. The requested safe operational outcome is to leave followup OFF until provider/runtime cancellation is proven. Do not activate merely from a prompt instruction. No test schedule created for customer conversations.

## Deployment/rollback
Only contact service replaced, image notepreso-feedback-csp:20261118. Old containers retained. Backup roots /home/actiaAdmin26/feedback-production-20261118 and /home/actiaAdmin26/feedback-csp-production-20261118 contain private inspect/config; never commit these files.
CSP-step rollback: sudo python3 /home/actiaAdmin26/feedback-csp-cutover.py rollback contact. Full prior release rollback then uses sudo python3 /home/actiaAdmin26/feedback-cutover.py rollback contact. The first predecessor contains Feedback but still the old CSP problem, so rollback reintroduces that limitation; prefer forward-fix unless required. IP/aliases/env/mounts preserved. No DB migration. For Cekat rollback remove only Condition5/Feedback after checking usage, retaining four previous rules; UI deletion may need its own confirmation. Nothing deleted in this release.

## Remaining dependencies
WhatsApp/Instagram activation, Cekat quota mismatch and business development status require provider/account resolution. Meta prepaid balance0 and payment error cannot be resolved without a funding amount and owner transaction; no funds/budget/campaigns altered. Broadcast remains separate and unsent; recipients/consent and spending limit missing. New semantic memory behavior still requires definition; existing history verified above.
