# System Overview

## Services

- **Frontend (React)**: user interface, session handling, API integration
- **Backend (Go)**: core business APIs, orchestration, event publishing
- **Meeting signaling (Go) — letsgo prototype**: dedicated `meeting-go` service for group WebSocket signaling, user lookup, and notify-channel invites (see `docs/changes/2026-05-04.md`)
- **Analytics (Python + Lambda)**: event consumption, aggregation, analytical workloads
- **Auth (Spring Boot)**: authentication, authorization, token issuance, user identity

## Letsgo repository (current implementation slice)

The runnable code in this monorepo today is a **vertical slice** of the full platform above:

| Piece | Role |
|-------|------|
| **React (`frontend/`)** | Register, login, home; group video UI; mesh WebRTC; optional ML blur/background; browser notifications and incoming-call UI with ring tone. |
| **Auth (`services/auth-java/`)** | Email/password (or future OAuth), JWT issuance, `users` in PostgreSQL. |
| **Meeting (`services/meeting-go/`)** | JWT-validated room WebSocket for mesh signaling; HTTP email lookup with online presence; notify WebSocket for invite / accept / decline. |
| **PostgreSQL + `migrations/go/`** | Shared user store; migrations run via Docker before apps start. |

Media is **browser-to-browser mesh** in this slice (no SFU container yet). Target production topology still assumes an SFU, TURN, DynamoDB-backed signaling fanout, and the shared Go “platform” API; the diagrams in `docs/video-meeting-app/` describe that target while calling out where the prototype differs.

## Data and Search

- **PostgreSQL**: transactional and relational data
- **DynamoDB**: high-scale key-value and flexible NoSQL access patterns
- **Elasticsearch**: full-text search and filtered discovery

## Platform Components

- **Kubernetes (EKS)** for container orchestration
- **Terraform** for infrastructure as code
- **Jenkins** for CI/CD pipelines
- **Prometheus + Grafana** for metrics, dashboards, and alerts
- **OpenTelemetry** for distributed tracing

## Request and Event Flow

### Target platform (full product)

1. User interacts with React frontend.
2. Frontend authenticates via Auth service and receives token.
3. Frontend calls Go backend with token.
4. Backend persists transactional data in PostgreSQL and publishes domain events.
5. Analytics services and Lambda consumers process events and store derived results.
6. Searchable entities are indexed in Elasticsearch for user queries.

### Prototype in this repo (today)

1. User authenticates via **auth-java**; JWT stored in the browser.
2. Frontend opens **`/meeting/ws/v1/notify`** for invite delivery while on the app, and **`/meeting/ws/v1/room`** when in a call for mesh WebRTC signaling relayed by **meeting-go**.
3. User lookup uses **`GET /meeting/api/v1/users/lookup`** (Postgres + in-memory online set).
4. No DynamoDB, Elasticsearch, or analytics pipeline is required for this slice to run.

## Non-Functional Targets

- Availability: 99.9% for critical APIs
- p95 API latency: under 250ms for read endpoints
- Trace coverage: 90%+ of cross-service requests
- Deployment frequency: multiple times per week after stabilization
