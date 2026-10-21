#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
set -a; source .env.prod; set +a
mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose --env-file .env.prod -f docker-compose.production.yml exec -T postgres \
  pg_dump -U postgres -Fc ai_speaker_notes > "backups/ai-speaker-notes-${stamp}.dump"
docker compose --env-file .env.prod -f docker-compose.production.yml exec -T postgres \
  pg_dump -U postgres -Fc keycloak > "backups/keycloak-${stamp}.dump"
echo "Database backups written under backups/. App file storage is in Docker volume app_data and should also be snapshotted by the VPS backup system."
