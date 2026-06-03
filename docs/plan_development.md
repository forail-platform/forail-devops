# Forge - Development Plan (HISTORICAL — COMPLETED)

> **Status: COMPLETED.** This plan was executed and all phases were delivered as of v2026.04.0. This document is retained for historical reference only. For the current state, see [Release Notes v2026.04.0](RELEASE_NOTES_v2026.04.0.md).

---

## Current State Overview

**Latest release:** AWX 24.6.1 (July 2, 2024)
**Status:** Releases are paused. Red Hat is refactoring AWX into a service-oriented architecture.
**Devel branch:** Active, already uses Python 3.12, Django 5.2.8, dispatcherd instead of Celery.
**Alternative:** Ascender (fork by CIQ/Rocky Linux team) - version 25.3.3 (Feb 2026).

### Known Issues with AWX 24.6.1

| Problem              | Description                                                                            |
| -------------------- | -------------------------------------------------------------------------------------- |
| OpenSSL pin          | Dockerfile pins `openssl-3.0.7` which no longer exists in CentOS Stream 9 repositories |
| Django conflict      | `django-ansible-base` requires Django >=4.2.16, but AWX pins 4.2.10                    |
| Python 3.12.8+ crash | `argparse._parse_known_args()` got a new `intermixed` parameter, breaks AWX CLI        |
| Missing VERSION file | Build from source fails without a `VERSION` file in the root                           |
| Node.js 18           | Entering maintenance LTS, needs migration to Node.js 20+                               |

---

## Phase 0: Preparation (Week 1-2)

### 0.1 Fork and Environment

```bash
# Fork the AWX repository
git clone https://github.com/ansible/awx.git awx-fork
cd awx-fork
git checkout -b modernization 24.6.1

# Fork the AWX Operator repository
git clone https://github.com/ansible/awx-operator.git awx-operator-fork
```

### 0.2 Local Build and Test Infrastructure

Before any changes, ensure the original build works:

```bash
# Build development image
make docker-compose-build

# Run tests
make docker-compose-test

# Run unit tests
make test_unit
```

Document all errors that appear during the 24.6.1 build as these are the first bugs to fix.

### 0.3 CI/CD Pipeline

Set up the GitHub Actions pipeline with:

- Build matrix: Python 3.11 / 3.12 / 3.13
- OS matrix: CentOS Stream 9 / Ubuntu 24.04
- Automatic unit tests on every push
- Container image build and scanning (Trivy/Grype)

---

## Phase 1: Critical Fixes (Week 2-4)

Goal: Make AWX 24.6.1 actually buildable and runnable.

### 1.1 Fix OpenSSL Pinning

**File:** `tools/ansible/roles/dockerfile/templates/Dockerfile.j2`

```diff
- openssl-3.0.7 \
+ openssl \
```

Remove the hard-coded version and use the one from the repository.

### 1.2 Fix Django Dependency Conflict

**File:** `requirements/requirements.txt`

```diff
- Django==4.2.10
+ Django==4.2.16
```

**File:** `requirements/requirements.txt`

```diff
- sqlparse==0.5.1
+ sqlparse==0.5.2
```

Update `django-ansible-base` to a compatible version. Cherry-pick the fix from PR #15596.

### 1.3 Fix Python 3.12.8+ / 3.13 Argparse Crash

**File:** `awx/main/utils/common.py` (or wherever `HelpfulArgumentParser` is located)

Cherry-pick the fix from PR #15692 - add the `intermixed` parameter to the override method:

```python
# Before (broken on Python 3.12.8+):
def _parse_known_args(self, arg_strings, namespace):

# After:
def _parse_known_args(self, arg_strings, namespace, intermixed=False):
```

### 1.4 Add VERSION File

```bash
echo "24.6.2-custom" > VERSION
```

### 1.5 Validation

```bash
make docker-compose-build    # Must pass without errors
make docker-compose           # Must start up
make test_unit               # All tests must pass
```

---

## Phase 2: Base Image Modernization (Week 4-6)

Goal: Move from CentOS Stream 9 to a more modern base image.

### 2.1 Dual Base Image Support

Create an alternative Dockerfile for Ubuntu 24.04:

**File:** `tools/ansible/roles/dockerfile/templates/Dockerfile.ubuntu.j2`

Key differences compared to CentOS:

- `apt` instead of `dnf`
- Different package names (e.g., `libpq-dev` instead of `postgresql-devel`)
- Python 3.12 comes from the system (no need for `dnf module`)
- Node.js 20 from NodeSource repository

```dockerfile
FROM ubuntu:24.04 AS base

RUN apt-get update && apt-get install -y \
    python3.12 python3.12-venv python3.12-dev \
    python3-pip \
    libpq-dev libxml2-dev libxslt1-dev \
    libffi-dev libssl-dev \
    git curl wget \
    nginx \
    && rm -rf /var/lib/apt/lists/*
```

### 2.2 Makefile Support for Both Images

```makefile
# Add to Makefile
BASE_IMAGE ?= centos  # or ubuntu
ifeq ($(BASE_IMAGE),ubuntu)
    DOCKERFILE_TEMPLATE = Dockerfile.ubuntu.j2
else
    DOCKERFILE_TEMPLATE = Dockerfile.j2
endif
```

### 2.3 Multi-arch Build

Add `docker buildx` support for AMD64 and ARM64:

```bash
make docker-compose-buildx ARCH="linux/amd64,linux/arm64"
```

---

## Phase 3: Dependency Modernization (Week 6-10)

Goal: Update all dependencies to the latest compatible versions.

### 3.1 Strategy

**Do NOT update everything at once.** Work in groups with testing after each group:

| Priority | Group              | Packages                                     |
| -------- | ------------------ | -------------------------------------------- |
| 1        | Core Framework     | Django 4.2.16 → 5.2.x, DRF, Channels, Daphne |
| 2        | Database and Cache | psycopg, redis, hiredis                      |
| 3        | Cryptography       | cryptography, pyopenssl, pyjwt, pynacl       |
| 4        | Async/Network      | aiohttp, twisted, autobahn                   |
| 5        | Cloud Providers    | boto3, azure-\*, kubernetes, openshift       |
| 6        | Observability      | opentelemetry-\*, prometheus-client          |
| 7        | Other              | all remaining ~130 packages                  |

### 3.2 Django Upgrade Path

This is the most critical change. I suggest a two-step approach:

**Step A:** Django 4.2.10 → 4.2.16 (minor bump, minimal risk)

- Fixes the dependency conflict with `django-ansible-base`
- Does not introduce breaking changes (LTS version)
- Test: `make test_unit && make test_coverage`

**Step B:** Django 4.2.16 → 5.2.x (major bump, higher risk)

- Needed only if Python 3.13 support is desired
- Breaking changes in Django 5.x:
  - `DEFAULT_AUTO_FIELD` must be explicitly set
  - Deprecated `django.utils.timezone.utc` (use `datetime.timezone.utc`)
  - Changes in `Form` and `ModelForm` rendering
  - `HttpResponse.headers` dictionary access instead of `__setitem__`
- Requires review of every AWX Django model and view

### 3.3 Node.js Upgrade

```diff
# In Dockerfile template:
- dnf module enable nodejs:18
+ # For CentOS:
+ dnf module enable nodejs:20
+ # For Ubuntu:
+ curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
+ apt-get install -y nodejs
```

Run UI build and verify:

```bash
make clean/ui ui
```

### 3.4 Dependency Tracking Tool

Use `pip-audit` for security checks:

```bash
pip install pip-audit
pip-audit -r requirements/requirements.txt
```

Use `pip-compile` (from `pip-tools`) for consistent resolution:

```bash
pip install pip-tools
pip-compile requirements/requirements.in --output-file requirements/requirements.txt
```

---

## Phase 4: Docker Compose Production Setup (Week 10-13)

Goal: Create a more official docker-compose for production since that is what the community demands.

### 4.1 Architecture

```
                    ┌─────────┐
                    │  Nginx  │:443/:80
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
        ┌─────┴────┐ ┌──┴───┐ ┌───┴─────┐
        │ AWX Web  │ │ AWX  │ │  AWX    │
        │ (API/UI) │ │ Task │ │Receptor │
        └─────┬────┘ └──┬───┘ └───┬─────┘
              │         │         │
    ┌─────────┼─────────┼─────────┘
    │         │         │
┌───┴────┐ ┌─┴──┐ ┌───┴────────┐
│Postgres│ │Redis│ │ Receptor   │
│  15    │ │  7  │ │  Worker(s) │
└────────┘ └────┘ └────────────┘
```

### 4.2 Key Files

```
awx-docker-prod/
├── docker-compose.yml          # Main compose file
├── docker-compose.override.yml # Local overrides
├── .env                        # Environment variables
├── nginx/
│   ├── nginx.conf              # Nginx configuration
│   └── ssl/                    # TLS certificates
├── settings/
│   ├── settings.py             # AWX custom settings
│   ├── credentials.py          # Credential configuration
│   └── receptor.conf           # Receptor configuration
├── backup/
│   └── backup.sh               # Backup script for PostgreSQL
└── scripts/
    ├── init.sh                 # Initialization (migrations, admin user)
    ├── healthcheck.sh          # Health check script
    └── upgrade.sh              # Upgrade procedure
```

### 4.3 AWX Settings.py

Create a custom `settings.py` that AWX loads:

```python
# settings/settings.py
DATABASES = {
    'default': {
        'ATOMIC_REQUESTS': True,
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DATABASE_NAME', 'awx'),
        'USER': os.environ.get('DATABASE_USER', 'awx'),
        'PASSWORD': os.environ.get('DATABASE_PASSWORD', ''),
        'HOST': os.environ.get('DATABASE_HOST', 'postgres'),
        'PORT': os.environ.get('DATABASE_PORT', '5432'),
    }
}

CACHES = {
    'default': {
        'BACKEND': 'awx.main.cache.AWXRedisCache',
        'LOCATION': 'redis://redis:6379/1',
    }
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [('redis', 6379)],
            'capacity': 10000,
        },
    },
}

BROADCAST_WEBSOCKET_PORT = 8052
BROADCAST_WEBSOCKET_PROTOCOL = 'http'
```

### 4.4 Backup Strategy

```bash
#!/bin/bash
# backup/backup.sh
BACKUP_DIR="/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# PostgreSQL dump
docker compose exec -T postgres pg_dump -U awx awx | gzip > "$BACKUP_DIR/awx_db.sql.gz"

# AWX secret key
cp .env "$BACKUP_DIR/env.backup"

# Projects
tar czf "$BACKUP_DIR/projects.tar.gz" -C volumes/ projects/

echo "Backup saved to: $BACKUP_DIR"
```

---

## Phase 5: Testing and QA (Week 13-16)

### 5.1 Test Matrix

| Test Type     | Tool               | What is Tested                              |
| ------------- | ------------------ | ------------------------------------------- |
| Unit          | pytest             | API, models, serializers, utility functions |
| Integration   | pytest + Docker    | Full stack with real database and Redis     |
| UI            | Cypress/Playwright | Frontend workflows                          |
| API           | pytest + requests  | REST API endpoints                          |
| Performance   | locust/k6          | Concurrent users, job throughput            |
| Security      | pip-audit, Trivy   | CVE scanning of dependencies and images     |
| Compatibility | tox                | Python 3.11, 3.12, 3.13                     |

### 5.2 Minimum Acceptance Criteria

Before each release, the following MUST work:

1. **Build:** `make docker-compose-build` without errors on both base images
2. **Start:** `docker compose up` starts all services without crashes
3. **Login:** Admin can log in to the Web UI
4. **Job:** An Ansible playbook can be created and run
5. **Inventory:** An inventory can be added and synced (static + dynamic)
6. **Credentials:** A credential can be created and used
7. **API:** All CRUD endpoints work (`/api/v2/`)
8. **WebSocket:** Real-time log streaming works during jobs
9. **Backup/Restore:** PostgreSQL dump and restore work
10. **Upgrade:** Migration from the previous version works without data loss

### 5.3 Performance Baseline

Establish a performance baseline on standard hardware (4 CPU, 8GB RAM):

| Metric                  | Target       |
| ----------------------- | ------------ |
| Startup time            | < 60 seconds |
| Login response          | < 500ms      |
| API listing (100 items) | < 1s         |
| Job launch latency      | < 5s         |
| Concurrent users        | >= 20        |
| Concurrent jobs         | >= 10        |

---

## Phase 6: Versioning and Release (Week 16-17)

### 6.1 Versioning Scheme

I suggest CalVer (calendar-based) since Red Hat plans the same:

```
Format: YYYY.MM.PATCH
Example: 2026.03.0, 2026.03.1 (hotfix)
```

### 6.2 Release Process

```
1. Feature freeze (one week before release)
2. Create release branch: release/2026.03
3. Run the full test matrix
4. Fix blocker bugs
5. Tag: git tag -a v2026.03.0
6. Build production images
7. Push to container registry (ghcr.io or quay.io)
8. Update AWX Operator with the new version
9. Write release notes
10. Publish on GitHub Releases
```

### 6.3 Container Registry

```bash
# Build and push
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/USERNAME/awx:2026.03.0 \
  --tag ghcr.io/USERNAME/awx:latest \
  --push .
```

---

## Phase 7: Upstream Sync Strategy (Continuous)

### 7.1 Tracking Upstream

The AWX devel branch is still being developed. We need to sync regularly:

```bash
# Add upstream remote
git remote add upstream https://github.com/ansible/awx.git

# Weekly sync
git fetch upstream devel
git log --oneline upstream/devel..HEAD  # See differences

# Cherry-pick relevant commits
git cherry-pick <commit-hash>
```

### 7.2 What to Track from Upstream

- **Always:** Security fixes (CVE)
- **Always:** Bug fixes for existing functionality
- **Selectively:** New features from the service architecture
- **Carefully:** Large refactoring commits (can break stability)

### 7.3 Contribute Back

Send all generic fixes (not specific to our fork) as PRs upstream:

```bash
git checkout -b fix/openssl-pinning upstream/devel
# Make the fix
git push origin fix/openssl-pinning
# Create a PR on github.com/ansible/awx
```

---

## Phase 8: Production Docker Deploy (Week 17-20)

### 8.1 Server Requirements

| Component      | Minimum                  | Recommended      |
| -------------- | ------------------------ | ---------------- |
| CPU            | 4 cores                  | 8 cores          |
| RAM            | 8 GB                     | 16 GB            |
| Disk           | 40 GB SSD                | 100 GB SSD       |
| OS             | Ubuntu 22.04+ / Rocky 9+ | Ubuntu 24.04 LTS |
| Docker         | 24.0+                    | 27.0+            |
| Docker Compose | v2.20+                   | v2.30+           |

### 8.2 Server Deploy Script

```bash
#!/bin/bash
# deploy.sh - Single-command deploy on a bare server

# 1. Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker --now

# 2. Clone our configuration
git clone https://github.com/USERNAME/awx-docker-prod.git /opt/awx
cd /opt/awx

# 3. Configuration
cp .env.example .env
# Edit .env with actual values

# 4. Start
docker compose up -d

# 5. Initialization
docker compose exec forge-web awx-manage migrate --noinput
docker compose exec forge-web awx-manage createsuperuser \
  --username admin --email admin@example.com --noinput
docker compose exec forge-web awx-manage update_password \
  --username admin --password "$ADMIN_PASSWORD"
```

### 8.3 Monitoring

Add Prometheus metrics and Grafana dashboard:

```yaml
# docker-compose.override.yml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

AWX already has built-in OpenTelemetry and Prometheus support - it just needs scraping configured.

---

## Alternative: Use Ascender Instead of a Fork

Before starting with our own fork, it is worth considering **Ascender**:

| Aspect        | Our Fork               | Ascender                           |
| ------------- | ---------------------- | ---------------------------------- |
| Version       | Based on 24.6.1        | 25.3.3 (Feb 2026)                  |
| Maintenance   | By ourselves           | CIQ team (Rocky Linux)             |
| Base Image    | CentOS/Ubuntu          | Rocky Linux 9                      |
| Deploy        | Docker + K8s           | K8s (multiple distros) + Single VM |
| Support       | Community              | Commercial option                  |
| Upstream sync | Manual                 | Regular                            |
| Risk          | High (self-maintained) | Low (professional team)            |

**Recommendation:** If the goal is just to run AWX on a new server, Ascender is a more pragmatic choice. If the goal is learning and full control, a custom fork makes sense.

---

## Timeline

```
Week  1-2:   Phase 1 - Build stabilization                ✓ COMPLETED
Week  2-3:   Phase 2 - Rebranding (Forge)                 ✓ COMPLETED
Week  3-6:   Phase 3 - Dependency modernization            ✓ COMPLETED
Week  6-12:  Phase 4 - Backend refactoring                 ✓ COMPLETED
Week 12-18:  Phase 5 - Frontend refactoring                ✓ COMPLETED
Week 18-20:  Phase 6 - Dockerfile modernization            ✓ COMPLETED
Week 20-22:  Phase 7 - Docker Compose production           ✓ COMPLETED
Week 22-24:  Phase 8 - Testing and QA                      ✓ COMPLETED
Week 24-25:  Phase 9 - Release (2026.03.0)                 → IN PROGRESS
```

**Total: ~20 weeks (5 months) for a single developer.**
With a team of 2-3 people, it can be reduced to 2-3 months.

---

## Resources and References

- [AWX GitHub](https://github.com/ansible/awx)
- [AWX Operator GitHub](https://github.com/ansible/awx-operator)
- [AWX on K3s (kurokobo)](https://github.com/kurokobo/awx-on-k3s)
- [Ascender (CIQ fork)](https://github.com/ctrliq/ascender)
- [AWX Refactoring Plan - Ansible Forum](https://forum.ansible.com/t/refactoring-awx-into-a-pluggable-service-oriented-architecture/7404)
- [AWX Future - Ansible Forum](https://forum.ansible.com/t/is-there-a-future-for-awx/44527)
- [Migration to AAP 2.5 - Red Hat](https://developers.redhat.com/articles/2025/08/13/migrating-configurations-awx-24-aap-25)
- [AWX without Kubernetes - Hetzner](https://community.hetzner.com/tutorials/awx-without-kubernetes/)
