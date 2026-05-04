# Letsgo

Video meeting platform (see `docs/`). Runnable stack:

- **React** (`frontend/`) — auth, home, **group video room** (mesh WebRTC + optional ML blur/background), **invite / ring** (notify WebSocket + modal + optional browser notifications)
- **Spring Boot** (`services/auth-java/`) — JWT auth, PostgreSQL users
- **Go** (`services/meeting-go/`) — group room WebSocket signaling, **notify WebSocket** for invites, user lookup + online presence
- **SQL migrations** (`migrations/go/`) — golang-migrate; applied before app services start

## Run with Docker

From the repo root:

```bash
docker compose up --build
```

Open **http://localhost:3000**. Nginx routes:

- `/api/*` → **auth-java** (8080)
- `/meeting/*` → **meeting-go** (8081), including WebSocket upgrades for `/meeting/ws/`

**Group call**: each user signs in, sets the same **Room ID** (use **New room ID** then share the UUID). Everyone clicks **Join room**. Mesh links form automatically (small groups; same LAN works best until you add TURN). Optional **Camera effect**: background blur or custom image (runs in the browser via TensorFlow.js); you can change effect **after** joining.

**Invite / ring**: enter a colleague’s **email**, **Lookup** (optional), then **Ring & send invite**. The callee must be signed in with the app open; they get a modal, ring tone, and optional desktop notification. **Accept** joins the caller’s `roomId`.

Session-level implementation notes: **`docs/changes/2026-05-04.md`**.

- **Auth API**: http://localhost:8080  
- **Meeting API / WS**: http://localhost:8081 (or via `/meeting/...` on port 3000)  
- **PostgreSQL** (host): `localhost:${POSTGRES_HOST_PORT:-5433}` → DB `letsgo`, user/password `letsgo`

Set a strong JWT secret in production (shared by auth and meeting services):

```bash
export LETSGO_JWT_SECRET='your-at-least-32-byte-secret-string-here'
docker compose up --build
```

## Local development (without Docker UI)

1. Postgres + migrations (e.g. `docker compose up -d postgres migrate`).
2. **auth-java** with `SPRING_DATASOURCE_URL` (host port often **5433** if using compose Postgres).
3. **meeting-go**: `cd services/meeting-go && GOSUMDB=off go run .` with `DATABASE_URL` and the same `LETSGO_JWT_SECRET`.
4. **frontend**: `cd frontend && npm install && npm run dev` — Vite proxies `/api` → 8080 and `/meeting` → 8081.

## Roadmap

- Google OAuth sign-in
- AWS Cognito for login and SSO (replace or federate email/password)
