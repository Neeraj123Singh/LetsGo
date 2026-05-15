/**
 * ICE servers for the WebRTC mesh.
 *
 * STUN alone is fine for same-LAN development and simple home NATs. For real
 * cross-network calls (symmetric NAT, corporate firewalls, mobile carriers)
 * the browser needs a TURN relay. Configure via Vite env at BUILD time:
 *
 *   VITE_TURN_URL=turn:turn.example.com:3478?transport=udp
 *   VITE_TURN_USER=letsgo
 *   VITE_TURN_PASS=...
 *
 * In the production stack (`docker-compose.prod.yml`) these are passed as
 * build args to the frontend Dockerfile so they end up in the static bundle.
 */
const turnUrl = import.meta.env.VITE_TURN_URL?.trim();
const turnUser = import.meta.env.VITE_TURN_USER?.trim();
const turnPass = import.meta.env.VITE_TURN_PASS?.trim();

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  ...(turnUrl && turnUser && turnPass
    ? [{ urls: turnUrl, username: turnUser, credential: turnPass }]
    : []),
];
