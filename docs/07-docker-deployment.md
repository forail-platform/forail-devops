# 07 — Docker & Deployment

How to build, configure, and deploy Forge Platform to production.

---

## Architecture

Forge Platform uses a separated architecture with independent Docker images:

| Service | Image | Purpose |
|---------|-------|---------|
| forge-web | `ghcr.io/forgeplatform/forge-backend` | Django API (uwsgi + daphne + nginx-internal) |
| forge-task | `ghcr.io/forgeplatform/forge-backend` | Task execution (dispatcher, callback, receptor) |
| forge-init | `ghcr.io/forgeplatform/forge-backend` | One-shot: migrations, admin user, provisioning |
| forge-frontend | `ghcr.io/forgeplatform/forge-frontend` | React SPA served by nginx |
| postgres | `postgres:15-alpine` | Database |
| redis | `redis:7-alpine` | Cache and message broker |
| nginx | `nginx:1.27-alpine` | TLS termination, routing |

### Startup Order

```
postgres ──► redis ──► forge-init ──► forge-web ──► forge-task ──► nginx
                                                     forge-frontend ──┘
```

Each service waits for the previous one to be healthy before starting.

### Request Routing (External Nginx)

| Path | Destination | Description |
|------|-------------|-------------|
| `/api/*` | forge-web:8013 | REST API |
| `/sso/*` | forge-web:8013 | SSO/SAML/LDAP |
| `/api/login/` | forge-web:8013 | Login (rate-limited) |
| `/(api/)?websocket/` | forge-web:8013 | WebSocket (upgrade) |
| `/*` (everything else) | forge-frontend:80 | React SPA |

---

## Building Docker Images

### Backend

```bash
cd forge-backend
docker build -t ghcr.io/forgeplatform/forge-backend:latest .
docker push ghcr.io/forgeplatform/forge-backend:latest
```

The Dockerfile is a multi-stage build:
1. **builder** (Ubuntu 24.04): installs Python deps, builds sdist, runs collectstatic
2. **runtime** (Ubuntu 24.04): minimal image with runtime deps, receptor, supervisor

### Frontend

```bash
cd forge-frontend
docker build -t ghcr.io/forgeplatform/forge-frontend:latest .
docker push ghcr.io/forgeplatform/forge-frontend:latest
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
cd forge-deploy

# 1. Create configuration
cp .env.example .env
# Edit .env — set all REQUIRED values (see below)

# 2. SSL certificates
mkdir -p nginx/ssl

# Let's Encrypt (production):
certbot certonly --standalone -d forge.example.com
cp /etc/letsencrypt/live/forge.example.com/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/forge.example.com/privkey.pem nginx/ssl/

# Or self-signed (testing):
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem -out nginx/ssl/fullchain.pem \
  -subj "/CN=forge.example.com"

# 3. Deploy
docker compose up -d

# 4. Watch initialization
docker compose logs -f forge-init

# 5. Verify
curl -k https://forge.example.com/api/v2/ping/
```

### Deploy in Vagrant (testing)

```bash
cd forge-deploy
vagrant up          # Ubuntu 24.04 VM + Docker + Compose + SSL + .env auto-generated
vagrant ssh
cd /forge-deploy
docker compose up -d

# Access from host: https://192.168.56.22/
```

---

## Environment Variables

### Required

| Variable | Description | Generate with... |
|----------|-------------|-----------------|
| `POSTGRES_PASSWORD` | DB password | `openssl rand -hex 16` |
| `FORGE_SECRET_KEY` | Django crypto key | `openssl rand -hex 32` |
| `FORGE_BROADCAST_WEBSOCKET_SECRET` | WS auth secret | `openssl rand -hex 32` |
| `FORGE_ADMIN_PASSWORD` | Admin password | Strong password |
| `FORGE_CSRF_TRUSTED_ORIGINS` | CSRF origins | `https://forge.example.com` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGE_ALLOWED_HOSTS` | `*` | Allowed HTTP hosts |
| `FORGE_ADMIN_USER` | `admin` | Admin username |
| `FORGE_ADMIN_EMAIL` | `admin@example.com` | Admin email |
| `FORGE_NODE_NAME` | `forge-node` | Instance hostname |
| `FORGE_NODE_TYPE` | `hybrid` | `hybrid`, `control`, or `execution` |
| `FORGE_BACKEND_IMAGE` | `ghcr.io/forgeplatform/forge-backend` | Backend Docker image |
| `FORGE_FRONTEND_IMAGE` | `ghcr.io/forgeplatform/forge-frontend` | Frontend Docker image |
| `FORGE_TAG` | `latest` | Image tag |
| `NGINX_HTTP_PORT` | `80` | External HTTP port |
| `NGINX_HTTPS_PORT` | `443` | External HTTPS port |

### Watch out

- **`FORGE_SECRET_KEY` MUST REMAIN THE SAME** between upgrades. If you change it,
  all sessions, tokens, and encrypted credentials become invalid.

- **`FORGE_CSRF_TRUSTED_ORIGINS` must include the full URL** with `https://`. Without
  it, the login form won't work (403 CSRF error).

---

## SSL/TLS

### Let's Encrypt (recommended for production)

```bash
certbot certonly --standalone -d forge.example.com
cp /etc/letsencrypt/live/forge.example.com/{fullchain,privkey}.pem nginx/ssl/
```

Auto-renewal (crontab):
```bash
0 0 1 * * certbot renew && cp /etc/letsencrypt/live/forge.example.com/*.pem /path/to/nginx/ssl/ && docker compose restart nginx
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
docker compose exec forge-task bash /etc/forge/backup.sh

# With custom retention (30 days)
docker compose exec forge-task bash /etc/forge/backup.sh 30
```

### Scheduled backup (crontab)

```bash
0 2 * * * cd /path/to/forge-deploy && docker compose exec -T forge-task bash /etc/forge/backup.sh
```

### Restore

```bash
docker compose stop forge-web forge-task
gunzip -c forge_backup_20260317.sql.gz | docker compose exec -T postgres psql -U forge forge
docker compose start forge-web forge-task
```

---

## Health Checks

```bash
# API ping (no auth)
curl -k https://forge.example.com/api/v2/ping/

# Instance capacity (auth required)
curl -k -u admin:password https://forge.example.com/api/v2/instances/

# Service status
docker compose ps

# Supervisor processes
docker compose exec forge-web supervisorctl status
docker compose exec forge-task supervisorctl status
```

---

## Troubleshooting

### Container won't start

```bash
docker compose logs forge-init    # Check migrations and init
# "database does not exist" → POSTGRES_DB mismatch
# "authentication failed" → POSTGRES_PASSWORD mismatch
```

### Can't log in (403 CSRF)

```bash
# Check FORGE_CSRF_TRUSTED_ORIGINS in .env
# Must be full URL with https:// (e.g., https://192.168.56.22)
```

### Server Error (500 on root page)

```bash
# Check if frontend container is running
docker compose ps forge-frontend
# Must be healthy

# Check nginx routing
docker compose logs nginx
```

### Jobs not running

```bash
docker compose exec forge-task supervisorctl status
# All 4 must be RUNNING: receptor, dispatcher, callback-receiver, wsrelay

docker compose exec forge-web forge-manage list_instances
```

### Forgotten admin password

```bash
docker compose exec forge-web forge-manage update_password --username=admin --password=NewPass123!
```

---

## Upgrading

```bash
cd forge-deploy

# 1. Pull new images
docker compose pull

# 2. Recreate containers (migrations run automatically via forge-init)
docker compose up -d

# 3. Verify
docker compose ps
curl -k https://forge.example.com/api/v2/ping/
```

---

## Scaling

### Adding an execution node

```bash
# On the execution node:
docker run -d --name forge-task \
  -e DATABASE_HOST=db.example.com \
  -e REDIS_HOST=redis.example.com \
  -e FORGE_NODE_TYPE=execution \
  -e FORGE_NODE_NAME=exec-node-1 \
  ghcr.io/forgeplatform/forge-backend:latest launch_awx_task.sh

# On the control node:
docker compose exec forge-web forge-manage provision_instance --hostname=exec-node-1 --node-type=execution
docker compose exec forge-web forge-manage register_queue --queuename=default --hostnames=exec-node-1
```

### Recommended Hardware

| Size | CPU | RAM | Disk |
|------|-----|-----|------|
| Small (≤100 hosts) | 4 | 8GB | 50GB SSD |
| Medium (≤1000 hosts) | 8 | 16GB | 100GB SSD |
| Large (≤10000 hosts) | 16 | 32GB | 200GB SSD |
