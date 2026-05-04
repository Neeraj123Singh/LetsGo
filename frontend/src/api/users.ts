import { meetingFetch } from "../meeting/client";

export type UserLookupResponse = {
  userId: string;
  email: string;
  displayName: string;
  online: boolean;
};

export async function lookupUserByEmail(email: string): Promise<UserLookupResponse> {
  const q = encodeURIComponent(email.trim());
  const res = await meetingFetch(`/v1/users/lookup?email=${q}`);
  if (res.status === 404) {
    let message = "No account with that email";
    try {
      const j = (await res.json()) as { detail?: string };
      if (typeof j.detail === "string" && j.detail.length > 0) {
        message = j.detail;
      }
    } catch {
      // keep default
    }
    throw new Error(message);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Lookup failed (${res.status})`);
  }
  return (await res.json()) as UserLookupResponse;
}
