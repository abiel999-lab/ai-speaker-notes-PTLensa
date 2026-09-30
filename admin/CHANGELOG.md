# 1.1.0 - 2026-09-24

- Added read-only NotePreso Free/Pro subscription visibility to the administrator dashboard.
- User directory now shows effective plan, billing provider, paid-period validity, and billing state.
- User detail panel now shows plan, provider, validity, renewal status, and effective access.
- Overview now reports Free users, active Pro users, expiring Pro access, and expired Pro records.
- Effective plan mirrors the user application entitlement rule: expired or non-access-bearing Pro records fall back to Free.
- Subscription visibility remains payment-provider independent and supports Xendit, Stripe, Paddle, manual access, and future providers without duplicating plan data in Keycloak.
- Legacy databases without a `subscriptions` table remain supported and are treated as Free-only.

# v22 - Admin JavaScript bootstrap fix

- Removed `common.js` from the admin shell because it defines a global `t()` function used by the public app.
- Wrapped `admin.js` in its own IIFE so admin lexical bindings cannot collide with public-app globals.
- Fixes the silent browser SyntaxError `Identifier 't' has already been declared`, which prevented every `/api/v1/admin/*` fetch from starting and left KPI/user/activity panels stuck on loading placeholders.
- Bumped the admin JavaScript cache key to `v=2210`.

## v21 — 2026-09-21 — Fast production data path

- Reduced production PostgreSQL round trips for admin overview, user directory, and activity pages.
- Added one-checkout directory/activity snapshots for SSH-tunneled production databases.
- Switched external PostgreSQL reader to fresh connections (`NullPool`) to avoid stale sockets after SSH tunnel reconnects.
- Added a 2.5-second read cache for repeated KPI/directory loads.
- Presentations & Chat now loads users + jobs + chat metadata from one API request instead of issuing duplicate database requests.
- Keycloak directory enrichment no longer blocks the activity page and has a short client-side timeout.
- Added browser request timeouts so broken DB/Keycloak connections show a useful error instead of loading forever.
- Added server timing logs (`admin_directory_database`, `admin_activity_database`) for future diagnosis.

## v15 — 2026-09-21

- Fixed admin-to-user-app navigation so it no longer routes through the local admin server's normal-user OIDC callback.
- Added configurable `USER_APP_URL`; default points to the production AI Speaker Notes application.
- Updated both Unauthorized and sidebar user-app links.


## Admin Privacy Controls v13 — 2026-09-21
- Added per-user Presentations & Chat filtering.
- Changed admin chat listings to metadata-only by default.
- Added audited conversation reveal with required operational reason.
- Removed message-content previews from admin activity APIs.
- Reused audit_events for traceable privacy access without a schema migration.
# Changelog

## v12 - Admin Pages & Full-Height Navigation
- Added real `/admin/users` and `/admin/activity` pages.
- Fixed sidebar to remain full viewport height with no white gap.
- Added global presentation/chat activity views and database helpers.
- Made admin JavaScript page-aware and preserved user-management actions.

# v9 - OIDC session redirect fix

- Changed the application session cookie issued after Keycloak callbacks from SameSite=Strict to SameSite=Lax.
- Fixes successful Keycloak login looping back to login because the session cookie was withheld on the cross-site redirect chain.
- Added regression tests for both user and admin OIDC callback cookies.


## Local admin v6

- Added bounded OIDC clock-skew tolerance for Keycloak tokens (`KEYCLOAK_CLOCK_SKEW_SECONDS`, default 60 seconds).
- Prevents valid Keycloak logins from crashing when the local PC and Keycloak/VPS clocks differ by a few seconds.
- OIDC token validation errors now return a safe diagnostic instead of a raw 500 traceback.


## Local Admin hotfix - PowerShell compatibility

- Replaced `RandomNumberGenerator::Fill()` with `RandomNumberGenerator.Create().GetBytes()` so `run-admin-local.ps1` works on Windows PowerShell/.NET versions that do not expose the static `Fill` method.
# Changelog

## 2026-09-21 - Local admin direct Keycloak login

- Removed the application-owned login page from the Keycloak browser flow; protected pages now redirect straight to Keycloak.
- `/login` is retained only as a compatibility redirect.
- `/admin` now starts Keycloak login directly when there is no session and still returns 403 for authenticated non-admin users.
- Added regression tests for direct Keycloak redirects and OIDC state-cookie creation.
- Expanded the local admin setup guide with the exact callback URI and VPS PostgreSQL handoff notes.

## 1.0.0 — 2026-09-14

- Promoted hardened application from MVP line to production v1.0.0.
- Added PostgreSQL job metadata, user metadata, chat history, and audit persistence.
- Added Keycloak OIDC login using Authorization Code + PKCE.
- Added stable per-user ownership based on Keycloak subject.
- Added owner-partitioned durable file storage.
- Added Docker Compose production stack and Nginx deployment configuration.
- Added branded Keycloak login theme.
- Removed legacy fixed 60-slide Vision rejection; large decks use safe automatic batching.
- Fixed exact-slide RAG, same-slide follow-up, general chat mode, message length guard, and turn limit UX.
- Fixed duplicate output filename suffix.
- Improved hidden-slide status wording and append-mode preservation reporting.
- Finalized responsive white/green bilingual UI.


## Local admin data integration update

- The user-facing app and `/admin` use the same `DATABASE_URL`. Presentation history is stored in `jobs`; persistent AI chat is stored in `chat_threads` and `chat_messages`; login/application users are stored in `users`.
- `/admin` user detail now reads both presentation jobs and saved chat threads/messages for that Keycloak user subject.
- Admin access is granted only when the signed Keycloak token contains the configured `ADMIN_ROLE` (default `admin`). Username-based admin bypasses are not used.
- The local launcher can reuse the existing `KEYCLOAK_CLIENT_SECRET` from a sibling `ai-speaker-notes-mvp/.env` when the new `.env` still contains a placeholder. It never prints the secret.
- If Keycloak rejects the OIDC client credentials, the callback now returns a clear configuration error instead of an unhandled 500 traceback.

## v10 - Admin control center
- Reworked `/admin` into a conventional SaaS administration dashboard with a dedicated sidebar, sticky command bar, KPI cards, full user table, and user detail workspace.
- Added Keycloak management status indicator and clearer service-account permission diagnostics.
- Admin OIDC authentication now requests `prompt=login` so entering `/admin` re-prompts for administrator credentials even when a normal user SSO session already exists.
- Preserved role-based admin authorization, CSRF protection, PostgreSQL activity data, Keycloak CRUD, presentation history, and chat history.

## v11 admin visual refresh
- Redesigned the admin dashboard and added the Lensa Lingkungan logo.
- Preserved existing admin functionality while improving layout, hierarchy, cards, table, and detail panel.

## v14 - Admin unauthorized recovery
- Added a branded `/admin/unauthorized` page for authenticated accounts without the `admin` role.
- Added safe admin reauthentication that clears local auth, logs out the Keycloak SSO session, and returns to `/admin` for a fresh login.
- Added signed anti-CSRF restart token for the reauthentication form.
- Added `admin_login_denied` and `admin_reauthentication_requested` audit events when PostgreSQL is available.

## v16 - Admin Indonesian / English switcher
- Added persistent `ID / EN` language switcher to the admin command bar.
- Default admin language remains English; selection is saved locally in the browser.
- Added Indonesian translations for overview, user management, presentations/chat, privacy controls, modals, statuses, empty states, and common dynamic actions.
- Admin date/time formatting now follows the selected locale (`id-ID` or `en-US`).
- Language switching is admin-only and does not alter the user-facing AI Speaker Notes application.

## v17 - Admin auth recovery, fast Keycloak status, production activity DB bridge
- Admin sign-out now uses the dedicated `ai-speaker-admin-login` OIDC client instead of the normal user client.
- Clears all local OIDC/session cookies during admin logout to avoid stale callback/token state on the next sign-in.
- Access-token validation refreshes JWKS once and automatically restarts OIDC once on cryptographic validation failure.
- Login/audit DB write failures no longer turn a valid OIDC login into an Internal Server Error.
- Admin header no longer waits on a full Keycloak user listing before showing management readiness.
- Overview uses a lightweight summary endpoint and Keycloak `/users/count` rather than loading the full directory.
- Keycloak Admin API network timeouts are bounded to fail faster.
- Added optional `APPLICATION_DATABASE_URL` with a read-only legacy-schema-compatible adapter for production jobs/chat.
- Production activity data can be read without migrating the live `users` table.

## v18 - Admin logout and directory performance
- Made admin sign-out a native server-side POST flow instead of a JavaScript fetch dependency.
- Reused persistent HTTP connections and added a short cache for Keycloak user/count reads.
- Invalidates cached Keycloak users after create/update/ban/delete operations.
- Activity page now loads application data in parallel with the user directory.

## v20 - Resilient application database bridge
- Admin startup no longer fails when the external `APPLICATION_DATABASE_URL` SSH tunnel is temporarily unavailable.
- The read-only application database adapter now retries schema discovery lazily after the tunnel returns.
- Broken pooled PostgreSQL connections are disposed so later requests reconnect cleanly.
- External PostgreSQL connect timeout is bounded to 3 seconds.
- Activity database read failures now fail soft instead of terminating the FastAPI process.
