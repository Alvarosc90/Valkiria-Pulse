#!/bin/sh
set -eu

INTERVAL="${PULSE_BACKUP_INTERVAL_SECONDS:-86400}"
MIN_INTERVAL=3600

case "$INTERVAL" in
  *[!0-9]*|"") INTERVAL=86400 ;;
esac

if [ "$INTERVAL" -lt "$MIN_INTERVAL" ]; then
  INTERVAL="$MIN_INTERVAL"
fi

while true; do
  if /usr/local/bin/pulse-backup; then
    :
  else
    echo "[PULSE backup] failed; retrying in 1 hour" >&2
    sleep 3600
    continue
  fi
  sleep "$INTERVAL"
done
