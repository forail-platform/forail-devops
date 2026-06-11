# Forail Platform - Project Overview

## About the Project

**Forail** is an infrastructure automation platform based on the AWX project (version 24.6.1).
The project is licensed under Apache License 2.0, based on the original work by the Red Hat team.

The goal is a complete refactoring of the code - both backend and frontend - to make it clean, readable, and maintainable.
Modernization for running on newer systems (Ubuntu 24.04+, Python 3.12+).

---

## Architecture

Forail Platform is split into three independent repositories:

| Repository       | Description                              | Registry                               |
| ---------------- | ---------------------------------------- | -------------------------------------- |
| `forail-backend`  | Django REST API, task engine, receptor   | `ghcr.io/forail-platform/forail-backend`  |
| `forail-frontend` | React UI (Vite + TypeScript)             | `ghcr.io/forail-platform/forail-frontend` |
| `forail-deploy`   | Docker Compose, nginx, settings, scripts | —                                      |

### Service Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │               External Nginx                │
                    │         (TLS termination, routing)           │
                    │              ports 80 / 443                  │
                    └──────┬──────────────┬───────────────┬───────┘
                           │              │               │
                    /api/, /sso/    /websocket/    / (everything else)
                    /api/login/          │               │
                           │              │               │
                    ┌──────▼──────┐       │        ┌──────▼──────┐
                    │  forail-web  │◄──────┘        │forail-frontend│
                    │ (uwsgi +   │                 │ (nginx +     │
                    │  daphne +   │                 │  React SPA)  │
                    │  nginx-int) │                 └──────────────┘
                    │  port 8013  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ forail-task  │
                    │ (dispatcher,│
                    │  callback,  │
                    │  wsrelay,   │
                    │  receptor)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │                         │
       ┌──────▼──────┐          ┌──────▼──────┐
       │  PostgreSQL  │          │    Redis    │
       │   15-alpine  │          │  7-alpine   │
       └──────────────┘          └─────────────┘
```

---

## What Has Been Done So Far

### Repository Separation (COMPLETED 2026-03-17)

The monolithic AWX codebase was separated into three independent repos:

- **forail-backend**: Python package (`forail/`), Dockerfile (Ubuntu 24.04 multi-stage),
  supervisor configs, settings, all Django management commands
- **forail-frontend**: React/Vite/TypeScript SPA with its own Dockerfile (Node 20 build + nginx serve)
- **forail-deploy**: Production Docker Compose stack, nginx TLS config, init/healthcheck/backup scripts

### Docker Images on Harbor

- `ghcr.io/forail-platform/forail-backend:latest` — Ubuntu 24.04, Python 3.12, receptor, supervisor
- `ghcr.io/forail-platform/forail-frontend:latest` — nginx 1.27-alpine serving built React assets

### Production Deployment (VERIFIED 2026-03-17)

Full production stack deployed and verified in Vagrant VM (Ubuntu 24.04):

- **6 services**: postgres, redis, forail-init, forail-web, forail-task, forail-frontend, nginx
- **HTTPS**: self-signed SSL with nginx TLS termination (port 443)
- **HTTP→HTTPS redirect**: automatic
- **API**: `/api/v2/ping/` returns version 2026.3.0
- **Auth**: admin login verified
- **Frontend**: React SPA served via forail-frontend container, proxied by nginx
- **252 Django migrations** applied successfully

### AWX→Forail File Rename (COMPLETED 2026-03-17)

All remaining `awx*` files renamed to `forail*` across all repositories:

- `awx-python` → `forail-python` (Python venv wrapper script)
- `awx_settings.py` → `forail_settings.py` (Django settings module)
- `awx-spud-reading.svg` → removed (old AWX mascot icon)
- `awx-autoreload` → `forail-autoreload` (dev file watcher)
- `awx-manage` (dev wrapper) → `forail-manage`
- All `awx-manage` references in scripts → `forail-manage`
- Backward compatibility: `awx-manage` and `awx-python` symlinks preserved in Docker image

**Result**: Zero `awx*` files remaining in any repository. `forail-manage` is the primary
management command. `awx-manage` still works via symlink for backward compatibility.

### Previous Work (from monolithic phase)

- AWX 24.6.1 cloned, `modernization` branch created
- Full rebranding AWX → Forail (Level 1 user-facing + Level 2 package rename)
- **2882 files changed** — `awx/` → `forail/` with all imports updated
- Python unit tests: **1083 passed**, 0 failed
- CI/CD: GitHub Actions workflow with Lint → Test → Build → Security → Release stages
- Version: `2026.03.0` (CalVer format)

### Bugs Fixed During Deployment

1. `forail/devonly.py` present in sdist → forced development mode in production
2. Missing `import logging.handlers` in `forail/main/utils/handlers.py`
3. Missing SSL cert path symlink for Ubuntu (`/etc/pki/tls/certs/ca-bundle.crt`)
4. Missing `curl` in runtime image (needed for healthcheck)
5. Missing `forail/ui_next/` stub module (needed by `forail/urls.py`)
6. Missing `collectstatic` in headless build (DRF/Django admin static files)

---

## Phase Overview

| Phase | Description                     | Status        |
| ----- | ------------------------------- | ------------- |
| 1     | Build Stabilization             | **COMPLETED** |
| 2     | Rebranding (Forail)              | **COMPLETED** |
| 3     | Dependency Modernization        | **COMPLETED** |
| 4     | Backend Refactoring             | **COMPLETED** |
| 5     | Frontend Refactoring            | **COMPLETED** |
| 6     | Dockerfile Modernization        | **COMPLETED** |
| 7     | Docker Compose Production       | **COMPLETED** |
| 8     | Testing and QA                  | **COMPLETED** |
| 9     | Release                         | **COMPLETED** |
| L1    | User-Facing Rebranding          | **COMPLETED** |
| L2    | Full Package Rename (awx→forail) | **COMPLETED** |
| 10    | Repository Separation           | **COMPLETED** |
| 11    | AWX→Forail File Rename           | **COMPLETED** |
| 12    | Centralized CI/CD Pipeline      | **COMPLETED** |

### CI/CD Pipeline (GitHub Actions)

Each repository has its own GitHub Actions workflow in `.github/workflows/ci.yml`:

```
Checkout → Lint → Test → Build → Security → Release
```

- Workflow runs on push to `main` and on pull requests
- Lint: ruff (Python) + tsc (TypeScript)
- Tests: pytest (backend / assistant) + vitest (frontend)
- Build: docker build with version tag derived from CalVer git tag
- Security: pip-audit + Trivy container scan
- Release: pushes versioned images to `ghcr.io/forail-platform/*` on `main` branch or version tag

No external secrets are required — releases use the built-in `GITHUB_TOKEN` with `packages: write` permission.

---

## How to Deploy (Production)

### Prerequisites

- Docker 24+ with Compose v2
- 8GB+ RAM, 4+ CPU cores
- SSL certificates (Let's Encrypt or self-signed)

### Quick Start

```bash
git clone <forail-deploy-repo>
cd forail-deploy

# 1. Create .env from template
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, FORAIL_SECRET_KEY, FORAIL_ADMIN_PASSWORD, etc.

# 2. SSL certificates (self-signed for testing)
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem -out nginx/ssl/fullchain.pem \
  -subj "/CN=forail.local"

# 3. Deploy
docker compose up -d

# 4. Watch initialization
docker compose logs -f forail-init

# 5. Access
# HTTPS: https://<your-ip>/
# API:   https://<your-ip>/api/v2/ping/
# Login: admin / <FORAIL_ADMIN_PASSWORD from .env>
```

### Deploy in Vagrant (for testing)

```bash
cd forail-deploy
vagrant up          # Starts Ubuntu 24.04 VM with Docker
vagrant ssh
cd /forail-deploy
docker compose up -d

# Access from host browser: https://192.168.56.22/
```

---

## How to Build Images

### Backend

```bash
cd forail-backend
docker build -t ghcr.io/forail-platform/forail-backend:latest .
docker push ghcr.io/forail-platform/forail-backend:latest
```

### Frontend

```bash
cd forail-frontend
docker build -t ghcr.io/forail-platform/forail-frontend:latest .
docker push ghcr.io/forail-platform/forail-frontend:latest
```

---

## Vagrant Development Environments

Each repo includes a Vagrantfile with Ubuntu 24.04 and Docker/Compose pre-installed:

| Repo           | VM IP         | RAM | Ports                   |
| -------------- | ------------- | --- | ----------------------- |
| forail-backend  | 192.168.56.20 | 8GB | 8043, 8013, 8080, 5433  |
| forail-frontend | 192.168.56.21 | 4GB | 3000, 4173              |
| forail-deploy   | 192.168.56.22 | 8GB | 80→8080, 443→8443, 8013 |

---

## File Structure

```
forail-platform/
├── forail-backend/              # Python backend
│   ├── Dockerfile              # Production multi-stage build (Ubuntu 24.04)
│   ├── Vagrantfile             # Dev VM
│   ├── Makefile                # Build targets
│   ├── _build/                 # Rendered supervisor configs
│   ├── forail/                  # Main Python package
│   │   ├── api/                # REST API
│   │   ├── main/               # Core models, tasks, migrations
│   │   ├── settings/           # Django settings
│   │   ├── ui_next/            # SPA routing stub (urls.py + template)
│   │   └── sso/                # SSO/LDAP/SAML
│   └── requirements/           # Python dependencies
│
├── forail-frontend/             # React UI
│   ├── Dockerfile              # Multi-stage (Node 20 + nginx)
│   ├── Vagrantfile             # Dev VM
│   ├── nginx.conf              # SPA nginx config
│   ├── src/                    # React/TypeScript source
│   └── package.json            # Node dependencies
│
└── forail-deploy/               # Deployment
    ├── docker-compose.yml      # 7 services (postgres, redis, init, web, task, frontend, nginx)
    ├── .env.example            # Environment template
    ├── Vagrantfile             # Deployment test VM
    ├── settings/               # Django production settings
    ├── nginx/                  # External nginx (TLS, routing)
    ├── receptor/               # Receptor mesh config
    ├── scripts/                # init, healthcheck, backup, restore
    └── docs/                   # Documentation
```

---

## Development Rules

- **Every change is understood** - if you cannot explain why something was done, do not commit it
- **Review everything** - always review the diff before committing
- **Author of all commits and code is Krstan Vjestica** - never attribute tools as authors
- **All deployment testing inside Vagrant VM** - never install dependencies on host

## Commit Message Format

`type(scope): short description`

Types: `refactor`, `fix`, `feat`, `docs`, `test`, `chore`

---

## License

Forail is licensed under Apache License 2.0.
Based on the AWX project (<https://github.com/ansible/awx>).
