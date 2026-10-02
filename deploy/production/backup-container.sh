#!/bin/sh
set -eu

BACKUP_DIR="${PULSE_BACKUP_DIR:-/backups}"
RETENTION_DAYS="${PULSE_BACKUP_RETENTION_DAYS:-14}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
PREFIX="pulse-${STAMP}"
DB_SQL="${BACKUP_DIR}/${PREFIX}.sql"
DB_GZ="${DB_SQL}.gz"
MEDIA_GZ="${BACKUP_DIR}/${PREFIX}-media.tar.gz"
MANIFEST="${BACKUP_DIR}/${PREFIX}.sha256"
LAST_SUCCESS="${BACKUP_DIR}/.last_success"

umask 027
mkdir -p "$BACKUP_DIR"

cleanup() {
  rm -f "$DB_SQL"
}
trap cleanup EXIT INT TERM

echo "[PULSE backup] starting ${STAMP}"

MYSQL_PWD="${PULSE_DB_ROOT_PASSWORD}" mysqldump   --host="${DB_HOST:-mysql}"   --port="${DB_PORT:-3306}"   --user=root   --single-transaction   --quick   --routines   --triggers   --events   --set-gtid-purged=OFF   "${DB_NAME:-valkiria_pulse}" > "$DB_SQL"

gzip -9 "$DB_SQL"

tar -czf "$MEDIA_GZ" -C /media .

(
  cd "$BACKUP_DIR"
  sha256sum "${PREFIX}.sql.gz" "${PREFIX}-media.tar.gz" > "${PREFIX}.sha256"
  sha256sum -c "${PREFIX}.sha256"
)

gzip -t "$DB_GZ"
tar -tzf "$MEDIA_GZ" >/dev/null

date -u +%s > "$LAST_SUCCESS"
find "$BACKUP_DIR" -type f -name 'pulse-*' -mtime "+$RETENTION_DAYS" -delete

echo "[PULSE backup] complete ${PREFIX}"
