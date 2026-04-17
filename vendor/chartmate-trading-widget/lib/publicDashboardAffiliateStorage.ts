/**
 * Optional override list for the public dashboard demo affiliates table.
 * When non-empty in localStorage, {@link PublicDashboardPage} uses these seeds instead of built-in demos.
 */

export const PUBLIC_DASHBOARD_AFFILIATES_STORAGE_KEY = "chartmate_public_dashboard_affiliates_v1";

export const PUBLIC_DASHBOARD_AFFILIATES_CHANGED_EVENT = "chartmate-public-dashboard-affiliates";

/** Same shape as demo seeds in PublicDashboardPage (`monthlySales` filled at runtime). */
export type PublicDashboardAffiliateSeed = {
  id: string;
  name: string;
  trackingId: string;
  userCount: number;
  profitShare: string;
  payout: string;
  joiningDate: string;
  totalEarnings: string;
  lastPayoutDate: string;
  salesWeights: number[];
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Matches joining dates used by the public dashboard sales chart (`01 Mar 2026`). */
export function isValidAffiliateJoinDate(s: string): boolean {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return false;
  const monStr = m[2]![0]!.toUpperCase() + m[2]!.slice(1).toLowerCase();
  const mi = MONTH_SHORT.indexOf(monStr as (typeof MONTH_SHORT)[number]);
  if (mi < 0) return false;
  const day = parseInt(m[1]!, 10);
  return day >= 1 && day <= 31;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeWeights(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const nums = raw.map((x) => Math.max(0, Number(x) || 0));
  return nums.length >= 8 ? nums.slice(0, 8) : [];
}

/** `null` → use built-in demo affiliates. */
export function readStoredPublicAffiliates(): PublicDashboardAffiliateSeed[] | null {
  try {
    const raw = localStorage.getItem(PUBLIC_DASHBOARD_AFFILIATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: PublicDashboardAffiliateSeed[] = [];
    for (const item of parsed) {
      if (!isRecord(item)) continue;
      const id = String(item.id ?? "").trim();
      const name = String(item.name ?? "").trim();
      const trackingId = String(item.trackingId ?? "").trim();
      if (!id || !name || !trackingId) continue;
      const userCount = Math.max(0, Math.floor(Number(item.userCount) || 0));
      const profitShare = String(item.profitShare ?? "30%").trim() || "30%";
      const joiningDate = String(item.joiningDate ?? "").trim();
      const lastPayoutDate = String(item.lastPayoutDate ?? "").trim();
      if (!isValidAffiliateJoinDate(joiningDate) || !isValidAffiliateJoinDate(lastPayoutDate)) continue;
      let salesWeights = normalizeWeights(item.salesWeights);
      if (salesWeights.length < 8) {
        const fallback = [20, 24, 18, 28, 26, 22, 30, 24];
        salesWeights = Array.from({ length: 8 }, (_, i) => salesWeights[i] ?? fallback[i] ?? 1);
      }
      const payout = String(item.payout ?? "").trim() || "$0";
      const totalEarnings = String(item.totalEarnings ?? "").trim() || "$0";
      out.push({
        id,
        name,
        trackingId,
        userCount,
        profitShare,
        payout,
        joiningDate,
        totalEarnings,
        lastPayoutDate,
        salesWeights,
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function writeStoredPublicAffiliates(rows: PublicDashboardAffiliateSeed[]): void {
  if (rows.length === 0) {
    localStorage.removeItem(PUBLIC_DASHBOARD_AFFILIATES_STORAGE_KEY);
  } else {
    localStorage.setItem(PUBLIC_DASHBOARD_AFFILIATES_STORAGE_KEY, JSON.stringify(rows));
  }
}

export function notifyPublicDashboardAffiliatesChanged(): void {
  window.dispatchEvent(new Event(PUBLIC_DASHBOARD_AFFILIATES_CHANGED_EVENT));
}
