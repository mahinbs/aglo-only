import { bffConfigured, bffFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

async function messageFromFunctionsHttpError(err: unknown): Promise<string | null> {
  if (!err || typeof err !== "object") return null;
  const ctx = (err as { context?: unknown }).context;
  if (!(ctx instanceof Response)) return null;
  try {
    const j = (await ctx.clone().json()) as { error?: string };
    return typeof j.error === "string" ? j.error : null;
  } catch {
    try {
      const t = await ctx.clone().text();
      return t.trim() ? t.trim().slice(0, 280) : null;
    } catch {
      return null;
    }
  }
}

function normalizeBroker(broker: string | null | undefined): string {
  return String(broker ?? "").trim().toLowerCase();
}

/** Broker connect via BFF (broker-aware), with Zerodha fallback edge path. */
export async function startZerodhaKiteConnect(assignedBroker?: string | null): Promise<void> {
  const broker = normalizeBroker(assignedBroker);
  if (!broker) {
    throw new Error("Broker is not configured yet. Contact your admin.");
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");

  const return_url = `${window.location.origin}/broker-callback`;

  if (bffConfigured()) {
    const q = new URLSearchParams({ return_url });
    const path =
      broker === "upstox"
        ? "/api/broker/upstox-login-url"
        : broker === "zerodha"
          ? "/api/broker/zerodha-login-url"
          : "";
    if (!path) {
      throw new Error(`${broker.toUpperCase()} broker connect is not configured yet. Contact your admin.`);
    }
    const data = await bffFetch<{ url?: string; login_url?: string; error?: string }>(
      `${path}?${q}`,
      { method: "GET" },
    );
    const url = data.url ?? data.login_url;
    if (!url) throw new Error(data.error ?? "No login URL returned");
    window.location.href = url;
    return;
  }

  if (broker !== "zerodha") {
    throw new Error(`${broker.toUpperCase()} broker connect is not configured yet. Contact your admin.`);
  }

  const res = await supabase.functions.invoke("get-zerodha-login-url", {
    body: { return_url },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const payload = (res.data ?? {}) as { url?: string; login_url?: string; error?: string };
  const url = payload.url ?? payload.login_url;
  if (url) {
    window.location.href = url;
    return;
  }
  if (payload.error) throw new Error(payload.error);
  if (res.error) {
    const fromBody = await messageFromFunctionsHttpError(res.error);
    throw new Error(fromBody ?? res.error.message);
  }
  throw new Error("No login URL returned");
}
