AI Speaker Notes v1.0.0 - Authenticated Header UI Patch

Changes:
- Replaces the plain "username · Keluar" control with a compact account chip and a separate polished logout button.
- Adds user initials/avatar.
- Makes Dashboard, Chat AI, Cara Pakai, and Legal consistent.
- Keeps the existing data-logout behavior; no authentication logic is replaced.
- Adds responsive behavior for mobile.
- Passes username into How-to and Legal template contexts.
- Bumps app.css cache key to v=1001 in patched templates.

Apply from project root:
  Expand-Archive .\AI_Speaker_Notes_Header_User_Logout_Patch.zip -DestinationPath . -Force

Then rebuild only the app container:
  docker compose --env-file .\.env.local-stack -f .\docker-compose.local.yml -f .\docker-compose.local-keycloak.yml -p aispeakernotes-local up -d --build app
