# Letsgo frontend

React + Vite app with:

- `/register` — create account
- `/login` — sign in
- `/` — home (loads `/api/users/me` when a JWT is stored)

## Development

```bash
npm install
npm run dev
```

API calls use relative **`/api`** so the Vite dev server proxy (`vite.config.ts`) forwards to the Spring Boot auth service on port **8080**. **`/meeting`** is proxied to **meeting-go** on **8081** (HTTP lookup and WebSocket upgrades for room + notify).

## Features (home / video)

- Group **mesh WebRTC** room UI (`GroupCallPanel`): join/leave, peer tiles, SDP/ICE via meeting-go.
- **Lookup** user by email; **Ring & send invite** over notify WebSocket; incoming-call modal with Web Audio ring and optional **Notification** API.
- Optional **TensorFlow.js** blur or custom background; processed video is sent with **`replaceTrack`** when effects change mid-call.

## Docker

The production image serves static files with **nginx** and proxies **`/api`** to `auth-java` and **`/meeting`** to `meeting-go` (see `nginx.conf`). No `VITE_API_URL` is required for the containerized setup.
