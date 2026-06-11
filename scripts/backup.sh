#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/var/lib/awx/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/forail_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "==> Starting backup..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
    -h "${POSTGRES_HOST:-postgres}" \
    -p "${POSTGRES_PORT:-5432}" \
    -U "${POSTGRES_USER:-forail}" \
    -d "${POSTGRES_DB:-forail}" \
    | gzip > "${BACKUP_FILE}"

echo "==> Backup saved to ${BACKUP_FILE}"

echo "==> Removing backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "forail_backup_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "==> Current backups:"
ls -lh "${BACKUP_DIR}"/forail_backup_*.sql.gz 2>/dev/null || echo "    (none)"

echo "==> Backup complete."
