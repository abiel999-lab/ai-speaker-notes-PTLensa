# Production follow-through — 18 November 2026

## Applied
- Fixed notepreso-translation-monitor healthcheck from application port8018 to monitor port8020. Authenticated GET /jobs now passes and Docker health is healthy. Application Translator was not restarted. Existing auth, mounts, network/IP and runtime configuration preserved.
- Retained pre-fix container notepreso-translation-monitor-before-healthfix-20261118. Private full config backup: /home/actiaAdmin26/translation-monitor-healthfix-20261118/before.json (0600).
- Updated existing Nora agent CS Testing - Actia, existing Knowledge Base Text/Default. Added Q36–Q41 covering Translator, image-text limitations, text fitting, failed jobs/credits, feedback and Markdown input. Agent and Knowledge Base were not recreated.
- Saved, completed training, reloaded and verified FAQ persisted. Existing 35 FAQs retained. Before-edit HTML backup retained locally with the audit artifacts.

## Verification
- Monitor probe authenticated against actual /jobs endpoint passed before and after replacement; health became healthy.
- Presentation document-contract test passed in network-disabled isolated container: schema, long-document, invalid JSON, empty output, known source IDs. Fake provider only; zero paid model API calls.
- Actual Markdown fixture parsed into document scene and exported to PPTX; layout test passed for wide/tall figures, title/cover, author/motion, expected no-notes contract and numeric symbols. Does not establish all Markdown dialects, visual correctness in native PowerPoint, or browser payment/generation end-to-end.
- Cekat official agent Preview after save: Translator URL, PPT/PPTX100MB, unchanged original, slide text+speaker notes, and image-text exclusion correctly answered.
- Feedback Preview: directed to https://notepreso.com/support, requested non-sensitive context, and explicitly stated no ticket was created automatically. No transfer triggered in this QA.
- Cekat Preview displayed7credits for Translator and4credits for feedback. These are Cekat quota units shown by the UI, not an extra payment/top-up. Presentation QA made no paid provider calls.

## Rollback
- Nora KB: restore local cekat-kb-before.html into the same Text/Default editor, save/train and verify. It is a backup, not a replacement agent.
- Monitor: only stop/remove the new monitor container, rename the retained pre-fix monitor back, restore network/IP aliases using before.json and start. This returns the previous incorrect healthcheck as well. Do not touch actia-translation-app or its data. Full inspect backup must remain private and must never enter Git.
- Deployment script documents the actual fix but intentionally refuses to overwrite the timestamped backup directory on rerun. Its Docker API helper is the pre-existing server /home/actiaAdmin26/nora-production-cutover.py. Do not rerun blindly.

## Still open
- Cekat entitlement mismatch100MAU/2000credits vs Billing3000MAU/15000responses and Business on Development banner need provider clarification. WhatsApp/Instagram not connected; no activation, top-up or broadcast attempted.
- Followup remains empty/OFF pending cancellation checks after takeover/resolve. Human auto-resolve remains OFF. Working hours need an actual business schedule; none invented.
- Meta campaign blocked by payment error, prepaid balanceRp0. No payment, budget change, campaign activation or appeal submitted. Funding requires an explicit amount/decision and owner transaction.
- Memory notes: job resume and remembered chat scope already exist; a new semantic cross-document memory system is not implemented because its meaning, retention and data boundaries have not been defined.
- Feedback guidance is live; a new automatic ticket database, Feedback label workflow and reporting dashboard are not implemented by this KB change.

Only the demonstrated fixes are marked complete. Public application smoke checks and final health snapshot are recorded alongside this report.
