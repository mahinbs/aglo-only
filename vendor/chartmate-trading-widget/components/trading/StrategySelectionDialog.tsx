import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, CheckCircle2, Lightbulb, Loader2,
  ChevronDown, ChevronUp, BarChart3, Globe, Lock, ShieldCheck,
  Activity, XCircle, FlaskConical, TrendingUp, TrendingDown, Repeat2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { getStrategyParams } from "@/constants/strategyParams";

// ── All OpenAlgo-compatible strategies ────────────────────────────────────────
export const STRATEGIES: { value: string; label: string; description: string; product: string }[] = [
  { value: "time_scheduled",     label: "Time Scheduled",       description: "Enter and exit at fixed clock times (intraday schedule / MIS-style).",          product: "MIS"  },
  { value: "trend_following",    label: "Trend Following",      description: "Ride the direction of the prevailing trend. Best for bull/bear markets.",          product: "CNC"  },
  { value: "breakout_breakdown", label: "Breakout & Breakdown",  description: "Enter on breakout above resistance or breakdown below support.",                   product: "CNC"  },
  { value: "mean_reversion",     label: "Mean Reversion",        description: "Bet on price returning to average after an extreme move.",                        product: "CNC"  },
  { value: "momentum",           label: "Momentum",              description: "Buy high and sell higher — follow short-term momentum bursts.",                    product: "MIS"  },
  { value: "scalping",           label: "Scalping",              description: "Very short-term intraday trades for small quick gains.",                           product: "MIS"  },
  { value: "swing_trading",      label: "Swing Trading",         description: "Hold 2–10 days to capture a price swing between support and resistance.",          product: "CNC"  },
  { value: "range_trading",      label: "Range Trading",         description: "Buy at support, sell at resistance in a sideways/ranging market.",                 product: "CNC"  },
  { value: "news_based",         label: "News / Event Based",    description: "Trade on earnings, results, government policy, or macro events.",                  product: "MIS"  },
  { value: "options_buying",     label: "Options Buying",        description: "Buy calls/puts for leveraged directional bets with limited risk.",                 product: "NRML" },
  { value: "options_selling",    label: "Options Selling",       description: "Sell options premium — collect theta. High probability, needs margin.",            product: "NRML" },
  { value: "pairs_trading",      label: "Pairs Trading",         description: "Go long one stock, short a correlated one. Market-neutral strategy.",             product: "CNC"  },
];

type StrategyOption = {
  value: string;
  label: string;
  description: string;
  product: string;
  isCustom?: boolean;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  customConfig?: Record<string, unknown> | null;
};

type CustomStrategyRow = {
  id: string;
  name: string;
  description: string | null;
  paper_strategy_type: string | null;
  trading_mode: string | null;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  is_intraday: boolean | null;
  entry_conditions: Record<string, unknown> | null;
  exit_conditions: Record<string, unknown> | null;
  position_config: Record<string, unknown> | null;
  risk_config: Record<string, unknown> | null;
  chart_config: Record<string, unknown> | null;
  execution_days: number[] | null;
  start_time: string | null;
  end_time: string | null;
  squareoff_time: string | null;
  risk_per_trade_pct: number | null;
  market_type: string | null;
};

// Static fallback details per strategy
export const STRATEGY_DETAILS: Record<string, { whenToUse: string; pros: string[]; cons: string[]; inTrendWhen: string }> = {
  time_scheduled:     { whenToUse: "You want deterministic clock-based entries/exits (open/close at exact times).", pros: ["No indicator noise", "Simple to explain", "Good for liquidity windows"], cons: ["Ignores price action", "Gap/slip risk at the clock"], inTrendWhen: "N/A — time-driven, not trend-driven." },
  trend_following:    { whenToUse: "Strong directional moves; clear higher highs/higher lows.", pros: ["Works in strong trends", "Clear rules", "Cuts losers early"], cons: ["Whipsaws in sideways markets", "Lags at reversals"], inTrendWhen: "Markets are making new highs or new lows with momentum." },
  breakout_breakdown: { whenToUse: "Price at key support/resistance; volume confirmation.", pros: ["Captures big moves", "Defined risk at level"], cons: ["False breakouts common", "Needs volume filter"], inTrendWhen: "Volatility is rising and price is testing key levels." },
  mean_reversion:     { whenToUse: "Oversold/overbought extremes; price far from moving average.", pros: ["Good risk/reward at extremes", "Works in chop"], cons: ["Dangerous in strong trends", "Requires timing"], inTrendWhen: "Market is range-bound or after a sharp overextended move." },
  momentum:           { whenToUse: "Short-term strength; strong relative performance; intraday momentum.", pros: ["Quick gains", "Clear momentum signals"], cons: ["Reversals can be sharp", "Needs strict exit"], inTrendWhen: "Intraday momentum and volume are aligned." },
  scalping:           { whenToUse: "Liquid markets; tight spreads; very short timeframes (minutes).", pros: ["Many small wins", "Defined risk per trade"], cons: ["High stress", "Costs matter a lot"], inTrendWhen: "High liquidity and low spread; volatile intraday." },
  swing_trading:      { whenToUse: "2–10 day holds; pullbacks in uptrends or rallies in downtrends.", pros: ["Balances frequency and size", "Less screen time"], cons: ["Overnight risk", "Needs trend filter"], inTrendWhen: "Clear multi-day swings between support and resistance." },
  range_trading:      { whenToUse: "Sideways markets; defined support and resistance; no strong trend.", pros: ["Predictable levels", "Repeatable setup"], cons: ["Fails when trend starts", "Needs range confirmation"], inTrendWhen: "Price is bouncing between clear levels without breakout." },
  news_based:         { whenToUse: "Around earnings, policy events, or macro data; high-impact news.", pros: ["Catalyst-driven", "Big moves possible"], cons: ["Gap risk", "Hard to size"], inTrendWhen: "Scheduled events or breaking news that move the asset." },
  options_buying:     { whenToUse: "Strong view on direction or volatility; limited capital for leverage.", pros: ["Defined risk", "Leverage"], cons: ["Theta decay", "Need right strike/expiry"], inTrendWhen: "Expecting a clear move; volatility not too expensive." },
  options_selling:    { whenToUse: "High implied volatility; range-bound or slow grind; income focus.", pros: ["Theta in your favour", "High win rate"], cons: ["Unlimited risk if wrong", "Margin needed"], inTrendWhen: "IV is elevated and you expect range or mean reversion." },
  pairs_trading:      { whenToUse: "Correlated instruments; spread at extreme; market-neutral intent.", pros: ["Hedges market direction", "Statistical edge"], cons: ["Correlation can break", "More complex"], inTrendWhen: "A pair's spread has deviated from its mean." },
};

// Which direction each strategy naturally favours as first entry
const STRATEGY_DIRECTION: Record<string, "buy" | "sell" | "both"> = {
  time_scheduled:     "both",
  trend_following:    "both",
  breakout_breakdown: "both",
  mean_reversion:     "both",
  momentum:           "buy",
  scalping:           "both",
  swing_trading:      "both",
  range_trading:      "both",
  news_based:         "both",
  options_buying:     "buy",
  options_selling:    "sell",
  pairs_trading:      "both",
};

// What the system auto-executes after the strategy exit conditions are met
const AUTO_EXIT_NOTE: Record<string, { buy: string; sell: string }> = {
  time_scheduled:     { buy: "Auto-SELL at your scheduled exit clock time (and/or TP/SL from the algo builder).", sell: "Auto-BUY to cover at your scheduled exit clock time (and/or TP/SL)." },
  trend_following:    { buy: "Auto-SELL when trend reverses — price crosses below SMA or makes a lower low.", sell: "Auto-BUY to cover when downtrend ends and price reclaims SMA." },
  breakout_breakdown: { buy: "Auto-SELL if price fails to hold the breakout level or hits target.", sell: "Auto-BUY to cover when price reclaims the breakdown level." },
  mean_reversion:     { buy: "Auto-SELL when price returns to the moving average / mean target.", sell: "Auto-BUY to cover when price reverts back to mean from oversold." },
  momentum:           { buy: "Auto-SELL when momentum weakens — RSI exits overbought or signal drops.", sell: "Auto-BUY to cover when downside momentum exhausts or reverses." },
  scalping:           { buy: "Auto-SELL at tight profit target within minutes — strict SL/TP.", sell: "Auto-BUY to cover at tight target within minutes — high-frequency exit." },
  swing_trading:      { buy: "Auto-SELL at swing high target (2–10 day hold) or on reversal signal.", sell: "Auto-BUY to cover at swing low target or when reversal confirms." },
  range_trading:      { buy: "Auto-SELL at range resistance after buying at support.", sell: "Auto-BUY to cover at range support after selling at resistance." },
  news_based:         { buy: "Auto-SELL after news catalyst dissipates or target is hit.", sell: "Auto-BUY to cover once the negative news event fades or price stabilises." },
  options_buying:     { buy: "Auto-SELL the option at target price, delta target, or near expiry.", sell: "Auto-BUY puts to close; exit when the directional move plays out." },
  options_selling:    { buy: "Auto-BUY to close the sold premium position at profit target.", sell: "Auto-BUY to close when premium decays to target or near expiry." },
  pairs_trading:      { buy: "Auto-SELL the long leg when the spread reverts to mean.", sell: "Auto-BUY to cover the short leg when the spread normalises." },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface StrategyStats {
  strategy:   string;
  total:      number;
  wins:       number;
  losses:     number;
  winRate:    number;
  avgPnlPct:  number;
  totalPnl:   number;
}

interface AiRankedStrategy {
  strategy:         string;
  label:            string;
  probabilityScore: number;
  verdict:          "great" | "good" | "neutral" | "poor" | "avoid";
  whyNow:           string;
  riskWarning:      string;
}

interface MarketContext {
  regime:          string;
  summary:         string;
  globalMacro:     string;
  newsSentiment:   "bullish" | "bearish" | "neutral";
  riskWarnings:    string[];
}

interface AiResult {
  marketContext: MarketContext;
  topPick:       { strategy: string; reason: string };
  ranked:        AiRankedStrategy[];
}

interface BacktestResult {
  symbol:            string;
  strategy:          string;
  action:            string;
  backtestPeriod:    string;
  strategyAchieved:  boolean;
  achievementReason: string;
  totalTrades:       number;
  wins:              number;
  losses:            number;
  winRate:           number;
  avgReturn:         number;
  totalReturn:       number;
  maxDrawdown:       number;
  profitFactor:      number;
  currentIndicators: {
    price:   number;
    sma20:   number | null;
    rsi14:   number | null;
    high20d: number;
    low20d:  number;
  };
}

interface Props {
  open:            boolean;
  onOpenChange:    (v: boolean) => void;
  currentStrategy: string;
  symbol:          string;
  /** Initial action suggestion — user can override inside the dialog */
  action:          "BUY" | "SELL";
  investment?:     number;
  timeframe?:      string;
  /** Current live market price — used to default SELL position inputs */
  currentPrice?:   number;
  /** When true this is a paper trade simulation — strategy conditions & AI verdict gates are disabled */
  isPaperTrade?:   boolean;
  /**
   * Receives the chosen strategy, product type, and the user-selected action direction.
   * For SELL orders, also receives the user's existing position details (buy price & shares).
   * If the user didn't fill those in, defaults are: entryPrice = currentPrice, shares = investment / currentPrice.
   */
  onConfirm:       (strategy: string, product: string, action: "BUY" | "SELL", sellPosition?: { entryPrice: number; shares: number }) => void;
}

type SellMode = "short" | "normal";

// ── Verdict helpers ────────────────────────────────────────────────────────────

function verdictLabel(v?: string) {
  if (v === "great")  return <Badge className="bg-green-600 text-white text-xs">AI: Great</Badge>;
  if (v === "good")   return <Badge className="bg-blue-600 text-white text-xs">AI: Good</Badge>;
  if (v === "poor")   return <Badge variant="destructive" className="text-xs">AI: Poor</Badge>;
  if (v === "avoid")  return <Badge variant="destructive" className="text-xs">AI: Avoid</Badge>;
  if (v === "neutral") return <Badge variant="outline" className="text-xs">AI: Neutral</Badge>;
  return null;
}

function regimeBadge(regime?: string) {
  const r = (regime || "").replace(/_/g, " ");
  if (regime?.includes("bullish"))  return <Badge className="bg-green-600 text-white capitalize">{r}</Badge>;
  if (regime?.includes("bearish"))  return <Badge className="bg-red-600 text-white capitalize">{r}</Badge>;
  if (regime?.includes("volatile")) return <Badge className="bg-orange-500 text-white capitalize">{r}</Badge>;
  return <Badge variant="outline" className="capitalize">{r || "Analysing…"}</Badge>;
}

// ── Backtest results panel ─────────────────────────────────────────────────────

function BacktestPanel({ result, loading, error }: {
  result: BacktestResult | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm font-medium">Running backtest on {100}+ days of historical data…</span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
        </div>
        <p className="text-xs text-muted-foreground">Simulating strategy entries & exits on real OHLCV data</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="border-yellow-500/50 bg-yellow-500/10">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="text-xs text-yellow-700">
          Backtest unavailable: {error}. You can still proceed but without historical validation.
        </AlertDescription>
      </Alert>
    );
  }

  if (!result) return null;

  const { strategyAchieved, achievementReason, totalTrades, winRate, avgReturn, totalReturn, maxDrawdown, profitFactor, backtestPeriod, currentIndicators } = result;

  const winRateColor = winRate >= 55 ? "text-green-600" : winRate >= 45 ? "text-yellow-600" : "text-red-600";
  const pfColor      = profitFactor >= 1.5 ? "text-green-600" : profitFactor >= 1.0 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      {/* Strategy Achieved */}
      <div className={cn(
        "flex items-start gap-2 rounded-md p-2.5 text-sm",
        strategyAchieved ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"
      )}>
        {strategyAchieved
          ? <ShieldCheck className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          : <XCircle     className="h-4 w-4 text-red-600   mt-0.5 shrink-0" />
        }
        <div>
          <p className={cn("font-semibold text-xs", strategyAchieved ? "text-green-700" : "text-red-700")}>
            {strategyAchieved ? "Strategy Conditions Met" : "Strategy Conditions NOT Met"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{achievementReason}</p>
        </div>
      </div>

      {/* Current Indicators */}
      {currentIndicators && (
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded bg-background border p-1.5">
            <p className="text-muted-foreground">Price</p>
            <p className="font-bold">{currentIndicators.price}</p>
          </div>
          <div className="rounded bg-background border p-1.5">
            <p className="text-muted-foreground">SMA20</p>
            <p className={cn("font-bold", currentIndicators.sma20 != null && currentIndicators.price > currentIndicators.sma20 ? "text-green-600" : "text-red-600")}>
              {currentIndicators.sma20 ?? "N/A"}
            </p>
          </div>
          <div className="rounded bg-background border p-1.5">
            <p className="text-muted-foreground">RSI14</p>
            <p className={cn("font-bold",
              currentIndicators.rsi14 == null ? "" :
              currentIndicators.rsi14 > 70 ? "text-red-600" :
              currentIndicators.rsi14 < 30 ? "text-green-600" : "text-yellow-600"
            )}>
              {currentIndicators.rsi14 ?? "N/A"}
            </p>
          </div>
        </div>
      )}

      {/* Backtest metrics */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
          <BarChart3 className="h-3.5 w-3.5" />
          Backtest Results — {backtestPeriod}
        </p>
        {totalTrades === 0 ? (
          <p className="text-xs text-muted-foreground">No trades triggered in the backtest window with current strategy rules.</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trades simulated</span>
              <span className="font-semibold">{totalTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Win rate</span>
              <span className={cn("font-semibold", winRateColor)}>{winRate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg return/trade</span>
              <span className={cn("font-semibold", avgReturn >= 0 ? "text-green-600" : "text-red-600")}>
                {avgReturn >= 0 ? "+" : ""}{avgReturn.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total return</span>
              <span className={cn("font-semibold", totalReturn >= 0 ? "text-green-600" : "text-red-600")}>
                {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max drawdown</span>
              <span className={cn("font-semibold", maxDrawdown >= -5 ? "text-yellow-600" : "text-red-600")}>
                {maxDrawdown.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Profit factor</span>
              <span className={cn("font-semibold", pfColor)}>{profitFactor.toFixed(2)}x</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StrategySelectionDialog({
  open, onOpenChange, currentStrategy, symbol, action, investment = 10000, timeframe = "1d", currentPrice, isPaperTrade = false, onConfirm,
}: Props) {

  const [userStats,        setUserStats]        = useState<Record<string, StrategyStats>>({});
  const [bestHistory,      setBestHistory]       = useState<string | null>(null);
  const [aiResult,         setAiResult]          = useState<AiResult | null>(null);
  const [aiLoading,        setAiLoading]         = useState(false);
  const [aiError,          setAiError]           = useState<string | null>(null);
  const [histLoading,      setHistLoading]       = useState(true);
  const [selected,         setSelected]          = useState(currentStrategy || "trend_following");
  const [customStrategies, setCustomStrategies]  = useState<StrategyOption[]>([]);
  /** Which analyze mode was last chosen — null until user clicks an AI button (no pre-selected look). */
  const [aiScope,          setAiScope]           = useState<"all" | "selected" | null>(null);
  /** User tapped a strategy card — required before "AI Analyze Selected Only" is enabled. */
  const [strategyChosenForSelectedAi, setStrategyChosenForSelectedAi] = useState(false);
  const [expandedDetails,  setExpandedDetails]   = useState<string | null>(null);

  // User-selected entry direction — starts from the prop but can be overridden in the dialog
  const [selectedAction, setSelectedAction] = useState<"BUY" | "SELL">(action);
  const [sellMode, setSellMode] = useState<SellMode>("short");

  // SELL position details — optional fields so we can calculate accurate P&L
  const [sellBuyPrice,  setSellBuyPrice]  = useState("");
  const [sellNumShares, setSellNumShares] = useState("");

  // Backtest state
  const [backtestResult,  setBacktestResult]   = useState<BacktestResult | null>(null);
  const [backtestLoading, setBacktestLoading]  = useState(false);
  const [backtestError,   setBacktestError]    = useState<string | null>(null);
  const backtestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiCacheRef = useRef<Record<string, AiResult>>({});

  // ── On dialog open: reset non-action state and history ───────────────────────
  useEffect(() => {
    if (!open) return;
    setSelected(currentStrategy || "trend_following");
    setSelectedAction(action);
    setSellMode("short");
    setAiScope(null);
    setStrategyChosenForSelectedAi(false);
    setExpandedDetails(null);
    setSellBuyPrice("");
    setSellNumShares("");
    setAiResult(null);
    setAiError(null);
    setAiLoading(false);
    loadCustomStrategies();
    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const effectiveAction: "BUY" | "SELL" =
    selectedAction === "SELL" && sellMode === "normal" ? "BUY" : selectedAction;
  const actionLabel =
    selectedAction === "SELL" && sellMode === "normal" ? "SELL (Normal)" : selectedAction;

  const selectStrategy = useCallback((value: string) => {
    setSelected(value);
    setStrategyChosenForSelectedAi(true);
  }, []);

  // Auto-run backtest whenever selected strategy or action direction changes (debounced 600ms)
  const builtInStrategyIds = useMemo(
    () => new Set(STRATEGIES.map((s) => s.value)),
    [],
  );
  const requiresBacktest = !isPaperTrade && builtInStrategyIds.has(selected);
  useEffect(() => {
    if (!open || !selected || !requiresBacktest) {
      setBacktestResult(null);
      setBacktestError(null);
      return;
    }
    if (backtestTimerRef.current) clearTimeout(backtestTimerRef.current);
    backtestTimerRef.current = setTimeout(() => {
      runBacktest(selected, effectiveAction);
    }, 600);
    return () => { if (backtestTimerRef.current) clearTimeout(backtestTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, open, effectiveAction, requiresBacktest]);

  // ── Load user's personal trade history ───────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUserStats({});
        setBestHistory(null);
        return;
      }
      const { data } = await (supabase as any)
        .from("active_trades")
        .select("strategy_type, actual_pnl, actual_pnl_percentage, status")
        .eq("user_id", user.id)
        .in("status", ["completed", "stopped_out", "target_hit", "cancelled"]);

      const map: Record<string, { pnls: number[]; pnlPcts: number[] }> = {};
      (data || []).forEach((t: any) => {
        const s = t.strategy_type || "trend_following";
        if (!map[s]) map[s] = { pnls: [], pnlPcts: [] };
        if (t.actual_pnl != null) map[s].pnls.push(parseFloat(t.actual_pnl));
        if (t.actual_pnl_percentage != null) map[s].pnlPcts.push(parseFloat(t.actual_pnl_percentage));
      });

      const computed: Record<string, StrategyStats> = {};
      let bestWinRate = -1, bestKey: string | null = null;

      [...STRATEGIES.map((s) => s.value), ...customStrategies.map((s) => s.value)].forEach((value) => {
        const d = map[value];
        if (!d || d.pnls.length === 0) {
          computed[value] = { strategy: value, total: 0, wins: 0, losses: 0, winRate: 0, avgPnlPct: 0, totalPnl: 0 };
          return;
        }
        const wins     = d.pnls.filter(p => p > 0).length;
        const losses   = d.pnls.filter(p => p <= 0).length;
        const total    = d.pnls.length;
        const winRate  = (wins / total) * 100;
        const avgPnlPct = d.pnlPcts.reduce((a, b) => a + b, 0) / d.pnlPcts.length;
        const totalPnl  = d.pnls.reduce((a, b) => a + b, 0);
        computed[value] = { strategy: value, total, wins, losses, winRate, avgPnlPct, totalPnl };
        if (winRate > bestWinRate && total >= 2) { bestWinRate = winRate; bestKey = value; }
      });

      setUserStats(computed);
      setBestHistory(bestKey);
    } catch (e) {
      console.error("history stats error", e);
    } finally {
      setHistLoading(false);
    }
  }, [customStrategies]);

  const loadCustomStrategies = useCallback(async () => {
    try {
      const { data: rows, error } = await (supabase as any)
        .from("user_strategies")
        .select("id,name,description,paper_strategy_type,trading_mode,stop_loss_pct,take_profit_pct,is_intraday,entry_conditions,exit_conditions,position_config,risk_config,chart_config,execution_days,start_time,end_time,squareoff_time,risk_per_trade_pct,market_type")
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const mapped: StrategyOption[] = ((rows ?? []) as CustomStrategyRow[]).map((row) => {
        const product = String((row.position_config as any)?.orderProduct ?? "CNC").toUpperCase();
        return {
          value: row.id,
          label: row.name,
          description: row.description || `Custom strategy (${row.paper_strategy_type ?? "rule based"})`,
          product,
          isCustom: true,
          stopLossPct: row.stop_loss_pct,
          takeProfitPct: row.take_profit_pct,
          customConfig: row,
        };
      });
      setCustomStrategies(mapped);
    } catch (e) {
      console.error("Failed to load custom strategies", e);
      setCustomStrategies([]);
    }
  }, []);

  // ── Call Gemini / signal scan — only when user clicks an analyze button ─────
  const loadAiAnalysis = useCallback(async (
    actionOverride: "BUY" | "SELL",
    options?: { scope?: "all" | "selected" },
  ) => {
    const scope = options?.scope ?? aiScope ?? "all";
    const cacheKey = `${symbol}|${investment}|${timeframe}|${actionOverride}|${scope}|${scope === "selected" ? selected : "all"}`;
    const cached = aiCacheRef.current[cacheKey];
    if (cached) {
      setAiResult(cached);
      setAiLoading(false);
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const allStrategies: StrategyOption[] = [...STRATEGIES, ...customStrategies];
      const selectedOption = allStrategies.find((s) => s.value === selected);
      const scopedStrategies = scope === "selected" && selectedOption ? [selectedOption] : allStrategies;
      const builtInForScan = scopedStrategies.filter((s) => !s.isCustom).map((s) => s.value);
      const customForScan = scopedStrategies
        .filter((s) => s.isCustom && s.customConfig)
        .map((s) => {
          const cfg = s.customConfig as CustomStrategyRow;
          return {
            id: cfg.id,
            name: cfg.name,
            baseType: cfg.paper_strategy_type || "trend_following",
            tradingMode: cfg.trading_mode || "BOTH",
            stopLossPct: cfg.stop_loss_pct,
            takeProfitPct: cfg.take_profit_pct,
            isIntraday: cfg.is_intraday ?? true,
            entryConditions: cfg.entry_conditions ?? null,
            exitConditions: cfg.exit_conditions ?? null,
            positionConfig: cfg.position_config ?? null,
            riskConfig: cfg.risk_config ?? null,
            chartConfig: cfg.chart_config ?? null,
            executionDays: Array.isArray(cfg.execution_days) ? cfg.execution_days : [],
            marketType: cfg.market_type === "global_equity" ? "stocks" : (cfg.market_type || "stocks"),
            startTime: cfg.start_time || undefined,
            endTime: cfg.end_time || undefined,
            squareoffTime: cfg.squareoff_time || undefined,
            riskPerTradePct: cfg.risk_per_trade_pct ?? undefined,
            description: cfg.description || undefined,
          };
        });

      const [scanRes, suggestRes] = await Promise.all([
        supabase.functions.invoke("strategy-entry-signals", {
          body: {
            symbol,
            strategies: builtInForScan,
            action: actionOverride,
            days: 365,
            maxSignalAgeDays: 90,
            customStrategies: customForScan,
          },
        }),
        supabase.functions.invoke("suggest-strategy", {
          body: { symbol, action: actionOverride, investment, timeframe },
        }),
      ]);

      if (scanRes.error) {
        setAiError(scanRes.error.message);
        return;
      }

      const scanSignals = Array.isArray((scanRes.data as any)?.signals)
        ? ((scanRes.data as any).signals as any[])
        : [];
      const rankedMap = new Map<string, any>();
      for (const sig of scanSignals) {
        const sid = String(sig.strategyId ?? "");
        if (!sid) continue;
        const prev = rankedMap.get(sid);
        const next = {
          strategy: sid,
          label: String(sig.strategyLabel ?? sid),
          probabilityScore: Number(sig.probabilityScore ?? 50),
          verdict: (String(sig.verdict ?? "neutral").toLowerCase() as "great" | "good" | "neutral" | "poor" | "avoid"),
          whyNow: String(sig.whyThisScore ?? sig.rationale ?? ""),
          riskWarning: String(sig.rejectionDetail ?? ""),
          isLive: Boolean(sig.isLive),
        };
        if (!prev || (next.isLive && !prev.isLive) || next.probabilityScore > prev.probabilityScore) {
          rankedMap.set(sid, next);
        }
      }

      const ranked = Array.from(rankedMap.values())
        .sort((a, b) => {
          if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
          return b.probabilityScore - a.probabilityScore;
        })
        .map(({ isLive, ...rest }) => rest);

      const top = ranked[0];
      const suggestData = suggestRes.error ? null : (suggestRes.data as any);
      if (suggestRes.error) {
        console.warn("suggest-strategy failed, continuing with strategy-entry-signals only", suggestRes.error.message);
      }
      const next: AiResult = {
        marketContext: suggestData?.marketContext ?? {
          regime: "neutral",
          summary: `AI scored ${ranked.length} strategy signals for ${symbol}${top ? `; top score ${top.probabilityScore}%` : ""}.`,
          globalMacro: "Live strategy scores are based on current indicator and candle conditions.",
          newsSentiment: "neutral",
          riskWarnings: [],
        },
        topPick: top
          ? { strategy: top.strategy, reason: top.whyNow || "Highest probability strategy for current conditions." }
          : (suggestData?.topPick ?? { strategy: selected, reason: "No live signals found; using current selection." }),
        ranked,
      };

      aiCacheRef.current[cacheKey] = next;
      setAiResult(next);
    } catch (e: any) {
      setAiError(e?.message ?? "AI analysis failed.");
    } finally {
      setAiLoading(false);
    }
  }, [symbol, investment, timeframe, customStrategies, aiScope, selected]);

  // ── Run backtest for selected strategy ───────────────────────────────────────
  const runBacktest = useCallback(async (strategyCode: string, actionOverride: "BUY" | "SELL") => {
    setBacktestLoading(true);
    setBacktestResult(null);
    setBacktestError(null);
    try {
      const { data, error } = await supabase.functions.invoke("backtest-strategy", {
        body: { symbol, strategy: strategyCode, action: actionOverride },
      });
      if (error) { setBacktestError(error.message); return; }
      if ((data as any)?.error) { setBacktestError((data as any).error); return; }
      setBacktestResult(data as BacktestResult);
    } catch (e: any) {
      setBacktestError(e?.message ?? "Backtest failed.");
    } finally {
      setBacktestLoading(false);
    }
  }, [symbol]);

  // Merge AI ranks into a lookup
  const aiByStrategy = Object.fromEntries(
    (aiResult?.ranked ?? []).map(r => [r.strategy, r])
  );

  const allStrategyOptions: StrategyOption[] = useMemo(
    () => [...STRATEGIES, ...customStrategies],
    [customStrategies],
  );

  // Sort strategies: AI ranked first (best score first), then rest
  const sortedStrategies: StrategyOption[] = aiResult?.ranked?.length
    ? [
        ...aiResult.ranked
          .map((r) => allStrategyOptions.find((s) => s.value === r.strategy))
          .filter(Boolean) as StrategyOption[],
        ...allStrategyOptions.filter((s) => !(aiResult.ranked ?? []).some((r) => r.strategy === s.value)),
      ]
    : allStrategyOptions;

  const mc = aiResult?.marketContext;
  const selectedAI = aiByStrategy[selected];

  // ── Order placement gate logic ────────────────────────────────────────────────
  // While AI is running (all or selected-only), order placement is blocked.
  const strategyNotAchieved = requiresBacktest && backtestResult != null && !backtestResult.strategyAchieved;
  const aiVerdictBlocked    = !isPaperTrade && (selectedAI?.verdict === "poor" || selectedAI?.verdict === "avoid");
  const backtestPending     = requiresBacktest && (backtestLoading || (!backtestResult && !backtestError));
  const orderBlocked        = aiLoading || strategyNotAchieved || aiVerdictBlocked || backtestPending;

  const getBlockReason = (): string | null => {
    if (aiLoading) return "AI analysis is still running — wait until it finishes before placing an order.";
    if (backtestPending)   return "Running historical backtest on real price data… please wait.";
    if (strategyNotAchieved) return `Strategy conditions not currently met in the market: ${backtestResult?.achievementReason}`;
    if (aiVerdictBlocked) return `AI rates this strategy "${selectedAI?.verdict}" for current market conditions — order blocked to protect your capital. Choose a strategy rated Good or Great.`;
    return null;
  };

  const blockReason = getBlockReason();

  // Auto-exit description for the chosen strategy + action
  const autoExitText = AUTO_EXIT_NOTE[selected]?.[effectiveAction === "BUY" ? "buy" : "sell"]
    ?? `Once the order is placed, the system will automatically ${effectiveAction === "BUY" ? "SELL" : "BUY"} when strategy exit conditions are met.`;

  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Fixed height dialog — ONE single scroll inside */}
        <DialogContent className="w-[95vw] sm:max-w-2xl mx-auto max-h-[91vh] flex flex-col p-0 gap-0 z-[1000]">

        {/* ── Fixed header ─────────────────────────────────────────────────── */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b space-y-0">
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-base font-semibold">
              {isPaperTrade ? "Paper Trade" : "Choose Strategy"}
            </DialogTitle>
            <Badge
              variant={selectedAction === "SELL" ? "destructive" : "default"}
              className={cn("text-xs", selectedAction === "BUY" ? "bg-green-600 hover:bg-green-600" : "")}
            >
              {actionLabel} {symbol}
            </Badge>
            {isPaperTrade && (
              <Badge className="bg-violet-500/20 text-violet-700 border border-violet-500/40 text-[10px]">
                Simulated
              </Badge>
            )}
          </div>
          <DialogDescription className="text-xs mt-2">
            {isPaperTrade
              ? "No real money. Pick direction, choose a strategy, then place the order. AI is optional — while it runs, placing an order stays disabled until analysis completes."
              : "Pick direction and strategy. AI scoring is optional. Any time AI is running, you must wait for it to finish before placing an order."
            }
          </DialogDescription>
        </DialogHeader>

        {/* ── Single scrollable body ────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">

          {/* ── Step 1: Entry Direction ── */}
          <div className="rounded-lg border-2 p-3 space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Repeat2 className="h-4 w-4" />
              Step 1 — Choose Entry Direction
            </h4>
            <p className="text-xs text-muted-foreground">
              Are you entering the market by <strong>buying first</strong> (long position) or <strong>selling first</strong> (short position / exiting a holding you already own)?
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant={selectedAction === "BUY" ? "default" : "outline"}
                className={cn("flex-1 gap-2", selectedAction === "BUY" ? "bg-green-600 hover:bg-green-700 border-green-600" : "")}
                onClick={() => setSelectedAction("BUY")}
              >
                <TrendingUp className="h-4 w-4" />
                BUY First (Long)
              </Button>
              <Button
                type="button"
                variant={selectedAction === "SELL" ? "default" : "outline"}
                className={cn("flex-1 gap-2", selectedAction === "SELL" ? "bg-red-600 hover:bg-red-700 border-red-600" : "")}
                onClick={() => setSelectedAction("SELL")}
              >
                <TrendingDown className="h-4 w-4" />
                SELL
              </Button>
            </div>

            {selectedAction === "SELL" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSellMode("short")}
                    className={cn(
                      "rounded-md border p-2 text-left transition-colors",
                      sellMode === "short"
                        ? "border-red-500 bg-red-500/10"
                        : "border-muted bg-background hover:border-red-400/60"
                    )}
                  >
                    <p className="text-xs font-semibold text-red-500">Short Sell</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Sell first, buy later. Profit if price falls.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSellMode("normal")}
                    className={cn(
                      "rounded-md border p-2 text-left transition-colors",
                      sellMode === "normal"
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-muted bg-background hover:border-blue-400/60"
                    )}
                  >
                    <p className="text-xs font-semibold text-blue-500">Sell Existing (Normal)</p>
                    <p className="text-[11px] text-muted-foreground mt-1">You already own shares. Uses long P&amp;L logic.</p>
                  </button>
                </div>
                <div className="flex items-start gap-2 rounded bg-amber-500/10 border border-amber-500/30 p-2 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {sellMode === "short"
                      ? (isPaperTrade
                        ? `Paper Short Sell: we assume a short is opened now. Strategy auto-BUY covers the short on exit.`
                        : `Short Sell: ensure your broker account has short-selling / margin enabled.`)
                      : `Normal Sell: this tracks an existing holding you bought earlier. Enter your buy price and quantity for correct P&L.`
                    }
                  </span>
                </div>

                {/* Optional position details for accurate P&L calculation */}
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">Your existing position</p>
                    <Badge variant="outline" className="text-[10px] border-muted-foreground/40">optional</Badge>
                    <p className="text-[10px] text-muted-foreground ml-auto">Leave blank to use defaults</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Avg buy price / share</Label>
                        <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={currentPrice ? currentPrice.toFixed(2) : "e.g. 2450.00"}
                        value={sellBuyPrice}
                        onChange={e => setSellBuyPrice(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {sellMode === "normal" ? "recommended for accurate normal-sell P&L" : "default: current market price"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Shares held</Label>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        placeholder={
                          currentPrice && investment
                            ? String(Math.floor(investment / currentPrice))
                            : "e.g. 10"
                        }
                        value={sellNumShares}
                        onChange={e => setSellNumShares(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {sellMode === "normal" ? "shares you already hold" : "default: investment ÷ price"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedAction === "BUY" && (
              <div className="flex items-start gap-2 rounded bg-green-500/10 border border-green-500/30 p-2 text-xs text-green-800">
                <TrendingUp className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  You are entering a <strong>long position</strong> by buying {symbol}. The strategy will auto-SELL when the exit target or signal is triggered.
                </span>
              </div>
            )}
          </div>

          {/* ── Step 2 label ── */}
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            Step 2 — Choose a{" "}
            <span className={cn("font-bold", selectedAction === "BUY" ? "text-green-700" : "text-red-700")}>
              {actionLabel}
            </span>{" "}
            strategy
            {aiLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
          </p>

          {/* ── Strategy grid first (pick before “selected only” AI) ── */}
          <div className="grid sm:grid-cols-2 gap-2">
            {(histLoading ? allStrategyOptions : sortedStrategies).map(s => {
              const st  = userStats[s.value];
              const ai  = aiByStrategy[s.value];
              const isTopPick = aiResult?.topPick?.strategy === s.value;
              const isBlocked = ai?.verdict === "poor" || ai?.verdict === "avoid";
              const dirHint = STRATEGY_DIRECTION[s.value];
              const mismatch = dirHint !== "both" && dirHint !== selectedAction.toLowerCase();

              return (
                <button
                  type="button"
                  key={s.value}
                  onClick={() => selectStrategy(s.value)}
                  className={cn(
                    "text-left p-3 rounded-lg border-2 transition-all",
                    selected === s.value
                      ? "border-primary bg-primary/10"
                      : isBlocked
                        ? "border-red-300 bg-red-500/5 hover:bg-red-500/10"
                        : isTopPick
                          ? "border-green-500 bg-green-500/5 hover:bg-green-500/10"
                          : mismatch
                            ? "border-muted bg-muted/30 opacity-60 hover:opacity-80"
                            : "border-muted hover:border-primary/50 bg-background",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {isTopPick && "⭐ "}{isBlocked && "🚫 "}
                        {dirHint === "buy" && selectedAction === "BUY" && "📈 "}
                        {dirHint === "sell" && selectedAction === "SELL" && "📉 "}
                        {s.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{s.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs">{s.product}</Badge>
                      {dirHint !== "both" && (
                        <Badge
                          variant="outline"
                          className={cn("text-[10px]",
                            dirHint === "buy" ? "border-green-400 text-green-700" : "border-red-400 text-red-700"
                          )}
                        >
                          {dirHint === "buy" ? "BUY-suited" : "SELL-suited"}
                        </Badge>
                      )}
                      {ai && verdictLabel(ai.verdict)}
                      {(() => {
                        const sp = s.isCustom
                          ? {
                              stopLossPercentage: Number(s.stopLossPct ?? 5),
                              targetProfitPercentage: Number(s.takeProfitPct ?? 10),
                            }
                          : getStrategyParams(s.value);
                        return (
                          <span className="text-[10px] text-muted-foreground">
                            SL {sp.stopLossPercentage}% · TP {sp.targetProfitPercentage}%
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  {ai && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">AI Probability</span>
                        <span className={cn("font-semibold",
                          ai.probabilityScore >= 65 ? "text-green-600" :
                          ai.probabilityScore >= 45 ? "text-yellow-600" : "text-red-600"
                        )}>
                          {ai.probabilityScore}%
                        </span>
                      </div>
                      <Progress value={ai.probabilityScore} className={cn("h-1.5",
                        ai.probabilityScore >= 65 ? "[&>div]:bg-green-500" :
                        ai.probabilityScore >= 45 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"
                      )} />
                      {ai.whyNow    && <p className="text-xs text-muted-foreground leading-snug mt-0.5">{ai.whyNow}</p>}
                      {ai.riskWarning && <p className="text-xs text-orange-600 font-medium mt-0.5">⚠ {ai.riskWarning}</p>}
                    </div>
                  )}

                  {st && st.total > 0 && (
                    <div className="mt-2 space-y-0.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Your history: {st.wins}W / {st.losses}L</span>
                        <span className={st.avgPnlPct >= 0 ? "text-green-600" : "text-red-600"}>
                          avg {st.avgPnlPct >= 0 ? "+" : ""}{st.avgPnlPct.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={st.winRate} className={cn("h-1",
                        st.winRate >= 50 ? "[&>div]:bg-green-400" : "[&>div]:bg-red-400"
                      )} />
                    </div>
                  )}
                  {st && st.total === 0 && !ai && (
                    <p className="text-xs text-muted-foreground mt-1">No personal history yet</p>
                  )}

                  <div className="mt-2">
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setExpandedDetails(expandedDetails === s.value ? null : s.value); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setExpandedDetails(expandedDetails === s.value ? null : s.value);
                        }
                      }}
                    >
                      {expandedDetails === s.value ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {expandedDetails === s.value ? "Hide" : "Show"} details
                    </span>
                    {expandedDetails === s.value && STRATEGY_DETAILS[s.value] && (
                      <div className="mt-2 p-2 rounded bg-muted/50 text-xs space-y-1 text-left" onClick={e => e.stopPropagation()}>
                        <p><strong>When to use:</strong> {STRATEGY_DETAILS[s.value].whenToUse}</p>
                        <p><strong>In trend when:</strong> {STRATEGY_DETAILS[s.value].inTrendWhen}</p>
                        <p><strong>Pros:</strong> {STRATEGY_DETAILS[s.value].pros.join("; ")}</p>
                        <p><strong>Cons:</strong> {STRATEGY_DETAILS[s.value].cons.join("; ")}</p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── AI actions (after strategy pick — “selected only” needs a card tap) ── */}
          <div className="rounded-lg border border-muted p-3 space-y-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Run AI when you want. <strong>Analyze Selected Only</strong> scores the strategy you tapped in the grid above (pick a card first). While either analysis runs, <strong>Place order</strong> stays disabled until it finishes.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={aiScope === "all" ? "default" : "outline"}
                disabled={aiLoading}
                onClick={() => {
                  setAiScope("all");
                  void loadAiAnalysis(effectiveAction, { scope: "all" });
                }}
                className="text-xs"
              >
                {aiLoading && aiScope === "all" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                AI Analyze All Strategies
              </Button>
              <Button
                type="button"
                size="sm"
                variant={aiScope === "selected" ? "default" : "outline"}
                disabled={aiLoading || !strategyChosenForSelectedAi}
                onClick={() => {
                  setAiScope("selected");
                  void loadAiAnalysis(effectiveAction, { scope: "selected" });
                }}
                className="text-xs"
                title={!strategyChosenForSelectedAi ? "Select a strategy in the grid first" : undefined}
              >
                {aiLoading && aiScope === "selected" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                AI Analyze Selected Only
              </Button>
            </div>
            {!strategyChosenForSelectedAi && (
              <p className="text-[11px] text-amber-700 dark:text-amber-500/90">
                Tap a strategy card above to enable <strong>Analyze Selected Only</strong>.
              </p>
            )}
          </div>

          {/* ── Live AI Market Context ── */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <h4 className="font-semibold flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4" />
              Live Market Analysis (AI)
              {aiLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
            </h4>

            {aiLoading && (
              <p className="text-xs text-muted-foreground animate-pulse">
                AI is fetching live price, RSI, MACD, news &amp; global macro for <strong>{symbol}</strong> ({selectedAction} strategies)…
              </p>
            )}
            {aiError && <p className="text-xs text-destructive">{aiError}</p>}

            {mc && !aiLoading && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-muted-foreground">Regime:</span>
                  {regimeBadge(mc.regime)}
                  <span className="text-xs font-medium text-muted-foreground ml-2">News:</span>
                  <Badge variant="outline" className={cn("text-xs capitalize",
                    mc.newsSentiment === "bullish" ? "border-green-500 text-green-700" :
                    mc.newsSentiment === "bearish" ? "border-red-500 text-red-700" : ""
                  )}>
                    {mc.newsSentiment}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{mc.summary}</p>
                {mc.globalMacro && (
                  <p className="text-xs text-muted-foreground italic"><strong>Macro:</strong> {mc.globalMacro}</p>
                )}
                {mc.riskWarnings?.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {mc.riskWarnings.map((w, i) => (
                      <Badge key={i} variant="outline" className="text-xs border-orange-400 text-orange-700">⚠ {w}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!mc && !aiLoading && (
              <p className="text-xs text-muted-foreground">
                {bestHistory
                  ? <>Tip: <button type="button" className="underline text-primary font-medium" onClick={() => selectStrategy(bestHistory)}>{allStrategyOptions.find(s => s.value === bestHistory)?.label}</button> from your history ({userStats[bestHistory]?.winRate.toFixed(0)}% win rate). Then use the AI buttons under the grid.</>
                  : "No trade history yet. Pick a strategy in the grid, then run AI from the buttons below it."}
              </p>
            )}
          </div>

          {/* ── AI Top Pick Banner ── */}
          {aiResult?.topPick && !aiLoading && (
            <Alert className="border-green-500 bg-green-500/10">
              <Lightbulb className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 text-sm">
                <strong>AI Top Pick for {selectedAction}:</strong>{" "}
                <button type="button" className="underline font-semibold" onClick={() => selectStrategy(aiResult.topPick.strategy)}>
                  {allStrategyOptions.find(s => s.value === aiResult.topPick.strategy)?.label}
                </button>
                {" — "}{aiResult.topPick.reason}
              </AlertDescription>
            </Alert>
          )}

          {aiLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                AI is running for <strong>{symbol}</strong>. <strong>Place order</strong> is disabled until this completes.
              </p>
            </div>
          )}

          {/* ── Backtest Results Panel ── */}
          {requiresBacktest ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" />
                Backtest & Strategy Validation —{" "}
                <span className="text-primary">{allStrategyOptions.find(s => s.value === selected)?.label}</span>
                <span className={cn("ml-1", selectedAction === "BUY" ? "text-green-700" : "text-red-700")}>
                  ({actionLabel})
                </span>
              </p>
              <BacktestPanel result={backtestResult} loading={backtestLoading} error={backtestError} />
            </div>
          ) : (
            <Alert className="border-primary/30 bg-primary/10">
              <AlertDescription className="text-xs">
                Custom strategies use live condition scanning with AI scoring in this dialog. Historical backtest card is shown for built-in templates only.
              </AlertDescription>
            </Alert>
          )}

          {/* ── Auto-exit info when placement is allowed ── */}
          {!orderBlocked && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-800">
                <Repeat2 className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
                <div>
                  <p className="font-semibold mb-0.5">
                    Strategy Exit — tracked in Active Trades
                    {isPaperTrade && <span className="ml-1 text-violet-700">(Paper Simulated)</span>}
                  </p>
                  <p className="leading-relaxed">
                    {autoExitText}
                    {" "}You can manually override or close the position at any time from the Active Trades screen.
                  </p>
                </div>
              </div>
              {/* Transparency note: auto-exit is app-tracked, not broker-triggered */}
              <div className="flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 p-2.5 text-xs text-orange-700">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>How exit works:</strong> The app monitors your position in Active Trades and alerts you when strategy conditions are met. For paper trades the exit is recorded automatically. For real orders you will need to place the exit order with your broker manually (or via the app's broker integration).
                </span>
              </div>
            </div>
          )}

          {/* ── Order Gate: block reason ── */}
          {blockReason && (
            <Alert className="border-red-500/50 bg-red-500/10">
              <Lock className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700 text-sm leading-relaxed">
                <strong>Order Blocked:</strong> {blockReason}
              </AlertDescription>
            </Alert>
          )}

          {/* ── Neutral AI warning ── */}
          {!orderBlocked && selectedAI?.verdict === "neutral" && (
            <Alert className="border-yellow-500/50 bg-yellow-500/10">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700 text-sm">
                AI rates this strategy <strong>Neutral</strong> for current conditions. Proceed with caution.
              </AlertDescription>
            </Alert>
          )}

          {/* ── Order allowed ── */}
          {!orderBlocked && backtestResult?.strategyAchieved && !isPaperTrade && (
            <Alert className="border-green-500/50 bg-green-500/10">
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 text-sm">
                Strategy conditions met & backtest complete. Cleared to place {selectedAction} order.
              </AlertDescription>
            </Alert>
          )}

          {/* bottom spacer so last card isn't hidden behind sticky footer */}
          <div className="h-2" />
        </div>

        {/* ── Sticky confirm footer ─────────────────────────────────────────── */}
        <div className="shrink-0 border-t px-6 py-3 space-y-2 bg-background">
          {(strategyNotAchieved || aiVerdictBlocked) && !backtestPending && (
            <p className="text-xs text-center text-muted-foreground">
              For live orders: backtest must finish and strategy conditions must be met; avoid strategies rated AI Poor/Avoid when analysis has been run.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className={cn(
                "flex-1",
                isPaperTrade
                  ? "bg-violet-600 hover:bg-violet-700"
                  : selectedAction === "BUY"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700",
                orderBlocked ? "opacity-50 cursor-not-allowed" : ""
              )}
              disabled={orderBlocked}
              onClick={() => {
                if (orderBlocked) return;
                const product = allStrategyOptions.find(s => s.value === selected)?.product ?? "CNC";
                const sellPosition = selectedAction === "SELL" ? {
                  entryPrice: sellBuyPrice
                    ? parseFloat(sellBuyPrice)
                    : (currentPrice ?? 0),
                  shares: sellNumShares
                    ? parseFloat(sellNumShares)
                    : (currentPrice && investment ? Math.floor(investment / currentPrice) : 1),
                } : undefined;
                const actionToSubmit = selectedAction === "SELL" && sellMode === "normal" ? "BUY" : selectedAction;
                onConfirm(selected, product, actionToSubmit, sellPosition);
                onOpenChange(false);
              }}
            >
              {aiLoading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Awaiting AI analysis…</>
              ) : backtestPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running Backtest…</>
              ) : strategyNotAchieved ? (
                <><Lock className="h-4 w-4 mr-2" />Strategy Not Achieved</>
              ) : aiVerdictBlocked ? (
                <><Lock className="h-4 w-4 mr-2" />Blocked — Choose Better Strategy</>
              ) : isPaperTrade ? (
                <><FlaskConical className="h-4 w-4 mr-2" />Place order</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Place {actionLabel} Order</>
              )}
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
