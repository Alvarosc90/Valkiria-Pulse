#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[mercadopago-setup] Missing $ENV_FILE. Run ./bootstrap-env.sh first." >&2
  exit 1
fi

chmod 600 "$ENV_FILE"

read -r -s -p "MERCADOPAGO_ACCESS_TOKEN: " MP_TOKEN
printf '\n'
read -r -s -p "MERCADOPAGO_WEBHOOK_SECRET: " MP_WEBHOOK
printf '\n'

if [[ -z "$MP_TOKEN" || -z "$MP_WEBHOOK" ]]; then
  echo "[mercadopago-setup] Both credentials are required." >&2
  exit 1
fi

python3 - "$ENV_FILE" "$MP_TOKEN" "$MP_WEBHOOK" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
replacements = {
    "MERCADOPAGO_ACCESS_TOKEN": sys.argv[2],
    "MERCADOPAGO_WEBHOOK_SECRET": sys.argv[3],
    "MERCADOPAGO_MODE": "production",
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

unset MP_TOKEN
unset MP_WEBHOOK

chmod 600 "$ENV_FILE"

echo "[mercadopago-setup] Mercado Pago production credentials stored in $ENV_FILE."
echo "[mercadopago-setup] Running security preflight..."
./security-preflight.sh "$ENV_FILE"
echo "[mercadopago-setup] PASS. Restart/deploy PULSE to load the new credentials."
