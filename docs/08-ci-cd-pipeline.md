# 08 — CI/CD Pipeline

Forail Platform uses **GitHub Actions** as the public CI/CD pipeline. Each repository has its own workflow in `.github/workflows/` that runs on push and pull request.

---

## Pipeline Overview

```
┌──────────┐   ┌────────┐   ┌────────┐        ┌───────────────────────────────┐
│ Checkout │──►│  Lint  │──►│  Test  │───────►│           publish             │
└──────────┘   └────────┘   └────────┘        │  build → test in image → push │
  GitHub         ruff /       pytest /        └───────────────────────────────┘
  Actions        go vet       vitest / envtest      ONLY on a v* tag
```

Each repo's workflow file: **`.github/workflows/ci.yml`**

## Pipeline Stages

The jobs differ per repo. What each one actually runs:

| Repo               | Always (push + PR)                                   | `publish` (v* tags only)                                  |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------- |
| `forail-backend`   | `ruff check` , `pyproject.toml` parse, standalone tests | build image → **run the Django functional tests inside the built image** → push |
| `forail-frontend`  | `npm run lint`, `npm test`, `npm run build`          | build and push image                                       |
| `forail-operator`  | `go vet`, `go build`, controller tests (envtest)     | build and push image                                       |
| `forail-assistant` | `pytest -q`                                          | build and push image                                       |

### Stage Conditions

| Stage        | When it runs                                                       |
| ------------ | ------------------------------------------------------------------ |
| Lint, Test   | Every push and every PR                                            |
| `publish`    | **Only** when the ref is a tag matching `v*` — `if: startsWith(github.ref, 'refs/tags/v')` |

> **A merge to `main` does not produce an image.** It runs lint and tests only.
> The image on `ghcr.io` changes when, and only when, someone pushes a `v*` tag.
> This is the single most common source of confusion: `main` can be many commits
> ahead of the newest published image, and that is by design.

### Known gaps

These are documented as they are, not as they should be:

- **`ruff check . || true`** in the backend — lint output is informational; lint
  errors do not fail the build.
- **No container image scanning** (no Trivy) and **no `pip-audit`** stage in any
  repo's workflow today.

---

## GitHub Actions Secrets

For the release stage, each repo needs the following secret:

| Secret         | Description                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN` | Provided automatically by GitHub Actions. Used with the built-in `permissions: packages: write` to push to `ghcr.io/forail-platform/*` |

No third-party credentials are required — everything runs in the GitHub-hosted runner with built-in tokens.

---

## Docker Images

| Image                                               | Source                        | Description                           |
| --------------------------------------------------- | ----------------------------- | ------------------------------------- |
| `ghcr.io/forail-platform/forail-backend:<version>`   | `forail-backend/Dockerfile`   | Django API + task engine              |
| `ghcr.io/forail-platform/forail-frontend:<version>`  | `forail-frontend/Dockerfile`  | React SPA + nginx                     |
| `ghcr.io/forail-platform/forail-operator:<version>`  | `forail-operator/Dockerfile`  | Kubernetes operator                   |
| `ghcr.io/forail-platform/forail-assistant:<version>` | `forail-assistant/Dockerfile` | FastAPI + Ollama + ChromaDB (preview) |

Every image carries **exactly one tag: the version**, taken from the git tag with
the `v` stripped. There is **no `latest` tag** — nothing in the pipeline creates
one, so `docker pull …:latest` fails. Always pull an explicit version.

Release-candidate tags (`v2026.07.2-rc1`) go through the same `publish` job and
produce a normal image (`…:2026.07.2-rc1`), which is how a build is validated
against a real cluster before a release is cut.

All images are **public** — no pull secret required for `docker pull` or `helm install`.

To see what is actually published, ask the registry rather than guessing:

```bash
TOKEN=$(curl -s "https://ghcr.io/token?scope=repository:forail-platform/forail-backend:pull" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
curl -s -H "Authorization: Bearer $TOKEN" \
  https://ghcr.io/v2/forail-platform/forail-backend/tags/list
```

---

## Versioning

Forail uses **CalVer** (Calendar Versioning):

```
YYYY.MM.PATCH
2026.03.0     # First release of March 2026
2026.03.1     # Patch release
2026.04.0     # April release
```

**Each repo carries its own tag.** There is no central tag that releases the
platform — `forail-backend`, `forail-frontend`, `forail-operator` and
`forail-assistant` are tagged individually, and only the repos that changed need
a new one. That is why published versions legitimately differ between components
(for example backend `2026.07.1` alongside frontend `2026.07.0`); the Helm chart
is what pins a working set together.

```bash
cd forail-backend
git tag -a v2026.05.0 -m "Forail 2026.05.0"
git push github v2026.05.0
# GitHub Actions then: lint → test → build image → test inside the image → push to ghcr.io
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

# Build image (tag it with a version — there is no :latest)
docker build -t ghcr.io/forail-platform/forail-backend:2026.05.0 .
```

### Frontend

```bash
cd forail-frontend

# Lint
npx tsc --noEmit

# Tests
npx vitest run

# Build image (tag it with a version — there is no :latest)
docker build -t ghcr.io/forail-platform/forail-frontend:2026.05.0 .
```

---

## Release Process

1. Ensure GitHub Actions is green on `main` for every repo being released
2. Bump `VERSION` in the repos that ship a version, and the Helm chart's
   `version` / `appVersion` so it pins the images you are about to publish
3. Write the release notes (`forail-deploy/docs/RELEASE_NOTES_v<version>.md`) and
   the docs-site release page
4. Tag each changed repo and push the tag — this is what builds and publishes:
   `git tag -a v2026.05.0 -m "Forail 2026.05.0" && git push github v2026.05.0`
5. Install the published chart and images into a clean cluster and run the full
   regression before announcing anything
6. Create the GitHub Release

### Validate before you release

Cut an rc tag first (`v2026.05.0-rc1`). It publishes a real image through the
same job, so the release candidate can be installed into a clean cluster and put
through the full Cypress suite. Only then cut the real tag. Rc images stay on
`ghcr.io` — harmless, but do not point a chart at one.

### Watch out

- **Never release without passing tests.**
- **Tag format must have `v` prefix:** `v2026.05.0`, not `2026.05.0`.
- **Merging to `main` publishes nothing** — only a `v*` tag does.
- **Image visibility** — when a new package is first pushed to `ghcr.io`, GitHub creates it as **private** by default. You must manually flip it to public via the Packages settings (`https://github.com/orgs/forail-platform/packages`).
