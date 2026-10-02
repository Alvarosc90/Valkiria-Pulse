#!/bin/sh
set -eu

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 /opt/valkiria-pulse/backups/pulse-YYYYMMDDTHHMMSSZ.sql.gz" >&2
  exit 2
fi

DB_GZ="$1"
BASE=${DB_GZ%.sql.gz}
MEDIA_GZ="${BASE}-media.tar.gz"
MANIFEST="${BASE}.sha256"

for file in "$DB_GZ" "$MEDIA_GZ" "$MANIFEST"; do
  if [ ! -f "$file" ]; then
    echo "Missing backup artifact: $file" >&2
    exit 1
  fi
done

BACKUP_DIR=$(CDPATH= cd -- "$(dirname -- "$DB_GZ")" && pwd)
DB_NAME=$(basename "$DB_GZ")
MEDIA_NAME=$(basename "$MEDIA_GZ")
MANIFEST_NAME=$(basename "$MANIFEST")

(
  cd "$BACKUP_DIR"
  sha256sum -c "$MANIFEST_NAME"
)

gzip -t "$DB_GZ"
tar -tzf "$MEDIA_GZ" >/dev/null

NAME="pulse-restore-smoke-$$"
PASS="restore-smoke-$$-$(date +%s)"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "[PULSE restore test] starting temporary MySQL"
docker run -d --rm   --name "$NAME"   -e MYSQL_ROOT_PASSWORD="$PASS"   -e MYSQL_DATABASE=pulse_restore_test   mysql:8.4 >/dev/null

attempt=0
until docker exec -e MYSQL_PWD="$PASS" "$NAME" mysql -N -uroot -e 'SELECT 1' >/dev/null 2>&1; do
  attempt=$((attempt+1))
  if [ "$attempt" -ge 40 ]; then
    echo "Temporary MySQL did not become ready" >&2
    docker logs "$NAME" 2>&1 | tail -n 80 >&2 || true
    exit 1
  fi
  sleep 2
done

echo "[PULSE restore test] importing database backup"
gunzip -c "$DB_GZ" | docker exec -i -e MYSQL_PWD="$PASS" "$NAME" mysql -uroot pulse_restore_test

TABLES=$(docker exec -e MYSQL_PWD="$PASS" "$NAME" mysql -N -uroot pulse_restore_test -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema="pulse_restore_test";')
if [ "${TABLES:-0}" -lt 1 ]; then
  echo "Restore completed but no tables were found" >&2
  exit 1
fi

echo "[PULSE restore test] PASS tables=$TABLES media archive readable"
