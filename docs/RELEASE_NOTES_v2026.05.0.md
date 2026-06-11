# Forail 2026.05.0 — Release Notes

**Release date:** 2026-05-22
**Based on:** Forail 2026.04.0 + new features
**License:** Apache License 2.0

---

## Overview

Forail 2026.05.0 is the platform's GA milestone. The Kubernetes operator
graduates to **v1.0.0** with a complete resource model (9 CRDs) and
multi-cluster control-plane support, the dev-cluster moves to a
production-shaped 3-master/4-worker HA k3s topology, and the AI
Assistant is repackaged as a single all-in-one image that runs on a
single PVC.

---

## Component Versions

| Component         | Version   | Notes                                                              |
| ----------------- | --------- | ------------------------------------------------------------------ |
| forail-backend     | 2026.05.0 | Migration `0208` fix for `DriftAlertRule` audit fields             |
| forail-frontend    | 0.1.0     | No changes this cycle (UI from v2026.04.0 still current)           |
| forail-assistant   | 2026.05.0 | All-in-one image (Ollama + ChromaDB embedded), `gemma3:1b` default |
| forail-operator    | **1.0.0** | 5 new CRDs, multi-cluster, OLM bundle                              |
| forail-helm        | **1.0.0** | `appVersion: 2026.05.0`                                            |
| forail-dev-cluster | —         | 3m+4w k3s 1.30 (was 2m+2w kubeadm)                                 |

---

## New Features

### Forail Operator v1.0.0 — Complete Resource Model + Multi-Cluster

The Kubernetes operator now covers the full Forail object graph and can
fan out to multiple Forail backends from a single control plane.

**5 new CRDs:**

- **`Project`** — SCM-backed source of playbooks, with optional
  Credential + ExecutionEnvironment references.
- **`Organization`** — top-level tenant container with max-host quota
  and a default-EE reference.
- **`Team`** — namespaced team within an Organization. `spec.users[]`
  is reconciled declaratively against
  `/api/v2/teams/{id}/users/` (add/remove users to match spec).
- **`Workflow`** — `workflow_job_template` wrapper with a declarative
  DAG of nodes (`spec.nodes[]` keyed by `identifier`) and three edge
  types (`successNodes`, `failureNodes`, `alwaysNodes`). The
  reconciler diffs against
  `/workflow_job_template_nodes/` + each node's sub-relations.
- **`ForailInstance`** — describes a Forail backend (URL + bearer
  token via `tokenSecretRef`) that other CRs target by name via
  `spec.forailInstance`.

**Multi-cluster (`forailapi.ClientPool`):**

Per-CR resolution of which Forail backend to write to. CRs without
`spec.forailInstance` fall back to the default client supplied via
`--forail-url` / `--forail-token`. Generation-gated cache invalidation
on the ForailInstance reconciler rebuilds the client lazily when the
target URL or secret reference changes.

**OLM packaging:**

- `config/manifests/bases/forail-operator.clusterserviceversion.yaml`
  — CSV with `alm-examples`, `customresourcedefinitions.owned`
  entries for all 9 CRDs, deployment spec, cluster-scoped RBAC.
- `bundle.Dockerfile` + `bundle/{manifests,metadata}` for OperatorHub
  catalog builds.
- Makefile targets: `bundle`, `bundle-build`, `catalog-build`.

**Resource model summary:**

| CRD               | Scope      | Reconciles to                                 |
| ----------------- | ---------- | --------------------------------------------- |
| Inventory         | Namespaced | `/api/v2/inventories/`                        |
| Credential        | Namespaced | `/api/v2/credentials/`                        |
| JobTemplate       | Namespaced | `/api/v2/job_templates/`                      |
| Schedule          | Namespaced | `/api/v2/schedules/`                          |
| **Project**       | Namespaced | `/api/v2/projects/`                           |
| **Organization**  | Cluster    | `/api/v2/organizations/`                      |
| **Team**          | Namespaced | `/api/v2/teams/` + user membership            |
| **Workflow**      | Namespaced | `/api/v2/workflow_job_templates/` + DAG nodes |
| **ForailInstance** | Namespaced | (control-plane only; no upstream call)        |

### Forail Assistant — All-in-One Image

The AI Assistant is repackaged from three Compose services (Ollama +
ChromaDB + FastAPI + a setup container) into **one container** with a
single `/data` volume.

- **`entrypoint.sh`** orchestrates startup: `ollama serve`, conditional
  model pull (the configured chat model + `nomic-embed-text`),
  `chroma run`, document indexing, then `uvicorn`.
- Default chat model: **`gemma3:1b`** (was `mistral:7b`). Smaller and
  faster; answer quality reduced for general questions but adequate
  for short RAG-grounded responses against the in-tree docs.
- Default `top_k` lowered from 5 to 3.
- Default config hosts switched from `ollama` / `chromadb` to
  `localhost` to match the single-container layout.
- Explicit `httpx.Timeout(connect=10, read=300, write=10, pool=10)`
  so the long read timeout no longer applies to connection setup.
- New RAG corpus under `docs_to_index/deployment/` (architecture,
  Docker deployment, CI/CD, contributing, admin/user handbooks,
  startup walkthrough) so the assistant can answer operational
  questions.

The Helm chart (`assistant.enabled=true`) provisions a single
Deployment + PVC + Service (default 20 GiB volume,
1 GiB/250m requests, 4 GiB/2 vCPU limits, `startupProbe`
`failureThreshold: 30` ≈ 5 min boot budget for the first-pull model
download).

### Forail Helm 1.0.0

- Chart version bumped to **1.0.0** (from 0.3.0) marking platform GA
  alongside `forail-operator` v1.0.0.
- `appVersion: 2026.05.0` tracks the backend release that ships the
  `0208_driftalertrule_audit_fields` migration fix.
- 5 new operator CRDs added under `helm/crds/` so `helm install
forail-operator` provisions the complete schema.

### Dev-Cluster — 3-Master / 4-Worker HA k3s

The Vagrant test cluster (`forail-dev-cluster`) was rebuilt for
production-shaped HA:

- Topology: **3 control-plane (k8s-m1..m3) + 4 worker (k8s-w1..w4)**
  on `192.168.56.30-36`. Per-VM resources bumped to 2 vCPU / 4 GB
  (was 2 vCPU / 2 GB) → 14 vCPU, 28 GB total.
- **Switched distribution from kubeadm to k3s** (v1.30.4+k3s1). k3s
  bundles Traefik, local-path-provisioner, klipper-lb (servicelb),
  CoreDNS, and metrics-server, so `post-cluster-setup.sh` collapsed
  from 4 stages to creating just the `forail` namespace + Harbor
  pull-secret + self-signed TLS cert.
- **HA control plane via embedded etcd**: first server runs
  `k3s server --cluster-init`, the other two join with `--server`.
  TLS SANs cover all 3 server IPs/hostnames so `kubectl` works
  against any master. 3-node etcd quorum tolerates a single master
  failure (was 2-node quorum, which lost the cluster on any master
  loss).
- `--flannel-iface=eth1` passed explicitly on every node — fixes the
  long-standing wrong-NIC binding that broke pod networking on the
  kubeadm setup.

Provisioning scripts renamed: `master-init.sh` / `master-join.sh` /
`worker-join.sh` → `server-init.sh` / `server-join.sh` /
`agent-join.sh`.

---

## Bug Fixes

### Backend — `DriftAlertRule` cascade-delete (migration `0208`)

`DriftAlertRule` rows could not be cascade-deleted from an
Organization: the original `0198_drift_models` migration omitted the
`created_by` / `modified_by` FK columns inherited from
`PrimordialModel`, so any ORM query joining the audit columns blew up
with `psycopg.UndefinedColumn`.

- Symptom in the wild: `DELETE /api/v2/organizations/{id}/` returned
  HTTP 500 and the `forail-operator` Organization finalizer hung
  forever.
- Migration `0208_driftalertrule_audit_fields` backfills both columns
  as nullable + `SET_NULL`.
- New schema-level regression test
  (`tests_standalone/test_drift_audit_fields_schema.py`) parses the
  migration sequence and asserts the columns exist so the gap can't
  re-open.

---

## Upgrade Path

### From 2026.04.0 → 2026.05.0

**Backend (`forail-helm` upgrade):**

```sh
helm repo update
helm upgrade forail forail-platform/forail -n forail \
  --version 1.0.0 \
  --reuse-values
kubectl -n forail exec deploy/forail-web -- forail-manage migrate
```

The `0208` migration is forward-compatible (nullable column add,
SET_NULL FKs). No downtime; existing `DriftAlertRule` rows backfill
with `NULL` audit fields.

**Operator (`forail-operator` upgrade):**

If upgrading the operator from 0.3.x to 1.0.0:

```sh
# 1. Apply the new CRDs first (Helm hooks won't re-install CRDs).
kubectl apply -f https://github.com/forail-platform/forail-operator/releases/download/v1.0.0/crds.yaml

# 2. Upgrade the operator chart.
helm upgrade forail-operator forail-platform/forail-operator -n forail-operator \
  --version 1.0.0 \
  --reuse-values
```

Existing `Inventory` / `Credential` / `JobTemplate` / `Schedule` CRs
continue to work unchanged.

**Multi-cluster (optional):**

To start fanning out to multiple Forail backends, create a
`ForailInstance` per backend and reference it in your CRs:

```yaml
apiVersion: forail.forail-platform.io/v1alpha1
kind: ForailInstance
metadata:
  name: forail-staging
spec:
  url: https://forail-staging.example.com
  tokenSecretRef:
    name: forail-staging-token
    key: token
---
apiVersion: forail.forail-platform.io/v1alpha1
kind: JobTemplate
metadata:
  name: deploy-staging
spec:
  forailInstance: forail-staging   # routes to the staging backend
  ...
```

CRs without `spec.forailInstance` continue to use the default
operator-wide URL/token.

---

## Documentation

New / updated documentation:

- **`forail-platform.github.io/docs/operator-v1.html`** — Dedicated
  page for v1.0.0: multi-cluster, Workflow DAG model, OLM bundle,
  upgrade path.
- **`forail-platform.github.io/docs/kubernetes.html`** — Refreshed for
  v1.0.0 (9-CRD table, sidebar reorganized).
- **`forail-assistant/docs_to_index/deployment/`** — 8 new operational
  markdown files indexed into the RAG corpus.

---

## Known Issues

- **OLM bundle warnings:** 4 of the older CRDs (Inventory, Credential,
  JobTemplate, Schedule) don't yet have `alm-examples` entries in the
  CSV, and the CSV lacks `spec.icon`. Both are cosmetic
  (`operator-sdk bundle validate` warnings, not errors) and do not
  block submission to OperatorHub. Slated for `1.0.1`.
- **`forail-assistant` first boot** can take 3–5 minutes on the
  initial pod start while `gemma3:1b` and `nomic-embed-text` are
  pulled into the PVC. The `startupProbe` (`failureThreshold: 30`)
  budgets ~5 minutes; raise it if your registry mirror is slow.

---

## Quality Metrics

| Metric                                                                                | Value                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------- |
| Operator e2e (live 3m+4w k3s)                                                         | 9/9 CRDs reconcile cleanly             |
| Backend regression (`test_drift_audit_fields_schema`)                                 | passing                                |
| Helm chart (`helm lint` + `helm template`, both default and `assistant.enabled=true`) | passing                                |
| Operator OLM bundle (`operator-sdk bundle validate`)                                  | passing (4 warnings, see Known Issues) |
