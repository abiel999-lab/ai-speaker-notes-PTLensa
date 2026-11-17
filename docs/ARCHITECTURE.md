# NotePreso ecosystem — production inventory, 17 November 2026

This repository consolidates the deployed NotePreso ecosystem. Production services were inspected through SSH and Docker. This commit is a source/runtime snapshot; it does not deploy or restart services.

| Directory | Responsibility | Technology / provenance |
|---|---|---|
| app | Speaker notes, account/credits, payments, UI | Python/FastAPI; deployed app container |
| admin | Administration, billing and operational tools | Python/FastAPI; deployed phase9h admin |
| presentation/runtime-app | Presentation Generator web/API, deployed frontend and backend | React/Vite compiled frontend; Fastify/Node compiled backend |
| presentation/runtime-worker | Background presentation processing | Node, BullMQ/Redis, PostgreSQL |
| presentation/source-baseline-9f | Available original editable TypeScript source | Historical 9f.1 baseline, NOT identical to current production |
| translation | PowerPoint Translator UI/API and translation engine | Python/FastAPI, OpenAI, session authentication |
| website-home | Landing-page service | FastAPI/Jinja; deployed image |
| website-support | Contact/support service | FastAPI/Jinja; includes active bind-mounted support template |
| support-ai | Existing internal support AI API and knowledge documents | Python API; runtime-mounted source |
| identity/themes | Keycloak login themes | Active theme files; realm import and secrets excluded |
| deploy/current/nginx.conf | HTTPS routing and service boundaries | Active nginx configuration; TLS keys excluded |

## Request flow

Browser → nginx → website / speaker-notes / presentation API / translator / support.
Keycloak provides login. Python services and presentation services use PostgreSQL; presentation app submits background work through Redis/BullMQ to its worker. Jobs, uploads and generated files live outside Git. Existing support-ai is internal; Cekat.AI integration is not implemented by this synchronization.

## Source completeness and build limitations

Current deployed Python application files and compiled Presentation app/worker files are captured. A filesystem search found only the older 9f.1 editable TypeScript baseline. Do not rebuild production from that baseline and expect current behavior. Recover the latest original TypeScript repository before changing the Presentation build pipeline. Runtime package scripts reference source files not shipped in runtime images. Existing Dockerfiles can depend on private local base images. This snapshot therefore does not claim a fully reproducible clean build.

Root app/admin content overlays the existing repository; historical tests and deployment files remain for context and may predate deployed source. All new services have separate directories. Historical Git history is preserved. Dependencies/node_modules, databases, user uploads, generated jobs, private keys, environment files, platform secret JSON and monitoring tokens are excluded.

## Validation

All Python files were parsed with ast.parse. Snapshot JavaScript is checked with node --check. SHA-256 inventory is in docs/production-manifest.json. Pattern-based credential scanning was reviewed: matches were environment-variable database URLs, translation labels and test fixtures; no credential values are intentionally included. These checks do not replace integration tests or a clean deployment rehearsal.
