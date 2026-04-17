import { supabase } from "@/integrations/supabase/client";

export interface UserTradingIntegration {
  id: string;
  user_id: string;
  integration_type: string;
  base_url: string;
  /** The user's broker access token (e.g. Zerodha access_token). Expires every ~24h. */
  api_key_encrypted: string;
  /** OpenAlgo API key — permanent key generated inside OpenAlgo after Zerodha login. */
  openalgo_api_key: string | null;
  /** Some flows store OpenAlgo username instead of api key. */
  openalgo_username?: string | null;
  /** Broker name as understood by OpenAlgo (e.g. 'zerodha', 'upstox', 'dhan') */
  broker: string | null;
  broker_id: string | null;
  strategy_name: string | null;
  is_active: boolean;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "user_trading_integration" as const;

/**
 * Fetch current user's trading gateway integration.
 * Used by the app to know if we can place live orders; API key is only used server-side.
 */
export async function getTradingIntegration(): Promise<{
  data: UserTradingIntegration | null;
  error: string | null;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not signed in" };

    const { data, error } = await supabase
      .from(TABLE as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: data as UserTradingIntegration | null, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message || "Failed to load integration" };
  }
}

/**
 * True when integration is active, OpenAlgo credentials exist, and the broker day token
 * has not expired (when token_expires_at is set).
 */
export function isBrokerSessionLive(row: UserTradingIntegration | null): boolean {
  if (!row?.is_active) return false;
  const hasOpenalgo =
    !!String(row.openalgo_api_key ?? "").trim() ||
    !!String(row.openalgo_username ?? "").trim();
  if (!hasOpenalgo) return false;
  const exp = row.token_expires_at ? new Date(row.token_expires_at) : null;
  if (exp && exp.getTime() <= Date.now()) return false;
  return true;
}

/** Fired after Broker Sync saves a token or refreshes integration — header + options modals listen. */
export const BROKER_SESSION_UPDATED_EVENT = "chartmate-broker-session-updated";

/** Scrolls to Broker Sync and starts OAuth or opens token paste (same as Connect on the dashboard). */
export const OPEN_BROKER_SYNC_EVENT = "chartmate-open-broker-sync";

export function dispatchBrokerSessionUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BROKER_SESSION_UPDATED_EVENT));
}

export function dispatchOpenBrokerSync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_BROKER_SYNC_EVENT));
}

/**
 * Save or update trading gateway integration for the current user.
 * broker: broker name as used by OpenAlgo (e.g. 'zerodha', 'upstox', 'dhan').
 * broker_token: the broker access token that expires when the trading day changes in India.
 */
export async function setTradingIntegration(params: {
  broker: string;
  broker_token: string;
  openalgo_api_key?: string;
  strategy_name?: string;
}): Promise<{ data: UserTradingIntegration | null; error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: "Not signed in" };

    if (!params.broker.trim() || !params.broker_token.trim()) {
      return { data: null, error: "Broker and access token are required" };
    }

    // Token expires at midnight (start of next trading day) in India (IST, UTC+5:30),
    // regardless of the exact time it was generated.
    const IST_OFFSET_MINUTES = 330; // 5.5 hours
    const now = new Date();
    const nowIstMs = now.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
    const nowIst = new Date(nowIstMs);

    const year = nowIst.getUTCFullYear();
    const month = nowIst.getUTCMonth(); // 0-based
    const day = nowIst.getUTCDate();

    // Midnight of the next day in IST, converted back to UTC for storage
    const nextDayMidnightIstAsUtcMs = Date.UTC(year, month, day + 1, 0, 0, 0);
    const expiresUtcMs = nextDayMidnightIstAsUtcMs - IST_OFFSET_MINUTES * 60 * 1000;
    const expiresAt = new Date(expiresUtcMs).toISOString();

    const row: Record<string, unknown> = {
      user_id: user.id,
      integration_type: "openalgo",
      base_url: "",
      api_key_encrypted: params.broker_token.trim(),
      broker: params.broker.trim().toLowerCase(),
      strategy_name: params.strategy_name || "ChartMate AI",
      is_active: true,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    if (params.openalgo_api_key?.trim()) {
      row.openalgo_api_key = params.openalgo_api_key.trim();
    }

    const { data, error } = await supabase
      .from(TABLE as any)
      .upsert(row, { onConflict: "user_id" })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as UserTradingIntegration, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message || "Failed to save integration" };
  }
}

/**
 * Patch only the openalgo_api_key on an existing integration.
 * Used for one-time setup after provisioning (the broker token is already saved).
 */
export async function updateOpenalgoApiKey(
  apiKey: string,
): Promise<{ error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };
    const { error } = await supabase
      .from(TABLE as any)
      .update({ openalgo_api_key: apiKey.trim(), updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    return { error: error?.message ?? null };
  } catch (e: any) {
    return { error: e?.message || "Failed to save API key" };
  }
}

/**
 * Remove trading integration for the current user.
 */
export async function clearTradingIntegration(): Promise<{ error: string | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in" };

    const { error } = await supabase
      .from(TABLE as any)
      .delete()
      .eq("user_id", user.id);

    return { error: error?.message || null };
  } catch (e: any) {
    return { error: e?.message || "Failed to clear integration" };
  }
}
