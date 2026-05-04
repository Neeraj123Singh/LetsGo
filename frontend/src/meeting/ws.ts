import { getToken } from "../api/client";

export function meetingRoomWebSocketUrl(roomId: string): string {
  const token = getToken();
  if (!token) {
    throw new Error("Not signed in");
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/meeting/ws/v1/room?token=${encodeURIComponent(token)}&roomId=${encodeURIComponent(roomId)}`;
}

/** Presence + invite delivery (stay connected on Home for incoming ring). */
export function meetingNotifyWebSocketUrl(): string {
  const token = getToken();
  if (!token) {
    throw new Error("Not signed in");
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/meeting/ws/v1/notify?token=${encodeURIComponent(token)}`;
}
