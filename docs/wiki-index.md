# Forge Platform — Developer Wiki

Welcome to the Forge Platform developer wiki. This documentation covers practical
usage, architecture decisions, deployment, and operational knowledge for contributors
and operators.

Forge is an infrastructure automation platform based on AWX 24.6.1, licensed under
Apache License 2.0. It provides a web UI and REST API for managing Ansible playbooks,
inventories, credentials, and scheduled automation at scale.

---

## Table of Contents

| # | Document | Description |
|---|----------|-------------|
| 01 | [Architecture Overview](01-architecture-overview.md) | System components, data flow, how things connect |
| 02 | [Backend (Django)](02-backend-django.md) | Module responsibilities, what lives where, gotchas |
| 03 | [Frontend (React)](03-frontend-react.md) | Project structure, development workflow, patterns |
| 04 | [Task Engine](04-task-engine.md) | Job lifecycle, capacity, troubleshooting stuck jobs |
| 05 | [Authentication & RBAC](05-authentication-rbac.md) | Auth methods, role hierarchy, SSO configuration |
| 06 | [Database Schema](06-database-schema.md) | Key tables, relationships, maintenance |
| 07 | [Docker & Deployment](07-docker-deployment.md) | Build, deploy, SSL, backup, troubleshooting |
| 08 | [CI/CD Pipeline](08-ci-cd-pipeline.md) | GitLab CI, Jenkins, release process |
| 09 | [Testing Guide](09-testing-guide.md) | How to run tests, what to test, where tests live |
| 10 | [Contributing Guide](10-contributing-guide.md) | Git workflow, commit conventions, PR process |
| 11 | [API Reference](11-api-reference.md) | REST API endpoints, authentication, usage examples |
| 12 | [Configuration Reference](12-configuration-reference.md) | Settings, environment variables, tuning |
| 13 | [Dynamic Surveys](13-dynamic-surveys.md) | Dynamic choice sources for survey questions |
| 14 | [Audit Trail](14-audit-trail.md) | Activity stream + immutable audit events |
| 15 | [Event-Driven Automation](15-event-driven-automation.md) | Webhook rules, conditions, automated actions |
| 16 | [Drift Detection](16-drift-detection.md) | Fact snapshots, change tracking, compliance alerts |
| 17 | [Self-Service Portal](17-self-service-portal.md) | Catalog of curated automations with optional approval workflow |

---

## Quick Links

- **Source code:** `forge/` (Python backend), `forge/ui_next/` (React frontend)
- **Deployment:** `tools/docker-compose-prod/`
- **Dockerfile template:** `tools/ansible/roles/dockerfile/templates/Dockerfile.j2`
- **Requirements:** `requirements/requirements.txt`
- **Changelog:** `CHANGELOG.md` (project root)

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Python + Django + DRF | 3.12 / 4.2.16 |
| Frontend | React + TypeScript + Vite | 18 / 5.x / 6.x |
| CSS | Tailwind CSS | 3.x |
| State | TanStack Query + Zustand | 5.x / 4.x |
| Task queue | Celery + Redis | 5.x / 7.x |
| WebSocket | Django Channels + Daphne | 4.x |
| Database | PostgreSQL | 15 |
| Mesh networking | Receptor | 1.x |
| Container | Docker + Docker Compose | 27+ / 2.x |
| Web server | Nginx + uWSGI | 1.x / 2.x |
