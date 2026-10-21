#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -x .venv/bin/python ]]; then
  echo "Virtual environment not found. Run ./scripts/setup.sh first." >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

HOST="${APP_HOST:-127.0.0.1}"
PORT="${APP_PORT:-8000}"
ARGS=("-m" "uvicorn" "app.main:app" "--host" "$HOST" "--port" "$PORT")
if [[ "${1:-}" == "--reload" ]]; then
  ARGS+=("--reload")
fi

echo "Starting AI Speaker Notes MVP..."
echo "Open: http://${HOST}:${PORT}"
exec .venv/bin/python "${ARGS[@]}"
