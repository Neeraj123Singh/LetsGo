import { apiFetch, clearToken, setToken } from "./client";

/** Thrown when an auth API responds with !ok; preserves HTTP status for client handling. */
export class ApiHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

export function isApiHttpError(e: unknown): e is ApiHttpError {
  return e instanceof ApiHttpError;
}

export type AuthResponse = {
  accessToken: string;
  userId: string;
  email: string;
  displayName: string;
};

export type UserResponse = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

export async function register(payload: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthResponse> {
  const res = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await readError(res);
    throw new Error(err);
  }
  const data = (await res.json()) as AuthResponse;
  setToken(data.accessToken);
  return data;
}

export async function login(payload: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await readError(res);
    throw new Error(err);
  }
  const data = (await res.json()) as AuthResponse;
  setToken(data.accessToken);
  return data;
}

export function logout(): void {
  clearToken();
}

export async function fetchMe(): Promise<UserResponse> {
  const res = await apiFetch("/api/users/me");
  if (!res.ok) {
    const err = await readError(res);
    throw new ApiHttpError(res.status, err);
  }
  return (await res.json()) as UserResponse;
}

async function readError(res: Response): Promise<string> {
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await res.json()) as { detail?: string; title?: string };
      if (typeof body.detail === "string") {
        return body.detail;
      }
      if (typeof body.title === "string") {
        return body.title;
      }
    }
  } catch {
    // ignore
  }
  return `Request failed (${res.status})`;
}
