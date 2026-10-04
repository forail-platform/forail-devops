#!/bin/bash
# Back up the Forail database.
#
#   docker compose exec -T forail-task bash /etc/forail/backup.sh
#
# Writes, in $BACKUP_DIR (the forail_backups volume):
#   forail_backup_<timestamp>.dump   pg_dump custom format (compressed)
#   forail_backup_<timestamp>.meta   what restore.sh checks before it touches anything
#
# The database is not the whole backup. Credentials, tokens and other secrets
# in it are encrypted with FORAIL_SECRET_KEY; without that key a restored
# database cannot decrypt any of them. Keep .env (or at least
# FORAIL_SECRET_KEY) with the backups, somewhere else than this host.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/lib/awx/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
STAMP=$(date +%Y%m%d_%H%M%S)
BASE="${BACKUP_DIR}/forail_backup_${STAMP}"

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"
PGARGS=(-h "${POSTGRES_HOST:-postgres}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-forail}" -d "${POSTGRES_DB:-forail}")

mkdir -p "${BACKUP_DIR}"
umask 077  # the dump holds encrypted secrets and every user's data

echo "==> Starting backup..."
# Write to a temporary name first: an interrupted dump must never look like
# the latest good backup to restore.sh.
pg_dump "${PGARGS[@]}" --format=custom --compress=6 --file="${BASE}.dump.partial"
mv "${BASE}.dump.partial" "${BASE}.dump"

last_migration=$(psql "${PGARGS[@]}" -At -c "SELECT max(name) FROM django_migrations WHERE app = 'main'")
key_fingerprint=$(printf '%s' "${FORAIL_SECRET_KEY:-${AWX_SECRET_KEY:-}}" | sha256sum | cut -c1-16)
{
    echo "created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "forail_version=$(forail-manage version 2>/dev/null || echo unknown)"
    echo "last_main_migration=${last_migration}"
    echo "secret_key_sha256_16=${key_fingerprint}"
} > "${BASE}.meta"

echo "==> Backup saved to ${BASE}.dump"

echo "==> Removing backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" \( -name 'forail_backup_*.dump' -o -name 'forail_backup_*.meta' -o -name 'forail_backup_*.sql.gz' \) -mtime "+${RETENTION_DAYS}" -delete

echo "==> Current backups:"
ls -lh "${BACKUP_DIR}"/forail_backup_*.dump 2>/dev/null || echo "    (none)"

echo "==> Backup complete."
