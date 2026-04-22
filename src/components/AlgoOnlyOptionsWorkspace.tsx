/**
 * AlgoOnlyOptionsWorkspace — identical logic to ChartMate's OptionsStrategiesWorkspace
 * but with algo-only customisations:
 *  - No Paper Trade / Backtest / Execute Now buttons (live-only mode)
 *  - Activate Live is gated by broker session; shows toast if not connected
 *  - UI styled to match algo-only dark theme (still uses Tailwind/Radix components)
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BarChart2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pause,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Zap,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { bffConfigured, bffFetch } from "@/lib/api";
import type { OptionsPositionsFrame } from "@/hooks/useRealtimeStrategy";
import { StrategyLiveChart } from "./StrategyLiveChart";
import { OptionsLegsTable } from "./OptionsLegsTable";
import {
  isMarketClosedReason,
  lifecycleBadgeClass,
  lifecycleLabel,
  normalizeLifecycleState,
} from "../lib/lifecycle";
import { StrategyConditionPanel } from "./StrategyConditionPanel";
import { OptionsStrategyBuilderDialog } from "@/components/options/OptionsStrategyBuilderDialog";
import { OptionsStrategyActivateDialog } from "@/components/options/OptionsStrategyActivateDialog";
import { OptionChainViewer } from "@/components/options/OptionChainViewer";
import {
  fetchExpiryDates,
  executeStrategy,
  instrumentTypeForUnderlying,
  isOptionsApiConfigured,
  lotUnitsForUnderlying,
  type StrategyType,
  type NormalizedExpiryItem,
} from "@/lib/optionsApi";
import {
  getTradingIntegration,
  isBrokerSessionLive,
  BROKER_SESSION_UPDATED_EVENT,
} from "@/services/openalgoIntegrationService";
import type { OptionsStrategy } from "@/pages/OptionsStrategyPage";

// ── helpers (same as widget) ────────────────────────────────────────────────

function styleLabel(style: string): string {
  const map: Record<string, string> = {
    buying: "Buying", selling: "Selling", spread: "Spread",
    straddle: "Straddle", strangle: "Strangle", iron_condor: "Iron Condor",
  };
  return map[style] ?? style;
}

function resolveStrategyType(s: OptionsStrategy): StrategyType | null {
  const ec = (s.entry_conditions ?? {}) as Record<string, unknown>;
  const explicit = String(ec.strategy_type ?? "").toLowerCase();
  if (["iron_condor","strangle","bull_put_spread","jade_lizard","orb_buying"].includes(explicit)) return explicit as StrategyType;
  if (s.strategy_style === "iron_condor") return "iron_condor";
  if (s.strategy_style === "strangle") return "strangle";
  return "orb_buying";
}

function buildExecuteParams(s: OptionsStrategy): Record<string, unknown> {
  const ec = (s.entry_conditions ?? {}) as Record<string, unknown>;
  const er = (s.exit_rules ?? {}) as Record<string, unknown>;
  const rc = (s.risk_config ?? {}) as Record<string, unknown>;
  const lots = Math.max(1, Number(rc.lot_size ?? 1));
  const lotUnits = lotUnitsForUnderlying(s.underlying);
  const explicitExpiry = typeof rc.explicit_expiry_iso === "string" ? rc.explicit_expiry_iso : undefined;
  const common = {
    underlying: s.underlying, exchange: "NSE_INDEX",
    expiry_date: explicitExpiry || undefined,
    lots, lot_size: lotUnits, capital: Number(rc.capital ?? 500000),
    risk_pct: Number(ec.risk_pct ?? 0.02),
  };
  const st = resolveStrategyType(s);
  if (st === "iron_condor") return { ...common, wing_width_pts: Number(ec.wing_width_pts ?? 200), delta_target: Number(ec.delta_target ?? 0.16), min_vix: Number(ec.min_vix ?? 13), min_net_premium: Number(ec.min_net_premium ?? 35), profit_target_pct: Number(er.profit_target_pct ?? 45) / 100, stop_loss_mult: Number(er.stop_loss_mult ?? 2) };
  if (st === "strangle") return { ...common, delta_target: Number(ec.delta_target ?? 0.2), min_vix: Number(ec.min_vix ?? 18), min_net_premium: Number(ec.min_net_premium ?? 35), roll_trigger_pts: Number(ec.roll_trigger_pts ?? 30), max_adjustments: Number(ec.max_adjustments ?? 2), profit_target_pct: Number(er.profit_target_pct ?? 50) / 100, stop_loss_mult: Number(er.stop_loss_mult ?? 2) };
  const orb = (s.orb_config ?? {}) as Record<string, unknown>;
  return { underlying: s.underlying, exchange_underlying: "NSE", exchange_options: "NFO", expiry_type: s.expiry_type === "monthly" ? "monthly" : "weekly", strike_offset: s.strike_selection, lots, lot_size: lotUnits, orb_duration_mins: Number(orb.orb_duration_mins ?? 15), min_range_pct: Number(orb.min_range_pct ?? 0.2), max_range_pct: Number(orb.max_range_pct ?? 1.0), momentum_bars: Number(orb.momentum_bars ?? 3), trade_direction: s.trade_direction, expiry_day_guard: Boolean(ec.expiry_day_guard ?? true), sl_pct: Number(er.sl_pct ?? 30), tp_pct: Number(er.tp_pct ?? 50), trailing_enabled: Boolean(er.trailing_enabled ?? true), trail_after_pct: Number(er.trail_after_pct ?? 30), trail_pct: Number(er.trail_pct ?? 15), time_exit_hhmm: String(er.time_exit_hhmm ?? "15:15"), max_reentry_count: Number(er.max_reentry_count ?? 1) };
}

function directionColor(dir: string): string {
  if (dir === "bullish") return "text-[var(--accent-green)]";
  if (dir === "bearish") return "text-[var(--accent-red)]";
  return "text-[var(--accent-orange)]";
}

function directionIcon(dir: string) {
  if (dir === "bullish")
    return <TrendingUp className="h-4 w-4 text-[var(--accent-green)]" />;
  if (dir === "bearish")
    return <TrendingDown className="h-4 w-4 text-[var(--accent-red)]" />;
  return <BarChart2 className="h-4 w-4 text-[var(--accent-orange)]" />;
}

/** OpenAlgo history for spot/indices uses cash exchange; quotes often use *_INDEX. */
function chartExchangesForStrategy(s: OptionsStrategy): { history: string; quote: string } {
  const ex = String(s.exchange || "NSE_INDEX").toUpperCase();
  if (ex === "NSE_INDEX") return { history: "NSE", quote: "NSE_INDEX" };
  if (ex === "BSE_INDEX") return { history: "BSE", quote: "BSE_INDEX" };
  if (ex === "NFO" || ex === "BFO") return { history: "NSE", quote: "NSE_INDEX" };
  return { history: ex || "NSE", quote: ex || "NSE_INDEX" };
}

export type AccountCaps = {
  activeOrders?: number;
  activeStrategies?: number;
  limits?: { orders: number; strategies: number };
  cash?: number | null;
};

// ── Component ────────────────────────────────────────────────────────────────

export function AlgoOnlyOptionsWorkspace(props?: {
  accountCaps?: AccountCaps;
  positionsStreamStale?: boolean;
  optionsPositionsFrame?: OptionsPositionsFrame | null;
}) {
  const workspaceThemeVars: CSSProperties = {
    ["--background" as string]: "222 45% 7%",
    ["--foreground" as string]: "210 40% 96%",
    ["--card" as string]: "221 39% 10%",
    ["--card-foreground" as string]: "210 40% 96%",
    ["--popover" as string]: "221 39% 10%",
    ["--popover-foreground" as string]: "210 40% 96%",
    ["--primary" as string]: "199 89% 60%",
    ["--primary-foreground" as string]: "222 47% 11%",
    ["--secondary" as string]: "221 28% 16%",
    ["--secondary-foreground" as string]: "210 40% 96%",
    ["--muted" as string]: "221 30% 15%",
    ["--muted-foreground" as string]: "215 20% 68%",
    ["--accent" as string]: "221 31% 17%",
    ["--accent-foreground" as string]: "210 40% 96%",
    ["--border" as string]: "199 45% 28%",
    ["--input" as string]: "221 28% 16%",
    ["--ring" as string]: "199 89% 60%",
  };

  const { accountCaps, positionsStreamStale = false, optionsPositionsFrame = null } = props ?? {};
  const { user, session } = useAuth();

  const [strategies, setStrategies] = useState<Array<OptionsStrategy & {
    lifecycle_state?: string | null;
    lifecycle_reason?: string | null;
    lifecycle_updated_at?: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editStrategy, setEditStrategy] = useState<OptionsStrategy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OptionsStrategy | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chainViewStrategy, setChainViewStrategy] = useState<OptionsStrategy | null>(null);
  const [activateTarget, setActivateTarget] = useState<OptionsStrategy | null>(null);

  const [prefetchedExpiries, setPrefetchedExpiries] = useState<Record<string, NormalizedExpiryItem[]>>({});
  const [brokerConnected, setBrokerConnected] = useState(false);
  const prefetchedRef = useRef<Set<string>>(new Set());

  const fetchStrategies = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("options_strategies")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load options strategies.");
    else setStrategies(data ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchStrategies(); }, [fetchStrategies]);

  const checkBroker = useCallback(async () => {
    const { data } = await getTradingIntegration();
    setBrokerConnected(isBrokerSessionLive(data));
  }, []);

  useEffect(() => { void checkBroker(); }, [checkBroker]);
  useEffect(() => {
    const onUpd = () => void checkBroker();
    window.addEventListener(BROKER_SESSION_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(BROKER_SESSION_UPDATED_EVENT, onUpd);
  }, [checkBroker]);

  useEffect(() => {
    if (!brokerConnected || !strategies.length) return;
    const uniqueKeys = [...new Set(strategies.map((s) => {
      const inst = instrumentTypeForUnderlying(s.underlying);
      return `${s.underlying}|${s.exchange}|${inst}`;
    }))];
    for (const key of uniqueKeys) {
      if (prefetchedRef.current.has(key)) continue;
      prefetchedRef.current.add(key);
      const [symbol, exchange, instrument] = key.split("|");
      fetchExpiryDates({ symbol, exchange, instrument })
        .then((d) => setPrefetchedExpiries((prev) => ({ ...prev, [symbol]: d.expiries })))
        .catch(() => { window.setTimeout(() => prefetchedRef.current.delete(key), 15000); });
    }
  }, [brokerConnected, strategies]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from("options_strategies").delete().eq("id", deleteTarget.id);
    if (error) toast.error("Failed to delete strategy.");
    else {
      toast.success(`"${deleteTarget.name}" deleted.`);
      setStrategies((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const handlePause = async (strategy: OptionsStrategy) => {
    const { error } = await (supabase as any).from("options_strategies").update({ is_active: false }).eq("id", strategy.id);
    if (error) toast.error("Failed to pause strategy.");
    else {
      setStrategies((prev) => prev.map((s) => s.id === strategy.id ? { ...s, is_active: false } : s));
      toast.success(`"${strategy.name}" paused.`);
    }
  };

  const handleExecuteNow = async (strategy: OptionsStrategy) => {
    if (!brokerConnected) {
      toast.error("Connect your broker (live session) before executing.");
      return;
    }
    const lo = accountCaps?.limits?.orders ?? 10;
    const ao = accountCaps?.activeOrders;
    if (typeof ao === "number" && ao >= lo) {
      toast.error(`Live order cap reached (${ao}/${lo}). Pause or close trades before new execution.`);
      return;
    }
    const ls = accountCaps?.limits?.strategies ?? 10;
    const ast = accountCaps?.activeStrategies;
    if (typeof ast === "number" && ast >= ls) {
      toast.error(`Active strategy cap reached (${ast}/${ls}).`);
      return;
    }
    if (bffConfigured() && session?.access_token) {
      try {
        const pf = await bffFetch<{ can_execute: boolean; reason?: string | null }>(
          `/api/account/preflight?strategy_id=${encodeURIComponent(strategy.id)}`,
          session.access_token,
        );
        if (!pf.can_execute) {
          toast.error(pf.reason ?? "Preflight blocked execution.");
          return;
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Preflight failed");
        return;
      }
    }
    if (!isOptionsApiConfigured()) {
      toast.error("Set VITE_OPTIONS_API_URL to execute options strategies.");
      return;
    }
    const st = resolveStrategyType(strategy);
    if (!st) { toast.error("Unsupported strategy type."); return; }
    try {
      const params = buildExecuteParams(strategy);
      const res = await executeStrategy(st, params, false, strategy.id) as Record<string, unknown>;
      if (res?.executed === false) { toast.info(String(res?.reason ?? "No trade signal at this moment.")); return; }
      toast.success(`Live execution sent: ${String((res?.signal as any)?.strategy ?? st)} · ${String((res?.order_result as any)?.status ?? "ok")}`);
      await fetchStrategies();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Execution failed");
    }
  };

  const openActivateLive = async (strategy: OptionsStrategy) => {
    if (!brokerConnected) {
      toast.error("Connect your broker (live session) before activating a live options strategy.", { description: "Click 'Connect broker' in the top nav bar to authenticate with your broker." });
      return;
    }
    const ls = accountCaps?.limits?.strategies ?? 10;
    const ast = accountCaps?.activeStrategies;
    if (typeof ast === "number" && ast >= ls) {
      toast.error(`Active strategy cap reached (${ast}/${ls}). Pause a strategy first.`);
      return;
    }
    if (bffConfigured() && session?.access_token) {
      try {
        const pf = await bffFetch<{ can_execute: boolean; reason?: string | null }>(
          `/api/account/preflight?strategy_id=${encodeURIComponent(strategy.id)}`,
          session.access_token,
        );
        if (!pf.can_execute) {
          const reason = pf.reason ?? "Preflight blocked activation.";
          if (!isMarketClosedReason(reason)) {
            toast.error(reason);
            return;
          }
          toast.info("Activation accepted. Strategy will wait for market open.");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Preflight failed");
        return;
      }
    }
    setActivateTarget(strategy);
  };

  const finalizeActivation = () => {
    setActivateTarget(null);
    fetchStrategies();
  };

  return (
    <div
      className="w-full overflow-x-hidden pb-2"
      style={workspaceThemeVars}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-[rgba(6,8,13,0.94)] backdrop-blur-sm">
        <div className="flex flex-col justify-between gap-4 px-3 py-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Options Strategies
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live F&amp;O execution — broker connection required.{" "}
              {!brokerConnected && (
                <span className="font-medium text-[var(--accent-orange)]">⚠ Broker not connected — connect via top nav to execute.</span>
              )}
            </p>
          </div>
          <div className="flex w-full flex-col items-start gap-1 text-left sm:w-auto sm:items-end sm:text-right">
            {accountCaps?.limits && (
              <div className="text-[10px] text-muted-foreground font-mono">
                Active{" "}
                <span className="text-foreground">
                  {typeof accountCaps.activeStrategies === "number" ? accountCaps.activeStrategies : "—"}/
                  {accountCaps.limits.strategies}
                </span>{" "}
                strategies · Live orders{" "}
                <span className="text-foreground">
                  {typeof accountCaps.activeOrders === "number" ? accountCaps.activeOrders : "—"}/
                  {accountCaps.limits.orders}
                </span>
                {typeof accountCaps.cash === "number" && Number.isFinite(accountCaps.cash) ? (
                  <> · Cash ₹{accountCaps.cash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</>
                ) : null}
              </div>
            )}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button variant="ghost" size="sm" onClick={fetchStrategies}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => { setEditStrategy(null); setShowBuilder(true); }}
            >
              <Plus className="h-4 w-4 mr-1" />New Strategy
            </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-3 sm:p-6">
        {/* Broker not connected warning */}
        {!brokerConnected && (
          <div className="flex items-center gap-3 rounded-lg border border-[rgba(251,146,60,0.35)] bg-[rgba(251,146,60,0.08)] px-4 py-3 text-sm text-[var(--accent-orange)]">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Broker session not live. Connect broker via the top nav bar to activate or execute options strategies. Viewing and editing strategies is always available.</span>
          </div>
        )}

        {/* Strategy list */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Your Strategies ({strategies.length})
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : strategies.length === 0 ? (
            <Card className="border-dashed border-[var(--border-color)] bg-[rgba(12,17,28,0.75)]">
              <CardContent className="py-16 text-center">
                <Zap className="mx-auto mb-4 h-10 w-10 text-[var(--text-muted)]/80" />
                <p className="text-muted-foreground font-medium">No options strategies yet.</p>
                <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                  Create your first strategy with ORB breakout, momentum, and options-specific exit rules.
                </p>
                <Button
                  onClick={() => setShowBuilder(true)}
                  className="bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(99,102,241,0.16))] text-[var(--accent-cyan)] border border-[rgba(56,189,248,0.35)] hover:bg-[linear-gradient(135deg,rgba(56,189,248,0.26),rgba(99,102,241,0.26))]"
                >
                  <Plus className="h-4 w-4 mr-1" />Create First Strategy
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {strategies.map((s) => {
                const chartEx = chartExchangesForStrategy(s);
                const lcState = normalizeLifecycleState(s.lifecycle_state, Boolean(s.is_active));
                const lcReason = String(s.lifecycle_reason ?? "").trim();
                const lcUpdated = String(s.lifecycle_updated_at ?? "").trim();
                const badgeTitle =
                  lcReason || lcUpdated
                    ? `${lcReason || "No reason"}${lcUpdated ? `\nUpdated: ${lcUpdated}` : ""}`
                    : undefined;
                return (
                <Card
                  key={s.id}
                  className={`transition-all bg-[rgba(12,17,28,0.75)] border-[var(--border-color)] ${s.is_active ? "border-[rgba(56,189,248,0.35)]" : "opacity-75"}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {directionIcon(s.trade_direction)}
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{s.name}</CardTitle>
                          <CardDescription className="text-xs">
                            {s.underlying} · {s.exchange} · {styleLabel(s.strategy_style)} ·{" "}
                            <span className={directionColor(s.trade_direction)}>{s.trade_direction}</span>
                          </CardDescription>
                          <div className="mt-2">
                            <StrategyConditionPanel
                              strategyId={s.id}
                              strategyName={s.name}
                              symbol={String(s.underlying || "").trim().toUpperCase()}
                              brokerLive={brokerConnected}
                              streamStale={positionsStreamStale}
                              lifecycleState={lcState}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${lifecycleBadgeClass(lcState)}`}
                          title={badgeTitle}
                        >
                          {lifecycleLabel(lcState)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {/* Quick stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <p className="text-muted-foreground/70">Strike</p>
                        <p className="font-semibold">{s.strike_selection}</p>
                      </div>
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <p className="text-muted-foreground/70">Expiry</p>
                        <p className="font-semibold capitalize">{s.expiry_type}</p>
                      </div>
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <p className="text-muted-foreground/70">SL %</p>
                        <p className="font-semibold text-[var(--accent-red)]">{(s.exit_rules as any)?.sl_pct ?? 30}%</p>
                      </div>
                      <div className="rounded bg-muted/40 px-2 py-1.5">
                        <p className="text-muted-foreground/70">TP %</p>
                        <p className="font-semibold text-[var(--accent-green)]">{(s.exit_rules as any)?.tp_pct ?? 50}%</p>
                      </div>
                    </div>

                    {/* Expandable details */}
                    {expandedId === s.id && (
                      <div className="space-y-2 mt-2 text-xs border-t border-border/50 pt-3">
                        {session?.access_token && bffConfigured() ? (
                          <div className="space-y-2">
                            <StrategyLiveChart
                              accessToken={session.access_token}
                              symbol={String(s.underlying || "").trim() || "NIFTY"}
                              historyExchange={chartEx.history}
                              quoteExchange={chartEx.quote}
                            />
                            <OptionsLegsTable
                              strategyId={s.id}
                              accessToken={session.access_token}
                              positionsFrame={optionsPositionsFrame}
                              streamStale={positionsStreamStale}
                            />
                          </div>
                        ) : null}
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                          <div className="flex justify-between"><span className="text-muted-foreground">ORB Duration</span><span>{(s.orb_config as any)?.orb_duration_mins ?? 15} min</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Momentum Bars</span><span>{(s.orb_config as any)?.momentum_bars ?? 3}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Time Exit</span><span>{(s.exit_rules as any)?.time_exit_hhmm ?? "15:15"}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Re-entries</span><span>{(s.exit_rules as any)?.max_reentry_count ?? 1}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Trail After</span><span>{(s.exit_rules as any)?.trail_after_pct ?? 30}%</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Trail By</span><span>{(s.exit_rules as any)?.trail_pct ?? 15}%</span></div>
                        </div>
                        {s.description && <p className="text-muted-foreground/70 italic">{s.description}</p>}
                        <Button variant="outline" size="sm" className="w-full mt-1 text-xs" onClick={() => setChainViewStrategy(s)}>
                          <BarChart2 className="h-3.5 w-3.5 mr-1" />View Live Option Chain
                        </Button>
                      </div>
                    )}

                    {/* Action row — live-only mode */}
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                        {expandedId === s.id ? <><ChevronUp className="h-3.5 w-3.5 mr-1" />Less</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" />Details</>}
                      </Button>

                      <Button variant="outline" size="sm" className="text-xs h-7 px-2" onClick={() => { setEditStrategy(s); setShowBuilder(true); }}>
                        Edit
                      </Button>

                      {/* Execute Now — live only, broker gated */}
                      <Button
                        variant="outline" size="sm"
                        className="h-7 px-2 text-xs border-[rgba(52,211,153,0.4)] text-[var(--accent-green)] hover:bg-[rgba(52,211,153,0.12)]"
                        onClick={() => void handleExecuteNow(s)}
                        disabled={
                          !brokerConnected ||
                          (typeof accountCaps?.activeOrders === "number" &&
                            typeof accountCaps?.limits?.orders === "number" &&
                            accountCaps.activeOrders >= accountCaps.limits.orders)
                        }
                        title={brokerConnected ? "Execute live now" : "Connect broker to execute"}
                      >
                        <Zap className="h-3 w-3 mr-1" />Execute Now
                      </Button>

                      {/* Active / Paused controls */}
                      {s.is_active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs border-[rgba(251,146,60,0.4)] text-[var(--accent-orange)] hover:bg-[rgba(251,146,60,0.12)]"
                          onClick={() => handlePause(s)}
                        >
                          <Pause className="h-3 w-3 mr-1" />Pause
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className={`h-7 px-2 text-xs ${brokerConnected ? "bg-[linear-gradient(135deg,rgba(56,189,248,0.16),rgba(99,102,241,0.16))] text-[var(--accent-cyan)] border border-[rgba(56,189,248,0.35)] hover:bg-[linear-gradient(135deg,rgba(56,189,248,0.24),rgba(99,102,241,0.24))]" : "bg-muted/50 text-muted-foreground cursor-not-allowed"}`}
                          onClick={() => void openActivateLive(s)}
                          disabled={
                            !brokerConnected ||
                            (typeof accountCaps?.activeStrategies === "number" &&
                              typeof accountCaps?.limits?.strategies === "number" &&
                              accountCaps.activeStrategies >= accountCaps.limits.strategies)
                          }
                          title={brokerConnected ? "Activate for real live orders today" : "Connect broker first"}
                        >
                          <Zap className="h-3 w-3 mr-1" />Activate Live
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 px-2 text-xs text-[var(--accent-red)] hover:text-[var(--accent-red)]"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )})}
            </div>
          )}
        </div>
      </div>

      {/* Strategy Builder Dialog */}
      {showBuilder && (
        <OptionsStrategyBuilderDialog
          open={showBuilder}
          onOpenChange={(open) => { setShowBuilder(open); if (!open) setEditStrategy(null); }}
          editStrategy={editStrategy}
          onSaved={() => { setShowBuilder(false); setEditStrategy(null); fetchStrategies(); }}
        />
      )}

      {/* Activate Dialog — live mode only */}
      <OptionsStrategyActivateDialog
        open={!!activateTarget}
        onOpenChange={(o) => { if (!o) setActivateTarget(null); }}
        strategy={activateTarget}
        onActivated={finalizeActivation}
        mode="live"
        prefetchedExpiries={activateTarget ? (prefetchedExpiries[activateTarget.underlying] ?? []) : []}
      />

      {/* Live Option Chain */}
      {chainViewStrategy && (
        <OptionChainViewer
          open={!!chainViewStrategy}
          onOpenChange={(open) => { if (!open) setChainViewStrategy(null); }}
          symbol={chainViewStrategy.underlying}
          exchange={chainViewStrategy.exchange}
          selectedStrikeOffset={chainViewStrategy.strike_selection}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-[rgba(56,189,248,0.22)] bg-[linear-gradient(180deg,rgba(8,12,22,0.98),rgba(5,9,18,0.98))] text-[var(--text-primary)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Strategy</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
