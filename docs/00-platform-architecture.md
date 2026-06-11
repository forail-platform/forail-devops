# 00 — Platform Architecture

This is the **platform-wide** map: how the eight Forail repositories fit
together, how a request flows from the browser down to a managed host,
and how the GitOps control plane (Kubernetes operator) drives Forail
through its REST API. For the internals of a single deployment (Nginx →
uWSGI/Daphne → Postgres/Redis → Receptor), see
[01 — Architecture Overview](01-architecture-overview.md).

---

## Repository Map

Forail is split into eight repositories, each independently buildable and
releasable, published under the `forail-platform` GitHub org and
`ghcr.io/forail-platform` container registry.

| Repository             | Role                                                                        | Artifact                                | Versioning                       |
| ---------------------- | --------------------------------------------------------------------------- | --------------------------------------- | -------------------------------- |
| **forail-backend**      | Django/DRF API, Celery task engine, Receptor mesh, RBAC, EDA, policy, audit | `ghcr.io/forail-platform/forail-backend`   | CalVer                           |
| **forail-frontend**     | React 18 + TypeScript + Vite SPA                                            | `ghcr.io/forail-platform/forail-frontend`  | CalVer                           |
| **forail-deploy**       | Docker Compose, CI/CD, Nginx/OTel/OPA config, handbooks, this wiki          | (compose project)                       | CalVer                           |
| **forail-assistant**    | Optional AI microservice (Ollama + ChromaDB + FastAPI, RAG)                 | `ghcr.io/forail-platform/forail-assistant` | CalVer (preview)                 |
| **forail-operator**     | Kubernetes operator, 9 CRDs, OLM bundle (GitOps control plane)              | `ghcr.io/forail-platform/forail-operator`  | SemVer                           |
| **forail-helm**         | Helm chart that deploys the whole stack on Kubernetes                       | Helm chart                              | SemVer chart / CalVer appVersion |
| **forail-dev-cluster**  | Vagrant + k3s test cluster (3 control-plane + 4 workers)                    | (Vagrant env)                           | CalVer                           |
| **github-org-profile** | Org `.github` repo: profile README, CoC, PR template                        | (community health)                      | —                                |

### Dependency direction

```
        forail-frontend ──┐
                         ▼
                    forail-backend ◀──── forail-operator  (drives via REST /api/v2/)
                         ▲                    │
        forail-assistant ─┘ (optional, SSE)    │
                                              ▼
   forail-deploy ──▶ Docker Compose      forail-helm ──▶ Kubernetes
                                              ▲
                                     forail-dev-cluster (k3s target)
```

- **forail-backend** is the center of gravity — every other component
  either renders its API (frontend), augments it (assistant), packages it
  (deploy/helm), or drives it (operator).
- The **operator never touches the database** — it only calls the public
  REST API (`/api/v2/`), exactly like a human admin would. This keeps the
  control plane decoupled from backend internals.

---

## Flow A — Interactive request (Browser → API → host)

```
Browser ──HTTPS:443──▶ Nginx (external, TLS) ──HTTP:8013──▶ Nginx (internal)
                                                              │
                  ┌───────────────────────────────────────────┼──────────────┐
                  │ /api/        /websocket/                    │ /            │
                  ▼              ▼                              ▼
              uWSGI:8050     Daphne:8051                  static SPA (frontend)
                  │              │
                  ▼              │ (job events relayed back over WS)
            Django (forail-web)   │
                  │              │
      ┌───────────┼──────────────┘
      ▼           ▼
  Postgres:5432  Redis:6379 ──▶ Celery dispatcher (forail-task) ──▶ Receptor mesh ──▶ managed hosts
```

Frontend is served as static assets and talks to the same origin; live
job output streams back over the Django Channels WebSocket (Daphne).

## Flow B — GitOps control plane (kubectl → Operator → Forail)

This is the path the **forail-operator** adds. Verified end-to-end on
`forail-dev-cluster` (k3s v1.30.4):

```
   kubectl apply organization.yaml
            │
            ▼
   Kubernetes API server  (CR stored, schema-validated by the CRD)
            │ watch
            ▼
   forail-operator (ns forail-operator)
            │  GET/POST  http://forail-web.forail.svc.cluster.local:8013/api/v2/organizations/
            │            Authorization: Bearer <OAuth2 PAT from forail-credentials secret>
            ▼
   forail-backend  ──▶ Postgres   (Organization row created → id returned)
            │
            ▼
   operator writes status back to the CR:  status.forailID=2, Ready=True ("in sync with Forail")
```

The nine CRDs (`forail.forail-platform.io/v1alpha1`) — Organization, Team,
Project, Inventory, Credential, JobTemplate, Schedule, Workflow, and the
multi-cluster `ForailInstance` — each reconcile the same way: read CR
spec, call the matching `/api/v2/` endpoint, record the Forail object ID
and a `Ready`/`Synced` condition, and run a finalizer to delete the
Forail object when the CR is removed. `ForailInstance` lets one operator
drive several Forail backends (a `ClientPool` keyed by `spec.forailInstance`).

---

## Deployment topologies

| Path               | Tooling          | Use case                                                         |
| ------------------ | ---------------- | ---------------------------------------------------------------- |
| **Docker Compose** | `forail-deploy`   | Single-host install, dev, small prod                             |
| **Helm**           | `forail-helm`     | Kubernetes deployment of the full stack                          |
| **Operator**       | `forail-operator` | GitOps management of Forail objects (on top of either deployment) |

The operator is **orthogonal** to how Forail itself is deployed: it
manages Forail _objects_ (orgs, projects, job templates…) declaratively
and can point at a Forail installed by Compose, Helm, or anything else, as
long as it can reach `/api/v2/` with a token.

---

## Versioning policy

Forail deliberately uses **two** versioning schemes. Which one a repo uses
depends on _what kind of thing it is_, not on preference.

| Scheme     | Format                             | Repos                                                                           | Why                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CalVer** | `YYYY.MM.PATCH` (e.g. `2026.05.0`) | forail-backend, forail-frontend, forail-deploy, forail-assistant, forail-dev-cluster | These ship together as one **coordinated platform release**. A user runs "the May 2026 platform" — the date _is_ the meaningful version. They have no independent API/compat contract with each other beyond "same platform release".                                                                             |
| **SemVer** | `MAJOR.MINOR.PATCH` (e.g. `1.0.0`) | forail-operator, forail-helm                                                      | These are **independently consumed artifacts** with their own compatibility contracts, governed by ecosystem rules. Helm requires the chart `version` to be SemVer; OLM/OperatorHub builds its upgrade graph from SemVer. Breaking the CRD API or chart values is a SemVer **major**, regardless of the calendar. |

### How the two bridge

- **forail-helm** carries both: `version: 1.0.0` (SemVer — the chart's own
  version, per the Helm spec) and `appVersion: 2026.05.0` (CalVer — the
  platform release it installs). Bump `version` when the chart templates
  change; bump `appVersion` when it targets a newer platform release.
- **forail-operator** Chart `version` and `appVersion` are both `1.0.0`
  because the chart and the operator binary it deploys version together.

### When to bump

- **CalVer repos:** new `YYYY.MM` for each monthly platform release;
  `.PATCH` for fixes within that month.
- **forail-operator (SemVer):** _major_ on a breaking CRD-API change
  (e.g. a `v1alpha1` → `v1beta1` migration or removed field); _minor_ for
  a new CRD or backward-compatible field; _patch_ for bug fixes.
- **forail-helm (SemVer):** _major_ on a breaking `values.yaml` change;
  _minor_ for new opt-in values; _patch_ for template fixes. Track the
  platform in `appVersion`.

---

## See also

- [01 — Architecture Overview](01-architecture-overview.md) — single-deployment internals
- [08 — CI/CD Pipeline](08-ci-cd-pipeline.md) — how images are built and released
- [wiki-index](wiki-index.md) — full documentation index
- `forail-operator/README.md` — CRD reference and operator install
- `forail-helm/README.md` — Kubernetes deployment
