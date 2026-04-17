/**
 * BrokerPortfolioCard
 *
 * Full broker account view — funds, positions, holdings, orders, tradebook.
 * All data pulled live from OpenAlgo → broker. OpenAlgo is completely invisible to user.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
  LineChart as RechartsLineChart, Line, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3,
  Briefcase, ClipboardList, Loader2, RefreshCw, Wallet, X, Pencil, Zap,
  TrendingUp, TrendingDown, BookOpen, Plus, Trash2, CheckCircle2, Send, Brain, Search, LineChart,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import PlaceOrderPanel from "@/components/trading/PlaceOrderPanel";
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import {
  deriveMaxHoldDaysFromExit,
  entryConditionsConfigured,
  mergeSnapshotWithBacktestRun,
  resolveEngineStrategyIdForCustom,
  type FullCustomStrategy,
} from "@/lib/backtestVectorbtPayload";
import { getStrategyParams } from "@/constants/strategyParams";
import AlgoStrategyBuilder from "@/components/trading/AlgoStrategyBuilder";
import { useSubscription } from "@/hooks/useSubscription";
import {
  getAlgoStrategyLimits,
  isAtCustomStrategyCap,
  strategyCapToastMessage,
} from "@/lib/algoStrategyLimits";
import YahooChartPanel from "@/components/YahooChartPanel";
import { runLiveEntryConditionScan, type LiveScanStrategyRow } from "@/lib/strategyLiveScan";
import { PaperTradeSetupDialog } from "@/components/trading/PaperTradeSetupDialog";
import { ALGO_ROBOT_COPY, emitAlgoRobotEvent } from "@/lib/algoRobotMessaging";
import { trackRobotMetric } from "@/lib/algoRobotExperience";
import { tradeTrackingService, type ActiveTrade } from "@/services/tradeTrackingService";

function firstListedSymbol(symbols: unknown): string {
  if (!Array.isArray(symbols) || symbols.length === 0) return "";
  const x = symbols[0];
  if (typeof x === "string") return x.trim().toUpperCase();
  if (x && typeof x === "object" && "symbol" in x) {
    return String((x as { symbol?: string }).symbol ?? "").trim().toUpperCase();
  }
  return "";
}

function defaultsForGoLiveStrategy(s: Strategy): { symbol: string; exchange: string; quantity: string; product: string } {
  const rawSyms = s.symbols as unknown;
  let symbol = firstListedSymbol(s.symbols);
  let exchange = "NSE";
  let quantity = 1;
  let product = s.is_intraday ? "MIS" : "CNC";
  if (Array.isArray(rawSyms) && rawSyms.length > 0) {
    const x0 = rawSyms[0];
    if (x0 && typeof x0 === "object") {
      const o = x0 as Record<string, unknown>;
      if (!symbol) symbol = String(o.symbol ?? "").trim().toUpperCase();
      exchange = String(o.exchange ?? exchange).toUpperCase();
      const q = Number(o.quantity ?? 1);
      if (Number.isFinite(q) && q >= 1) quantity = Math.floor(q);
      const pt = String(o.product_type ?? o.orderProduct ?? "").trim();
      if (pt) product = pt.toUpperCase();
    }
  }
  const pc = s.position_config;
  if (pc && typeof pc === "object") {
    if (!symbol) symbol = firstListedSymbol(s.symbols);
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

async function userHasBrokerForStrategies(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await (supabase as any)
    .from("user_trading_integration")
    .select("is_active, openalgo_api_key, openalgo_username")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return false;
  if (!(data as { is_active?: boolean }).is_active) return false;
  const key = String((data as { openalgo_api_key?: string }).openalgo_api_key ?? "").trim();
  const un = String((data as { openalgo_username?: string }).openalgo_username ?? "").trim();
  return Boolean(key || un);
}

// ── SymbolSearchInput (same UX as PlaceOrderPanel) ────────────────────────────
type SymbolResult = { symbol: string; description: string; full_symbol: string; exchange: string; type: string };
function SymbolSearchInput({
  value, onChange, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (symbol: string, exchange: string) => void;
}) {
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const data: SymbolResult[] = (res.data as any[]) ?? [];
      const indian = data.filter(d => d.full_symbol?.endsWith(".NS") || d.full_symbol?.endsWith(".BO"));
      setResults(indian.slice(0, 8));
      if (indian.length > 0) setOpen(true);
    } catch { /* silent */ } finally { setSearching(false); }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase();
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 320);
  };

  const handleSelect = (item: SymbolResult) => {
    onSelect(item.symbol, item.full_symbol?.endsWith(".BO") ? "BSE" : "NSE");
    setOpen(false);
    setResults([]);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <Input
          placeholder="Search symbol…"
          value={value}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="bg-zinc-900 border-zinc-700 text-white font-mono pl-8 pr-8 uppercase text-xs h-8"
        />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden">
          {results.map((item, i) => (
            <button
              key={i}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-800 text-left transition-colors border-b border-zinc-800 last:border-0"
              onMouseDown={() => handleSelect(item)}
            >
              <div className="min-w-0">
                <span className="font-mono text-white text-sm font-semibold">{item.symbol}</span>
                <p className="text-[11px] text-zinc-500 truncate">{item.description}</p>
              </div>
              <span className="text-[10px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded ml-2 shrink-0">
                {item.full_symbol?.endsWith(".BO") ? "BSE" : "NSE"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TradingView Chart Widget ──────────────────────────────────────────────────

function TradingViewChart({ symbol, exchange, height = 320 }: { symbol: string; exchange: string; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !symbol) return;
    containerRef.current.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    containerRef.current.appendChild(inner);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol(symbol, exchange),
      interval: "D",
      timezone: "Asia/Kolkata",
      theme: "dark",
      style: "1",
      locale: "en",
      hide_legend: false,
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      backgroundColor: "rgba(9,9,11,1)",
      gridColor: "rgba(39,39,42,0.6)",
    });
    containerRef.current.appendChild(script);
  }, [symbol, exchange]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container rounded-lg overflow-hidden border border-zinc-800"
      style={{ height: `${height}px`, width: "100%" }}
    />
  );
}

// Paper strategy → direction mapping
const PAPER_DIRECTION: Record<string, "LONG" | "SHORT" | "BOTH"> = {
  trend_following: "BOTH", breakout_breakdown: "BOTH", mean_reversion: "BOTH",
  momentum: "LONG", scalping: "BOTH", swing_trading: "BOTH", range_trading: "BOTH",
  news_based: "BOTH", options_buying: "LONG", options_selling: "SHORT", pairs_trading: "BOTH",
};

// Paper strategy → session (MIS=intraday, CNC/NRML=positional)
const PAPER_TO_INTRADAY: Record<string, boolean> = {
  trend_following: false, breakout_breakdown: false, mean_reversion: false,
  momentum: true, scalping: true, swing_trading: false, range_trading: false,
  news_based: true, options_buying: false, options_selling: false, pairs_trading: false,
};

interface Strategy {
  id: string;
  name: string;
  trading_mode: string;
  is_active: boolean;
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  symbols: string[];
  webhook_url?: string | null;
  paper_strategy_type?: string | null;
  risk_per_trade_pct: number;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  description?: string | null;
  market_type?: string | null;
  entry_conditions?: Record<string, unknown> | null;
  exit_conditions?: Record<string, unknown> | null;
  position_config?: Record<string, unknown> | null;
  risk_config?: Record<string, unknown> | null;
  chart_config?: Record<string, unknown> | null;
  execution_days?: number[] | null;
  created_at: string;
}

interface StrategyForm {
  name: string;
  description: string;
  trading_mode: string;
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  risk_per_trade_pct: string;
  stop_loss_pct: string;
  take_profit_pct: string;
  symbols_raw: string;
}

const EMPTY_STRATEGY: StrategyForm = {
  name: "",
  description: "",
  trading_mode: "LONG",
  is_intraday: true,
  start_time: "09:15",
  end_time: "15:15",
  squareoff_time: "15:15",
  risk_per_trade_pct: "1",
  stop_loss_pct: "2",
  take_profit_pct: "4",
  symbols_raw: "",
};

const EXCHANGES_LIST = ["NSE","BSE","NFO","BFO","CDS","MCX","NCDEX"];
const PRODUCT_LIST   = ["CNC","MIS","NRML","CO","BO"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortfolioData {
  broker: string | null;
  token_expires_at: string | null;
  token_expired: boolean;
  funds: Record<string, unknown> | null;
  positions: PositionRow[];
  open_positions?: PositionRow[];
  holdings: HoldingRow[];
  orders: OrderRow[];
  tradebook: TradeRow[];
  errors: Record<string, string | null>;
}

interface PositionRow {
  symbol?: string;
  tradingsymbol?: string; exchange?: string; product?: string;
  quantity?: number;
  netqty?: number; avgprice?: number; ltp?: number; pnl?: number;
  average_price?: number;
  buyqty?: number; sellqty?: number; buyavgprice?: number; sellavgprice?: number;
  [key: string]: unknown;
}
interface HoldingRow {
  symbol?: string;
  tradingsymbol?: string; exchange?: string; quantity?: number;
  average_price?: number;
  avgprice?: number; ltp?: number; pnl?: number; close?: number;
  [key: string]: unknown;
}
interface OrderRow {
  symbol?: string;
  action?: string;
  orderid?: string; tradingsymbol?: string; exchange?: string;
  transactiontype?: string; quantity?: number; filledquantity?: number;
  filled_quantity?: number;
  average_price?: number;
  order_status?: string;
  timestamp?: string;
  averageprice?: number; price?: number; product?: string; pricetype?: string;
  status?: string; updatetime?: string; ordertime?: string; rejectreason?: string;
  [key: string]: unknown;
}
interface TradeRow {
  symbol?: string;
  action?: string;
  quantity?: string | number;
  average_price?: string | number;
  timestamp?: string;
  tradingsymbol?: string; exchange?: string; transactiontype?: string;
  tradedquantity?: string | number; averageprice?: string | number;
  product?: string; orderid?: string; fillid?: string;
  pnl?: string | number; tradetime?: string; ordertime?: string;
  [key: string]: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CANCELLABLE = ["open", "pending", "trigger pending", "after market order req received"];

function scrollToBrokerConnect() {
  document.getElementById("broker-sync-connect")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** When strategy is off, hide noisy deploy rows (pending/cancelled); keep executed as history. */
function deployStateForDisplay(
  s: Strategy,
  dep: {
    status: "pending" | "executed" | "cancelled" | "expired";
    action: "BUY" | "SELL";
    symbol: string;
    exchange?: string | null;
    quantity: number;
    created_at: string;
    last_checked_at?: string | null;
    executed_at?: string | null;
    broker_order_id?: string | null;
    error_message?: string | null;
    deploy_overrides?: Record<string, unknown> | null;
  } | null | undefined,
) {
  if (!dep) return null;
  if (!s.is_active && dep.status !== "executed") return null;
  return dep;
}

function isLiveChecking(dep: {
  status: "pending" | "executed" | "cancelled" | "expired";
  last_checked_at?: string | null;
} | null | undefined): boolean {
  if (!dep || dep.status !== "pending") return false;
  const last = dep.last_checked_at ? Date.parse(dep.last_checked_at) : NaN;
  if (!Number.isFinite(last)) return false;
  return Date.now() - last <= 30_000;
}

function relativeSecondsFrom(ts?: string | null, nowMs: number = Date.now()): number | null {
  if (!ts) return null;
  const parsed = Date.parse(ts);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((nowMs - parsed) / 1000));
}

function strategyMachineState(
  dep: {
    status: "pending" | "executed" | "cancelled" | "expired";
    last_checked_at?: string | null;
    error_message?: string | null;
  } | null | undefined,
  isActive: boolean,
) {
  if (!isActive) return { key: "idle", label: ALGO_ROBOT_COPY.strategyStates.idle };
  if (!dep) return { key: "forming", label: ALGO_ROBOT_COPY.strategyStates.forming };
  if (dep.status === "executed") return { key: "executed", label: ALGO_ROBOT_COPY.strategyStates.executed };
  if (dep.status === "pending" && dep.last_checked_at) return { key: "scanning", label: ALGO_ROBOT_COPY.strategyStates.scanning };
  if (dep.status === "pending") return { key: "awaiting", label: ALGO_ROBOT_COPY.strategyStates.awaiting };
  if (dep.status === "cancelled") return { key: "validating", label: ALGO_ROBOT_COPY.strategyStates.validating };
  return { key: "ready", label: ALGO_ROBOT_COPY.strategyStates.ready };
}

function formatDeployReason(message?: string | null): string {
  const msg = String(message ?? "").trim();
  if (!msg) return "";
  if (msg.startsWith("__QUEUED_FOR_MONITOR__")) {
    return "Queued for monitor - waiting for next live tick.";
  }
  if (/No IPs configured for this app/i.test(msg)) {
    return "Kite Connect blocked this order: server IP whitelist is not configured in the Kite app.";
  }
  return msg;
}

function parseDeployReasonDetails(message?: string | null): {
  headline: string;
  checks: Array<{ ok: boolean; label: string }>;
} {
  const text = formatDeployReason(message);
  if (!text) return { headline: "", checks: [] };
  const lines = text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const checks = lines
    .filter((x) => x.startsWith("PASS ") || x.startsWith("FAIL "))
    .map((x) => ({
      ok: x.startsWith("PASS "),
      label: x.replace(/^PASS\s+|^FAIL\s+/, "").trim(),
    }));
  const headline = lines.find((x) => !x.startsWith("PASS ") && !x.startsWith("FAIL ") && x !== "Checks:")
    ?? text;
  return { headline, checks };
}

// Well-known short US/global tickers that must never get .NS appended
const KNOWN_GLOBAL_TICKERS = new Set([
  "AAPL","MSFT","GOOGL","GOOG","AMZN","META","TSLA","NVDA","NFLX","AMD",
  "INTC","ORCL","CSCO","ADBE","CRM","PYPL","UBER","LYFT","SNAP","TWTR",
  "JPM","BAC","GS","MS","C","WFC","BRK","V","MA","AXP",
  "JNJ","PFE","MRK","ABBV","LLY","UNH","CVS","WBA",
  "XOM","CVX","COP","BP","SHEL",
  "DIS","CMCSA","T","VZ","TMUS",
  "WMT","COST","TGT","AMGN","GILD","BIIB","REGN","VRTX",
  "SPY","QQQ","IWM","GLD","SLV","USO",
  "BTC","ETH","BNB","SOL","ADA","DOGE","XRP",
]);

function toYahooChartSymbol(sym: string, exchange?: string | null): string {
  const s = String(sym ?? "").trim().toUpperCase();
  const ex = String(exchange ?? "").trim().toUpperCase();
  if (!s) return "";
  // Already has a Yahoo suffix — pass through unchanged
  if (
    s.includes("=") || s.includes("-") || s.includes("^") ||
    s.endsWith(".NS") || s.endsWith(".BO") || s.endsWith(".L") ||
    s.endsWith(".DE") || s.endsWith(".PA") || s.endsWith(".HK") ||
    s.endsWith(".T")  || s.endsWith(".AX") || s.endsWith(".TO")
  ) return s;
  // Known global/US ticker → never append .NS regardless of stored exchange
  if (KNOWN_GLOBAL_TICKERS.has(s)) return s;
  // Explicitly Indian exchanges → add suffix (but only if symbol looks Indian)
  if ((ex === "BSE") && /^[A-Z]{2,}$/.test(s)) return `${s}.BO`;
  if ((ex === "NSE") && /^[A-Z]{6,}$/.test(s)) return `${s}.NS`;
  // Indian multi-char ticker (≥6 letters, only alpha, no other exchange clue)
  if (/^[A-Z]{6,}$/.test(s) && ex !== "GLOBAL" && ex !== "NMS" && ex !== "NYQ" && ex !== "NGM") {
    return `${s}.NS`;
  }
  // Everything else (US, global) → use as-is
  return s;
}

/** Stringify RHS from algo builder (`rhs: { kind, value } | { kind, id, period }`) or plain scalars. */
function formatConditionOperand(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v !== "object") return String(v);
  const o = v as Record<string, unknown>;
  const k = String(o.kind ?? "");
  if (k === "number" && o.value != null) return String(o.value);
  if (k === "indicator") {
    const id = String(o.id ?? o.indicator ?? "indicator").trim();
    const period = o.period != null ? String(o.period) : "";
    return period ? `${id}(${period})` : id;
  }
  try {
    const s = JSON.stringify(o);
    return s.length > 96 ? `${s.slice(0, 93)}…` : s;
  } catch {
    return "[value]";
  }
}

function entryConditionSummaryLines(entry: unknown): string[] {
  if (!entry || typeof entry !== "object") return [];
  const e = entry as Record<string, unknown>;
  const out: string[] = [];
  const preset = String(e.algoGuidePreset ?? "").trim();
  if (preset) {
    out.push(`Built-in rule pack: ${preset.replace(/_/g, " ")}`);
  }
  const groups = Array.isArray(e.groups) ? e.groups as Array<Record<string, unknown>> : [];
  if (groups.length > 0) {
    out.push(`Group logic: ${String(e.groupLogic ?? "AND").toUpperCase()}`);
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i];
      const conds = Array.isArray(g.conditions) ? g.conditions : [];
      out.push(`Group ${i + 1}: ${String(g.groupLogic ?? "AND").toUpperCase()} · ${conds.length} condition(s)`);
      for (const c of conds.slice(0, 8)) {
        const cc = c as Record<string, unknown>;
        const indName = String(
          cc.indicator ?? cc.leftOperand ?? cc.left ?? cc.lhs ?? cc.field ?? "",
        ).trim();
        const indPeriod = cc.period != null && indName ? `(${cc.period})` : "";
        const indicator = `${indName}${indPeriod}`.trim() || "rule";
        const operator = String(
          cc.operator ?? cc.comparator ?? cc.op ?? cc.condition ?? "compare",
        ).trim();
        const rawRight = cc.value ?? cc.rightOperand ?? cc.right ?? cc.rhs ?? cc.threshold ?? null;
        const right = formatConditionOperand(rawRight);
        if (!indName && !operator && !right) {
          out.push(`- ${JSON.stringify(cc)}`);
        } else if (!right) {
          out.push(`- ${indicator} ${operator}`.trim());
        } else {
          out.push(`- ${indicator} ${operator} ${right}`.trim());
        }
      }
    }
    return out;
  }
  const timeEntry = String(e.clockEntryTime ?? "").trim();
  if (timeEntry) out.push(`Clock entry time: ${timeEntry}`);
  const mode = String(e.executionMode ?? "").trim();
  if (mode) out.push(`Execution mode: ${mode}`);
  const raw = String(e.customConditionRaw ?? "").trim();
  if (raw) out.push(`Raw rule: ${raw.slice(0, 220)}${raw.length > 220 ? "…" : ""}`);
  if (out.length === 0) {
    try {
      out.push(`Raw config: ${JSON.stringify(e).slice(0, 320)}`);
    } catch {
      out.push("Raw config available, but could not parse readable rules.");
    }
  }
  return out;
}

function buildStrategySimulationSeries(lastPrice: number, slPct: number, tpPct: number) {
  const base = Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : 100;
  const sl = base * (1 - slPct / 100);
  const tp = base * (1 + tpPct / 100);
  const steps = Array.from({ length: 12 }, (_, i) => i);
  const success: number[] = [];
  const fail: number[] = [];
  for (const i of steps) {
    // Smooth synthetic paths for visual "what if" diagnostics
    const upMove = base + (tp - base) * Math.min(1, i / 8);
    const dnMove = base - (base - sl) * Math.min(1, i / 8);
    success.push(i < 10 ? upMove : tp);
    fail.push(i < 10 ? dnMove : sl);
  }
  return steps.map((i) => ({
    step: i + 1,
    success: Number(success[i].toFixed(4)),
    fail: Number(fail[i].toFixed(4)),
    entry: Number(base.toFixed(4)),
    stopLoss: Number(sl.toFixed(4)),
    takeProfit: Number(tp.toFixed(4)),
  }));
}

type PreflightOpts = {
  tokenExpired: boolean;
  symbol: string;
  quantity: number;
  product: string;
  liveLtps: Record<string, number>;
  availableCash: number;
};

/** Returns user-facing error string or null if OK to proceed. */
function preflightOrderAgainstFunds(o: PreflightOpts): string | null {
  if (o.tokenExpired) {
    return "SESSION";
  }
  const sym = o.symbol.trim().toUpperCase();
  const px = o.liveLtps[sym] ?? 0;
  if (!Number.isFinite(px) || px <= 0) {
    return "LTP";
  }
  const notional = o.quantity * px;
  const avail = Number(o.availableCash) || 0;
  const prod = String(o.product).toUpperCase();
  if (prod === "CNC" && notional > avail * 1.005) {
    return `CNC|${notional}|${avail}`;
  }
  if (prod === "MIS" && notional > avail * 4) {
    return `MIS|${notional}|${avail}`;
  }
  return null;
}

function fmt(v: number | undefined | null, prefix = "₹") {
  if (v == null || isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${prefix}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PnlBadge({ value }: { value: number | undefined | null }) {
  const n = Number(value ?? 0);
  if (!n || isNaN(n) || Math.abs(n) < 0.005) return <span className="text-zinc-500 text-sm font-mono">₹0.00</span>;
  const pos = n > 0;
  return (
    <span className={`text-sm font-bold flex items-center gap-0.5 ${pos ? "text-emerald-400" : "text-red-400"}`}>
      {pos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {pos ? "+" : "−"}₹{Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  const map: Record<string, string> = {
    complete:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    rejected:  "bg-red-500/20 text-red-300 border-red-500/30",
    cancelled: "bg-zinc-600/30 text-zinc-400 border-zinc-600",
    open:      "bg-blue-500/20 text-blue-300 border-blue-500/30",
    pending:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };
  return (
    <Badge className={`text-xs border px-2 py-0.5 ${map[s] ?? "bg-zinc-700 text-zinc-400 border-zinc-600"}`}>
      {status ?? "—"}
    </Badge>
  );
}

// ── Universal field helpers — works across ALL 39 OpenAlgo broker adapters ────
// Each broker may return slightly different field names; we chain all known variants.

const getSymbol = (row: any): string =>
  String(
    row?.tradingsymbol ?? row?.symbol ?? row?.scrip_code ?? row?.scripcode ??
    row?.instrument_name ?? row?.isin ?? ""
  ).toUpperCase().trim();

const getAction = (row: any): string => {
  const raw = String(
    row?.transactiontype ?? row?.transaction_type ?? row?.action ??
    row?.side ?? row?.type ?? row?.trade_type ?? row?.order_side ?? ""
  ).toUpperCase().trim();
  // Normalise single-char shortcodes some brokers use
  if (raw === "B" || raw === "1")  return "BUY";
  if (raw === "S" || raw === "2" || raw === "-1") return "SELL";
  return raw;
};

const getOrderStatus = (row: any): string =>
  String(
    row?.status ?? row?.order_status ?? row?.orderstatus ?? row?.state ??
    row?.order_state ?? ""
  ).toLowerCase().trim();

const getQty = (row: any): number =>
  // Positions use netqty/net_quantity; orders/trades use quantity/filledquantity
  Math.abs(Number(
    row?.netqty ?? row?.net_quantity ?? row?.net_qty ??
    row?.quantity ?? row?.qty ??
    row?.tradedquantity ?? row?.traded_quantity ?? row?.filledquantity ??
    row?.filled_quantity ?? 0
  )) || 0;

const getFilledQty = (row: any): number =>
  Number(
    row?.filledquantity ?? row?.filled_quantity ?? row?.tradedquantity ??
    row?.traded_quantity ?? row?.quantity ?? 0
  ) || 0;

const getAvgPrice = (row: any): number =>
  Number(
    row?.avgprice ?? row?.averageprice ?? row?.average_price ?? row?.avg_price ??
    row?.tradedprice ?? row?.trade_price ?? row?.fill_price ??
    row?.buy_average ?? row?.sell_average ?? 0
  ) || 0;

const getLtp = (row: any): number =>
  Number(
    row?.ltp ?? row?.last_price ?? row?.lastprice ?? row?.last_traded_price ??
    row?.close ?? row?.closing_price ?? 0
  ) || 0;

const getTime = (row: any): string =>
  String(
    row?.tradetime ?? row?.trade_time ?? row?.filltime ?? row?.fill_time ??
    row?.ordertime ?? row?.order_time ?? row?.updatetime ?? row?.update_time ??
    row?.timestamp ?? row?.fill_timestamp ?? row?.order_timestamp ??
    row?.exchange_timestamp ?? row?.created_at ?? ""
  );

const getOrderId = (row: any): string => {
  const v =
    row?.orderid ?? row?.order_id ??
    row?.broker_order_id ?? row?.brokerOrderId ??
    row?.exchange_order_id ?? row?.exchangeOrderId ??
    row?.orderno ?? row?.order_no ?? row?.order_number ??
    row?.parentorderid ?? row?.parent_order_id ??
    row?.oms_order_id ?? row?.app_order_id ??
    "";
  return String(v ?? "").trim();
};

const getExchange = (row: any): string =>
  String(row?.exchange ?? row?.exch ?? row?.exchange_code ?? "NSE").toUpperCase().trim();

const getProduct = (row: any): string =>
  String(row?.product ?? row?.producttype ?? row?.product_type ?? row?.segment ?? "CNC").toUpperCase().trim();

// All Indian exchanges (all 39 brokers operate on these)
const INDIAN_EXCHANGES = new Set(["NSE", "BSE", "NFO", "BFO", "MCX", "CDS", "NCDEX", "BCD", "NCE", "NSECD"]);

// TradingView symbol format per exchange
const tvSymbol = (symbol: string, exchange: string): string => {
  const exch = exchange.toUpperCase();
  // Map OpenAlgo exchanges → TradingView exchange prefixes
  const TV_EXCHANGE_MAP: Record<string, string> = {
    NSE: "NSE", BSE: "BSE", NFO: "NSE", BFO: "BSE",
    MCX: "MCX", CDS: "NSE", NCDEX: "NCDEX", BCD: "BSE",
  };
  const tvExch = TV_EXCHANGE_MAP[exch] ?? exch;
  return `${tvExch}:${symbol.toUpperCase()}`;
};
// Smart money formatter: shows ₹8.23 for small amounts, ₹1.2K for thousands, ₹2.3L for lakhs
const fmtMoney = (v: number): string => {
  if (v === 0) return "₹0";
  if (v < 1000) return `₹${v.toFixed(2)}`;
  if (v < 100000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${(v / 100000).toFixed(2)}L`;
};
// Format a datetime string to HH:MM:SS or HH:MM
const fmtTime = (t: string): string => {
  if (!t) return "—";
  const parts = t.split(" ");
  // "2021-08-17 13:23:35" → "13:23:35"
  if (parts.length >= 2 && parts[1].includes(":")) return parts[1];
  // ISO "2021-08-17T13:23:35" → "13:23:35"
  const iso = t.split("T");
  if (iso.length >= 2) return iso[1].split(".")[0];
  return t;
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function BrokerPortfolioCard({ broker = "" }: { broker?: string }) {
  const [data, setData]             = useState<PortfolioData | null>(null);
  const [strategyByOrderId, setStrategyByOrderId] = useState<Record<string, string>>({});
  const [autoExitByEntryOrderId, setAutoExitByEntryOrderId] = useState<Record<string, { status: string; exit_orderid?: string | null }>>({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [actioning, setActioning]   = useState<string | null>(null);
  const [liveLtps, setLiveLtps]     = useState<Record<string, number>>({});
  const [quotesLoading, setQLoading] = useState(false);
  const [modifyOrder, setModifyOrder] = useState<OrderRow | null>(null);
  const [modifyPrice, setModifyPrice] = useState("");
  const [modifyQty, setModifyQty]     = useState("");
  const [modifyType, setModifyType]   = useState("LIMIT");
  const [showOrderModal, setShowOrderModal] = useState(false);
  /** Portfolio sub-tab (positions / orders / strategies / …) — used to deep-link from strategy hints */
  const [portfolioTab, setPortfolioTab] = useState("positions");
  const [nowMs, setNowMs] = useState(Date.now());
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [completedTrades, setCompletedTrades] = useState<ActiveTrade[]>([]);

  // ── Strategy state ─────────────────────────────────────────────────────────
  const [strategies, setStrategies]       = useState<Strategy[]>([]);
  const [stratLoading, setStratLoading]   = useState(true);
  const realtimeStratRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stratHistory, setStratHistory]   = useState<any[]>([]);
  const [showCreate, setShowCreate]       = useState(false);
  const [editingAlgoStrategy, setEditingAlgoStrategy] = useState<Strategy | null>(null);
  const [form, setForm]                   = useState<StrategyForm>(EMPTY_STRATEGY);
  const [creating, setCreating]           = useState(false);
  const [useFromPaper, setUseFromPaper]   = useState(false);
  const [paperType, setPaperType]         = useState("");
  const [backtestSymbol, setBacktestSymbol] = useState("RELIANCE");
  const [autoNameFromPaper, setAutoNameFromPaper] = useState(true);
  const [autoTimesFromPaper, setAutoTimesFromPaper] = useState(true);
  const [backtestResult, setBacktestResult] = useState<{
    totalTrades: number; wins: number; losses: number; winRate: number;
    totalReturn: number; avgReturn: number; maxDrawdown: number; profitFactor: number;
    strategyAchieved: boolean; symbol: string; strategy: string; sampleTrades?: { entryDate: string; exitDate: string; returnPct: number; profitable: boolean }[];
  } | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [deployStateByStrategy, setDeployStateByStrategy] = useState<Record<string, {
    status: "pending" | "executed" | "cancelled" | "expired";
    action: "BUY" | "SELL";
    symbol: string;
    exchange?: string | null;
    quantity: number;
    created_at: string;
    last_checked_at?: string | null;
    executed_at?: string | null;
    broker_order_id?: string | null;
    error_message?: string | null;
    deploy_overrides?: Record<string, unknown> | null;
  } | null>>({});
  const [goLive, setGoLive] = useState<{
    strategy: Strategy;
    symbol: string;
    exchange: string;
    quantity: string;
    product: string;
  } | null>(null);
  const [goLiveLoading, setGoLiveLoading] = useState(false);
  const [paperTradeStrategyId, setPaperTradeStrategyId] = useState<string | null>(null);
  const [liveDiagStrategy, setLiveDiagStrategy] = useState<Strategy | null>(null);
  const [liveDiagLastPrice, setLiveDiagLastPrice] = useState<number | null>(null);
  const [liveDiagChartReady, setLiveDiagChartReady] = useState(false);
  const [liveDiagScan, setLiveDiagScan] = useState<{
    loading: boolean;
    error: string | null;
    headline: string;
    checks: Array<{ ok: boolean; label: string }>;
    allMet: boolean;
  } | null>(null);
  const liveDiagStrategyRef = useRef<Strategy | null>(null);
  const liveDiagScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deployMapRef = useRef<typeof deployStateByStrategy>({});
  liveDiagStrategyRef.current = liveDiagStrategy;
  deployMapRef.current = deployStateByStrategy;

  const [firePanel, setFirePanel]         = useState<Record<string, {
    open: boolean; symbol: string; exchange: string; quantity: string; product: string; firing: boolean;
    aiOverride?: boolean;
    deployStartTime?: string;
    deployEndTime?: string;
    deploySquareoff?: string;
    deployEntryClock?: string;
    deployExitClock?: string;
    deployUseAutoExit?: boolean;
    backtestPaperType?: string;     backtestResult?: {
      totalTrades: number; wins: number; losses: number; winRate: number; totalReturn: number;
      maxDrawdown?: number; profitFactor?: number; backtestPeriod?: string; strategyAchieved?: boolean; achievementReason?: string;
      sampleTrades?: { entryDate: string; exitDate: string; returnPct: number; profitable: boolean }[];
      currentIndicators?: { price?: number; sma20?: number | null; rsi14?: number | null; high20d?: number; low20d?: number };
      engine?: string; dataSource?: string; sharpeRatio?: number; usedCustomConditions?: boolean;
    } | null; backtestLoading?: boolean; backtestAiAnalysis?: string | null; backtestAiLoading?: boolean;
    lastFired?: { action: "BUY" | "SELL"; symbol: string; exchange: string; quantity: string; product: string };
  }>>({});
  const brokerLabel = (broker || "Broker").charAt(0).toUpperCase() + (broker || "broker").slice(1);
  const { subscription } = useSubscription();
  const strategyLimits = getAlgoStrategyLimits(subscription?.plan_id);
  const canDeleteStrategies = strategyLimits?.allowDeleteStrategies ?? false;
  const atStrategyCap = isAtCustomStrategyCap(strategies.length, strategyLimits);

  const openNewStrategyForm = () => {
    if (atStrategyCap && strategyLimits) {
      toast.error(strategyCapToastMessage(strategyLimits));
      return;
    }
    setEditingAlgoStrategy(null);
    setShowCreate(true);
  };

  // ── Quick Trade Dialog (click on any position/trade/holding row) ──────────
  const [qtd, setQtd] = useState<{
    symbol: string; exchange: string; qty: number; avgPrice: number;
    ltp: number; pnl: number; product: string; action: "BUY" | "SELL";
    qtyInput: string; placing: boolean;
    aiAnalysis: string | null; aiLoading: boolean;
    pricetype: "MARKET" | "LIMIT" | "SL" | "SL-M";
    price: string; trigger_price: string; validity: "DAY" | "IOC";
  } | null>(null);

  const qtdSet = <K extends keyof NonNullable<typeof qtd>>(k: K, v: NonNullable<typeof qtd>[K]) =>
    setQtd(prev => prev ? { ...prev, [k]: v } : null);

  const openQuickTrade = useCallback(async (
    symbol: string, exchange: string, qty: number,
    avgPrice: number, ltp: number, pnl: number,
    product: string, defaultAction: "BUY" | "SELL",
  ) => {
    setQtd({
      symbol, exchange, qty, avgPrice, ltp, pnl, product,
      action: defaultAction, qtyInput: String(Math.abs(qty) || 1),
      placing: false, aiAnalysis: null, aiLoading: true,
      pricetype: "MARKET", price: "", trigger_price: "", validity: "DAY",
    });
    // Auto-run AI analysis
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("analyze-trade", {
        body: { symbol: symbol.toUpperCase(), exchange, action: defaultAction, quantity: Math.abs(qty) || 1, product },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const txt = (res.data as any)?.analysis ?? "No AI analysis available for this symbol.";
      setQtd(prev => prev ? { ...prev, aiAnalysis: txt, aiLoading: false } : null);
    } catch {
      setQtd(prev => prev ? { ...prev, aiAnalysis: "AI analysis temporarily unavailable.", aiLoading: false } : null);
    }
  }, []);

  const placeQuickOrder = async () => {
    if (!qtd || qtd.placing) return;
    if (qtd.pricetype === "LIMIT" && !qtd.price) { toast.error("Enter limit price"); return; }
    if ((qtd.pricetype === "SL" || qtd.pricetype === "SL-M") && !qtd.trigger_price) { toast.error("Enter trigger price"); return; }
    setQtd(prev => prev ? { ...prev, placing: true } : null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("openalgo-place-order", {
        body: {
          symbol: qtd.symbol, exchange: qtd.exchange,
          action: qtd.action, quantity: parseInt(qtd.qtyInput) || 1,
          product: qtd.product, pricetype: qtd.pricetype,
          price: qtd.price ? parseFloat(qtd.price) : 0,
          trigger_price: qtd.trigger_price ? parseFloat(qtd.trigger_price) : 0,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const result = res.data as any;
      if (res.error || result?.error) {
        toast.error(result?.error ?? "Order failed");
        setQtd(prev => prev ? { ...prev, placing: false } : null);
      } else {
        const oid = result?.orderid ?? result?.broker_order_id ?? "placed";
        toast.success(`${qtd.action} ${qtd.symbol} placed — #${String(oid).slice(-8)}`, { duration: 6000 });
        setQtd(null);
        setTimeout(() => load(true), 1500);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Order failed");
      setQtd(prev => prev ? { ...prev, placing: false } : null);
    }
  };

  const setF = <K extends keyof StrategyForm>(k: K, v: StrategyForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const applyPaperPrefill = useCallback((code: string, opts?: { forceName?: boolean; forceTimes?: boolean }) => {
    if (!code) return;
    const params = getStrategyParams(code);
    const dir  = PAPER_DIRECTION[code] ?? "BOTH";
    const intraday = PAPER_TO_INTRADAY[code] ?? false;
    const s = STRATEGIES.find(x => x.value === code);
    const shouldName = (opts?.forceName ?? false) || autoNameFromPaper;
    const shouldTimes = (opts?.forceTimes ?? false) || autoTimesFromPaper;
    const defaultStart = "09:15";
    const defaultEnd = "15:15";
    const defaultSq = "15:15";
    setForm(f => ({
      ...f,
      trading_mode: dir,
      is_intraday: intraday,
      stop_loss_pct: String(params.stopLossPercentage),
      take_profit_pct: String(params.targetProfitPercentage),
      risk_per_trade_pct: "1",
      start_time: shouldTimes ? defaultStart : f.start_time,
      end_time: shouldTimes ? defaultEnd : f.end_time,
      squareoff_time: shouldTimes ? defaultSq : f.squareoff_time,
      name: shouldName ? (s ? `${s.label} Live` : "Strategy") : f.name,
      description: f.description.trim() ? f.description : (s ? `Based on ${s.label} paper strategy` : ""),
    }));
  }, [autoNameFromPaper, autoTimesFromPaper]);


  const runBacktest = useCallback(async () => {
    const sym = backtestSymbol.trim().toUpperCase() || "RELIANCE";
    const strat = paperType || "trend_following";
    setBacktestLoading(true);
    setBacktestResult(null);
    try {
      const res = await supabase.functions.invoke("backtest-strategy", {
        body: { symbol: sym, strategy: strat, action: "BUY" },
      });
      const d = res.data as any;
      if (res.error || d?.error) {
        toast.error(d?.error ?? "Backtest failed");
        return;
      }
      setBacktestResult({
        totalTrades: d.totalTrades ?? 0,
        wins: d.wins ?? 0,
        losses: d.losses ?? 0,
        winRate: d.winRate ?? 0,
        totalReturn: d.totalReturn ?? 0,
        avgReturn: d.avgReturn ?? 0,
        maxDrawdown: d.maxDrawdown ?? 0,
        profitFactor: d.profitFactor ?? 0,
        strategyAchieved: d.strategyAchieved ?? false,
        symbol: d.symbol ?? sym,
        strategy: d.strategy ?? strat,
        sampleTrades: d.sampleTrades,
      });
      toast.success(`Backtest done: ${d.totalTrades} trades, ${d.winRate}% win rate`);
    } finally {
      setBacktestLoading(false);
    }
  }, [backtestSymbol, paperType]);

  const getFireState = (id: string) => firePanel[id] ?? {
    open: false, symbol: "", exchange: "NSE", quantity: "1", product: "MIS", firing: false,
    aiOverride: false,
    deployStartTime: "09:15",
    deployEndTime: "15:15",
    deploySquareoff: "15:15",
    deployEntryClock: "09:20",
    deployExitClock: "15:15",
    deployUseAutoExit: true,
    backtestPaperType: "trend_following",
    backtestResult: null as any,
    backtestLoading: false,
    backtestAiAnalysis: null as string | null,
    backtestAiLoading: false,
  };
  const setFireState = (id: string, patch: Partial<typeof firePanel[string]>) =>
    setFirePanel(fp => ({ ...fp, [id]: { ...getFireState(id), ...patch } }));

  const loadStrategies = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setStratLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const list = ((res.data as any)?.strategies ?? []) as Strategy[];
      setStrategies(list);

      const ids = list.map((s) => s.id);
      if (ids.length > 0) {
        const { data: pendingRows } = await (supabase as any)
          .from("pending_conditional_orders")
          .select("strategy_id,status,action,symbol,exchange,quantity,created_at,last_checked_at,executed_at,broker_order_id,error_message,deploy_overrides")
          .in("strategy_id", ids)
          .order("created_at", { ascending: false });
        const map: Record<string, any> = {};
        const statusPriority: Record<string, number> = { pending: 3, executed: 2, expired: 1, cancelled: 0 };
        for (const r of (pendingRows ?? [])) {
          const sid = String(r.strategy_id ?? "");
          if (!sid) continue;
          const rStatus = String(r.status ?? "pending");
          if (rStatus === "cancelled") continue;
          const existing = map[sid];
          // Prefer pending > executed > expired > cancelled; within same priority, most recent wins (already sorted by created_at desc)
          if (existing && (statusPriority[existing.status] ?? 0) >= (statusPriority[rStatus] ?? 0)) continue;
          map[sid] = {
            status: rStatus,
            action: String(r.action ?? "BUY"),
            symbol: String(r.symbol ?? ""),
            exchange: r.exchange ?? null,
            quantity: Number(r.quantity ?? 0),
            created_at: String(r.created_at ?? ""),
            last_checked_at: r.last_checked_at ?? null,
            executed_at: r.executed_at ?? null,
            broker_order_id: r.broker_order_id ?? null,
            error_message: r.error_message ?? null,
            deploy_overrides: (r.deploy_overrides && typeof r.deploy_overrides === "object")
              ? r.deploy_overrides as Record<string, unknown>
              : null,
          };
        }
        setDeployStateByStrategy(map);
        // Deploy history: only rows that are still relevant (hide removed / cancelled)
        const historyRows = (pendingRows ?? []).filter(
          (r: { status?: string }) => String(r.status ?? "") !== "cancelled",
        );
        setStratHistory(
          historyRows.map((r: any) => ({
            ...r,
            strategyName: list.find((s) => s.id === r.strategy_id)?.name ?? "Unknown",
          })),
        );
      } else {
        setDeployStateByStrategy({});
        setStratHistory([]);
      }
    } catch { /* silent */ } finally {
      if (!silent) setStratLoading(false);
    }
  }, []);

  const runLiveDiagConditionScan = useCallback(async () => {
    const s = liveDiagStrategyRef.current;
    if (!s) return;
    const dep = deployStateForDisplay(s, deployMapRef.current[s.id]);
    if (dep?.status !== "pending") {
      setLiveDiagScan(null);
      return;
    }
    const chartSymbol = dep.symbol || firstListedSymbol(s.symbols) || "";
    if (!chartSymbol) {
      setLiveDiagScan({
        loading: false,
        error: "No symbol configured for this deployment.",
        headline: "",
        checks: [],
        allMet: false,
      });
      return;
    }
    setLiveDiagScan({
      loading: true,
      error: null,
      headline: "",
      checks: [],
      allMet: false,
    });
    try {
      const r = await runLiveEntryConditionScan(s as unknown as LiveScanStrategyRow, {
        symbol: chartSymbol,
        exchange: dep.exchange,
        action: dep.action,
        deploy_overrides: dep.deploy_overrides ?? null,
      });
      setLiveDiagScan({
        loading: false,
        error: r.error,
        headline: r.headline,
        checks: r.checks,
        allMet: r.allMet,
      });
    } catch (e: unknown) {
      setLiveDiagScan({
        loading: false,
        error: e instanceof Error ? e.message : "Condition scan failed",
        headline: "",
        checks: [],
        allMet: false,
      });
    }
  }, []);

  useEffect(() => {
    if (liveDiagScanIntervalRef.current) {
      clearInterval(liveDiagScanIntervalRef.current);
      liveDiagScanIntervalRef.current = null;
    }
    if (!liveDiagStrategy) {
      setLiveDiagScan(null);
      setLiveDiagChartReady(false);
      return;
    }
    // Delay chart mount so the dialog animation completes before chart initialises
    const chartTimer = setTimeout(() => setLiveDiagChartReady(true), 250);
    // Run scan immediately then auto-refresh every 30 s while dialog is open
    void runLiveDiagConditionScan();
    liveDiagScanIntervalRef.current = setInterval(() => {
      void runLiveDiagConditionScan();
    }, 30_000);
    return () => {
      clearTimeout(chartTimer);
      if (liveDiagScanIntervalRef.current) {
        clearInterval(liveDiagScanIntervalRef.current);
        liveDiagScanIntervalRef.current = null;
      }
      setLiveDiagChartReady(false);
    };
  }, [liveDiagStrategy?.id, runLiveDiagConditionScan]);

  const scheduleLiveStrategiesRefresh = useCallback(() => {
    // Frequent tick updates can trigger many DB change events; coalesce them
    // into one silent refresh to keep UI live without flicker.
    if (realtimeStratRefreshRef.current) return;
    realtimeStratRefreshRef.current = setTimeout(() => {
      realtimeStratRefreshRef.current = null;
      void loadStrategies({ silent: true });
    }, 1000);
  }, [loadStrategies]);

  useEffect(() => { loadStrategies(); }, [loadStrategies]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Real-time subscription on pending_conditional_orders — no polling needed
  useEffect(() => {
    if (portfolioTab !== "strategies" && portfolioTab !== "strat-history") return;
    const channel = supabase
      .channel("pending-orders-realtime")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "pending_conditional_orders" },
        () => { scheduleLiveStrategiesRefresh(); },
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_strategies" },
        () => { scheduleLiveStrategiesRefresh(); },
      )
      .subscribe();
    return () => {
      if (realtimeStratRefreshRef.current) {
        clearTimeout(realtimeStratRefreshRef.current);
        realtimeStratRefreshRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [portfolioTab, scheduleLiveStrategiesRefresh]);

  const toggleStrategy = async (id: string) => {
    setToggleLoading(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "toggle", strategy_id: id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const err = (res.data as any)?.error;
      if (res.error || err) {
        toast.error(String(err ?? res.error?.message ?? "Could not change deployment status"));
        return;
      }
      const d = res.data as any;
      const wasJustActivated = d?.strategy?.is_active === true;
      if (wasJustActivated) {
        const autoId   = d?.auto_deploy_id;
        const autoMsg  = d?.auto_deploy_msg ?? "";
        const sym      = d?.strategy?.symbols?.[0];
        const symName  = sym?.symbol ?? (typeof sym === "string" ? sym : "");
        if (autoId && autoMsg !== "already_pending") {
          toast.success(`⚡ Strategy armed — scanning ${symName || "configured symbol"} for entry conditions`);
          emitAlgoRobotEvent(
            "Strategy armed",
            `Scanning ${symName || "configured symbol"} for strategy condition matches.`,
            "success",
          );
          void trackRobotMetric("strategy_activated");
        } else if (autoMsg === "already_pending") {
          toast.info(`Strategy is active — already scanning ${symName || "symbol"}`);
          emitAlgoRobotEvent(
            "Strategy already scanning",
            `The execution engine is already evaluating ${symName || "configured symbol"}.`,
            "info",
          );
        } else if (autoMsg === "no_symbol_configured") {
          toast.warning("Strategy activated — but no symbol is set. Deactivate, then toggle on again to set symbol + quantity.");
        }
      } else {
        toast.info("Strategy deactivated — all pending orders cancelled");
        emitAlgoRobotEvent(
          "Strategy paused",
          "Automation is paused. You can reactivate after updating your strategy settings.",
          "warning",
        );
      }
      await loadStrategies();
    } finally { setToggleLoading(null); }
  };

  const handleStrategyToggleClick = async (s: Strategy) => {
    if (s.is_active) {
      void toggleStrategy(s.id);
      return;
    }
    const brokerOk = await userHasBrokerForStrategies();
    if (!brokerOk) {
      toast.error(
        "Connect your broker (OpenAlgo) first — use Connect on Home or the AI Prediction page, then return here to go live.",
        { duration: 9000 },
      );
      scrollToBrokerConnect();
      return;
    }
    if (data?.token_expired) {
      toast.error(
        "Daily broker session expired. Use Connect in the Broker Sync bar above, then turn the strategy on again to pick symbol and quantity.",
        { duration: 12000 },
      );
      scrollToBrokerConnect();
      return;
    }
    setGoLive({ strategy: s, ...defaultsForGoLiveStrategy(s) });
  };

  const confirmGoLive = async () => {
    if (!goLive) return;
    if (data?.token_expired) {
      toast.error("Reconnect broker (session expired) using Connect above, then try again.");
      scrollToBrokerConnect();
      return;
    }
    const sym = goLive.symbol.trim().toUpperCase();
    const qty = parseInt(goLive.quantity, 10);
    if (!sym) {
      toast.error("Enter a trading symbol (e.g. RELIANCE)");
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
      const symbolsPayload = [{
        symbol: sym,
        exchange: goLive.exchange.trim().toUpperCase() || "NSE",
        quantity: qty,
        product_type: goLive.product.trim().toUpperCase() || "MIS",
      }];
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
      toast.success(`Strategy "${goLive.strategy.name}" is now live (${sym} x ${qty}). Entry and exit orders are fully automatic.`, { duration: 8000 });
      emitAlgoRobotEvent(
        "Execution engine ready",
        `Strategy "${goLive.strategy.name}" is live for ${sym} (${qty}).`,
        "success",
      );
      void trackRobotMetric("strategy_activated");
      setGoLive(null);
      await loadStrategies();
    } finally {
      setGoLiveLoading(false);
    }
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

  const createStrategy = async () => {
    if (!form.name.trim()) { toast.error("Strategy name is required"); return; }
    if (atStrategyCap) {
      toast.error("Strategy limit reached for your plan.");
      return;
    }
    const riskPct = parseFloat(form.risk_per_trade_pct);
    const slPct   = parseFloat(form.stop_loss_pct);
    const tpPct   = parseFloat(form.take_profit_pct);
    if (isNaN(riskPct) || riskPct <= 0) { toast.error("Risk % must be > 0"); return; }
    if (isNaN(slPct)   || slPct <= 0)   { toast.error("Stop-loss % must be > 0"); return; }
    if (isNaN(tpPct)   || tpPct <= 0)   { toast.error("Take-profit % must be > 0"); return; }
    const symbols = form.symbols_raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: {
          action: "create", name: form.name.trim(), description: form.description.trim(),
          trading_mode: form.trading_mode, is_intraday: form.is_intraday,
          start_time: form.start_time, end_time: form.end_time, squareoff_time: form.squareoff_time,
          risk_per_trade_pct: riskPct, stop_loss_pct: slPct, take_profit_pct: tpPct, symbols,
          paper_strategy_type: useFromPaper ? (paperType || "trend_following") : null,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || (res.data as any)?.error) {
        toast.error((res.data as any)?.error ?? "Failed to create strategy"); return;
      }
      toast.success(`Strategy "${form.name.trim()}" created`);
      setForm(EMPTY_STRATEGY);
      setShowCreate(false);
      await loadStrategies();
    } finally { setCreating(false); }
  };


  // ── Load all portfolio data ───────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-portfolio-data", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error || (res.data as any)?.error) {
        setError((res.data as any)?.error ?? res.error?.message ?? "Failed to load portfolio");
      } else {
        const portfolio = res.data as PortfolioData;
        setData(portfolio);
        const { data: completed } = await tradeTrackingService.getCompletedTrades(250);
        setCompletedTrades(Array.isArray(completed) ? completed : []);

        // Load recent strategy mapping from audit logs (orderid -> strategy name)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const uid = user?.id;
          if (uid) {
            const { data: logs } = await (supabase as any)
              .from("order_audit_logs")
              .select("created_at, request_payload, response_payload, status")
              .eq("user_id", uid)
              .order("created_at", { ascending: false })
              .limit(200);

            const map: Record<string, string> = {};
            for (const l of (logs ?? [])) {
              const rp = (l as any)?.request_payload ?? {};
              const resp = (l as any)?.response_payload ?? {};
              const oid = String(resp?.orderid ?? resp?.broker_order_id ?? resp?.data?.orderid ?? "").trim();
              const strat = String(rp?.strategy ?? rp?.strategy_name ?? "").trim();
              if (oid && strat && !map[oid]) map[oid] = strat;
            }
            setStrategyByOrderId(map);

            const { data: histRows } = await (supabase as any)
              .from("openalgo_order_history")
              .select("status,quantity,filled_quantity,average_price,price,symbol,order_timestamp,strategy_name,rejection_reason")
              .eq("user_id", uid)
              .order("order_timestamp", { ascending: false })
              .limit(500);
            setHistoryOrders(Array.isArray(histRows) ? histRows : []);

            // Load recent auto-exit tracked trades (entry orderid -> status)
            try {
              const ae = await supabase.functions.invoke("auto-exit-trades", {
                headers: { Authorization: `Bearer ${session?.access_token}` },
              });
              const rows = (ae.data as any)?.trades ?? [];
              const aeMap: Record<string, { status: string; exit_orderid?: string | null }> = {};
              for (const r of rows) {
                const entry = String(r?.entry_orderid ?? "").trim();
                if (!entry) continue;
                if (!aeMap[entry]) aeMap[entry] = { status: String(r?.status ?? ""), exit_orderid: r?.exit_orderid ?? null };
              }
              setAutoExitByEntryOrderId(aeMap);
            } catch {
              // non-blocking
            }
          }
        } catch { /* non-blocking */ }
      }
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  // ── Live LTPs ────────────────────────────────────────────────────────────
  const refreshQuotes = useCallback(async (portfolio: PortfolioData, silent = false) => {
    const symbols: Array<{ symbol: string; exchange: string }> = [
      ...portfolio.positions.map(p => ({ symbol: getSymbol(p), exchange: getExchange(p) })),
      ...portfolio.holdings.map(h => ({ symbol: getSymbol(h), exchange: getExchange(h) })),
    ].filter(s => s.symbol);
    const uniqSymbols = Array.from(new Map(symbols.map(s => [`${s.exchange}:${s.symbol}`, s])).values());
    if (!uniqSymbols.length) return;
    setQLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("broker-data", {
        body: { action: "multiquotes", symbols: uniqSymbols },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const raw = (res.data as any)?.data;
      const map: Record<string, number> = {};
      const results = Array.isArray(raw?.results) ? raw.results : (Array.isArray(raw) ? raw : []);
      if (results.length) {
        results.forEach((q: any) => {
          const sym = String(q?.symbol ?? q?.tradingsymbol ?? q?.scrip_code ?? "").toUpperCase();
          const ltp = q?.ltp ?? q?.last_price ?? q?.lastprice ?? q?.last_traded_price ??
                      q?.close ?? q?.data?.ltp ?? q?.data?.last_price ?? q?.data?.close;
          if (sym && ltp != null && !Number.isNaN(Number(ltp))) map[sym] = Number(ltp);
        });
      } else if (raw && typeof raw === "object") {
        Object.entries(raw).forEach(([sym, q]: [string, any]) => {
          const ltp = q?.ltp ?? q?.data?.ltp ?? q?.last_price;
          if (ltp != null && !Number.isNaN(Number(ltp))) map[String(sym).toUpperCase()] = Number(ltp);
        });
      }
      if (Object.keys(map).length) {
        setLiveLtps(prev => ({ ...prev, ...map }));
        if (!silent) toast.success("Live quotes updated");
      } else if (!silent) {
        toast.error("Live quotes unavailable for selected symbols");
      }
    } catch {
      if (!silent) toast.error("Could not fetch live quotes");
    }
    finally { setQLoading(false); }
  }, []);

  useEffect(() => {
    if (!data) return;
    const brokerPositions = data.positions.length ? data.positions : (data.open_positions ?? []);
    const hasInstruments = brokerPositions.length + data.holdings.length > 0;
    if (!hasInstruments) return;
    refreshQuotes(data, true);
    const id = setInterval(() => refreshQuotes(data, true), 15_000);
    return () => clearInterval(id);
  }, [data, refreshQuotes]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const doAction = useCallback(async (action: string, params: Record<string, unknown>, label: string) => {
    const key = (params.orderid as string) ?? action;
    setActioning(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("broker-order-action", {
        body: { action, ...params },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = res.data as any;
      if (res.error || d?.error) { toast.error(`${label} failed: ${d?.error ?? res.error?.message}`); return false; }
      toast.success(`${label} successful`);
      await load(true);
      return true;
    } catch (e: any) { toast.error(`${label} error: ${e.message}`); return false; }
    finally { setActioning(null); }
  }, [load]);

  const handleCancel       = (o: OrderRow) => doAction("cancel", { orderid: o.orderid }, "Cancel order");
  const handleCloseAll     = async () => { if (!confirm("Close ALL open positions? This cannot be undone.")) return; await doAction("close_all_pos", {}, "Close all positions"); };
  const handleCancelAll    = async () => { if (!confirm("Cancel ALL open orders?")) return; await doAction("cancel_all", {}, "Cancel all orders"); };
  const handleModifySubmit = async () => {
    if (!modifyOrder) return;
    const symbol = getSymbol(modifyOrder);
    const action = getAction(modifyOrder) || "BUY";
    const ok = await doAction("modify", {
      orderid: modifyOrder.orderid, symbol,
      exchange: modifyOrder.exchange ?? "NSE", order_action: action,
      product: modifyOrder.product ?? "CNC", pricetype: modifyType,
      price: Number(modifyPrice), quantity: Number(modifyQty),
    }, "Modify order");
    if (ok) setModifyOrder(null);
  };

  // ── Loading / Error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-teal-400 mr-2" />
          <span className="text-zinc-400 text-sm">Loading account data…</span>
        </CardContent>
      </Card>
    );
  }
  if (error) {
    const noInt = error.includes("NO_INTEGRATION") || error.includes("No active broker");
    return (
      <Alert className="bg-zinc-900 border-zinc-800">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <AlertDescription className="text-zinc-400 text-sm">
          {noInt ? "Broker not connected. Sync your daily token above to view live account data." : error}
        </AlertDescription>
      </Alert>
    );
  }
  if (!data) return null;

  // ── Derived values ───────────────────────────────────────────────────────
  const funds = data.funds as any ?? {};

  // Try every known field name across all brokers
  const available   = funds.availablecash ?? funds.net ?? funds.available_balance ?? funds.available_cash ?? funds.cash ?? 0;
  const used        = funds.utiliseddebits ?? funds.used_margin ?? funds.utilised_debits ?? funds.marginused ?? 0;
  const collateral  = funds.collateral ?? funds.collateral_liquid ?? 0;
  const m2m         = funds.m2munrealized ?? funds.m2m_unrealised ?? funds.mtm ?? 0;

  const brokerPositions = (data.positions?.length ? data.positions : (data.open_positions ?? []));
  const openPositions  = brokerPositions.filter(p => getQty(p) !== 0);
  const positionsPnl   = brokerPositions.reduce((s, p) => s + Number((p as any).pnl ?? 0), 0);
  const holdingsPnl    = data.holdings.reduce((s, h) => s + Number(h.pnl ?? 0), 0);
  const totalPnl       = positionsPnl + holdingsPnl;
  const openOrders     = data.orders.filter(o => CANCELLABLE.includes(getOrderStatus(o).toLowerCase()));
  const completedToday = data.orders.filter(o => getOrderStatus(o).toLowerCase() === "complete").length;

  const activeStrategyCount = strategies.filter((s) => s.is_active).length;
  const pendingDeployCount = strategies.filter(
    (s) => deployStateForDisplay(s, deployStateByStrategy[s.id])?.status === "pending",
  ).length;

  // Pie chart data for positions P&L
  const pieData = openPositions.map(p => ({
    name: getSymbol(p) || (p.tradingsymbol ?? ""),
    value: Math.abs(Number(p.pnl ?? 0)),
    color: Number(p.pnl ?? 0) >= 0 ? "#10b981" : "#ef4444",
  })).filter(d => d.value > 0);

  // Bar chart for tradebook buy/sell breakdown
  const tradeStats = (() => {
    const buys  = data.tradebook.filter(t => getAction(t) === "BUY");
    const sells = data.tradebook.filter(t => getAction(t) === "SELL");
    const buyVal  = buys.reduce((s, t)  => s + getQty(t) * getAvgPrice(t), 0);
    const sellVal = sells.reduce((s, t) => s + getQty(t) * getAvgPrice(t), 0);
    return { buyCnt: buys.length, sellCnt: sells.length, buyVal, sellVal };
  })();

  const closedTrades = completedTrades.filter((t) => typeof t.actualPnl === "number");
  const winningTrades = closedTrades.filter((t) => Number(t.actualPnl) > 0);
  const losingTrades = closedTrades.filter((t) => Number(t.actualPnl) < 0);
  const winRate = closedTrades.length ? (winningTrades.length / closedTrades.length) * 100 : 0;
  const avgWin = winningTrades.length
    ? winningTrades.reduce((acc, t) => acc + Number(t.actualPnl ?? 0), 0) / winningTrades.length
    : 0;
  const avgLossAbs = losingTrades.length
    ? Math.abs(losingTrades.reduce((acc, t) => acc + Number(t.actualPnl ?? 0), 0) / losingTrades.length)
    : 0;
  const payoffRatio = avgLossAbs > 0 ? avgWin / avgLossAbs : 0;
  const grossProfit = winningTrades.reduce((acc, t) => acc + Number(t.actualPnl ?? 0), 0);
  const grossLossAbs = Math.abs(losingTrades.reduce((acc, t) => acc + Number(t.actualPnl ?? 0), 0));
  const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : 0;

  const submittedOrders = historyOrders.length;
  const rejectedOrders = historyOrders.filter((o) =>
    String(o.order_status ?? o.status ?? "").toLowerCase().includes("reject"),
  ).length;
  const fullyFilled = historyOrders.filter((o) => {
    const q = Number(o.quantity ?? 0);
    const f = Number(o.filled_quantity ?? 0);
    return q > 0 && f >= q;
  }).length;
  const fillEfficiency = submittedOrders ? (fullyFilled / submittedOrders) * 100 : 0;
  const rejectionRate = submittedOrders ? (rejectedOrders / submittedOrders) * 100 : 0;
  const slippageSamples = historyOrders
    .map((o) => {
      const expected = Number(o.price ?? 0);
      const executed = Number(o.average_price ?? 0);
      if (!Number.isFinite(expected) || !Number.isFinite(executed) || expected <= 0 || executed <= 0) return null;
      return Math.abs(executed - expected);
    })
    .filter((x): x is number => x != null);
  const slippageProxy = slippageSamples.length
    ? slippageSamples.reduce((acc, n) => acc + n, 0) / slippageSamples.length
    : 0;

  const strategyEfficiency = Object.entries(
    closedTrades.reduce((acc: Record<string, { total: number; wins: number; pnl: number }>, t) => {
      const k = String(t.strategyType ?? "manual").trim() || "manual";
      if (!acc[k]) acc[k] = { total: 0, wins: 0, pnl: 0 };
      acc[k].total += 1;
      if (Number(t.actualPnl ?? 0) > 0) acc[k].wins += 1;
      acc[k].pnl += Number(t.actualPnl ?? 0);
      return acc;
    }, {}),
  )
    .map(([name, row]) => ({
      name,
      total: row.total,
      winRate: row.total ? (row.wins / row.total) * 100 : 0,
      pnl: row.pnl,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return (
    <>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
              <BarChart3 className="h-4 w-4 text-teal-400" />
              {(data.broker ?? "Broker").charAt(0).toUpperCase() + (data.broker ?? "broker").slice(1)} Account
              {activeStrategyCount > 0 && (
                <Badge
                  className="bg-purple-500/20 text-purple-200 border border-purple-500/40 text-[10px] font-bold px-2 py-0.5"
                  title="Strategies are armed for webhooks, Deploy (auto), or optional manual orders — not the same as an open position"
                >
                  {activeStrategyCount} strateg{activeStrategyCount === 1 ? "y" : "ies"} active
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              {data.token_expired && (
                <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px]">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Session Expired
                </Badge>
              )}
              {openPositions.length > 0 && (
                <Button size="sm" variant="destructive" onClick={handleCloseAll} disabled={!!actioning}
                  className="h-7 text-[11px] px-2 bg-red-600/80 hover:bg-red-600">
                  {actioning === "close_all_pos" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                  Close All ({openPositions.length})
                </Button>
              )}
              {openOrders.length > 0 && (
                <Button size="sm" variant="outline" onClick={handleCancelAll} disabled={!!actioning}
                  className="h-7 text-[11px] px-2 border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
                  {actioning === "cancel_all" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <X className="h-3 w-3 mr-1" />}
                  Cancel All ({openOrders.length})
                </Button>
              )}
              {brokerPositions.length + data.holdings.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => refreshQuotes(data)} disabled={quotesLoading}
                  className="h-7 px-2 text-[11px] text-amber-400 hover:text-amber-300 border border-zinc-700 hover:border-amber-500/40">
                  {quotesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                  Live LTP
                </Button>
              )}
              <Button
                onClick={() => setShowOrderModal(true)}
                size="sm"
                className="h-7 text-[11px] px-2.5 bg-teal-500 hover:bg-teal-400 text-black font-bold"
              >
                <Send className="h-3 w-3 mr-1" /> Place Order
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { load(true); toast.success("Refreshed"); }}
                className="h-7 w-7 p-0 text-zinc-500 hover:text-teal-400">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">

          {/* ── Funds Overview ─────────────────────────────────────────── */}
          <div className="grid sm:grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Available Cash", value: Number(available), icon: <Wallet className="h-3 w-3" />, color: "text-teal-400" },
              { label: "Used Margin",    value: Number(used),      icon: <Briefcase className="h-3 w-3" />, color: "text-amber-400" },
              { label: "Collateral",     value: Number(collateral),icon: <BarChart3 className="h-3 w-3" />,  color: "text-blue-400" },
              { label: "Today's P/L",   value: totalPnl,           icon: totalPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />, color: totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-zinc-800 rounded-xl p-3 border border-zinc-700/50">
                <p className={`text-[10px] flex items-center gap-1 mb-1 ${color}`}>{icon}{label}</p>
                <p className={`font-bold text-sm ${color}`}>
                  {label === "Today's P/L"
                    ? (Math.abs(value) < 0.005 ? "₹0.00" : `${value > 0 ? "+" : "−"}₹${Math.abs(value).toFixed(2)}`)
                    : fmt(value)}
                </p>
              </div>
            ))}
          </div>

          {/* ── Quick Stats ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {[
              { label: "Open Positions", value: openPositions.length, color: "text-blue-400" },
              { label: "Holdings",       value: data.holdings.length, color: "text-purple-400" },
              { label: "Open Orders",    value: openOrders.length,    color: "text-amber-400" },
              { label: "Filled Today",   value: completedToday,       color: "text-emerald-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-zinc-800/50 rounded-lg p-2.5 border border-zinc-800">
                <p className={`font-bold text-xl ${color}`}>{value}</p>
                <p className="text-xs text-zinc-500 leading-tight mt-1">{label}</p>
              </div>
            ))}
          </div>

          {(activeStrategyCount > 0 || pendingDeployCount > 0) && (
            <Alert className="bg-purple-500/5 border-purple-500/25 text-zinc-200">
              <Zap className="h-4 w-4 text-purple-400 shrink-0" />
              <AlertDescription className="text-xs sm:text-sm leading-relaxed space-y-1.5">
                {pendingDeployCount > 0 && (
                  <p className="text-teal-400 font-semibold">
                    {pendingDeployCount} strateg{pendingDeployCount === 1 ? "y" : "ies"} scanning for entry conditions. Orders placed automatically when conditions match.
                  </p>
                )}
                <p className="text-zinc-400 text-xs">
                  Check{" "}
                  <button type="button" onClick={() => setPortfolioTab("orders")} className="text-teal-400 underline font-semibold">Orders</button>,{" "}
                  <button type="button" onClick={() => setPortfolioTab("tradebook")} className="text-teal-400 underline font-semibold">Trades</button>, and{" "}
                  <button type="button" onClick={() => setPortfolioTab("strategies")} className="text-purple-300 underline font-semibold">Strategies</button>{" "}
                  tabs for live status.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {/* ── P&L Chart (positions) ──────────────────────────────────── */}
          {pieData.length > 0 && (
            <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-3">
              <div className="flex sm:flex-row flex-col sm:items-center justify-between gap-2 mb-2">
                <p className="text-sm text-zinc-300 font-semibold tracking-wide">Open Positions P&L Breakdown</p>
                <p className="text-xs text-zinc-500">
                  Open positions P/L:{" "}
                  <span className={openPositions.reduce((s, p) => s + Number((p as any).pnl ?? 0), 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {(() => {
                      const v = openPositions.reduce((s, p) => s + Number((p as any).pnl ?? 0), 0);
                      return Math.abs(v) < 0.005 ? "₹0.00" : `${v > 0 ? "+" : "−"}₹${Math.abs(v).toFixed(2)}`;
                    })()}
                  </span>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-full sm:w-auto flex justify-center">
                  <ResponsiveContainer width={120} height={100}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" innerRadius={28} outerRadius={48} strokeWidth={0}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 w-full space-y-1.5">
                  {pieData.slice(0, 5).map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        <span className="text-zinc-200 font-mono">{d.name}</span>
                      </span>
                      <span style={{ color: d.color }} className="font-semibold">₹{d.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Tradebook bar chart ────────────────────────────────────── */}
          {data.tradebook.length > 0 && (
            <div className="bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-3">
              <p className="text-xs text-zinc-400 font-semibold mb-2">Today's Trading Activity</p>
              <div className="flex items-center gap-4 mb-2">
                <span className="text-xs text-emerald-400">Buys: <strong>{tradeStats.buyCnt}</strong> ({fmtMoney(tradeStats.buyVal)})</span>
                <span className="text-xs text-red-400">Sells: <strong>{tradeStats.sellCnt}</strong> ({fmtMoney(tradeStats.sellVal)})</span>
                <span className="text-xs text-zinc-500">Total: {data.tradebook.length} trades</span>
              </div>
              <ResponsiveContainer width="100%" height={60}>
                <BarChart data={[{ name: "Today", Buy: tradeStats.buyCnt, Sell: tradeStats.sellCnt }]} barGap={4}>
                  <XAxis dataKey="name" hide />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }} />
                  <Bar dataKey="Buy"  fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="Sell" fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Tabs ──────────────────────────────────────────────────── */}
          <Tabs value={portfolioTab} onValueChange={setPortfolioTab} className="w-full">
            <TabsList className="bg-zinc-800 border border-zinc-700 h-auto w-full grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 p-1 gap-1.5">
              {[
                { value: "positions",       label: "Positions",  icon: <ArrowUpRight className="h-3 w-3 mr-0.5" />,  count: brokerPositions.length },
                { value: "holdings",        label: "Holdings",   icon: <Briefcase className="h-3 w-3 mr-0.5" />,     count: data.holdings.length },
                { value: "orders",          label: "Orders",     icon: <ClipboardList className="h-3 w-3 mr-0.5" />, count: data.orders.length },
                { value: "tradebook",       label: "Trades",     icon: <BookOpen className="h-3 w-3 mr-0.5" />,      count: data.tradebook.length },
                { value: "strategies",      label: "Strategies", icon: <Zap className="h-3 w-3 mr-0.5" />,           count: strategies.length },
                { value: "strat-history",   label: "Algo Hist.", icon: <LineChart className="h-3 w-3 mr-0.5" />,     count: stratHistory.length },
                { value: "efficiency",      label: "Efficiency", icon: <BarChart3 className="h-3 w-3 mr-0.5" />,     count: closedTrades.length },
              ].map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}
                  className="text-xs sm:text-sm h-10 px-2 data-[state=active]:bg-teal-500 data-[state=active]:text-black flex items-center justify-center gap-0.5 transition-all w-full">
                  {tab.icon}{tab.label} ({tab.count})
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── Positions ─────────────────────────────────────────── */}
            <TabsContent value="positions" className="mt-2">
              {brokerPositions.length === 0 ? (
                <div className="text-center py-10">
                  <ArrowUpRight className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No positions today</p>
                  <p className="text-zinc-600 text-xs mt-1">Place an order to start trading</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-800/50">
                        {["Symbol", "Qty", "Avg", "LTP", "P&L", "Product", ""].map(h => (
                          <th key={h} className="text-left text-zinc-400 font-semibold uppercase tracking-wider text-[11px] px-3 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {brokerPositions.filter(p => getQty(p) !== 0).map((p, i) => {
                        const symbol  = getSymbol(p);
                        const qty     = getQty(p);
                        const avg     = getAvgPrice(p);
                        const hasQty  = qty !== 0;
                        const liveLtp = liveLtps[symbol];
                        const ltp     = liveLtp ?? getLtp(p);
                        const pnl     = liveLtp != null
                          ? (liveLtp - avg) * qty
                          : Number(p.pnl ?? 0);
                        return (
                          <tr
                            key={i}
                            className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                            onClick={() => symbol && openQuickTrade(symbol, String(p.exchange ?? "NSE"), qty, avg, ltp, pnl, String(p.product ?? "CNC"), qty > 0 ? "SELL" : "BUY")}
                          >
                            <td className="px-3 py-3">
                              <p className="font-semibold text-white font-mono group-hover:text-teal-300 transition-all text-sm">
                                {symbol || "—"}
                                {symbol && <span className="ml-1 text-[11px] text-zinc-600 group-hover:text-teal-500">↗</span>}
                              </p>
                              <p className="text-zinc-500 text-xs font-medium uppercase tracking-tight">{p.exchange}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`font-bold ${qty > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {qty}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-zinc-200 font-mono text-sm">{fmt(avg)}</td>
                            <td className="px-3 py-3">
                              <span className={`font-mono text-sm ${liveLtp ? "text-amber-300" : "text-zinc-200"}`}>{ltp > 0 ? fmt(ltp) : "—"}</span>
                              {liveLtp && <span className="text-[10px] text-amber-500 ml-1">●</span>}
                            </td>
                            <td className="px-3 py-3"><PnlBadge value={pnl} /></td>
                            <td className="px-3 py-3 text-zinc-500 text-xs font-semibold uppercase">{p.product}</td>
                            <td className="px-3 py-2.5">
                              {hasQty && (
                                <Button size="sm" variant="destructive" disabled={!!actioning}
                                  onClick={() => doAction("close_all_pos", {}, `Close ${p.tradingsymbol}`)}
                                  className="h-6 text-[10px] px-2 bg-red-600/70 hover:bg-red-600">
                                  Close
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Holdings ──────────────────────────────────────────── */}
            <TabsContent value="holdings" className="mt-2">
              {data.holdings.length === 0 ? (
                <div className="text-center py-10">
                  <Briefcase className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No holdings</p>
                  <p className="text-zinc-600 text-xs mt-1">Buy stocks with CNC to see them here</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-800/50">
                        {["Symbol", "Qty", "Avg", "LTP", "Current Value", "P&L", "%"].map(h => (
                          <th key={h} className="text-left text-zinc-400 font-semibold uppercase tracking-wider text-[11px] px-3 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.holdings.map((h, i) => {
                        const symbol    = getSymbol(h);
                        const qty       = Number(h.quantity ?? 0);
                        const avg       = getAvgPrice(h);
                        const liveLtp   = liveLtps[symbol];
                        const ltp       = liveLtp ?? getLtp(h);
                        const pnl       = liveLtp != null
                          ? (liveLtp - avg) * qty
                          : Number(h.pnl ?? 0);
                        const curVal    = ltp * qty;
                        const pct       = avg > 0
                          ? ((ltp - avg) / avg) * 100
                          : 0;
                        return (
                          <tr
                            key={i}
                            className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                            onClick={() => symbol && openQuickTrade(symbol, String(h.exchange ?? "NSE"), qty, avg, ltp, pnl, String(h.product ?? "CNC"), "SELL")}
                          >
                            <td className="px-3 py-3">
                              <p className="font-semibold text-white font-mono group-hover:text-teal-300 transition-all text-sm">
                                {symbol || "—"}
                                {symbol && <span className="ml-1 text-[11px] text-zinc-600 group-hover:text-teal-500">↗</span>}
                              </p>
                              <p className="text-zinc-500 text-xs font-medium uppercase tracking-tight">{h.exchange}</p>
                            </td>
                            <td className="px-3 py-3 text-zinc-200 text-sm font-medium tabular-nums">{qty || 0}</td>
                            <td className="px-3 py-3 text-zinc-200 font-mono text-sm tabular-nums">{fmt(avg)}</td>
                            <td className="px-3 py-3">
                              <span className={`font-mono text-sm tabular-nums ${liveLtp ? "text-amber-300" : "text-zinc-200"}`}>{ltp > 0 ? fmt(ltp) : "—"}</span>
                              {liveLtp && <span className="text-[10px] text-amber-500 ml-1">●</span>}
                            </td>
                            <td className="px-3 py-3 text-zinc-200 font-mono text-sm tabular-nums">{curVal > 0 ? fmt(curVal) : "—"}</td>
                            <td className="px-3 py-3"><PnlBadge value={pnl} /></td>
                            <td className="px-3 py-2.5">
                              <span className={`text-xs font-semibold ${pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Orders ────────────────────────────────────────────── */}
            <TabsContent value="orders" className="mt-2">
              {data.orders.length === 0 ? (
                <div className="text-center py-10">
                  <ClipboardList className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No orders today</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900 z-10">
                      <tr className="border-b border-zinc-800 bg-zinc-800/80">
                        {["Symbol", "Type", "Qty/Filled", "Price", "Product", "Status", "Strategy", "Time", ""].map(h => (
                          <th key={h} className="text-left text-zinc-400 font-semibold uppercase tracking-wider text-[11px] px-3 py-2.5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.slice(0, 50).map((o, i) => {
                        const symbol     = getSymbol(o);
                        const status     = getOrderStatus(o);
                        const isBuy      = getAction(o) === "BUY";
                        const canCancel  = CANCELLABLE.includes(status.toLowerCase());
                        const qty        = Number(o.quantity ?? 0);
                        const filledQty  = Number(o.filledquantity ?? o.filled_quantity ?? 0);
                        const avgPrice   = Number(o.averageprice ?? o.average_price ?? 0);
                        const limitPrice = Number(o.price ?? 0);
                        const oid        = getOrderId(o);
                        const strat      = oid ? strategyByOrderId[oid] : "";
                        return (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1.5">
                                {isBuy
                                  ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                  : <ArrowDownRight className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                                <span className="font-mono text-white font-semibold text-sm tracking-tight">{symbol || "—"}</span>
                              </div>
                              <p className="text-zinc-500 text-xs font-medium uppercase tracking-tight ml-5">{o.exchange}</p>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`font-bold text-xs uppercase ${isBuy ? "text-emerald-400" : "text-red-400"}`}>{getAction(o) || "—"}</span>
                            </td>
                            <td className="px-3 py-3 text-zinc-200 font-mono text-sm leading-none tabular-nums">
                              <span className={filledQty > 0 ? "text-white" : "text-zinc-500"}>{filledQty}</span>
                              <span className="text-zinc-600 text-xs"> / {qty}</span>
                            </td>
                            <td className="px-3 py-3 text-zinc-200 font-mono text-sm tabular-nums">
                              {avgPrice > 0 ? fmt(avgPrice) : fmt(limitPrice)}
                            </td>
                            <td className="px-3 py-3 text-zinc-500 text-xs font-semibold uppercase tabular-nums">{o.product}</td>
                            <td className="px-3 py-2"><StatusBadge status={status} /></td>
                            <td className="px-3 py-3">
                              <div className="flex flex-col gap-1.5">
                                {strat ? (
                                  <span className="text-xs px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-300 w-fit font-medium">
                                    {strat}
                                  </span>
                                ) : (
                                  <span className="text-zinc-700 text-xs">—</span>
                                )}
                                {(() => {
                                  const ae = oid ? autoExitByEntryOrderId[oid] : null;
                                  if (!ae?.status) return null;
                                  const s = String(ae.status);
                                  const cls =
                                    s === "active" ? "border-teal-500/20 bg-teal-500/10 text-teal-300" :
                                    s === "closed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" :
                                    s === "await_fill" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" :
                                    "border-red-500/20 bg-red-500/10 text-red-300";
                                  return (
                                    <span className={`text-[11px] px-2 py-0.5 rounded border ${cls} w-fit font-medium`}>
                                      Auto-exit: {s}
                                    </span>
                                  );
                                })()}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-zinc-600 text-[11px] tabular-nums">
                              {getTime(o).slice(11, 19)}
                            </td>
                            <td className="px-3 py-2">
                              {canCancel && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" disabled={!!actioning}
                                    onClick={() => { setModifyOrder(o); setModifyPrice(String(o.price ?? o.averageprice ?? "")); setModifyQty(String(o.quantity ?? "")); setModifyType(o.pricetype ?? "LIMIT"); }}
                                    className="h-5 px-1.5 text-[10px] border-blue-500/40 text-blue-400 hover:bg-blue-500/10">
                                    <Pencil className="h-2.5 w-2.5" />
                                  </Button>
                                  <Button size="sm" variant="destructive" disabled={!!actioning}
                                    onClick={() => handleCancel(o)}
                                    className="h-5 px-1.5 text-[10px] bg-red-600/70 hover:bg-red-600">
                                    {actioning === o.orderid ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />}
                                  </Button>
                                </div>
                              )}
                              {o.rejectreason && (
                                <p className="text-[9px] text-red-400 max-w-[120px] truncate">{o.rejectreason}</p>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Tradebook ─────────────────────────────────────────── */}
            <TabsContent value="tradebook" className="mt-2 text-white">
              {data.tradebook.length === 0 ? (
                <div className="text-center py-10">
                  <BookOpen className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No executed trades today</p>
                  <p className="text-zinc-600 text-xs mt-1">Confirmed fills will appear here</p>
                </div>
              ) : (
                <>
                  {/* Summary row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 text-center">
                      <p className="text-emerald-400 text-sm font-bold">{tradeStats.buyCnt} Buys</p>
                      <p className="text-zinc-500 text-xs font-medium tabular-nums mt-0.5">{fmtMoney(tradeStats.buyVal)} value</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-center">
                      <p className="text-red-400 text-sm font-bold">{tradeStats.sellCnt} Sells</p>
                      <p className="text-zinc-500 text-xs font-medium tabular-nums mt-0.5">{fmtMoney(tradeStats.sellVal)} value</p>
                    </div>
                    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-center">
                      <p className="text-zinc-200 text-sm font-bold">{data.tradebook.length} Total</p>
                      <p className="text-zinc-500 text-xs font-medium mt-0.5">Filled trades</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-zinc-800 max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-zinc-900 z-10">
                        <tr className="border-b border-zinc-800 bg-zinc-800/80">
                          {["Symbol", "Side", "Qty", "Avg Price", "Product", "Strategy", "Time"].map(h => (
                            <th key={h} className="text-left text-zinc-400 font-semibold uppercase tracking-wider text-[11px] px-3 py-2.5">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.tradebook.map((t, i) => {
                          const symbol = getSymbol(t);
                          const side = getAction(t);
                          const qty = getQty(t);
                          const avg = getAvgPrice(t);
                          const isBuy = side === "BUY";
                          const oid = getOrderId(t);
                          const strat = oid ? strategyByOrderId[oid] : "";
                          return (
                            <tr
                              key={i}
                              className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer group"
                              onClick={() => symbol && openQuickTrade(
                                symbol, String(t.exchange ?? "NSE"), isBuy ? qty : -qty,
                                avg, liveLtps[symbol] ?? avg, 0,
                                String(t.product ?? "CNC"), isBuy ? "SELL" : "BUY"
                              )}
                            >
                              <td className="px-3 py-3">
                                <p className="font-mono text-white font-semibold text-sm group-hover:text-teal-300 transition-all tracking-tight">
                                  {symbol || "—"}
                                  {symbol && <span className="ml-1 text-[11px] text-zinc-600 group-hover:text-teal-500">↗</span>}
                                </p>
                                <p className="text-zinc-500 text-xs font-medium uppercase tracking-tight">{t.exchange}</p>
                              </td>
                              <td className="px-3 py-3">
                                <Badge className={`text-xs font-bold border uppercase ${isBuy ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                                  {side || "—"}
                                </Badge>
                              </td>
                              <td className="px-3 py-3 text-zinc-200 font-mono text-sm tabular-nums">
                                <span className="text-white font-bold">{qty}</span>
                                <span className="text-zinc-600"> / {qty}</span>
                              </td>
                              <td className="px-3 py-3 text-zinc-200 font-mono text-sm tabular-nums">₹{avg.toFixed(2)}</td>
                              <td className="px-3 py-3 text-zinc-500 text-xs font-semibold uppercase tracking-tight">{t.product}</td>
                              <td className="px-3 py-3">
                                <div className="flex flex-col gap-1.5">
                                  {strat ? (
                                    <span className="text-xs px-2 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-300 w-fit font-medium">
                                      {strat}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-700 text-xs">—</span>
                                  )}
                                  {(() => {
                                    const ae = oid ? autoExitByEntryOrderId[oid] : null;
                                    if (!ae?.status) return null;
                                    const s = String(ae.status);
                                    const cls =
                                      s === "active" ? "border-teal-500/20 bg-teal-500/10 text-teal-300" :
                                      s === "closed" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" :
                                      s === "await_fill" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" :
                                      "border-red-500/20 bg-red-500/10 text-red-300";
                                    return (
                                      <span className={`text-[11px] px-2 py-0.5 rounded border ${cls} w-fit font-medium`}>
                                        Auto-exit: {s}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-zinc-500 text-[11px] tabular-nums font-medium">
                                {fmtTime(getTime(t))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </TabsContent>
            {/* ── Strategies ────────────────────────────────────────── */}
            <TabsContent value="strategies" className="mt-2 space-y-3">
              {data.token_expired && (
                <Alert className="bg-amber-500/10 border-amber-500/35 py-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <AlertDescription className="text-xs text-amber-100/95 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>
                      Broker session expired — you can’t arm strategies, deploy, or place orders until you reconnect. Use{" "}
                      <strong className="text-white">Connect</strong> in the <strong className="text-white">Broker Sync</strong> bar above (same page).
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0 h-8 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs"
                      onClick={() => scrollToBrokerConnect()}
                    >
                      Go to Connect
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {/* Header row with Add button */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-300 font-semibold flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-purple-400" /> Auto Strategies
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => void loadStrategies()} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh">
                    <RefreshCw className={`h-3.5 w-3.5 ${stratLoading ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={openNewStrategyForm}
                    disabled={atStrategyCap}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-zinc-700 text-xs font-bold text-zinc-400 hover:text-white hover:border-purple-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Strategy
                  </button>
                </div>
              </div>

              {/* Strategy list */}
              {stratLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                </div>
              ) : strategies.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="h-8 w-8 text-zinc-800 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500 font-medium">No strategies yet</p>
                  <p className="text-xs text-zinc-600 mt-1">Create strategies for auto-execution</p>
                  <button
                    onClick={openNewStrategyForm}
                    disabled={atStrategyCap}
                    className="mt-4 flex items-center gap-1.5 mx-auto px-4 py-2 rounded-lg border border-purple-500/30 text-xs font-bold text-purple-400 hover:bg-purple-500/10 transition-colors outline-none focus:ring-2 focus:ring-purple-500/40 disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create your first strategy
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {strategies.map(s => {
                    const fs = getFireState(s.id);
                    const dep = deployStateForDisplay(s, deployStateByStrategy[s.id]);
                    const liveChecking = isLiveChecking(dep);
                    const reasonInfo = parseDeployReasonDetails(dep?.error_message ?? null);
                    return (
                      <div key={s.id} className={`rounded-xl border transition-colors ${
                        s.is_active ? "bg-purple-500/5 border-purple-500/20" : "bg-zinc-900 border-zinc-800"
                      }`}>
                        {/* Header */}
                        <div className="flex items-center gap-2 p-3">
                          <span className="flex-1 text-sm font-semibold text-white truncate">{s.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (s.is_active) {
                                toast.error("Deactivate this strategy before editing.");
                                return;
                              }
                              setEditingAlgoStrategy(s);
                              setShowCreate(true);
                            }}
                            disabled={s.is_active}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold border border-zinc-700 text-zinc-500 hover:border-purple-500/40 hover:text-purple-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-zinc-700 disabled:hover:text-zinc-500"
                            title={s.is_active ? "Deactivate to edit" : "Edit strategy rules"}
                          >
                            <LineChart className="h-3.5 w-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaperTradeStrategyId(s.id)}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-bold border border-teal-700/50 text-teal-400 hover:bg-teal-500/10 transition-all shrink-0"
                            title="Paper trade when this strategy’s conditions are met (no broker required)"
                          >
                            <FlaskConical className="h-3.5 w-3.5" /> Paper Trade
                          </button>
                          {/* Active toggle */}
                          <button
                            type="button"
                            onClick={() => void handleStrategyToggleClick(s)}
                            disabled={toggleLoading === s.id || goLiveLoading}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                              s.is_active ? "bg-purple-600" : "bg-zinc-700"
                            } disabled:opacity-60`}
                            title={s.is_active ? "Deactivate" : "Go live — broker must be connected, then set symbol & quantity"}
                          >
                            {toggleLoading === s.id
                              ? <Loader2 className="h-3 w-3 text-white mx-auto animate-spin" />
                              : <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                  s.is_active ? "translate-x-[18px]" : "translate-x-0.5"
                                }`} />}
                          </button>
                          {(dep?.status === "pending" || dep?.status === "cancelled") && (
                            <button
                              type="button"
                              onClick={() => {
                                setLiveDiagLastPrice(null);
                                setLiveDiagStrategy(s);
                              }}
                              className="px-2 py-1 rounded-md text-[10px] font-bold border border-cyan-700/40 text-cyan-300 hover:bg-cyan-500/10 transition-all"
                              title="Open live diagnostics"
                            >
                              Live View
                            </button>
                          )}
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

                        {/* Meta badges + live status diagnostic */}
                        <div className="flex items-center gap-1.5 flex-wrap px-3 pb-1.5">
                          {(() => {
                            const machine = strategyMachineState(dep, s.is_active);
                            const sinceSecs = relativeSecondsFrom(dep?.last_checked_at, nowMs);
                            const machineCls =
                              machine.key === "executed"
                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                : machine.key === "scanning"
                                  ? "bg-teal-500/10 text-teal-300 border-teal-500/30"
                                  : machine.key === "awaiting"
                                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                    : "bg-zinc-800 text-zinc-400 border-zinc-700/30";
                            return (
                              <span className={`text-xs px-2 py-0.5 rounded border font-medium flex items-center gap-1 ${machineCls}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${machine.key === "scanning" ? "bg-teal-400 animate-pulse" : "bg-zinc-500"}`} />
                                {machine.label}
                              </span>
                            );
                          })()}
                          <span className={`text-xs px-2 py-0.5 rounded font-bold tracking-tight ${
                            s.is_active ? "bg-purple-500/15 text-purple-300 border border-purple-500/20" : "bg-zinc-800 text-zinc-500 border border-zinc-700/30"
                          }`}>{s.is_active ? "● ACTIVE" : "○ INACTIVE"}</span>
                          {dep?.status === "pending" && (
                            <span className={`text-xs px-2 py-0.5 rounded border font-bold animate-pulse ${
                              liveChecking ? "bg-teal-500/10 text-teal-300 border-teal-500/30" : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                            }`} title={dep.last_checked_at ? `Last scanned: ${new Date(dep.last_checked_at).toLocaleTimeString("en-IN")}` : "Monitor not scanning yet — start the monitor process"}>
                              {liveChecking ? "⚡ SCANNING" : "⏳ AWAITING TICK"}
                              {dep.last_checked_at && (
                                <span className="ml-1 opacity-70 font-normal">
                                  {new Date(dep.last_checked_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            </span>
                          )}
                          {dep?.last_checked_at && (
                            <span className="text-xs px-2 py-0.5 rounded border border-zinc-700/40 bg-zinc-900 text-zinc-400">
                              Last scan: {relativeSecondsFrom(dep.last_checked_at, nowMs) ?? 0}s ago
                            </span>
                          )}
                          {dep?.status === "executed" && (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold">
                              ✓ EXECUTED · {dep.symbol}{dep.broker_order_id ? ` · #${String(dep.broker_order_id).slice(-8)}` : ""}
                              {dep.executed_at && <span className="ml-1 opacity-70 font-normal">{new Date(dep.executed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/30 font-medium">{s.trading_mode}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/30 font-medium">{s.is_intraday ? "Intraday" : "Positional"}</span>
                          <span className="text-xs text-zinc-500 font-medium tabular-nums ml-1">{s.start_time}–{s.end_time}</span>
                          {s.stop_loss_pct && <span className="text-xs font-bold text-red-500/80">SL {s.stop_loss_pct}%</span>}
                          {s.take_profit_pct && <span className="text-xs font-bold text-green-500/80">TP {s.take_profit_pct}%</span>}
                        </div>

                        {/* Live diagnostic strip — always visible when active+pending */}
                        {s.is_active && dep && (dep.status === "pending" || dep.status === "cancelled") && (
                          <div className={`mx-3 mb-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
                            dep.status === "pending" ? "bg-zinc-950 border-zinc-800" : "bg-red-950/20 border-red-900/30"
                          }`}>
                            {dep.status === "pending" ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-zinc-400 font-semibold">Symbol:</span>
                                  <span className="text-white font-mono font-bold">{dep.symbol || "—"}</span>
                                  <span className="text-zinc-500">·</span>
                                  <span className="text-zinc-400 font-semibold">Side:</span>
                                  <span className={`font-bold ${dep.action === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{dep.action}</span>
                                  <span className="text-zinc-500">·</span>
                                  <span className="text-zinc-400 font-semibold">Qty:</span>
                                  <span className="text-zinc-200">{dep.quantity}</span>
                                </div>
                                {dep.error_message ? (
                                  <div className="space-y-1">
                                    <div className="flex items-start gap-1.5">
                                      <span className="text-amber-400 font-semibold shrink-0">Why not fired:</span>
                                      <span className="text-zinc-300 break-words">{reasonInfo.headline}</span>
                                    </div>
                                    {reasonInfo.checks.length > 0 && (
                                      <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 space-y-1">
                                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Live condition checks</div>
                                        {reasonInfo.checks.slice(0, 8).map((c, idx) => (
                                          <div key={`${idx}-${c.label}`} className="flex items-start gap-1.5">
                                            <span className={`text-[10px] font-bold shrink-0 ${c.ok ? "text-emerald-400" : "text-red-400"}`}>
                                              {c.ok ? "PASS" : "FAIL"}
                                            </span>
                                            <span className="text-zinc-300 break-words">{c.label}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : dep.last_checked_at ? (
                                  <div className="text-zinc-500">Conditions not yet matched — waiting for next tick on {dep.symbol}</div>
                                ) : (
                                  <div className="text-amber-400/80 font-semibold">
                                    Awaiting first live tick on {dep.symbol}. If this does not update in 1-2 minutes, verify chartmate-monitor and broker WebSocket connectivity.
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-start gap-1.5">
                                <span className="text-red-400 font-semibold shrink-0">Cancelled:</span>
                                <span className="text-zinc-400">{formatDeployReason(dep.error_message) || "Order was cancelled"}</span>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

            </TabsContent>

            {/* ── Algo History ──────────────────────────────────────── */}
            <TabsContent value="strat-history" className="mt-2 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-300 font-semibold flex items-center gap-1.5">
                  <LineChart className="h-4 w-4 text-purple-400" /> Algo Deploy History
                </p>
                <button onClick={() => void loadStrategies()} className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh">
                  <RefreshCw className={`h-3.5 w-3.5 ${stratLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              {stratLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-600" /></div>
              ) : stratHistory.length === 0 ? (
                <div className="text-center py-8">
                  <LineChart className="h-8 w-8 text-zinc-800 mx-auto mb-2" />
                  <p className="text-sm text-zinc-500 font-medium">No deploy history yet</p>
                  <p className="text-xs text-zinc-600 mt-1">Deploy a strategy to see it here</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900 z-10">
                      <tr className="border-b border-zinc-800 bg-zinc-800/60">
                        {["Strategy", "Symbol", "Side", "Status", "Reason / Order ID", "Created", "Last Checked"].map(h => (
                          <th key={h} className="text-left text-zinc-400 font-semibold uppercase tracking-wider text-[11px] px-3 py-2.5 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stratHistory.map((r: any, i: number) => {
                        const status = String(r.status ?? "");
                        const statusCls =
                          status === "pending"   ? "bg-amber-500/10 text-amber-300 border-amber-500/25" :
                          status === "executed"  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25" :
                          status === "cancelled" ? "bg-red-500/10 text-red-400 border-red-500/25" :
                          status === "expired"   ? "bg-zinc-700/40 text-zinc-400 border-zinc-600/25" :
                          "bg-zinc-800 text-zinc-400 border-zinc-700";
                        const reasonText = formatDeployReason(r.error_message);
                        const reason = reasonText
                          ? String(reasonText).slice(0, 60) + (reasonText.length > 60 ? "…" : "")
                          : r.broker_order_id
                            ? `#${String(r.broker_order_id).slice(-10)}`
                            : "—";
                        const createdStr = r.created_at
                          ? new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })
                          : "—";
                        const checkedStr = r.last_checked_at
                          ? new Date(r.last_checked_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                          : "Never";
                        return (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/25">
                            <td className="px-3 py-2.5">
                              <p className="text-white font-semibold truncate max-w-[120px]" title={r.strategyName}>{r.strategyName}</p>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-zinc-200 font-semibold whitespace-nowrap">{r.symbol || "—"}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded border font-bold text-[11px] ${
                                String(r.action) === "BUY"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-red-500/10 text-red-400 border-red-500/20"
                              }`}>{r.action || "—"}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded border font-bold text-[11px] capitalize ${statusCls}`}>{status}</span>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-400 max-w-[200px]">
                              <span title={formatDeployReason(r.error_message) || r.broker_order_id || ""}>{reason}</span>
                            </td>
                            <td className="px-3 py-2.5 text-zinc-500 whitespace-nowrap tabular-nums">{createdStr}</td>
                            <td className={`px-3 py-2.5 whitespace-nowrap tabular-nums font-medium ${
                              r.last_checked_at ? "text-teal-400" : "text-zinc-600 italic"
                            }`}>{checkedStr}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="efficiency" className="mt-2 space-y-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-sm text-zinc-200 font-semibold">Trade Efficiency Overview</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Based on closed trades and synced broker order history. Metrics are descriptive, not predictive.
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                  {[
                    { label: "Closed trades", value: String(closedTrades.length), hint: "Sample size for performance metrics." },
                    { label: "Win rate", value: `${winRate.toFixed(1)}%`, hint: ALGO_ROBOT_COPY.metricMethodology.winRate },
                    { label: "Payoff ratio", value: payoffRatio > 0 ? payoffRatio.toFixed(2) : "—", hint: ALGO_ROBOT_COPY.metricMethodology.payoff },
                    { label: "Profit factor", value: profitFactor > 0 ? profitFactor.toFixed(2) : "—", hint: ALGO_ROBOT_COPY.metricMethodology.profitFactor },
                    { label: "Fill efficiency", value: `${fillEfficiency.toFixed(1)}%`, hint: ALGO_ROBOT_COPY.metricMethodology.fillEfficiency },
                    { label: "Rejection rate", value: `${rejectionRate.toFixed(1)}%`, hint: ALGO_ROBOT_COPY.metricMethodology.rejectionRate },
                  ].map((m) => (
                    <div key={m.label} className="rounded-lg border border-zinc-800 bg-black/30 p-2.5" title={m.hint}>
                      <p className="text-[11px] text-zinc-500">{m.label}</p>
                      <p className="text-base font-semibold text-zinc-100 mt-1">{m.value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500 mt-2" title={ALGO_ROBOT_COPY.metricMethodology.slippageProxy}>
                  Avg slippage proxy: {slippageProxy > 0 ? `₹${slippageProxy.toFixed(2)}` : "Not enough fill data"}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-sm text-zinc-200 font-semibold mb-2">Recent closed trades</p>
                  {closedTrades.length === 0 ? (
                    <p className="text-xs text-zinc-500">No closed trades yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {closedTrades.slice(0, 8).map((t) => (
                        <div key={t.id} className="rounded border border-zinc-800 bg-black/30 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-zinc-200 font-mono">{t.symbol}</span>
                            <span className={`text-xs font-semibold ${Number(t.actualPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {Number(t.actualPnl ?? 0) >= 0 ? "+" : ""}₹{Number(t.actualPnl ?? 0).toFixed(2)}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500">
                            {String(t.strategyType ?? "manual")} • {String(t.exitReason ?? "closed")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-sm text-zinc-200 font-semibold mb-2">Per-strategy efficiency</p>
                  {strategyEfficiency.length === 0 ? (
                    <p className="text-xs text-zinc-500">No strategy-specific outcomes yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {strategyEfficiency.map((s) => (
                        <div key={s.name} className="rounded border border-zinc-800 bg-black/30 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-zinc-200 capitalize">{s.name.replace(/_/g, " ")}</span>
                            <span className="text-[11px] text-zinc-400">{s.total} trades</span>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full ${s.winRate >= 50 ? "bg-emerald-500" : "bg-amber-500"}`}
                              style={{ width: `${Math.max(4, Math.min(100, s.winRate))}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1.5 text-[11px]">
                            <span className="text-zinc-400">Win rate {s.winRate.toFixed(1)}%</span>
                            <span className={s.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {s.pnl >= 0 ? "+" : ""}₹{s.pnl.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={liveDiagStrategy != null} onOpenChange={(o) => {
        if (!o) {
          setLiveDiagStrategy(null);
          setLiveDiagLastPrice(null);
          setLiveDiagScan(null);
          setLiveDiagChartReady(false);
          if (liveDiagScanIntervalRef.current) {
            clearInterval(liveDiagScanIntervalRef.current);
            liveDiagScanIntervalRef.current = null;
          }
        }
      }}>
        <DialogContent hideCloseButton className="!fixed !inset-0 !translate-x-0 !translate-y-0 !left-0 !top-0 !max-w-none !max-h-none !w-screen !h-screen !rounded-none bg-zinc-950 border-0 text-white p-0 !overflow-hidden flex flex-col">
          {/* header row */}
          <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div>
              <div className="text-base font-semibold text-white">Live Strategy Diagnostics</div>
              <div className="text-xs text-zinc-400">Real-time chart + condition pass/fail from latest live tick.</div>
            </div>
            <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 text-zinc-400 hover:text-white transition-opacity">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          {(() => {
            if (!liveDiagStrategy) return null;
            const dep = deployStateForDisplay(liveDiagStrategy, deployStateByStrategy[liveDiagStrategy.id]);
            const staleReason = parseDeployReasonDetails(dep?.error_message ?? null);
            const scan = liveDiagScan;
            const displayChecks =
              scan && !scan.loading && !scan.error
                ? scan.checks
                : staleReason.checks;
            const hasLiveAudit = displayChecks.length > 0;
            const matchingNow = displayChecks.filter((c) => c.ok);
            const notMatchingNow = displayChecks.filter((c) => !c.ok);
            const displayHeadline = scan?.loading
              ? "Running a fresh condition scan on live data (same engine as execution)…"
              : scan?.error
                ? `${scan.error}${staleReason.headline ? ` — Previous tick: ${staleReason.headline}` : ""}`
                : scan?.headline
                  ? scan.headline
                  : staleReason.headline;
            const chartSymbol = dep?.symbol || firstListedSymbol(liveDiagStrategy.symbols) || "";
            const chartExchange = dep?.exchange ?? (liveDiagStrategy.position_config && typeof liveDiagStrategy.position_config === "object"
              ? (liveDiagStrategy.position_config as Record<string, unknown>).exchange as string | undefined
              : undefined);
            const yahooChartSymbol = toYahooChartSymbol(chartSymbol, chartExchange);
            const strategyRuleLines = entryConditionSummaryLines(liveDiagStrategy.entry_conditions);
            const slPct = Number(liveDiagStrategy.stop_loss_pct ?? 1.5);
            const tpPct = Number(liveDiagStrategy.take_profit_pct ?? 2.5);
            const simSeries = buildStrategySimulationSeries(
              liveDiagLastPrice ?? 100,
              Number.isFinite(slPct) && slPct > 0 ? slPct : 1.5,
              Number.isFinite(tpPct) && tpPct > 0 ? tpPct : 2.5,
            );
            return (
              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 divide-x divide-zinc-800">
                <div className="lg:col-span-2 p-4 overflow-y-auto space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
                      <div className="text-zinc-500">Strategy</div>
                      <div className="text-zinc-100 font-semibold truncate">{liveDiagStrategy.name}</div>
                    </div>
                    <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
                      <div className="text-zinc-500">Status</div>
                      <div className="text-zinc-100 font-semibold uppercase">{dep?.status ?? "—"}</div>
                    </div>
                    <div className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
                      <div className="text-zinc-500">Symbol</div>
                      <div className="text-zinc-100 font-semibold">{chartSymbol || "—"}</div>
                    </div>
                    <div className={`rounded border px-2 py-1.5 ${dep?.last_checked_at ? "border-zinc-800 bg-zinc-900/50" : "border-amber-700/40 bg-amber-950/20"}`}>
                      <div className="text-zinc-500">Server Tick</div>
                      <div className={`font-semibold text-xs ${dep?.last_checked_at ? "text-zinc-100" : "text-amber-400"}`}>
                        {dep?.last_checked_at
                          ? new Date(dep.last_checked_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                          : "Not ticking ⚠️"}
                      </div>
                    </div>
                  </div>

                  {yahooChartSymbol ? (
                    <div className="h-[52vh] min-h-[360px]">
                      {liveDiagChartReady ? (
                        <YahooChartPanel
                          symbol={yahooChartSymbol}
                          displayName={chartSymbol}
                          onLivePrice={(p) => setLiveDiagLastPrice(p)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-900/60 rounded border border-zinc-800">
                          <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-8 text-center text-zinc-400 text-sm">
                      No symbol configured yet for chart.
                    </div>
                  )}
                </div>

                <div className="p-4 overflow-y-auto space-y-3 min-h-0 h-full">

                  {/* Backend monitor status banner */}
                  {dep?.status === "pending" && !dep?.last_checked_at && (
                    <div className="rounded border border-orange-700/50 bg-orange-950/20 px-3 py-2.5 space-y-1">
                      <div className="text-[11px] text-orange-300 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-orange-400 animate-pulse inline-block" />
                        Backend monitor not ticking
                      </div>
                      <p className="text-xs text-orange-200/80 leading-snug">
                        The server-side strategy engine hasn't evaluated this deployment yet — it won't auto-place orders until the backend ticks. The live scan below runs from your browser every 30 s and shows conditions, but <strong>cannot place orders</strong>.
                      </p>
                      <p className="text-[10px] text-orange-300/60 mt-1">
                        To fix: ensure chartmate-monitor is running, or deploy a dedicated strategy eval microservice.
                      </p>
                    </div>
                  )}

                  {/* Live scan (frontend) — condition status */}
                  <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-[11px] text-zinc-500 uppercase tracking-wide">
                        Live Scan (browser · auto every 30 s)
                      </div>
                      {dep?.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => void runLiveDiagConditionScan()}
                          disabled={Boolean(scan?.loading)}
                          className="inline-flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300 disabled:opacity-40"
                        >
                          <RefreshCw className={`h-3 w-3 ${scan?.loading ? "animate-spin" : ""}`} />
                          Scan now
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-zinc-200 break-words">
                      {scan?.loading
                        ? "Scanning live data…"
                        : displayHeadline || "Waiting for scan result."}
                    </div>
                  </div>

                  {hasLiveAudit ? (
                    <>
                      <div className="rounded border border-emerald-900/40 bg-emerald-950/10 px-3 py-2">
                        <div className="text-[11px] text-emerald-300 uppercase tracking-wide mb-1">
                          Passing now ({matchingNow.length})
                        </div>
                        {matchingNow.length > 0 ? (
                          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                            {matchingNow.map((c, idx) => (
                              <div key={`m-${idx}-${c.label}`} className="text-xs text-emerald-200 break-words">
                                ✓ {c.label}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-zinc-400">No conditions PASS on the latest bar.</div>
                        )}
                      </div>

                      <div className="rounded border border-red-900/40 bg-red-950/10 px-3 py-2">
                        <div className="text-[11px] text-red-300 uppercase tracking-wide mb-1">
                          Failing now ({notMatchingNow.length})
                        </div>
                        {notMatchingNow.length > 0 ? (
                          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                            {notMatchingNow.map((c, idx) => (
                              <div key={`f-${idx}-${c.label}`} className="text-xs text-red-200 break-words">
                                ✗ {c.label}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-zinc-400">No conditions FAIL on the latest bar.</div>
                        )}
                      </div>
                    </>
                  ) : scan?.loading ? (
                    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-6 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                      <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                      Evaluating conditions against the latest bars…
                    </div>
                  ) : (
                    <div className="rounded border border-zinc-700/40 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
                      {dep?.status === "pending"
                        ? "This strategy uses a built-in rule pack — the scan runs but per-rule PASS/FAIL audit is not available for this shape. Configured rules shown below."
                        : "Run a scan while the strategy is pending to see condition results."}
                    </div>
                  )}

                  {dep?.status === "executed" && (
                    <div className="rounded border border-blue-900/40 bg-blue-950/10 px-3 py-2">
                      <div className="text-[11px] text-blue-300 uppercase tracking-wide mb-1">
                        Simulated Outcomes (Success vs Fail)
                      </div>
                      <div className="text-[11px] text-zinc-400 mb-2">
                        Scenario path after execution. X-axis is projected bars; Y-axis is price.
                      </div>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsLineChart data={simSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="step" stroke="#71717a" tickFormatter={(v) => `B${v}`} />
                            <YAxis stroke="#71717a" domain={["auto", "auto"]} tickFormatter={(v) => Number(v).toFixed(2)} />
                            <Tooltip
                              contentStyle={{ background: "#09090b", border: "1px solid #27272a", color: "#e4e4e7" }}
                              labelStyle={{ color: "#a1a1aa" }}
                              labelFormatter={(label) => `Projected bar: B${label}`}
                              formatter={(value: number, name: string) => [
                                Number(value).toFixed(3),
                                name === "success" ? "Success path price" : "Fail path price",
                              ]}
                            />
                            <ReferenceLine y={simSeries[0]?.entry} stroke="#a1a1aa" strokeDasharray="5 5" />
                            <ReferenceLine y={simSeries[0]?.takeProfit} stroke="#10b981" strokeDasharray="3 3" />
                            <ReferenceLine y={simSeries[0]?.stopLoss} stroke="#ef4444" strokeDasharray="3 3" />
                            <Line type="monotone" dataKey="success" stroke="#10b981" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="fail" stroke="#ef4444" dot={false} strokeWidth={2} />
                          </RechartsLineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                  {!hasLiveAudit && strategyRuleLines.length > 0 && (
                    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                      <div className="text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Configured Strategy Rules</div>
                      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                        {strategyRuleLines.map((line, idx) => (
                          <div key={`rule-${idx}`} className="text-xs text-zinc-300 break-words">{line}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={goLive != null} onOpenChange={(o) => { if (!o) setGoLive(null); }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Activate strategy</DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              Set the symbol and quantity. Once activated, entry and exit orders are placed automatically when strategy conditions match in real-time.
            </DialogDescription>
          </DialogHeader>
          {goLive && (
            <div className="space-y-3 py-1">
              <p className="text-xs text-zinc-500 font-medium truncate">{goLive.strategy.name}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 col-span-2">
                  <Label className="text-zinc-500 text-[10px]">Symbol *</Label>
                  <div className="relative">
                    <SymbolSearchInput
                      value={goLive.symbol}
                      onChange={(v) => setGoLive((g) => (g ? { ...g, symbol: v } : null))}
                      onSelect={(sym, ex) => setGoLive((g) => (g ? { ...g, symbol: sym, exchange: ex } : null))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-zinc-500 text-[10px]">Exchange</Label>
                  <Select
                    value={goLive.exchange}
                    onValueChange={(v) => setGoLive((g) => (g ? { ...g, exchange: v } : null))}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {EXCHANGES_LIST.map((e) => (
                        <SelectItem key={e} value={e} className="text-xs">{e}</SelectItem>
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
                    onChange={(e) => setGoLive((g) => (g ? { ...g, quantity: e.target.value } : null))}
                    className="bg-zinc-900 border-zinc-700 text-white text-sm h-9"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-zinc-500 text-[10px]">Product</Label>
                  <Select
                    value={goLive.product}
                    onValueChange={(v) => setGoLive((g) => (g ? { ...g, product: v } : null))}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-200 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {PRODUCT_LIST.map((p) => (
                        <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
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
              {goLiveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate & start scanning"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlgoStrategyBuilder
        open={showCreate}
        onOpenChange={(o) => {
          setShowCreate(o);
          if (!o) {
            setEditingAlgoStrategy(null);
            setForm(EMPTY_STRATEGY);
            setUseFromPaper(false);
            setPaperType("");
            setBacktestResult(null);
          }
        }}
        existing={editingAlgoStrategy as never}
        onSaved={() => {
          void load(true);
          void loadStrategies();
        }}
      />

      {/* ── Place Order Dialog (full-screen, chart left + form right) ─────── */}
      <Dialog open={showOrderModal} onOpenChange={setShowOrderModal}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-[100vw] max-w-[100vw] w-screen h-screen p-0 overflow-hidden rounded-none">
          <PlaceOrderPanel
            broker={broker}
            onOrderPlaced={() => { setShowOrderModal(false); load(true); }}
            asModal
            fullscreen
          />
        </DialogContent>
      </Dialog>

      {/* ── Quick Trade Dialog (click on row) ────────────────────────────────── */}
      <Dialog open={!!qtd} onOpenChange={(o) => !o && setQtd(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white sm:max-w-[100vw] max-w-[100vw] w-screen h-screen p-0 overflow-hidden rounded-none">
          {qtd && (() => {
            const needsLimit   = qtd.pricetype === "LIMIT" || qtd.pricetype === "SL";
            const needsTrigger = qtd.pricetype === "SL"    || qtd.pricetype === "SL-M";
            const isBuy        = qtd.action === "BUY";
            const ltpDiff      = qtd.ltp > 0 && qtd.avgPrice > 0 ? qtd.ltp - qtd.avgPrice : 0;
            const ltpDiffPct   = qtd.avgPrice > 0 ? (ltpDiff / qtd.avgPrice) * 100 : 0;

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 h-full">
                {/* ── LEFT: Chart + AI Analysis ────────────────────────────── */}
                <div className="p-4 space-y-3 border-b lg:border-b-0 lg:border-r border-zinc-800 overflow-y-auto">
                  {/* Stock header */}
                  <div className="flex items-center gap-3">
                    <div>
                      <h2 className="font-mono text-xl font-bold text-white">{qtd.symbol}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">{qtd.exchange}</span>
                        <span className="text-[10px] text-teal-400 border border-teal-700/50 px-1.5 py-0.5 rounded">{qtd.product}</span>
                      </div>
                    </div>
                    <div className="ml-auto text-right">
                      {qtd.ltp > 0 && (
                        <>
                          <p className={`text-xl font-bold font-mono ${ltpDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            ₹{qtd.ltp.toFixed(2)}
                          </p>
                          {ltpDiff !== 0 && (
                            <p className={`text-xs font-semibold ${ltpDiff >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {ltpDiff >= 0 ? "▲" : "▼"} ₹{Math.abs(ltpDiff).toFixed(2)} ({Math.abs(ltpDiffPct).toFixed(2)}%)
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Position summary row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        label: "Qty Held",
                        value: qtd.qty !== 0 ? `${Math.abs(qtd.qty)} ${qtd.qty > 0 ? "Long" : "Short"}` : "—",
                        color: qtd.qty > 0 ? "text-emerald-400" : qtd.qty < 0 ? "text-red-400" : "text-zinc-400",
                      },
                      {
                        label: "Avg Cost",
                        value: qtd.avgPrice > 0 ? `₹${qtd.avgPrice.toFixed(2)}` : "—",
                        color: "text-zinc-200",
                      },
                      {
                        label: "Unreal P&L",
                        value: qtd.pnl !== 0 ? `${qtd.pnl > 0 ? "+" : ""}₹${qtd.pnl.toFixed(2)}` : "—",
                        color: qtd.pnl >= 0 ? "text-emerald-400" : "text-red-400",
                      },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-zinc-900 rounded-xl p-2.5 border border-zinc-800 text-center">
                        <p className="text-zinc-500 text-xs mb-1 font-medium">{label}</p>
                        <p className={`font-bold text-sm font-mono tabular-nums ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* TradingView Chart */}
                  <TradingViewChart symbol={qtd.symbol} exchange={qtd.exchange} height={220} />

                  {/* AI Analysis */}
                  <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-3.5 space-y-2">
                    <p className="text-xs font-bold text-purple-300 flex items-center gap-1.5 uppercase tracking-wide">
                      <Brain className="h-4 w-4" /> AI Analysis
                      {qtd.aiLoading && <Loader2 className="h-3.5 w-3.5 animate-spin ml-1.5" />}
                    </p>
                    {qtd.aiLoading ? (
                      <p className="text-sm text-zinc-500 animate-pulse font-medium italic">Analysing {qtd.symbol}…</p>
                    ) : (
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto font-medium">
                        {qtd.aiAnalysis}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── RIGHT: Order Form ─────────────────────────────────────── */}
                <div className="p-4 space-y-3">
                  <DialogHeader className="mb-1.5">
                    <DialogTitle className="text-lg font-bold text-white">
                      Place Order — <span className="font-mono text-teal-400">{qtd.symbol}</span>
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500 text-xs font-medium">
                      {qtd.exchange} · via {(broker || "broker").charAt(0).toUpperCase() + (broker || "broker").slice(1)}
                    </DialogDescription>
                  </DialogHeader>

                  {/* BUY / SELL */}
                  <div className="grid grid-cols-2 gap-2 p-1.5 bg-zinc-950 rounded-xl border border-zinc-800">
                    {(["BUY", "SELL"] as const).map(a => (
                      <button key={a} onClick={() => qtdSet("action", a)}
                        className={`py-3 rounded-lg text-sm font-black tracking-widest transition-all ${
                          qtd.action === a
                            ? a === "BUY" ? "bg-green-600 text-white shadow-lg shadow-green-900/40" : "bg-red-600 text-white shadow-lg shadow-red-900/40"
                            : "text-zinc-600 hover:text-zinc-400"
                        }`}>
                        {a === "BUY" ? "▲ BUY" : "▼ SELL"}
                      </button>
                    ))}
                  </div>

                  {/* Product type */}
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs font-semibold">Product Type</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: "CNC",  l: "CNC",  sub: "Delivery" },
                        { v: "MIS",  l: "MIS",  sub: "Intraday" },
                        { v: "NRML", l: "NRML", sub: "F&O Carry" },
                      ].map(({ v, l, sub }) => (
                        <button key={v} onClick={() => qtdSet("product", v)}
                          className={`py-2 rounded-lg text-center transition-all border text-sm font-bold ${
                            qtd.product === v
                              ? "bg-zinc-700 border-zinc-500 text-white shadow-inner"
                              : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                          }`}>
                          {l}<br />
                          <span className="font-normal text-xs text-zinc-600 font-sans">{sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Order type tabs */}
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs font-semibold">Order Type</Label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["MARKET", "LIMIT", "SL", "SL-M"] as const).map(pt => (
                        <button key={pt} onClick={() => qtdSet("pricetype", pt)}
                          className={`py-2 rounded-md text-xs font-bold transition-all border ${
                            qtd.pricetype === pt
                              ? "bg-zinc-700 border-zinc-500 text-white shadow-inner"
                              : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                          }`}>
                          {pt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Qty + filled display */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-400 text-xs font-semibold">Qty</Label>
                      {qtd.qty !== 0 && (
                        <span className="text-[11px] text-zinc-500 font-mono font-medium">
                          Placing: <span className="text-zinc-300">{qtd.qtyInput || "0"} / {Math.abs(qtd.qty)}</span> held
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2.5">
                      <Input type="number" min={1}
                        value={qtd.qtyInput}
                        onChange={e => qtdSet("qtyInput", e.target.value)}
                        className="bg-zinc-900 border-zinc-700 text-white h-10 text-base font-mono tabular-nums px-3" />
                      {qtd.qty > 0 && qtd.action === "SELL" && (
                        <button
                          onClick={() => qtdSet("qtyInput", String(Math.abs(qtd.qty)))}
                          className="text-xs font-bold text-teal-400 border border-teal-500/30 px-4 py-2 rounded-xl hover:bg-teal-500/10 transition-all shrink-0 whitespace-nowrap"
                        >All ({qtd.qty})</button>
                      )}
                    </div>
                  </div>

                  {/* Limit / SL price fields */}
                  {(needsLimit || needsTrigger) && (
                    <div className="grid grid-cols-2 gap-3">
                      {needsLimit && (
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs font-semibold">Limit Price ₹</Label>
                          <Input type="number" step="0.05" placeholder={qtd.ltp > 0 ? qtd.ltp.toFixed(2) : "0.00"}
                            value={qtd.price}
                            onChange={e => qtdSet("price", e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-white font-mono h-10 text-base tabular-nums px-3" />
                        </div>
                      )}
                      {needsTrigger && (
                        <div className="space-y-1.5">
                          <Label className="text-zinc-400 text-xs font-semibold">Trigger Price ₹</Label>
                          <Input type="number" step="0.05" placeholder="0.00"
                            value={qtd.trigger_price}
                            onChange={e => qtdSet("trigger_price", e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-white font-mono h-10 text-base tabular-nums px-3" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Validity */}
                  <div className="space-y-1.5">
                    <Label className="text-zinc-400 text-xs font-semibold">Validity</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: "DAY", l: "Day", sub: "Valid today" },
                        { v: "IOC", l: "IOC", sub: "Immediate or cancel" },
                      ].map(({ v, l, sub }) => (
                        <button key={v} onClick={() => qtdSet("validity", v as "DAY" | "IOC")}
                          className={`py-2 rounded-lg text-center transition-all border text-sm font-bold ${
                            qtd.validity === v
                              ? "bg-zinc-700 border-zinc-500 text-white shadow-inner"
                              : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                          }`}>
                          {l}<br />
                          <span className="font-normal text-xs text-zinc-600 font-sans">{sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Order summary strip */}
                  <div className={`rounded-xl p-3 text-sm font-mono border leading-tight ${
                    isBuy ? "bg-green-500/5 border-green-500/20 text-green-300" : "bg-red-500/5 border-red-500/20 text-red-300"
                  }`}>
                    <span className="font-bold text-base">{qtd.action}</span>{" "}
                    <span className="font-bold text-base">{qtd.qtyInput || "?"}</span> ×{" "}
                    <span className="font-bold text-base">{qtd.symbol}</span> <br />
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs opacity-80 font-semibold">
                      <span>{qtd.exchange}</span>
                      <span>{qtd.product}</span>
                      <span>{qtd.pricetype}</span>
                      {needsLimit && qtd.price && <span>@ ₹{qtd.price}</span>}
                      {needsTrigger && qtd.trigger_price && <span>trigger ₹{qtd.trigger_price}</span>}
                      <span>{qtd.validity}</span>
                    </div>
                  </div>

                  {/* Confirm button — blocked until AI analysis completes */}
                  <button
                    onClick={placeQuickOrder}
                    disabled={qtd.placing || qtd.aiLoading || !qtd.qtyInput || parseInt(qtd.qtyInput) < 1}
                    className={`w-full py-3.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                      isBuy
                        ? "bg-green-600 hover:bg-green-500 active:bg-green-700 text-white shadow-lg shadow-green-900/30"
                        : "bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-lg shadow-red-900/30"
                    }`}
                  >
                    {qtd.placing
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Placing…</>
                      : qtd.aiLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Waiting for AI analysis…</>
                      : <><Send className="h-4 w-4" />{isBuy ? "▲ Confirm BUY" : "▼ Confirm SELL"} {qtd.symbol}</>
                    }
                  </button>
                  <p className="text-[11px] text-center text-zinc-600 font-medium italic">⚠ Real money — executes instantly on broker</p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Modify Order Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!modifyOrder} onOpenChange={(o) => !o && setModifyOrder(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white text-lg font-bold">
              <Pencil className="h-5 w-5 text-blue-400" />
              Modify Order — {modifyOrder?.tradingsymbol}
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-xs font-medium">
              Update price and/or quantity for active order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-zinc-400 text-xs font-semibold">Price Type</Label>
              <div className="flex gap-2">
                {["LIMIT", "MARKET", "SL", "SL-M"].map(t => (
                  <button key={t} onClick={() => setModifyType(t)}
                    className={`text-xs px-3 py-2 rounded-lg border transition-all font-bold ${modifyType === t ? "bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/20" : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs font-semibold">Price</Label>
                <Input type="number" step="0.05" min="0" value={modifyPrice} onChange={e => setModifyPrice(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white h-10 text-sm font-mono tabular-nums px-3" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs font-semibold">Quantity</Label>
                <Input type="number" min="1" step="1" value={modifyQty} onChange={e => setModifyQty(e.target.value)} className="bg-zinc-950 border-zinc-700 text-white h-10 text-sm font-mono tabular-nums px-3" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModifyOrder(null)} className="border-zinc-700 h-10 text-sm font-bold px-5">Cancel</Button>
            <Button onClick={handleModifySubmit} disabled={!!actioning || !modifyPrice || !modifyQty} className="bg-blue-600 hover:bg-blue-500 text-sm font-bold h-10 px-5 transition-all shadow-lg shadow-blue-900/40">
              {actioning === modifyOrder?.orderid ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Modifying…</> : <><Pencil className="h-4 w-4 mr-2" />Modify Order</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaperTradeSetupDialog
        open={paperTradeStrategyId != null}
        onOpenChange={(o) => {
          if (!o) setPaperTradeStrategyId(null);
        }}
        preselectedStrategyId={paperTradeStrategyId}
        onCreated={() => {
          setPaperTradeStrategyId(null);
          toast.success("Paper strategy queued. Check Active Trades → Pending Paper Strategies.");
        }}
      />
    </>
  );
}