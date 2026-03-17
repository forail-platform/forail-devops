# Project Separation Plan — Separate Repositories

## Overview

The Forge platform currently resides in a single monorepo. This plan defines the separation into **5 independent repositories** connected through CI/CD pipelines.

```
forge-platform/
├── forge-backend        ← Django API + Task Engine + Celery
├── forge-frontend       ← React UI (Vite + Tailwind)
├── forge-devops         ← Docker, Compose, Nginx, CI/CD, infra
├── forge-assistant      ← Ollama + ChromaDB RAG (future)
└── forge-mobile         ← Android/iOS app (future)
```

---

## Phase 1: forge-backend

**Repo:** `forge-platform/forge-backend`

### What goes in:
| Source (current monorepo) | Destination in new repo |
|---|---|
| `forge/` (Python package) | `forge/` |
| `forge/main/`, `forge/api/`, `forge/conf/`, `forge/sso/` | Same |
| `forge/settings/` | `forge/settings/` |
| `manage.py` | `manage.py` |
| `requirements/` | `requirements/` |
| `tools/` (management scripts) | `tools/` |
| `setup.cfg`, `setup.py`, `pyproject.toml` | Root |

### Documentation included with backend:
- `docs/wiki/02-backend-django.md`
- `docs/wiki/04-task-engine.md`
- `docs/wiki/05-authentication-rbac.md`
- `docs/wiki/06-database-schema.md`
- `docs/wiki/09-testing-guide.md` (Python section)
- `docs/wiki/11-api-reference.md`
- `docs/wiki/12-configuration-reference.md`

### CI/CD for backend repo:
```yaml
# .gitlab-ci.yml
stages:
  - lint        # flake8
  - test        # pytest (unit + functional)
  - build       # Docker image (forge-backend:tag)
  - security    # pip-audit, trivy
  - publish     # Push image to registry
```

### Artifact:
- Docker image: `krlex/forge-backend:<version>`
- API documentation (auto-generated)

---

## Phase 2: forge-frontend

**Repo:** `forge-platform/forge-frontend`

### What goes in:
| Source (current monorepo) | Destination in new repo |
|---|---|
| `src/` (React application) | `src/` |
| `public/` | `public/` |
| `index.html` | `index.html` |
| `package.json`, `package-lock.json` | Root |
| `vite.config.ts` | Root |
| `tailwind.config.ts` | Root |
| `tsconfig.json`, `tsconfig.*.json` | Root |
| `postcss.config.js` | Root |
| `.eslintrc.*` | Root |

### Documentation included with frontend:
- `docs/wiki/03-frontend-react.md`
- `docs/wiki/09-testing-guide.md` (Frontend section)

### CI/CD for frontend repo:
```yaml
# .gitlab-ci.yml
stages:
  - lint        # tsc --noEmit, eslint
  - test        # vitest
  - build       # vite build → static bundle
  - publish     # Upload artifact or Docker image with nginx
```

### Artifact:
- Build folder (`dist/`) — static files
- Optional Docker image: `krlex/forge-frontend:<version>` (nginx + static files)

### Configuration:
- API URL is configured via environment variable (`VITE_API_URL`)
- Frontend builds independently from the backend
- Proxy configuration in `vite.config.ts` for development

---

## Phase 3: forge-devops

**Repo:** `forge-platform/forge-devops`

### What goes in:
| Source (current monorepo) | Destination in new repo |
|---|---|
| `Dockerfile`, `Dockerfile.*` | `docker/` |
| `docker-compose.yml` | Root |
| `nginx/` configuration | `nginx/` |
| `Vagrantfile` | `vagrant/` |
| Deployment scripts | `scripts/` |
| SSL/TLS configuration | `ssl/` |

### Documentation included with devops:
- `docs/wiki/01-architecture-overview.md`
- `docs/wiki/07-docker-deployment.md`
- `docs/wiki/08-ci-cd-pipeline.md`
- `docs/wiki/10-contributing-guide.md`
- `docs/ci-pipeline-reference.md`
- `docs/startrun.md`
- `docs/RELEASE_NOTES_*.md`
- `docs/future_development_plan.md`

### Structure:
```
forge-devops/
├── docker/
│   ├── Dockerfile.backend      # Multi-stage for backend
│   ├── Dockerfile.frontend     # Multi-stage for frontend (nginx)
│   └── Dockerfile.assistant    # Ollama + RAG (future)
├── docker-compose.yml          # Production stack
├── docker-compose.dev.yml      # Development stack
├── nginx/
│   ├── nginx.conf
│   └── forge.conf
├── ssl/
│   └── letsencrypt.sh
├── scripts/
│   ├── backup.sh
│   ├── restore.sh
│   ├── health-check.sh
│   └── init.sh
├── vagrant/
│   └── Vagrantfile
├── docs/
│   └── (all deployment documentation)
├── .env.example
└── README.md
```

### Docker Compose (production):
```yaml
services:
  postgres:
    image: postgres:15
  redis:
    image: redis:7
  forge-backend:
    image: krlex/forge-backend:${VERSION}
  forge-frontend:
    image: krlex/forge-frontend:${VERSION}
  forge-task:
    image: krlex/forge-backend:${VERSION}   # same image, different entrypoint
  nginx:
    # reverse proxy → frontend + backend API
```

### CI/CD orchestration:
```
The forge-devops repo is the "glue" that:
1. Pulls backend and frontend image versions
2. Defines how to deploy to the server
3. Contains docker-compose for production
4. Contains backup/restore scripts
5. Contains health check and monitoring configuration
```

---

## Phase 4: forge-assistant (future)

**Repo:** `forge-platform/forge-assistant`

### Planned structure:
```
forge-assistant/
├── app/
│   ├── main.py              # FastAPI/Django app
│   ├── ollama_client.py     # Ollama LLM integration
│   ├── rag/
│   │   ├── indexer.py       # ChromaDB document indexing
│   │   └── retriever.py     # RAG retrieval
│   └── api/
│       └── assistant.py     # /api/v2/assistant/ endpoint
├── documents/               # Documents for RAG indexing
├── Dockerfile
├── requirements.txt
├── docker-compose.yml       # Ollama + ChromaDB + Assistant
└── docs/
    └── chat_plan.md
```

### Integration:
- Exposes an API consumed by the frontend (`/api/v2/assistant/`)
- SSE streaming for real-time responses
- ChromaDB for vector search over documentation
- Ollama for LLM inference (local, no cloud dependency)

---

## Phase 5: forge-mobile (future)

**Repo:** `forge-platform/forge-mobile`

### Planned structure:
```
forge-mobile/
├── android/
│   ├── app/src/main/kotlin/   # Kotlin + Jetpack Compose
│   └── build.gradle.kts
├── backend/                    # Go API for mobile-specific features
│   ├── cmd/server/main.go
│   ├── internal/
│   │   ├── auth/              # JWT + biometric verification
│   │   ├── push/              # FCM push notifications
│   │   └── approval/         # Deployment approval flow
│   └── go.mod
├── docs/
│   └── mobile_plan.md
└── .github/workflows/         # Android build + Go build
```

---

## How repositories connect (CI/CD integration)

### Versioning:
- All repos use **CalVer**: `YYYY.MM.PATCH` (e.g., `2026.03.1`)
- Git tags trigger the release pipeline
- `forge-devops` references versions from other repos

### Release flow:
```
1. Developer pushes code to forge-backend or forge-frontend
2. That repo's CI:
   - lint → test → build → security → publish Docker image
3. forge-devops is updated with the new version:
   - Manual: update VERSION in .env or docker-compose.yml
   - Automatic: webhook/trigger that updates the version
4. Deploy to server:
   - git pull forge-devops
   - docker compose pull
   - docker compose up -d
```

### Connection diagram:
```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│ forge-backend│     │ forge-frontend│     │forge-assistant│
│   (Django)   │     │   (React)     │     │  (Ollama)    │
└──────┬───────┘     └──────┬────────┘     └──────┬───────┘
       │ publish             │ publish              │ publish
       ▼                     ▼                      ▼
┌─────────────────────────────────────────────────────────┐
│              Docker Registry (DockerHub)                │
│  krlex/forge-backend   krlex/forge-frontend   krlex/... │
└─────────────────────────┬───────────────────────────────┘
                          │ pull
                          ▼
              ┌───────────────────────┐
              │     forge-devops      │
              │  docker-compose.yml   │
              │  nginx, ssl, scripts  │
              └───────────┬───────────┘
                          │ deploy
                          ▼
              ┌───────────────────────┐
              │   Production Server   │
              └───────────────────────┘
```

---

## Execution Order

| Step | Action | Priority |
|------|--------|----------|
| 1 | Create `forge-frontend` repo, extract React code | High |
| 2 | Create `forge-backend` repo, extract Django code | High |
| 3 | Create `forge-devops` repo, define Docker Compose | High |
| 4 | Set up CI/CD for each repo | High |
| 5 | Test end-to-end with separate images | High |
| 6 | Create `forge-assistant` repo | Medium |
| 7 | Create `forge-mobile` repo | Low |

### Steps 1-3: Separation (estimate: 1-2 weeks)
- Use `git filter-branch` or `git subtree split` to preserve history
- Update all references and paths
- Verify that each repo independently passes CI

### Steps 4-5: CI/CD integration (estimate: 1 week)
- GitLab CI for each repo
- Docker Hub publish for each repo
- `forge-devops` orchestration

### Steps 6-7: Future components
- Per `chat_plan.md` and `mobile_plan.md` timelines

---

## Notes

- **Monorepo remains as archive** — the current `awx` repo is kept in read-only mode as a reference
- **Documentation is split** — each repo gets its relevant documentation
- **Shared wiki** — `forge-devops` contains the architectural overview and links to all repositories
- **Docker images are the only artifact** — repos do not depend on each other directly, only via Docker images
- **Environment variables** — all inter-service configuration goes through env variables (12-factor app principle)
