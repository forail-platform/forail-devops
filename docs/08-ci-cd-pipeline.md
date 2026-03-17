# 08 — CI/CD Pipeline

Forge Platform uses a centralized Jenkins pipeline in `forge-deploy` that orchestrates
builds across all three repositories: `forge-backend`, `forge-frontend`, and `forge-deploy`.

---

## Pipeline Overview

```
┌──────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌──────────┐   ┌─────────┐
│ Checkout │──►│  Lint  │──►│  Test  │──►│ Build  │──►│ Security │──►│ Release │
└──────────┘   └────────┘   └────────┘   └────────┘   └──────────┘   └─────────┘
  clone          flake8       pytest       docker        pip-audit      docker push
  backend +      tsc          vitest       build         trivy          DockerHub
  frontend
```

## Pipeline Stages

| Stage | What it does | Fails if... |
|-------|-------------|-------------|
| Checkout | Clone `forge-backend` and `forge-frontend` repos (parallel) | Git auth fails |
| Lint (Python) | `flake8 forge/` in backend | PEP8 errors |
| Lint (Frontend) | `tsc --noEmit` in frontend | TypeScript type errors |
| Test (Python) | `pytest forge/main/tests/unit/` | Any test fails |
| Test (Frontend) | `npx vitest run` | Any test fails |
| Build Backend | `docker build` → `krlex/forge-backend` | Build error |
| Build Frontend | `docker build` → `krlex/forge-frontend` | Build error |
| Security (pip-audit) | CVE scan on Python deps | Critical CVE |
| Security (Trivy) | Container image scan (backend + frontend) | CRITICAL CVE |
| Release | `docker push` to DockerHub | Only on `main` or tags |

### Stage Conditions

| Stage | When it runs |
|-------|-------------|
| Checkout, Lint, Test | Every push / PR |
| Build, Security | `main`, `devel`, or tag builds |
| Release | `main` branch or tag builds |

---

## Jenkins Credentials Required

| Credential ID | Type | Description |
|---------------|------|-------------|
| `forge-git-creds` | SSH Key | Access to `git.cloudforyour.work` repos |
| `forge-dockerhub-creds` | Username/Password | DockerHub login (`krlex`) |

---

## Docker Images

| Image | Source | Description |
|-------|--------|-------------|
| `krlex/forge-backend:latest` | `forge-backend/Dockerfile` | Django API + task engine |
| `krlex/forge-backend:<version>` | Same | Version-tagged |
| `krlex/forge-frontend:latest` | `forge-frontend/Dockerfile` | React SPA + nginx |
| `krlex/forge-frontend:<version>` | Same | Version-tagged |

---

## Versioning

Forge uses **CalVer** (Calendar Versioning):

```
YYYY.MM.PATCH
2026.03.0     # First release of March 2026
2026.03.1     # Patch release
2026.04.0     # April release
```

The version is derived from the git tag on `forge-deploy`:
```bash
git tag -a v2026.03.0 -m "Forge 2026.03.0"
git push origin v2026.03.0
# Jenkins automatically: checkout → lint → test → build → security → push to DockerHub
```

---

## Running CI Locally

### Backend

```bash
cd forge-backend

# Lint
flake8 forge/ --count --statistics

# Tests
DJANGO_SETTINGS_MODULE=forge.settings.development \
  python -m pytest forge/main/tests/unit/ -q

# Security
pip install pip-audit && pip-audit -r requirements/requirements.txt

# Build image
docker build -t krlex/forge-backend:latest .
```

### Frontend

```bash
cd forge-frontend

# Lint
npx tsc --noEmit

# Tests
npx vitest run

# Build image
docker build -t krlex/forge-frontend:latest .
```

---

## Release Process

1. Ensure all tests pass on both backend and frontend
2. Update docs and release notes
3. Commit to `forge-deploy`: `git commit -m "chore: prepare release v2026.04.0"`
4. Tag: `git tag -a v2026.04.0 -m "Forge 2026.04.0"`
5. Push tag: `git push origin v2026.04.0`
6. Jenkins automatically:
   - Checks out `forge-backend` and `forge-frontend` (same branch/tag)
   - Runs lint + tests on both
   - Builds Docker images with version tag
   - Scans for vulnerabilities
   - Pushes `krlex/forge-backend:<version>` and `krlex/forge-frontend:<version>` to DockerHub

### Watch out

- **Never release without passing tests.**
- **Tag format must have `v` prefix:** `v2026.03.0`, not `2026.03.0`.
- **DockerHub login** must be configured in Jenkins credentials before the first release.
- **Both repos must have a matching branch** — pipeline checks out the same branch name from all repos.
