#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "[deploy] Missing .env. Run ./bootstrap-env.sh first." >&2
  exit 1
fi

chmod 600 .env

echo "[deploy] Validating configuration"
docker compose config -q

echo "[deploy] Building images"
docker compose build

echo "[deploy] Starting database first"
docker compose up -d mysql

echo "[deploy] Starting API, worker, backup and web"
docker compose up -d api worker backup web

WEB_BIND="$(docker compose port web 80)"
WEB_PORT="${WEB_BIND##*:}"

if [[ ! "$WEB_PORT" =~ ^[0-9]+$ ]]; then
  echo "[deploy] Could not resolve published web port from: $WEB_BIND" >&2
  exit 1
fi

echo "[deploy] Waiting for API health through web port $WEB_PORT"
attempt=0
until curl -fsS "http://127.0.0.1:${WEB_PORT}/health" >/dev/null 2>&1; do
  attempt=$((attempt+1))
  if [[ "$attempt" -ge 45 ]]; then
    echo "[deploy] Health check timed out" >&2
    docker compose ps
    docker compose logs --tail=120 api worker
    exit 1
  fi
  sleep 2
done

echo "[deploy] Ensuring PULSE owner bootstrap"\ndocker compose exec -T api npm run owner:bootstrap --workspace @pulse/api\n\ndocker compose ps\necho "[deploy] PULSE runtime is healthy at http://127.0.0.1:${WEB_PORT}"\n