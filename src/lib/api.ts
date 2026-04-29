import { toUserFacingErrorMessage } from "@/lib/userFacingErrors";

const bff = (import.meta.env.VITE_ALGO_ONLY_BFF_URL ?? "").replace(/\/$/, "");

export function bffConfigured(): boolean {
  return bff.length > 0;
}

function bffBase(): string {
  if (!bff) throw new Error(toUserFacingErrorMessage("VITE_ALGO_ONLY_BFF_URL not set"));
  return bff;
}

async function parseRes<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const err =
      (data as { error?: string; detail?: unknown })?.error ??
      (data as { detail?: unknown })?.detail;
    const raw = typeof err === "string" ? err : `HTTP ${res.status}`;
    throw new Error(toUserFacingErrorMessage(raw));
  }
  return data;
}

/** One-time: Supabase access_token → HttpOnly vapt_session cookie */
export async function bffAuthExchange(accessToken: string): Promise<void> {
  const res = await fetch(`${bffBase()}/api/auth/exchange`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  await parseRes<{ ok?: boolean }>(res);
}

export async function bffLogout(): Promise<void> {
  if (!bff) return;
  await fetch(`${bff}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
}

export async function bffMe(): Promise<{
  user_id?: string;
  totp_enabled?: boolean;
  totp_verified_this_session?: boolean;
  approval_status?: string;
  role?: string;
} | null> {
  if (!bff) return null;
  const res = await fetch(`${bff}/api/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

export async function bffGet<T>(path: string): Promise<T> {
  const res = await fetch(`${bffBase()}${path}`, { credentials: "include" });
  return parseRes<T>(res);
}

export async function bffFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD" && init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${bffBase()}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  return parseRes<T>(res);
}

/** POST onboarding-style payloads — BFF validates service-side; cookie optional. */
export async function bffPostPublic<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${bffBase()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseRes<T>(res);
}
