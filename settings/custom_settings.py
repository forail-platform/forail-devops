import os

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('FORAIL_ALLOWED_HOSTS', os.environ.get('AWX_ALLOWED_HOSTS', '*')).split(',')]

_trusted = os.environ.get('FORAIL_CSRF_TRUSTED_ORIGINS', os.environ.get('AWX_CSRF_TRUSTED_ORIGINS', ''))
if _trusted:
    CSRF_TRUSTED_ORIGINS = [o.strip() for o in _trusted.split(',')]

# Set to False for local dev with Vite proxy (HTTP)
SESSION_COOKIE_SECURE = os.environ.get('FORAIL_COOKIE_SECURE', os.environ.get('AWX_COOKIE_SECURE', 'True')).lower() in ('true', '1')
CSRF_COOKIE_SECURE = os.environ.get('FORAIL_COOKIE_SECURE', os.environ.get('AWX_COOKIE_SECURE', 'True')).lower() in ('true', '1')

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Internal broadcast uses plain HTTP between containers.
BROADCAST_WEBSOCKET_PORT = 8013
BROADCAST_WEBSOCKET_PROTOCOL = 'http'
BROADCAST_WEBSOCKET_VERIFY_CERT = False

SYSTEM_UUID = '00000000-0000-0000-0000-000000000000'

CLUSTER_HOST_ID = os.environ.get('FORAIL_NODE_NAME', os.environ.get('AWX_NODE_NAME', 'forail-node'))

# Required for non-K8s deployments to allow task startup auto-registration
AWX_AUTO_DEPROVISION_INSTANCES = True

# NOTE: AWX_ISOLATION_SHOW_PATHS is a database-backed Setting, so a value
# here is silently overridden by what init.sh writes into the Setting
# table. See scripts/init.sh for the actual source of truth.
