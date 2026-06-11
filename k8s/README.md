# forail-deploy / k8s — Kubernetes Manifest Stubs

These manifests are **stubs** that accompany Tier 3.6 (Observability /
OpenTelemetry) and prepare the ground for Tier 3.3 (Kubernetes Operator).

> **VALIDATED on a live cluster (2026-06-03).**
>
> Applied and verified on the `forail-dev-cluster` k3s test environment
> (k3s v1.30.4, 3 control-plane + 4 workers). Both manifests apply
> cleanly into namespace `forail-system`; the OpenTelemetry Collector
> (`otel/opentelemetry-collector-contrib` 0.153.0) rolls out `1/1`,
> logs _"Everything is ready. Begin running and processing data."_,
> and serves OTLP gRPC `:4317` + HTTP `:4318` (ClusterIP endpoints
> resolve). The Grafana dashboard ConfigMap carries the
> `grafana_dashboard: "1"` label required by the sidecar.
>
> Still untested: end-to-end trace flow into Grafana (requires a
> Grafana + Prometheus stack with the dashboard sidecar enabled — not
> part of these stubs).

## Contents

- `otel-collector.yaml` — ConfigMap + Deployment + Service for the
  OpenTelemetry Collector (the same `otel/config.yaml` content used by
  `forail-deploy/docker-compose.yml`). Exposes OTLP gRPC on 4317 and
  OTLP HTTP on 4318 (ClusterIP).
- `grafana-dashboards-cm.yaml` — ConfigMap named `forail-grafana-dashboards`
  labelled `grafana_dashboard: "1"` for the Grafana sidecar pattern.
  Inlines `forail-overview.json`.

## Prerequisites

- A running Kubernetes cluster (k3s, kind, microk8s, or any real cluster).
- Grafana installed via the official Helm chart or the Grafana Operator
  with the dashboard sidecar enabled (so it picks up ConfigMaps labelled
  `grafana_dashboard=1`).
- A Prometheus datasource in Grafana (UID `DS_PROMETHEUS` — or re-map
  via the dashboard import dialog).

## Apply

```sh
kubectl create ns forail-system
kubectl apply -f k8s/
```

Check rollout:

```sh
kubectl -n forail-system rollout status deploy/forail-otel-collector
kubectl -n forail-system get svc forail-otel-collector
kubectl -n forail-system logs deploy/forail-otel-collector --tail 50
```

Point the Forail backend at the Collector by setting
`OTEL_EXPORTER_ENDPOINT=http://forail-otel-collector.forail-system.svc.cluster.local:4317`.

## Status

Core manifests validated on k3s v1.30.4 (see the note at the top).
The remaining open item is the full Grafana/Prometheus observability
stack and the end-to-end trace pipeline, tracked under _Infrastructure
& Test Environments_ in `docs/future_development_plan.md`.
