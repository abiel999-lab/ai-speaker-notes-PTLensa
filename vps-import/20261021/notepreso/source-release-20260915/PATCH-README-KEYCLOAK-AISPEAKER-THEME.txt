AI Speaker Notes - Keycloak Login Theme Patch
============================================

This overlay replaces the current login theme with a split-screen design matching the visual direction of the Lensa IoT login while keeping AI Speaker Notes-specific copy.

Included:
- Custom template.ftl wrapper shared by login/reset-password/OTP/required-action pages.
- Responsive split-screen CSS.
- Existing Lensa Lingkungan logo retained.
- English + Indonesian message overrides.
- Local Keycloak compose override with theme cache disabled for development.

Apply from the project root by extracting this ZIP with overwrite enabled.
Then restart local Keycloak:

  docker compose `
    --env-file .\.env.local-stack `
    -f .\docker-compose.local.yml `
    -f .\docker-compose.local-keycloak.yml `
    -p aispeakernotes-local `
    restart keycloak

Wait ~15 seconds and hard refresh the login page (Ctrl+F5) or use Incognito:
  http://localhost:8082/auth/realms/aispeaker/account/

No database reset is required.
