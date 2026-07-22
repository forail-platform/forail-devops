# 07 — Docker & Deployment

How to build, configure, and deploy Forail Platform to production.

---

## Architecture

Forail Platform uses a separated architecture with independent Docker images:

| Service        | Image                                  | Purpose                                         |
| -------------- | -------------------------------------- | ----------------------------------------------- |
| forail-web      | `ghcr.io/forail-platform/forail-backend`  | Django API (uwsgi + daphne + nginx-internal)    |
| forail-task     | `ghcr.io/forail-platform/forail-backend`  | Task execution (dispatcher, callback, receptor) |
| forail-init     | `ghcr.io/forail-platform/forail-backend`  | One-shot: migrations, admin user, provisioning  |
| forail-frontend | `ghcr.io/forail-platform/forail-frontend` | React SPA served by nginx                       |
| postgres       | `postgres:15-alpine`                   | Database                                        |
| redis          | `redis:7-alpine`                       | Cache and message broker                        |
| nginx          | `nginx:1.27-alpine`                    | TLS termination, routing                        |

### Startup Order

```
postgres ──► redis ──► forail-init ──► forail-web ──► forail-task ──► nginx
                                                     forail-frontend ──┘
```

Each service waits for the previous one to be healthy before starting.

### Request Routing (External Nginx)

| Path                   | Destination       | Description          |
| ---------------------- | ----------------- | -------------------- |
| `/api/*`               | forail-web:8013    | REST API             |
| `/sso/*`               | forail-web:8013    | SSO/SAML/LDAP        |
| `/api/login/`          | forail-web:8013    | Login (rate-limited) |
| `/(api/)?websocket/`   | forail-web:8013    | WebSocket (upgrade)  |
| `/*` (everything else) | forail-frontend:80 | React SPA            |

---

## Building Docker Images

### Backend

```bash
cd forail-backend
docker build -t ghcr.io/forail-platform/forail-backend:latest .
docker push ghcr.io/forail-platform/forail-backend:latest
```

The Dockerfile is a multi-stage build:

1. **builder** (Ubuntu 24.04): installs Python deps, builds sdist, runs collectstatic
2. **runtime** (Ubuntu 24.04): minimal image with runtime deps, receptor, supervisor

### Frontend

```bash
cd forail-frontend
docker build -t ghcr.io/forail-platform/forail-frontend:latest .
docker push ghcr.io/forail-platform/forail-frontend:latest
```

The Dockerfile is a multi-stage build:

1. **builder** (Node 20 Alpine): `npm ci && npm run build`
2. **runtime** (nginx 1.27 Alpine): serves built assets with SPA fallback

---

## Production Deployment

### Prerequisites

- Docker 24+ with Compose v2
- 8GB+ RAM, 4+ CPU cores
- Domain name with SSL certificate (or self-signed for testing)

### Quick Start

```bash
cd forail-deploy

# 1. Create configuration
cp .env.example .env
# Edit .env — set all REQUIRED values (see below)

# 2. SSL certificates
mkdir -p nginx/ssl

# Let's Encrypt (production):
certbot certonly --standalone -d forail.example.com
cp /etc/letsencrypt/live/forail.example.com/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/forail.example.com/privkey.pem nginx/ssl/

# Or self-signed (testing):
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem -out nginx/ssl/fullchain.pem \
  -subj "/CN=forail.example.com"

# 3. Deploy
docker compose up -d

# 4. Watch initialization
docker compose logs -f forail-init

# 5. Verify
curl -k https://forail.example.com/api/v2/ping/
```

### Deploy in Vagrant (testing)

```bash
cd forail-deploy
vagrant up          # Ubuntu 24.04 VM + Docker + Compose + SSL + .env auto-generated
vagrant ssh
cd /forail-deploy
docker compose up -d

# Access from host: https://192.168.56.22/
```

---

## Environment Variables

### Required

| Variable                           | Description       | Generate with...            |
| ---------------------------------- | ----------------- | --------------------------- |
| `POSTGRES_PASSWORD`                | DB password       | `openssl rand -hex 16`      |
| `FORAIL_SECRET_KEY`                 | Django crypto key | `openssl rand -hex 32`      |
| `FORAIL_BROADCAST_WEBSOCKET_SECRET` | WS auth secret    | `openssl rand -hex 32`      |
| `FORAIL_ADMIN_PASSWORD`             | Admin password    | Strong password             |
| `FORAIL_CSRF_TRUSTED_ORIGINS`       | CSRF origins      | `https://forail.example.com` |

### Optional

| Variable               | Default                                | Description                         |
| ---------------------- | -------------------------------------- | ----------------------------------- |
| `FORAIL_ALLOWED_HOSTS`  | `localhost,127.0.0.1`                  | Allowed HTTP hosts — list your real hostnames; `*` disables the Host check |
| `FORAIL_ADMIN_USER`     | `admin`                                | Admin username                      |
| `FORAIL_ADMIN_EMAIL`    | `admin@example.com`                    | Admin email                         |
| `FORAIL_NODE_NAME`      | `forail-node`                           | Instance hostname                   |
| `FORAIL_NODE_TYPE`      | `hybrid`                               | `hybrid`, `control`, or `execution` |
| `FORAIL_BACKEND_IMAGE`  | `ghcr.io/forail-platform/forail-backend`  | Backend Docker image                |
| `FORAIL_FRONTEND_IMAGE` | `ghcr.io/forail-platform/forail-frontend` | Frontend Docker image               |
| `FORAIL_TAG`            | `2026.07.0`                            | Image tag — pinned to a release, not `latest` |
| `FORAIL_TASK_PRIVILEGED` | `false`                               | Run `forail-task` privileged. Required for the podman-in-container job path |
| `FORAIL_TASK_CGROUP`    | `private`                              | Set to `host` together with `FORAIL_TASK_PRIVILEGED=true` for job execution |
| `NGINX_HTTP_PORT`      | `80`                                   | External HTTP port                  |
| `NGINX_HTTPS_PORT`     | `443`                                  | External HTTPS port                 |

### Watch out

- **`FORAIL_SECRET_KEY` MUST REMAIN THE SAME** between upgrades. If you change it,
  all sessions, tokens, and encrypted credentials become invalid.

- **`FORAIL_CSRF_TRUSTED_ORIGINS` must include the full URL** with `https://`. Without
  it, the login form won't work (403 CSRF error).

---

## SSL/TLS

### Let's Encrypt (recommended for production)

```bash
certbot certonly --standalone -d forail.example.com
cp /etc/letsencrypt/live/forail.example.com/{fullchain,privkey}.pem nginx/ssl/
```

Auto-renewal (crontab):

```bash
0 0 1 * * certbot renew && cp /etc/letsencrypt/live/forail.example.com/*.pem /path/to/nginx/ssl/ && docker compose restart nginx
```

### Security Notes

- Nginx is configured for **TLS 1.2 and 1.3** — older versions are disabled
- **HSTS** header is enabled (63072000 seconds)
- **Rate limiting** on `/api/login/` — 5 requests/second, burst 10
- `client_max_body_size` is **50MB**

---

## Backup & Restore

### Backup

```bash
docker compose exec forail-task bash /etc/forail/backup.sh

# With custom retention (30 days)
docker compose exec forail-task bash /etc/forail/backup.sh 30
```

### Scheduled backup (crontab)

```bash
0 2 * * * cd /path/to/forail-deploy && docker compose exec -T forail-task bash /etc/forail/backup.sh
```

### Restore

```bash
docker compose stop forail-web forail-task
gunzip -c forail_backup_20260317.sql.gz | docker compose exec -T postgres psql -U forail forail
docker compose start forail-web forail-task
```

---

## Health Checks

```bash
# API ping (no auth)
curl -k https://forail.example.com/api/v2/ping/

# Instance capacity (auth required)
curl -k -u admin:password https://forail.example.com/api/v2/instances/

# Service status
docker compose ps

# Supervisor processes
docker compose exec forail-web supervisorctl status
docker compose exec forail-task supervisorctl status
```

---

## Troubleshooting

### Container won't start

```bash
docker compose logs forail-init    # Check migrations and init
# "database does not exist" → POSTGRES_DB mismatch
# "authentication failed" → POSTGRES_PASSWORD mismatch
```

### Can't log in (403 CSRF)

```bash
# Check FORAIL_CSRF_TRUSTED_ORIGINS in .env
# Must be full URL with https:// (e.g., https://192.168.56.22)
```

### Server Error (500 on root page)

```bash
# Check if frontend container is running
docker compose ps forail-frontend
# Must be healthy

# Check nginx routing
docker compose logs nginx
```

### Jobs not running

```bash
docker compose exec forail-task supervisorctl status
# All 4 must be RUNNING: receptor, dispatcher, callback-receiver, wsrelay

docker compose exec forail-web forail-manage list_instances
```

### Forgotten admin password

```bash
docker compose exec forail-web forail-manage update_password --username=admin --password=NewPass123!
```

---

## Upgrading

```bash
cd forail-deploy

# 1. Pull new images
docker compose pull

# 2. Recreate containers (migrations run automatically via forail-init)
docker compose up -d

# 3. Verify
docker compose ps
curl -k https://forail.example.com/api/v2/ping/
```

---

## Scaling

### Adding an execution node

```bash
# On the execution node:
docker run -d --name forail-task \
  -e DATABASE_HOST=db.example.com \
  -e REDIS_HOST=redis.example.com \
  -e FORAIL_NODE_TYPE=execution \
  -e FORAIL_NODE_NAME=exec-node-1 \
  ghcr.io/forail-platform/forail-backend:latest launch_awx_task.sh

# On the control node:
docker compose exec forail-web forail-manage provision_instance --hostname=exec-node-1 --node-type=execution
docker compose exec forail-web forail-manage register_queue --queuename=default --hostnames=exec-node-1
```

### Recommended Hardware

| Size                 | CPU | RAM  | Disk      |
| -------------------- | --- | ---- | --------- |
| Small (≤100 hosts)   | 4   | 8GB  | 50GB SSD  |
| Medium (≤1000 hosts) | 8   | 16GB | 100GB SSD |
| Large (≤10000 hosts) | 16  | 32GB | 200GB SSD |
