#!/bin/sh
# Nightly encrypted backups (#47). The dump is encrypted with age to public keys only, so
# the server can't read its own backups: the private key is kept offline (docs/DEPLOY.md).
#
#   backup schedule   every day at BACKUP_HOUR (UTC, default 3), for ever
#   backup once       one backup now
#
# Keeps 7 daily, 4 weekly (Sundays) and 6 monthly (the 1st) copies under BACKUP_REMOTE,
# an rclone remote and path, e.g. "backup:homeward-backups".
set -eu
set -o pipefail

: "${BACKUP_AGE_RECIPIENTS:?set BACKUP_AGE_RECIPIENTS: one or more age public keys}"
: "${BACKUP_REMOTE:?set BACKUP_REMOTE, e.g. backup:homeward-backups}"

log() { echo "$(date -u +%FT%TZ) $*"; }

once() {
  day=$(date -u +%F)
  name="homeward-$day.dump.age"
  file="/tmp/$name"
  set --
  for recipient in $BACKUP_AGE_RECIPIENTS; do set -- "$@" -r "$recipient"; done
  # Custom format: compressed, and pg_restore can pick tables out of it.
  pg_dump --format=custom --no-owner --no-privileges | age "$@" > "$file"
  rclone copyto "$file" "$BACKUP_REMOTE/daily/$name"
  if [ "$(date -u +%u)" = 7 ]; then rclone copyto "$file" "$BACKUP_REMOTE/weekly/$name"; fi
  if [ "$(date -u +%d)" = 01 ]; then rclone copyto "$file" "$BACKUP_REMOTE/monthly/$name"; fi
  size=$(wc -c < "$file")
  rm -f "$file"
  rclone delete --min-age 7d "$BACKUP_REMOTE/daily"
  rclone delete --min-age 28d "$BACKUP_REMOTE/weekly"
  rclone delete --min-age 183d "$BACKUP_REMOTE/monthly"
  log "backup $name uploaded ($size bytes)"
  # Optional: tell an uptime monitor the backup ran (#48).
  if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then wget -q -O /dev/null "$BACKUP_HEARTBEAT_URL" || true; fi
}

case "${1:-schedule}" in
  once) once ;;
  schedule)
    hour=${BACKUP_HOUR:-3}
    log "backups scheduled daily at $hour:00 UTC"
    while true; do
      now=$(date -u +%s)
      next=$(date -u -d "$(date -u +%F) $hour:00:00" +%s)
      if [ "$next" -le "$now" ]; then next=$((next + 86400)); fi
      sleep $((next - now))
      once || log "backup FAILED"
    done
    ;;
  *) exec "$@" ;;
esac
