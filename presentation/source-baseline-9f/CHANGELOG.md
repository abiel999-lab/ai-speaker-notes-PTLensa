## 1.0.0-dev.9e — Creative images and content navigation (2026-10-19)

- Add private multi-image selection, source-safe image composition, native scrim gradient edges and per-generation asset descriptions.
- Enforce optional exact slide counts and export bounded internal source-text links plus topic-menu footer navigation, preserving all source wording.
- Verify actual PPTX hyperlink relationships and fully decode preview PNGs; retry one damaged raster page before publishing previews.
- Keep Luna-only routing and existing historical costs. Add owner/isolation, export, UI and raster-recovery coverage plus a disposable cached-plan PostgreSQL/Redis acceptance path.

## 1.0.0-dev.9d.1 — Luna-only model policy (2026-10-19)

- Lock new Creative requests to GPT-6 Luna in the core provider call and worker usage observer, including older Premium settings.
- Remove the Premium selector and Astra capability; retain composition/motion features and historical cost records.

## 1.0.0-dev.9d — Premium Creative and native motion (2026-10-19)

- Add explicit Astra Premium / Luna Efficient composition choices; new Creative work selects Premium with published cost disclosure. Preserve existing model settings and historical exports.
- Strengthen art direction, native shape vocabulary, text alignment and visual hierarchy; reject source-crossing decorations and correct text contrast against composited panels.
- Export macro-free fade/wipe entrances, fade/push/wipe transitions and source-safe internal slide navigation. Preview images and PDFs remain static.
- Keep full source text and ordering; add per-model rate snapshots without revaluing old Luna events. No new database schema or API key changes.
- Validate native motion with Microsoft Open XML SDK and LibreOffice render/roundtrip. Real account Astra quality and desktop PowerPoint playback require local acceptance.

## 1.0.0-dev.9c.2 — Estimated USD (2026-10-19)

- Display per-version and daily estimated API USD next to token counts, including partial/unknown cost and sub-micro-dollar formatting.
- Add schema v7 price snapshots with verified Luna rates, known cache reads/writes, supported processing tiers and per-request long-context pricing. Preserve historical estimates rather than repricing old usage.
- Commit usage and cost atomically, retain owner isolation and add disposable PostgreSQL acceptance for USD/idempotency/unknown records.
- Keep the exporter static; full animation/interactive PowerPoint testing requires a later motion feature. VPS/admin work remains pending.

## 1.0.0-dev.9c.1 — Login origin and safe diagnostics (2026-10-19)

- Canonicalize login to APP_ORIGIN before setting a host-only flow cookie, preventing localhost/127.0.0.1 mismatch while retaining allowlisted return paths.
- Return/log fixed authentication failure reasons with a request ID, without exception messages, callback parameters, claims, tokens or credentials.
- Preserve signature, issuer/audience/nonce/state/PKCE validation and single-use login flows. Require fresh real Keycloak and Google acceptance; no schema, provider configuration, AI, VPS or admin changes.

## 1.0.0-dev.9c — Product modes and token visibility (2026-10-19)

- Fix the customer UI to English and request English from the existing Keycloak login.
- Separate editable Template mode from custom geometry Creative AI mode, with preview/download-only controls and server-enforced mutation protection for Creative jobs.
- Add transactional Template text revisions and verified rebuilt exports without AI calls; retain earlier source/export snapshots.
- Add an owner-scoped token ledger, safe historical import and visible per-version/daily input/output totals, including reported failures/repairs and explicit unknown usage.
- Keep public deployment disabled pending real-account Creative AI and PowerPoint acceptance. See docs/PHASE9C_PRODUCT_MODES.md.

## 1.0.0-dev.9b.2 — Guide page and account names (2026-10-18)

- Replace the How to Use modal with a dedicated `/app/how-to` page, active navigation, browser history and retained workspace state.
- Store and refresh bounded display names from verified ID-token claims; use subject-checked UserInfo when the token lacks a full name.
- Expose account name in the session/navbar, with verified email secondary in the account menu. Identity remains issuer/sub; existing IDs, creation dates, projects and quotas are preserved.

## 1.0.0-dev.9b.1 — Workspace navbar hotfix (2026-10-18)

- Replace Home with a local How to Use guide plus existing NotePreso Support/Legal links; no AI Chat navigation.
- Keep release information beneath the brand, put usage inside the account menu, and align account/logout/create/language controls.
- Use a bounded desktop grid and compact mobile controls; preserve drafts when opening help or external links.

## 1.0.0-dev.9b — Local beta hardening (2026-10-18)

- Commit per-owner admission, daily quota reservations and latest-generation linking atomically; serialize admission/deletion to prevent orphan jobs.
- Fence worker updates with renewable database leases; write attempt-specific artifacts and reconcile committed jobs into Redis after delivery failures.
- Coordinate request limits in Redis, paginate/filter/search project metadata on the server, and show daily account usage.
- Add schema v5 without adopting legacy owners or rewriting existing exports. Include disposable PostgreSQL/Redis integration acceptance in the local installer.
- Direct Keycloak login remains; production/public origins remain blocked. See docs/PHASE9B_BETA_HARDENING.md for recovery, billing and rollback limits.

## 1.0.0-dev.9a.1 — Direct login hotfix (2026-10-18)
- Redirect anonymous workspace visits to Keycloak without an intermediate sign-in page.
- Redirect expired sessions automatically; preserve allowlisted text/topic creation routes after login.
- Retain CSRF, server-side sessions and owner protection. Update local acceptance for both local and OIDC modes.

## 1.0.0-dev.9a — Phase 9A (2026-10-18)
- Add optional local OIDC beta using openid-client, PKCE/state/nonce, signature-validated ID tokens and hashed server-side session identifiers.
- Require origin and CSRF checks for authenticated mutations. Keep existing local owner and projects untouched.
- Enforce atomic daily per-account generation and AI-attempt counters in SQLite/PostgreSQL. Do not interpret these as billing reconciliation.
- Keep APP_MODE=production and non-loopback APP_ORIGIN disabled. Real Keycloak, Docker and PostgreSQL/Redis integration require local acceptance before VPS work.

## 1.0.0-dev.8g — Phase 8G (2026-10-16)
- Keep statement typography limited to single concise paragraph slides so mixed bullet/paragraph content stays readable.
- Replace bars that resemble unsupported data graphics with restrained non-data geometric ornament on cover/section/true statement slides.
- Add heterogeneous source-preservation and editable-PPTX scenarios across genres.
- Continue Luna-only AI planning; no live public auth, chart data inference, or VPS changes.

## v1.0.0-dev.8f — Phase 8F (2026-10-16)

- Adaptive editable two- and three-column cards for compatible editorial source lists; source IDs, source order, source characters, and manual positions are preserved.
- Full-width native bibliography rows for URL reference slides, with safe overflow fallback.
- New regression checks for 27-slide Pemda, multiple themes, PPTX export, and content-preserving transformations.
- No model, secret, database, login, subscription, or public VPS changes; Luna remains the sole AI model.

## 1.0.0-dev.8e — Phase 8E (16 October 2026)

- Added native PowerPoint three-step flow diagrams and source-ordered timelines for compatible short lists, leaving longer content unchanged.
- Preserved text source IDs, grouping, export, speaker notes and manual source-position overrides; connectors and panels are editable native PowerPoint shapes.
- Kept GPT-6 Luna as sole AI model, with stricter presentation-layout guidance only, and no invented data charts.
- Added regression tests covering structural diagrams, fallbacks, manual edits, source fidelity and native PPTX.

## 1.0.0-dev.8d — Evidence-driven visual composition (Phase 8D)

- Opening paragraph can become an editorial two-zone hero without inventing a title or changing source text.
- Title-only/section slides use high-contrast native PowerPoint styling while retaining separator markers verbatim.
- Safe list slides adopt responsive editable two-column cards when they fit. Overlong lists remain in the original layout.
- Manual source offsets remain authoritative; visual cards are skipped on explicitly positioned slides.
- GPT-6 Luna-only AI planning and strict source/export validation remain unchanged.
- Inspired by Phase 8C 27-slide visual evidence; this release is not a full AI illustration or native chart engine.

## 1.0.0-dev.8a — Phase 8A (2026-10-16)

- Introduce editable native PowerPoint shape grammar for process/timeline/card, column, editorial, and chapter layouts.
- Add text-free slide progress rail for long educational decks, with strict original text fidelity unchanged.
- Add explicit opt-in local AI live acceptance test for Pak Arie's identical Pemda sample; reject AI fallback rather than counting a rules-generated PPTX as an AI success.
- All existing services, authentication restrictions, API key handling and source-byte integrity preserved.

## 1.0.0-dev.7f — Phase 7F (2026-10-16)

- Convert homepage navbar from non-sticky to a floating sticky pill as users scroll, matching the current NotePreso interaction pattern.
- Keep the at-top navbar minimal, preserve three-column alignment and the existing /app navigation unchanged.
- Respect reduced motion and retain animated illustrative slide previews.
- Frontend-only update; no database, AI, PPTX, worker, or production integration changes.

## 1.0.0-dev.7e — Phase 7E (2026-10-16)

- Harmonize non-sticky homepage and workspace navigation width, menu placement, and responsive breakpoints.
- Make illustrative homepage demo rotate through three slides automatically; manual slide selection, hover/focus pause, and reduced-motion support.
- Keep the illustrative-label and original functionality intact; no backend, AI, or persisted data changes.

## 1.0.0-dev.7d — Phase 7D (2026-10-15)

- Simplified static homepage navbar inspired by the existing NotePreso visual language (no sticky header).
- Added a centered, high-contrast homepage hero and an illustrative PowerPoint editor/sample chart.
- Preserved the existing functioning TXT/Markdown workspace route and AI topic-draft route; no fake homepage upload or public login.
- Simplified workspace navigation; version/What's New moves into the primary navbar. Dashboard uses document scrolling.
- No changes to API, worker, database, slide verification, or PowerPoint generation.

## 1.0.0-dev.7c (2026-10-15) — Phase 7C canvas positioning

- Added opt-in visual selection and dragging of source-anchored text/table blocks on slide canvas.
- Accessible arrow-key nudging and step size respected; no source mutation, source protection unchanged.
- All design edits remain staged until applied and go through server-side layout validation and PPTX export.
- Added release metadata, geometry and interaction regression tests.

## 1.0.0-dev.7b — Super MVP Phase 7B (2026-10-15)

- Application version prominently shown on homepage and workspace.
- Clickable, bilingual What's New history.
- Precise block movement increments: 0.05 / 0.10 / 0.25 inches.
- Version synchronized across package, Compose image, and health endpoint.

# Changelog

## 1.0.0 — Local MVP release candidate

- Completed the source-locked workflow from TXT/Markdown import through editable PPTX, rendered PDF, and downloadable validation report.
- Added ten safe layouts, six palettes, four composition systems, presentation-purpose metadata, and reusable local brand presets.
- Added full-deck AI planning and constrained per-slide AI restyling with explicit used/fallback traces.
- Added per-slide owner-scoped photographs with server-side decoding, normalization, and export embedding.
- Added automatic overlap, overflow, minimum-font, source coverage, order, duplication, and OOXML checks.
- Added recoverable design drafts, source-boundary outline controls, keyboard undo/redo, version timeline, and restore-as-new-version.
- Retained the localhost-only security boundary; Keycloak and public deployment remain intentionally deferred.

## 0.3.0 — Presentation Studio

- Added a source-locked outline editor with split, merge, and safe boundary controls.
- Added per-slide AI restyling through a constrained metadata-only schema.
- Added explicit AI used/fallback feedback without exposing provider responses.
- Added recoverable design drafts in session storage; source text is never stored there.
- Replaced the compact version selector with a readable recent-version timeline.
- Added keyboard undo/redo and expanded accessibility labels.
- Preserved exact source coverage and order across every new operation.

## 0.2.0 — Local Studio

The original app could generate/export a deck but layout changes regenerated everything, fallback AI usage was hard to identify, and generic errors hid the failing operation. v0.2.0 separates source lifecycle, design preview, and export jobs. Manual previews consume no OpenAI calls; Apply creates a new verified source snapshot.

The UI now includes a homepage preview, project library, six themes/four composition styles, responsive editor panes, typography/accent controls, split/merge, undo/redo, image controls, version review, present mode, and PDF export from actual rendering.

Autosave is serialized with revision/conflict checks. Error messages include stable codes. Local admin provides read-only job/model/token telemetry and is disabled in production. ioredis is a runtime dependency. Source fidelity and owner preservation remain mandatory. Login/public access are deferred to the domain/Keycloak stage.

## 0.1.1

Removed local login and kept the existing workspace owner's projects. A subsequent dependency fix added ioredis@5.8.2 for Redis/BullMQ.

## 0.1.0

Initial TXT/Markdown source ledger, deterministic/AI layout plans, native PowerPoint export, fidelity checking, and converter-based previews.

## Phase 1 source patch (14 October 2026 — not a production release)

- Replaces user sidebar with extracted, responsive top navigation.
- Adds an actionable source composer to dashboard and moves local admin to its own sidebar.
- Refuses unauthenticated production mode and strengthens source/build context exclusions.
- Adds regression checks and documentation in `docs/PHASE1_FOUNDATION.md`.
- Preserves source-fidelity, generation, existing data, and export logic unchanged.

## 1.0.0-dev.8b — Luna-only source-locked visual planning

- All server AI calls use GPT-6 Luna, overriding deprecated local `OPENAI_MODEL` and client model settings.
- Source block IDs and groupings are locked by the deterministic planner; Luna selects layout metadata only.
- Strict live QA now verifies `gpt-6-luna` actually produced the plan; no rules fallback accepted.
- No database migrations or production VPS changes.
