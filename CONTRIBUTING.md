# Contributing to Forail Platform

The **full contributing guide** — git workflow, commit conventions, coding standards, PR process across all repos — is published on the developer docs site.

**Read first:** <https://forail-platform.github.io/dev/contributing.html>

The markdown sources for that site are kept outside this repository.

## What lives here

- Docker Compose deployment stack (production and development overlays)
- Install scripts and bootstrap
- Release notes for the platform as a whole

## Quick start (deploy stack)

```bash
git clone https://github.com/forail-platform/forail-devops.git
cd forail-devops
cp .env.example .env
docker compose up -d
```

See [README.md](./README.md) for full setup.

## Reporting bugs

Open an issue with reproduction steps, expected vs. actual behavior, and your environment (Docker version, host OS, Forail version).

For security vulnerabilities, see [SECURITY.md](./SECURITY.md) — please do **not** open a public issue.
