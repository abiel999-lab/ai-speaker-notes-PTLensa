#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.prod ]]; then
  echo "Missing .env.prod. Copy deploy/production.env.example to .env.prod and fill secrets." >&2
  exit 1
fi

if grep -q 'CHANGE_ME' .env.prod; then
  echo ".env.prod still contains CHANGE_ME values." >&2
  exit 1
fi

set -a
source .env.prod
set +a

COMPOSE="docker compose --env-file .env.prod -f docker-compose.production.yml"

$COMPOSE build --pull app
$COMPOSE up -d postgres
$COMPOSE up -d keycloak
$COMPOSE up -d app

sleep 5
curl -fsS http://127.0.0.1:8000/health/ready | python3 -m json.tool

echo
$COMPOSE ps
