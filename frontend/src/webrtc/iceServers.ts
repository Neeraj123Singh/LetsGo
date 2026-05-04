/** Public STUN only — fine for same-LAN dev; production needs TURN (coturn / cloud). */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];
