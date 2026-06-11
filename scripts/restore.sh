#!/bin/bash
set -e

BACKUP_DIR="${BACKUP_DIR:-/var/lib/awx/backups}"
BACKUP_FILE="${1}"

if [ -z "${BACKUP_FILE}" ]; then
    BACKUP_FILE=$(ls -t "${BACKUP_DIR}"/forail_backup_*.sql.gz 2>/dev/null | head -1)
    if [ -z "${BACKUP_FILE}" ]; then
        echo "ERROR: No backup file specified and no backups found in ${BACKUP_DIR}"
        exit 1
    fi
    echo "==> No file specified, using latest: ${BACKUP_FILE}"
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "ERROR: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "==> Restoring from ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    -h "${POSTGRES_HOST:-postgres}" \
    -p "${POSTGRES_PORT:-5432}" \
    -U "${POSTGRES_USER:-forail}" \
    -d "${POSTGRES_DB:-forail}"

echo "==> Restore complete."
