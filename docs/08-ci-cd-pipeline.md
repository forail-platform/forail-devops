# 08 — CI/CD Pipeline

Forail Platform uses **GitHub Actions** as the public CI/CD pipeline. Each repository has its own workflow in `.github/workflows/` that runs on push and pull request.

---

## Pipeline Overview

```
┌──────────┐   ┌────────┐   ┌────────┐   ┌────────┐   ┌──────────┐   ┌─────────┐
│ Checkout │──►│  Lint  │──►│  Test  │──►│ Build  │──►│ Security │──►│ Release │
└──────────┘   └────────┘   └────────┘   └────────┘   └──────────┘   └─────────┘
  GitHub         ruff /        pytest /     docker        pip-audit      docker push
  Actions        tsc           vitest       build         trivy          ghcr.io/forail-platform
```

Each repo's workflow file: **`.github/workflows/ci.yml`**

## Pipeline Stages

| Stage                | What it does                                                      | Fails if...                       |
| -------------------- | ----------------------------------------------------------------- | --------------------------------- |
| Checkout             | `actions/checkout@v4` clones the repo on the runner               | Repo unreachable                  |
| Lint (Python)        | `ruff check` in backend / assistant                               | Lint errors                       |
| Lint (Frontend)      | `tsc --noEmit` + ESLint                                           | TypeScript type errors            |
| Test (Python)        | `pytest` against `tests_standalone/` (no DB needed for fast path) | Any test fails                    |
| Test (Frontend)      | `vitest run`                                                      | Any test fails                    |
| Build                | `docker build` to produce the release image                       | Build error                       |
| Security (pip-audit) | CVE scan on Python dependencies                                   | Critical CVE                      |
| Security (Trivy)     | Container image scan                                              | CRITICAL CVE                      |
| Release              | `docker push` to `ghcr.io/forail-platform/*`                        | Only on `main` branch or tag push |

### Stage Conditions

| Stage                | When it runs                                            |
| -------------------- | ------------------------------------------------------- |
| Checkout, Lint, Test | Every push / PR                                         |
| Build, Security      | `main` branch builds and tag builds                     |
| Release              | `main` branch builds and tag builds (push to `ghcr.io`) |

---

## GitHub Actions Secrets

For the release stage, each repo needs the following secret:

| Secret         | Description                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN` | Provided automatically by GitHub Actions. Used with the built-in `permissions: packages: write` to push to `ghcr.io/forail-platform/*` |

No third-party credentials are required — everything runs in the GitHub-hosted runner with built-in tokens.

---

## Docker Images

| Image                                            | Source                       | Description                           |
| ------------------------------------------------ | ---------------------------- | ------------------------------------- |
| `ghcr.io/forail-platform/forail-backend:latest`     | `forail-backend/Dockerfile`   | Django API + task engine              |
| `ghcr.io/forail-platform/forail-backend:<version>`  | Same                         | Version-tagged (CalVer)               |
| `ghcr.io/forail-platform/forail-frontend:latest`    | `forail-frontend/Dockerfile`  | React SPA + nginx                     |
| `ghcr.io/forail-platform/forail-frontend:<version>` | Same                         | Version-tagged                        |
| `ghcr.io/forail-platform/forail-assistant:latest`   | `forail-assistant/Dockerfile` | FastAPI + Ollama + ChromaDB (preview) |
| `ghcr.io/forail-platform/forail-operator:<version>` | `forail-operator/Dockerfile`  | Kubernetes operator                   |

All images are **public** — no pull secret required for `docker pull` or `helm install`.

---

## Versioning

Forail uses **CalVer** (Calendar Versioning):

```
YYYY.MM.PATCH
2026.03.0     # First release of March 2026
2026.03.1     # Patch release
2026.04.0     # April release
```

The version is derived from the git tag on `forail-deploy`:

```bash
git tag -a v2026.05.0 -m "Forail 2026.05.0"
git push origin v2026.05.0
# GitHub Actions automatically: checkout → lint → test → build → security → push to ghcr.io
```

---

## Running CI Locally

### Backend

```bash
cd forail-backend

# Lint
ruff check forail/

# Tests
DJANGO_SETTINGS_MODULE=forail.settings.development \
  python -m pytest forail/main/tests/unit/ -q

# Security
pip install pip-audit && pip-audit -r requirements/requirements.txt

# Build image
docker build -t ghcr.io/forail-platform/forail-backend:latest .
```

### Frontend

```bash
cd forail-frontend

# Lint
npx tsc --noEmit

# Tests
npx vitest run

# Build image
docker build -t ghcr.io/forail-platform/forail-frontend:latest .
```

---

## Release Process

1. Ensure all tests pass on both backend and frontend (GitHub Actions on PR/push must be green)
2. Update docs and release notes
3. Commit to `forail-deploy`: `git commit -m "chore: prepare release v2026.05.0"`
4. Tag: `git tag -a v2026.05.0 -m "Forail 2026.05.0"`
5. Push tag: `git push origin v2026.05.0`
6. GitHub Actions automatically:
   - Runs lint + tests
   - Builds Docker images with version tag
   - Scans for vulnerabilities
   - Pushes `ghcr.io/forail-platform/forail-backend:<version>` and friends to GHCR

### Watch out

- **Never release without passing tests.**
- **Tag format must have `v` prefix:** `v2026.05.0`, not `2026.05.0`.
- **Image visibility** — when a new package is first pushed to `ghcr.io`, GitHub creates it as **private** by default. You must manually flip it to public via the Packages settings (`https://github.com/orgs/forail-platform/packages`).
