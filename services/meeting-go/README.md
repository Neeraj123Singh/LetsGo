# meeting-go

Go service for **group WebRTC signaling** (mesh), **user lookup** (who is online), and **out-of-room call invites** over a second WebSocket. Uses the same `users` table and the same **HS256 JWT** secret as `auth-java` (`sub` claim = user UUID).

## HTTP

- `GET /meeting/api/v1/users/lookup?email=` — `Authorization: Bearer <JWT>`  
  Response: `{ "userId", "email", "displayName", "online" }` (`online` = at least one active **room** or **notify** WebSocket for that user).

## WebSocket — room (in-call signaling)

- `GET /meeting/ws/v1/room?token=<JWT>&roomId=<id>`  
  - `roomId`: 8–128 chars, letters, digits, `-`, `_`  
  - On connect: receive `room-roster` with existing peers; others receive `peer-joined`.  
  - Relay messages (JSON to hub; delivered to target peer only): `webrtc-offer`, `webrtc-answer`, `webrtc-ice` (include `targetUserId`).

## WebSocket — notify (presence + invites)

- `GET /meeting/ws/v1/notify?token=<JWT>`  
  - Stays open while the user has the app open; used to deliver **incoming-call** without joining a room first.

### Client → server (`kind` field)

| `kind` | Fields | Behavior |
|--------|--------|----------|
| `invite` | `targetEmail`, `roomId`, `callId` | Validates room id and `callId` length (≥ 8). Looks up target; if online, sends **`incoming-call`** to target’s notify sockets and remembers caller for this `callId`. |
| `invite-decline` | `callId` | Notifies stored caller with **`invite-declined`** and clears pending state. |
| `invite-accepted` | `callId` | Sends **`invite-accepted`** to caller, then clears pending invite. |

### Server → client

| `kind` | Meaning |
|--------|---------|
| `incoming-call` | Payload includes `callId`, `roomId`, `fromUserId`, `fromEmail`, `fromDisplayName`. |
| `invite-error` | `{ "message": "..." }` — validation, offline user, self-invite, DB error, etc. |
| `invite-declined` | Callee declined. |
| `invite-accepted` | Callee accepted (caller may show success; callee joins room separately). |

## Environment

- `DATABASE_URL` — Postgres connection string  
- `LETSGO_JWT_SECRET` — must match auth-java (≥ 32 UTF-8 bytes)  
- `CORS_ALLOWED_ORIGINS` — comma-separated browser origins  
- `PORT` — listen port (default `8081` in `main.go` when unset)

## Scaling note

Presence, rooms, and notify fanout are **in-memory** in this process. Multiple replicas need a shared presence/room/notify store (e.g. **Redis**) before horizontal scale-out.
