const bff = (import.meta.env.VITE_ALGO_ONLY_BFF_URL ?? "").replace(/\/$/, "");

export function bffConfigured(): boolean {
  return bff.length > 0;
}

export async function bffGet<T>(path: string, accessToken: string): Promise<T> {
  if (!bff) throw new Error("VITE_ALGO_ONLY_BFF_URL not set");
  const res = await fetch(`${bff}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const err = (data as { error?: string; detail?: unknown })?.error
      ?? (data as { detail?: unknown })?.detail;
    throw new Error(typeof err === "string" ? err : `HTTP ${res.status}`);
  }
  return data;
}

export async function bffFetch<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  if (!bff) throw new Error("VITE_ALGO_ONLY_BFF_URL not set");
  const res = await fetch(`${bff}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const err = (data as { error?: string; detail?: unknown })?.error
      ?? (data as { detail?: unknown })?.detail;
    throw new Error(typeof err === "string" ? err : `HTTP ${res.status}`);
  }
  return data;
}
