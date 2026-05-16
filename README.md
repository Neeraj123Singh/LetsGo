# Letsgo

Contacts, **1:1 chat**, **audio/video calls** (mesh WebRTC), **in-meeting chat & screen share**, **call invites** with ring UI, and optional **camera blur / virtual backgrounds** (browser-side ML). Auth and user data live in **PostgreSQL**; signaling and presence in **meeting-go**; identity and REST in **auth-java**.

---

## Table of contents

1. [Architecture at a glance](#architecture-at-a-glance)
2. [Features (product)](#features-product)
3. [How it works (technical)](#how-it-works-technical)
4. [Repo layout](#repo-layout)
5. [Run locally (Docker)](#run-locally-docker)
6. [Run locally (dev, no Docker UI)](#run-locally-dev-no-docker-ui)
7. [Tests & CI](#tests--ci)
8. [Deployment](#deployment)
9. [Documentation](#documentation)
10. [Trade-offs & performance](#trade-offs--performance)

---

## Architecture at a glance

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| **UI** | React (Vite), TypeScript | SPA: auth, contacts, chats, `/call/:roomId`, meeting room, notify modals |
| **Auth API** | Spring Boot 3, JPA | Register/login, JWT, users, **connections**, **saved virtual backgrounds** |
| **Realtime** | Go (`meeting-go`) | JWT on all entry points; **room** WebSocket (mesh SDP/ICE relay); **notify** WebSocket (invites + DM push); HTTP for DM/room history, recents |
| **DB** | PostgreSQL 16 | Single source of truth; **`migrations/go/`** applied by `migrate` container before apps start |
| **Edge** | Nginx (frontend image) / **Caddy** (prod compose) | Reverse proxy, TLS (prod), WS upgrade for `/meeting/ws/` |
| **TURN** | coturn | Optional relay for NAT traversal (configured in compose prod) |

There is **no separate “platform Go API”** service in this repo—only **meeting-go** as the realtime/API edge for messaging and signaling.

---

## Features (product)

- **Accounts**: email/password, JWT in `localStorage`.
- **Contacts**: search users by email fragment, connection requests (pending / accept / decline / cancel), remove contact.
- **Chats**: 1:1 threads with history + live DM delivery over the **notify** WebSocket.
- **Calls**: `/call/:roomId?mode=audio|video` with optional `peer` + `peerEmail` for outbound **ring**; incoming **modal + ring tone**; accept routes into the same room with `auto=1`.
- **In-call**: mute, camera toggle, screen share (layout adjusts), fullscreen, optional **blur / custom background** (TF.js + MediaPipe; backgrounds can be **uploaded and stored** per user in Postgres), in-meeting chat, local **MediaRecorder** download.
- **Home**: recents carousel + quick actions.

---

## How it works (technical)

### Auth (`auth-java`)

- Issues **HS256 JWT**; `sub` = user UUID string.
- REST under `/api/**` (proxied as `/api/*` through Caddy/nginx).
- **CORS** configurable via `LETSGO_CORS_ALLOWED_ORIGINS` / `letsgo.cors-allowed-origins`.

### Meeting service (`meeting-go`)

- Validates the **same JWT secret** as Java (`LETSGO_JWT_SECRET`), min length enforced in Go.
- **`GET /meeting/ws/v1/notify?token=...`**: long-lived socket; server → client `incoming-call`, `invite-error`, `chat-dm`, etc.; client → server `invite`, `invite-accept`, `invite-decline`.
- **`GET /meeting/ws/v1/room?token=...&roomId=...`**: per-call mesh; relays `webrtc-offer|answer|ice`, `chat-room`, etc.
- **HTTP**: user lookup by email (`/meeting/api/v1/users/lookup`), DM + room message history + recents—see `services/meeting-go/README.md`.

### Frontend

- **`NotifyProvider`**: maintains notify WS; queues outbound messages until socket is **OPEN** (avoids dropped invites).
- **`MeetingRoom`**: acquires mic/cam; attaches room WS; mesh peer connections with lexicographic “offer initiator” rule; integrates optional canvas pipeline from `useLocalVideoEffects`.

### PostgreSQL schema (implemented)

Applied migrations (see files under **`migrations/go/`**):

| Version | Contents |
|---------|-----------|
| `000001` | `users` |
| `000002` | `connection_requests`, `connections` (canonical pair ordering enforced in DB + Java `Connection.Key`) |
| `000003` | `direct_messages`, `room_messages`, `recent_interactions` |
| `000004` | `user_backgrounds` (base64 data URLs for virtual backgrounds) |

Forward-looking ER diagrams that mention DynamoDB/SFU/analytics describe **possible future scaling**, not the current Docker stack—see **`docs/engineering-tradeoffs.md`** and **`docs/architecture/system-overview.md`**.

---

## Repo layout

```
frontend/           React SPA + nginx production image
services/auth-java/ Spring Boot auth + connections + backgrounds REST
services/meeting-go Go signaling + notify + chat/recents HTTP
migrations/go/      golang-migrate SQL (Postgres)
infra/aws|oci/      Terraform for VM deploy (AWS free-tier path documented)
coturn/             TURN server config
scripts/            deploy/setup/down/logs helpers for the VM
tests/e2e/          Selenium smoke tests (Python + pytest)
docs/               Architecture, schema notes, engineering trade-offs
```

---

## Run locally (Docker)

From the **repository root**:

```bash
docker compose up --build
```

Open **http://localhost:${FRONTEND_HOST_PORT:-3000}**.

Routing (nginx in `frontend/nginx.conf`):

- **`/api/*`** → auth-java `:8080`
- **`/meeting/*`** → meeting-go `:8081` (including **`/meeting/ws/`** WebSocket upgrades)

Postgres on host port **`${POSTGRES_HOST_PORT:-5433}`** → db `letsgo`, user/password **`letsgo`**.

Production-like compose (secrets file, Caddy): **`docker-compose.prod.yml`** — see **`infra/aws/README.md`** and **`Makefile`** targets (`remote-deploy`, etc.).

Set a strong shared secret (required for JWT verification in both Java and Go):

```bash
export LETSGO_JWT_SECRET='your-at-least-32-byte-secret-string-here'
docker compose up --build
```

---

## Run locally (dev, no Docker UI)

1. Start Postgres + migrations:  
   `docker compose up -d postgres migrate`
2. Run **auth-java** with `SPRING_DATASOURCE_URL` pointing at Postgres (often `localhost:5433`).
3. Run **meeting-go**:  
   `cd services/meeting-go && DATABASE_URL=postgres://... LETSGO_JWT_SECRET=... PORT=8081 go run .`
4. Run **frontend**:  
   `cd frontend && npm install && npm run dev`  
   Vite proxies `/api` → `8080`, `/meeting` → `8081` (`vite.config.ts`).

---

## Tests & CI

### Backend unit tests

- **Java**: `cd services/auth-java && mvn test` — JWT round-trip, `Connection.Key` Postgres ordering, background upload validation (mocked repo).
- **Go**: `cd services/meeting-go && go test ./...` — JWT parse, `validRoomID`, hub helpers.

### UI (Selenium)

See **`tests/e2e/README.md`**. Requires a running stack and Chrome/Chromium.

### GitHub Actions

On **push or PR to `main`**, **`.github/workflows/ci.yml`** runs:

1. Frontend `npm ci` + `npm run build`
2. `go test ./...` in `services/meeting-go`
3. `mvn test` in `services/auth-java`
4. **Docker Compose** full stack + **pytest** Selenium smoke tests against `http://localhost:3000`

Continuous **deployment** to your VM is **not** wired by default (needs SSH keys / AWS secrets). Typical flow remains **Terraform + rsync + `scripts/deploy.sh`** on the server—see [Deployment](#deployment).

---

## Deployment

**End-to-end guide (Terraform files, CI workflow, scripts, Compose): [`docs/deployment-current.md`](docs/deployment-current.md).**  
**HTTPS / certificates (Caddy, Let’s Encrypt, renewal): [`docs/https-tls.md`](docs/https-tls.md).**

### AWS VM (Terraform + Compose)

High level:

1. Provision EC2 + SG with **`infra/aws`** (`terraform apply`).
2. SSH to the VM; clone or **rsync** this repo into `~/letsgo`.
3. **`bash scripts/setup.sh`** once (generates `.env.prod`).
4. **`bash scripts/deploy.sh`** for each release (pull/rsync code, `docker compose ... up -d --build`).

Details: **`infra/aws/README.md`**, root **`Makefile`** (`make remote-deploy` rsync assumption: repo on VM + `git pull`—adjust to pure rsync if you do not use git on the VM).

**Public URL** is whatever you set as `DOMAIN` in `.env.prod` (e.g. `*.sslip.io` style host with dashes for the EC2 public IP).

### OCI / other

See **`infra/oci/README.md`** and **`docs/platform/free-tier-deployment.md`** (Oracle-focused; patterns overlap with AWS single-VM Compose).

---

## Documentation

| Doc | Purpose |
|-----|---------|
| **`docs/README.md`** | Index of design docs |
| **`docs/architecture/system-overview.md`** | Services and data flows (implemented vs aspirational) |
| **`docs/deployment-current.md`** | Terraform (AWS/OCI), VM scripts, GitHub Actions CI — files and trade-offs |
| **`docs/https-tls.md`** | HTTPS (Caddy + Let’s Encrypt), dev HTTP, volumes, renewal |
| **`docs/engineering-tradeoffs.md`** | Pros/cons per feature area and performance ideas |
| **`docs/video-meeting-app/postgres-schema.md`** | Relational notes + link to **real** migrations |
| **`services/auth-java/README.md`**, **`services/meeting-go/README.md`** | Service-specific endpoints |
| **`docs/changes/`** | Dated implementation notes |

---

## Trade-offs & performance

See **`docs/engineering-tradeoffs.md`** for a concise list (mesh vs SFU, Postgres vs NoSQL signaling, ML on client, JWT + in-memory hub presence, etc.) and **concrete improvement ideas** (TURN tuning, SFU, message queue, caching, splitting upload storage from Postgres, observability).

---

## Roadmap (ideas)

- OAuth / SSO (Google, enterprise IdP).
- Dedicated media server (SFU) for large rooms.
- Push notifications when callee is offline (APNs/FCM).
- Object storage (S3/MinIO) for recordings and virtual backgrounds instead of inline base64.
