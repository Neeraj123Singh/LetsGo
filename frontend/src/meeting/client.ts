import { getToken } from "../api/client";

export async function meetingFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`/meeting/api${p}`, { ...init, headers });
}
