import { apiFetch } from "./client";

export type BackgroundView = {
  id: string;
  label: string;
  mimeType: string;
  /** A `data:image/<type>;base64,...` URL ready to drop into <img src>. */
  dataUrl: string;
  createdAt: string;
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

export async function listBackgrounds(): Promise<BackgroundView[]> {
  const res = await apiFetch("/api/users/me/backgrounds");
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  const body = (await res.json()) as BackgroundView[] | null;
  return Array.isArray(body) ? body : [];
}

export async function uploadBackground(label: string, dataUrl: string): Promise<BackgroundView> {
  const res = await apiFetch("/api/users/me/backgrounds", {
    method: "POST",
    body: JSON.stringify({ label, dataUrl }),
  });
  if (!res.ok) {
    throw new Error(await readError(res));
  }
  return (await res.json()) as BackgroundView;
}

export async function deleteBackground(id: string): Promise<void> {
  const res = await apiFetch(`/api/users/me/backgrounds/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await readError(res));
  }
}

/**
 * Read a File (from a `<input type="file">`) and base64-encode it as a data URL.
 * Resolves with the data URL string. Files larger than `maxBytes` (raw) are rejected.
 */
export function fileToDataUrl(file: File, maxBytes = 2 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.`));
      return;
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      reject(new Error("Only JPEG, PNG, WebP or GIF images are supported."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
