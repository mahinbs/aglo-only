/** Analytics derived from ChartMate `active_trades` rows (live, non-paper). */

const CLOSED = new Set(["closed", "exited", "completed", "squareoff", "square_off"]);
const OPENISH = new Set(["active", "monitoring", "exit_zone", "open"]);

export type EquityCurvePoint = { t: number; v: number };

function parseMs(v: unknown): number | null {
  if (v == null) return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

function istDayStartUtcMs(anchorMs: number): number {
  const d = new Date(anchorMs);
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return anchorMs;
  return new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+05:30`,
  ).getTime();
}

function tradeInWindow(t: Record<string, unknown>, nowMs: number, lookbackDays: number): boolean {
  const st = String(t.status || "").toLowerCase();
  if (OPENISH.has(st)) return true;
  const ms = parseMs(t.exit_time) ?? parseMs(t.entry_time);
  if (ms == null) return false;
  return ms >= nowMs - lookbackDays * 86_400_000;
}

function meanStd(xs: number[]): { mean: number; std: number } {
  if (!xs.length) return { mean: 0, std: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (xs.length < 2) return { mean, std: 0 };
  const v = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1);
  return { mean, std: Math.sqrt(Math.max(v, 0)) };
}

export function computeTradeAnalytics(
  trades: Record<string, unknown>[],
  nowMs: number,
  lookbackDays: number,
): {
  equity_curve: EquityCurvePoint[];
  sharpe_ratio: number | null;
  max_drawdown_pct: number | null;
  avg_trade_duration_sec: number | null;
  today_realized_pnl: number;
} {
  const live = (trades ?? []).filter((t) => !Boolean(t.is_paper_trade));
  const scoped = live.filter((t) => tradeInWindow(t, nowMs, lookbackDays));
  const closed = scoped.filter((t) => CLOSED.has(String(t.status || "").toLowerCase()));
  const sorted = [...closed].sort((a, b) => {
    const ta = parseMs(a.exit_time) ?? parseMs(a.entry_time) ?? 0;
    const tb = parseMs(b.exit_time) ?? parseMs(b.entry_time) ?? 0;
    return ta - tb;
  });
  let cum = 0;
  const equity_curve: EquityCurvePoint[] = [];
  for (const t of sorted) {
    cum += Number(t.current_pnl || 0);
    const tm = parseMs(t.exit_time) ?? parseMs(t.entry_time) ?? nowMs;
    equity_curve.push({ t: tm, v: cum });
  }
  const pnls = sorted.map((t) => Number(t.current_pnl || 0));
  let sharpe_ratio: number | null = null;
  if (pnls.length >= 5) {
    const { mean, std } = meanStd(pnls);
    if (std > 1e-9) sharpe_ratio = Math.round((mean / std) * Math.sqrt(Math.min(pnls.length, 30)) * 100) / 100;
  }
  let max_drawdown_pct: number | null = null;
  if (equity_curve.length >= 2) {
    let peak = equity_curve[0].v;
    let maxDd = 0;
    for (const p of equity_curve) {
      if (p.v > peak) peak = p.v;
      const dd = peak - p.v;
      if (dd > maxDd) maxDd = dd;
    }
    const base = Math.max(Math.abs(peak), Math.abs(equity_curve[0].v), 1e-6);
    max_drawdown_pct = Math.round((100 * maxDd) / base * 10) / 10;
  }
  const durations: number[] = [];
  for (const t of sorted) {
    const a = parseMs(t.entry_time);
    const b = parseMs(t.exit_time);
    if (a != null && b != null && b >= a) durations.push((b - a) / 1000);
  }
  const avg_trade_duration_sec =
    durations.length >= 1
      ? Math.round(durations.reduce((x, y) => x + y, 0) / durations.length)
      : null;
  const day0 = istDayStartUtcMs(nowMs);
  let today_realized_pnl = 0;
  for (const t of sorted) {
    const ex = parseMs(t.exit_time);
    if (ex != null && ex >= day0) today_realized_pnl += Number(t.current_pnl || 0);
  }
  return {
    equity_curve,
    sharpe_ratio,
    max_drawdown_pct,
    avg_trade_duration_sec,
    today_realized_pnl,
  };
}
