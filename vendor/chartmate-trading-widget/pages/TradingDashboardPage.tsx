/**
 * TradingDashboardPage — /trading-dashboard
 *
 * Portfolio + Statement. AI Trading Analysis and Backtesting live on dedicated routes
 * (see TradingAiAnalysisPage, TradingBacktestPage) and sidebar links.
 */

import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Send, Loader2, Info, Zap, Copy, RefreshCw,
  TrendingUp, TrendingDown, ChevronDown, Plus,
  Trash2, ToggleLeft, ToggleRight, Webhook, BookOpen,
  AlertTriangle, CheckCircle2, ExternalLink, Clock, ChevronRight, LineChart, ScrollText, Target,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import BrokerPortfolioCard from "@/components/trading/BrokerPortfolioCard";
import StatementSection from "@/components/trading/StatementSection";
import { StrategyEntrySignalsPanel } from "@/components/prediction/StrategyEntrySignalsPanel";
import AlgoStrategyBuilder from "@/components/trading/AlgoStrategyBuilder";
import { TradingDashboardAccessGate } from "@/components/trading/TradingDashboardAccessGate";
import { TradingDashboardShell } from "@/components/trading/TradingDashboardShell";
import { OptionsStrategiesWorkspace } from "@/pages/OptionsStrategyPage";
import { EngineBootSequence, ExecutionEventFeed } from "@/components/trading/AlgoRobotExperienceLayer";
import { ALGO_ROBOT_COPY } from "@/lib/algoRobotMessaging";
import {
  getRobotExperimentVariant,
  isRobotExperienceEnabled,
  prefersReducedMotion,
  setReducedMotionPreference,
  setRobotExperienceEnabled,
  trackRobotMetric,
} from "@/lib/algoRobotExperience";
import { useSubscription } from "@/hooks/useSubscription";
import {
  getAlgoStrategyLimits,
  isAtCustomStrategyCap,
  strategyCapToastMessage,
} from "@/lib/algoStrategyLimits";

// ── Constants ─────────────────────────────────────────────────────────────────
const EXCHANGES = [
  { value: "NSE",   label: "NSE — National Stock Exchange" },
  { value: "BSE",   label: "BSE — Bombay Stock Exchange" },
  { value: "NFO",   label: "NFO — NSE Futures & Options" },
  { value: "BFO",   label: "BFO — BSE Futures & Options" },
  { value: "CDS",   label: "CDS — Currency Derivatives" },
  { value: "MCX",   label: "MCX — Multi Commodity Exchange" },
  { value: "NCDEX", label: "NCDEX — National Commodity & Derivatives" },
];

const PRODUCT_TYPES = [
  { value: "CNC",  label: "CNC — Delivery" },
  { value: "MIS",  label: "MIS — Intraday" },
  { value: "NRML", label: "NRML — F&O Carry" },
  { value: "CO",   label: "CO — Cover Order" },
  { value: "BO",   label: "BO — Bracket Order" },
];

const ORDER_TYPES = [
  { value: "MARKET", label: "MARKET" },
  { value: "LIMIT",  label: "LIMIT" },
  { value: "SL",     label: "SL — Stop-Loss" },
  { value: "SL-M",   label: "SL-M — SL Market" },
];

// Quick-pick symbols for each exchange
const QUICK_PICKS: Record<string, { symbol: string; label: string }[]> = {
  NSE: [
    { symbol: "RELIANCE",  label: "RELIANCE" },
    { symbol: "TCS",       label: "TCS" },
    { symbol: "HDFCBANK",  label: "HDFCBANK" },
    { symbol: "INFY",      label: "INFY" },
    { symbol: "SBIN",      label: "SBIN" },
  ],
  NFO: [
    { symbol: "NIFTY",     label: "NIFTY" },
    { symbol: "BANKNIFTY", label: "BANKNIFTY" },
    { symbol: "FINNIFTY",  label: "FINNIFTY" },
  ],
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface OrderForm {
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL";
  quantity: string;
  product: string;
  pricetype: string;
  price: string;
  trigger_price: string;
}

interface SymbolResult {
  symbol: string;
  description: string;
  full_symbol: string;
  exchange: string;
  type: string;
}

interface Strategy {
  id: string;
  name: string;
  description?: string | null;
  trading_mode: string;
  is_active: boolean;
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  /** String tickers and/or OpenAlgo-style { symbol, exchange, quantity, product_type } */
  symbols?: unknown[];
  openalgo_webhook_id?: string;
  webhook_url?: string | null;
  market_type?: "crypto" | "stocks" | "forex" | "all" | null;
  paper_strategy_type?: string | null;
  entry_conditions?: {
    mode?: "visual" | "raw";
    groups?: Array<{ conditions?: unknown[] }>;
    rawExpression?: string;
  } | null;
  exit_conditions?: {
    indicatorGroups?: Array<{ conditions?: unknown[] }>;
  } | null;
  position_config?: Record<string, unknown> | null;
  risk_config?: Record<string, unknown> | null;
  chart_config?: Record<string, unknown> | null;
  execution_days?: number[] | null;
  risk_per_trade_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  created_at: string;
}

/** Resolve primary symbol string for display / scans / fire fallback */
function symbolFromStrategy(s: Strategy): string {
  const arr = s.symbols;
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const first = arr[0];
  if (typeof first === "string") return first.trim().toUpperCase();
  if (first && typeof first === "object") {
    return String((first as Record<string, unknown>).symbol ?? "").trim().toUpperCase();
  }
  return "";
}

function defaultsForGoLive(s: Strategy): { symbol: string; exchange: string; quantity: string; product: string } {
  const arr = s.symbols;
  let symbol = "";
  let exchange = "NSE";
  let quantity = 1;
  let product = s.is_intraday ? "MIS" : "CNC";
  if (Array.isArray(arr) && arr.length > 0) {
    const x = arr[0];
    if (typeof x === "string" && x.trim()) symbol = x.trim().toUpperCase();
    else if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      symbol = String(o.symbol ?? "").trim().toUpperCase();
      exchange = String(o.exchange ?? "NSE").toUpperCase();
      const q = Number(o.quantity ?? 1);
      if (Number.isFinite(q) && q >= 1) quantity = Math.floor(q);
      product = String(o.product_type ?? o.orderProduct ?? product).toUpperCase() || product;
    }
  }
  const pc = s.position_config;
  if (pc && typeof pc === "object") {
    if (!symbol) symbol = symbolFromStrategy({ ...s, symbols: arr });
    const pq = Number((pc as { quantity?: unknown }).quantity ?? 0);
    if (pq >= 1) quantity = Math.floor(pq);
    const ex = String((pc as { exchange?: unknown }).exchange ?? "").trim();
    if (ex) exchange = ex.toUpperCase();
    const op = String((pc as { orderProduct?: unknown }).orderProduct ?? "").trim();
    if (op) product = op.toUpperCase();
  }
  return {
    symbol,
    exchange,
    quantity: String(Math.max(1, quantity)),
    product: product || (s.is_intraday ? "MIS" : "CNC"),
  };
}

// ── StrategiesPanel ────────────────────────────────────────────────────────────
function StrategiesPanel({ broker }: { broker: string }) {
  const [showGuide, setShowGuide] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [entryExitOpen, setEntryExitOpen] = useState<Record<string, boolean>>({});
  // Per-strategy fire-signal state
  const [firePanel, setFirePanel] = useState<Record<string, {
  open: boolean;
    symbol: string;
    exchange: string;
    quantity: string;
    product: string;
    firing: boolean;
    aiOverride: boolean;
  }>>({});
  /** Go live: confirm symbol/qty before is_active=true */
  const [goLive, setGoLive] = useState<{
    strategy: Strategy;
    symbol: string;
    exchange: string;
    quantity: string;
    product: string;
  } | null>(null);
  const [goLiveLoading, setGoLiveLoading] = useState(false);
  const brokerLabel = broker.charAt(0).toUpperCase() + broker.slice(1);
  const { subscription } = useSubscription();
  const stratLimits = getAlgoStrategyLimits(subscription?.plan_id);
  const canDeleteStrategies = stratLimits?.allowDeleteStrategies ?? false;
  const atStrategyCap = isAtCustomStrategyCap(strategies.length, stratLimits);

  const getFireState = (id: string) => firePanel[id] ?? {
    open: false, symbol: "", exchange: "NSE", quantity: "1", product: "MIS", firing: false, aiOverride: false,
  };

  const setFireState = (id: string, patch: Partial<typeof firePanel[string]>) =>
    setFirePanel(fp => ({ ...fp, [id]: { ...getFireState(id), ...patch } }));

  const fireSignal = async (strategy: Strategy, action: "BUY" | "SELL") => {
    const fs = getFireState(strategy.id);
    const sym = fs.symbol.trim().toUpperCase() || symbolFromStrategy(strategy);
    if (!sym) { toast.error("Enter a symbol to fire this signal"); return; }
    const qty = parseInt(fs.quantity) || 1;

    setFireState(strategy.id, { firing: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Use fire-strategy-signal which routes the order under THIS strategy
      // and skips the admin assignment check (user owns the strategy)
      const res = await supabase.functions.invoke("fire-strategy-signal", {
        body: {
          strategy_id: strategy.id,
          symbol:      sym,
          exchange:    fs.exchange,
          action,
          quantity:    qty,
          product:     fs.product,
          ai_override: fs.aiOverride ?? false,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = res.data as any;
      if (res.error || result?.error) {
        const aiRejection = result?.ai_override;
        if (aiRejection?.decision === "REJECT") {
          toast.error(
            `AI Override REJECTED: ${aiRejection.reason}\n\nRisks: ${(aiRejection.risks ?? []).join(", ")}\nSuggested: ${aiRejection.suggestedAction ?? "Wait."}`,
            { duration: 15000 },
          );
        } else {
          toast.error(result?.error ?? "Signal failed");
        }
    } else {
        const oid = result?.orderid ?? result?.broker_order_id ?? "placed";
        toast.success(
          `${action} signal fired on "${strategy.name}" — ${sym} · #${String(oid).slice(-8)}`,
          { duration: 5000 }
        );
        setFireState(strategy.id, { open: false });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Signal failed");
    } finally {
      setFireState(strategy.id, { firing: false });
    }
  };

  const loadStrategies = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Could not load strategies: sign in session not ready.");
        return;
      }
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const list = (res.data as any)?.strategies;
      if (Array.isArray(list)) {
        setStrategies(list);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load strategies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStrategies(); }, []);

  const toggleStrategyOff = async (id: string) => {
    setToggleLoading(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "toggle", strategy_id: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const err = (res.data as { error?: string })?.error;
      if (res.error || err) {
        toast.error(String(err ?? res.error?.message ?? "Could not change deployment status"));
        return;
      }
      await loadStrategies();
    } finally {
      setToggleLoading(null);
    }
  };

  const openGoLive = async (s: Strategy) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Sign in required");
      return;
    }
    const { data: integ } = await (supabase as any)
      .from("user_trading_integration")
      .select("is_active, openalgo_api_key, openalgo_username")
      .eq("user_id", user.id)
      .maybeSingle();
    const row = integ as { is_active?: boolean; openalgo_api_key?: string; openalgo_username?: string } | null;
    const brokerOk = Boolean(
      row?.is_active &&
        (String(row.openalgo_api_key ?? "").trim() || String(row.openalgo_username ?? "").trim()),
    );
    if (!brokerOk) {
      toast.error(
        "Connect your broker (OpenAlgo) on Home or AI Prediction first, then return here to go live.",
        { duration: 9000 },
      );
      return;
    }
    const d = defaultsForGoLive(s);
    setGoLive({ strategy: s, ...d });
  };

  const confirmGoLive = async () => {
    if (!goLive) return;
    const sym = goLive.symbol.trim().toUpperCase();
    const qty = parseInt(goLive.quantity, 10);
    if (!sym) {
      toast.error("Enter a trading symbol (e.g. RELIANCE, INFY)");
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error("Quantity must be at least 1");
      return;
    }
    setGoLiveLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Sign in required");
        return;
      }
      const symbolsPayload = [
        {
          symbol: sym,
          exchange: goLive.exchange.trim().toUpperCase() || "NSE",
          quantity: qty,
          product_type: goLive.product.trim().toUpperCase() || "MIS",
        },
      ];
      const prevPc = goLive.strategy.position_config;
      const position_config = {
        ...(prevPc && typeof prevPc === "object" ? prevPc : {}),
        quantity: qty,
        exchange: goLive.exchange.trim().toUpperCase() || "NSE",
        orderProduct: goLive.product.trim().toUpperCase() || "MIS",
      };

      const up = await supabase.functions.invoke("manage-strategy", {
        body: {
          action: "update",
          strategy_id: goLive.strategy.id,
          symbols: symbolsPayload,
          position_config,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const upErr = (up.data as { error?: string })?.error;
      if (up.error || upErr) {
        toast.error(String(upErr ?? up.error?.message ?? "Could not save symbol/quantity"));
        return;
      }

      const tog = await supabase.functions.invoke("manage-strategy", {
        body: { action: "toggle", strategy_id: goLive.strategy.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const togErr = (tog.data as { error?: string })?.error;
      if (tog.error || togErr) {
        toast.error(String(togErr ?? tog.error?.message ?? "Could not activate strategy"));
        return;
      }
      toast.success(`"${goLive.strategy.name}" is live — ${sym} × ${qty} (${goLive.exchange})`);
      setGoLive(null);
      await loadStrategies();
    } finally {
      setGoLiveLoading(false);
    }
  };

  const onToggleClick = (s: Strategy) => {
    if (s.is_active) {
      void toggleStrategyOff(s.id);
      return;
    }
    void openGoLive(s);
  };

  const deleteStrategy = async (id: string, name: string) => {
    if (!confirm(`Delete strategy "${name}"?`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const del = await supabase.functions.invoke("manage-strategy", {
        body: { action: "delete", strategy_id: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const delErr = (del.data as { error?: string })?.error;
      if (del.error || delErr) {
        toast.error(String(delErr ?? del.error?.message ?? "Failed to delete strategy"));
        return;
      }
      toast.success("Strategy deleted");
      await loadStrategies();
    } catch {
      toast.error("Failed to delete strategy");
    }
  };

  const openCreateBuilder = () => {
    if (atStrategyCap && stratLimits) {
      toast.error(strategyCapToastMessage(stratLimits));
      return;
    }
    setEditingStrategy(null);
    setBuilderOpen(true);
  };

  const openEditBuilder = (strategy: Strategy) => {
    if (strategy.is_active) {
      toast.error("Deactivate this strategy before editing.");
      return;
    }
    setEditingStrategy(strategy);
    setBuilderOpen(true);
  };

  const conditionCount = (s: Strategy): number => {
    const entryGroups = Array.isArray(s.entry_conditions?.groups) ? s.entry_conditions?.groups : [];
    const exitGroups = Array.isArray(s.exit_conditions?.indicatorGroups) ? s.exit_conditions?.indicatorGroups : [];
    let count = 0;
    for (const g of entryGroups ?? []) count += Array.isArray(g?.conditions) ? g.conditions.length : 0;
    for (const g of exitGroups ?? []) count += Array.isArray(g?.conditions) ? g.conditions.length : 0;
    return count;
  };

  const copyWebhook = (strategy: Strategy) => {
    const url = strategy.webhook_url;
    if (!url) { toast.error("No webhook URL — strategy may not be synced to OpenAlgo yet"); return; }
    navigator.clipboard.writeText(url);
    setCopiedId(strategy.id);
    toast.success("Webhook URL copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Card className="bg-zinc-950 border border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-purple-400" />
            Auto Strategies
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <button
              onClick={loadStrategies}
              className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={openCreateBuilder}
              disabled={atStrategyCap}
              className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 text-[11px] text-zinc-400 hover:text-white hover:border-purple-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">
          Execute trades directly from ChartMate or connect any signal source
          </p>
        </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        <AlgoStrategyBuilder
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          existing={editingStrategy}
          onSaved={() => { void loadStrategies(); }}
        />

        <Dialog open={goLive != null} onOpenChange={(o) => { if (!o) setGoLive(null); }}>
          <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Go live — confirm execution</DialogTitle>
              <DialogDescription className="text-zinc-400 text-xs">
                ChartMate sends orders through OpenAlgo to your broker. Set the symbol and quantity that
                match your margin and exchange rules (same fields OpenAlgo uses: symbol, exchange, quantity, product).
              </DialogDescription>
            </DialogHeader>
            {goLive && (
              <div className="space-y-3 py-1">
                <p className="text-xs text-zinc-500 font-medium truncate">{goLive.strategy.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-zinc-500 text-[10px]">Symbol *</Label>
                    <Input
                      value={goLive.symbol}
                      onChange={(e) => setGoLive((g) => g ? { ...g, symbol: e.target.value.toUpperCase() } : null)}
                      placeholder="RELIANCE"
                      className="bg-zinc-900 border-zinc-700 text-white font-mono text-sm h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-500 text-[10px]">Exchange</Label>
                    <Select
                      value={goLive.exchange}
                      onValueChange={(v) => setGoLive((g) => g ? { ...g, exchange: v } : null)}
                    >
                      <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {EXCHANGES.map((e) => (
                          <SelectItem key={e.value} value={e.value} className="text-xs">{e.value}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-zinc-500 text-[10px]">Quantity *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={goLive.quantity}
                      onChange={(e) => setGoLive((g) => g ? { ...g, quantity: e.target.value } : null)}
                      className="bg-zinc-900 border-zinc-700 text-white text-sm h-9"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-zinc-500 text-[10px]">Product (OpenAlgo / broker)</Label>
                    <Select
                      value={goLive.product}
                      onValueChange={(v) => setGoLive((g) => g ? { ...g, product: v } : null)}
                    >
                      <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {PRODUCT_TYPES.map((p) => (
                          <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                className="border-zinc-700 text-zinc-300"
                onClick={() => setGoLive(null)}
                disabled={goLiveLoading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-purple-600 hover:bg-purple-500 text-white"
                onClick={() => void confirmGoLive()}
                disabled={goLiveLoading}
              >
                {goLiveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate strategy"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Strategy list */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                    </div>
        ) : strategies.length === 0 ? (
          <div className="text-center py-5 px-2">
            <Zap className="h-7 w-7 text-zinc-800 mx-auto mb-2" />
            <p className="text-xs text-zinc-600">No strategies yet</p>
            <p className="text-[10px] text-zinc-700 mt-0.5 max-w-xs mx-auto">
              Add a strategy for webhooks and live control—options and paper/live tabs on this dashboard match the full platform story.
            </p>
          </div>
        ) : (
                    <div className="space-y-2">
            {strategies.map(s => {
              const fs = getFireState(s.id);
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border transition-colors ${
                    s.is_active
                      ? "bg-purple-500/5 border-purple-500/20"
                      : "bg-zinc-900 border-zinc-800"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 p-3">
                    <span className="flex-1 text-sm font-semibold text-white truncate">{s.name}</span>

                    <button
                      onClick={() => openEditBuilder(s)}
                      disabled={s.is_active}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-zinc-700 text-zinc-500 hover:border-purple-500/40 hover:text-purple-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-zinc-700 disabled:hover:text-zinc-500"
                      title={s.is_active ? "Deactivate strategy to edit" : "Edit strategy builder configuration"}
                    >
                      <LineChart className="h-3 w-3" />
                      Edit
                    </button>

                    {/* Fire Signal button */}
                    <button
                      onClick={() => setFireState(s.id, { open: !fs.open })}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border transition-all ${
                        fs.open
                          ? "bg-teal-500/20 border-teal-500/40 text-teal-300"
                          : "border-zinc-700 text-zinc-500 hover:border-teal-500/40 hover:text-teal-400"
                      }`}
                      title="Execute: place an immediate MARKET BUY/SELL via OpenAlgo (manual test). Strategy must be ACTIVE. This is not the PDF backtester — it sends a real order if your broker session is valid."
                    >
                      <Zap className="h-3 w-3" />
                      Execute
                    </button>

                    {/* Active toggle — OFF immediately; ON opens go-live dialog */}
                    <button
                      type="button"
                      onClick={() => onToggleClick(s)}
                      disabled={toggleLoading === s.id || goLiveLoading}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        s.is_active ? "bg-purple-600" : "bg-zinc-700"
                      } disabled:opacity-60`}
                      title={s.is_active ? "Deactivate (stop automated use of this strategy)" : "Go live — set symbol & quantity, then activate"}
                    >
                      {toggleLoading === s.id ? (
                        <Loader2 className="h-3 w-3 text-white mx-auto animate-spin" />
                      ) : (
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          s.is_active ? "translate-x-[18px]" : "translate-x-0.5"
                        }`} />
                      )}
                    </button>

                    {canDeleteStrategies ? (
                      <button
                        onClick={() => deleteStrategy(s.id, s.name)}
                        className="p-0.5 text-zinc-700 hover:text-red-400 transition-colors"
                        title="Delete strategy"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                </div>

                  {/* Meta badges */}
                  <div className="flex items-center gap-1.5 flex-wrap px-3 pb-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      s.is_active ? "bg-purple-500/15 text-purple-300" : "bg-zinc-800 text-zinc-500"
                    }`}>
                      {s.is_active ? "● ACTIVE" : "○ INACTIVE"}
                </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{s.trading_mode}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                      {(s.market_type ?? "stocks").toUpperCase()}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                      {s.is_intraday ? "Intraday" : "Positional"}
                </span>
                    <span className="text-[10px] text-zinc-700">{s.start_time}–{s.end_time}</span>
                    {s.stop_loss_pct && (
                      <span className="text-[10px] text-red-500/70">SL {s.stop_loss_pct}%</span>
                    )}
                    {s.take_profit_pct && (
                      <span className="text-[10px] text-green-500/70">TP {s.take_profit_pct}%</span>
                    )}
                    <span className="text-[10px] text-zinc-500">
                      {conditionCount(s)} logic rules
                    </span>
                </div>

                  {/* ── Fire Signal panel ── */}
                  {fs.open && (
                    <div className="mx-3 mb-3 rounded-lg border border-teal-500/20 bg-zinc-950 p-3 space-y-3">
                      <p className="text-[11px] font-semibold text-teal-400 flex items-center gap-1.5">
                        <Zap className="h-3 w-3" />
                        Fire Signal — {s.name}
                      </p>

                      {/* Symbol + Exchange */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-zinc-600 text-[10px]">Symbol *</Label>
                          <Input
                            placeholder={symbolFromStrategy(s) || "RELIANCE"}
                            value={fs.symbol}
                            onChange={e => setFireState(s.id, { symbol: e.target.value.toUpperCase() })}
                            className="bg-zinc-900 border-zinc-700 text-white font-mono text-xs h-8"
                          />
              </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-600 text-[10px]">Exchange</Label>
                          <Select value={fs.exchange} onValueChange={v => setFireState(s.id, { exchange: v })}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-8 text-xs">
                              <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                              {EXCHANGES.map(e => (
                                <SelectItem key={e.value} value={e.value} className="text-xs text-zinc-200">{e.value}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                      </div>

                      {/* Qty + Product */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-zinc-600 text-[10px]">Quantity</Label>
                          <Input
                            type="number" min={1}
                            value={fs.quantity}
                            onChange={e => setFireState(s.id, { quantity: e.target.value })}
                            className="bg-zinc-900 border-zinc-700 text-white text-xs h-8"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-zinc-600 text-[10px]">Product</Label>
                          <Select value={fs.product} onValueChange={v => setFireState(s.id, { product: v })}>
                            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-8 text-xs">
                              <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                              {PRODUCT_TYPES.map(p => (
                                <SelectItem key={p.value} value={p.value} className="text-xs text-zinc-200">{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                  </div>
                </div>

                      {/* AI Override toggle */}
                      <div className="flex items-center justify-between gap-2 px-1 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900/50">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-zinc-300 font-medium flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-amber-400" />
                            AI Override
                          </p>
                          <p className="text-[9px] text-zinc-500 pl-4">AI will validate & accept/reject trade before execution</p>
                        </div>
                        <Switch
                          checked={fs.aiOverride ?? false}
                          onCheckedChange={(v) => setFireState(s.id, { aiOverride: v })}
                        />
                      </div>

                      {/* BUY / SELL fire buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => fireSignal(s, "BUY")}
                          disabled={fs.firing}
                          className="py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                        >
                          {fs.firing
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><TrendingUp className="h-3.5 w-3.5" /> BUY Signal</>
                          }
                        </button>
                        <button
                          onClick={() => fireSignal(s, "SELL")}
                          disabled={fs.firing}
                          className="py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                        >
                          {fs.firing
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><TrendingDown className="h-3.5 w-3.5" /> SELL Signal</>
                          }
                        </button>
                </div>

                      <p className="text-[10px] text-zinc-700 text-center">
                        {fs.aiOverride ? "AI validates → then MARKET order on " : "MARKET order · executes instantly on "}{brokerLabel}
                      </p>
                    </div>
                  )}

                  {/* Entry / Exit Points viewer */}
                  <div className="mx-3 mb-2">
                    <button
                      onClick={() => setEntryExitOpen(p => ({ ...p, [s.id]: !p[s.id] }))}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] font-medium transition-all ${
                        entryExitOpen[s.id]
                          ? "bg-teal-500/10 border-teal-500/30 text-teal-300"
                          : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-teal-500/30 hover:text-teal-400"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Target className="h-3 w-3" />
                        Entry & Exit Points
                      </span>
                      <ChevronRight className={`h-3 w-3 transition-transform ${entryExitOpen[s.id] ? "rotate-90" : ""}`} />
                    </button>
                    {entryExitOpen[s.id] && (
                      <div className="mt-2">
                        <StrategyEntrySignalsPanel
                          symbol={(() => {
                            const sym = symbolFromStrategy(s);
                            return sym.includes(".") ? sym : `${sym || "RELIANCE"}.NS`;
                          })()}
                        />
                      </div>
                    )}
                  </div>

                  {/* Webhook URL (for external integrations) */}
                  {s.webhook_url && (
                    <div className="flex items-center gap-1.5 mx-3 mb-3 bg-black/30 border border-zinc-800 rounded p-1.5">
                      <Webhook className="h-3 w-3 text-zinc-600 shrink-0" />
                      <code className="text-[9px] text-zinc-600 truncate flex-1">{s.webhook_url}</code>
                      <button
                        onClick={() => copyWebhook(s)}
                        className="shrink-0 text-zinc-700 hover:text-zinc-400 transition-colors"
                        title="Copy webhook (for external use)"
                      >
                        {copiedId === s.id
                          ? <CheckCircle2 className="h-3 w-3 text-teal-400" />
                          : <Copy className="h-3 w-3" />
                        }
                      </button>
                    </div>
                        )}
                      </div>
              );
            })}
                    </div>
        )}

        {/* External integrations — collapsible, optional */}
        <button
          onClick={() => setShowGuide(g => !g)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Webhook className="h-3 w-3 text-zinc-600" />
            Connect external signal source (optional)
          </span>
          <ChevronRight className={`h-3 w-3 transition-transform ${showGuide ? "rotate-90" : ""}`} />
        </button>

        {showGuide && (
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-3 -mt-1 space-y-2">
            <p className="text-[10px] text-zinc-400">
              Each strategy has a webhook URL. Any system that can make HTTP POST requests can trigger orders automatically — your own Python script, a Pine Script alert, a cron job, anything.
            </p>
            <ol className="space-y-1 text-[10px] text-zinc-500">
              <li className="flex items-start gap-2">
                <span className="text-zinc-400 font-bold shrink-0">1.</span>
                Copy the webhook URL from the strategy card above
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-400 font-bold shrink-0">2.</span>
                Send a POST request to it with the order payload
              </li>
              <li className="flex items-start gap-2">
                <span className="text-zinc-400 font-bold shrink-0">3.</span>
                Order fires on your {brokerLabel} account instantly
              </li>
            </ol>
            <div className="p-2 bg-zinc-950 rounded text-[9px] text-zinc-500 font-mono break-all">
              {`POST {webhook_url}`}<br/>
              {`{"action":"BUY","symbol":"RELIANCE","exchange":"NSE","quantity":10,"product":"MIS","pricetype":"MARKET"}`}
            </div>
            <p className="text-[10px] text-zinc-700">
              Or just use the "Execute" button on each strategy above — no external tools needed.
            </p>
          </div>
              )}
        </CardContent>
      </Card>
  );
}

// ── LiveDashboard ──────────────────────────────────────────────────────────────
function LiveDashboard({ broker }: { broker: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [portfolioKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"portfolio" | "options">("portfolio");
  const [robotEnabled, setRobotEnabledState] = useState<boolean>(() => isRobotExperienceEnabled());
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => prefersReducedMotion());
  const [entryReady, setEntryReady] = useState<boolean>(() => reduceMotion);

  useEffect(() => {
    void trackRobotMetric("dashboard_engaged");
  }, []);

  useEffect(() => {
    if (!robotEnabled || reduceMotion) {
      setEntryReady(true);
      return;
    }
    setEntryReady(false);
    const id = window.setTimeout(() => setEntryReady(true), 420);
    return () => window.clearTimeout(id);
  }, [robotEnabled, reduceMotion]);

  useEffect(() => {
    const qp = new URLSearchParams(location.search);
    const tab = qp.get("tab");
    if (tab === "options") {
      setActiveTab("options");
      return;
    }
    if (tab === "portfolio") {
      setActiveTab("portfolio");
      return;
    }
    if (tab === "ai-trading-analysis") {
      qp.delete("tab");
      const rest = qp.toString();
      navigate(`/ai-trading-analysis${rest ? `?${rest}` : ""}`, { replace: true });
      return;
    }
    if (tab === "backtest") {
      qp.delete("tab");
      const rest = qp.toString();
      navigate(`/backtest${rest ? `?${rest}` : ""}`, { replace: true });
      return;
    }
    if (tab === "scanner") {
      qp.delete("tab");
      const rest = qp.toString();
      navigate(`/ai-trading-analysis${rest ? `?${rest}` : ""}`, { replace: true });
      return;
    }
  }, [location.search, navigate]);

  const setTab = (v: "portfolio" | "options") => {
    setActiveTab(v);
    void trackRobotMetric("dashboard_engaged");
    navigate(`/trading-dashboard?tab=${v}`, { replace: true });
  };

  const onToggleRobot = (checked: boolean) => {
    setRobotExperienceEnabled(checked);
    setRobotEnabledState(checked);
    void trackRobotMetric("dashboard_engaged");
  };

  const onToggleMotion = (checked: boolean) => {
    // checked=true => allow motion; our preference stores reduced motion boolean.
    const reduce = !checked;
    setReducedMotionPreference(reduce);
    setReduceMotion(reduce);
  };

  return (
    <TradingDashboardShell broker={broker}>
      <EngineBootSequence enabled={robotEnabled} reduceMotion={reduceMotion} />
      <div className={`grid grid-cols-1 gap-5 items-start transition-all duration-500 ${entryReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}>
        <div className="min-w-0">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setTab(v as "portfolio" | "options")}
            className="w-full"
          >
            <div className="mb-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-xs text-zinc-200">{ALGO_ROBOT_COPY.controlLine}</p>
                <p className="text-[11px] text-zinc-500">{ALGO_ROBOT_COPY.legalSafeHint}</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-zinc-600">
                  Variant: {getRobotExperimentVariant(robotEnabled)}
                </span>
                <label className="flex items-center gap-2 text-zinc-400">
                  Robot mode
                  <Switch checked={robotEnabled} onCheckedChange={onToggleRobot} />
                </label>
                <label className="flex items-center gap-2 text-zinc-400">
                  Motion
                  <Switch checked={!reduceMotion} onCheckedChange={onToggleMotion} />
                </label>
              </div>
            </div>
            <ExecutionEventFeed enabled={robotEnabled} />
            <p className="text-[11px] text-zinc-500 mb-2">
              Same algo hub for cash and F&amp;O — option symbols and premiums are streamed from the live market via
              OpenAlgo when connected; paper-only strategies use saved rules without live broker fills.
            </p>
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-zinc-800 h-auto gap-1 p-1 mb-3">
              <TabsTrigger value="portfolio" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
                <BookOpen className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Live &amp; portfolio
              </TabsTrigger>
              <TabsTrigger value="options" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 text-xs sm:text-sm">
                <Zap className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Options strategies
              </TabsTrigger>
            </TabsList>

            <TabsContent value="portfolio" className="pt-0">
              <BrokerPortfolioCard key={portfolioKey} broker={broker} />
            </TabsContent>

            <TabsContent value="options" className="pt-0 min-h-[50vh]">
              <OptionsStrategiesWorkspace embedded />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TradingDashboardShell>
  );
}

export default function TradingDashboardPage() {
  return (
    <TradingDashboardAccessGate>
      {(ctx) => <LiveDashboard broker={ctx.broker} />}
    </TradingDashboardAccessGate>
  );
}
