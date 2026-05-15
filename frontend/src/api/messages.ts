import { meetingFetch } from "../meeting/client";

export type DirectMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
};

export type RoomMessage = {
  id: string;
  roomId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type RecentEntry = {
  userId: string;
  email: string;
  displayName: string;
  lastKind: "chat" | "call";
  lastAt: string;
};

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchDirectMessages(peerId: string, opts?: { before?: string; limit?: number }): Promise<DirectMessage[]> {
  const params = new URLSearchParams({ peerId });
  if (opts?.before) params.set("before", opts.before);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const res = await meetingFetch(`/v1/messages/dm?${params.toString()}`);
  const body = await asJson<{ messages: DirectMessage[] | null }>(res);
  return Array.isArray(body.messages) ? body.messages : [];
}

export async function sendDirectMessage(peerId: string, body: string): Promise<DirectMessage> {
  const res = await meetingFetch(`/v1/messages/dm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ peerId, body }),
  });
  return asJson<DirectMessage>(res);
}

export async function fetchRoomMessages(roomId: string): Promise<RoomMessage[]> {
  const res = await meetingFetch(`/v1/messages/room?roomId=${encodeURIComponent(roomId)}`);
  const body = await asJson<{ messages: RoomMessage[] | null }>(res);
  return Array.isArray(body.messages) ? body.messages : [];
}

export async function fetchRecents(): Promise<RecentEntry[]> {
  const res = await meetingFetch(`/v1/recent`);
  const body = await asJson<{ recents: RecentEntry[] | null }>(res);
  return Array.isArray(body.recents) ? body.recents : [];
}

export async function touchRecent(peerId: string, kind: "call" | "chat" = "call"): Promise<void> {
  await meetingFetch(`/v1/recent/touch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ peerId, kind }),
  });
}
