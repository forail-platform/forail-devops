#!/bin/bash
# Restore the Forail database from a backup made by backup.sh.
#
# Stop everything that writes to the database first, then run this in a
# one-off container -- the forail-task container is one of the writers:
#
#   docker compose stop forail-web forail-task
#   docker compose run --rm --no-deps forail-task bash /etc/forail/restore.sh --yes [FILE]
#   docker compose up -d
#
# FILE defaults to the newest backup in $BACKUP_DIR. The current database is
# replaced, not merged, and kept under another name until you drop it. Exits
# non-zero, and changes nothing, if any step fails.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/lib/awx/backups}"
CONFIRMED=no
IGNORE_KEY=no
FILE=""
for arg in "$@"; do
    case "$arg" in
        --yes) CONFIRMED=yes ;;
        --ignore-secret-key-mismatch) IGNORE_KEY=yes ;;
        -*) echo "Unknown option: $arg" >&2; exit 2 ;;
        *) FILE="$arg" ;;
    esac
done

if [ -z "$FILE" ]; then
    FILE=$(ls -t "${BACKUP_DIR}"/forail_backup_*.dump "${BACKUP_DIR}"/forail_backup_*.sql.gz 2>/dev/null | head -1 || true)
    [ -n "$FILE" ] || { echo "ERROR: no backup given and none found in ${BACKUP_DIR}" >&2; exit 1; }
    echo "==> No file given, using the newest: ${FILE}"
fi
[ -f "$FILE" ] || { echo "ERROR: backup not found: ${FILE}" >&2; exit 1; }

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set}"
PGARGS=(-h "${POSTGRES_HOST:-postgres}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-forail}")
DB="${POSTGRES_DB:-forail}"

# A database restored under a different FORAIL_SECRET_KEY comes up fine and
# then fails on every credential, token and encrypted setting.
META="${FILE%.*}.meta"
if [ -f "$META" ]; then
    want=$(sed -n 's/^secret_key_sha256_16=//p' "$META")
    have=$(printf '%s' "${FORAIL_SECRET_KEY:-${AWX_SECRET_KEY:-}}" | sha256sum | cut -c1-16)
    if [ -n "$want" ] && [ "$want" != "$have" ] && [ "$IGNORE_KEY" != yes ]; then
        echo "ERROR: this backup was taken with a different FORAIL_SECRET_KEY." >&2
        echo "       Set the original key in .env before restoring, or every stored credential" >&2
        echo "       will be unreadable. --ignore-secret-key-mismatch restores anyway." >&2
        exit 1
    fi
    echo "==> Backup metadata:"; sed 's/^/    /' "$META"
else
    echo "==> No metadata next to ${FILE}; cannot check FORAIL_SECRET_KEY."
fi

active=$(psql "${PGARGS[@]}" -d "$DB" -At -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")
if [ "$active" != 0 ]; then
    echo "ERROR: ${active} other connection(s) to ${DB}. Stop forail-web and forail-task first:" >&2
    echo "       docker compose stop forail-web forail-task" >&2
    exit 1
fi

if [ "$CONFIRMED" != yes ]; then
    echo "This REPLACES the database ${DB} with ${FILE}. Re-run with --yes to proceed." >&2
    exit 1
fi

# Restore into a fresh database and swap it in by renaming. pg_restore
# --clean cannot drop Forail's partitioned event tables, and a failed load
# must not leave a half-restored database behind. The current database is
# kept, renamed, until you drop it.
STAMP=$(date +%Y%m%d_%H%M%S)
NEW="${DB}_restoring"
OLD="${DB}_before_restore_${STAMP}"
admin() { psql "${PGARGS[@]}" -d postgres -v ON_ERROR_STOP=1 -q -c "$1"; }

echo "==> Restoring ${FILE} into a new database ${NEW}..."
admin "DROP DATABASE IF EXISTS \"${NEW}\""
admin "CREATE DATABASE \"${NEW}\""
cleanup() { admin "DROP DATABASE IF EXISTS \"${NEW}\"" || true; }
trap 'echo "ERROR: restore failed; ${DB} is unchanged." >&2; cleanup' ERR
case "$FILE" in
    *.dump)
        pg_restore "${PGARGS[@]}" -d "$NEW" --no-owner --exit-on-error "$FILE"
        ;;
    *.sql.gz)
        # Plain dumps from the old backup.sh.
        gunzip -c "$FILE" | psql "${PGARGS[@]}" -d "$NEW" -v ON_ERROR_STOP=1 -q
        ;;
    *) echo "ERROR: unknown backup format: ${FILE}" >&2; false ;;
esac
trap - ERR

echo "==> Swapping: ${DB} -> ${OLD}, ${NEW} -> ${DB}"
admin "ALTER DATABASE \"${DB}\" RENAME TO \"${OLD}\""
admin "ALTER DATABASE \"${NEW}\" RENAME TO \"${DB}\""

echo "==> The previous database is kept as ${OLD}. Once the restore is verified:"
echo "    docker compose exec postgres psql -U ${POSTGRES_USER:-forail} -d postgres -c 'DROP DATABASE \"${OLD}\"'"
echo "==> Restore complete. Start the stack: docker compose up -d"
echo "    If the backup is from an older Forail, forail-init applies the migrations on start."
