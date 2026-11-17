# Contact form — live delivery test

PASS: one authorized synthetic Integration QA submission reached billing@actiacarbon.com INBOX.

- Reference: SUP-F71EBB1DAA
- Form response: HTTP 200
- Submission count: 1; earlier execution failed at import before making a request.
- Delivery: 17 November 2026, 16:10:56 Asia/Jakarta (09:10:56 UTC).
- Postfix queue: 15ED6289B8E6; status=sent; DSN2.0.0.
- Dovecot: stored mail into mailbox INBOX. Exact subject reference verified with doveadm search.
- Synthetic content only: no customer data, documents, credentials, payment details, or account-change request.
- Message remains in INBOX for owner review; not deleted and not replied to.

This closes actual contact-form email delivery verification. It does not resolve the incorrect existing healthcheck endpoint, Cekat entitlements/default language/session reliability, or pending payment sandbox/live Keycloak/device tests. Website production code, main branch and widget cutover remain unchanged.
