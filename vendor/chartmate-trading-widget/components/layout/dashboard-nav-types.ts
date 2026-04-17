import type { LucideIcon } from "lucide-react";

export interface DashboardNavLink {
  to: string;
  label: string;
  icon: LucideIcon;
  iconOpacity?: string;
  iconColor?: string;
  /** When false, never render as active (e.g. multiple items linking to `/pricing`). */
  matchActive?: boolean;
  /** Shown as upgrade CTA (routes to `to`, typically `/pricing?...`). */
  locked?: boolean;
}

/** Match router location to a `to` string that may include `?query`. */
export function isDashboardNavActive(
  to: string,
  pathname: string,
  search: string,
): boolean {
  const q = to.indexOf("?");
  const path = q === -1 ? to : to.slice(0, q);
  const query = q === -1 ? "" : to.slice(q + 1);
  if (pathname !== path) return false;
  if (!query) return true;
  const want = new URLSearchParams(query).toString();
  const have = new URLSearchParams(search.replace(/^\?/, "")).toString();
  return want === have;
}
