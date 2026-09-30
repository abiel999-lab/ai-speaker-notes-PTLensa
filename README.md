# NotePreso / AI Speaker Notes

Production source monorepo for the NotePreso platform.

## Applications

### `app/`

Main user-facing application deployed at:

- https://notepreso.com

This service handles PowerPoint processing, AI speaker-note generation,
AI Chat, user authentication, subscriptions, support, and the user interface.

### `admin/`

Administrative application deployed at:

- https://admin.notepreso.com

The admin service is deployed independently from the main application.

### `deploy/`

Non-secret deployment documentation and examples.

## Architecture

The user application and administration application share one source
repository but remain separate production services and Docker workloads.

## Security

This repository must not contain production credentials.

Do not commit:

- `.env` files.
- OpenAI API keys.
- Database passwords.
- Keycloak/OIDC client secrets.
- Xendit or Paddle secrets.
- SMTP credentials.
- Session/JWT secrets.
- Private keys.
- Production runtime job data.

Environment example files may contain placeholders only.
