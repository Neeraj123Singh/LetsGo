# Letsgo frontend

React + Vite app with:

- **`vite-plugin-pwa`** — production **manifest + service worker** (offline shell / instant reload via precached assets); **`registerType: autoUpdate`**. Dev server keeps PWA disabled (`devOptions.enabled: false`).
- **`/register`** — create account
- **`/login`** — sign in
- **`/`** — home (loads `/api/users/me` when a JWT is stored)

Install from a deployed HTTPS origin: browser **Install app** / **Add to Home Screen**. Icons: **`public/favicon.svg`**, **`pwa-192.png`**, **`pwa-512.png`**, **`pwa-maskable-512.png`**, **`apple-touch-icon.png`**.

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

The production image serves static files with **nginx** and proxies **`/api`** to `auth-java` and **`/meeting`** to `meeting-go` (see `nginx.conf`). **`index.html`**, **`registerSW.js`**, **`sw.js`**, **`workbox-*.js`**, and **`manifest.webmanifest`** use cache headers that favour fresh PWA metadata after deploy. No `VITE_API_URL` is required for the containerized setup.

### PWA works locally but not on the server?

**Without CI deploy:** GitHub Actions **CI green** only validates in runners unless you enable **`DEPLOY_VIA_CI`** — see **`docs/github-actions-deploy.md`**. Otherwise the live site changes after **`git pull`** (or rsync) on the server and **`docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`** (or **`bash scripts/deploy.sh`**).

1. **Rebuild the frontend image** so `npm run build` runs with the latest `vite.config.ts` + PWA plugin (use once if unsure: `docker compose ... build --no-cache frontend` then `up -d`).
2. **HTTPS only** — service workers need a secure context on the real internet (HTTP is OK for `localhost` only). Open the app as `https://your-domain`, not bare `http://` if Caddy hasn’t redirected yet.
3. **Verify assets** from your laptop (replace the host):

   ```bash
   curl -sI "https://YOUR_DOMAIN/manifest.webmanifest" | head -5
   curl -sI "https://YOUR_DOMAIN/sw.js" | head -5
   curl -s  "https://YOUR_DOMAIN/" | tr '\n' ' ' | grep -o 'manifest[^"]*'
   ```

   You should see **`200`**, **`Cache-Control`** on HTML/SW as set in `nginx.conf`, and a **`manifest.webmanifest`** link in the HTML.

4. **Browser** — DevTools → **Application** → **Manifest** / **Service workers**. If an old worker is stuck: **Unregister** + hard refresh, or clear site data.

The **Dockerfile** fails the image build if **`dist/sw.js`**, **`dist/manifest.webmanifest`**, or **`dist/registerSW.js`** are missing, so a successful `frontend` image build guarantees those files are in the container.
