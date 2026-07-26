# Forail 2026.07.1 — Release Notes

**Release date:** 2026-07-26
**Based on:** Forail 2026.07.0
**License:** Apache License 2.0

---

## Overview

2026.07.1 is a **patch release with one purpose**: an upgrade no longer leaves a
platform that accepts jobs and runs none of them. It fixes the known issue
published with 2026.07.0, and it removes the manual workaround that release
asked for.

Nothing else changes. There are no migrations, no configuration changes, no
breaking changes. The frontend, the operator and the assistant are unchanged and
keep their 2026.07.0 / 2026.07.1 / 2026.06.0 versions respectively; only the
backend image and the Helm chart move.

| Component | Version |
|---|---|
| `forail-backend` | **2026.07.1** |
| Helm chart | **2026.7.1** (pins the backend above) |
| `forail-frontend` | 2026.07.0, unchanged |
| `forail-operator` | 2026.07.1, unchanged |
| `forail-assistant` | 2026.06.0, unchanged |

## Fixed

### Jobs no longer stop running after an upgrade or a restart

Upgrading 2026.06.0 → 2026.07.0 left every launch sitting in `pending`
indefinitely, with only `job_explanation` — *"This job is not ready to start
because there is not enough available capacity"* — to explain it. Project
updates kept working, so the install looked healthy right up until someone
launched a job.

**What was wrong.** For jobs to run on the node itself, the `default` instance
group has to be a regular group that contains an execution-capable instance.
Two things conspired against that, and either one alone was enough to hang every
launch:

- `register_queue` assigns instances only when it *creates* a group. On an
  upgrade the group already exists, so it assigned nothing and left it empty.
- The task pod re-ran `provision_instance` on **every start** — restart,
  eviction, rolling upgrade — and that call hardcoded `node_type='control'` and
  re-registered `default` as a ContainerGroup, overwriting whatever the
  installer had configured. A control node only orchestrates; it does not
  execute.

The second half is why the 2026.07.0 workaround did not stick: the next task-pod
restart quietly undid it.

**What changed.** Registration now takes its intent from `FORAIL_NODE_TYPE` —
which the Helm chart and the Compose stack already set — and derives the default
queue from it. An execution-capable pod (`hybrid`, `execution`) gets a regular
instance group containing itself; a control-only pod keeps the ContainerGroup,
exactly as before. Both defaults are unchanged when the variable is unset, so a
multi-node install that has no opinion behaves as it did. The chart's init Job
additionally asserts group membership rather than trusting `register_queue`, so
a newer chart paired with an older image still converges.

**Verified, not assumed.** On a freshly created cluster: install 2026.06.0,
`helm upgrade` to this release, launch a job — successful in 78 s with a normal
`PLAY RECAP`, with no manual intervention at any point. Two subsequent
`kubectl rollout restart deploy/forail-task` left the state untouched and the
next job succeeded as well.

## Upgrade

From **2026.07.0**, a straight image re-point. No migrations, no new required
values:

```bash
helm upgrade forail oci://ghcr.io/forail-platform/forail-helm \
    --version 2026.7.1 -n forail \
    --set secrets.forailAdminPassword='<strong-password>' \
    --set 'forail.allowedHosts=forail.example.com\,127.0.0.1\,localhost' \
    --set task.privileged=true --set task.hostCgroup=true   # only if you run jobs in-pod
```

**If you applied the 2026.07.0 workaround**, you can leave it in place — it sets
exactly the state this release converges to on its own. Nothing needs to be
undone.

From **2026.06.0**, read the [2026.07.0 release
notes](RELEASE_NOTES_v2026.07.0.md) first: the breaking changes, the required
admin password and the SAML defaults all still apply. The known issue documented
there no longer does.
