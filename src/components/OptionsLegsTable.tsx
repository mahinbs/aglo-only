import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { bffConfigured, bffGet } from "@/lib/api";
import type { OptionsPositionsFrame } from "@/hooks/useRealtimeStrategy";

export type StrategyLegRow = {
  trade_id: string;
  leg_index: number;
  label: string;
  symbol: string;
  strike?: unknown;
  strike_offset?: unknown;
  side: string;
  type?: string | null;
  qty: number;
  entry_premium: number;
  current_ltp?: number | null;
  leg_pnl: number;
};

type LegsApi = { legs: StrategyLegRow[]; combined_pnl: number; trades: number };

function legPnl(side: string, entry: number, ltp: number, qty: number): number {
  const s = side.toUpperCase();
  if (s === "BUY") return (ltp - entry) * qty;
  return (entry - ltp) * qty;
}

export function OptionsLegsTable(props: {
  strategyId: string;
  accessToken: string | null | undefined;
  positionsFrame: OptionsPositionsFrame | null;
  streamStale?: boolean;
}) {
  const { strategyId, accessToken, positionsFrame, streamStale = false } = props;
  const [rows, setRows] = useState<StrategyLegRow[]>([]);
  const [apiCombined, setApiCombined] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bffConfigured() || !accessToken) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await bffGet<LegsApi>(
        `/api/options/positions/strategies/${encodeURIComponent(strategyId)}/legs`,
        accessToken,
      );
      setRows(Array.isArray(data.legs) ? data.legs : []);
      setApiCombined(typeof data.combined_pnl === "number" ? data.combined_pnl : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load legs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [strategyId, accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const liveByTrade = useMemo(() => {
    const m = new Map<string, { ltp: number; pnl: number }>();
    const data = positionsFrame?.data;
    if (!Array.isArray(data)) return m;
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const sid = o.options_strategy_id != null ? String(o.options_strategy_id) : "";
      if (sid !== strategyId) continue;
      const tid = String(o.trade_id ?? "");
      if (!tid) continue;
      const ltp = Number(o.ltp);
      const pnl = Number(o.pnl);
      if (!Number.isFinite(ltp)) continue;
      m.set(tid, { ltp, pnl: Number.isFinite(pnl) ? pnl : 0 });
    }
    return m;
  }, [positionsFrame?.data, strategyId]);

  const displayRows = useMemo(() => {
    return rows.map((r) => {
      const live = liveByTrade.get(r.trade_id);
      const ltp = live?.ltp ?? r.current_ltp ?? r.entry_premium;
      const entry = Number(r.entry_premium);
      const qty = Number(r.qty) || 1;
      const lp = legPnl(r.side, entry, Number(ltp), qty);
      return { ...r, current_ltp: typeof ltp === "number" ? ltp : r.current_ltp, leg_pnl: lp };
    });
  }, [rows, liveByTrade]);

  const combinedLive = useMemo(() => {
    if (!displayRows.length) return apiCombined ?? 0;
    return displayRows.reduce((s, r) => s + (Number.isFinite(r.leg_pnl) ? r.leg_pnl : 0), 0);
  }, [displayRows, apiCombined]);

  if (!bffConfigured()) {
    return <p className="text-[11px] text-muted-foreground">Set BFF URL to load per-leg P&amp;L.</p>;
  }

  return (
    <div className="rounded-md border border-border/50 bg-muted/10 overflow-hidden text-[11px]">
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border/40 text-muted-foreground">
        <span>Legs &amp; live P&amp;L</span>
        <div className="flex items-center gap-2">
          {streamStale ? <span className="text-amber-400">Stream stale</span> : null}
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          <button
            type="button"
            className="underline text-foreground/80 hover:text-foreground"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </div>
      {err ? <div className="text-destructive px-2 py-1">{err}</div> : null}
      {!displayRows.length && !loading ? (
        <p className="text-muted-foreground px-2 py-3">No open legs for this strategy.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-muted-foreground/80 border-b border-border/40">
                <th className="px-2 py-1 font-medium">Leg</th>
                <th className="px-2 py-1 font-medium">Side</th>
                <th className="px-2 py-1 font-medium">Qty</th>
                <th className="px-2 py-1 font-medium">Entry</th>
                <th className="px-2 py-1 font-medium">LTP</th>
                <th className="px-2 py-1 font-medium text-right">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => (
                <tr key={`${r.trade_id}-${r.leg_index}`} className="border-b border-border/30">
                  <td className="px-2 py-1 font-mono text-[10px] max-w-[140px] truncate" title={r.symbol}>
                    {r.label}
                    {r.strike != null ? ` · ${String(r.strike)}` : ""}
                    {r.type ? ` ${r.type}` : ""}
                  </td>
                  <td className="px-2 py-1">{r.side}</td>
                  <td className="px-2 py-1">{r.qty}</td>
                  <td className="px-2 py-1">{r.entry_premium.toFixed(2)}</td>
                  <td className="px-2 py-1">
                    {r.current_ltp != null && Number.isFinite(Number(r.current_ltp))
                      ? Number(r.current_ltp).toFixed(2)
                      : "—"}
                  </td>
                  <td
                    className={`px-2 py-1 text-right font-medium ${
                      r.leg_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {r.leg_pnl >= 0 ? "+" : ""}
                    {r.leg_pnl.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            {displayRows.length ? (
              <tfoot>
                <tr className="bg-muted/30">
                  <td colSpan={5} className="px-2 py-1 font-semibold text-muted-foreground">
                    Combined
                  </td>
                  <td
                    className={`px-2 py-1 text-right font-semibold ${
                      combinedLive >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {combinedLive >= 0 ? "+" : ""}
                    {combinedLive.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </div>
  );
}
