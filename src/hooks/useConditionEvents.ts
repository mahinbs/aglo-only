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

const STALE_MS = 10_000;

export function useConditionEvents(strategyId: string | null | undefined) {
  const [event, setEvent] = useState<StrategyConditionEventRow | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const sid = (strategyId || "").trim();

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
      const { data, error } = await supabase
        .from("strategy_condition_events")
        .select(
          "id,strategy_id,symbol,matched,all_matched,ready_count,total_count,conditions,reasons,at,created_at",
        )
        .eq("strategy_id", sid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && !error && data) {
        setEvent(data as StrategyConditionEventRow);
      }
    })();

    const channel = supabase
      .channel(`strategy_condition_events:${sid}`)
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
          setEvent(row);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [sid]);

  const stale = useMemo(() => {
    if (!sid) return true;
    const atRaw = event?.at || event?.created_at;
    if (!atRaw) return true;
    const t = Date.parse(atRaw);
    if (Number.isNaN(t)) return true;
    return nowTick - t > STALE_MS;
  }, [event, nowTick, sid]);

  return { event, stale };
}
