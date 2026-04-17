import { supabase } from "@/lib/supabase";

export type BrokerGateState = {
  /** OpenAlgo row present with username or API key */
  hasCredentials: boolean;
  /** Same rule as chartmate-trading-widget `isBrokerSessionLive` (respects `token_expires_at`) */
  live: boolean;
  tokenExpiresAt: string | null;
};

/**
 * Load integration row and compute whether the daily broker session is still valid.
 */
export async function fetchBrokerGateState(userId: string): Promise<BrokerGateState> {
  const { data, error } = await supabase
    .from("user_trading_integration")
    .select("openalgo_api_key,openalgo_username,token_expires_at,is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return { hasCredentials: false, live: false, tokenExpiresAt: null };
  }

  const row = data as {
    openalgo_api_key?: string | null;
    openalgo_username?: string | null;
    token_expires_at?: string | null;
  };
  const key = String(row.openalgo_api_key ?? "").trim();
  const user = String(row.openalgo_username ?? "").trim();
  const hasCredentials = Boolean(key || user);
  const rawExp = row.token_expires_at;
  const tokenExpiresAt = rawExp != null && String(rawExp).trim() ? String(rawExp).trim() : null;

  if (!hasCredentials) {
    return { hasCredentials: false, live: false, tokenExpiresAt };
  }
  if (!tokenExpiresAt) {
    return { hasCredentials: true, live: true, tokenExpiresAt: null };
  }
  const exp = new Date(tokenExpiresAt);
  if (Number.isNaN(exp.getTime())) {
    return { hasCredentials: true, live: true, tokenExpiresAt };
  }
  const live = exp.getTime() > Date.now();
  return { hasCredentials, live, tokenExpiresAt };
}

export async function isBrokerIntegrationReady(userId: string): Promise<boolean> {
  const s = await fetchBrokerGateState(userId);
  return s.live;
}
