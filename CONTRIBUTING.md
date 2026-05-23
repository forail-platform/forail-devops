# Contributing to Forge Platform

This repository is the canonical home of the **full contributing guide** for the whole Forge Platform project — git workflow, commit conventions, coding standards, PR process across all repos.

**Read first:** [docs/10-contributing-guide.md](./docs/10-contributing-guide.md)

## What lives here

- Docker Compose deployment stack (production and development overlays)
- Install scripts and bootstrap
- Cross-repo documentation (architecture, deployment, ops, contributing)
- Release notes for the platform as a whole

## Quick start (deploy stack)

```bash
git clone https://github.com/forgeplatform/forge-devops.git
cd forge-devops
cp .env.example .env
docker compose up -d
```

See [README.md](./README.md) and `docs/` for full setup.

## Reporting bugs

Open an issue with reproduction steps, expected vs. actual behavior, and your environment (Docker version, host OS, Forge version).

For security vulnerabilities, see [SECURITY.md](./SECURITY.md) — please do **not** open a public issue.
