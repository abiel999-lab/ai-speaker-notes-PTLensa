# Deployment — AI Speaker Notes v0.2.8

## Recommended topology

For v0.2.8, serve **both the UI and API from the same Cloud Run service**. This keeps the signed login cookie, CSRF protection, Chat AI, downloads, and job ownership on one origin and avoids fragile cross-origin authentication.

The bundled `local-mvp/frontend-hostinger/` remains a legacy split-frontend fallback. Do not use that static fallback with `AUTH_ENABLED=true` unless you deliberately rework its credentialed CORS/login flow.

## Production safety defaults

- Public Cloud Run endpoint protected by application login.
- `AUTH_PASSWORD`, `SESSION_SECRET`, and `OPENAI_API_KEY` are stored in Secret Manager.
- HttpOnly, `SameSite=Strict`, Secure session cookie in production.
- Session-bound CSRF header for mutating APIs.
- Max Cloud Run instances: 1 (important because v0.2.8 still uses local file storage/in-process locks).
- Concurrency: 1.
- Max upload: 25 MB in the provided deploy script.
- Macro and embedded OLE/package objects blocked.
- AI/Vision/context/cost/chat limits enabled.
- LibreOffice headless renderer.

## First deployment

Create/select a Google Cloud project, enable Billing, open Cloud Shell, and upload/extract the backend source.

Create the required secrets once:

```bash
read -s -p "OpenAI API key: " OPENAI_KEY; echo
printf %s "$OPENAI_KEY" | gcloud secrets create openai-api-key --data-file=-
unset OPENAI_KEY

read -s -p "Choose the AI Speaker Notes login password: " AUTH_PASSWORD; echo
printf %s "$AUTH_PASSWORD" | gcloud secrets create ai-speaker-auth-password --data-file=-
unset AUTH_PASSWORD

python - <<'PY' >/tmp/session-secret.txt
import secrets
print(secrets.token_urlsafe(48), end="")
PY
gcloud secrets create ai-speaker-session-secret --data-file=/tmp/session-secret.txt
rm -f /tmp/session-secret.txt
```

Set project and deploy:

```bash
export PROJECT_ID="YOUR_GOOGLE_CLOUD_PROJECT_ID"
export REGION="asia-southeast2"
./deploy/cloudrun-deploy.sh
```

The deploy script uses `AUTH_USERNAME=admin`. Change that env value in the script or Cloud Run configuration if needed.

## Verify

Open the Cloud Run URL in a browser. You should be redirected to `/login`.

Health endpoints remain available for monitoring:

```bash
curl https://YOUR-CLOUD-RUN-URL/health/live
curl https://YOUR-CLOUD-RUN-URL/health/ready
```

After login, verify:

1. Dashboard loads with the white/green v0.2.8 UI.
2. `/how-to` and `/legal` render.
3. A small PPTX completes successfully.
4. Download works.
5. Chat AI can be opened from the result.
6. Manual job deletion removes the job from history.
7. Logout returns to `/login`.

## Important storage limitation

Cloud Run local `/tmp` storage is ephemeral. v0.2.8 intentionally keeps `--max-instances 1` to avoid cross-instance job races. This is suitable for a controlled MVP/demo, not a multi-tenant production platform. A larger deployment should move job metadata/files to durable shared storage and use a database/queue/distributed lock/rate limiter.
