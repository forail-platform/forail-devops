# Changelog

All notable changes to the Forail DevOps deployment will be documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to CalVer (`YYYY.MM.PATCH`).

## [Unreleased]

## [2026.06.0] - 2026-06-14

### Changed
- **Renamed `forge` → `forail`** across the entire project (organization `forgeplatform` → `forail-platform`): Compose stack and install scripts, image references (`ghcr.io/forail-platform/forail-*`), CLI, and all documentation/URLs. The GitHub organization and repositories were renamed to match.
- Versioning unified across all platform components to CalVer `2026.06.0`.


## [2026.05.0] - 2026-05-22

### Added
- `docs/RELEASE_NOTES_v2026.05.0.md` — platform GA release notes
  covering `forail-operator` v1.0.0 (9 CRDs + multi-cluster + OLM
  bundle), `forail-backend` 0208 migration fix, `forail-assistant`
  all-in-one image with `gemma3:1b` default, `forail-helm` chart 1.0.0
  bump, and the `forail-dev-cluster` 3-master / 4-worker k3s scale-up.

### Changed
- `future_development_plan.md`: Tier 3.3 (Kubernetes Operator) and
  the "Provision Kubernetes test instance" infrastructure item
  marked **DONE (v2026.05.0)**; competitive landscape row updated
  ("K8s operator: Planned → Yes (9 CRDs, multi-cluster)").

## [2026.04.0] - 2026-04-17

### Added
- Docker Compose stack: postgres, redis, OPA, OTel Collector,
  forail-web, forail-task, forail-frontend, nginx
- Single-VM Vagrantfile for evaluation deployments
- Backup/restore scripts (`scripts/backup.sh`, `scripts/restore.sh`)
- Health-check scripts (`healthcheck-web.sh`, `healthcheck-task.sh`)
- Nginx reverse proxy config with SSL/Let's Encrypt support
- Assistant nginx proxy (with `resolver` so the service stays optional)
- Receptor mesh configuration and init scripts
- `.env.example` template for environment configuration
- Jenkinsfile with standalone, assistant, and integration test stages

### Changed
- forail-task now runs `privileged: true` so podman-in-docker works for
  Execution Environments
- Receptor port surfaced in `.env.example` for inter-node mesh

### Fixed
- Init script + Receptor config now usable on a fresh deploy
  (no manual editing required)
- podman-in-docker path now works end-to-end inside the task container
