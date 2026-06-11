# Security Policy

## Supported Versions

The latest released minor version receives security fixes. See [CHANGELOG.md](./CHANGELOG.md) for releases.

| Version | Supported |
|---------|-----------|
| 2026.05.x | Yes |
| < 2026.05 | No  |

## Reporting a Vulnerability

Please report security issues privately to **office@krletron.xyz**.

Do **not** open a public GitHub issue for suspected vulnerabilities.

Include:

- Component affected (docker compose stack, scripts, docs)
- Steps to reproduce, or proof-of-concept
- Impact assessment
- Suggested remediation if you have one

## Disclosure Timeline

- **48 hours** — acknowledgement of report
- **7 days** — initial assessment and severity classification
- **30 days** — fix released or mitigation provided for critical/high severity
- **90 days** — public disclosure after fix is available

We will credit you in the release notes unless you prefer to remain anonymous.

## Scope

In scope:

- forail-deploy (this repository) — docker compose stack, install scripts, docs
- Insecure defaults in compose files or scripts
- Secret handling in `.env.example` and bootstrap flows

Out of scope:

- Issues in upstream component images (please report to forail-backend/forail-frontend etc.)
- Self-inflicted misconfiguration (weak admin passwords, public-facing dev setups)
