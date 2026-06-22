# Forail 2026.07.0 — Release Notes (DRAFT / Unreleased)

**Release date:** TBD
**Based on:** Forail 2026.06.0
**License:** Apache License 2.0

> This document is a working draft for the next release. Dates and the final
> feature set may change.

---

## Overview

2026.07.0 is a **security-hardening and migration** release. It tightens several
authentication and audit defaults (some of which are **breaking** for existing
SAML deployments) and introduces a one-shot **AWX → Forail importer** so teams
can migrate off AWX/AAP without rebuilding their configuration by hand.

There are no data-model migrations required for the hardening changes.

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

## Fixed

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

This release has no schema migrations. Standard image re-point applies:

```bash
helm upgrade forail oci://ghcr.io/forail-platform/forail-helm \
    --version 2026.7.0 -n forail
```

Before upgrading a SAML deployment, review the **Breaking changes — SAML**
section above and reconfigure your IdP if needed.
