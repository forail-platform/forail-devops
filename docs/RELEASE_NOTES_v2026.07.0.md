# Forail 2026.07.0 — Release Notes

**Release date:** 2026-06-24
**Based on:** Forail 2026.06.0
**License:** Apache License 2.0

---

## Overview

2026.07.0 is a **security-hardening and migration** release. It tightens several
authentication and audit defaults (some of which are **breaking** for existing
SAML deployments), makes tenant isolation fail closed, replaces the insecure
defaults in the Helm chart and Compose stack (**breaking** — installs now require
an explicit admin password), and introduces a one-shot **AWX → Forail importer**
so teams can migrate off AWX/AAP without rebuilding their configuration by hand.

Kubernetes installs also gain the pod RBAC and receptor worktype that in-cluster
job execution needs — see *Fixed*.

There are no data-model changes. Two idempotent migrations (`0209`, `0210`) ship
with the tenancy work; both only drop and re-create PostgreSQL row-level-security
policies, so they apply to an existing database without touching table schemas or
rows.

## Added

### AWX → Forail migration importer

A new backend management command migrates configuration from an existing AWX (or
AAP) installation via its REST API:

```bash
forail-manage import_from_awx \
    --url https://awx.example.com \
    --token "$AWX_TOKEN" \
    --dry-run            # preview; remove to apply
```

- Imports Organizations, Users, Teams, Credential Types, Credentials, Projects,
  Inventories (with group hierarchy and host membership), Inventory Sources,
  Job Templates, Workflow Job Templates (with their node DAG), Schedules,
  Notification Templates, and RBAC role assignments, in dependency order.
- **Idempotent** — re-running matches existing objects by natural key (name
  within organization; username for users) and updates rather than duplicating.
- `--dry-run` previews all changes inside a rolled-back transaction.
- `--resource <type>` (repeatable) limits the run to specific resource types.
- Auth via `--token` (preferred) or `--username/--password`; `--insecure` skips
  source TLS verification.

**Secrets are not migrated.** The AWX API never returns secret credential inputs
(it sends `$encrypted$`), and user passwords are not exported. The importer
brings over credential *structure* and non-secret inputs, creates users with an
unusable password, and reports exactly how many secret fields need manual
re-entry afterwards. Notification-template secrets are stripped the same way.

RBAC role assignments are migrated where the target framework allows it: user
grants and team→object-role grants are applied; organization-member grants to
teams (rejected by the access framework) are skipped with a warning rather than
aborting the run.

## Security hardening

- Superuser grant/revoke is now written to the dedicated audit log
  (independently of the activity stream).
- Audit records store a SHA-256 hash of the session key, never the raw key.
- `X-Forwarded-For` is trusted for the audit source IP only behind a configured
  trusted proxy (`PROXY_IP_ALLOWED_LIST`).
- OAuth `refresh_token` is redacted from activity-stream entries.
- Tenant concurrency-quota errors are logged instead of silently swallowed.

### Tenant isolation now fails closed

- The RLS middleware **aborts the request (HTTP 500)** if it cannot install the
  tenant scope, instead of continuing with global row visibility.
- The strict-isolation gate resolves the target organization with the caller's
  RLS scope removed — previously the lookup ran *inside* the caller's scope, so a
  cross-tenant object was invisible and the gate could essentially never fire. It
  now denies by default when a covered resource's organization cannot be
  determined, and records a `TenantIsolationEvent`.
- RLS coverage extended to `main_eventlog`, and every policy now casts the tenant
  GUC via `NULLIF(current_setting(...), '')::int` so the empty "no scope"
  sentinel cannot raise (migrations `0209`, `0210`).
- The tenancy rate limiter logs Redis outages loudly and honours
  `TENANCY_RATE_LIMIT_FAIL_CLOSED` (default open, for availability).

### Trust boundaries around import and SSO

- `import_from_awx` no longer carries privilege across the boundary implicitly:
  superuser / system-role promotion requires `--grant-superusers`, custom
  credential-type injectors are dropped for admin re-approval unless
  `--trust-injectors` is passed, and secrets are read from `AWX_TOKEN` /
  `AWX_PASSWORD` in preference to argv.
- **SSO account takeover fixed**: `associate_by_email` was removed from the auth
  pipeline — accounts associate by provider UID, never by matching email.
- Tenant provisioning refuses to silently reuse an existing username (which
  discarded the supplied password and cross-linked accounts) unless
  `attach_existing_admin` is set.
- The IaC scanner can no longer be pointed outside the project checkout via a job
  template's `playbook` field (absolute paths / `..`).

### Deployment defaults — Helm chart and Compose

Both deployment artifacts shipped working credentials and a privileged worker by
default. That is over:

- **Helm**: `postgresPassword`, `forailSecretKey` and
  `forailBroadcastWebsocketSecret` are auto-generated on first install and reused
  across upgrades; `forailAdminPassword` is **required**. `forail-task` runs
  non-privileged with no host cgroup mount unless you opt in. Session cookies are
  `Secure`, `allowedHosts` is the ingress host plus loopback (not `"*"`), and an
  opt-in `NetworkPolicy` plus per-workload `securityContext` knobs are available.
- **Compose**: `FORAIL_TASK_PRIVILEGED` / `FORAIL_TASK_CGROUP` default off,
  `FORAIL_ALLOWED_HOSTS` defaults to `localhost,127.0.0.1` instead of `*`, and
  `FORAIL_TAG` pins to `2026.07.0` rather than `:latest`.
- **Operator**: the manager no longer holds cluster-wide `get/list/watch` on
  every Secret — the credential reconciler's access is a namespaced
  `Role`/`RoleBinding` in the operator's own namespace.
- **Assistant**: a wildcard CORS origin no longer combines with credentials, and
  `/api/v1/chat` accepts an optional shared bearer token
  (`FORAIL_ASSISTANT_CHAT_TOKEN`) with a concurrency cap
  (`FORAIL_ASSISTANT_CHAT_MAX_CONCURRENCY`, 429 on overload).

See **Breaking changes — deployment defaults** below for the upgrade actions.

## ⚠️ Breaking changes — SAML

Two SAML defaults changed. They affect installs that rely on the previous,
weaker behavior.

### 1. Signed assertions + SHA-256 now required by default

`SOCIAL_AUTH_SAML_SECURITY_CONFIG` now defaults to:

```json
{
  "requestedAuthnContext": false,
  "wantMessagesSigned": true,
  "wantAssertionsSigned": true,
  "rejectUnsolicitedResponsesWithInResponseTo": true,
  "signatureAlgorithm": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  "digestAlgorithm": "http://www.w3.org/2001/04/xmlenc#sha256"
}
```

**Impact:** If your IdP sends unsigned responses/assertions, or signs with
SHA-1, logins will be rejected after upgrade.

**Action:**
- Preferred: reconfigure your IdP to sign responses and assertions with SHA-256.
- Temporary fallback: explicitly set `SOCIAL_AUTH_SAML_SECURITY_CONFIG` via
  `PATCH /api/v2/settings/saml/` for a legacy IdP (not recommended for
  production).

  > ⚠️ **Setting this replaces the whole dict — it does not merge with the
  > secure defaults.** When the setting is unset, Forail's hardened defaults
  > apply; the moment you set it, your value is used verbatim and any key you
  > omit falls back to the **weak** python-saml/OneLogin default (unsigned
  > assertions, SHA-1). So to relax a single key you must re-specify the full
  > secure dict with only that key changed, e.g. to accept unsigned assertions
  > from one legacy IdP while keeping every other protection:
  >
  > ```json
  > {
  >   "requestedAuthnContext": false,
  >   "wantMessagesSigned": true,
  >   "wantAssertionsSigned": false,
  >   "rejectUnsolicitedResponsesWithInResponseTo": true,
  >   "signatureAlgorithm": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  >   "digestAlgorithm": "http://www.w3.org/2001/04/xmlenc#sha256"
  > }
  > ```
  >
  > Clearing the setting (back to null) restores the full hardened defaults.

### 2. SAML role-attribute grants require an explicit value

Granting `is_superuser` / `is_system_auditor` from a SAML attribute now requires
a non-empty `is_superuser_value` / `is_system_auditor_value`.

**Impact:** A configuration that sets only `is_superuser_attr` (with no value)
previously granted superuser to **every** user the IdP sent with that attribute.
That now fails safe (no grant) and logs a warning.

**Action:** Set the required attribute value(s) for the flags you intend to grant.

## ⚠️ Breaking changes — deployment defaults

### 1. `helm install` requires an admin password

`secrets.forailAdminPassword` has no default and no generated fallback; the chart
fails to render without it. The other three secrets (`postgresPassword`,
`forailSecretKey`, `forailBroadcastWebsocketSecret`) are generated on first
install and looked up on subsequent upgrades, so leave them empty unless you pin
them deliberately.

**Action:** pass `--set secrets.forailAdminPassword='<strong-password>'` on
install. Automation that renders the chart (CI `helm lint` / `helm template`)
needs a throwaway value for the same reason.

### 2. `forail-task` is no longer privileged by default

The podman-in-pod execution path needs a privileged container and the host cgroup
namespace; both now default **off**, because a privileged pod with a host cgroup
mount is a trivial container escape.

**Action, Kubernetes:** `--set task.privileged=true --set task.hostCgroup=true`
(ideally pinning those workers to dedicated, tainted nodes).
**Action, Compose:** `FORAIL_TASK_PRIVILEGED=true FORAIL_TASK_CGROUP=host`.

### 3. Allowed hosts and secure cookies

`forail.allowedHosts` / `FORAIL_ALLOWED_HOSTS` no longer default to `"*"`, and
session cookies are `Secure` by default — a deployment served over plain HTTP
will not keep a session.

**Action:** set your real ingress host(s), and **keep `127.0.0.1,localhost` in the
list** — the in-cluster health probes call the API on loopback. Terminate TLS in
front of the ingress, or set `forail.cookieSecure: "false"` for a lab install.

## Fixed

- **In-cluster job execution now works out of the box.** Two pieces were missing
  from the chart, and each failed a launch on its own:
  - No pod RBAC. Jobs run as pods in a Kubernetes container group, and receptor
    manages them with the task pod's ServiceAccount — which had no pod
    permissions, so every launch failed with
    `pods is forbidden ... cannot list resource "pods"` and the job hung pending.
    The chart now ships a `forail` ServiceAccount plus a namespaced
    `forail-job-runner` `Role`/`RoleBinding` (`pods`, `pods/log|attach|exec`) and
    a `MY_POD_NAMESPACE` downward-API env so job pods land in the release
    namespace.
  - The receptor mesh config declared only the `local` worktype, so launches
    errored at 0s with `unknown work type kubernetes-incluster-auth`. The
    `kubernetes-incluster-auth` worktype (`authmethod: incluster`) is now
    registered.
- **`forail-web` crash-loop after the allowed-hosts change.** The liveness and
  readiness probes call `http://127.0.0.1:8013/api/v2/ping/`; with only the
  ingress host allowed, Django answered `400 DisallowedHost`, the probe failed and
  the pod restarted in a loop. The chart default keeps the loopback names.
- **Tenancy audit events were never persisted.** `TenantQuotaEvent` and
  `TenantIsolationEvent` inherit `CreatedModifiedModel`, which lacks the
  `description` column that migration `0205` declares `NOT NULL` — every insert
  raised `IntegrityError`. Both models now declare the field (no new migration).
- **RBAC role assignment was broken in 2026.06.0.** `ScanFinding` and
  `TenantIsolationEvent` were registered with the default
  `parent_field_name='organization'`, but neither model has an `organization`
  field. The resulting `FieldDoesNotExist` aborted **every** role-assignment
  operation across the platform. They are now registered against their real
  parents (`scan_result` and `accessed_organization` respectively). Anyone on
  2026.06.0 who relies on role assignment should upgrade. No data migration is
  required — the fix is in model registration only.
- `pytest.ini` referenced the pre-rename `awx.main.tests.settings_for_test`
  (no longer exists), which prevented the backend test suite from starting.
- Tenant queue router referenced pre-rename `awx.main.tasks.*` task names.

## Upgrade

No schema migrations. Migrations `0209` and `0210` re-create RLS policies only
and are idempotent, so the standard image re-point applies — but the chart's new
required/secure defaults have to be supplied:

```bash
helm upgrade forail oci://ghcr.io/forail-platform/forail-helm \
    --version 2026.7.0 -n forail \
    --set secrets.forailAdminPassword='<strong-password>' \
    --set forail.allowedHosts='forail.example.com,127.0.0.1,localhost' \
    --set task.privileged=true --set task.hostCgroup=true   # only if you run jobs in-pod
```

Before upgrading:

- **SAML deployments** — review **Breaking changes — SAML** above and reconfigure
  the IdP if needed.
- **Any deployment** — review **Breaking changes — deployment defaults**; an
  upgrade that omits the admin password will not render, and one that drops the
  loopback hosts will fail its health probes.
- **Multi-tenant deployments** — tenant isolation now fails closed. A request
  whose tenant scope cannot be installed is rejected rather than served with
  global visibility; verify your tenants resolve correctly in a staging install
  first.
