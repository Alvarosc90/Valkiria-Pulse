#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE="${1:-.env}"
TEMPLATE=".env.example"

if [[ -e "$ENV_FILE" ]]; then
  echo "[bootstrap-env] Refusing to overwrite existing $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$TEMPLATE" ]]; then
  echo "[bootstrap-env] Missing $TEMPLATE" >&2
  exit 1
fi

command -v openssl >/dev/null 2>&1 || {
  echo "[bootstrap-env] openssl is required" >&2
  exit 1
}

cp "$TEMPLATE" "$ENV_FILE"
chmod 600 "$ENV_FILE"

random_hex() {
  openssl rand -hex "$1"
}

random_b64_32() {
  openssl rand -base64 32 | tr -d '\n'
}

DB_PASSWORD="$(random_hex 24)"
ROOT_PASSWORD="$(random_hex 24)"
ACCESS_SECRET="$(random_hex 32)"
REFRESH_SECRET="$(random_hex 32)"
CREDENTIAL_KEY="$(random_b64_32)"
SSO_SECRET="$(random_hex 32)"

python3 - "$ENV_FILE"   "$DB_PASSWORD"   "$ROOT_PASSWORD"   "$ACCESS_SECRET"   "$REFRESH_SECRET"   "$CREDENTIAL_KEY"   "$SSO_SECRET" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
replacements = {
    "DB_PASSWORD": sys.argv[2],
    "PULSE_DB_ROOT_PASSWORD": sys.argv[3],
    "AUTH_ACCESS_SECRET": sys.argv[4],
    "AUTH_REFRESH_SECRET": sys.argv[5],
    "CREDENTIALS_ENCRYPTION_KEY": sys.argv[6],
    "TRAINIA_SSO_SECRET": sys.argv[7],
}

lines = path.read_text(encoding="utf-8").splitlines()
out = []
seen = set()

for line in lines:
    if "=" not in line or line.lstrip().startswith("#"):
        out.append(line)
        continue
    key, _ = line.split("=", 1)
    if key in replacements:
        out.append(f"{key}={replacements[key]}")
        seen.add(key)
    else:
        out.append(line)

for key, value in replacements.items():
    if key not in seen:
        out.append(f"{key}={value}")

path.write_text("\n".join(out) + "\n", encoding="utf-8")
PY

echo "[bootstrap-env] Created $ENV_FILE with generated database, JWT, credential-encryption and TrainIA SSO secrets."
echo "[bootstrap-env] Permissions: $(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo unknown)"
echo "[bootstrap-env] Next: fill provider OAuth credentials and optional PULSE_LLM_* settings."
echo "[bootstrap-env] To copy the shared SSO value into TrainIA without printing other secrets:"
echo "  grep '^TRAINIA_SSO_SECRET=' $ENV_FILE"
