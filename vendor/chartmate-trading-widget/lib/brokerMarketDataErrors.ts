/**
 * Map low-level OpenAlgo / broker quote errors to a single user-facing message.
 * (e.g. Zerodha "Incorrect api_key or access_token" → reconnect broker.)
 */
export const BROKER_NOT_CONNECTED_MESSAGE =
  "Broker not connected. Open Live Trading and tap Connect (Broker Sync), then try again.";

function norm(s: string): string {
  return s.toLowerCase().replace(/`/g, "'").replace(/\s+/g, " ").trim();
}

/** True when failure is almost certainly missing/expired broker session or bad OpenAlgo user key. */
export function isLikelyBrokerSessionOrKeyError(message: string): boolean {
  const m = norm(message);
  if (!m) return false;
  if (m.includes("broker not connected")) return false;

  if (m.includes("error fetching quotes")) return true;
  if (m.includes("failed to fetch ltp")) {
    return (
      m.includes("error fetching quotes") ||
      m.includes("incorrect") ||
      m.includes("api_key") ||
      m.includes("api key") ||
      m.includes("access_token") ||
      m.includes("access token") ||
      m.includes("unauthorized") ||
      m.includes("session") ||
      m.includes("token")
    );
  }

  if (m.includes("incorrect") && (m.includes("api_key") || m.includes("api key") || m.includes("access_token") || m.includes("access token"))) {
    return true;
  }
  if (m.includes("api_key") || m.includes("api key") || m.includes("access_token") || m.includes("access token")) {
    return true;
  }
  if (m.includes("session expired") || m.includes("token expired") || m.includes("invalid exchange token")) {
    return true;
  }
  if (m.includes("broker session") || m.includes("openalgo api key") || m.includes("reconnect")) {
    return true;
  }
  if (m.includes("not logged") || m.includes("please login") || m.includes("login to")) {
    return true;
  }
  if (m.includes("unauthorized") && (m.includes("401") || m.includes("broker"))) {
    return true;
  }
  return false;
}

export function friendlyBrokerMarketDataError(message: string): string {
  const t = (message ?? "").trim();
  if (!t) return t;
  if (norm(t).includes("broker not connected")) return t;
  return isLikelyBrokerSessionOrKeyError(t) ? BROKER_NOT_CONNECTED_MESSAGE : t;
}
