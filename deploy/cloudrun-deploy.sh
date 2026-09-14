#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID first}"
REGION="${REGION:-asia-southeast2}"
SERVICE="${SERVICE:-ai-speaker-notes-backend}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-ai-speaker-notes-run}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com

if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" --display-name="AI Speaker Notes Cloud Run"
fi

for secret in openai-api-key ai-speaker-auth-password ai-speaker-session-secret; do
  gcloud secrets describe "$secret" >/dev/null
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" >/dev/null
 done

echo "Deploying $SERVICE to Cloud Run in $REGION..."
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --service-account "$SERVICE_ACCOUNT_EMAIL" \
  --cpu 1 \
  --memory 2Gi \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 1 \
  --no-cpu-throttling \
  --timeout 900 \
  --set-env-vars "APP_ENV=production,STORAGE_DIR=/tmp/ai-speaker-jobs,MAX_UPLOAD_MB=25,MAX_ZIP_ENTRIES=10000,MAX_UNCOMPRESSED_MB=500,ALLOW_EMBEDDED_OBJECTS=false,JOB_RETENTION_HOURS=2,MAX_CONCURRENT_JOBS=1,MAX_ACTIVE_JOBS_PER_USER=2,AUTH_ENABLED=true,AUTH_USERNAME=admin,SESSION_HOURS=8,TERMS_VERSION=2026-09-13,REQUIRE_TERMS_ACCEPTANCE=true,FRONTEND_ORIGINS=https://demo.studioimpactid.com,SLIDE_RENDERER=libreoffice,LIBREOFFICE_BIN=auto,RENDER_DPI=120,OPENAI_MODEL=gpt-5.6-sol,OPENAI_REASONING_EFFORT=medium,OPENAI_USE_VISION=true,OPENAI_IMAGE_DETAIL=auto,OPENAI_BATCH_SIZE=4,OPENAI_TIMEOUT_SECONDS=120,OPENAI_MAX_RETRIES=2,OPENAI_SEMANTIC_RETRIES=2,OPENAI_RESUME_CHECKPOINTS=true,OPENAI_VISION_FALLBACK_TO_TEXT=true,OPENAI_MAX_SLIDES_PER_JOB=80,OPENAI_MAX_VISION_SLIDES_PER_JOB=60,OPENAI_MAX_SOURCE_CHARS_PER_JOB=180000,OPENAI_MAX_ESTIMATED_JOB_COST_USD=1.00,OPENAI_VISION_ESTIMATED_INPUT_TOKENS_PER_SLIDE=1100,OPENAI_CHAT_MODEL=gpt-5.6-sol,OPENAI_CHAT_REASONING_EFFORT=medium,CHAT_MAX_MESSAGE_CHARS=2000,CHAT_MAX_TURNS_PER_JOB=20,CHAT_MAX_CONTEXT_SLIDES=12,CHAT_MAX_HISTORY_MESSAGES=10,CHAT_MAX_OUTPUT_TOKENS=1400,OPENAI_INPUT_USD_PER_MTOK=4.00,OPENAI_OUTPUT_USD_PER_MTOK=20.00" \
  --set-secrets "OPENAI_API_KEY=openai-api-key:latest,AUTH_PASSWORD=ai-speaker-auth-password:latest,SESSION_SECRET=ai-speaker-session-secret:latest"

gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
