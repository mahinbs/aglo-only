export type LifecycleState =
  | "ACTIVE"
  | "WAITING_MARKET_OPEN"
  | "TRIGGERED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "PAUSED";

export function normalizeLifecycleState(raw: unknown, fallbackActive = false): LifecycleState {
  const v = String(raw ?? "").trim().toUpperCase();
  // If the user turned the strategy off (`is_active` false), never show engine
  // "live" states — DB `lifecycle_state` can lag until the next engine tick.
  if (!fallbackActive) {
    if (v === "ACTIVE" || v === "WAITING_MARKET_OPEN" || v === "TRIGGERED") {
      return "PAUSED";
    }
  }
  if (
    v === "ACTIVE" ||
    v === "WAITING_MARKET_OPEN" ||
    v === "TRIGGERED" ||
    v === "COMPLETED" ||
    v === "FAILED" ||
    v === "CANCELLED" ||
    v === "PAUSED"
  ) {
    return v;
  }
  return fallbackActive ? "ACTIVE" : "PAUSED";
}

export function lifecycleLabel(state: LifecycleState): string {
  switch (state) {
    case "WAITING_MARKET_OPEN":
      return "Waiting Market Open";
    default:
      return state.charAt(0) + state.slice(1).toLowerCase();
  }
}

export function lifecycleBadgeClass(state: LifecycleState): string {
  switch (state) {
    case "ACTIVE":
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
    case "WAITING_MARKET_OPEN":
      return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
    case "TRIGGERED":
      return "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30";
    case "COMPLETED":
      return "bg-slate-500/15 text-slate-300 border border-slate-500/30";
    case "FAILED":
      return "bg-red-500/15 text-red-300 border border-red-500/30";
    case "CANCELLED":
      return "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30";
    case "PAUSED":
    default:
      return "bg-secondary text-secondary-foreground border border-border";
  }
}

export function isMarketClosedReason(reason: string | null | undefined): boolean {
  const t = String(reason ?? "").toLowerCase();
  if (!t) return false;
  return (
    t.includes("outside trading window") ||
    t.includes("outside window") ||
    t.includes("market closed") ||
    t.includes("outside options window")
  );
}
