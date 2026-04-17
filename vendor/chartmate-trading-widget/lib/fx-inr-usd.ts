/**
 * Spot USD per 1 INR (multiply an INR amount by this to get USD).
 * Uses open.er-api.com — free tier, no key required, proper CORS headers.
 */
export async function fetchUsdPerInr(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://open.er-api.com/v6/latest/INR",
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: { USD?: number } };
    const rate = json?.rates?.USD;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
