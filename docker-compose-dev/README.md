# Docker Compose Dev — Legacy AWX Environment

This directory contains the legacy AWX development environment configuration inherited from the upstream AWX project.

**This is NOT the recommended development setup for Forail.** For Forail development, use the Vagrant-based environment:

```bash
cd forail-deploy
vagrant up
vagrant ssh
```

See the [Admin Handbook](../docs/ADMIN_HANDBOOK.md) and [Docker Deployment Guide](../docs/07-docker-deployment.md) for production deployment instructions.

## Contents

These files are retained for reference but are not maintained:

- Docker Compose overrides for AWX development containers
- Keycloak, LDAP, Splunk integration examples
- HAProxy and custom virtual environment configs

For current Forail-specific development workflows, see [Contributing Guide](../docs/10-contributing-guide.md).
