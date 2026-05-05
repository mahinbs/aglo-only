import { toUserFacingErrorMessage } from "@/lib/userFacingErrors";

const PRIMARY_BFF = (import.meta.env.VITE_ALGO_ONLY_BFF_URL ?? "").replace(/\/$/, "");
const SECONDARY_BFF = (import.meta.env.VITE_ALGO_ONLY_BFF_URL_SECONDARY ?? "").replace(/\/$/, "");
const SECONDARY_USER_IDS = new Set(
  String(import.meta.env.VITE_ALGO_ONLY_BFF_SECONDARY_USER_IDS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean),
);
const SECONDARY_USER_EMAILS = new Set(
  String(import.meta.env.VITE_ALGO_ONLY_BFF_SECONDARY_USER_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean),
);
const SECONDARY_EMAIL_DOMAINS = new Set(
  String(import.meta.env.VITE_ALGO_ONLY_BFF_SECONDARY_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean),
);
const ACTIVE_BFF_KEY = "algo-only-active-bff-v1";

type JwtClaims = {
  sub?: string;
  email?: string;
};

function configuredBffs(): string[] {
  const out: string[] = [];
  if (PRIMARY_BFF) out.push(PRIMARY_BFF);
  if (SECONDARY_BFF && SECONDARY_BFF !== PRIMARY_BFF) out.push(SECONDARY_BFF);
  return out;
}

function readActiveBff(): string {
  try {
    return String(sessionStorage.getItem(ACTIVE_BFF_KEY) || "").trim();
  } catch {
    return "";
  }
}

function writeActiveBff(url: string): void {
  try {
    if (!url) {
      sessionStorage.removeItem(ACTIVE_BFF_KEY);
      return;
    }
    sessionStorage.setItem(ACTIVE_BFF_KEY, url);
  } catch {
    // ignore storage write issues
  }
}

function parseJwtClaims(accessToken: string): JwtClaims {
  try {
    const token = String(accessToken || "");
    const payload = token.split(".")[1] || "";
    if (!payload) return {};
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const data = JSON.parse(json) as JwtClaims;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function routeBffForIdentity(userId?: string, email?: string): string {
  const uid = String(userId || "").trim();
  const em = String(email || "").trim().toLowerCase();
  const domain = em.includes("@") ? em.split("@")[1] : "";
  if (
    SECONDARY_BFF &&
    (SECONDARY_USER_IDS.has(uid) ||
      SECONDARY_USER_EMAILS.has(em) ||
      (domain && SECONDARY_EMAIL_DOMAINS.has(domain)))
  ) {
    return SECONDARY_BFF;
  }
  return PRIMARY_BFF || SECONDARY_BFF;
}

export function setActiveBffForIdentity(userId?: string, email?: string): string {
  const base = routeBffForIdentity(userId, email);
  writeActiveBff(base);
  return base;
}

export function bffConfigured(): boolean {
  return configuredBffs().length > 0;
}

function bffBase(): string {
  const active = readActiveBff();
  if (active) return active;
  const fallback = PRIMARY_BFF || SECONDARY_BFF;
  if (!fallback) throw new Error(toUserFacingErrorMessage("BFF URL not set"));
  return fallback;
}

export function getResolvedBffBase(): string {
  try {
    return bffBase();
  } catch {
    return "";
  }
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
  const claims = parseJwtClaims(accessToken);
  const selected = setActiveBffForIdentity(claims.sub, claims.email);
  const base = selected || bffBase();
  const res = await fetch(`${base}/api/auth/exchange`, {
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
  const targets = new Set<string>(configuredBffs());
  const active = readActiveBff();
  if (active) targets.add(active);
  if (!targets.size) return;
  await Promise.all(
    Array.from(targets).map((base) =>
      fetch(`${base}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {}),
    ),
  );
  writeActiveBff("");
}

export async function bffMe(): Promise<{
  user_id?: string;
  totp_enabled?: boolean;
  totp_verified_this_session?: boolean;
  approval_status?: string;
  role?: string;
} | null> {
  if (!bffConfigured()) return null;
  const res = await fetch(`${bffBase()}/api/auth/me`, { credentials: "include" });
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
