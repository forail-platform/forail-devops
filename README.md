# Forail DevOps

[![CI](https://github.com/forail-platform/forail-devops/actions/workflows/ci.yml/badge.svg)](https://github.com/forail-platform/forail-devops/actions/workflows/ci.yml)

Deployment, infrastructure, and CI/CD for the Forail platform.

## Overview

This repo contains everything needed to deploy the Forail platform:
- Docker Compose configuration (production + development)
- Nginx reverse proxy
- SSL/TLS (Let's Encrypt)
- Backup/restore scripts
- CI/CD pipeline configuration
- Health check scripts
- Receptor mesh configuration

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/forail-platform/forail-devops.git
cd forail-devops

# 2. Configure environment
cp .env.example .env
# Edit .env with real values

# 3. Start
docker compose up -d

# 4. Check health
./scripts/healthcheck-web.sh
```

## Architecture

```
┌──────────────┐     ┌───────────────┐
│ forail-backend│     │ forail-frontend│
│   (Django)   │     │   (React)     │
└──────┬───────┘     └──────┬────────┘
       │                     │
       ▼                     ▼
┌─────────────────────────────────────┐
│          Docker Registry            │
└─────────────────┬───────────────────┘
                  │
                  ▼
       ┌─────────────────┐
       │   forail-devops   │
       │ docker-compose   │
       └────────┬────────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│ nginx  │ │postgres│ │ redis  │
└────────┘ └────────┘ └────────┘
```

## Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| nginx | nginx:latest | 443, 80 | Reverse proxy, SSL termination |
| forail-web | ghcr.io/forail-platform/forail-backend | 8013 | Django API + uWSGI |
| forail-task | ghcr.io/forail-platform/forail-backend | - | Celery worker + Dispatcher |
| postgres | postgres:15 | 5432 | Database |
| redis | redis:7 | 6379 | Cache + message broker |

## Structure

```
forail-devops/
├── docker-compose.yml       # Production stack
├── docker-compose.dev.yml   # Development stack
├── docker/                  # Dockerfile templates
├── nginx/                   # Nginx configuration + SSL
├── receptor/                # Receptor mesh configuration
├── scripts/                 # Backup, restore, health checks
├── settings/                # Django production settings
├── docs/                    # All documentation
├── .env.example             # Environment template
└── .github/workflows/       # GitHub Actions CI/CD
```

## Documentation

### Deployment
- [Architecture Overview](docs/01-architecture-overview.md)
- [Docker Deployment](docs/07-docker-deployment.md)
- [CI/CD Pipeline](docs/08-ci-cd-pipeline.md)
- [CI Pipeline Reference](docs/ci-pipeline-reference.md)
- [Contributing Guide](docs/10-contributing-guide.md)

### Plans
- [Separation Plan](docs/plan_separation.md)
- [Development Plan](docs/plan_development.md)
- [Detailed Plan](docs/plan_detailed.md)
- [Future Development](docs/future_development_plan.md)
- [Chat/AI Assistant Plan](docs/chat_plan.md)
- [Mobile App Plan](docs/mobile_plan.md)

### Release
- [Release Notes v2026.03.0](docs/RELEASE_NOTES_v2026.03.0.md)
- [Start & Run Guide](docs/startrun.md)

## Backup & Restore

```bash
# Backup
./scripts/backup.sh

# Restore
./scripts/restore.sh /path/to/backup.sql.gz
```

## Related Repositories

- [forail-backend](https://github.com/forail-platform/forail-backend) — Django API + Task Engine
- [forail-frontend](https://github.com/forail-platform/forail-frontend) — React UI

## Project History

The Forail platform is a modernized fork of [Ansible AWX](https://github.com/ansible/awx), licensed under the Apache License 2.0. See [forail-backend/NOTICE](https://github.com/forail-platform/forail-backend/blob/main/NOTICE) for full attribution.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE).
