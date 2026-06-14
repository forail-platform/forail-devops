# Forail 2026.06.0 — Release Notes

**Release date:** 2026-06-14
**Based on:** Forail 2026.05.0
**License:** Apache License 2.0

---

## Overview

Forail 2026.06.0 is the **project rename release**. The platform —
previously published as *Forge* under the `forgeplatform` GitHub
organization — is now **Forail**, under the **`forail-platform`**
organization. This was a deliberate move to a unique, unambiguous name
that does not collide with the many existing "forge"-named projects.

There are **no functional changes** in this release. Every component was
verified to build and deploy unchanged after the rename (full stack
brought up on a 5-node k3s cluster, operator reconciling, REST API
serving `HTTP 200`, database migrations applied).

## What changed

- **Name:** `forge` → `forail`, organization `forgeplatform` →
  `forail-platform` (note the hyphen).
- **Container images:** now published to
  `ghcr.io/forail-platform/forail-<component>`. The old
  `ghcr.io/forgeplatform/forge-*` packages are retired.
- **Python package:** `forge` → `forail`; CLI `forge-manage` →
  `forail-manage` (the `awx-manage` compatibility alias is retained).
- **Kubernetes operator:** Go module
  `github.com/forail-platform/forail-operator`; CRD API group
  `forge.forgeplatform.io` → **`forail.forail-platform.io`**; the
  `ForgeInstance` kind is now **`ForailInstance`**. All 9 CRDs renamed.
- **Helm chart / Compose:** image references and the `forail.lan`
  ingress host updated; values pinned to the `2026.06.0` images.
- **Mobile:** Kotlin package `io.forailplatform.mobile` (no hyphen —
  hyphens are invalid in JVM package identifiers).
- **Versioning:** all platform components are unified on CalVer
  `2026.06.0` for this coordinated release.

## Upgrade guide

This is a rename, not a data-model change, so existing installs keep
working on the old images until you re-point them.

1. **Kubernetes (Helm):**
   ```bash
   helm upgrade forail oci://ghcr.io/forail-platform/forail-helm \
       --version 2026.6.0 -n forail
   ```
2. **Operator:** because the CRD API group changed
   (`forge.forgeplatform.io` → `forail.forail-platform.io`), this is a
   **breaking change for existing CRs**. Re-apply your resources against
   the new group. The operator is republished as `forail-operator`.
3. **Docker Compose:** pull `FORAIL_TAG=2026.06.0` and
   `ghcr.io/forail-platform/forail-*` images (see `.env.example`).

## Notes

- GitHub automatically redirects the old organization/repository URLs,
  so existing links continue to resolve.
- A fresh OperatorHub.io submission under the `forail-operator` name is
  planned to replace the retired `forge-operator` listing.
