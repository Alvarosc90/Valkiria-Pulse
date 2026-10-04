#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[security-preflight] FAIL: missing $ENV_FILE" >&2
  exit 1
fi

failures=0
warnings=0

fail() {
  echo "[security-preflight] FAIL: $*" >&2
  failures=$((failures+1))
}

warn() {
  echo "[security-preflight] WARN: $*" >&2
  warnings=$((warnings+1))
}

value_of() {
  local key="$1"
  awk -F= -v key="$key" '$1==key {sub(/^[^=]*=/,""); value=$0} END {print value}' "$ENV_FILE"
}

require_secret() {
  local key="$1"
  local min_length="$2"
  local value
  value="$(value_of "$key")"
  if [[ -z "$value" || "$value" == CHANGE_ME* ]]; then
    fail "$key is missing or still uses a placeholder"
    return
  fi
  if (( ${#value} < min_length )); then
    fail "$key must be at least $min_length characters"
  fi
}

mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)"
if [[ -n "$mode" ]]; then
  world_digit="${mode: -1}"
  group_digit="${mode: -2:1}"
  if (( 10#$world_digit != 0 )); then
    fail "$ENV_FILE is accessible by other users (mode $mode)"
  fi
  if (( 10#$group_digit != 0 )); then
    warn "$ENV_FILE is group-accessible (mode $mode); 600 is preferred"
  fi
fi

require_secret DB_PASSWORD 16
require_secret PULSE_DB_ROOT_PASSWORD 16
require_secret AUTH_ACCESS_SECRET 32
require_secret AUTH_REFRESH_SECRET 32
require_secret CREDENTIALS_ENCRYPTION_KEY 32

access_secret="$(value_of AUTH_ACCESS_SECRET)"
refresh_secret="$(value_of AUTH_REFRESH_SECRET)"
encryption_secret="$(value_of CREDENTIALS_ENCRYPTION_KEY)"

if [[ -n "$access_secret" && "$access_secret" == "$refresh_secret" ]]; then
  fail "access and refresh JWT secrets must be different"
fi
if [[ -n "$encryption_secret" && ( "$encryption_secret" == "$access_secret" || "$encryption_secret" == "$refresh_secret" ) ]]; then
  fail "credential encryption key must be independent from JWT secrets"
fi

app_url="$(value_of APP_URL)"
api_url="$(value_of API_URL)"
oauth_url="$(value_of OAUTH_PUBLIC_BASE_URL)"
public_base_url="$(value_of PUBLIC_BASE_URL)"
for value in "$app_url" "$api_url" "$oauth_url" "$public_base_url"; do
  if [[ "$value" != https://* ]]; then
    fail "production public URLs must use HTTPS"
  fi
done

cors="$(value_of CORS_ORIGIN)"
if [[ "$cors" != *"https://pulse.valkiria.tech"* ]]; then
  fail "CORS_ORIGIN must include https://pulse.valkiria.tech"
fi
if [[ "$cors" == *"trycloudflare.com"* ]]; then
  fail "temporary trycloudflare origins are forbidden in production CORS"
fi

signup_enabled="$(value_of PUBLIC_SIGNUP_ENABLED)"
email_verification="$(value_of REQUIRE_EMAIL_VERIFICATION)"
if [[ "$signup_enabled" != "true" ]]; then
  warn "PUBLIC_SIGNUP_ENABLED is not true; public acquisition will be disabled"
fi
if [[ "$email_verification" != "true" ]]; then
  fail "REQUIRE_EMAIL_VERIFICATION must be true for production public signup"
fi

smtp_host="$(value_of SMTP_HOST)"
smtp_from="$(value_of SMTP_FROM)"
smtp_user="$(value_of SMTP_USER)"
smtp_password="$(value_of SMTP_PASSWORD)"
if [[ -z "$smtp_host" || -z "$smtp_from" ]]; then
  fail "SMTP_HOST and SMTP_FROM are required for production email verification"
fi
if [[ -n "$smtp_user" && -z "$smtp_password" ]]; then
  fail "SMTP_PASSWORD is required when SMTP_USER is configured"
fi

llm_provider="$(value_of PULSE_LLM_PROVIDER)"
llm_base_url="$(value_of PULSE_LLM_BASE_URL)"
llm_api_key="$(value_of PULSE_LLM_API_KEY)"
llm_model="$(value_of PULSE_LLM_MODEL)"
llm_concurrency="$(value_of PULSE_LLM_MAX_CONCURRENCY)"
if [[ "$llm_provider" == "openai" ]]; then
  if [[ "$llm_base_url" != "https://api.openai.com" && "$llm_base_url" != "https://api.openai.com/" && "$llm_base_url" != "https://api.openai.com/v1" ]]; then
    fail "PULSE_LLM_BASE_URL must point to the official OpenAI API when PULSE_LLM_PROVIDER=openai"
  fi
  if [[ -z "$llm_model" ]]; then
    fail "PULSE_LLM_MODEL is required when OpenAI is enabled"
  fi
  if [[ -z "$llm_api_key" || "$llm_api_key" == CHANGE_ME* ]]; then
    fail "PULSE_LLM_API_KEY is required when OpenAI is enabled"
  fi
  if [[ -z "$llm_concurrency" ]]; then
    fail "PULSE_LLM_MAX_CONCURRENCY is required when OpenAI is enabled"
  fi
elif [[ -n "$llm_base_url" || -n "$llm_model" ]]; then
  warn "AI model endpoint is configured with provider '$llm_provider'; verify pricing fields match that provider"
else
  warn "AI generation is disabled; agents will use deterministic fallback"
fi

mp_token="$(value_of MERCADOPAGO_ACCESS_TOKEN)"
mp_webhook="$(value_of MERCADOPAGO_WEBHOOK_SECRET)"
mp_mode="$(value_of MERCADOPAGO_MODE)"
if [[ "$mp_mode" != "production" ]]; then
  fail "MERCADOPAGO_MODE must be production before accepting real payments"
fi
if [[ -z "$mp_token" ]]; then
  fail "MERCADOPAGO_ACCESS_TOKEN is required for PULSE production billing"
fi
if [[ -z "$mp_webhook" ]]; then
  fail "MERCADOPAGO_WEBHOOK_SECRET is required for PULSE production billing"
fi

if command -v docker >/dev/null 2>&1; then
  if ! docker compose config -q >/dev/null 2>&1; then
    fail "docker compose configuration is invalid"
  fi

  mysql_id="$(docker compose ps -q mysql 2>/dev/null || true)"
  api_id="$(docker compose ps -q api 2>/dev/null || true)"
  web_id="$(docker compose ps -q web 2>/dev/null || true)"

  mysql_port=""
  api_port=""
  web_port=""
  [[ -z "$mysql_id" ]] || mysql_port="$(docker port "$mysql_id" 3306/tcp 2>/dev/null || true)"
  [[ -z "$api_id" ]] || api_port="$(docker port "$api_id" 4200/tcp 2>/dev/null || true)"
  [[ -z "$web_id" ]] || web_port="$(docker port "$web_id" 80/tcp 2>/dev/null || true)"

  [[ -z "$mysql_port" ]] || fail "MySQL must not publish a host port ($mysql_port)"
  [[ -z "$api_port" ]] || fail "API must not publish a host port ($api_port)"
  if [[ -n "$web_port" && "$web_port" != 127.0.0.1:* && "$web_port" != "[::1]:"* ]]; then
    fail "web must bind only to loopback ($web_port)"
  fi
fi

backup_dir="$(value_of PULSE_BACKUP_DIR)"
backup_dir="${backup_dir:-/opt/valkiria-pulse/backups}"
if [[ -f "$backup_dir/.last_success" ]]; then
  if ! find "$backup_dir/.last_success" -mmin -1560 -print -quit | grep -q .; then
    fail "latest backup health marker is older than 26 hours"
  fi
else
  warn "backup health marker is missing at $backup_dir/.last_success"
fi

if (( failures > 0 )); then
  echo "[security-preflight] FAILED: $failures failure(s), $warnings warning(s)" >&2
  exit 1
fi

echo "[security-preflight] PASS: 0 failures, $warnings warning(s)"
