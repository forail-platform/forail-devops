#!/bin/bash
set -e

echo "==> Waiting for database..."
until forail-manage check_db --skip-checks 2>/dev/null; do
    echo "    Database not ready, retrying in 3s..."
    sleep 3
done
echo "==> Database is ready."

echo "==> Running migrations..."
forail-manage migrate --skip-checks --noinput

echo "==> Creating/updating admin user..."
# Create the superuser if it does not exist.
forail-manage createsuperuser --skip-checks --noinput \
    --username "${FORAIL_ADMIN_USER:-admin}" \
    --email "${FORAIL_ADMIN_EMAIL:-admin@example.com}" 2>/dev/null || true

# Always reset the password to match the env var.
forail-manage update_password --skip-checks \
    --username "${FORAIL_ADMIN_USER:-admin}" \
    --password "${FORAIL_ADMIN_PASSWORD:?FORAIL_ADMIN_PASSWORD is required}"

echo "==> Provisioning instance..."
NODE_NAME="${FORAIL_NODE_NAME:-$(hostname)}"
NODE_TYPE="${FORAIL_NODE_TYPE:-hybrid}"

forail-manage provision_instance --skip-checks \
    --hostname="${NODE_NAME}" \
    --node_type="${NODE_TYPE}"

echo "==> Registering queues..."
forail-manage register_queue --skip-checks --queuename=controlplane --instance_percent=100
forail-manage register_queue --skip-checks --queuename=default      --instance_percent=100

echo "==> Creating preload data..."
forail-manage create_preload_data --skip-checks 2>/dev/null || true

echo "==> Registering default execution environments..."
forail-manage register_default_execution_environments --skip-checks

echo "==> Setting CSRF trusted origins..."
CSRF_ORIGINS="${FORAIL_CSRF_TRUSTED_ORIGINS:-https://localhost,https://localhost:8043}"
forail-manage shell -c "
from forail.conf.models import Setting
origins = '${CSRF_ORIGINS}'.split(',')
Setting.objects.update_or_create(key='CSRF_TRUSTED_ORIGINS', defaults={'value': origins})
print('CSRF_TRUSTED_ORIGINS set to:', origins)
"

echo "==> Clearing AWX isolation show paths..."
# upstream forail/settings/production.py hardcodes two CentOS CA-trust
# bind mounts (/etc/pki/ca-trust and /usr/share/pki). These paths do
# not exist on our Ubuntu-based forail-backend image so podman dies with
# 'mounting overlay failed "/usr/share/pki": no such file or directory'
# the instant an EE container tries to start. AWX_ISOLATION_SHOW_PATHS
# is DB-backed (editable in admin UI), so we blank it here. Operators
# that need custom CA trust can repopulate it from the UI with paths
# that actually exist inside the forail-backend image.
forail-manage shell -c "
from forail.conf.models import Setting
Setting.objects.update_or_create(key='AWX_ISOLATION_SHOW_PATHS', defaults={'value': []})
print('AWX_ISOLATION_SHOW_PATHS set to []')
"

echo "==> Initialization complete."
