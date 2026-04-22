import { useMemo } from "react";
import { useConditionEvents, type ConditionRow } from "../hooks/useConditionEvents";
import { isMarketClosedReason, type LifecycleState } from "../lib/lifecycle";

function formatVal(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && !Number.isFinite(v)) return "—";
  if (typeof v === "number") return String(Math.abs(v) >= 1000 ? v.toFixed(2) : v.toFixed(4)).replace(/\.?0+$/, "");
  return String(v);
}

/** True when the latest engine snapshot says we are outside the tradable window (entries paused). */
function snapshotOutsideMarketWindow(
  reasons: unknown,
  lifecycleReason: string | null | undefined,
): boolean {
  const lr = String(lifecycleReason ?? "").toLowerCase();
  if (
    lr.includes("outside_market") ||
    lr.includes("outside market") ||
    lr.includes("outside_trading") ||
    lr.includes("outside trading")
  ) {
    return true;
  }
  if (!reasons || typeof reasons !== "object") return false;
  try {
    const blob = JSON.stringify(reasons).toLowerCase();
    return blob.includes("outside_market_window") || blob.includes("outside market window");
  } catch {
    return false;
  }
}

function formatEngineReasonLine(reasons: object): string {
  const r = reasons as Record<string, unknown>;
  const raw = String(r.reason ?? r.code ?? r.status ?? "").trim();
  if (raw === "outside_market_window") {
    return "Engine: outside market window — entries paused until the session / your window allows trading.";
  }
  if (raw) return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  try {
    const s = JSON.stringify(reasons);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  } catch {
    return "";
  }
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
  symbol?: string | null;
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
    symbol,
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
    symbol,
  });
  const staleLabelSec = Math.max(3, Math.round(effectiveStaleMs / 1000));

  const { ready, total } = useMemo(
    () => (event ? readinessFromEvent(event) : { ready: 0, total: 0 }),
    [event],
  );

  const outsideWindow = useMemo(
    () => snapshotOutsideMarketWindow(event?.reasons, lifecycleReason),
    [event?.reasons, lifecycleReason],
  );

  const engineScanLifecycle =
    lifecycleState === undefined ||
    lifecycleState === "ACTIVE" ||
    lifecycleState === "TRIGGERED";

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
          <span className={outsideWindow ? "text-slate-400" : "text-amber-400"}>
            {outsideWindow
              ? `No new snapshot in ${staleLabelSec}s — outside the tradable window the scanner often runs slowly; this is usually expected, not a dropped feed.`
              : `No new engine snapshot in ${staleLabelSec}s (this row advances when the scanner saves a pass for this symbol).`}
          </span>
          <span className="block text-[10px] text-slate-500 leading-snug">
            Chart LTP comes from the quote stream (near real time). Condition &quot;Live&quot; values come from the last
            engine snapshot in the database (updated on inserts, including via realtime).
          </span>
        </div>
      ) : outsideWindow && engineScanLifecycle ? (
        <div className="space-y-1">
          <span className="text-amber-400/90">
            Outside the tradable window — <strong className="font-semibold">entries are paused</strong>. The strategy
            can still be &quot;on&quot;; the engine may keep periodic checks and write snapshots on its own cadence.
          </span>
          <span className="block text-[10px] text-slate-500 leading-snug">
            Last engine snapshot {lastEval}. Chart LTP can move between snapshots — that is normal.
          </span>
        </div>
      ) : (
        <div className="space-y-1">
          <span className={streamStale ? "text-amber-400" : "text-emerald-400"}>
            {streamStale ? "Live data stale — reconnecting…" : `Last engine snapshot ${lastEval}`}
          </span>
          {!streamStale ? (
            <span className="block text-[10px] text-slate-500 leading-snug">
              Quotes stream on the feed; this table updates as soon as a new snapshot is saved (not on every tick).
            </span>
          ) : null}
        </div>
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
                (() => {
                  const isOrbPending = String(r.name || "").toLowerCase().includes("building opening range");
                  const liveVal = isOrbPending ? "pending" : formatVal(r.lhs);
                  const threshVal = isOrbPending ? "—" : formatVal(r.rhs);
                  const opVal = isOrbPending ? "—" : r.op;
                  return (
                <tr key={`${r.name}-${i}`} className="border-t border-white/5">
                  <td className="px-1.5 py-1 text-foreground/85 max-w-[140px] truncate" title={r.name}>
                    {r.name}
                  </td>
                  <td className="px-1.5 py-1 tabular-nums text-foreground/90">{liveVal}</td>
                  <td className="px-1.5 py-1 text-center text-muted-foreground/80">{opVal}</td>
                  <td className="px-1.5 py-1 tabular-nums">{threshVal}</td>
                  <td className="px-1.5 py-1 text-center">{r.matched ? "✅" : "❌"}</td>
                </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 0 && isLiveLifecycle && brokerLive ? (
        <div className="rounded border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[10px] text-muted-foreground">
          Waiting for first condition snapshot{symbol ? ` for ${symbol}` : ""}. The scanner table appears once the engine saves a pass.
        </div>
      ) : null}

      {event?.reasons && typeof event.reasons === "object" && (
        <div className="text-[10px] text-muted-foreground/80 truncate" title={JSON.stringify(event.reasons)}>
          {formatEngineReasonLine(event.reasons)}
        </div>
      )}
    </div>
  );
}
