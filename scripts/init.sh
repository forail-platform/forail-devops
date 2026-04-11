#!/bin/bash
set -e

echo "==> Waiting for database..."
until forge-manage check_db --skip-checks 2>/dev/null; do
    echo "    Database not ready, retrying in 3s..."
    sleep 3
done
echo "==> Database is ready."

echo "==> Running migrations..."
forge-manage migrate --skip-checks --noinput

echo "==> Creating/updating admin user..."
# Create the superuser if it does not exist.
forge-manage createsuperuser --skip-checks --noinput \
    --username "${FORGE_ADMIN_USER:-admin}" \
    --email "${FORGE_ADMIN_EMAIL:-admin@example.com}" 2>/dev/null || true

# Always reset the password to match the env var.
forge-manage update_password --skip-checks \
    --username "${FORGE_ADMIN_USER:-admin}" \
    --password "${FORGE_ADMIN_PASSWORD:?FORGE_ADMIN_PASSWORD is required}"

echo "==> Provisioning instance..."
NODE_NAME="${FORGE_NODE_NAME:-$(hostname)}"
NODE_TYPE="${FORGE_NODE_TYPE:-hybrid}"

forge-manage provision_instance --skip-checks \
    --hostname="${NODE_NAME}" \
    --node_type="${NODE_TYPE}"

echo "==> Registering queues..."
forge-manage register_queue --skip-checks --queuename=controlplane --instance_percent=100
forge-manage register_queue --skip-checks --queuename=default      --instance_percent=100

echo "==> Creating preload data..."
forge-manage create_preload_data --skip-checks 2>/dev/null || true

echo "==> Registering default execution environments..."
forge-manage register_default_execution_environments --skip-checks

echo "==> Setting CSRF trusted origins..."
CSRF_ORIGINS="${FORGE_CSRF_TRUSTED_ORIGINS:-https://localhost,https://localhost:8043}"
forge-manage shell -c "
from forge.conf.models import Setting
origins = '${CSRF_ORIGINS}'.split(',')
Setting.objects.update_or_create(key='CSRF_TRUSTED_ORIGINS', defaults={'value': origins})
print('CSRF_TRUSTED_ORIGINS set to:', origins)
"

echo "==> Initialization complete."
