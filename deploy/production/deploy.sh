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

echo "[deploy] Waiting for API health"
attempt=0
until curl -fsS http://127.0.0.1:"${PULSE_HTTP_PORT:-8081}"/health >/dev/null 2>&1; do
  attempt=$((attempt+1))
  if [[ "$attempt" -ge 45 ]]; then
    echo "[deploy] Health check timed out" >&2
    docker compose ps
    docker compose logs --tail=120 api worker
    exit 1
  fi
  sleep 2
done

docker compose ps
echo "[deploy] PULSE runtime is healthy on loopback port ${PULSE_HTTP_PORT:-8081}"
