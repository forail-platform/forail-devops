# Forail Platform — Roadmap

This document tracks the public direction of Forail Platform. For shipped features see [`docs/RELEASE_NOTES_v2026.05.0.md`](docs/RELEASE_NOTES_v2026.05.0.md), [`docs/RELEASE_NOTES_v2026.04.0.md`](docs/RELEASE_NOTES_v2026.04.0.md), and [`docs/RELEASE_NOTES_v2026.03.0.md`](docs/RELEASE_NOTES_v2026.03.0.md). The internal long-form plan lives in [`docs/future_development_plan.md`](docs/future_development_plan.md).

Roadmap entries are **directional**, not commitments. We may reorder, defer, or drop items based on feedback and discovered constraints.

---

## Shipped

### v2026.05.0 (May 2026) — Platform GA

- **`forail-operator` v1.0.0** — 9 CRDs (`Inventory`, `Credential`, `JobTemplate`, `Schedule`, `Project`, `Organization`, `Team`, `Workflow`, `ForailInstance`), multi-cluster control plane (`ClientPool` + `ForailInstance` CR), declarative Workflow DAG, OLM bundle that validates clean against `operatorhub.io` optional checks.
- **`forail-dev-cluster`** topology scaled to **3-master + 4-worker k3s** (14 vCPU / 28 GB total, embedded etcd HA, Traefik / local-path / klipper-lb bundled).
- **`forail-backend` 2026.05.0** — migration `0208_driftalertrule_audit_fields` backfills `created_by` / `modified_by` columns missed by the original `0198_drift_models`, unblocking cascade-delete from `Organization`.
- **`forail-helm`** chart 1.0.0 (appVersion 2026.05.0); `imagePullSecrets: []` default, all images on `ghcr.io/forail-platform/*`.
- **`forail-assistant` 2026.05.0** — all-in-one image (Ollama + ChromaDB + FastAPI in one container, `gemma3:1b` default).
- **Public launch on GitHub** (2026-05-23) — Apache 2.0 across all repos, `SECURITY.md` + `CONTRIBUTING.md`, ghcr.io packages public, SEO foundation (org `.github` profile, per-page meta + JSON-LD, Google Search Console verified).

### v2026.04.0 (Apr 2026)

10 features delivered: Dynamic Surveys, Event-Driven Automation (EDA), Drift Detection, AI Assistant (Ollama + RAG), Audit Trail, Self-Service Portal, Policy-as-Code (OPA), OIDC + WebAuthn / passkeys, Workflow Node Surveys, Analytics Dashboard, Multi-Tenancy v1 (soft), IaC Scanning, OpenTelemetry.

### v2026.03.0 (Mar 2026)

Initial extracted release: Docker Compose stack, single-VM Vagrant, React 18 / Vite frontend, AWX → Forail rename, standalone tests separated from inherited suite.

---

## Now — what's next (Q3 2026)

Items in active consideration. Order roughly reflects priority, but is not fixed.

### Backend hardening — shipped in 2026.07.0
- ✅ Audited the top 5 security-sensitive tech-debt spots flagged in earlier reviews (`forail/main/access.py`, `forail/sso/conf.py`, `forail/main/models/activity_stream.py`, `forail/main/signals.py`, `forail/main/constants.py`). SSO signing + SHA-256 defaults, session-key hashing, trusted-proxy `X-Forwarded-For`, superuser-grant audit logging and refresh-token redaction landed; `access.py` and the `ENV_BLOCKLIST` were confirmed clean (no change needed). See [`docs/RELEASE_NOTES_v2026.07.0.md`](docs/RELEASE_NOTES_v2026.07.0.md).
- ✅ AWX → Forail migration tool — one-shot importer covering orgs, teams, inventories (+ sources), credentials, projects, job & workflow templates, schedules, notification templates and RBAC. Shipped in 2026.07.0.

### Operator follow-ups
- ✅ **OperatorHub.io submission** — `forail-operator` is live on OperatorHub.io (listed 2026.6.0; icon fix 2026.6.1; orphaned `forge-operator` package removed 2026-06-22).
- Per-CR status conditions polish (more granular `Reason` strings; `lastReconcileTime`).

### Documentation
- Documentation is maintained on the **[forail-platform.github.io](https://forail-platform.github.io) site** (built from per-repo `docs/*.md` via `build-docs.sh`). Keep it current as features land — architecture, per-feature guides, API reference, handbooks, and release notes.

### Community
- ROADMAP discussion thread / GitHub Discussions enabled across repos.
- Launch post (HN / Reddit / Lobsters) — timing TBD.

---

## Later (2026 H2 / 2027)

### Multi-Tenancy v2
The v1 ([2026.04.0](docs/RELEASE_NOTES_v2026.04.0.md)) shipped quota enforcement + branding + soft isolation. v2 will add:
- Postgres row-level security policies (DB-level cross-tenant blocking).
- Strict-mode enforcement (currently audit-only).
- Per-tenant API rate limiting + Celery queues.
- Custom-domain TLS provisioning (Let's Encrypt automation).
- Billing / metering hooks.
- Tenant-scoped LDAP / SAML / OIDC federation.

### Plugin architecture (Tier 3.1)
Microkernel design — core handles jobs / scheduling / inventory; everything else (credential backends, notification channels, inventory sources, SCM providers) loads as a plugin via a documented SDK. Plugin registry with install/update/remove via UI. Sandboxed execution.

### Mobile application (Tier 3.5)
Detailed plan in [`docs/mobile_plan.md`](docs/mobile_plan.md): deployment approval with biometric verification, real-time server monitoring, live log streaming, push alerts, AI assistant chat.

### IaC Scanning v2
Collection / role provenance verification (sigstore, checksums). Live CVE feed for non-Python EE packages. In-line annotations on the playbook source viewer. Custom rule authoring UI.

### FreeBSD support (host + jail)
Native FreeBSD deployment alongside Linux: dependency audit, rc.d service scripts, PostgreSQL/Redis docs, jail configuration, FreeBSD port (`sysutils/forail-platform`), receptor mesh compatibility, FreeBSD 14.x test environment.

---

## How to influence the roadmap

- **Bugs / regressions:** open a [bug report](https://github.com/forail-platform/forail-backend/issues/new?template=bug_report.yml) on the relevant repo.
- **Feature requests:** open a [feature request](https://github.com/forail-platform/forail-backend/issues/new?template=feature_request.yml) — describe the use case first, not just the proposed solution.
- **Design discussions:** [GitHub Discussions](https://github.com/orgs/forail-platform/discussions) on the org.
- **Security issues:** see [`SECURITY.md`](SECURITY.md) — please do not file publicly.
