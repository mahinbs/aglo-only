import { bffConfigured, bffFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { brokerNotConfiguredMessage, toUserFacingErrorMessage } from "@/lib/userFacingErrors";

function normalizeBroker(broker: string | null | undefined): string {
  return String(broker ?? "").trim().toLowerCase();
}

function isZerodhaLoginUrl(url: string): boolean {
  const u = String(url || "").toLowerCase();
  return u.includes("kite.zerodha.com/connect/login") || u.includes("kite.trade/connect/login");
}

/** Broker connect URLs — routed through algo BFF only (no Supabase Edge from the browser). */
export async function startZerodhaKiteConnect(assignedBroker?: string | null): Promise<void> {
  const broker = normalizeBroker(assignedBroker);
  if (!broker) {
    throw new Error(brokerNotConfiguredMessage());
  }
  if (!bffConfigured()) {
    throw new Error(
      toUserFacingErrorMessage(
        "Set VITE_ALGO_ONLY_BFF_URL — broker login is routed through the algo backend.",
      ),
    );
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");

  const return_url = `${window.location.origin}/broker-callback`;
  const q = new URLSearchParams({ return_url });
  const path =
    broker === "upstox"
      ? "/api/broker/upstox-login-url"
      : broker === "zerodha"
        ? "/api/broker/zerodha-login-url"
        : broker === "fyers"
          ? "/api/broker/fyers-login-url"
          : "";
  if (!path) {
    throw new Error(brokerNotConfiguredMessage());
  }

  const data = await bffFetch<{ url?: string; login_url?: string; error?: string }>(
    `${path}?${q}`,
    { method: "GET" },
  );
  const url = data.url ?? data.login_url;
  if (!url) throw new Error(toUserFacingErrorMessage(data.error ?? "No login URL returned"));
  if (broker === "fyers" && isZerodhaLoginUrl(url)) {
    throw new Error(
      toUserFacingErrorMessage("Fyers connect is misconfigured on backend (received Zerodha login URL)."),
    );
  }
  window.location.href = url;
}
