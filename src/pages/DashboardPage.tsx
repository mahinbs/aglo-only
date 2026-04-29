import { useCallback, useEffect, useMemo, useState } from "react";
import TradingSmartDashboard from "../components/TradingSmartDashboard.jsx";
import { useAuth } from "@/hooks/useAuth";
import { useSessionExpiry } from "@/hooks/useSessionExpiry";
import { bffConfigured, bffFetch } from "@/lib/api";

/** Replaces Supabase `manage-strategy` Edge when `VITE_ALGO_ONLY_BFF_URL` is set. */
async function manageStrategyInvoke(
  accessToken: string | undefined,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  if (bffConfigured()) {
    try {
      const data = await bffFetch<unknown>("/api/strategies/manage", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { data, error: null };
    } catch (e: unknown) {
      return {
        data: null,
        error: { message: e instanceof Error ? e.message : "manage-strategy failed" },
      };
    }
  }
  if (!accessToken) {
    return { data: null, error: { message: "Not signed in" } };
  }
  const res = await supabase.functions.invoke("manage-strategy", {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.error) {
    return {
      data: res.data ?? null,
      error: { message: res.error.message ?? "manage-strategy failed" },
    };
  }
  return { data: res.data ?? null, error: null };
}
import { isMarketClosedReason, normalizeLifecycleState } from "../lib/lifecycle";
import { useOptionsPositionsStream } from "../hooks/useRealtimeStrategy";
import { supabase } from "@/lib/supabase";
import { startZerodhaKiteConnect } from "@/lib/zerodhaOAuth";
import { computeTradeAnalytics } from "../lib/tradePerformance";
import { toUserFacingErrorMessage } from "@/lib/userFacingErrors";

type Summary = {
  configured?: boolean;
  broker?: string | null;
  broker_connected?: boolean;
  broker_credentials_configured?: boolean;
  broker_session_live?: boolean;
  token_expires_at?: string | null;
  portfolio_value?: number;
  today_pnl?: number;
  cumulative_pnl?: number;
  win_rate_pct?: number | null;
  open_positions_pct_mtm?: number | null;
  recent_orders_count?: number;
  active_strategies_deployed?: number;
  open_positions_count?: number;
  /** When true, order feed is cleared until broker day session is live (avoids stale DB rows looking like “live”). */
  feed_paused?: boolean;
  broker_snapshot?: {
    cash_available?: number | null;
  } | null;
  limits?: { orders: number; strategies: number };
  active_live_orders_for_cap?: number;
  active_strategies_for_cap?: number;
  pending_executions?: Array<{
    id: string;
    strategy_id: string;
    symbol: string;
    action: string;
    status: string;
    created_at: string;
    last_checked_at?: string | null;
    error_message?: string | null;
  }>;
  orders?: Array<{
    id: string;
    type: string;
    symbol: string;
    strategy: string;
    price: string;
    qty: string;
    pnl: number;
    time: string;
  }>;
  user_strategies?: Array<{
    id: string;
    name: string;
    type: string;
    pairs: string;
    timeframe: string;
    riskPerTrade: string;
    stopLoss: string;
    takeProfit: string;
    maxPositions: string;
    deployed: boolean;
    is_intraday?: boolean;
    position_config?: Record<string, unknown>;
    lifecycle_state?: string | null;
    lifecycle_reason?: string | null;
    lifecycle_updated_at?: string | null;
    market_type?: string | null;
    is_options?: boolean;
    _raw?: Record<string, unknown>;
  }>;
  active_strategies_table?: Array<{
    name: string;
    status: string;
    /** Mirrors `is_active` on the strategy row (used for lifecycle normalization). */
    deployed?: boolean;
    trades: number;
    pnl: string;
    win: string;
    pnlColor: string;
    winColor: string;
      lifecycle_reason?: string | null;
      lifecycle_updated_at?: string | null;
  }>;
  equity_curve?: Array<{ t: number; v: number }>;
  sharpe_ratio?: number | null;
  max_drawdown_pct?: number | null;
  avg_trade_duration_sec?: number | null;
};

export type StrategyDevRequestCard = {
  id: string;
  name: string;
  status: string;
  submitted: string;
  eta: string;
};

function brokerSessionLiveFromIntegration(integ: {
  openalgo_api_key?: string | null;
  openalgo_username?: string | null;
  token_expires_at?: string | null;
} | null): { live: boolean; hasCreds: boolean; tokenExpiresAt: string | null } {
  if (!integ) return { live: false, hasCreds: false, tokenExpiresAt: null };
  const key = String(integ.openalgo_api_key ?? "").trim();
  const user = String(integ.openalgo_username ?? "").trim();
  const hasCreds = Boolean(key || user);
  const raw = integ.token_expires_at;
  const tokenExpiresAt = raw != null && String(raw).trim() ? String(raw).trim() : null;
  if (!hasCreds) return { live: false, hasCreds: false, tokenExpiresAt };
  if (!tokenExpiresAt) return { live: false, hasCreds: true, tokenExpiresAt: null };
  const exp = new Date(tokenExpiresAt);
  if (Number.isNaN(exp.getTime())) return { live: false, hasCreds: true, tokenExpiresAt };
  return { live: exp.getTime() > Date.now(), hasCreds: true, tokenExpiresAt };
}

/** Ignore ancient seed rows in KPIs/feed; always keep open/monitoring trades. */
const LIVE_TRADE_LOOKBACK_DAYS = 60;

function tradeEntryMs(entryTime: unknown): number | null {
  const raw = entryTime != null ? String(entryTime) : "";
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function isOpenLikeTrade(t: Record<string, unknown>): boolean {
  const st = String(t.status || "").toLowerCase();
  return ["active", "monitoring", "exit_zone", "open"].includes(st);
}

function tradeInLiveScope(t: Record<string, unknown>, nowMs: number): boolean {
  if (isOpenLikeTrade(t)) return true;
  const ms = tradeEntryMs(t.entry_time);
  if (ms == null) return false;
  return ms >= nowMs - LIVE_TRADE_LOOKBACK_DAYS * 86_400_000;
}

function formatEntryTimeShort(entryTime: unknown): string {
  const raw = entryTime != null ? String(entryTime) : "";
  if (!raw) return "—";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw.slice(0, 16);
  return new Date(ms).toLocaleString(undefined, {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLiveMoney(amount: number, cur: "INR" | "USD"): string {
  const sign = amount >= 0 ? "+" : "-";
  const a = Math.abs(amount);
  if (cur === "INR") {
    return `${sign}₹${a.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  }
  return `${sign}$${a.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function buildStrategyTableRows(
  strats: Record<string, unknown>[] | undefined,
  trades: Record<string, unknown>[] | undefined,
  cur: "INR" | "USD",
): Summary["active_strategies_table"] {
  const closed = new Set(["closed", "exited", "completed", "squareoff", "square_off"]);
  const bySid = new Map<string, Record<string, unknown>[]>();
  for (const t of trades ?? []) {
    const sid = String(t.strategy_id ?? "").trim();
    if (!sid) continue;
    const arr = bySid.get(sid) ?? [];
    arr.push(t);
    bySid.set(sid, arr);
  }
  /* Only attribute trades with user_strategies.id — loose matching inflated P&L across rows. */
  // Hide crashed/stopped/terminal strategies so they never show in the table.
  const visible = (strats ?? []).filter((s) => {
    const st = normalizeLifecycleState(
      (s as { lifecycle_state?: string | null }).lifecycle_state,
      Boolean((s as { is_active?: unknown }).is_active),
    );
    return st !== "FAILED" && st !== "CANCELLED" && st !== "COMPLETED";
  });
  // Expand: one row per (strategy, instrument). Same strategy across multiple
  // instruments must render as separate rows.
  const expanded: Array<{ strat: Record<string, unknown>; symbol: string | null }> = [];
  for (const s of visible) {
    const rawPairs = String((s as { pairs?: unknown }).pairs ?? "").trim();
    const syms = rawPairs
      ? rawPairs
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
    if (syms.length <= 1) {
      expanded.push({ strat: s, symbol: syms[0] ?? null });
    } else {
      for (const sym of syms) expanded.push({ strat: s, symbol: sym });
    }
  }
  const slice = expanded.slice(0, 8);
  if (!slice.length) {
    return [
      {
        name: "No strategies yet",
        status: "paused",
        deployed: false,
        trades: 0,
        pnl: formatLiveMoney(0, cur),
        win: "—",
        pnlColor: "var(--text-muted)",
        winColor: "var(--text-muted)",
      },
    ];
  }
  return slice.map(({ strat: s, symbol: instrumentSymbol }) => {
    const sid = String(s.id ?? "");
    const allMatched = bySid.get(sid) ?? [];
    const matched = instrumentSymbol
      ? allMatched.filter(
          (t) => String(t.symbol ?? "").toUpperCase() === instrumentSymbol.toUpperCase(),
        )
      : allMatched;
    const tc = matched.length;
    const pnlSum = matched.reduce((a, t) => a + Number(t.current_pnl || 0), 0);
    const closedM = matched.filter((t) => closed.has(String(t.status ?? "").toLowerCase()));
    const wins = closedM.filter((t) => Number(t.current_pnl || 0) > 0).length;
    const wr = closedM.length >= 1 ? Math.round((100 * wins) / closedM.length) : null;
    const pnlStr = formatLiveMoney(pnlSum, cur);
    const winStr = wr != null ? `${wr}%` : "—";
    const displayName = instrumentSymbol ? `${String(s.name)} · ${instrumentSymbol}` : String(s.name);
    return {
      name: displayName,
      status: normalizeLifecycleState(s.lifecycle_state, Boolean(s.is_active)).toLowerCase(),
      deployed: Boolean(s.is_active),
      trades: tc,
      pnl: pnlStr,
      win: winStr,
      pnlColor:
        pnlSum > 0 ? "var(--accent-green)" : pnlSum < 0 ? "var(--accent-red)" : "var(--text-muted)",
      winColor:
        wr != null && wr >= 50 ? "var(--accent-green)" : wr != null ? "var(--accent-orange)" : "var(--text-muted)",
      lifecycle_reason: (s.lifecycle_reason as string | undefined) ?? null,
      lifecycle_updated_at: (s.lifecycle_updated_at as string | undefined) ?? null,
    };
  });
}

function symbolsFromPairs(pairs: string) {
  return pairs
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((sym) => {
      const upper = sym.toUpperCase().replace(/\/USDT|\/USD/gi, "");
      const crypto = /^(BTC|ETH|SOL|BNB|XRP|DOGE|AVAX)/i.test(upper);
      return {
        symbol: upper,
        exchange: crypto ? "CRYPTO" : "NSE",
        quantity: 1,
        product_type: crypto ? "CNC" : "MIS",
      };
    });
}

function mapOptionsStrategyCards(rows: Record<string, unknown>[]) {
  const inferUnderlying = (row: Record<string, unknown>) => {
    const direct = [
      row.underlying,
      row.symbol,
      row.instrument_symbol,
      row.pairs,
    ]
      .map((v) => String(v ?? "").trim().toUpperCase())
      .find((v) => Boolean(v));
    if (direct) {
      return direct.split(",")[0]?.trim() || "NIFTY";
    }
    const name = String(row.name ?? "").toUpperCase();
    if (name.includes("CRUDE")) return "CRUDEOIL";
    if (name.includes("BANKNIFTY")) return "BANKNIFTY";
    if (name.includes("FINNIFTY")) return "FINNIFTY";
    if (name.includes("NIFTY")) return "NIFTY";
    return "NIFTY";
  };

  return rows.map((s) => {
    const exitRules =
      s.exit_rules && typeof s.exit_rules === "object"
        ? (s.exit_rules as Record<string, unknown>)
        : {};
    const lcState = normalizeLifecycleState(s.lifecycle_state, Boolean(s.is_active));
    const und = inferUnderlying(s);
    const exRaw = String((s.exchange as string | undefined) ?? "").trim().toUpperCase();
    const exchange =
      exRaw || (und === "CRUDEOIL" || und.startsWith("CRUDE") ? "MCX" : "NSE");
    return {
      id: String(s.id ?? ""),
      name: String(s.name ?? "Options Strategy"),
      type: "OPTIONS",
      pairs: und,
      underlying: und,
      timeframe: "5m",
      riskPerTrade: "1%",
      stopLoss: `${Number(exitRules.sl_pct ?? 30)}%`,
      takeProfit: `${Number(exitRules.tp_pct ?? 50)}%`,
      maxPositions: "1",
      deployed: Boolean(s.is_active),
      is_intraday: true,
      position_config: {},
      lifecycle_state: lcState,
      lifecycle_reason:
        typeof s.lifecycle_reason === "string" ? s.lifecycle_reason : null,
      lifecycle_updated_at:
        typeof s.lifecycle_updated_at === "string" ? s.lifecycle_updated_at : null,
      market_type: "options",
      is_options: true,
      exchange,
      _raw: s,
    };
  });
}

export default function DashboardPage() {
  const { user, session, loading, signOut } = useAuth();
  useSessionExpiry();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [strategyDevRequests, setStrategyDevRequests] = useState<StrategyDevRequestCard[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  // INR-only mode for now.
  const currencyMode: "INR" = "INR";
  const [optBusy, setOptBusy] = useState(false);
  const [userProfile, setUserProfile] = useState<{ full_name?: string | null } | null>(null);
  const [optMsg, setOptMsg] = useState<string | null>(null);

  const useChartmate = Boolean(session?.access_token);

  const refresh = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadErr(null);

    // Fetch user profile name
    if (user?.id) {
      void supabase
        .from("user_signup_profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setUserProfile(data);
        });
    }

    try {
      if (bffConfigured()) {
        let s = await bffFetch<Summary>("/api/dashboard/summary");
        if (
          !s.broker_session_live &&
          (s.active_strategies_deployed ?? 0) > 0 &&
          session.access_token
        ) {
          const pauseRes = await manageStrategyInvoke(session.access_token, { action: "pause_all" });
          const pauseErr = (pauseRes.data as { error?: string } | null)?.error;
          if (!pauseRes.error && !pauseErr) {
            s = await bffFetch<Summary>("/api/dashboard/summary");
          }
        }
        const uidBff = user?.id;
        let mergedSummary = s;
        if (uidBff) {
          const { data: optionsRows } = await supabase
            .from("options_strategies")
            .select("*")
            .eq("user_id", uidBff)
            .order("created_at", { ascending: false })
            .limit(50);
          const optionCards = mapOptionsStrategyCards(
            (optionsRows ?? []) as Record<string, unknown>[],
          );
          const equityCards = Array.isArray(s.user_strategies)
            ? s.user_strategies
            : [];
          mergedSummary = {
            ...s,
            user_strategies: [...optionCards, ...equityCards],
            active_strategies_deployed:
              Number(s.active_strategies_deployed ?? 0) +
              optionCards.filter((x) => x.deployed).length,
          };
        }
        setSummary(mergedSummary);
        if (uidBff) {
          const { data: devRows, error: devErr } = await supabase
            .from("strategy_development_requests")
            .select("id,strategy_name,status,eta,created_at")
            .eq("user_id", uidBff)
            .order("created_at", { ascending: false })
            .limit(24);
          if (!devErr && devRows) {
            setStrategyDevRequests(
              devRows.map((r) => ({
                id: String(r.id),
                name: String(r.strategy_name ?? "Request"),
                status: String(r.status ?? "submitted").toLowerCase(),
                submitted: String(r.created_at ?? "").slice(0, 10) || "—",
                eta: r.eta ? String(r.eta).slice(0, 10) : "—",
              })),
            );
          }
        }
        return;
      }
        const uid = user?.id;
        if (!uid) return;
        const [{ data: integ }, { data: trades }, { data: strats }, { data: pendingRows }, { data: optionsStrats }] = await Promise.all([
          supabase
            .from("user_trading_integration")
            .select("openalgo_api_key,openalgo_username,token_expires_at,broker")
            .eq("user_id", uid)
            .eq("is_active", true)
            .maybeSingle(),
          supabase
            .from("active_trades")
            .select(
              "id,symbol,action,status,entry_price,shares,current_pnl,strategy_type,strategy_id,is_paper_trade,entry_time,exit_time",
            )
            .eq("user_id", uid)
            .order("entry_time", { ascending: false })
            .limit(200),
          supabase
            .from("user_strategies")
            .select("id,name,description,is_active,risk_per_trade_pct,stop_loss_pct,take_profit_pct,symbols,position_config,is_intraday,trading_mode,start_time,end_time,squareoff_time,entry_conditions,exit_conditions,risk_config,chart_config,execution_days,paper_strategy_type,market_type,lifecycle_state,lifecycle_reason,lifecycle_updated_at,created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("pending_conditional_orders")
            .select("id,strategy_id,symbol,action,status,created_at,last_checked_at,error_message")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("options_strategies")
            .select("*")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);
        const gate = brokerSessionLiveFromIntegration(
          integ as {
            openalgo_api_key?: string | null;
            openalgo_username?: string | null;
            token_expires_at?: string | null;
          } | null,
        );
        let stratsData = (strats ?? []) as Record<string, unknown>[];
        if (!gate.live && stratsData.some((row) => Boolean(row.is_active))) {
          const pauseRes = await manageStrategyInvoke(session.access_token, { action: "pause_all" });
          const pauseErr = (pauseRes.data as { error?: string } | null)?.error;
          if (!pauseRes.error && !pauseErr) {
            const { data: stratsFresh } = await supabase
              .from("user_strategies")
              .select(
                "id,name,description,is_active,risk_per_trade_pct,stop_loss_pct,take_profit_pct,symbols,position_config,is_intraday,trading_mode,start_time,end_time,squareoff_time,entry_conditions,exit_conditions,risk_config,chart_config,execution_days,paper_strategy_type,market_type,lifecycle_state,lifecycle_reason,lifecycle_updated_at,created_at",
              )
              .eq("user_id", uid)
              .order("created_at", { ascending: false })
              .limit(50);
            stratsData = (stratsFresh ?? []) as Record<string, unknown>[];
          }
        }
        const broker_connected = gate.live;
        const nowMs = Date.now();
        const liveTrades = (trades ?? []).filter((t) => !Boolean(t.is_paper_trade)) as Record<string, unknown>[];
        const scopedLive = liveTrades.filter((t) => tradeInLiveScope(t, nowMs));
        const orders = gate.live
          ? scopedLive.slice(0, 20).map((t: Record<string, unknown>) => {
              const act = String(t.action || "BUY").toUpperCase();
              const ep = Number(t.entry_price || 0);
              const sh = Number(t.shares || 0);
              return {
                id: String(t.id),
                type: act === "BUY" ? "buy" : "sell",
                symbol: String(t.symbol || "—"),
                strategy: String(t.strategy_type || "ChartMate"),
                price: ep > 0 ? ep.toFixed(2) : "0",
                qty: sh > 0 ? String(sh) : "1",
                pnl: Number(t.current_pnl || 0),
                time: formatEntryTimeShort(t.entry_time),
              };
            })
          : [];
        const feed_paused = !gate.live;
        const equityCards = stratsData.map((s: Record<string, unknown>) => {
          const syms = (s.symbols as unknown[]) || [];
          const pairs = syms
            .map((x) => (typeof x === "string" ? x : (x as { symbol?: string })?.symbol || ""))
            .filter(Boolean)
            .join(", ");
          const tm = String(s.trading_mode ?? "LONG").toUpperCase();
          const pc = s.position_config;
          const lcState = normalizeLifecycleState(s.lifecycle_state, Boolean(s.is_active));
          return {
            id: String(s.id),
            name: String(s.name),
            type: tm,
            pairs: pairs || "—",
            timeframe: "5m",
            riskPerTrade: `${Number(s.risk_per_trade_pct ?? 1)}%`,
            stopLoss: `${Number(s.stop_loss_pct ?? 1)}%`,
            takeProfit: `${Number(s.take_profit_pct ?? 2)}%`,
            maxPositions: "3",
            deployed: Boolean(s.is_active),
            is_intraday: s.is_intraday !== false,
            position_config: pc && typeof pc === "object" ? (pc as Record<string, unknown>) : {},
            lifecycle_state: lcState,
            lifecycle_reason: typeof s.lifecycle_reason === "string" ? s.lifecycle_reason : null,
            lifecycle_updated_at: typeof s.lifecycle_updated_at === "string" ? s.lifecycle_updated_at : null,
            // Full raw row for AlgoStrategyBuilder edit mode
            _raw: s,
          };
        });
        const optionCards = mapOptionsStrategyCards(
          (optionsStrats ?? []) as Record<string, unknown>[],
        );
        const user_strategies = [...optionCards, ...equityCards];
        const openRows = liveTrades.filter((t: Record<string, unknown>) =>
          ["active", "monitoring", "exit_zone", "open"].includes(String(t.status || "").toLowerCase()),
        );
        const open_mtm = openRows.reduce((a: number, t: Record<string, unknown>) => a + Number(t.current_pnl || 0), 0);
        const portfolio_value = openRows.reduce(
          (a: number, t: Record<string, unknown>) => a + Number(t.entry_price || 0) * Number(t.shares || 0),
          0,
        );
        const allT = scopedLive;
        const cumulative_pnl = allT.reduce((a, t) => a + Number(t.current_pnl || 0), 0);
        const closed = allT.filter((t) =>
          ["closed", "exited", "completed", "squareoff", "square_off"].includes(String(t.status || "").toLowerCase()),
        );
        const win_rate_pct =
          closed.length >= 1
            ? Math.round(
                (100 * closed.filter((t) => Number(t.current_pnl || 0) > 0).length) / closed.length * 100,
              ) / 100
            : null;
        const pct_mtm =
          portfolio_value > 0 ? Math.round((100 * open_mtm) / portfolio_value) : null;
        const deployed =
          stratsData.filter((s: Record<string, unknown>) => s.is_active).length +
          optionCards.filter((s) => s.deployed).length;
        const pending_executions = (pendingRows ?? []).map((r: Record<string, unknown>) => ({
          id: String(r.id ?? ""),
          strategy_id: String(r.strategy_id ?? ""),
          symbol: String(r.symbol ?? ""),
          action: String(r.action ?? ""),
          status: String(r.status ?? "pending"),
          created_at: formatEntryTimeShort(r.created_at),
          last_checked_at: r.last_checked_at ? formatEntryTimeShort(r.last_checked_at) : null,
          error_message: r.error_message ? String(r.error_message) : null,
        }));
        const perf = computeTradeAnalytics(scopedLive, nowMs, LIVE_TRADE_LOOKBACK_DAYS);
        const today_pnl = open_mtm + perf.today_realized_pnl;
        setSummary({
          broker: String((integ as { broker?: unknown } | null)?.broker ?? "").trim().toLowerCase() || null,
          broker_connected,
          broker_credentials_configured: gate.hasCreds,
          broker_session_live: gate.live,
          token_expires_at: gate.tokenExpiresAt,
          portfolio_value: portfolio_value || 0,
          today_pnl,
          cumulative_pnl,
          win_rate_pct,
          open_positions_pct_mtm: pct_mtm,
          recent_orders_count: scopedLive.length,
          active_strategies_deployed: deployed,
          open_positions_count: openRows.length,
          orders,
          feed_paused,
          pending_executions,
          user_strategies,
          active_strategies_table: buildStrategyTableRows(
            stratsData,
            scopedLive,
            currencyMode,
          ),
          equity_curve: perf.equity_curve,
          sharpe_ratio: perf.sharpe_ratio,
          max_drawdown_pct: perf.max_drawdown_pct,
          avg_trade_duration_sec: perf.avg_trade_duration_sec ?? undefined,
        });
        const { data: devRows2, error: devErr2 } = await supabase
          .from("strategy_development_requests")
          .select("id,strategy_name,status,eta,created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(24);
        if (!devErr2 && devRows2) {
          setStrategyDevRequests(
            devRows2.map((r) => ({
              id: String(r.id),
              name: String(r.strategy_name ?? "Request"),
              status: String(r.status ?? "submitted").toLowerCase(),
              submitted: String(r.created_at ?? "").slice(0, 10) || "—",
              eta: r.eta ? String(r.eta).slice(0, 10) : "—",
            })),
          );
        }
    } catch (e: unknown) {
      setLoadErr(toUserFacingErrorMessage(e instanceof Error ? e.message : "Failed to load dashboard"));
    }
  }, [session?.access_token, user?.id, currencyMode]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const onConnectBroker = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadErr(null);
    setConnectBusy(true);
    try {
      const requestedBroker = String(summary?.broker ?? "").trim().toLowerCase();
      const broker = ["zerodha", "upstox", "fyers", "angel"].includes(requestedBroker)
        ? requestedBroker
        : "zerodha";
      await startZerodhaKiteConnect(broker);
    } catch (e: unknown) {
      setLoadErr(toUserFacingErrorMessage(e instanceof Error ? e.message : "Broker connect failed"));
      setConnectBusy(false);
    }
  }, [session?.access_token, summary?.broker]);

  const onCreateStrategy = useCallback(
    async (stratForm: Record<string, string>) => {
      if (!session?.access_token) return "Not signed in";
      const rawSyms = (stratForm.symbols_raw ?? stratForm.pairs ?? "").trim();
      const symbols = symbolsFromPairs(rawSyms || "RELIANCE");
      if (!symbols.length) return "Add at least one symbol (comma-separated, e.g. RELIANCE, TCS)";
      const risk = Number(stratForm.risk_per_trade_pct ?? stratForm.riskPerTrade);
      const sl = Number(stratForm.stop_loss_pct ?? stratForm.stopLoss);
      const tp = Number(stratForm.take_profit_pct ?? stratForm.takeProfit);
      if (!Number.isFinite(risk) || risk <= 0) return "Invalid risk %";
      if (!Number.isFinite(sl) || sl <= 0) return "Invalid stop loss %";
      if (!Number.isFinite(tp) || tp <= 0) return "Invalid take profit %";
      const trading_mode = (stratForm.trading_mode || "LONG").toUpperCase();
      const is_intraday = stratForm.is_intraday !== "false";
      const res = await manageStrategyInvoke(session.access_token, {
        action: "create",
        name: stratForm.name.trim(),
        description: (stratForm.description ?? "").trim() || "Created from TradingSmart algo-only",
        trading_mode,
        is_intraday,
        start_time: stratForm.start_time || "09:15",
        end_time: stratForm.end_time || "15:15",
        squareoff_time: stratForm.squareoff_time || "15:15",
        risk_per_trade_pct: risk,
        stop_loss_pct: sl,
        take_profit_pct: tp,
        symbols,
        paper_strategy_type: null,
        market_type: "stocks",
        entry_conditions: {
          rawExpression: (stratForm.entry_rule ?? "").trim() || "true",
        },
        exit_conditions: {
          rawExpression: (stratForm.exit_rule ?? "").trim() || "",
          autoExitEnabled: true,
        },
      });
      const err = (res.data as { error?: string; error_code?: string } | null)?.error;
      if (res.error) return res.error.message;
      if (err) return err;
      return null;
    },
    [session?.access_token],
  );

  /** ChartMate flow: update symbol/qty/product then toggle on — requires live broker session. */
  const { lastFrame: positionsWsFrame } = useOptionsPositionsStream({
    enabled: Boolean(summary?.broker_session_live && session?.access_token),
    userId: user?.id,
    token: session?.access_token,
  });

  useEffect(() => {
    if (positionsWsFrame) void refresh();
  }, [positionsWsFrame, refresh]);

  const onConfirmGoLive = useCallback(
    async (
      strategyId: string,
      positionConfigBase: Record<string, unknown> | undefined,
      payload: {
        symbol: string;
        exchange: string;
        quantity: number;
        product: string;
        remember_symbol?: boolean;
      },
      strategyMeta?: {
        deployed?: boolean;
        is_options?: boolean;
        raw?: Record<string, unknown> | null;
      },
    ) => {
      if (!session?.access_token) return "Not signed in";
      if (!summary?.broker_session_live) {
        return "Connect your broker (live session) before activating a strategy.";
      }
      const sym = payload.symbol.trim().toUpperCase();
      const qty = Math.floor(Number(payload.quantity));
      const ex = payload.exchange.trim().toUpperCase() || "NSE";
      const product = payload.product.trim().toUpperCase() || "MIS";
      const rememberSymbol = Boolean(payload.remember_symbol);
      if (!sym) return "Enter a trading symbol";
      if (!Number.isFinite(qty) || qty < 1) return "Quantity must be at least 1";
      if (bffConfigured()) {
        try {
          const pf = await bffFetch<{
            can_execute: boolean;
            reason?: string | null;
            available_cash?: number | null;
            required_notional?: number | null;
            quote_ltp?: number | null;
          }>(
            `/api/account/preflight?strategy_id=${encodeURIComponent(strategyId)}&symbol=${encodeURIComponent(sym)}&exchange=${encodeURIComponent(ex)}&quantity=${encodeURIComponent(String(qty))}&product=${encodeURIComponent(product)}`,
          );
          if (!pf.can_execute) {
            const reason = pf.reason ?? "Preflight blocked activation.";
            if (!isMarketClosedReason(reason)) return reason;
          }
          if (
            Number.isFinite(Number(pf.available_cash)) &&
            Number.isFinite(Number(pf.required_notional)) &&
            Number(pf.available_cash) < Number(pf.required_notional)
          ) {
            return `Insufficient funds: ₹${Number(pf.available_cash).toLocaleString("en-IN", { maximumFractionDigits: 2 })} available, but ~₹${Number(pf.required_notional).toLocaleString("en-IN", { maximumFractionDigits: 2 })} required for ${sym} × ${qty}.`;
          }
        } catch (e: unknown) {
          return e instanceof Error ? e.message : "Preflight request failed";
        }
      }
      const symbolsPayload = [{ symbol: sym, exchange: ex, quantity: qty, product_type: product }];
      const prevPc = positionConfigBase && typeof positionConfigBase === "object" ? { ...positionConfigBase } : {};
      delete (prevPc as Record<string, unknown>).activation_defaults;
      const position_config = {
        ...prevPc,
        quantity: qty,
        exchange: ex,
        orderProduct: product,
        ...(rememberSymbol
          ? {
              activation_defaults: {
                symbol: sym,
                exchange: ex,
                quantity: qty,
                product,
              },
            }
          : {}),
      };
      const fnBodyError = (data: unknown): string | null => {
        if (!data || typeof data !== "object") return null;
        const row = data as { error?: unknown; message?: unknown };
        if (typeof row.error === "string" && row.error.trim()) return row.error.trim();
        if (typeof row.message === "string" && row.message.trim()) return row.message.trim();
        return null;
      };

      const isOptions = Boolean(strategyMeta?.is_options);
      const isAlreadyLive = Boolean(strategyMeta?.deployed);

      if (isOptions) {
        const uid = session?.user?.id;
        if (!uid) return "Not signed in";
        const baseRaw = strategyMeta?.raw;
        let source: Record<string, unknown> | null =
          baseRaw && typeof baseRaw === "object" ? { ...baseRaw } : null;
        if (!source) {
          const { data: row, error } = await supabase
            .from("options_strategies")
            .select("*")
            .eq("id", strategyId)
            .eq("user_id", uid)
            .maybeSingle();
          if (error) return error.message;
          source = row ? ({ ...row } as Record<string, unknown>) : null;
        }
        if (!source) return "Options strategy not found.";
        const clone: Record<string, unknown> = { ...source };
        delete clone.id;
        delete clone.created_at;
        delete clone.updated_at;
        delete clone.lifecycle_state;
        delete clone.lifecycle_reason;
        delete clone.lifecycle_updated_at;
        clone.user_id = uid;
        clone.is_active = true;
        clone.underlying = sym;
        clone.exchange = ex;
        const { error: insErr } = await supabase
          .from("options_strategies")
          .insert(clone);
        if (insErr) return insErr.message;
        return null;
      }

      if (isAlreadyLive) {
        const uid = session?.user?.id;
        if (!uid) return "Not signed in";
        const baseRaw = strategyMeta?.raw;
        let source: Record<string, unknown> | null =
          baseRaw && typeof baseRaw === "object" ? { ...baseRaw } : null;
        if (!source) {
          const { data: row, error } = await supabase
            .from("user_strategies")
            .select("*")
            .eq("id", strategyId)
            .eq("user_id", uid)
            .maybeSingle();
          if (error) return error.message;
          source = row ? ({ ...row } as Record<string, unknown>) : null;
        }
        if (!source) return "Strategy not found.";
        const clone: Record<string, unknown> = { ...source };
        delete clone.id;
        delete clone.created_at;
        delete clone.updated_at;
        delete clone.lifecycle_state;
        delete clone.lifecycle_reason;
        delete clone.lifecycle_updated_at;
        clone.user_id = uid;
        clone.is_active = true;
        clone.symbols = symbolsPayload;
        clone.position_config = position_config;
        const { error: insErr } = await supabase
          .from("user_strategies")
          .insert(clone);
        if (insErr) return insErr.message;
        return null;
      }

      try {
        const up = await manageStrategyInvoke(session.access_token, {
          action: "update",
          strategy_id: strategyId,
          symbols: symbolsPayload,
          position_config,
        });
        const upMsg = fnBodyError(up.data);
        const updateErr = upMsg ?? up.error?.message ?? null;
        if (updateErr && /strategy_live_locked/i.test(updateErr)) {
          const uid = session?.user?.id;
          if (!uid) return "Not signed in";
          const source =
            strategyMeta?.raw && typeof strategyMeta.raw === "object"
              ? ({ ...strategyMeta.raw } as Record<string, unknown>)
              : null;
          if (!source) return updateErr;
          const clone: Record<string, unknown> = { ...source };
          delete clone.id;
          delete clone.created_at;
          delete clone.updated_at;
          delete clone.lifecycle_state;
          delete clone.lifecycle_reason;
          delete clone.lifecycle_updated_at;
          clone.user_id = uid;
          clone.is_active = true;
          clone.symbols = symbolsPayload;
          clone.position_config = position_config;
          const { error: insErr } = await supabase
            .from("user_strategies")
            .insert(clone);
          if (insErr) return insErr.message;
          return null;
        }
        if (updateErr) return updateErr ?? "manage-strategy update failed.";
        const tog = await manageStrategyInvoke(session.access_token, {
          action: "toggle",
          strategy_id: strategyId,
        });
        const togMsg = fnBodyError(tog.data);
        if (tog.error) return togMsg ?? tog.error.message ?? "manage-strategy toggle failed.";
        if (togMsg) return togMsg;
        return null;
      } catch (e: unknown) {
        return e instanceof Error ? e.message : "Network or server error while activating.";
      }
    },
    [session?.access_token, session?.user?.id, summary?.broker_session_live],
  );

  const onClearActivationDefaults = useCallback(
    async (
      strategyId: string,
      positionConfigBase: Record<string, unknown> | undefined,
    ): Promise<string | null> => {
      if (!session?.access_token) return "Not signed in";
      const prevPc = positionConfigBase && typeof positionConfigBase === "object" ? { ...positionConfigBase } : {};
      delete (prevPc as Record<string, unknown>).activation_defaults;
      const up = await manageStrategyInvoke(session.access_token, {
        action: "update",
        strategy_id: strategyId,
        position_config: prevPc,
      });
      const upMsg = (up.data as { error?: string; message?: string } | null)?.error
        ?? (up.data as { error?: string; message?: string } | null)?.message
        ?? null;
      if (up.error) return upMsg ?? up.error.message ?? "Could not clear saved activation defaults.";
      if (upMsg) return upMsg;
      await refresh();
      return null;
    },
    [session?.access_token, refresh],
  );

  const onToggleDeploy = useCallback(
    async (strategyId: string, deploying: boolean) => {
      if (!session?.access_token) return "Not signed in";
      if (deploying) {
        return "Use Activate strategy in the popup to set symbol and quantity.";
      }
      const res = await manageStrategyInvoke(session.access_token, {
        action: "toggle",
        strategy_id: strategyId,
      });
      const err = (res.data as { error?: string } | null)?.error;
      if (res.error) return res.error.message;
      if (err) return err;
      return null;
    },
    [session?.access_token],
  );

  const onDeleteStrategy = useCallback(
    async (strategyId: string, _name: string) => {
      if (!session?.access_token) return "Not signed in";
      const res = await manageStrategyInvoke(session.access_token, {
        action: "delete",
        strategy_id: strategyId,
      });
      const err = (res.data as { error?: string } | null)?.error;
      if (res.error) return res.error.message;
      if (err) return err;
      return null;
    },
    [session?.access_token],
  );

  const onActivateOptionsStrategy = useCallback(
    async (strategyId: string): Promise<string | null> => {
      const uid = session?.user?.id;
      if (!uid) return "Not signed in";
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("options_strategies")
        .update({
          is_active: true,
          lifecycle_state: "ACTIVE",
          lifecycle_updated_at: now,
        })
        .eq("id", strategyId)
        .eq("user_id", uid);
      if (error) return error.message;
      await refresh();
      return null;
    },
    [session?.user?.id, refresh],
  );

  const onPauseOptionsStrategy = useCallback(
    async (strategyId: string): Promise<string | null> => {
      const uid = session?.user?.id;
      if (!uid) return "Not signed in";
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("options_strategies")
        .update({
          is_active: false,
          lifecycle_state: "PAUSED",
          lifecycle_updated_at: now,
        })
        .eq("id", strategyId)
        .eq("user_id", uid);
      if (error) return error.message;
      await refresh();
      return null;
    },
    [session?.user?.id, refresh],
  );

  const onDeleteOptionsStrategy = useCallback(
    async (strategyId: string): Promise<string | null> => {
      const uid = session?.user?.id;
      if (!uid) return "Not signed in";
      const { error } = await supabase
        .from("options_strategies")
        .delete()
        .eq("id", strategyId)
        .eq("user_id", uid);
      if (error) return error.message;
      await refresh();
      return null;
    },
    [session?.user?.id, refresh],
  );

  const onCancelPendingForStrategy = useCallback(
    async (strategyId: string): Promise<string | null> => {
      const uid = session?.user?.id;
      if (!uid) return "Not signed in";
      const { data, error } = await supabase
        .from("pending_conditional_orders")
        .update({
          status: "cancelled",
          error_message: "Cancelled from algo dashboard",
        })
        .select("id")
        .eq("strategy_id", strategyId)
        .eq("user_id", uid)
        .in("status", ["pending", "scheduled"]);
      if (error) return error.message;
      if (!Array.isArray(data) || data.length === 0) {
        return "No pending conditional orders found for this strategy.";
      }
      void refresh();
      return null;
    },
    [session?.user?.id, refresh],
  );

  const onPauseAllStrategies = useCallback(async (): Promise<string | null> => {
    if (!session?.access_token) return "Not signed in";
    const res = await manageStrategyInvoke(session.access_token, { action: "pause_all" });
    const msg = (res.data as { error?: string } | null)?.error;
    if (res.error) return res.error.message;
    if (msg) return msg;
    const uid = session?.user?.id;
    if (uid) {
      await supabase
        .from("options_strategies")
        .update({ is_active: false })
        .eq("user_id", uid)
        .eq("is_active", true);
    }
    await refresh();
    return null;
  }, [session?.access_token, session?.user?.id, refresh]);

  const onEmergencyKill = useCallback(async (): Promise<string | null> => {
    if (!session?.access_token) return "Not signed in";
    const pauseRes = await manageStrategyInvoke(session.access_token, { action: "pause_all" });
    const pauseErr = (pauseRes.data as { error?: string } | null)?.error;
    if (pauseRes.error) return pauseRes.error.message;
    if (pauseErr) return pauseErr;
    const uid = session?.user?.id;
    if (uid) {
      await supabase
        .from("options_strategies")
        .update({ is_active: false })
        .eq("user_id", uid)
        .eq("is_active", true);
    }
    await supabase.functions.invoke("broker-order-action", {
      body: { action: "cancel_all" },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await refresh();
    return null;
  }, [session?.access_token, session?.user?.id, refresh]);

  const onSubmitStrategyDevRequest = useCallback(
    async (payload: {
      strategy_name: string;
      description: string;
      market: string;
      priority: string;
      contact_email: string;
      file: File | null;
    }): Promise<string | null> => {
      if (!session?.access_token || !user?.id) return "Not signed in";
      let document_object_path: string | null = null;
      if (payload.file) {
        const safe = payload.file.name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
        const objectPath = `${user.id}/${Date.now()}_${safe}`;
        const up = await supabase.storage
          .from("strategy-dev-docs")
          .upload(objectPath, payload.file, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (up.error) return up.error.message;
        document_object_path = objectPath;
      }
      const res = await supabase.functions.invoke("submit-strategy-dev-request", {
        body: {
          strategy_name: payload.strategy_name,
          description: payload.description || null,
          market: payload.market || null,
          priority: payload.priority,
          contact_email: payload.contact_email || null,
          document_object_path,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const msg = (res.data as { error?: string } | null)?.error;
      if (res.error) return res.error.message;
      if (msg) return msg;
      await refresh();
      return null;
    },
    [session?.access_token, user?.id, refresh],
  );

  const onOptionsExecuteBody = useCallback(
    async (body: { strategy_type: string; params: Record<string, unknown> }) => {
      if (!session?.access_token) return;
      if (!summary?.broker_session_live) {
        setOptMsg("Connect your broker (live session) before running options.");
        return;
      }
      if (bffConfigured()) {
        try {
          const pf = await bffFetch<{ can_execute: boolean; reason?: string | null }>(
            "/api/account/preflight",
          );
          if (!pf.can_execute) {
            setOptMsg(pf.reason ?? "Preflight blocked options execution.");
            return;
          }
        } catch (e: unknown) {
          setOptMsg(e instanceof Error ? e.message : "Preflight failed");
          return;
        }
      }
      setOptBusy(true);
      setOptMsg(null);
      try {
        if (bffConfigured()) {
          const q = new URLSearchParams({ is_paper: "false" });
          const bff = (import.meta.env.VITE_ALGO_ONLY_BFF_URL ?? "").replace(/\/$/, "");
          const res = await fetch(`${bff}/api/options/strategies/execute?${q}`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setOptMsg(typeof data.error === "string" ? data.error : JSON.stringify(data.detail ?? data));
            return;
          }
          setOptMsg(data.executed === false ? (data.reason ?? "No signal") : "Live execute completed (check active_trades).");
        } else {
          const optBase = (import.meta.env.VITE_OPTIONS_API_URL ?? "").replace(/\/$/, "");
          if (!optBase) {
            setOptMsg("Set VITE_ALGO_ONLY_BFF_URL or VITE_OPTIONS_API_URL for options execute.");
            return;
          }
          const res = await fetch(`${optBase}/api/options/strategies/execute?is_paper=false`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setOptMsg(typeof data.detail === "string" ? data.detail : JSON.stringify(data));
            return;
          }
          setOptMsg(data.executed === false ? (data.reason ?? "No signal") : "Live execute completed.");
        }
        void refresh();
      } catch (e: unknown) {
        setOptMsg(e instanceof Error ? e.message : "Options request failed");
      } finally {
        setOptBusy(false);
      }
    },
    [session?.access_token, summary?.broker_session_live, refresh],
  );

  const chartmateActions = useMemo(
    () => ({
      onConnectBroker,
      connectBusy,
      onRefresh: refresh,
      onCreateStrategy,
      onToggleDeploy,
      onConfirmGoLive,
      onClearActivationDefaults,
      onDeleteStrategy,
      onActivateOptionsStrategy,
      onPauseOptionsStrategy,
      onDeleteOptionsStrategy,
    }),
    [
      onConnectBroker,
      connectBusy,
      refresh,
      onCreateStrategy,
      onToggleDeploy,
      onConfirmGoLive,
      onClearActivationDefaults,
      onDeleteStrategy,
      onActivateOptionsStrategy,
      onPauseOptionsStrategy,
      onDeleteOptionsStrategy,
    ],
  );

  const optionsPanel = useMemo(
    () => ({
      onExecuteBody: onOptionsExecuteBody,
      busy: optBusy,
      message: optMsg,
      locked: !summary?.broker_session_live,
    }),
    [onOptionsExecuteBody, optBusy, optMsg, summary?.broker_session_live],
  );

  if (loading || !session) {
    return (
      <div style={{ minHeight: "100vh", background: "#06080d", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {loadErr && (
        <div style={{ position: "fixed", top: 8, right: 8, left: 8, zIndex: 200, background: "rgba(127,29,29,0.9)", color: "#fecaca", padding: "8px 12px", borderRadius: 8, fontSize: 12, maxWidth: 560, marginLeft: "auto" }}>
          {loadErr}
        </div>
      )}
      <TradingSmartDashboard
        useChartmate={useChartmate}
        brokerConnected={summary?.broker_connected ?? null}
        positionsStreamStale={Boolean(positionsWsFrame?.stale)}
        optionsPositionsFrame={positionsWsFrame}
        summary={summary}
        orderFeed={summary?.orders ?? null}
        strategyCards={summary?.user_strategies ?? null}
        strategiesTable={summary?.active_strategies_table ?? null}
        chartmateActions={chartmateActions}
        currencyMode={currencyMode}
        setCurrencyMode={null}
        optionsPanel={import.meta.env.VITE_OPTIONS_API_URL || bffConfigured() ? optionsPanel : null}
        onSignOut={() => void signOut()}
        userName={userProfile?.full_name || null}
        sessionAccessToken={session.access_token ?? null}
        onCancelPendingForStrategy={onCancelPendingForStrategy}
        strategyDevRequests={strategyDevRequests}
        onSubmitStrategyDevRequest={onSubmitStrategyDevRequest}
        onPauseAllStrategies={onPauseAllStrategies}
        onEmergencyKill={onEmergencyKill}
      />
    </div>
  );
}
