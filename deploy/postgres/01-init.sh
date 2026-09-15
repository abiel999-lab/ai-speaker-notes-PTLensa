#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=app_pass="$APP_DB_PASSWORD" --set=kc_pass="$KEYCLOAK_DB_PASSWORD" <<'EOSQL'
CREATE ROLE ai_speaker_notes LOGIN PASSWORD :'app_pass';
CREATE DATABASE ai_speaker_notes OWNER ai_speaker_notes;
CREATE ROLE keycloak LOGIN PASSWORD :'kc_pass';
CREATE DATABASE keycloak OWNER keycloak;
EOSQL
