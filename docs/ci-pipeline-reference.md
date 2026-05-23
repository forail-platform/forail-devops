# Forge CI/CD Pipeline — Reference Document

This document describes the intended production CI/CD pipeline for Forge.
The pipeline enforces code quality gates — code cannot be merged unless
all required stages pass.

---

## Pipeline Flow

```
push / MR                    git tag v*
    │                            │
    ▼                            ▼
┌────────┐                  ┌────────┐
│  Lint  │                  │  Lint  │
│ python │ ◄── parallel ──► │frontend│
└───┬────┘                  └───┬────┘
    │ must pass                 │ must pass
    ▼                           ▼
┌────────┐                  ┌────────┐
│  Test  │                  │  Test  │
│ python │ ◄── parallel ──► │frontend│
└───┬────┘                  └───┬────┘
    │ must pass                 │ must pass
    ▼                           ▼
┌────────────────────────────────────┐
│             Build                   │  (only on default branch + tags)
│   CentOS image  │  Ubuntu image    │
└───────────┬────────────────────────┘
            │ must pass
            ▼
┌────────────────────────────────────┐
│           Security                  │  (allow_failure: true)
│   pip-audit     │     Trivy        │
└───────────┬────────────────────────┘
            │
            ▼
┌────────────────────────────────────┐
│           Release                   │  (only on tags v*)
│   GitLab Registry  │    Harbor     │
│   (automatic)      │  (manual)     │
└────────────────────────────────────┘
```

---

## Stage Details

### Lint (required — blocks merge if fails)

| Job | Image | What it checks | Command |
|-----|-------|----------------|---------|
| `lint:python` | `python:3.12-slim` | PEP8, undefined names, unused imports | `flake8 forge/ --count --statistics` |
| `lint:frontend` | `node:20-slim` | TypeScript type errors | `npx tsc --noEmit` |

**Triggers:** Every push, every MR, every tag.

### Test (required — blocks merge if fails)

| Job | Image | Services | What it checks | Command |
|-----|-------|----------|----------------|---------|
| `test:python-unit` | `python:3.12-slim` | PostgreSQL 15, Redis 7 | 1083 unit tests | `pytest forge/main/tests/unit/ -x -q` |
| `test:frontend-unit` | `node:20-slim` | — | Vitest test suite | `npx vitest run` |

**Triggers:** Every push, every MR, every tag.

**Watch out:** Python tests need real PostgreSQL and Redis services. The `-x` flag
stops on the first failure for faster feedback.

### Build (only default branch + tags)

| Job | Base image | Output |
|-----|-----------|--------|
| `build:centos` | CentOS Stream 9 | `${IMAGE}:${VERSION}-centos`, `${IMAGE}:centos-latest` |
| `build:ubuntu` | Ubuntu 24.04 | `${IMAGE}:${VERSION}-ubuntu`, `${IMAGE}:ubuntu-latest` |

**Does not run on feature branches** — only when merged to default branch or tagged.

Both images are multi-stage builds:
1. Node.js stage: builds React frontend (`npm run build`)
2. Python stage: installs dependencies, builds sdist package
3. Runtime stage: minimal image with only runtime dependencies

### Security (informational — does NOT block merge)

| Job | Tool | What it scans |
|-----|------|---------------|
| `security:pip-audit` | pip-audit | Known CVEs in Python dependencies |
| `security:trivy` | Trivy | Known CVEs in Docker image layers |

Both have `allow_failure: true` — they report vulnerabilities but don't block the pipeline.

### Release (only on git tags `v*`)

| Job | Destination | Trigger |
|-----|-------------|---------|
| `release:gitlab-registry` | GitLab Container Registry | Automatic on tag |
| `release:harbor` | Harbor (`ghcr.io`) | **Manual** (click to deploy) |

The CentOS image is tagged as the primary (`:latest`, `:${VERSION}`).
Ubuntu is available as `:${VERSION}-ubuntu`.

---

## Workflow Rules — When the Pipeline Runs

```yaml
workflow:
  rules:
    # Always run for release tags
    - if: $CI_COMMIT_TAG =~ /^v/

    # Skip entirely if ONLY docs/images changed
    - changes:
        - "docs/**/*"
        - "**/*.md"
        - "**/*.png"
        - "**/*.jpg"
        - "**/*.svg"
      when: never

    # Run for everything else
    - when: always
```

**What this means:**
- Push changes to `forge/`, `requirements/`, `tools/`, etc. → pipeline runs, must pass
- Push changes to only `docs/`, `*.md`, `*.png` → pipeline does NOT run
- Push a tag `v2026.03.0` → full pipeline including release stage
- Mix of code + docs changes → pipeline runs (code changes take priority)

---

## CI Variables (GitLab Settings → CI/CD → Variables)

### Required for build stage

| Variable | Source | Description |
|----------|--------|-------------|
| `CI_REGISTRY` | GitLab (automatic) | GitLab container registry URL |
| `CI_REGISTRY_USER` | GitLab (automatic) | Registry username |
| `CI_REGISTRY_PASSWORD` | GitLab (automatic) | Registry password |
| `CI_REGISTRY_IMAGE` | GitLab (automatic) | Full image path |

### Required for Harbor release

| Variable | Set manually | Description |
|----------|-------------|-------------|
| `HARBOR_USER` | Yes | Harbor registry username |
| `HARBOR_TOKEN` | Yes (masked) | Harbor registry access token |
| `HARBOR_REGISTRY` | Yes | Registry URL (`ghcr.io`) |

---

## Version Resolution

```
git tag v2026.03.0  →  VERSION=2026.03.0   (release build)
no tag              →  VERSION=abc1234      (dev build, commit SHA)
```

The version is used for:
- Docker image tags
- `SETUPTOOLS_SCM_PRETEND_VERSION` build arg (Python package version)
- Release notes

---

## Caching

| Cache | Key | What it caches |
|-------|-----|---------------|
| pip | `pip-${CI_COMMIT_REF_SLUG}` | Python packages (`.cache/pip`) |
| npm | `npm-${CI_COMMIT_REF_SLUG}` | Node modules (`forge/ui_next/node_modules`) |
| trivy | `trivy` | Vulnerability database (`.trivycache/`) |

Caches are per-branch. The lint stage uses `pull-push` (reads and writes),
test stage uses `pull` (reads only) for npm to avoid cache conflicts.

---

## How to Enforce Pipeline in GitLab

To make the pipeline a hard requirement for merging:

1. **Settings → Repository → Protected branches**
   - Protect `devel` and `main`/`modernization`
   - Set "Allowed to merge" to Maintainers

2. **Settings → Merge requests**
   - Enable "Pipelines must succeed"
   - This blocks the Merge button until lint + test pass

3. **Settings → CI/CD → General pipelines**
   - Set timeout to 30 minutes (prevents hung jobs)

With these settings, no code reaches the main branches without passing
flake8, TypeScript checks, Python unit tests, and frontend tests.

---

## Running the Pipeline Locally

If you want to verify before pushing:

```bash
# Python lint
flake8 forge/ --count --statistics --max-line-length=160

# TypeScript check
cd forge/ui_next && npx tsc --noEmit

# Python tests (inside Vagrant VM)
python -m pytest forge/main/tests/unit/ -x -q --tb=short

# Frontend tests
cd forge/ui_next && npx vitest run
```

If all four pass locally, the pipeline will pass on GitLab.
