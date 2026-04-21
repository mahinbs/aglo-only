import { useMemo } from "react";
import { useConditionEvents, type ConditionRow } from "../hooks/useConditionEvents";
import { isMarketClosedReason, type LifecycleState } from "../lib/lifecycle";

function formatVal(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && !Number.isFinite(v)) return "—";
  if (typeof v === "number") return String(Math.abs(v) >= 1000 ? v.toFixed(2) : v.toFixed(4)).replace(/\.?0+$/, "");
  return String(v);
}

function readinessFromEvent(event: {
  ready_count?: number | null;
  total_count?: number | null;
  conditions?: ConditionRow[] | null;
}): { ready: number; total: number } {
  const conds = event.conditions;
  if (Array.isArray(conds) && conds.length > 0) {
    const total = conds.length;
    const ready = conds.filter((c) => c.matched).length;
    return { ready, total };
  }
  const rc = event.ready_count;
  const tc = event.total_count;
  if (typeof rc === "number" && typeof tc === "number" && tc > 0) {
    return { ready: rc, total: tc };
  }
  return { ready: 0, total: 0 };
}

export function StrategyConditionPanel(props: {
  strategyId: string;
  strategyName: string;
  brokerLive: boolean;
  streamStale?: boolean;
  lifecycleState?: LifecycleState;
  /** When false, hides the title row (e.g. live modal already shows strategy name). */
  showStrategyTitle?: boolean;
  staleAfterMs?: number;
  lifecycleReason?: string | null;
}) {
  const {
    strategyId,
    strategyName,
    brokerLive,
    streamStale,
    lifecycleState,
    showStrategyTitle = true,
    staleAfterMs,
    lifecycleReason,
  } = props;
  const isLiveLifecycle =
    lifecycleState === undefined ||
    lifecycleState === "ACTIVE" ||
    lifecycleState === "WAITING_MARKET_OPEN" ||
    lifecycleState === "TRIGGERED";
  const isTerminal =
    lifecycleState === "COMPLETED" ||
    lifecycleState === "FAILED" ||
    lifecycleState === "CANCELLED";
  const { event, stale, staleAfterMs: effectiveStaleMs } = useConditionEvents(strategyId, {
    staleAfterMs,
  });
  const staleLabelSec = Math.max(3, Math.round(effectiveStaleMs / 1000));

  const { ready, total } = useMemo(
    () => (event ? readinessFromEvent(event) : { ready: 0, total: 0 }),
    [event],
  );

  const pct = total > 0 ? Math.round((ready / total) * 100) : 0;
  const ringColor =
    total === 0 ? "text-muted-foreground" : pct >= 100 ? "text-emerald-400" : "text-amber-400";

  const atRaw = event?.at || event?.created_at;
  const lastEval =
    atRaw && !Number.isNaN(Date.parse(atRaw))
      ? `${Math.max(0, Math.round((Date.now() - Date.parse(atRaw)) / 1000))}s ago`
      : "—";

  const rows: ConditionRow[] = Array.isArray(event?.conditions) ? (event!.conditions as ConditionRow[]) : [];

  return (
    <div className="space-y-2 rounded-md border border-white/10 bg-black/20 px-2 py-2 text-[10px] text-muted-foreground sm:text-[11px]">
      {showStrategyTitle ? (
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground/90 truncate">{strategyName}</span>
          <div className={`flex items-center gap-1 shrink-0 ${ringColor}`} title={`${ready} / ${total} conditions`}>
            <svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" className="stroke-white/10" strokeWidth="4" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                className={pct >= 100 ? "stroke-emerald-400" : "stroke-amber-400"}
                strokeWidth="4"
                strokeDasharray={`${(pct / 100) * 94.2} 94.2`}
                strokeLinecap="round"
              />
            </svg>
            <span className="tabular-nums text-[10px]">
              {total > 0 ? `${ready}/${total}` : "—"}
            </span>
          </div>
        </div>
      ) : (
        <div className={`flex items-center justify-end gap-1 ${ringColor}`} title={`${ready} / ${total} conditions`}>
          <svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" className="stroke-white/10" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              className={pct >= 100 ? "stroke-emerald-400" : "stroke-amber-400"}
              strokeWidth="4"
              strokeDasharray={`${(pct / 100) * 94.2} 94.2`}
              strokeLinecap="round"
            />
          </svg>
          <span className="tabular-nums text-[10px]">
            {total > 0 ? `${ready}/${total}` : "—"}
          </span>
        </div>
      )}

      {isTerminal ? (
        <span className="text-slate-500">
          {lifecycleState === "COMPLETED"
            ? "Completed — no further evaluation"
            : lifecycleState === "CANCELLED"
              ? "Cancelled — activate to resume"
              : "Stopped — activate to resume"}
        </span>
      ) : !isLiveLifecycle ? (
        <span className="text-slate-500">
          {lifecycleState === "PAUSED" && lifecycleReason?.trim()
            ? `Paused — ${lifecycleReason.trim().slice(0, 160)}${lifecycleReason.trim().length > 160 ? "…" : ""}`
            : "Paused — activate to see live conditions"}
        </span>
      ) : lifecycleState === "WAITING_MARKET_OPEN" ? (
        <span className="text-amber-400">
          {isMarketClosedReason(lifecycleReason)
            ? "Outside the cash session or your strategy window — scanning pauses until it reopens."
            : "Waiting for strategy trading window (market/session timing)"}
        </span>
      ) : !brokerLive ? (
        <span className="text-slate-500">Connect broker for live condition ticks</span>
      ) : stale ? (
        <div className="space-y-1">
          <span className="text-amber-400">
            No new engine snapshot in {staleLabelSec}s (ticks only move this forward when the scanner runs for this
            symbol).
          </span>
          <span className="block text-[10px] text-slate-500 leading-snug">
            Chart LTP comes from the quote API; the &quot;Live&quot; column is from the last engine evaluation — they
            can differ briefly.
          </span>
        </div>
      ) : (
        <span className={streamStale ? "text-amber-400" : "text-emerald-400"}>
          {streamStale ? "Live data stale — reconnecting…" : `Last evaluated ${lastEval}`}
        </span>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-white/5">
          <table className="min-w-[520px] w-full border-collapse text-left">
            <thead>
              <tr className="bg-white/5 text-[10px] uppercase tracking-wide">
                <th className="px-1.5 py-1 font-medium">Condition</th>
                <th className="px-1.5 py-1 font-medium">Live</th>
                <th className="px-1.5 py-1 font-medium w-6"> </th>
                <th className="px-1.5 py-1 font-medium">Thresh</th>
                <th className="px-1.5 py-1 font-medium w-7"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-t border-white/5">
                  <td className="px-1.5 py-1 text-foreground/85 max-w-[140px] truncate" title={r.name}>
                    {r.name}
                  </td>
                  <td className="px-1.5 py-1 tabular-nums text-foreground/90">{formatVal(r.lhs)}</td>
                  <td className="px-1.5 py-1 text-center text-muted-foreground/80">{r.op}</td>
                  <td className="px-1.5 py-1 tabular-nums">{formatVal(r.rhs)}</td>
                  <td className="px-1.5 py-1 text-center">{r.matched ? "✅" : "❌"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {event?.reasons && typeof event.reasons === "object" && (
        <div className="text-[10px] text-muted-foreground/80 truncate" title={JSON.stringify(event.reasons)}>
          {String((event.reasons as { reason?: unknown }).reason ?? "")}
        </div>
      )}
    </div>
  );
}
