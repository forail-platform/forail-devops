# Forge 2026.03.0 — Release Notes

**Release date:** 2026-03-11
**Based on:** AWX 24.6.1
**License:** Apache License 2.0

---

## Overview

Forge 2026.03.0 is the first official release — a complete modernization of AWX 24.6.1 across 9 development phases spanning 25 weeks. Every layer has been upgraded: dependencies, backend, frontend, Docker images, deployment stack, and CI/CD.

---

## Highlights

### Modern Stack

- **Python 3.12** (from 3.11)
- **Node.js 20** (from 18)
- **Django 4.2.17** with 40+ upgraded packages
- **React 18 + TypeScript + Vite + Tailwind CSS** (new Forge UI)
- **Channels 4 / Daphne 4 / Cython 3** migration completed

### New Forge UI

- Complete rewrite in React 18 with TypeScript
- Vite build system (replaces CRA/react-scripts)
- Tailwind CSS for styling (replaces PatternFly 4 + Styled Components)
- Dashboard with real-time job status, host counts, project health
- Full CRUD for all major resources (templates, credentials, projects, inventories, hosts, organizations, teams, users, notification templates, schedules)
- Job output streaming with ANSI color support
- Workflow visualizer (read-only)
- Survey editor for job/workflow templates
- Copy/clone support for templates, credentials, notifications
- Settings management UI with per-category editing
- Force password change on first superuser login
- Legacy UI preserved at `/ui_legacy/`

### Production Docker Compose

- 6-service deployment: PostgreSQL 15, Redis 7, init, web, task, Nginx
- TLS termination via Nginx reverse proxy
- Automated backup/restore scripts
- Health checks on all services
- Environment-based configuration (`.env.example` template)

### Dual Docker Images

- **CentOS Stream 9** — 882MB (`forge:2026.03.0-centos`)
- **Ubuntu 24.04** — 932MB (`forge:2026.03.0-ubuntu`)

### CI/CD Pipelines

- **GitLab CI** (`.gitlab-ci.yml`) — 5 stages: lint, test, build, security, release
- **Jenkins** (`Jenkinsfile`) — equivalent pipeline with parallel stages
- Version derived from git tag (`v2026.03.0` → `2026.03.0`)
- Automated Harbor registry push on tag release
- pip-audit + Trivy security scanning integrated

---

## Quality Metrics

| Category                | Result                            |
| ----------------------- | --------------------------------- |
| Python unit tests       | 1237 passed, 0 failed             |
| Frontend unit tests     | 42 passed, 0 failed               |
| Functional API tests    | 989 passed, 0 failed, 1 skipped   |
| Python lint (flake8)    | 0 errors                          |
| Frontend lint (tsc)     | 0 errors                          |
| Python CVEs (pip-audit) | 15 remaining (0 critical runtime) |
| Container CVEs (Trivy)  | 0 CRITICAL                        |

---

## Breaking Changes

- **Minimum Python version**: 3.12 (was 3.11)
- **Minimum Node.js version**: 20 (was 18)
- **CalVer versioning**: version scheme changed from SemVer (`24.6.x`) to CalVer (`2026.03.0`)
- **aioredis removed**: replaced by redis-py (channels 4 migration)
- **async-timeout removed**: Python 3.12 has `asyncio.timeout` built-in
- **Frontend**: new Forge UI at `/`, legacy AWX UI moved to `/ui_legacy/`

---

## Dependency Changes (Major)

| Package            | Before  | After   |
| ------------------ | ------- | ------- |
| Django             | 4.2.10  | 4.2.17  |
| channels           | 3.0.5   | 4.1.0   |
| daphne             | 3.0.2   | 4.1.2   |
| cryptography       | 41.0.7  | 42.0.8  |
| Cython             | 0.29.37 | 3.0.11  |
| grpcio             | 1.62.2  | 1.67.1  |
| twisted            | 24.3.0  | 24.7.0  |
| boto3              | 1.34.42 | 1.35.36 |
| redis              | 5.0.1   | 5.2.1   |
| aiohttp            | 3.9.3   | 3.10.10 |
| psutil             | 5.9.8   | 6.1.0   |
| pip (build)        | 21.2.4  | 24.0    |
| setuptools (build) | 69.0.2  | 70.0.0  |

---

## Build Fixes Applied

1. OpenSSL version pin removed (CentOS Stream 9 repo changes)
2. Rsyslog version pin removed
3. django-ansible-base pinned to stable `2024.9.4` (was `@devel`)
4. Argparse crash fix for Python 3.12.8+ (`_parse_known_args` intermixed parameter)
5. Ubuntu Dockerfile: npm package, pkg-config, bash brace expansion, storage.conf lookup
6. pip hash reset after Node.js upgrade in Dockerfile

---

## Deployment

### Quick Start (Docker Compose)

```bash
cd tools/docker-compose-prod
cp .env.example .env
# Edit .env with your secrets
docker compose up -d
```

### Docker Images

```bash
# CentOS (default)
docker pull forge:2026.03.0

# Ubuntu
docker pull forge:2026.03.0-ubuntu
```

---

## Full Changelog

See [CHANGELOG.md](../CHANGELOG.md) for the complete list of changes across all 9 phases.
