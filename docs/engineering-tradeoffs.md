# Engineering trade-offs & performance notes

This document summarizes **technical pros and cons** of the current Letsgo implementation and **practical ways to improve performance and reliability**.

## High level

| Area | What we chose | Pros | Cons / limits |
|------|----------------|------|----------------|
| **Media path** | Browser **mesh** WebRTC (full mesh) | No media server cost in dev; low latency on LAN; simple mental model | CPU/bandwidth grow with N peers; NAT without TURN fails; no simulcast/SVC centralized control |
| **Signaling** | **Go** hub, in-memory maps, text WebSockets | Fast to build; single binary; JWT aligned with Java | **Single-process** presence; horizontal scale needs shared store (Redis) or sticky sessions |
| **Notify / invites** | Separate **notify** WebSocket + in-memory delivery | Works while user is on any SPA route without being in a room | **Callee must have app open** and socket connected; no mobile push |
| **Auth** | **Spring Boot** + JPA + PostgreSQL | Mature ecosystem; easy CRUD for users, connections, backgrounds | Heavier cold start vs Go; two runtimes in ops |
| **Chat persistence** | **PostgreSQL** (DM + room messages + recents) | ACID; one DB for auth + chat metadata | Room chat can become hot at scale; may need partitioning or external log |
| **Virtual backgrounds** | **Client-side** TF.js + MediaPipe + canvas `captureStream` | No GPU server; privacy-friendly (frames stay local until encoded) | High CPU/battery; first load downloads models; quality depends on device |
| **Saved backgrounds** | **Base64 in Postgres** (`user_backgrounds`) | No S3/minio dependency; trivial backup with DB | Large rows; not ideal for CDN; consider size caps (already enforced) |
| **Connections graph** | Canonical `(user_low_id, user_high_id)` + Java string ordering vs PG | Prevents duplicate edges; matches DB check constraint | Must keep Java ordering identical to Postgres (we use **string UUID order**, not `UUID.compareTo`) |
| **JWT everywhere** | HS256 shared secret Java + Go | Simple for monorepo | Secret rotation requires coordinated deploy; consider RS256 + JWKS later |
| **CI** | Compose + Selenium smoke | Catches regressions in proxy + WS | Slow; flaky if timing tight—consider Playwright retries or split e2e to nightly |

## Feature-specific notes

### Contacts & connection requests

- **Pros**: All state in Postgres; clear audit trail; unique partial index on pending pairs.
- **Cons**: Email search is substring on `users`—fine for small directories; needs full-text or external search at scale.
- **Improve**: Rate-limit `sendRequest`, add pagination on contact list.

### 1:1 chat + in-meeting chat

- **Pros**: Same transport pattern (HTTP history + WS live); DM uses notify channel.
- **Cons**: Meeting room messages broadcast in-process only to room members; no global search index.
- **Improve**: Redis pub/sub between meeting-go replicas; message archival to object storage for compliance.

### Call invites & ring UX

- **Pros**: Lightweight; uses same JWT; **client-side queue** avoids dropped `invite` when socket is still connecting.
- **Cons**: No guarantee if callee offline; ring tone relies on browser autoplay policies (user gesture helps).
- **Improve**: Push notifications (FCM/APNs); missed-call table; exponential backoff on notify reconnect with user-visible status.

### Screen share + layout

- **Pros**: Single `replaceTrack` path; CSS layout switches for thumb strip.
- **Cons**: Recording is local MediaRecorder only—no server-side mix.
- **Improve**: Selective forwarding or server record with consent.

### Migrations & schema

- **Pros**: `golang-migrate` runs before apps; single pipeline in Docker.
- **Cons**: Long-running DDL still needs care in production (expand/contract pattern).
- **Improve**: Backward-compatible migrations + health gates per service version.

## Performance tuning checklist

1. **TURN / ICE**: Ensure `coturn` credentials and external IP match reality; verify `frontend` ICE config includes TURN for production browsers behind symmetric NAT.
2. **DB**: Add covering indexes for hot queries (already indexed pair/timelines in migrations—revisit `EXPLAIN` under load).
3. **meeting-go**: Profile hub lock contention; shard by room ID or move to channels with buffered sends.
4. **Frontend**: Code-split heavy ML bundles; lazy-load body-segmentation only when user picks blur/background.
5. **Caching**: Cache `GET /api/users/me` short TTL on client; optional CDN for static assets.
6. **Observability**: Add structured logs + OpenTelemetry traces from nginx → Java/Go → DB.

## Removed / non-goals (this repo)

- **DynamoDB** chat/signaling tables and **Python analytics Lambda** were described in older platform docs but **are not implemented** here; the runnable system is **Postgres + Go hub + React** only.
