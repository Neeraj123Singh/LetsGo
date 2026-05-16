# System Overview

## Services

- **Frontend (React)**: SPA UI, JWT session handling, REST + WebSockets (`frontend/`)
- **Meeting signaling + chat APIs (Go)**: `services/meeting-go` — room WebSocket for mesh signaling, notify WebSocket for invites/DM hints, HTTP for DM/room history and online lookup
- **Auth (Spring Boot)**: `services/auth-java` — register/login, JWT issuance, contacts/connections, saved virtual backgrounds — backed by PostgreSQL
- **Backend platform API (Go)** — *target*: separate orchestration/event API described in older diagrams; **not a separate runnable service** in this repo today (business logic lives in **auth-java** + **meeting-go**)
- **Analytics (Python + Lambda)** — *target*: **not implemented** in this monorepo; see **`docs/engineering-tradeoffs.md`** for what exists vs aspirational docs

## Letsgo repository (current implementation slice)

The runnable code in this monorepo today is a **vertical slice** of the full platform above:

| Piece | Role |
|-------|------|
| **React (`frontend/`)** | Register, login, home; group video UI; mesh WebRTC; optional ML blur/background; browser notifications and incoming-call UI with ring tone. |
| **Auth (`services/auth-java/`)** | Email/password (or future OAuth), JWT issuance, `users` in PostgreSQL. |
| **Meeting (`services/meeting-go/`)** | JWT-validated room WebSocket for mesh signaling; HTTP email lookup with online presence; notify WebSocket for invite / accept / decline. |
| **PostgreSQL + `migrations/go/`** | Shared user store; migrations run via Docker before apps start. |

Media is **browser-to-browser mesh** in this slice (no SFU container by default). Optional **coturn** provides TURN/STUN when configured. Older **`docs/video-meeting-app/`** diagrams may still sketch SFU/Dynamo/analytics—the **implemented** stack is Postgres + mesh + meeting-go hubs.

## Data and Search

- **PostgreSQL**: single source of truth for users, connections, DM + room messages, saved backgrounds (`migrations/go/`)
- **DynamoDB / Elasticsearch**: **not used** in the runnable codebase; retained only as forward-looking platform notes in some diagrams

## Platform Components

- **Docker Compose**: local and CI slice (`compose.yaml`, `docker-compose.prod.yml`)
- **Kubernetes (EKS)** — optional production shape
- **Terraform**: `infra/aws`, `infra/oci`
- **GitHub Actions**: `.github/workflows/ci.yml` on push/PR to `main`
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
