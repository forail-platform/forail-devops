# Changelog

All notable changes to the Forail DevOps deployment will be documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to CalVer (`YYYY.MM.PATCH`).

## [Unreleased]

## [2026.10.0] - date set when tagged

Collects everything since 2026.06.0: the 2026.07.x backend releases were
shipped without a deployment release of their own.

### Fixed
- **Backup and restore.** The documented backup command could not run (the
  scripts live in `forail-task`, not `postgres`); `backup.sh` reported success on
  a failed dump; `restore.sh` replaced nothing, exited 0, and moved the database
  sequences backwards so later inserts failed. `backup.sh` now writes a
  custom-format dump plus a `.meta` with the secret-key fingerprint; `restore.sh`
  refuses while the stack is writing or under a different `FORAIL_SECRET_KEY`,
  restores into a new database and swaps it in, keeping the old one.
  `scripts/test-backup-restore.sh` checks the round trip.
- **Quick start on a clean machine.** nginx never started because nothing
  generated a certificate; the pinned image tag could not run a job.
- **Quick Start health check.** Step 4 told you to run `./scripts/healthcheck-web.sh`
  on the host, where it fails: the file is not executable and calls `forail-manage`,
  which exists only inside the backend image. Those scripts are the *container*
  probes Compose mounts at `/etc/forail/`. The README now points at
  `docker compose ps` and, for a manual run,
  `docker compose exec forail-web bash /etc/forail/healthcheck-web.sh`.

### Added
- AWX → Forail migration importer (`forail-manage import_from_awx`) — see the
  backend changelog and `forail-deploy/docs/RELEASE_NOTES_v2026.07.0.md`.

### Security
- Backend security hardening: SAML signing + SHA-256 enforced by default
  (**breaking** for unsigned/SHA-1 IdPs), SAML role-attribute grants require an
  explicit value (**breaking**), hashed audit session IDs, trusted-proxy
  `X-Forwarded-For`, superuser-change auditing, OAuth `refresh_token` redaction.
  Upgrade guidance in `docs/RELEASE_NOTES_v2026.07.0.md`.
- **Compose hardening**: `forail-task` privileged / host cgroup are now env-gated
  and default **off** — enable the job-execution path explicitly with
  `FORAIL_TASK_PRIVILEGED=true FORAIL_TASK_CGROUP=host`. `FORAIL_ALLOWED_HOSTS`
  no longer defaults to `*` (defaults to `localhost,127.0.0.1`), and `FORAIL_TAG`
  pins to a release (`2026.10.0`) instead of `:latest`.
- **`.env.example` no longer re-opens what the compose defaults closed**: it
  shipped `FORAIL_ALLOWED_HOSTS=*`, so every install that started from the sample
  file (the documented path) overrode the hardened default back to a wildcard. It
  now carries `localhost,127.0.0.1`, pins `FORAIL_TAG=2026.07.0`, and documents
  `FORAIL_TASK_PRIVILEGED` / `FORAIL_TASK_CGROUP` as commented-out opt-ins.

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
