import { apiFetch } from "./client";

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
};

export type ConnectionRequestView = {
  id: string;
  requester: UserSummary;
  addressee: UserSummary;
  status: "pending" | "accepted" | "declined" | "cancelled";
  direction: "incoming" | "outgoing";
  createdAt: string;
};

export type ContactView = {
  user: UserSummary;
  connectedAt: string;
};

async function readError(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await res.json()) as { detail?: string; title?: string };
      if (typeof body.detail === "string") return body.detail;
      if (typeof body.title === "string") return body.title;
    }
  } catch {
    // ignore
  }
  return `Request failed (${res.status})`;
}

export async function searchUsersByEmail(query: string): Promise<UserSummary[]> {
  const q = query.trim();
  if (q.length < 3) {
    return [];
  }
  const res = await apiFetch(`/api/users/search?email=${encodeURIComponent(q)}`);
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as UserSummary[] | null;
  return Array.isArray(body) ? body : [];
}

export async function listContacts(): Promise<ContactView[]> {
  const res = await apiFetch("/api/connections");
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as ContactView[] | null;
  return Array.isArray(body) ? body : [];
}

export async function removeContact(peerId: string): Promise<void> {
  const res = await apiFetch(`/api/connections/${encodeURIComponent(peerId)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await readError(res));
  }
}

export async function sendConnectionRequest(email: string): Promise<ConnectionRequestView> {
  const res = await apiFetch("/api/connections/requests", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as ConnectionRequestView;
}

export async function listRequests(box: "incoming" | "outgoing"): Promise<ConnectionRequestView[]> {
  const res = await apiFetch(`/api/connections/requests?box=${box}`);
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as ConnectionRequestView[] | null;
  return Array.isArray(body) ? body : [];
}

export async function respondToRequest(
  requestId: string,
  action: "accept" | "decline" | "cancel"
): Promise<ConnectionRequestView> {
  const res = await apiFetch(`/api/connections/requests/${requestId}/${action}`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as ConnectionRequestView;
}
