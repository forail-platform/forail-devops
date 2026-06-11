# Forail 2026.04.0 — Release Notes

**Release date:** 2026-04-03
**Based on:** Forail 2026.03.0 + new features
**License:** Apache License 2.0

---

## Overview

Forail 2026.04.0 delivers the remaining Tier 1 features from the post-release roadmap:
Event-Driven Automation (EDA), AI Assistant, Dynamic Surveys, and Improved Audit Trail.

---

## New Features

### Event-Driven Automation (EDA)

Webhook-based event routing with user-defined rules. External systems (GitHub, GitLab,
Alertmanager, PagerDuty, Datadog, CloudWatch, or any generic HTTP source) can trigger
automated job launches, workflow executions, or notification dispatches.

- **EventRule model:** Conditions (Jinja2) + Actions (launch job, workflow, notification)
- **Public webhook receiver:** `/api/v2/eda_webhooks/<path>/` with HMAC signature verification
- **Jinja2 condition engine:** Sandboxed evaluation against webhook payloads
- **Outbound webhooks:** Push job status changes to external systems
- **EventLog:** Full audit trail of received webhooks and rule evaluation results
- **Frontend:** New "Automation" sidebar section with Event Rules, Event Logs, Outbound Webhooks pages
- **Security:** HMAC verification (SHA-256/SHA-1), rate limiting via throttle, payload size limits, deduplication
- **Dry-run test endpoint:** Evaluate conditions without firing actions

### AI Assistant (Ollama RAG)

Optional microservice providing context-aware chat assistance using local LLMs.

- **forail-assistant** repository: FastAPI + Ollama + ChromaDB
- **SSE streaming** for real-time token delivery
- **Frontend chat panel** with floating button, markdown rendering, context awareness
- **Privacy-first:** All processing on-premises, no cloud API calls

### Dynamic Surveys

Survey questions with choices populated at launch time from three sources:
database queries, external API calls, and Jinja2 templates.

### Improved Audit Trail

- **ActivityStream enhanced:** Now captures `actor_ip`, `actor_user_agent`, `actor_session_id`
- **AuditEvent model:** Immutable append-only security log for compliance
- **Frontend Audit Log page:** Filters, expandable rows, CSV export
- **SIEM export:** Flat JSON format for Splunk/ELK/Datadog

---

## New API Endpoints

| Endpoint                                | Method             | Description                       |
| --------------------------------------- | ------------------ | --------------------------------- |
| `/api/v2/event_rules/`                  | GET, POST          | List/create event rules           |
| `/api/v2/event_rules/{id}/`             | GET, PATCH, DELETE | Event rule CRUD                   |
| `/api/v2/event_rules/{id}/webhook_key/` | GET, POST          | Get/rotate webhook key            |
| `/api/v2/event_rules/{id}/event_logs/`  | GET                | Logs for this rule                |
| `/api/v2/event_rules/{id}/test/`        | POST               | Dry-run condition test            |
| `/api/v2/event_rules/{id}/enable/`      | POST               | Enable rule                       |
| `/api/v2/event_rules/{id}/disable/`     | POST               | Disable rule                      |
| `/api/v2/event_logs/`                   | GET                | List all event logs               |
| `/api/v2/event_logs/{id}/`              | GET                | Event log detail                  |
| `/api/v2/outbound_webhooks/`            | GET, POST          | List/create outbound webhooks     |
| `/api/v2/outbound_webhooks/{id}/`       | GET, PATCH, DELETE | Outbound webhook CRUD             |
| `/api/v2/outbound_webhooks/{id}/test/`  | POST               | Send test payload                 |
| `/api/v2/eda_webhooks/{path}/`          | POST               | Public webhook receiver (no auth) |
| `/api/v2/audit_events/`                 | GET                | List audit events                 |
| `/api/v2/audit_events/?format=csv`      | GET                | Export as CSV                     |
| `/api/v2/audit_events/?format=siem`     | GET                | Export for SIEM                   |

---

## New Database Tables

| Table                  | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `main_eventrule`       | Webhook rules with conditions and actions      |
| `main_eventlog`        | Incoming webhook events and evaluation results |
| `main_outboundwebhook` | Outbound webhook configurations                |
| `main_auditevent`      | Immutable security audit log                   |

---

## Frontend Changes

- New **Automation** sidebar section: Event Rules, Event Logs, Outbound Webhooks
- New **Audit Log** page with filters, expandable rows, CSV export
- New **AI Assistant** floating chat panel
- **Dynamic survey** support in launch dialog and survey editor
- 10 new pages, 3 new API hooks, TypeScript interfaces for all EDA types

---

## Quality Metrics

| Metric                         | Value     |
| ------------------------------ | --------- |
| Backend tests (standalone EDA) | 38 passed |
| Frontend tests (vitest)        | 58 passed |
| TypeScript compilation         | 0 errors  |

---

## Documentation

New documentation files:

- `docs/13-dynamic-surveys.md` — Dynamic survey system
- `docs/14-audit-trail.md` — Audit trail and compliance logging
- `docs/15-event-driven-automation.md` — EDA architecture, API, security, quick start

Updated documentation:

- `01-architecture-overview.md` — Added EDA webhook flow
- `02-backend-django.md` — Added EDA models reference
- `03-frontend-react.md` — Added EDA routes
- `04-task-engine.md` — Added EDA as job launch source
- `06-database-schema.md` — Added EDA tables and ER relationships
- `09-testing-guide.md` — Added standalone test suite
- `11-api-reference.md` — Added all EDA endpoints
- `wiki-index.md` — Added docs 13, 14, 15
- `future_development_plan.md` — Updated competitive landscape (EDA, Dynamic Surveys, AI Assistant, Audit Trail: Planned → Yes)

---

## v2026.04.0-patch1 (2026-04-13)

### Improvements

- **AI Assistant redesign** — Floating chat widget with welcome message, minimize/maximize, message timestamps, streaming responses
- **Assistant RAG documentation** — 14 knowledge base files (850 lines) covering all features: EDA, Drift, Policy, Scanner, Service Catalog, Tenancy, WebAuthn, Recommendations, Observability, Wizards, API reference, common errors
- **ChromaDB client upgrade** — Updated from 0.5.23 to 1.5.7 for compatibility with ChromaDB server 1.4.x
- **Nginx proxy** — Added `/assistant/` proxy route for AI Assistant API with SSE streaming support

### Bug Fixes

- **Migration ordering** — Fixed `_OrgAdmin_to_use_ig.py` to use `apps.get_model()` instead of direct model import, preventing schema mismatch on fresh deploys
- **Missing migrations** — Added `0204_audit_event` migration for AuditEvent model and ActivityStream audit fields (actor_ip, actor_user_agent, actor_session_id)
- **Migration chain** — Reordered migrations so audit_event (0204) precedes RLS policies (0206) which references the table
- **Assistant docker-compose** — Fixed healthchecks for Ollama and ChromaDB containers (curl not available in images)
- **Assistant registry path** — Fixed image path from `forail-platform` to `forail-platform`

### Testing

- **Backend** — Added `test_comprehensive.py`: 97 standalone tests covering SimpleDAG (cycle detection, topological sort), K8s CPU/memory parsing, Jinja sanitization, safe YAML dump, string coercion, vars validation
- **Frontend** — Added `statusConfig.test.ts`, `client.test.ts`, `app.test.ts`: 72 tests for status mappings, API error flattening, route completeness (all 70+ routes verified)
- **CI pipeline** — Jenkinsfile now runs 4 parallel test stages: Backend Standalone, Backend Unit, Frontend, Assistant
- **Total test count** — Backend 404 + Frontend 212 = 616 tests passing

### Refactoring

- **forail-assistant** — Extracted shared ChromaDB client and embedding functions into `app/db.py`, eliminating 32 lines of duplicated code between `rag.py` and `indexer.py`

### Quality Metrics

| Metric                   | Value                      |
| ------------------------ | -------------------------- |
| Backend standalone tests | 404 passed                 |
| Frontend tests (vitest)  | 212 passed                 |
| Assistant knowledge base | 14 docs, 92 chunks indexed |
| TypeScript compilation   | 0 errors                   |

---

## Competitive Landscape Update

| Feature                 | Forail   | AWX | AAP 2.5+ | Ascender | Semaphore |
| ----------------------- | ------- | --- | -------- | -------- | --------- |
| Dynamic surveys         | **Yes** | No  | No       | No       | No        |
| Event-driven (EDA)      | **Yes** | No  | Yes      | No       | No        |
| AI assistant (RAG)      | **Yes** | No  | Yes      | No       | No        |
| Audit trail (immutable) | **Yes** | No  | Partial  | No       | No        |
| IaC scanning            | **Yes** | No  | No       | No       | No        |
| Policy-as-Code (OPA)    | **Yes** | No  | No       | No       | No        |
| Drift detection         | **Yes** | No  | No       | No       | No        |
| Self-service portal     | **Yes** | No  | Partial  | No       | No        |
| Multi-tenancy (RLS)     | **Yes** | No  | Partial  | No       | No        |
| WebAuthn/Passkey MFA    | **Yes** | No  | No       | No       | No        |
| Smart recommendations   | **Yes** | No  | No       | No       | No        |
