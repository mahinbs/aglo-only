import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

export type ConditionRow = {
  name: string;
  lhs?: number | string | null;
  op: string;
  rhs?: number | string | null;
  matched: boolean;
};

export type StrategyConditionEventRow = {
  id?: string;
  strategy_id?: string;
  symbol?: string;
  matched?: boolean;
  all_matched?: boolean | null;
  ready_count?: number | null;
  total_count?: number | null;
  conditions?: ConditionRow[] | null;
  reasons?: Record<string, unknown> | null;
  at?: string | null;
  created_at?: string | null;
};

const DEFAULT_STALE_MS = 30_000;
let _condEventsChannelSeq = 0;

function normalizeSym(v: unknown): string {
  return String(v || "").trim().toUpperCase();
}

export function useConditionEvents(
  strategyId: string | null | undefined,
  opts?: { staleAfterMs?: number; symbol?: string | null; minCreatedAt?: string | null },
) {
  const staleAfterMs =
    typeof opts?.staleAfterMs === "number" && Number.isFinite(opts.staleAfterMs) && opts.staleAfterMs >= 3000
      ? opts.staleAfterMs
      : DEFAULT_STALE_MS;
  const [event, setEvent] = useState<StrategyConditionEventRow | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const sid = (strategyId || "").trim();
  const symbolFilter = normalizeSym(opts?.symbol);
  const minCreatedAtMs = useMemo(() => {
    const raw = String(opts?.minCreatedAt ?? "").trim();
    if (!raw) return 0;
    const t = Date.parse(raw);
    return Number.isNaN(t) ? 0 : t;
  }, [opts?.minCreatedAt]);

  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!sid) {
      setEvent(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const q = supabase
        .from("strategy_condition_events")
        .select(
          "id,strategy_id,symbol,matched,all_matched,ready_count,total_count,conditions,reasons,at,created_at",
        )
        .eq("strategy_id", sid)
        .gte(
          "created_at",
          minCreatedAtMs > 0 ? new Date(minCreatedAtMs).toISOString() : "1970-01-01T00:00:00.000Z",
        )
        .order("created_at", { ascending: false })
        .limit(30);
      const { data, error } = await q;

      if (!cancelled && !error) {
        const rows = Array.isArray(data) ? (data as StrategyConditionEventRow[]) : [];
        if (!rows.length) {
          setEvent(null);
          return;
        }
        if (!symbolFilter) {
          setEvent(rows[0] ?? null);
          return;
        }
        const matched = rows.find((r) => normalizeSym(r.symbol) === symbolFilter) ?? null;
        setEvent(matched);
      }
    })();

    // Important: channel topics must be unique per hook instance.
    // The dashboard can render multiple panels for the same strategy id
    // (e.g. card + live-monitoring section). Reusing the exact same channel
    // topic causes Supabase to reject adding callbacks after the first subscribe.
    _condEventsChannelSeq += 1;
    const channelTopic = `strategy_condition_events:${sid}:${_condEventsChannelSeq}`;
    const channel = supabase
      .channel(channelTopic)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "strategy_condition_events",
          filter: `strategy_id=eq.${sid}`,
        },
        (payload) => {
          const row = payload.new as StrategyConditionEventRow;
          if (symbolFilter && normalizeSym(row.symbol) !== symbolFilter) return;
          const rowTsRaw = row?.created_at || row?.at || "";
          const rowTs = Date.parse(String(rowTsRaw || ""));
          if (minCreatedAtMs > 0 && !Number.isNaN(rowTs) && rowTs < minCreatedAtMs) return;
          setEvent(row);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [sid, symbolFilter, minCreatedAtMs]);

  const stale = useMemo(() => {
    if (!sid) return true;
    const atRaw = event?.at || event?.created_at;
    if (!atRaw) return true;
    const t = Date.parse(atRaw);
    if (Number.isNaN(t)) return true;
    return nowTick - t > staleAfterMs;
  }, [event, nowTick, sid, staleAfterMs]);

  return { event, stale, staleAfterMs };
}
