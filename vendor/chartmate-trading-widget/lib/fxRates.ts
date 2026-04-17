/**
 * Spot USD/INR for backtesting UI — via open.er-api.com (free, no key, CORS-friendly).
 */
export type UsdInrQuote = { inrPerUsd: number; rateDate: string };

export async function fetchUsdInr(): Promise<UsdInrQuote> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`FX HTTP ${res.status}`);
  const j = (await res.json()) as { rates?: { INR?: number }; time_last_update_utc?: string };
  const inr = j.rates?.INR;
  if (typeof inr !== "number" || !Number.isFinite(inr) || inr <= 0) {
    throw new Error("Invalid USD/INR payload");
  }
  return { inrPerUsd: inr, rateDate: typeof j.time_last_update_utc === "string" ? j.time_last_update_utc : "" };
}
