import { useCallback, useEffect, useMemo, useState } from "react";
import TradingSmartDashboard from "../components/TradingSmartDashboard.jsx";
import { useAuth } from "@/hooks/useAuth";
import { bffConfigured, bffFetch } from "@/lib/api";
import { isMarketClosedReason, normalizeLifecycleState } from "../lib/lifecycle";
import { useOptionsPositionsStream } from "../hooks/useRealtimeStrategy";
import { supabase } from "@/lib/supabase";
import { startZerodhaKiteConnect } from "@/lib/zerodhaOAuth";
import { computeTradeAnalytics } from "../lib/tradePerformance";

type Summary = {
  configured?: boolean;
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
  }>;
  active_strategies_table?: Array<{
    name: string;
    status: string;
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
  if (!tokenExpiresAt) return { live: true, hasCreds: true, tokenExpiresAt: null };
  const exp = new Date(tokenExpiresAt);
  if (Number.isNaN(exp.getTime())) return { live: true, hasCreds: true, tokenExpiresAt };
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
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
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

function normalizeSymbolRow(row: unknown): { symbol: string; exchange: string; quantity: number; product_type: string } | null {
  if (!row) return null;
  if (typeof row === "string") {
    const sym = row.trim().toUpperCase();
    if (!sym) return null;
    return { symbol: sym, exchange: "NSE", quantity: 1, product_type: "MIS" };
  }
  if (typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const symbol = String(r.symbol ?? "").trim().toUpperCase();
  if (!symbol) return null;
  const exchange = String(r.exchange ?? "NSE").trim().toUpperCase() || "NSE";
  const q = Math.max(1, Math.floor(Number(r.quantity ?? 1) || 1));
  const product = String(r.product_type ?? "MIS").trim().toUpperCase() || "MIS";
  return { symbol, exchange, quantity: q, product_type: product };
}

export default function DashboardPage() {
  const { user, session, loading, signOut } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [strategyDevRequests, setStrategyDevRequests] = useState<StrategyDevRequestCard[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  // INR-only mode for now.
  const currencyMode: "INR" = "INR";
  const [optBusy, setOptBusy] = useState(false);
  const [optMsg, setOptMsg] = useState<string | null>(null);

  const useChartmate = Boolean(session?.access_token);

  const refresh = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadErr(null);
    try {
      if (bffConfigured()) {
        const s = await bffFetch<Summary>("/api/dashboard/summary", session.access_token);
        setSummary(s);
        const uidBff = user?.id;
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
        const [{ data: integ }, { data: trades }, { data: strats }, { data: pendingRows }] = await Promise.all([
          supabase
            .from("user_trading_integration")
            .select("openalgo_api_key,openalgo_username,token_expires_at")
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
        ]);
        const gate = brokerSessionLiveFromIntegration(
          integ as {
            openalgo_api_key?: string | null;
            openalgo_username?: string | null;
            token_expires_at?: string | null;
          } | null,
        );
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
        const user_strategies = (strats ?? []).map((s: Record<string, unknown>) => {
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
        const deployed = (strats ?? []).filter((s: Record<string, unknown>) => s.is_active).length;
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
            (strats ?? []) as Record<string, unknown>[],
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
      setLoadErr(e instanceof Error ? e.message : "Failed to load dashboard");
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
      await startZerodhaKiteConnect();
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Broker connect failed");
      setConnectBusy(false);
    }
  }, [session?.access_token]);

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
      const res = await supabase.functions.invoke("manage-strategy", {
        body: {
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
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
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
      payload: { symbol: string; exchange: string; quantity: number; product: string },
    ) => {
      if (!session?.access_token) return "Not signed in";
      if (!summary?.broker_session_live) {
        return "Connect your broker (live session) before activating a strategy.";
      }
      if (bffConfigured()) {
        try {
          const pf = await bffFetch<{
            can_execute: boolean;
            reason?: string | null;
          }>(`/api/account/preflight?strategy_id=${encodeURIComponent(strategyId)}`, session.access_token);
          if (!pf.can_execute) {
            const reason = pf.reason ?? "Preflight blocked activation.";
            if (!isMarketClosedReason(reason)) return reason;
          }
        } catch (e: unknown) {
          return e instanceof Error ? e.message : "Preflight request failed";
        }
      }
      const sym = payload.symbol.trim().toUpperCase();
      const qty = Math.floor(Number(payload.quantity));
      const ex = payload.exchange.trim().toUpperCase() || "NSE";
      const product = payload.product.trim().toUpperCase() || "MIS";
      if (!sym) return "Enter a trading symbol";
      if (!Number.isFinite(qty) || qty < 1) return "Quantity must be at least 1";
      let symbolsPayload = [{ symbol: sym, exchange: ex, quantity: qty, product_type: product }];
      try {
        const { data: existing } = await supabase
          .from("user_strategies")
          .select("symbols")
          .eq("id", strategyId)
          .maybeSingle();
        const existingRows = Array.isArray((existing as { symbols?: unknown[] } | null)?.symbols)
          ? ((existing as { symbols?: unknown[] }).symbols ?? [])
              .map((x) => normalizeSymbolRow(x))
              .filter((x): x is { symbol: string; exchange: string; quantity: number; product_type: string } => Boolean(x))
          : [];
        const merged = new Map<string, { symbol: string; exchange: string; quantity: number; product_type: string }>();
        for (const r of existingRows) {
          merged.set(`${r.symbol}:${r.exchange}`, r);
        }
        merged.set(`${sym}:${ex}`, { symbol: sym, exchange: ex, quantity: qty, product_type: product });
        symbolsPayload = Array.from(merged.values());
      } catch {
        // Keep single-row payload fallback if read fails.
      }
      const prevPc = positionConfigBase && typeof positionConfigBase === "object" ? positionConfigBase : {};
      const position_config = {
        ...prevPc,
        quantity: qty,
        exchange: ex,
        orderProduct: product,
      };
      const fnBodyError = (data: unknown): string | null => {
        if (!data || typeof data !== "object") return null;
        const row = data as { error?: unknown; message?: unknown };
        if (typeof row.error === "string" && row.error.trim()) return row.error.trim();
        if (typeof row.message === "string" && row.message.trim()) return row.message.trim();
        return null;
      };
      try {
        const up = await supabase.functions.invoke("manage-strategy", {
          body: {
            action: "update",
            strategy_id: strategyId,
            symbols: symbolsPayload,
            position_config,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const upMsg = fnBodyError(up.data);
        if (up.error) return upMsg ?? up.error.message ?? "manage-strategy update failed.";
        if (upMsg) return upMsg;
        const tog = await supabase.functions.invoke("manage-strategy", {
          body: { action: "toggle", strategy_id: strategyId },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const togMsg = fnBodyError(tog.data);
        if (tog.error) return togMsg ?? tog.error.message ?? "manage-strategy toggle failed.";
        if (togMsg) return togMsg;
        return null;
      } catch (e: unknown) {
        return e instanceof Error ? e.message : "Network or server error while activating.";
      }
    },
    [session?.access_token, summary?.broker_session_live],
  );

  const onToggleDeploy = useCallback(
    async (strategyId: string, deploying: boolean) => {
      if (!session?.access_token) return "Not signed in";
      if (deploying) {
        return "Use Activate strategy in the popup to set symbol and quantity.";
      }
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "toggle", strategy_id: strategyId },
        headers: { Authorization: `Bearer ${session.access_token}` },
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
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "delete", strategy_id: strategyId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const err = (res.data as { error?: string } | null)?.error;
      if (res.error) return res.error.message;
      if (err) return err;
      return null;
    },
    [session?.access_token],
  );

  const onCancelPendingForStrategy = useCallback(
    async (strategyId: string): Promise<string | null> => {
      const uid = session?.user?.id;
      if (!uid) return "Not signed in";
      const { error } = await supabase
        .from("pending_conditional_orders")
        .update({
          status: "cancelled",
          error_message: "Cancelled from algo dashboard",
        })
        .eq("strategy_id", strategyId)
        .eq("user_id", uid)
        .in("status", ["pending", "scheduled"]);
      if (error) return error.message;
      void refresh();
      return null;
    },
    [session?.user?.id, refresh],
  );

  const onPauseAllStrategies = useCallback(async (): Promise<string | null> => {
    if (!session?.access_token) return "Not signed in";
    const res = await supabase.functions.invoke("manage-strategy", {
      body: { action: "pause_all" },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const msg = (res.data as { error?: string } | null)?.error;
    if (res.error) return res.error.message;
    if (msg) return msg;
    await refresh();
    return null;
  }, [session?.access_token, refresh]);

  const onEmergencyKill = useCallback(async (): Promise<string | null> => {
    if (!session?.access_token) return "Not signed in";
    const pauseRes = await supabase.functions.invoke("manage-strategy", {
      body: { action: "pause_all" },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const pauseErr = (pauseRes.data as { error?: string } | null)?.error;
    if (pauseRes.error) return pauseRes.error.message;
    if (pauseErr) return pauseErr;
    await supabase.functions.invoke("broker-order-action", {
      body: { action: "cancel_all" },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await refresh();
    return null;
  }, [session?.access_token, refresh]);

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
            session.access_token,
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
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
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
      onDeleteStrategy,
    }),
    [onConnectBroker, connectBusy, refresh, onCreateStrategy, onToggleDeploy, onConfirmGoLive, onDeleteStrategy],
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
