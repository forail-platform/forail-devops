# Forge Platform — Administrator Handbook

Operational guide for installing, running, and maintaining a Forge Platform deployment. Each section is step-by-step with concrete example values you can copy. Click any item in the table of contents to jump straight to it.

For day-to-day UI usage, see the companion [User Handbook](HANDBOOK.md).

---

## Table of Contents

### Install & First Boot
- [Prerequisites](#prerequisites)
- [Installation (Docker Compose)](#installation-docker-compose)
- [First-Time Setup](#first-time-setup)
- [TLS / SSL Setup](#tls--ssl-setup)
- [Initial Admin Hardening](#initial-admin-hardening)

### Day-2 Operations
- [Starting and Stopping the Stack](#starting-and-stopping-the-stack)
- [Inspecting Logs](#inspecting-logs)
- [Health Checks](#health-checks)
- [Backup](#backup)
- [Restore](#restore)
- [Upgrade](#upgrade)
- [Rolling Back](#rolling-back)

### Scaling & Topology
- [Adding an Execution Node](#adding-an-execution-node)
- [Adding a Hop Node](#adding-a-hop-node)
- [Tuning Capacity](#tuning-capacity)
- [Switching to Kubernetes](#switching-to-kubernetes)

### Observability
- [Enabling OpenTelemetry](#enabling-opentelemetry)
- [Grafana Dashboards](#grafana-dashboards)
- [Audit Log Export](#audit-log-export)

### Security
- [Rotating Secrets](#rotating-secrets)
- [User & SSO Setup](#user--sso-setup)
- [Firewall & Network Hardening](#firewall--network-hardening)
- [Security Updates](#security-updates)

### Troubleshooting
- [Stack Won't Come Up](#stack-wont-come-up)
- [Database Connection Errors](#database-connection-errors)
- [Jobs Stuck in Pending](#jobs-stuck-in-pending)
- [Receptor / Mesh Issues](#receptor--mesh-issues)
- [Frontend Returns 502](#frontend-returns-502)
- [Disk Filling Up](#disk-filling-up)
- [Reset Admin Password](#reset-admin-password)

### Reference
- [Service Map](#service-map)
- [Environment Variables](#environment-variables)
- [File Layout](#file-layout)

---

# INSTALL & FIRST BOOT

## Prerequisites

Hardware and software needed before installing Forge.

**Step by step**

1. Provision a host (VM or bare metal) with:
   - 4 vCPU, 8 GB RAM, 50 GB disk (minimum)
   - 8 vCPU, 16 GB RAM, 200 GB disk (recommended for production)
2. Install **Docker** ≥ 24 and **Docker Compose plugin** ≥ 2.20.
3. Open inbound ports **80** and **443** in your firewall.
4. Register a DNS A record pointing at the host (e.g. `forge.example.com`).
5. Make sure the system clock is in sync with NTP.

**Example — Ubuntu 24.04 fresh box**

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

---

## Installation (Docker Compose)

The standard installation uses the compose file shipped in this repo.

**Step by step**

1. Clone or copy `forge-deploy` to the target host:
   ```bash
   git clone https://github.com/forgeplatform/forge-deploy.git /opt/forge
   cd /opt/forge
   ```
2. Copy the example env file and edit it:
   ```bash
   cp .env.example .env
   $EDITOR .env
   ```
3. Fill in the **required** variables (see [Environment Variables](#environment-variables)).
4. Pull the images:
   ```bash
   docker compose pull
   ```
5. Bring the stack up:
   ```bash
   docker compose up -d
   ```
6. Tail the init container until it finishes:
   ```bash
   docker compose logs -f forge-init
   ```
7. When you see `==> Init complete.` you can hit `https://<your-host>` in a browser.

**Example `.env` for first install**

```ini
POSTGRES_PASSWORD=Sup3rS3cret-pg
FORGE_SECRET_KEY=$(openssl rand -hex 25)
FORGE_BROADCAST_WEBSOCKET_SECRET=$(openssl rand -hex 25)
FORGE_ADMIN_PASSWORD=ChangeMe!Now
FORGE_CSRF_TRUSTED_ORIGINS=https://forge.example.com
FORGE_ALLOWED_HOSTS=forge.example.com
FORGE_TAG=2026.04.0
```

> **Note:** generate the two random secrets with `openssl rand -hex 25` before pasting them into the file — do not leave the literal `$()` in `.env`.

---

## First-Time Setup

What to do the first time you log in.

**Step by step**

1. Open `https://forge.example.com`.
2. Log in as `admin` / your `FORGE_ADMIN_PASSWORD`.
3. Click **Settings → License** and upload the license file (if applicable).
4. Click **Settings → System** → set **Base URL** to `https://forge.example.com`.
5. Click **Organizations → Add** and create your first organization (e.g. `Platform`).
6. Click **Users → Add** and create at least one named admin (do not keep using the default `admin`).
7. Log out, log back in as the new admin, and disable the default admin from **Users → admin → Disable**.

**Example values**

| Field | Value |
|---|---|
| Base URL | `https://forge.example.com` |
| First org | `Platform` |
| Named admin | `krstan` / strong password |

---

## TLS / SSL Setup

Forge ships with a self-signed cert. Replace it with a real one before exposing the box.

**Step by step — Let's Encrypt with certbot**

1. Stop the nginx service so port 80 is free for the ACME challenge:
   ```bash
   docker compose stop nginx
   ```
2. Run certbot in standalone mode:
   ```bash
   sudo certbot certonly --standalone -d forge.example.com
   ```
3. Copy the new cert/key into the nginx mount point:
   ```bash
   sudo cp /etc/letsencrypt/live/forge.example.com/fullchain.pem nginx/ssl/forge.crt
   sudo cp /etc/letsencrypt/live/forge.example.com/privkey.pem   nginx/ssl/forge.key
   ```
4. Restart nginx:
   ```bash
   docker compose up -d nginx
   ```
5. Verify:
   ```bash
   curl -I https://forge.example.com
   ```

**Example renewal cron**

```cron
0 3 * * 1 certbot renew --pre-hook "docker compose -f /opt/forge/docker-compose.yml stop nginx" --post-hook "cp /etc/letsencrypt/live/forge.example.com/fullchain.pem /opt/forge/nginx/ssl/forge.crt && cp /etc/letsencrypt/live/forge.example.com/privkey.pem /opt/forge/nginx/ssl/forge.key && docker compose -f /opt/forge/docker-compose.yml up -d nginx"
```

---

## Initial Admin Hardening

Things every new install should do on day one.

**Step by step**

1. Change `FORGE_ADMIN_PASSWORD` in `.env` to a strong value, then `docker compose up -d forge-init` to apply.
2. In **Settings → Authentication**, disable any auth backend you don't use (LDAP, SAML, OIDC).
3. In **Settings → System**, enable **Session Cookie Secure** and set **Session Timeout** to `3600`.
4. Create at least two named admin users so no single account is the only way in.
5. Configure a [backup cron](#backup) before importing real data.
6. Configure at least one [Notification](HANDBOOK.md#notifications) channel for failure alerts.

---

# DAY-2 OPERATIONS

## Starting and Stopping the Stack

**Step by step**

```bash
# Start everything
docker compose up -d

# Stop everything (no data loss)
docker compose stop

# Stop and remove containers (data in volumes survives)
docker compose down

# Restart a single service
docker compose restart forge-web
```

**Example — restart only the task workers after editing settings**

```bash
docker compose restart forge-task
```

---

## Inspecting Logs

**Step by step**

```bash
# All services, follow
docker compose logs -f

# One service
docker compose logs -f forge-web

# Last 200 lines, no follow
docker compose logs --tail=200 forge-task

# Filter by timestamp
docker compose logs --since=1h forge-web
```

**Example — find the most recent error in the web service**

```bash
docker compose logs --since=24h forge-web | grep -i error | tail -20
```

---

## Health Checks

The stack ships with two healthcheck scripts you can run manually or from monitoring.

**Step by step**

```bash
# Web service
docker compose exec forge-web /scripts/healthcheck-web.sh

# Task service
docker compose exec forge-task /scripts/healthcheck-task.sh
```

**Example — uptime check from outside**

```bash
curl -fsS https://forge.example.com/api/v2/ping/ && echo OK
```

---

## Backup

Daily backups are mandatory. Forge ships `scripts/backup.sh` which dumps Postgres and rotates old archives.

**Step by step**

1. Run a one-off backup to verify it works:
   ```bash
   docker compose exec postgres /scripts/backup.sh
   ```
2. Inspect the result:
   ```bash
   ls -lh /var/lib/awx/backups/
   ```
3. Schedule a nightly cron on the host:
   ```cron
   0 2 * * * docker compose -f /opt/forge/docker-compose.yml exec -T postgres /scripts/backup.sh >> /var/log/forge-backup.log 2>&1
   ```
4. Copy the backups off-host (S3, rsync, etc.):
   ```cron
   30 2 * * * aws s3 sync /var/lib/awx/backups/ s3://acme-forge-backups/
   ```

**Example output**

```
==> Starting backup...
==> Backup saved to /var/lib/awx/backups/forge_backup_20260411_020000.sql.gz
==> Removing backups older than 7 days...
==> Backup complete.
```

> **Retention** is controlled by `BACKUP_RETENTION_DAYS` (default 7). Override in `.env` if you need longer.

---

## Restore

`scripts/restore.sh` reads a `.sql.gz` and pipes it back into Postgres.

**Step by step**

1. **Stop** the application services so nothing writes to the DB:
   ```bash
   docker compose stop forge-web forge-task
   ```
2. Run the restore (omit the filename to use the most recent backup):
   ```bash
   docker compose exec -T postgres /scripts/restore.sh /var/lib/awx/backups/forge_backup_20260411_020000.sql.gz
   ```
3. Restart the application:
   ```bash
   docker compose up -d forge-web forge-task
   ```
4. Verify in the UI: log in and check **Activity** for the expected history.

**Example — restore yesterday's backup**

```bash
docker compose stop forge-web forge-task
docker compose exec -T postgres /scripts/restore.sh
docker compose up -d forge-web forge-task
```

> **Warning:** Restore is destructive. The current database is **overwritten** by the dump. Always take a fresh backup *before* restoring an old one.

---

## Upgrade

Upgrading is a tag bump + pull + up.

**Step by step**

1. Read the [release notes](RELEASE_NOTES_v2026.04.0.md) for breaking changes.
2. Take a backup (see [Backup](#backup)).
3. Edit `.env` and bump `FORGE_TAG`:
   ```ini
   FORGE_TAG=2026.05.0
   ```
4. Pull the new images:
   ```bash
   docker compose pull
   ```
5. Bring the new stack up — `forge-init` runs migrations automatically:
   ```bash
   docker compose up -d
   ```
6. Tail init:
   ```bash
   docker compose logs -f forge-init
   ```
7. Smoke-test:
   ```bash
   curl -fsS https://forge.example.com/api/v2/ping/
   ```
8. Watch **Jobs** for 10 minutes — make sure new launches work.

**Example — minor version bump**

```bash
sed -i 's/^FORGE_TAG=.*/FORGE_TAG=2026.04.1/' .env
docker compose pull && docker compose up -d
```

---

## Rolling Back

If an upgrade fails, roll back the tag and restore the pre-upgrade backup.

**Step by step**

1. Set the previous tag in `.env`:
   ```ini
   FORGE_TAG=2026.04.0
   ```
2. Pull and bring up:
   ```bash
   docker compose pull
   docker compose up -d
   ```
3. **If migrations were applied** during the failed upgrade, you must also restore the pre-upgrade DB dump (see [Restore](#restore)).
4. Verify and notify users.

**Example**

> Upgraded to `2026.05.0` at 02:30, jobs started failing at 02:45 → set `FORGE_TAG=2026.04.0` → pull → up → restore `forge_backup_20260411_020000.sql.gz` → service restored at 02:55.

---

# SCALING & TOPOLOGY

## Adding an Execution Node

Execution nodes run Ansible jobs. Add more when you exhaust capacity.

**Step by step**

1. Provision a new host with Docker.
2. On the new host, install Receptor and bring it up as an execution node, pointing at the control node:
   ```bash
   docker run -d --name forge-receptor \
     -e RECEPTOR_NODE_TYPE=execution \
     -e RECEPTOR_PEER=tcp://control.forge.example.com:27199 \
     registry.cloudforyour.work/forge-platform/forge-receptor:2026.04.0
   ```
3. In the UI: **Admin → Instances → Add** and register the new node:

   | Field | Value |
   |---|---|
   | Hostname | `worker-eu-03` |
   | Node Type | `execution` |
   | Instance Group | `eu-west-pool` |

4. Wait until the node shows **Ready** in **Topology**.
5. Existing templates pinned to `eu-west-pool` will start scheduling onto it.

---

## Adding a Hop Node

Hop nodes relay traffic across network boundaries (e.g. DMZ → internal).

**Step by step**

1. Provision the hop host inside the boundary.
2. Run a Receptor container with `RECEPTOR_NODE_TYPE=hop`:
   ```bash
   docker run -d --name forge-receptor \
     -e RECEPTOR_NODE_TYPE=hop \
     -e RECEPTOR_PEER=tcp://control.forge.example.com:27199 \
     registry.cloudforyour.work/forge-platform/forge-receptor:2026.04.0
   ```
3. In the UI: **Admin → Instances → Add** with **Node Type = hop**.
4. From any execution node behind the hop, set its peer to the hop instead of the control node.
5. Confirm in **Topology** that the hop appears between the control and the workers.

---

## Tuning Capacity

**Step by step**

1. **Settings → Jobs**, edit:
   - **Max Concurrent Jobs** — global ceiling
   - **Max Forks** — Ansible forks per job
2. Per instance: **Admin → Instances → <node> → Capacity Adjustment** slider (0.0–1.0).
3. Save. Changes take effect within 30 seconds.

**Example**

> 16 vCPU control node → set capacity to `1.0` (use all). 4 vCPU shared dev box → set to `0.25`.

---

## Switching to Kubernetes

The `k8s/` folder contains baseline manifests if you outgrow Docker Compose.

**Step by step**

1. Read [`k8s/`](../k8s/) — it includes Deployments, Services, ConfigMap, Secret, Ingress.
2. Create a namespace:
   ```bash
   kubectl create namespace forge
   ```
3. Create the secrets (translate your `.env`):
   ```bash
   kubectl -n forge create secret generic forge-env --from-env-file=.env
   ```
4. Apply the manifests:
   ```bash
   kubectl -n forge apply -f k8s/
   ```
5. Watch the rollout:
   ```bash
   kubectl -n forge get pods -w
   ```

> Migration from compose to k8s is a one-shot: dump Postgres, import into the k8s-managed Postgres (or external RDS).

---

# OBSERVABILITY

## Enabling OpenTelemetry

The stack ships with `forge-otel-collector`. You only need to point it at your backend.

**Step by step**

1. Edit `otel/collector-config.yaml`.
2. Set the exporter endpoint:
   ```yaml
   exporters:
     otlphttp:
       endpoint: https://otel.example.com
       headers:
         authorization: "Bearer YOUR_TOKEN"
   ```
3. Restart the collector:
   ```bash
   docker compose restart forge-otel-collector
   ```
4. In **Settings → Observability**, set:
   - **OTLP Endpoint** = `http://forge-otel-collector:4318`
   - **Sampling rate** = `0.1` (10%)
5. Save. Within a minute, traces appear in your APM tool.

---

## Grafana Dashboards

`grafana/` contains pre-built dashboards JSONs.

**Step by step**

1. Open Grafana → **Dashboards → Import**.
2. Upload `grafana/forge-overview.json`.
3. Pick your Prometheus datasource.
4. Save. The dashboard shows job throughput, web/task latency, queue depth.

---

## Audit Log Export

For SOC 2 / ISO 27001 evidence collection.

**Step by step**

1. Open **Audit Log** in the UI.
2. Filter by date range (e.g. last quarter).
3. Click **Export → CSV**.
4. Hash and store the CSV alongside your evidence pack:
   ```bash
   sha256sum audit-2026Q1.csv > audit-2026Q1.csv.sha256
   ```

---

# SECURITY

## Rotating Secrets

Secrets to rotate periodically: `FORGE_SECRET_KEY`, `POSTGRES_PASSWORD`, `FORGE_ADMIN_PASSWORD`, `FORGE_BROADCAST_WEBSOCKET_SECRET`.

**Step by step — rotate `FORGE_SECRET_KEY`**

1. **Take a backup first.**
2. Generate a new key:
   ```bash
   openssl rand -hex 25
   ```
3. Edit `.env`, replace `FORGE_SECRET_KEY=...`.
4. Restart web + task:
   ```bash
   docker compose up -d forge-web forge-task
   ```
5. **All sessions are invalidated** — users must re-login. Encrypted credentials in the DB are unaffected (they use a separate Fernet key).

> **Never** rotate the database encryption key (used for credential storage) without first re-encrypting all credentials. That procedure is a separate runbook.

---

## User & SSO Setup

**Step by step — enable OIDC**

1. Open **Settings → Authentication → OIDC**.
2. Fill in:
   - **Provider URL** — `https://login.example.com`
   - **Client ID** — `forge-prod`
   - **Client Secret** — *(from IdP)*
   - **Redirect URI** — `https://forge.example.com/sso/complete/oidc/`
3. Save → click **Test** to verify discovery.
4. Test login from a private browser window.
5. Map IdP groups to Forge teams under **Settings → Authentication → Group Mapping**.

---

## Firewall & Network Hardening

**Step by step**

1. Allow inbound only on **443** (and optionally 80 for HTTP→HTTPS redirect).
2. Restrict SSH to your bastion / admin range.
3. Block Postgres (5432), Redis (6379), Receptor (27199) from the public internet — they should only be reachable from inside the Docker network.
4. If running on cloud, also configure security groups, not just OS firewall.

**Example — ufw on Ubuntu**

```bash
sudo ufw default deny incoming
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from 10.0.0.0/24 to any port 22
sudo ufw enable
```

---

## Security Updates

**Step by step**

1. Subscribe to the Forge release announcement channel.
2. Run `docker compose pull` weekly to pick up base-image patches when you bump tag.
3. Patch the host OS monthly (`unattended-upgrades` on Debian/Ubuntu).
4. Run scheduled image scans:
   ```bash
   trivy image registry.cloudforyour.work/forge-platform/forge-backend:2026.04.0
   ```

---

# TROUBLESHOOTING

## Stack Won't Come Up

**Step by step**

1. Check `docker compose ps` — which service is unhealthy?
2. `docker compose logs <service>` for the failing one.
3. Common causes:
   - Missing or wrong values in `.env` → look for `KeyError` / `ImproperlyConfigured`.
   - Port 80/443 already in use → `sudo lsof -i :443`.
   - Volume permissions → `sudo chown -R 1000:1000 /var/lib/awx`.
4. Fix and `docker compose up -d` again.

---

## Database Connection Errors

Symptom: web service logs show `could not connect to server: Connection refused`.

**Step by step**

1. Is postgres running? `docker compose ps postgres`
2. Logs: `docker compose logs --tail=100 postgres`
3. Can the web container reach it?
   ```bash
   docker compose exec forge-web pg_isready -h postgres -U forge
   ```
4. If postgres is healthy but web cannot connect → check `POSTGRES_PASSWORD` matches in `.env` and the DB volume.
5. If postgres won't start → look for `PANIC` lines (disk full, corrupt WAL).

---

## Jobs Stuck in Pending

Symptom: jobs sit in *Pending* and never start.

**Step by step**

1. Check capacity: **Admin → Instances** → is total used == total capacity?
2. Check task workers: `docker compose ps forge-task` — running?
3. Check Redis: `docker compose exec redis redis-cli ping` should return `PONG`.
4. Check Receptor: `docker compose exec forge-task receptorctl status`.
5. As a last resort, restart the task service:
   ```bash
   docker compose restart forge-task
   ```

---

## Receptor / Mesh Issues

**Step by step**

1. Open **Topology** — any red links?
2. From the control node:
   ```bash
   docker compose exec forge-task receptorctl status
   ```
3. From a worker:
   ```bash
   docker exec forge-receptor receptorctl status
   ```
4. Verify TCP reachability between nodes on **27199**.
5. Restart the affected receptor container.

---

## Frontend Returns 502

Symptom: browser shows nginx 502 Bad Gateway.

**Step by step**

1. `docker compose ps` — is `forge-frontend` healthy?
2. `docker compose logs --tail=50 forge-frontend`
3. `docker compose logs --tail=50 nginx`
4. Common cause: frontend container OOM-killed → bump memory in compose.
5. Restart: `docker compose restart forge-frontend nginx`.

---

## Disk Filling Up

**Step by step**

1. `df -h` — which mount?
2. If `/var/lib/docker` → prune unused images:
   ```bash
   docker image prune -af --filter "until=168h"
   ```
3. If the backup directory → lower `BACKUP_RETENTION_DAYS` and rerun backup.
4. If Postgres data dir → check for runaway audit log growth, vacuum:
   ```bash
   docker compose exec postgres psql -U forge -d forge -c "VACUUM FULL VERBOSE;"
   ```

---

## Reset Admin Password

**Step by step**

1. Exec into the web container:
   ```bash
   docker compose exec forge-web bash
   ```
2. Run the management command:
   ```bash
   awx-manage changepassword admin
   ```
3. Enter the new password twice.
4. Log in via the UI.

> If `admin` was disabled and you have no other admin user:
> ```bash
> docker compose exec forge-web awx-manage createsuperuser
> ```

---

# REFERENCE

## Service Map

| Service | Image | Port (internal) | Purpose |
|---|---|---|---|
| `postgres` | `postgres:15` | 5432 | Application database |
| `redis` | `redis:7` | 6379 | Cache + Celery broker |
| `forge-init` | `forge-backend` | — | Migrations + initial setup, exits on success |
| `forge-web` | `forge-backend` | 8050 (uWSGI), 8051 (Daphne) | REST API + WebSocket |
| `forge-task` | `forge-backend` | — | Celery workers + dispatcher + ws relay |
| `forge-frontend` | `forge-frontend` | 80 | Static React UI |
| `forge-opa` | `openpolicyagent/opa` | 8181 | Policy-as-Code sidecar |
| `forge-otel-collector` | `otel/collector` | 4317/4318 | OpenTelemetry pipeline |
| `nginx` | `nginx` | 80 / 443 | TLS terminator + edge router |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | yes | — | DB password |
| `POSTGRES_USER` | no | `forge` | DB user |
| `POSTGRES_DB` | no | `forge` | DB name |
| `FORGE_SECRET_KEY` | yes | — | Django `SECRET_KEY` (50+ chars) |
| `FORGE_BROADCAST_WEBSOCKET_SECRET` | yes | — | WS broadcast secret |
| `FORGE_ADMIN_USER` | no | `admin` | Bootstrap admin username |
| `FORGE_ADMIN_PASSWORD` | yes | — | Bootstrap admin password |
| `FORGE_ADMIN_EMAIL` | no | `admin@example.com` | Bootstrap admin email |
| `FORGE_CSRF_TRUSTED_ORIGINS` | yes | — | Comma-separated `https://...` origins |
| `FORGE_ALLOWED_HOSTS` | no | `*` | Django ALLOWED_HOSTS |
| `FORGE_NODE_NAME` | no | `forge-node` | This node's name in mesh |
| `FORGE_NODE_TYPE` | no | `hybrid` | `control` / `execution` / `hybrid` |
| `FORGE_BACKEND_IMAGE` | no | `registry.cloudforyour.work/forge-platform/forge-backend` | Backend image |
| `FORGE_FRONTEND_IMAGE` | no | `registry.cloudforyour.work/forge-platform/forge-frontend` | Frontend image |
| `FORGE_TAG` | no | `latest` | Image tag (use a real version, not `latest`) |
| `BACKUP_RETENTION_DAYS` | no | `7` | Days of backups to keep |

---

## File Layout

```
/opt/forge/
├── docker-compose.yml      # primary stack definition
├── .env                    # local secrets — never commit
├── nginx/
│   ├── nginx.conf
│   └── ssl/
│       ├── forge.crt
│       └── forge.key
├── settings/               # Django settings overrides mounted into forge-web/task
├── otel/
│   └── collector-config.yaml
├── grafana/
│   └── *.json              # importable dashboards
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   ├── healthcheck-web.sh
│   ├── healthcheck-task.sh
│   └── init.sh
├── k8s/                    # k8s manifests (alternative to compose)
└── /var/lib/awx/
    ├── projects/           # synced project checkouts
    ├── public/             # static web assets
    └── backups/            # nightly DB dumps
```

---

*End of administrator handbook.*
