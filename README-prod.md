# Forail — Production Docker Compose

Standalone production deployment for Forail (based on AWX). No Ansible templating, no source code mounts — just a pre-built image, configuration files, and `docker compose up`.

## Architecture

```
                    ┌─────────────┐
                    │    nginx    │ :80/:443 (TLS)
                    └──────┬──────┘
                           │ proxy_pass
                    ┌──────┴──────┐
                    │  forail-web  │ :8013 (internal nginx)
                    │ uwsgi:8050  │ → uwsgi_pass
                    │ daphne:8051 │ → WebSocket proxy
                    └──────┬──────┘
                           │ shared DB/Redis
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴────┐ ┌────┴───┐ ┌─────┴─────┐
        │forail-task │ │postgres│ │   redis   │
        │receptor   │ │  :5432 │ │   :6379   │
        │dispatcher │ └────────┘ └───────────┘
        │receiver   │
        │wsrelay    │
        └───────────┘
```

**Startup sequence:** postgres → redis → forail-init (migrate, admin, provision) → forail-web → forail-task → nginx

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A built Forail image (pull from `ghcr.io/forail-platform/forail-backend` and `ghcr.io/forail-platform/forail-frontend`)
- TLS certificate and private key (for production HTTPS)

## Quick Start

```bash
cd tools/docker-compose-prod

# 1. Create and edit .env
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, FORAIL_SECRET_KEY, FORAIL_ADMIN_PASSWORD, etc.

# 2. Place TLS certificates
cp /path/to/fullchain.pem nginx/ssl/fullchain.pem
cp /path/to/privkey.pem   nginx/ssl/privkey.pem

# 3. Start all services
docker compose up -d

# 4. Check status
docker compose ps
docker compose logs -f forail-init   # Watch migrations
```

The UI will be available at `https://<your-host>/`.

## TLS Setup

Place your certificate files in `nginx/ssl/`:
- `fullchain.pem` — full certificate chain
- `privkey.pem` — private key

For a self-signed certificate (testing only):

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/privkey.pem \
    -out nginx/ssl/fullchain.pem \
    -subj "/CN=forail.local"
```

## Backup & Restore

### Backup

```bash
docker compose exec forail-task bash /etc/forail/backup.sh
```

Or run directly from the host:

```bash
docker compose exec postgres pg_dump -U forail forail | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore

```bash
# Using the restore script (restores latest backup automatically)
docker compose exec forail-task bash /etc/forail/restore.sh

# Or specify a backup file
docker compose exec forail-task bash /etc/forail/restore.sh /var/lib/awx/backups/forail_backup_20260101_120000.sql.gz
```

Or restore directly from the host:

```bash
gunzip -c backup_20260101.sql.gz | docker compose exec -T postgres psql -U forail forail
```

## Upgrade Procedure

```bash
# 1. Backup the database
docker compose exec postgres pg_dump -U forail forail | gzip > pre_upgrade_backup.sql.gz

# 2. Pull / build the new image
# Edit .env — update FORAIL_TAG
docker compose pull forail-web forail-task forail-init

# 3. Restart (init will run migrations automatically)
docker compose down
docker compose up -d

# 4. Verify
docker compose ps
curl -k https://localhost/api/v2/ping/
```

## Useful Commands

```bash
# View logs
docker compose logs -f forail-web
docker compose logs -f forail-task

# Django management commands
docker compose exec forail-web forail-manage shell
docker compose exec forail-web forail-manage check_instance_ready

# Restart a single service
docker compose restart forail-web
```

## Configuration Files

| File | Purpose |
|------|---------|
| `settings/database.py` | PostgreSQL connection (reads env vars) |
| `settings/redis_settings.py` | Redis broker, cache, channel layers (TCP) |
| `settings/secret_key.py` | Django SECRET_KEY (from env var) |
| `settings/websocket_secret.py` | Broadcast WebSocket secret |
| `settings/settings.py` | Root Django settings (required by Forail settings loader) |
| `settings/custom_settings.py` | ALLOWED_HOSTS, CSRF, session security, cluster ID |
| `settings/nginx-internal.conf` | Internal nginx (uwsgi + daphne routing) |
| `nginx/nginx.conf` | External nginx (TLS termination) |
| `receptor/receptor.conf` | Receptor hybrid node config |

## Troubleshooting

### `No configuration found at /etc/tower/settings.py`

The Forail settings loader expects `/etc/tower/settings.py` to exist. This file is mounted from `settings/settings.py` — ensure the volume mount is present for all Forail services.

### Django system check errors (models.E016)

Forail uses Django multi-table inheritance (polymorphic models). Fields like `status` live on the parent `UnifiedJob` table, not on child tables (`Job`, `WorkflowJob`). The `--skip-checks` flag is used in init and healthcheck scripts to bypass these warnings in non-standard deployments.

### `Socket path does not exist: /var/run/awx-receptor/receptor.sock`

The task container requires the Receptor mesh networking daemon. In production builds, receptor runs as a supervised process inside the forail-task container (managed by supervisord). Ensure the image was built with the receptor binary included.

### Kubernetes pod listing errors in forail-task logs

```
kubernetes.config.config_exception.ConfigException: Service host/port is not set.
```

This is expected in Docker Compose deployments. The Forail scheduler tries to list pods for container groups but finds no Kubernetes API — this is harmless and can be ignored.

### `Registering with values from settings only intended for use in K8s installs`

Set `AWX_AUTO_DEPROVISION_INSTANCES = True` in `settings/custom_settings.py` (already configured by default). This allows instance auto-registration in non-Kubernetes deployments.
