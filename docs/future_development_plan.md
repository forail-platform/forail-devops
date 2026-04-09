# Forge — Future Development Plan

Post-release roadmap for Forge beyond v2026.03.0.
Organized by priority tiers with estimated effort and dependencies.

---

## Tier 1: High Impact, Near-Term (Q2-Q3 2026)

Features that address the most common community pain points and provide
immediate competitive advantage over AWX and alternatives.

### 1.1 Dynamic Surveys --- COMPLETED (v2026.04.0)

**Problem:** AWX surveys only support static, hardcoded choices. Users cannot
populate dropdown options from inventory, host facts, or external APIs.
This is the single most upvoted feature request in the AWX community.

**Solution:**
- Add a `dynamic_choices` field to survey question spec
- Support three sources: Jinja2 template (from inventory/facts), API endpoint
  (external URL returning JSON array), and database query (hosts, groups, projects)
- Evaluate choices at launch time, not at template save time
- Cache results with configurable TTL to avoid slow launches
- Frontend: async dropdown that fetches choices when the launch dialog opens

**Effort:** 2-3 weeks
**Files:** `awx/main/models/jobs.py`, `awx/api/views/job_templates.py`,
`awx/ui_next/src/components/LaunchDialog.tsx`

---

### 1.2 Event-Driven Automation (EDA) --- COMPLETED (v2026.04.0)

**Problem:** AWX can only run jobs on schedules or manual triggers. There is no
way to react to real-time events (monitoring alerts, Git pushes, cloud events).
AAP 2.5+ has this as an exclusive feature.

**Solution:**
- Add an event router service that accepts inbound webhooks and evaluates
  them against user-defined rules (YAML rulebooks)
- Rule format: `source` (webhook path/filter) + `condition` (Jinja2 expression)
  + `action` (launch job template, workflow, or notification)
- Integrate with common sources: GitHub/GitLab webhooks, Alertmanager,
  PagerDuty, Datadog, CloudWatch, generic HTTP POST
- Store rules as a new model (`EventRule`) with RBAC
- Outbound webhooks: push job status/completion to external systems

**Effort:** 4-6 weeks
**Dependencies:** None (builds on existing webhook receiver in AWX)

---

### 1.3 Drift Detection and Change Tracking --- COMPLETED (v2026.04.0)

**Problem:** AWX runs playbooks but does not track what changed between runs.
There is no way to detect configuration drift or prove compliance.
Ascender's "Ledger" product fills this gap commercially.

**Solution:**
- Capture host facts (`ansible_facts`) after each playbook run and store
  as snapshots in a `HostFactSnapshot` model
- Compare snapshots between runs to detect drift (new packages, changed
  configs, modified users/groups, open ports)
- Dashboard widget showing drift summary across hosts
- Alert rules: notify when drift exceeds threshold or specific facts change
- Compliance report export (PDF/CSV) showing baseline vs current state

**Effort:** 3-4 weeks
**Dependencies:** Fact caching must be enabled on job templates

---

### 1.4 AI Assistant (Ollama RAG) --- COMPLETED (v2026.04.0)

**Problem:** Users need contextual help while using the platform. Error messages
from failed jobs are often cryptic. New users struggle with RBAC, credentials,
and inventory setup.

**Solution:** (detailed in `docs/chat_plan.md`)
- Ollama LLM (mistral:7b or llama3.1:8b) running as a Docker service
- ChromaDB vector store with indexed Forge/Ansible documentation
- Django API endpoint `/api/v2/assistant/` with SSE streaming
- Frontend chat panel integrated into Forge UI
- Context-aware: knows which page the user is on
- Error analysis: explain failed job output

**Effort:** 4 weeks
**Dependencies:** GPU recommended (CPU fallback with smaller model)

---

### 1.5 Improved Audit Trail --- COMPLETED (v2026.04.0)

**Problem:** AWX activity stream records changes but lacks detail for compliance
auditing. No way to generate audit reports or track credential access.

**Solution:**
- Extend activity stream with: source IP, user agent, session ID
- Add credential access logging (who used which credential, when, on which host)
- Immutable audit log table (append-only, no updates or deletes)
- Audit report generator: filter by user/resource/date range, export PDF/CSV
- Retention policies: auto-archive old records to cold storage
- SIEM integration: structured JSON log export for Splunk/ELK/Datadog

**Effort:** 2-3 weeks
**Dependencies:** None

---

## Tier 2: Strategic Features (Q3-Q4 2026)

Features that position Forge as a modern platform beyond basic AWX capabilities.

### 2.1 Self-Service Portal --- COMPLETED (v2026.04.0)

**Problem:** Non-technical users (helpdesk, operations, managers) cannot use
AWX without training. They need a simplified interface to run pre-approved
automation without understanding templates, inventories, or credentials.

**Delivered:**
- `ServiceCatalogItem` model wraps an existing JobTemplate or
  WorkflowJobTemplate with portal metadata (icon, category, tags,
  `requires_approval`, `approver_team`).
- `ServiceRequest` lifecycle (`pending_approval` → `approved` /
  `rejected` → `running` → `successful` / `failed` / `canceled`) with
  `submit/approve/reject` methods and a post_save signal that mirrors
  terminal UnifiedJob status back onto the linked request.
- Approver permission model: superuser, `approver_team` membership, or
  org admin fallback when no team is set.
- REST API mounted at `/api/v2/service_catalog_items/` and
  `/api/v2/service_requests/` (CRUD + `launch_data`, `submit`,
  `approve`, `reject`, `pending_approvals` inbox).
- Frontend: Service Portal (catalog grid), multi-step
  `ServiceRequestDialog` (justification → workflow survey → per-node
  surveys → confirm), My Requests, Approvals inbox, Catalog Admin CRUD.
- Reuses existing launch pipeline (`create_unified_job`) and the
  `SurveyQuestionInput` extracted from `WorkflowLaunchDialog` —
  no duplication.
- Tests: 22 standalone backend lifecycle tests + 10 frontend
  type-shape tests.
- See `forge-backend/docs/17-self-service-portal.md` for full
  architecture.

---

### 2.2 Policy-as-Code --- COMPLETED (v2026.04.0)

**Problem:** No governance framework to enforce rules like "production jobs
must have approval", "credentials must rotate every 90 days", or "only
signed playbooks can run on production inventories".

**Delivered:**
- `Policy` model storing Rego modules + metadata; pushed to a
  `forge-opa` sidecar (OPA 0.69.0) on save via post_save signal.
- `PolicyDecision` audit row per evaluation hit; full launch context
  preserved as JSON.
- `evaluator.evaluate_launch()` hooked into `JobTemplateLaunch.post`,
  `WorkflowJobTemplateLaunch.post`, and `AdHocCommandList.create`,
  strictly between `create_unified_job` and `signal_start`.
- Three-tier enforcement: global `OPA_ENABLED` kill switch +
  per-organization `policy_enforcement` (`none/warn/enforce`) +
  per-policy `enforcement` (`warn/enforce`). Org `warn` caps any
  policy from blocking. All combinations covered by a unit-tested
  resolver.
- Configurable fail mode: `OPA_FAIL_MODE=allow` (default, fail-open
  with audit) or `deny` (fail-closed) when the OPA sidecar is
  unreachable.
- REST API at `/api/v2/policies/` (CRUD + enable/disable + dry-run
  test endpoint) and `/api/v2/policy_decisions/` (audit log).
- Frontend: Policies CRUD page with sync status badges, PolicyForm
  with Rego editor and dry-run panel, PolicyDecisions audit log with
  expandable context viewer. Compliance sidebar group extended with
  Policies and Policy Decisions entries.
- `forge-opa` sidecar added to `forge-deploy/docker-compose.yml`
  (image `openpolicyagent/opa:0.69.0-rootless`, healthcheck against
  `/health`).
- 19 standalone backend tests + 6 frontend type-shape tests, 0 TS
  errors.
- See `forge-backend/docs/19-policy-as-code.md` for the full
  architecture.

---

### 2.3 Modern Authentication (OIDC + WebAuthn) --- COMPLETED (v2026.04.0)

**Problem:** AWX supports LDAP, SAML, and social auth but lacks native OIDC
and passwordless login. WebAuthn/passkeys are now the standard for
phishing-resistant authentication.

**Delivered:**
- OIDC client wired through the existing
  `social_core.backends.open_id_connect.OpenIdConnectAuth` (no new
  dependency — already vendored). Configuration via Settings → Generic
  OIDC. New settings: button label, scope override, organization map,
  team map. JIT user provisioning + org/team mapping reuses
  `forge.sso.social_pipeline`.
- WebAuthn / FIDO2 via `py_webauthn==2.5.2`:
  * `WebAuthnCredential` model + 5-minute challenge stores.
  * REST API at `/api/v2/webauthn/credentials/`,
    `register/{begin,complete}/`, `authenticate/{begin,complete}/`.
  * Replay protection via monotonic sign-count guard.
  * Origin / RP-ID derived from request — same image works on any host.
- Org-level MFA enforcement: `Organization.webauthn_required`
  (`none`/`admins`/`all`) + `WebAuthnMfaEnforcementMiddleware` that
  flips `session.mfa_pending` when policy applies.
- Frontend: `/me/security` credential management page,
  `/auth/mfa` post-primary-auth interstitial, **Sign in with security
  key** and **Sign in with OIDC** buttons on the login page,
  TopBar dropdown "Security" entry. Browser side uses
  `@simplewebauthn/browser` v13.
- 16 standalone backend tests (policy resolver, replay guard, TTL,
  base64url helpers) + 5 frontend type-shape tests.
- See `forge-backend/docs/18-oidc-webauthn.md` for the full architecture.

---

### 2.4 Workflow Survey Prompts per Node --- COMPLETED (v2026.04.0)

**Problem:** Workflow job templates only support surveys at the workflow level.
Users cannot prompt for different variables at individual job template nodes
within a workflow.

**Solution:**
- Add `survey_spec` to `WorkflowJobTemplateNode` model
- At launch time, merge workflow-level and node-level survey prompts
- Frontend: multi-step launch dialog showing prompts grouped by node
- Support `ask_variables_on_launch` per node (not just per workflow)

**Effort:** 2-3 weeks
**Dependencies:** None

---

### 2.5 Automation Analytics Dashboard --- COMPLETED (v2026.04.0)

**Problem:** AWX provides basic metrics but no insight into automation value,
trends, or efficiency. Managers cannot answer "how much time did automation
save this month?"

**Solution:**
- New analytics models tracking: job duration trends, success/failure rates
  over time, most-used templates, busiest hosts, automation coverage
- Time savings calculator: estimated manual time vs automated time
- Dashboard with Recharts visualizations: job trends, host coverage map,
  template usage heatmap, failure analysis
- Scheduled email reports: weekly/monthly automation summary
- API: `/api/v2/forge_analytics/` with date range filters

**Effort:** 3 weeks
**Dependencies:** None (uses existing job data)

---

## Tier 3: Platform Evolution (2027+)

Long-term features for enterprise scale and ecosystem growth.

### 3.1 Plugin Architecture

- Microkernel design: core handles jobs, scheduling, inventory; everything
  else is a plugin (credential backends, notification channels, inventory
  sources, SCM providers)
- Plugin SDK with documented hooks: pre-job, post-job, credential resolution,
  inventory sync, notification dispatch
- Plugin registry with install/update/remove via UI
- Sandboxed execution: plugins run in isolated containers

**Effort:** 8-12 weeks

---

### 3.2 Multi-Tenancy --- COMPLETED (v2026.04.0)

**Problem:** Forge had Organizations and per-org RBAC, but running a single
install for multiple customers required trusting RBAC to be airtight, manually
provisioning every customer's org/admin/team, manually enforcing "fair use"
(there were no quotas — one noisy tenant could hog all Celery workers), and
manually skinning the UI per customer.

**Delivered (v1 — soft multi-tenancy, no new compose service):**
- `Organization` extended with 11 additive fields: `is_tenant_root`,
  `tenant_max_concurrent_jobs`, `tenant_max_daily_launches`,
  `tenant_max_hosts`, `tenant_max_storage_mb`, `tenant_isolation_strict`,
  `tenant_logo_url`, `tenant_primary_color`, `tenant_secondary_color`,
  `tenant_custom_domain` (indexed), `tenant_contact_email`. All default to
  safe values — existing orgs are untouched (zero-downtime migration
  `0204_multi_tenancy`).
- `TenantUsage` (OneToOne with Organization) — rolling counters for
  concurrent jobs, launches-today, hosts_count, storage_mb_used, with a
  `launches_today_window_start` for calendar-UTC day rollover.
- `TenantQuotaEvent` — one audit row per quota decision (allow or block),
  mirrors the `PolicyDecision` shape; cached `organization_name` so the row
  survives org delete.
- `TenantIsolationEvent` — v1 audit-only row for cross-tenant reads observed
  when `tenant_isolation_strict=True` (blocking deferred to v2).
- `forge/main/tenancy/` package: pure helpers (`check_quota_value`,
  `is_window_expired`, `reset_daily_window`, `format_quota_message`,
  `normalize_branding_host`, `validate_hex_color`), `quota.py` with
  `check_tenant_quota` + `on_job_finished`, `provisioning.py` with atomic
  `provision_tenant` (Org + admin User + default Team + TenantUsage in one
  transaction), `branding.py` with `get_branding_for_host`, `usage.py` with
  `recalculate_tenant_usage` drift reconciliation, `isolation.py`
  middleware.
- Launch hook inserted **before** Policy-as-Code and IaC Scanning in
  `JobTemplateLaunch.post`, `WorkflowJobTemplateLaunch.post`, and
  `AdHocCommandList.create`. Blocked launches return HTTP **429** with the
  quota kind that tripped, inside the `forge.launch` OTel span
  (adds `quota_blocked=<kind>` attribute for trace filtering).
- Job-finished signal decrements `concurrent_jobs_count`; Celery beat
  `recalculate_tenant_usage_all` runs every
  `TENANCY_QUOTA_RECALC_INTERVAL_S` seconds and also reconciles the
  concurrent counter against actual running UnifiedJob count.
- Settings (System category): `TENANCY_ENABLED` (global kill switch,
  default off), `TENANCY_DEFAULT_MAX_CONCURRENT_JOBS`,
  `TENANCY_DEFAULT_MAX_DAILY_LAUNCHES`, `TENANCY_QUOTA_RECALC_INTERVAL_S`
  (default 300s).
- REST API: `/api/v2/tenants/` (superuser CRUD + provision + recalculate),
  `/api/v2/tenant_quota_events/` (audit log), and
  `/api/v2/branding/?host=<hostname>` — **PUBLIC** (no auth classes) so
  the frontend can skin itself before login. Returns 404 on miss.
- Frontend: `/tenants`, `/tenants/new`, `/tenants/:id`, `/tenants/:id/edit`,
  `/tenant_quota_events` pages with usage bars, branding preview, color
  pickers, quota inputs (empty = unlimited), danger-zone delete. NEW
  sidebar group **Tenancy** (Building2 + Activity icons) above Compliance.
- Boot-time branding: `src/branding/applyBranding.ts` called from
  `src/main.tsx` **before** React mounts. Fetches
  `/api/v2/branding/?host=window.location.hostname` with no credentials,
  sets CSS variables `--forge-primary` / `--forge-secondary` on `:root`,
  swaps the favicon and document title, caches in localStorage for 5 min.
  Tailwind exposes the CSS vars as `colors.brand.primary`/`secondary`.
- No new compose service — tenancy piggybacks on the existing `forge-web`
  and `forge-task` containers and is gated by `TENANCY_ENABLED`.
- Standalone tests in `tests_standalone/test_tenancy.py` cover all pure
  helpers, QuotaResult aggregation, window rollover edge cases, branding
  host normalization, and provisioning payload validation.
- See `forge-backend/docs/22-multi-tenancy.md` for the full architecture.

**Deferred to v2:**
- Postgres row-level security policies (real DB-level isolation).
- Strict-mode enforcement (cross-tenant reads blocked, not just audited).
- Per-tenant API rate limiting at the middleware layer (token bucket).
- Per-tenant Celery queues (single shared queue + quota is the v1 fairness
  story).
- Custom-domain TLS provisioning (Let's Encrypt automation).
- Billing / metering hooks.
- Tenant-scoped LDAP/SAML/OIDC federation.

**Effort:** 6-8 weeks

---

### 3.3 Kubernetes Operator

- CRDs for core resources: JobTemplate, Inventory, Credential, Schedule
- Reconciliation controller for desired-state management
- Helm chart + OLM distribution
- Multi-cluster support from a single control plane

**Effort:** 6-8 weeks

---

### 3.4 IaC Scanning and Supply Chain Security --- COMPLETED (v2026.04.0)

**Problem:** Policy-as-Code (Tier 2.2) gates launches on metadata (who,
what, where) but never inspects the playbook body. Nothing prevents a
playbook from disabling SELinux, embedding a secret, using `shell:`
with unquoted user input, pulling an unpinned role, or importing a
Python package with a known CVE.

**Delivered:**
- `Scanner` model — one row per configured tool (ansible-lint, checkov,
  pip-audit) with severity threshold + enforcement + `applies_to`.
- `ScanResult` audit row per scanner execution (status ok / warn /
  blocked / error / timeout, duration, finding_count, highest severity,
  truncated raw output, cached scanner_name so rows survive delete).
- `ScanFinding` child row per finding at or above threshold
  (rule_id, severity, file_path, line, message).
- `forge/main/scanning/runner.py` — subprocess runner with per-scanner
  timeout, project checkout path + playbook resolution, output parsing,
  ScanResult + ScanFinding persistence, aggregate `ScanRunResult`.
- Tool adapters in `forge/main/scanning/tools/` — one module per CLI
  (`ansible-lint -f json --strict`, `checkov -o json`, `pip-audit
  --format json`) with severity normalization to info/low/medium/
  high/critical.
- Pure helpers: `severity_at_or_above`, `effective_enforcement`,
  `aggregate_status`, `fail_mode_decision` — unit-tested standalone.
- Hook inserted **after** the Policy-as-Code hook in
  `JobTemplateLaunch.post`, `WorkflowJobTemplateLaunch.post`, and
  `AdHocCommandList.create`. Blocked launches return 403 with
  `reasons`; warn launches append a one-liner to `job_explanation`.
- Settings: `SCANNER_ENABLED` (master switch), `SCANNER_TIMEOUT_S`
  (per-scanner subprocess timeout), `SCANNER_FAIL_MODE` (allow /
  deny on timeout/crash), `SCANNER_RAW_OUTPUT_MAX` — all in the
  Security category.
- REST API at `/api/v2/scanners/` (CRUD + enable/disable) and
  `/api/v2/scan_results/` (audit log with embedded findings).
- Frontend: Scanners CRUD page with tool badge, severity threshold,
  enforcement badge, last-run status, enable toggle; ScannerForm with
  tool dropdown, severity selector, JSON config editor, applies_to
  checkboxes; ScanResults audit table with status filter and finding
  drawer. Compliance sidebar group extended with Scanners and Scan
  Results entries.
- Scanner CLIs bundled into the `forge-backend` image (installed into
  `/var/lib/awx/venv/awx`), no new compose service — the existing
  `forge_projects` volume is already mounted on every forge container.
- Standalone backend tests for helpers, adapter parsers, applies_to
  matching, and fail-mode resolver.
- See `forge-backend/docs/20-iac-scanning.md` for the full
  architecture.

**Deferred to v2:**
- Collection / role provenance verification (sigstore / checksums) —
  needs a separate signing infrastructure conversation.
- Live CVE feed for non-Python EE packages (system OS packages).
- In-line annotations on the playbook source viewer.
- Custom rule authoring UI.

**Effort:** 3-4 weeks

---

### 3.5 Mobile Application

Detailed plan in `docs/mobile_plan.md`:
- Deployment approval with biometric verification
- Real-time server monitoring (containers, CPU, RAM, disk)
- Live log streaming
- Push notification alerts
- AI assistant chat

**Effort:** 7 weeks

---

### 3.6 Observability Integration

- OpenTelemetry export for all automation runs (traces, metrics)
- Distributed tracing across multi-node receptor mesh
- Grafana dashboard templates for Forge metrics
- Closed-loop: observability alerts feed into EDA rules

**Effort:** 3-4 weeks

---

## Priority Matrix

| # | Feature | Impact | Effort | Priority |
|---|---------|--------|--------|----------|
| 1.1 | Dynamic Surveys | High | 2-3w | **DONE** |
| 1.2 | Event-Driven Automation | High | 4-6w | **DONE** |
| 1.3 | Drift Detection | High | 3-4w | **DONE** |
| 1.4 | AI Assistant (Ollama) | High | 4w | **DONE** |
| 1.5 | Audit Trail | Medium | 2-3w | **DONE** |
| 2.1 | Self-Service Portal | High | 3-4w | **DONE** |
| 2.2 | Policy-as-Code (OPA) | Medium | 4-5w | **DONE** |
| 2.3 | OIDC + WebAuthn | Medium | 3-4w | **DONE** |
| 2.4 | Workflow Node Surveys | Medium | 2-3w | **DONE** |
| 2.5 | Analytics Dashboard | Medium | 3w | **DONE** |
| 3.1 | Plugin Architecture | High | 8-12w | P2 |
| 3.2 | Multi-Tenancy | High | 6-8w | **DONE** |
| 3.3 | Kubernetes Operator | Medium | 6-8w | P2 |
| 3.4 | IaC Scanning | Medium | 3-4w | **DONE** |
| 3.5 | Mobile App | Medium | 7w | P2 |
| 3.6 | Observability (OTel) | Medium | 3-4w | **DONE** |

---

## Infrastructure & Test Environments

- **Provision Kubernetes test instance for Forge Platform** — currently
  there is no k8s environment to validate Tier 3.6 manifest stubs
  (`forge-deploy/k8s/otel-collector.yaml`,
  `forge-deploy/k8s/grafana-dashboards-cm.yaml`) or to begin work on
  Tier 3.3 (Kubernetes Operator). A small single-node cluster (k3s,
  kind, or microk8s on a dedicated VM) is enough to start. Acceptance:
  `kubectl apply -f forge-deploy/k8s/` succeeds and Collector pods
  reach Ready state. Owner: TBD. Priority: blocks 3.3 and validates 3.6.

---

## Competitive Landscape

| Feature | Forge | AWX | AAP 2.5+ | Ascender | Semaphore |
|---------|-------|-----|----------|----------|-----------|
| Docker Compose deploy | Yes | No | No | Yes | Yes |
| Dynamic surveys | Yes | No | No | No | No |
| Event-driven (EDA) | Yes | No | Yes | No | No |
| Drift detection | Yes | No | No | Yes | No |
| AI assistant | Yes | No | Yes | No | No |
| Self-service portal | Planned | No | Yes | No | No |
| Policy-as-Code | Planned | No | Planned | No | No |
| OIDC native | Planned | Partial | Yes | Partial | No |
| WebAuthn/passkeys | Planned | No | No | No | No |
| Modern UI (React 18) | Yes | Legacy | Yes | Legacy | Yes |
| Multi-tenancy | Planned | No | Yes | No | No |
| K8s operator | Planned | Yes | Yes | Yes | No |
| Open source | Yes | Yes | No | Partial | Yes |

---

## Research Sources

- [AWX GitHub Issues — feature requests](https://github.com/ansible/awx/issues)
- [Ansible Forum — Is there a future for AWX?](https://forum.ansible.com/t/is-there-a-future-for-awx/44527)
- [Ansible Forum — Programmable survey feature](https://forum.ansible.com/t/programable-survey-feature-in-awx/5806)
- [Ascender Ledger — CIQ](https://github.com/ctrliq/ascender-ledger)
- [AAP 2.5 Release Notes — Red Hat](https://docs.redhat.com/en/documentation/red_hat_ansible_automation_platform/2.5/html/release_notes/new-features)
- [What's New in AAP 2.6 — Red Hat](https://www.redhat.com/en/blog/whats-new-in-ansible-automation-platform-2.6)
- [Event-Driven Ansible — Red Hat](https://www.redhat.com/en/technologies/management/ansible/event-driven-ansible)
- [Terraform Cloud Alternatives 2026 — env0](https://www.env0.com/blog/terraform-cloud-tfc-alternatives-comprehensive-buyers-guide)
- [GitOps 2026 Complete Guide — Calmops](https://calmops.com/devops/gitops-2026-complete-guide/)
- [AI and AIOps in 2026 — Refonte Learning](https://www.refontelearning.com/blog/ai-and-aiops-in-2026-how-intelligent-automation-is-redefining-devops-engineering)
- [Policy-as-Code Tools 2026 — Spacelift](https://spacelift.io/blog/policy-as-code-tools)
- [OpenTelemetry in 2026 — The New Stack](https://thenewstack.io/can-opentelemetry-save-observability-in-2026/)
- [Multi-Tenant Architecture 2026 — QABash](https://www.qabash.com/saas-multi-tenancy-architecture-testing-2026/)
- [Authentication Trends 2026 — C# Corner](https://www.c-sharpcorner.com/article/authentication-trends-in-2026-passkeys-oauth3-and-webauthn/)
- [IaC Security 2026 — Fidelis](https://fidelissecurity.com/cybersecurity-101/cloud-security/infrastructure-as-code-iac-security-drives-cloud-confidence/)
- [Semaphore vs AWX](https://semaphoreui.com/vs/awx)

---

## Wiki Documentation (Developer Onboarding)

**Problem:** Novi developeri koji pristupe projektu nemaju pregled arhitekture,
ne znaju šta koji fajl radi, niti kako su komponente povezane. Bez kvalitetne
dokumentacije, onboarding traje predugo i razvoj se usporava.

**Cilj:** Napraviti ultra detaljnu wiki dokumentaciju koja objašnjava svaki
fajl i modul u projektu, tako da budući kolege mogu samostalno da se snadju
i razvijaju platformu.

**Sadržaj wiki dokumentacije:**

1. **Architecture Overview** — dijagram sistema (backend, frontend, task engine,
   Redis, PostgreSQL, Receptor), kako komponente komuniciraju
2. **Backend (Django)** — objašnjenje svakog modula:
   - `forge/main/models/` — svaki model, relacije, migracije
   - `forge/api/views/` — svaki API endpoint, šta radi, koji serializer koristi
   - `forge/api/serializers/` — logika validacije i transformacije podataka
   - `forge/main/tasks/` — Celery taskovi, job runner, callback pipeline
   - `forge/main/signals/` — Django signali i side-effecti
   - `forge/conf/` — settings, konfiguracija, environment varijable
3. **Frontend (React/TypeScript)** — struktura UI koda:
   - Svaka stranica i komponenta
   - Routing, state management, API pozivi
   - Stilizacija i UI framework
4. **Task Engine** — kako se jobovi pokreću, lifecycle joba od launcha do
   završetka, receptor mesh, izolacija izvršavanja
5. **Authentication & RBAC** — autentifikacija, permisije, organizacije, timovi,
   kako RBAC radi od API-ja do baze
6. **Database Schema** — ER dijagram, ključne tabele, relacije
7. **Docker & Deployment** — objašnjenje svakog kontejnera, docker-compose
   konfiguracija, environment varijable, volumeni
8. **CI/CD Pipeline** — `.gitlab-ci.yml`, `Jenkinsfile`, build proces, testovi
9. **Testing** — kako pokrenuti testove, struktura testova, šta koji test pokriva
10. **Contributing Guide** — coding standardi, git workflow, PR proces,
    commit konvencije

**Format:** GitHub Wiki (u okviru `forgeplatform/forge-platform` repozitorijuma)
ili `docs/wiki/` direktorijum u samom projektu.

**Effort:** 3-4 weeks
**Dependencies:** None — može se raditi paralelno sa razvojem feature-a

---

## FreeBSD Support (Host & Jail)

**Problem:** Forge trenutno radi isključivo na Linux-u (Ubuntu 24.04+) i u
Docker kontejnerima. FreeBSD korisnici, koji često koriste Ansible za
upravljanje serverima i mrežnom opremom, nemaju mogućnost da pokrenu Forge
nativno na svom sistemu.

**Cilj:** Omogućiti pokretanje Forge platforme direktno na FreeBSD hostu
i unutar FreeBSD jail-a kao alternativu Docker deployment-u.

**Potrebne izmene:**

1. **Dependency kompatibilnost** — proveriti i prilagoditi sve Python zavisnosti
   za FreeBSD (posebno: psycopg2, uwsgi/gunicorn, receptor, channels/daphne)
2. **Konfiguracija servisa** — rc.d skripte za pokretanje Forge komponenti
   (web, task engine, daphne/websocket, beat scheduler)
3. **PostgreSQL & Redis** — dokumentovati instalaciju iz portova/pkg-a,
   konfiguracija za Forge
4. **Jail deployment** — jail konfiguracija sa izolovanim Forge okruženjem,
   networking (VNET ili alias IP), storage (ZFS dataset per jail)
5. **Port/package** — kreirati FreeBSD port (`sysutils/forge-platform`) za
   jednostavnu instalaciju putem `pkg install`
6. **Receptor mesh** — proveriti da receptor radi na FreeBSD-u, prilagoditi
   ako koristi Linux-specific sistemske pozive
7. **Testiranje** — pokrenuti test suite na FreeBSD 14.x, ispraviti sve
   platform-specifične probleme (putanje, signali, korisnici/grupe)
8. **Dokumentacija** — instalacioni vodič za FreeBSD host i jail deployment

**Effort:** 4-6 weeks
**Dependencies:** FreeBSD 14.x test okruženje, Python 3.12+ iz portova
