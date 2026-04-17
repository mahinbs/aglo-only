/**
 * Backtesting — full detailed view with custom strategy conditions.
 * Custom strategies built in AlgoStrategyBuilder have their exact
 * entry/exit conditions (RSI, MACD, EMA, BB, crossovers) sent to the
 * VectorBT engine, which evaluates them on real daily OHLCV data.
 *
 * Trade detail opens in a Dialog popup with:
 *  - Full OHLC mini chart + RSI
 *  - Entry/exit indicators at each bar
 *  - Historical "what-if": what would have happened if you ran this
 *    same strategy 1w / 1m / 3m / 6m / 1y ago
 */
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { motion, AnimatePresence } from "framer-motion";
import {
  ComposedChart, AreaChart, Area, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  Cell, LineChart, Line,
} from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchExpiryDates,
  fetchOptionChain,
  instrumentTypeForUnderlying,
  pickExpiryForStrategyType,
  tradableRowsFromChain,
  type NormalizedExpiryItem,
  type TradableOptionRow,
} from "@/lib/optionsApi";
import { friendlyBrokerMarketDataError } from "@/lib/brokerMarketDataErrors";
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, Brain, ChevronLeft, ChevronRight, Download,
  Eye, ListFilter, Loader2, LineChart as LineChartIcon, Search, ShieldCheck, 
  Trash2, TrendingUp, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { fetchUsdInr } from "@/lib/fxRates";
import {
  deriveMaxHoldDaysForStrategy,
  entryConditionsConfigured,
  resolveEngineStrategyIdForCustom,
  mergeSnapshotWithBacktestRun,
  type FullCustomStrategy,
} from "@/lib/backtestVectorbtPayload";

const EXCHANGES = ["NSE", "BSE", "GLOBAL", "NFO", "MCX", "CDS"];

/** AlgoStrategyBuilder execution_days: 0=Sun … 6=Sat */
const EXEC_DAY_LABELS: Record<number, string> = {
  0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat",
};

function defaultDisplayCurrency(exchange: string, sym: string): "INR" | "USD" {
  const u = sym.toUpperCase();
  if (exchange === "NSE" || exchange === "BSE") return "INR";
  if (u.endsWith(".NS") || u.endsWith(".BO")) return "INR";
  return "USD";
}

function isUsdQuotedSymbol(sym: string): boolean {
  const u = sym.trim().toUpperCase();
  if (!u || u.endsWith(".NS") || u.endsWith(".BO")) return false;
  if (u.includes("-USD")) return true;
  if (u.endsWith("USD") && !u.includes("INR")) return true;
  return false;
}

function quoteNoteForSymbol(
  sym: string,
  exchange: string,
  displayCurrency: "INR" | "USD",
  inrPerUsd: number | null,
  fxDate: string,
): string | null {
  const u = sym.trim().toUpperCase();
  if (!u) return null;
  const fxBit = inrPerUsd && fxDate
    ? ` Spot USD/INR ≈ ${inrPerUsd.toFixed(2)} (${fxDate}, ECB via Frankfurter).`
    : inrPerUsd
      ? ` Spot USD/INR ≈ ${inrPerUsd.toFixed(2)} (ECB via Frankfurter).`
      : "";
  if (u.includes("=X") || u.endsWith("=F")) {
    return `OHLC follows the feed’s quote. Money P&L = (return %) × notional in ${displayCurrency}.${fxBit}`;
  }
  if (isUsdQuotedSymbol(u)) {
    if (displayCurrency === "INR") {
      return `Chart prices stay in USD (feed). P&L uses your INR notional; changing USD/INR in the toolbar converts that notional at live rate so ₹ profit is not the same number as $ profit for the same economic size.${fxBit}`;
    }
    return `Chart prices are USD. Notional and P&L are in USD.${fxBit}`;
  }
  if (exchange === "NSE" || exchange === "BSE" || u.endsWith(".NS") || u.endsWith(".BO")) {
    return "Prices are typically INR. P&L uses your INR notional.";
  }
  return `Prices follow the feed’s quote currency. P&L = (return %) × notional in ${displayCurrency}.${fxBit}`;
}

function formatMoneyAmount(amount: number, currency: "INR" | "USD"): string {
  const abs = Math.abs(amount);
  const formatted = currency === "INR"
    ? abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })
    : abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const sign = amount >= 0 ? "+" : "−";
  return currency === "INR" ? `${sign}₹${formatted}` : `${sign}$${formatted}`;
}

/** holdingDays from options ORB is a fraction of a day (intraday). */
function formatFractionalHoldAsHM(fracDays: number | null | undefined): string {
  if (fracDays == null || !Number.isFinite(fracDays)) return "—";
  const totalMins = Math.round(fracDays * 24 * 60);
  if (totalMins < 1) return "<1m";
  if (totalMins < 60) return `${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SymbolResult = {
  symbol: string; exchange: string; type: string;
  description?: string; full_symbol?: string;
};

type Candle = {
  date: string; open: number; high: number; low: number; close: number;
  sma20: number | null; rsi14: number | null; isEntry: boolean; isExit: boolean;
};

type Trade = {
  tradeNo: number;
  entryDate: string; exitDate: string;
  entryPrice: number | null; exitPrice: number | null;
  holdingDays: number | null;
  returnPct: number; absPnl: number | null;
  profitable: boolean; exitReason: string;
  entryRsi: number | null; entrySma20: number | null;
  entryMacd: number | null; exitRsi: number | null;
  candles: Candle[];
};

type HistoricalSnapshot = {
  label: string; lookbackDays: number;
  trades: number; wins: number; losses: number;
  winRate: number; totalReturn: number;
  bestTrade: number; worstTrade: number; avgHoldingDays: number;
  equityCurveSlice: Array<{ date: string; value: number }>;
};

type BacktestResult = {
  engine: string; action: string; backtestPeriod: string;
  symbol: string; exchange: string; strategy: string;
  usedCustomConditions?: boolean;
  isOptionsBacktest?: boolean;
  optionsConfig?: Record<string, unknown>;
  totalTrades: number; wins: number; losses: number; winRate: number;
  totalReturn: number; totalAbsPnl?: number; avgReturn: number; maxDrawdown: number;
  profitFactor: number; sharpeRatio: number;
  bestTrade: number; worstTrade: number; avgHoldingDays: number;
  avgWin: number; avgLoss: number; expectancy: number;
  maxWinStreak: number; maxLossStreak: number;
  exitReasonCounts: Record<string, number>;
  trades: Trade[];
  equityCurve: Array<{ date: string; value: number }>;
  dailyReturns?: Array<{ date: string; returnPct: number }>;
  executionDaysApplied?: number[] | null;
  historicalSnapshots: HistoricalSnapshot[];
  strategyAchieved: boolean; achievementReason: string;
  currentIndicators: {
    price: number; sma20: number; rsi14: number;
    macd: number; macdSignal: number; high20d: number; low20d: number;
  };
};

/**
 * VectorBT sometimes returns summary fields as 0 while the trades array has data,
 * OR returns trades with returnPct=0 when entryPrice/exitPrice are both set.
 * This function:
 *  1. Patches each trade's returnPct from entryPrice/exitPrice if returnPct is 0
 *  2. Recomputes all summary metrics from the fixed trades array
 */
function normalizeBacktestResult(d: BacktestResult): BacktestResult {
  const rawTrades = Array.isArray(d.trades) ? d.trades : [];
  if (rawTrades.length === 0) return d;

  // Step 1 — patch returnPct where entry/exit prices are available but return is 0
  const trades = rawTrades.map((t) => {
    if (Number(t.returnPct) !== 0) return t;
    const entry = Number(t.entryPrice);
    const exit  = Number(t.exitPrice);
    if (entry > 0 && exit > 0 && Number.isFinite(entry) && Number.isFinite(exit) && entry !== exit) {
      const returnPct = Number((((exit - entry) / entry) * 100).toFixed(2));
      return { ...t, returnPct, profitable: returnPct > 0 };
    }
    return t;
  });

  // Step 2 — decide whether to recompute the summary
  const summaryLooksWrong =
    d.totalTrades !== trades.length ||
    (trades.length > 0 && d.winRate === 0 && d.totalReturn === 0 && d.profitFactor === 0);
  if (!summaryLooksWrong) return { ...d, trades };

  const returns = trades.map((t) => Number(t.returnPct ?? 0));
  const wins = trades.filter((t) => t.profitable || Number(t.returnPct ?? 0) > 0).length;
  const losses = trades.length - wins;
  const totalReturn = Number(returns.reduce((a, b) => a + b, 0).toFixed(2));
  const winRate = Number(((wins / trades.length) * 100).toFixed(2));
  const avgReturn = Number((totalReturn / trades.length).toFixed(2));
  const winsArr = returns.filter((r) => r > 0);
  const lossArr = returns.filter((r) => r <= 0);
  const grossProfit = winsArr.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(lossArr.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : winsArr.length ? 99 : 0;
  const bestTrade = Number(Math.max(...returns).toFixed(2));
  const worstTrade = Number(Math.min(...returns).toFixed(2));
  const avgWin = winsArr.length ? Number((grossProfit / winsArr.length).toFixed(2)) : 0;
  const avgLoss = lossArr.length ? Number((Math.abs(lossArr.reduce((a,b)=>a+b,0)) / lossArr.length).toFixed(2)) : 0;
  const avgHoldingDays = Number((trades.reduce((a, t) => a + Number(t.holdingDays ?? 0), 0) / trades.length).toFixed(2));
  let eq = 0, peak = 0, maxDd = 0;
  const equityCurve = trades.map((t) => {
    eq += Number(t.returnPct ?? 0);
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, peak - eq);
    return { date: String(t.exitDate ?? ""), value: Number(eq.toFixed(2)) };
  });
  const mean = avgReturn;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? Number(((mean / stdDev) * Math.sqrt(252)).toFixed(2)) : 0;
  const exitReasonCounts: Record<string, number> = {};
  for (const t of trades) {
    const r = String(t.exitReason ?? "unknown");
    exitReasonCounts[r] = (exitReasonCounts[r] ?? 0) + 1;
  }
  return {
    ...d,
    trades,          // use the price-patched trades
    totalTrades: trades.length,
    wins, losses, winRate, totalReturn, avgReturn,
    maxDrawdown: Number(maxDd.toFixed(2)),
    profitFactor, sharpeRatio, bestTrade, worstTrade,
    avgHoldingDays, avgWin, avgLoss,
    expectancy: avgReturn,
    exitReasonCounts,
    equityCurve: equityCurve.length ? equityCurve : (d.equityCurve ?? []),
  };
}

type FilterSignal = { label: string; positive: boolean };

type ScoredTrade = Trade & {
  score?: number;
  signals?: FilterSignal[];
  reason?: string;
};

type AiFilterResponse = {
  filterThreshold: number;
  effectiveThreshold?: number;
  filterNote?: string;
  usedGemini?: boolean;
  rawTrades: ScoredTrade[];
  filteredTrades: ScoredTrade[];
  removedTrades?: ScoredTrade[];
  rawMetrics: {
    totalTrades: number; wins: number; losses: number; winRate: number;
    totalReturn: number; avgReturn: number; maxDrawdown: number;
    profitFactor: number; sharpeRatio: number; bestTrade: number; worstTrade: number;
    avgHoldingDays: number; expectancy: number; equityCurve: Array<{ date: string; value: number }>;
  };
  aiMetrics: {
    totalTrades: number; wins: number; losses: number; winRate: number;
    totalReturn: number; avgReturn: number; maxDrawdown: number;
    profitFactor: number; sharpeRatio: number; bestTrade: number; worstTrade: number;
    avgHoldingDays: number; expectancy: number; equityCurve: Array<{ date: string; value: number }>;
  };
  avgRawScore: number;
  avgFilteredScore: number;
};

/** Prefer `result_snapshot` (full run); else rebuild from summary + trades (equity curve may be empty). */
function backtestResultFromHistoryRow(h: Record<string, unknown>): BacktestResult | null {
  const snap = h.result_snapshot;
  if (snap && typeof snap === "object" && snap !== null) {
    const o = snap as Partial<BacktestResult>;
    if (Array.isArray(o.trades)) return o as BacktestResult;
  }
  const trades = Array.isArray(h.trades) ? (h.trades as Trade[]) : [];
  const s = (h.summary ?? {}) as Record<string, unknown>;
  if (trades.length === 0 && Number(s.totalTrades ?? 0) === 0) return null;
  const dailyReturns = Array.isArray(h.returns)
    ? (h.returns as Array<{ date: string; returnPct: number }>)
    : [];
  const wins = trades.filter((t) => t.profitable).length;
  const losses = Math.max(0, trades.length - wins);
  return {
    engine: "vectorbt",
    action: String(h.action ?? "BUY"),
    backtestPeriod: String(s.backtestPeriod ?? "—"),
    symbol: String(h.symbol ?? ""),
    exchange: String(h.exchange ?? "NSE"),
    strategy: "",
    usedCustomConditions: Boolean(s.usedCustomConditions),
    totalTrades: Number(s.totalTrades ?? trades.length),
    wins,
    losses,
    winRate: Number(s.winRate ?? (trades.length ? (wins / trades.length) * 100 : 0)),
    totalReturn: Number(s.totalReturn ?? 0),
    avgReturn: Number(s.avgReturn ?? s.expectancy ?? 0),
    maxDrawdown: Number(s.maxDrawdown ?? 0),
    profitFactor: Number(s.profitFactor ?? 0),
    sharpeRatio: Number(s.sharpeRatio ?? 0),
    bestTrade: Number(s.bestTrade ?? 0),
    worstTrade: Number(s.worstTrade ?? 0),
    avgHoldingDays: Number(s.avgHoldingDays ?? 0),
    avgWin: Number(s.avgWin ?? 0),
    avgLoss: Number(s.avgLoss ?? 0),
    expectancy: Number(s.expectancy ?? 0),
    maxWinStreak: Number(s.maxWinStreak ?? 0),
    maxLossStreak: Number(s.maxLossStreak ?? 0),
    exitReasonCounts:
      s.exitReasonCounts && typeof s.exitReasonCounts === "object"
        ? (s.exitReasonCounts as Record<string, number>)
        : {},
    trades,
    equityCurve: [],
    dailyReturns,
    executionDaysApplied: null,
    historicalSnapshots: Array.isArray(h.historical_snapshots)
      ? (h.historical_snapshots as HistoricalSnapshot[])
      : [],
    strategyAchieved: Boolean(s.strategyAchieved),
    achievementReason: "",
    currentIndicators: {
      price: 0,
      sma20: 0,
      rsi14: 0,
      macd: 0,
      macdSignal: 0,
      high20d: 0,
      low20d: 0,
    },
  };
}

/** First instrument from saved strategy `symbols` jsonb (strings or { symbol, exchange } rows). */
function firstSymbolAndExchangeFromStrategy(cs: FullCustomStrategy): { symbol: string; exchange: string } | null {
  const raw = cs.symbols;
  if (!Array.isArray(raw) || raw.length === 0) {
    const pc = cs.position_config;
    if (pc && typeof pc === "object") {
      const sym = String((pc as Record<string, unknown>).symbol ?? "").trim().toUpperCase();
      if (sym) {
        const ex = String((pc as Record<string, unknown>).exchange ?? "NSE").toUpperCase();
        const exNorm = ["NSE", "BSE", "GLOBAL", "NFO", "MCX", "CDS"].includes(ex) ? ex : "NSE";
        return { symbol: sym, exchange: exNorm };
      }
    }
    return null;
  }
  const first = raw[0];
  if (typeof first === "string") {
    const u = first.trim().toUpperCase();
    if (!u) return null;
    const ex = u.endsWith(".BO") ? "BSE" : u.endsWith(".NS") ? "NSE" : "GLOBAL";
    return { symbol: u, exchange: ex };
  }
  if (first && typeof first === "object") {
    const o = first as Record<string, unknown>;
    const sym = String(o.symbol ?? o.tradingsymbol ?? "").trim().toUpperCase();
    if (!sym) return null;
    const ex = String(o.exchange ?? "NSE").toUpperCase();
    const exNorm = ["NSE", "BSE", "GLOBAL", "NFO", "MCX", "CDS"].includes(ex) ? ex : "NSE";
    return { symbol: sym, exchange: exNorm };
  }
  return null;
}

function formatSavedSymbolsList(cs: FullCustomStrategy): string {
  const raw = cs.symbols;
  if (!Array.isArray(raw) || raw.length === 0) return "—";
  return raw
    .map((item: unknown) => {
      if (typeof item === "string") return item.trim().toUpperCase();
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const s = String(o.symbol ?? o.tradingsymbol ?? "").trim();
        const x = o.exchange != null ? ` (${String(o.exchange)})` : "";
        return s ? `${s.toUpperCase()}${x}` : "";
      }
      return "";
    })
    .filter(Boolean)
    .join(", ") || "—";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SymbolSearchInput({ value, onChange, onSelect }: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (symbol: string, exchange: string) => void;
}) {
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debRef = useState<{ t?: ReturnType<typeof setTimeout> }>({})[0];

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setSearching(true);
    try {
      const res = await supabase.functions.invoke("search-symbols", { body: { q } });
      const list = ((res.data as any[]) ?? []).slice(0, 10) as SymbolResult[];
      setResults(list); setOpen(list.length > 0);
    } catch { setResults([]); setOpen(false); } finally { setSearching(false); }
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
        <Input
          placeholder="Search symbol…" value={value}
          onChange={e => { const v = e.target.value.toUpperCase(); onChange(v); if (debRef.t) clearTimeout(debRef.t); debRef.t = setTimeout(() => search(v), 250); }}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="bg-zinc-800 border-zinc-700 font-mono text-sm pl-8 pr-8 uppercase"
        />
        {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-zinc-500" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl z-50 overflow-hidden">
          {results.map(r => (
            <button key={String(r.full_symbol ?? r.symbol)} type="button"
              onClick={() => { const full = (r.full_symbol ?? r.symbol ?? "").toUpperCase(); const ex = full.endsWith(".BO") ? "BSE" : full.endsWith(".NS") ? "NSE" : "GLOBAL"; onSelect(full || r.symbol, ex); setOpen(false); setResults([]); }}
              className="w-full text-left px-3 py-2 hover:bg-zinc-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-zinc-100 text-xs">{r.symbol}</span>
                </div>
                {r.description && <div className="text-[10px] text-zinc-500 truncate">{r.description}</div>}
              </div>
              <span className="text-[10px] text-zinc-600 shrink-0">{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Plain label for tables / PDF export */
function exitReasonPdfLabel(reason: string): string {
  const m: Record<string, string> = {
    stop_loss: "Stop loss",
    take_profit: "Take profit",
    max_hold: "Max hold",
    trailing_stop: "Trailing stop",
    indicator_exit: "Indicator",
    end_of_data: "End of data",
  };
  return m[reason] ?? reason;
}

function ExitReasonBadge({ reason }: { reason: string }) {
  if (reason === "stop_loss") return <Badge className="bg-red-900/60 text-red-300 border-red-700 text-[10px] px-1.5 py-0">SL</Badge>;
  if (reason === "take_profit") return <Badge className="bg-emerald-900/60 text-emerald-300 border-emerald-700 text-[10px] px-1.5 py-0">TP</Badge>;
  if (reason === "max_hold") return <Badge className="bg-amber-900/60 text-amber-300 border-amber-700 text-[10px] px-1.5 py-0">Hold</Badge>;
  if (reason === "trailing_stop") return <Badge className="bg-orange-900/60 text-orange-300 border-orange-700 text-[10px] px-1.5 py-0">Trail</Badge>;
  if (reason === "indicator_exit") return <Badge className="bg-sky-900/60 text-sky-300 border-sky-700 text-[10px] px-1.5 py-0">Ind</Badge>;
  if (reason === "end_of_data") return <Badge className="bg-zinc-800 text-zinc-400 border-zinc-700 text-[10px] px-1.5 py-0">EOD</Badge>;
  return <Badge className="bg-zinc-800 text-zinc-500 border-zinc-700 text-[10px] px-1.5 py-0">{reason}</Badge>;
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string;
  color?: "green" | "red" | "yellow" | "blue" | "default";
}) {
  const cls = color === "green" ? "text-emerald-400" : color === "red" ? "text-red-400"
    : color === "yellow" ? "text-amber-400" : color === "blue" ? "text-sky-400" : "text-zinc-200";
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className={`font-mono font-semibold text-sm ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

/** Slice a tall canvas into A4-height pages in a jsPDF document. */
function addCanvasToPdfPaginated(
  canvas: HTMLCanvasElement,
  pdf: jsPDF,
  marginPt: number,
): void {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - 2 * marginPt;
  const imgHpt = (canvas.height * usableW) / canvas.width;
  const pageContentH = pageH - 2 * marginPt;
  let srcY = 0;
  let first = true;
  while (srcY < canvas.height - 0.5) {
    if (!first) pdf.addPage();
    first = false;
    const srcH = Math.min(
      canvas.height - srcY,
      Math.max(1, (pageContentH / imgHpt) * canvas.height),
    );
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.ceil(srcH);
    const ctx = slice.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
    const destHpt = (srcH / canvas.height) * imgHpt;
    pdf.addImage(slice.toDataURL("image/png"), "PNG", marginPt, marginPt, usableW, destHpt);
    srcY += srcH;
  }
}

// ─── Trade detail popup ───────────────────────────────────────────────────────

function TradeDetailPopup({
  trade,
  action,
  symbol,
  snapshots,
  allTrades,
  open,
  onClose,
  initialCapital,
  displayCurrency,
  exchangeForQuote,
  inrPerUsd,
  fxRateDate,
}: {
  trade: Trade;
  action: string;
  symbol: string;
  snapshots: HistoricalSnapshot[];
  allTrades: Trade[];
  open: boolean;
  onClose: () => void;
  initialCapital: number;
  displayCurrency: "INR" | "USD";
  exchangeForQuote: string;
  inrPerUsd: number | null;
  fxRateDate: string;
}) {
  const [tab, setTab] = useState<"chart" | "whatif">("chart");

  const isOptions = Boolean((trade as any).direction);

  const chartCandles = useMemo((): Candle[] => {
    if (trade.candles.length > 0) return trade.candles;
    if (!isOptions) return [];
    const ep = trade.entryPrice;
    const xp = trade.exitPrice;
    if (ep == null || xp == null) return [];
    const ehh = String((trade as any).entry_hhmm ?? "").trim();
    const xhh = String((trade as any).exit_hhmm ?? "").trim();
    const d0 = ehh ? `${trade.entryDate} ${ehh}` : trade.entryDate;
    const d1 = xhh ? `${trade.exitDate} ${xhh}` : trade.exitDate;
    const hi = Math.max(ep, xp);
    const lo = Math.min(ep, xp);
    return [
      { date: d0, open: ep, high: hi, low: lo, close: ep, sma20: null, rsi14: null, isEntry: true, isExit: false },
      { date: d1, open: ep, high: hi, low: lo, close: xp, sma20: null, rsi14: null, isEntry: false, isExit: true },
    ];
  }, [trade, isOptions]);

  const prices = chartCandles.map(c => c.close);
  const minP = prices.length ? Math.min(...prices) * 0.995 : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.005 : 1;
  const profitable = trade.returnPct > 0;
  const pnlFromPct = (trade as any).absPnl != null
    ? (trade as any).absPnl
    : (trade.returnPct / 100) * initialCapital;
  const pnlLabel = formatMoneyAmount(pnlFromPct, displayCurrency);

  const holdingDisplay = !isOptions
    ? `${trade.holdingDays ?? "—"}d`
    : formatFractionalHoldAsHM(trade.holdingDays ?? 0);

  // Find similar trades (same exit reason, within ±50% return relative)
  const similarTrades = allTrades.filter(
    t => t.tradeNo !== trade.tradeNo
      && t.exitReason === trade.exitReason
      && Math.abs(t.returnPct - trade.returnPct) <= Math.abs(trade.returnPct) * 0.5
  ).slice(0, 4);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] !max-w-[96vw] flex-col gap-0 !overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:!max-w-[800px] sm:h-auto sm:max-h-[90vh]">
        <div className="shrink-0 border-b border-zinc-800 px-5 py-4">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="text-white text-lg flex items-center gap-2">
                <span className="font-mono text-teal-400">{symbol}</span>
                <span className="text-zinc-600">/</span>
                Trade #{trade.tradeNo}
              </DialogTitle>
              <ExitReasonBadge reason={trade.exitReason} />
            </div>
            <div className="text-zinc-500 text-[10px] sm:text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={`font-mono font-bold ${profitable ? "text-emerald-400" : "text-red-400"}`}>
                {trade.returnPct >= 0 ? "+" : ""}{trade.returnPct}%
              </span>
              <span className="text-zinc-700">|</span>
              <span>{pnlLabel} P&L</span>
              <span className="text-zinc-700">|</span>
              <span>{displayCurrency} {initialCapital.toLocaleString()} notional</span>
            </div>
          </DialogHeader>
        </div>

        {/* Tab switcher */}
        <div className="flex shrink-0 bg-zinc-900/30 px-5 border-b border-zinc-900">
          {(["chart", "whatif"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-xs font-medium transition-all relative ${
                tab === t
                  ? "text-teal-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "chart" ? "Trade Analysis" : "Historical Windows"}
              {tab === t && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500"
                />
              )}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800">
          {tab === "chart" && (
            <div className="space-y-6">
              {/* Key details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Entry"
                  value={trade.entryPrice ?? "—"}
                  sub={isOptions ? `${trade.entryDate} ${(trade as any).entry_hhmm ?? ""}` : trade.entryDate}
                />
                <StatCard
                  label="Exit"
                  value={trade.exitPrice != null ? trade.exitPrice : (isOptions ? (trade as any).exit_hhmm ?? "—" : "—")}
                  sub={isOptions ? `${trade.exitDate} ${(trade as any).exit_hhmm ?? ""}` : trade.exitDate}
                  color={profitable ? "green" : "red"}
                />
                <StatCard label="Holding" value={holdingDisplay} sub="Duration" />
                <StatCard label="Return" value={`${trade.returnPct >= 0 ? "+" : ""}${trade.returnPct}%`} sub={pnlLabel} color={profitable ? "green" : "red"} />
              </div>

              {/* Indicators row */}
              {(trade.entryRsi !== null || trade.entrySma20 !== null || trade.entryMacd !== null) && (
                <div className="flex flex-wrap gap-2">
                  {trade.entryRsi !== null && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 flex items-center gap-2">
                      <span className="text-[10px] uppercase text-zinc-500 font-medium">RSI Entry</span>
                      <span className="text-purple-400 font-mono text-xs">{trade.entryRsi}</span>
                    </div>
                  )}
                  {trade.entrySma20 !== null && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 flex items-center gap-2">
                      <span className="text-[10px] uppercase text-zinc-500 font-medium">SMA20 Entry</span>
                      <span className="text-amber-400 font-mono text-xs">{trade.entrySma20}</span>
                    </div>
                  )}
                  {trade.entryMacd !== null && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 flex items-center gap-2">
                      <span className="text-[10px] uppercase text-zinc-500 font-medium">MACD Entry</span>
                      <span className="text-sky-400 font-mono text-xs">{trade.entryMacd}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Advanced charts (options: synthetic entry→exit premium path if no daily candles) */}
              {chartCandles.length > 0 ? (
                <div className="space-y-4">
                  {isOptions && trade.candles.length === 0 && (
                    <p className="text-[10px] text-zinc-500">
                      Premium proxy (entry → exit) — intraday underlying path drives % return; chart shows estimated option premium levels.
                    </p>
                  )}
                  <div className="rounded-xl border border-zinc-800 bg-black/40 p-4 shadow-inner">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Price Evolution & Indicators</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-zinc-600">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-4 border-t-2 border-dashed border-amber-500/90" />
                          SMA20
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-4 border-t-2 border-dashed border-emerald-500" />
                          ENTRY
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block w-4 border-t-2 border-dashed border-red-500" />
                          EXIT
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0">
                      <div className="flex min-h-0 gap-1">
                        <div className="h-[280px] min-w-0 flex-1">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartCandles} margin={{ top: 12, right: 4, bottom: 22, left: 8 }}>
                              <defs>
                                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3f3f46" stopOpacity={0.2} />
                                  <stop offset="95%" stopColor="#3f3f46" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                              <XAxis
                                dataKey="date"
                                tick={{ fill: "#52525b", fontSize: 8 }}
                                tickFormatter={(v: string) => formatEquityChartDate(String(v))}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={32}
                                padding={{ left: 0, right: 0 }}
                              />
                              <YAxis
                                domain={[minP, maxP]}
                                tick={{ fill: "#52525b", fontSize: 9, dx: 2 }}
                                tickFormatter={(v: number) => v.toLocaleString()}
                                width={50}
                                axisLine={false}
                                tickLine={false}
                                orientation="right"
                              />
                              <Tooltip
                                contentStyle={{ background: "#09090b", border: "1px solid #27272a", borderRadius: 8, fontSize: 11, color: "#fff" }}
                                itemStyle={{ padding: 0 }}
                                cursor={{ stroke: "#3f3f46" }}
                                labelFormatter={(label) => formatEquityChartDate(String(label))}
                              />
                              <Area
                                type="monotone"
                                dataKey="close"
                                stroke="#71717a"
                                strokeWidth={2}
                                fill="url(#priceGrad)"
                                name="Close"
                                isAnimationActive={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="sma20"
                                stroke="#f59e0b"
                                dot={false}
                                strokeWidth={1.5}
                                strokeDasharray="4 4"
                                name="SMA 20"
                                opacity={0.7}
                              />
                              <ReferenceLine
                                x={chartCandles[0]?.date ?? trade.entryDate}
                                stroke="#10b981"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                label={{ value: "Entry", fill: "#10b981", fontSize: 10, position: "top", fontWeight: "bold" }}
                              />
                              <ReferenceLine
                                x={chartCandles[chartCandles.length - 1]?.date ?? trade.exitDate}
                                stroke="#ef4444"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                label={{ value: "Exit", fill: "#ef4444", fontSize: 10, position: "top", fontWeight: "bold" }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                        <div
                          className="relative h-[280px] w-11 shrink-0 overflow-visible border-l border-zinc-800/50"
                          aria-hidden
                        >
                          <span className="pointer-events-none absolute left-1/2 top-1/2 w-max max-w-[220px] -translate-x-1/2 -translate-y-1/2 -rotate-90 text-center text-[10px] font-medium leading-tight text-zinc-400 select-none">
                            Close & SMA20 ({displayCurrency})
                          </span>
                        </div>
                      </div>
                      <p className="text-center text-[10px] font-medium tracking-wide text-zinc-400 pt-1">Date</p>
                    </div>
                  </div>

                  {/* RSI component */}
                  {chartCandles.some(c => c.rsi14 !== null) && (
                    <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">RSI (14)</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-zinc-600">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-sm bg-violet-500/90" />
                            RSI line
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-4 border-t border-dashed border-red-500/70" />
                            70 overbought
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-4 border-t border-dashed border-emerald-500/70" />
                            30 oversold
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0">
                        <div className="flex min-h-0 gap-1">
                          <div className="h-[132px] min-w-0 flex-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartCandles} margin={{ top: 6, right: 2, bottom: 20, left: 6 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                <XAxis
                                  dataKey="date"
                                  tick={{ fill: "#52525b", fontSize: 7 }}
                                  tickFormatter={(v: string) => formatEquityChartDate(String(v))}
                                  axisLine={false}
                                  tickLine={false}
                                  minTickGap={40}
                                  padding={{ left: 0, right: 0 }}
                                />
                                <YAxis
                                  domain={[0, 100]}
                                  tick={{ fill: "#52525b", fontSize: 8, dx: 2 }}
                                  tickFormatter={(v: number) => String(v)}
                                  width={28}
                                  ticks={[0, 30, 50, 70, 100]}
                                  axisLine={false}
                                  tickLine={false}
                                  orientation="right"
                                />
                                <Tooltip
                                  contentStyle={{
                                    background: "#09090b",
                                    border: "1px solid #27272a",
                                    borderRadius: 6,
                                    fontSize: 10,
                                  }}
                                  formatter={(v: number | undefined) => [
                                    v != null && Number.isFinite(v) ? v.toFixed(1) : "—",
                                    "RSI (14)",
                                  ]}
                                  labelFormatter={(label) => formatEquityChartDate(String(label))}
                                  labelStyle={{ color: "#a1a1aa", marginBottom: 2 }}
                                />
                                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" opacity={0.45} />
                                <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" opacity={0.45} />
                                <ReferenceLine y={50} stroke="#52525b" strokeDasharray="1 1" opacity={0.25} />
                                <Line
                                  type="monotone"
                                  dataKey="rsi14"
                                  stroke="#a78bfa"
                                  dot={false}
                                  strokeWidth={2}
                                  name="RSI"
                                  isAnimationActive={false}
                                  connectNulls
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div
                            className="relative h-[132px] w-9 shrink-0 overflow-visible border-l border-zinc-800/50"
                            aria-hidden
                          >
                            <span className="pointer-events-none absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-medium text-zinc-400 select-none">
                              RSI (0–100)
                            </span>
                          </div>
                        </div>
                        <p className="text-center text-[10px] font-medium tracking-wide text-zinc-400 pt-1">Date</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center border border-dashed border-zinc-800 rounded-lg text-zinc-600 text-xs italic">
                  Visual data not available for this window
                </div>
              )}

              {/* Similar Trades section */}
              {similarTrades.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Comparison: Similar Behavior</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {similarTrades.map(t => {
                      const isProf = t.returnPct > 0;
                      return (
                        <div key={t.tradeNo} className="flex items-center justify-between p-3 rounded-lg border border-zinc-900 bg-zinc-950/40 hover:bg-zinc-900/60 transition-colors group">
                          <div className="space-y-1">
                            <p className="text-[11px] font-mono text-zinc-300">Run #{t.tradeNo} <span className="text-zinc-600 ml-1">• {t.entryDate}</span></p>
                            <ExitReasonBadge reason={t.exitReason} />
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-bold font-mono ${isProf ? "text-emerald-400" : "text-red-400"}`}>
                              {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "whatif" && (
            <div className="space-y-6">
              <div className="bg-teal-500/5 border border-teal-500/10 rounded-lg p-4">
                <p className="text-zinc-400 text-xs leading-relaxed">
                  <span className="text-teal-400 font-bold uppercase mr-2 tracking-tighter">Historical What-If</span>
                  Simulating the same strategy across different historical entry points. This helps validate if this trade's outcome was an outlier or consistent with past windows.
                </p>
              </div>

              {snapshots.length === 0 ? (
                <div className="h-40 flex items-center justify-center border border-dashed border-zinc-800 rounded-lg text-zinc-600 text-xs italic">
                  No multi-window benchmarks available
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Snapshot cards grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {snapshots.map(s => (
                      <div key={s.lookbackDays} className={`rounded-xl border p-4 space-y-4 transition-all ${s.totalReturn >= 0 ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "border-red-500/20 bg-red-500/[0.02]"}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-zinc-300 uppercase tracking-tighter text-xs">Window: {s.label}</p>
                          <Badge variant="outline" className={`${s.totalReturn >= 0 ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400"}`}>
                            {s.totalReturn >= 0 ? "+" : ""}{s.totalReturn}%
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <p className="text-[9px] text-zinc-500 uppercase">Win Rate</p>
                            <p className={`font-mono text-xs font-semibold ${s.winRate >= 50 ? "text-emerald-400" : "text-amber-400"}`}>{s.winRate}%</p>
                          </div>
                          <div className="space-y-1 text-right">
                            <p className="text-[9px] text-zinc-500 uppercase">Avg Hold</p>
                            <p className="font-mono text-xs text-zinc-300 font-semibold">
                              {isOptions ? formatFractionalHoldAsHM(s.avgHoldingDays) : `${s.avgHoldingDays}d`}
                            </p>
                          </div>
                        </div>

                        {s.equityCurveSlice.length > 5 && (
                          <div className="h-12 w-full opacity-60">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={s.equityCurveSlice} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id={`grad${s.lookbackDays}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={s.totalReturn >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={s.totalReturn >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <Area
                                  type="monotone"
                                  dataKey="value"
                                  stroke={s.totalReturn >= 0 ? "#10b981" : "#ef4444"}
                                  fill={`url(#grad${s.lookbackDays})`}
                                  strokeWidth={1}
                                  dot={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Windows Comparison Bar Chart */}
                  <div className="rounded-xl border border-zinc-800 bg-black/40 p-5">
                    <p className="text-[10px] font-semibold text-zinc-500 mb-5 uppercase tracking-widest text-center">Relative Performance Comparison</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <ComposedChart data={snapshots}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip
                          contentStyle={{
                            background: "#09090b",
                            border: "1px solid #27272a",
                            borderRadius: 8,
                            fontSize: 10,
                            color: "#e4e4e7",
                          }}
                          itemStyle={{ color: "#e4e4e7" }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v}%`, "Return"]}
                        />
                        <Bar dataKey="totalReturn" radius={[4, 4, 0, 0]}>
                          {snapshots.map((s, i) => (
                            <Cell key={i} fill={s.totalReturn >= 0 ? "#10b981" : "#ef4444"} opacity={0.8} />
                          ))}
                        </Bar>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-800 p-4 bg-zinc-950 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-500 hover:text-white">
            Close Analysis
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Charts ───────────────────────────────────────────────────────────────────

const EQUITY_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** Calendar-safe: parse YYYY-MM-DD prefix without timezone shift. */
function formatEquityChartDate(raw: string): string {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const yyyy = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const dd = Number(m[3]);
    const mon = EQUITY_MONTHS[mo] ?? "";
    return `${String(dd).padStart(2, "0")} ${mon} ${yyyy}`;
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getUTCDate()).padStart(2, "0")} ${EQUITY_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  return raw;
}

/** UTC midnight ms for equity curve x-position (same calendar day as YYYY-MM-DD string). */
function parseEquityDateMs(raw: string): number | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function formatEquityChartTickMs(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mon = EQUITY_MONTHS[d.getUTCMonth()] ?? "";
  return `${dd} ${mon} ${d.getUTCFullYear()}`;
}

/** Money-scale epsilon: ignore float / micro drift when detecting a flat equity tail. */
function equityFlatEps(v: number): number {
  const a = Math.abs(v);
  return Math.max(0.01, a * 1e-5);
}

/**
 * Trim all trailing points whose value still matches the final portfolio level (within eps).
 * Index-based vs pop+plateau avoids bugs when the running last value drifts from the original plateau.
 */
function trimTrailingFlatEquity<T extends { value: number }>(arr: T[]): T[] {
  if (arr.length <= 2) return arr;
  const plateau = arr[arr.length - 1]!.value;
  const eps = equityFlatEps(plateau);
  let k = arr.length - 1;
  while (k > 0 && Math.abs(arr[k - 1]!.value - plateau) < eps) {
    k--;
  }
  const out = arr.slice(0, k + 1);
  return out.length >= 2 ? out : arr.slice(0, 2);
}

function EquityCurveChart({
  data,
  initialCapital,
  displayCurrency,
}: {
  data: Array<{ date: string; value: number }>;
  initialCapital: number;
  displayCurrency: "INR" | "USD";
}) {
  if (!data || data.length === 0) return null;
  const base0 = data[0]?.value;
  const scale = base0 && Number.isFinite(base0) && base0 !== 0 ? initialCapital / base0 : 1;
  const scaled = trimTrailingFlatEquity(
    data
      .map(d => {
        const ts = parseEquityDateMs(d.date);
        const v = d.value * scale;
        return ts != null && Number.isFinite(v) ? { date: d.date, ts, value: v } : null;
      })
      .filter((row): row is { date: string; ts: number; value: number } => row != null)
      .sort((a, b) => a.ts - b.ts),
  );
  const startV = scaled[0]?.value ?? initialCapital;
  const endV = scaled[scaled.length - 1]?.value ?? startV;
  const isPos = endV >= startV;
  const totalRet = ((endV - startV) / startV) * 100;
  
  const curSym = displayCurrency === "INR" ? "₹" : "$";
  const loc = displayCurrency === "INR" ? "en-IN" : "en-US";
  const fmtK = (v: number) => `${curSym}${(v / 1000).toFixed(1)}k`;
  const fmtFull = (v: number) => `${curSym}${v.toLocaleString(loc, { maximumFractionDigits: 0 })}`;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Equity Curve</p>
          <p className="text-[10px] text-zinc-500">Starting: {fmtFull(initialCapital)} · {displayCurrency}</p>
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold font-mono ${isPos ? "text-emerald-400" : "text-red-400"}`}>
            {totalRet >= 0 ? "+" : ""}{totalRet.toFixed(2)}%
          </p>
          <p className="text-[9px] text-zinc-600 font-mono uppercase">Absolute Return</p>
        </div>
      </div>
      
      <div className="rounded-xl border border-zinc-800 bg-black/40 p-4 shadow-inner">
        <div className="flex flex-col gap-0">
          <div className="flex min-h-0 gap-1">
            <div className="h-[280px] min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={scaled} margin={{ top: 12, right: 4, bottom: 32, left: 8 }}>
                  <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isPos ? "#10b981" : "#ef4444"} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={isPos ? "#10b981" : "#ef4444"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="ts"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tick={{ fill: "#52525b", fontSize: 9 }}
                    tickFormatter={(v: number) => formatEquityChartTickMs(v)}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                    padding={{ left: 0, right: 0 }}
                  />
                  <YAxis
                    tick={{ fill: "#52525b", fontSize: 9, dx: 2 }}
                    tickFormatter={fmtK}
                    width={58}
                    axisLine={false}
                    tickLine={false}
                    orientation="right"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#09090b",
                      border: "1px solid #27272a",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#e4e4e7",
                    }}
                    itemStyle={{ color: "#e4e4e7" }}
                    formatter={(v: number) => [fmtFull(Number(v)), "Portfolio value"]}
                    labelFormatter={(label) =>
                      formatEquityChartTickMs(typeof label === "number" ? label : Number(label))
                    }
                    labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
                  />
                  <ReferenceLine
                    y={initialCapital}
                    stroke="#52525b"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    label={{ value: "Initial Capital", position: "left", fill: "#52525b", fontSize: 10 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={isPos ? "#10b981" : "#ef4444"}
                    fill="url(#eqGrad)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: isPos ? "#10b981" : "#ef4444" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div
              className="relative h-[280px] w-12 shrink-0 overflow-visible border-l border-zinc-800/60"
              aria-hidden
            >
              <span className="pointer-events-none absolute left-1/2 top-1/2 w-max max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-medium text-zinc-400 select-none">
                {displayCurrency === "INR" ? "Portfolio value (INR)" : "Portfolio value (USD)"}
              </span>
            </div>
          </div>
          <p className="text-center text-[10px] font-medium tracking-wide text-zinc-400 pt-1.5">
            Date
          </p>
        </div>
      </div>
    </div>
  );
}

function TradeReturnsChart({ trades }: { trades: Trade[] }) {
  if (!trades || trades.length === 0) return null;
  const data = trades.map(t => ({ name: `#${t.tradeNo}`, ret: t.returnPct }));
  const avgRet = data.reduce((a, b) => a + b.ret, 0) / data.length;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Return per Trade (%)</p>
        <p className="text-[10px] text-zinc-500 font-mono">Avg: <span className={avgRet >= 0 ? "text-emerald-400" : "text-red-400"}>{avgRet.toFixed(2)}%</span></p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
        <div className="flex flex-col gap-0">
          <div className="flex min-h-0 gap-1">
            <div className="h-[200px] min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 10, right: 4, bottom: 24, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#52525b", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#52525b", fontSize: 9, dx: 2 }}
                    tickFormatter={(v: number) => `${v}%`}
                    width={44}
                    axisLine={false}
                    tickLine={false}
                    orientation="right"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#09090b",
                      border: "1px solid #27272a",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#e4e4e7",
                    }}
                    itemStyle={{ color: "#e4e4e7" }}
                    formatter={(v: number) => [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Trade return"]}
                    labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
                  />
                  <ReferenceLine y={0} stroke="#52525b" strokeWidth={1} />
                  <ReferenceLine
                    y={avgRet}
                    stroke="#71717a"
                    strokeDasharray="3 3"
                    label={{ value: "Average", position: "left", fill: "#71717a", fontSize: 9 }}
                  />
                  <Bar dataKey="ret" radius={[3, 3, 0, 0]}>
                    {data.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.ret > 0 ? "#10b981" : "#ef4444"}
                        fillOpacity={0.7}
                        className="transition-all hover:fill-opacity-100"
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div
              className="relative h-[200px] w-10 shrink-0 overflow-visible border-l border-zinc-800/50"
              aria-hidden
            >
              <span className="pointer-events-none absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-medium text-zinc-400 select-none">
                Return (%)
              </span>
            </div>
          </div>
          <p className="text-center text-[10px] font-medium tracking-wide text-zinc-400 pt-1">
            Trade #
          </p>
        </div>
      </div>
    </div>
  );
}

function DailyPortfolioReturnsChart({ data }: { data: Array<{ date: string; returnPct: number }> }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center border border-dashed border-zinc-800 rounded-xl text-zinc-600 text-xs italic">
        Daily return series not available
      </div>
    );
  }

  const series = data
    .map(d => {
      const ts = parseEquityDateMs(d.date);
      return ts != null && Number.isFinite(d.returnPct) ? { ts, ret: d.returnPct, date: d.date } : null;
    })
    .filter((r): r is { ts: number; ret: number; date: string } => r != null)
    .sort((a, b) => a.ts - b.ts);

  if (series.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center border border-dashed border-zinc-800 rounded-xl text-zinc-600 text-xs italic">
        Daily return series not available
      </div>
    );
  }

  const n = series.length;
  const avg = series.reduce((s, x) => s + x.ret, 0) / n;
  const best = Math.max(...series.map(x => x.ret));
  const worst = Math.min(...series.map(x => x.ret));
  const winDays = series.filter(x => x.ret > 0).length;
  const winPct = (winDays / n) * 100;

  const fmtDay = (r: number) => `${r >= 0 ? "+" : ""}${r.toFixed(2)}%`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Daily returns</p>
        <p className="text-[10px] text-zinc-500 leading-relaxed max-w-xl">
          Each point is how much the portfolio moved from one day's close to the next. The horizontal line at{" "}
          <span className="text-zinc-400">0%</span> separates up days from down days.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/60 px-3 py-2.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">Average / day</p>
          <p className={`mt-0.5 text-sm font-mono font-semibold tabular-nums ${avg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {fmtDay(avg)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/60 px-3 py-2.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">Up days</p>
          <p className="mt-0.5 text-sm font-mono font-semibold tabular-nums text-zinc-200">{winPct.toFixed(0)}%</p>
          <p className="text-[9px] text-zinc-600 mt-0.5">
            {winDays} of {n} days
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/60 px-3 py-2.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">Best day</p>
          <p className="mt-0.5 text-sm font-mono font-semibold tabular-nums text-emerald-400">{fmtDay(best)}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/60 px-3 py-2.5">
          <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">Worst day</p>
          <p className="mt-0.5 text-sm font-mono font-semibold tabular-nums text-red-400">{fmtDay(worst)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-black/35 p-4">
        <div className="flex flex-col gap-0">
          <div className="flex min-h-0 gap-1">
            <div className="h-[240px] min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 4, bottom: 28, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="ts"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tick={{ fill: "#71717a", fontSize: 9 }}
                    tickFormatter={(v: number) => formatEquityChartTickMs(v)}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={36}
                    padding={{ left: 0, right: 0 }}
                  />
                  <YAxis
                    tick={{ fill: "#71717a", fontSize: 9, dx: 2 }}
                    tickFormatter={(v: number) => `${v}%`}
                    width={48}
                    axisLine={false}
                    tickLine={false}
                    orientation="right"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#09090b",
                      border: "1px solid #27272a",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "#e4e4e7",
                    }}
                    itemStyle={{ color: "#e4e4e7" }}
                    formatter={(v: number) => [
                      `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(3)}%`,
                      "That day's return",
                    ]}
                    labelFormatter={(label) => formatEquityChartTickMs(typeof label === "number" ? label : Number(label))}
                    labelStyle={{ color: "#a1a1aa", marginBottom: 4 }}
                  />
                  <ReferenceLine y={0} stroke="#52525b" strokeWidth={1} />
                  <Line
                    type="linear"
                    dataKey="ret"
                    stroke="#2dd4bf"
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: "#5eead4" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div
              className="relative h-[240px] w-10 shrink-0 overflow-visible border-l border-zinc-800/50"
              aria-hidden
            >
              <span className="pointer-events-none absolute left-1/2 top-1/2 w-max -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-medium text-zinc-400 select-none">
                Daily return (%)
              </span>
            </div>
          </div>
          <p className="text-center text-[10px] font-medium tracking-wide text-zinc-400 pt-1">Date</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BacktestingSection() {
  const [mode, setMode] = useState<"strategy" | "simple" | "options">("strategy");
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState("NSE");
  const [strategy, setStrategy] = useState("trend_following");
  const [customStrategies, setCustomStrategies] = useState<FullCustomStrategy[]>([]);
  const [selectedCustomId, setSelectedCustomId] = useState<string>("");
  // Options ORB strategy state
  const [optionsStrategies, setOptionsStrategies] = useState<Record<string, unknown>[]>([]);
  const [selectedOptionsStratId, setSelectedOptionsStratId] = useState<string>("");
  const [orbDurationMins, setOrbDurationMins] = useState("15");
  const [orbMinRangePct, setOrbMinRangePct] = useState("0.2");
  const [orbMaxRangePct, setOrbMaxRangePct] = useState("1.0");
  const [orbMomentumBars, setOrbMomentumBars] = useState("3");
  const [orbSlPct, setOrbSlPct] = useState("30");
  const [orbTpPct, setOrbTpPct] = useState("50");
  const [orbTrailingEnabled, setOrbTrailingEnabled] = useState(true);
  const [orbTrailAfterPct, setOrbTrailAfterPct] = useState("30");
  const [orbTrailPct, setOrbTrailPct] = useState("15");
  const [orbTimeExit, setOrbTimeExit] = useState("15:15");
  const [orbMaxReentry, setOrbMaxReentry] = useState("1");
  const [orbExpiry, setOrbExpiry] = useState<"weekly" | "monthly">("weekly");
  const [orbDirection, setOrbDirection] = useState("neutral");
  const [orbExpiryGuard, setOrbExpiryGuard] = useState(true);
  const [orbLots, setOrbLots] = useState("1");
  // Options symbol picker (expiry + contract for backtest)
  const [orbExpiries, setOrbExpiries] = useState<NormalizedExpiryItem[]>([]);
  const [orbExpiryIso, setOrbExpiryIso] = useState<string>("");
  const [orbOptionRows, setOrbOptionRows] = useState<TradableOptionRow[]>([]);
  const [orbOptionSymbol, setOrbOptionSymbol] = useState<string>("");
  const [orbLoadingExpiries, setOrbLoadingExpiries] = useState(false);
  const [orbLoadingChain, setOrbLoadingChain] = useState(false);
  const [orbPickerError, setOrbPickerError] = useState<string | null>(null);
  const [action, setAction] = useState<"BUY" | "SELL">("BUY");
  const [slPct, setSlPct] = useState("2");
  const [tpPct, setTpPct] = useState("4");
  const [startTime, setStartTime] = useState("09:15");
  const [endTime, setEndTime] = useState("15:15");
  const [squareoff, setSquareoff] = useState("15:15");
  const [days, setDays] = useState("365");
  const [loading, setLoading] = useState(false);
  const [aiFilterLoading, setAiFilterLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [aiFilterResult, setAiFilterResult] = useState<AiFilterResponse | null>(null);
  const [resultView, setResultView] = useState<"raw" | "ai">("raw");
  const [showFilterAnalysis, setShowFilterAnalysis] = useState(false);
  const [timingReview, setTimingReview] = useState<string | null>(null);
  const [tradesPage, setTradesPage] = useState(1);
  const tradesPerPage = 15;
  type TradePopupState = {
    trade: Trade;
    symbol: string;
    exchange: string;
    action: string;
    snapshots: HistoricalSnapshot[];
    allTrades: Trade[];
    /** When opening from saved history, match the run’s notional / currency if stored */
    notionalOverride?: number;
    currencyOverride?: "INR" | "USD";
  };
  const [tradePopup, setTradePopup] = useState<TradePopupState | null>(null);
  const [initialCapital, setInitialCapital] = useState("100000");
  const [displayCurrency, setDisplayCurrency] = useState<"INR" | "USD">("INR");
  /** INR per 1 USD (ECB reference via Frankfurter) — used when switching P&L display ₹ ↔ $ */
  const [inrPerUsd, setInrPerUsd] = useState<number | null>(null);
  const [fxRateDate, setFxRateDate] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPerPage = 10;
  const [activeTab, setActiveTab] = useState<"trades" | "equity" | "returns" | "daily">("trades");
  /** When set, the analysis dialog uses saved run metadata (not the current form). */
  const [resultViewContext, setResultViewContext] = useState<{
    mode: "strategy" | "simple";
    stratLabel: string;
    action: "BUY" | "SELL";
    reportNotional: number;
    displayCurrency: "INR" | "USD";
    historyId: string | null;
    savedAt?: string;
  } | null>(null);
  const [resultPopupOpen, setResultPopupOpen] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const backtestPdfRef = useRef<HTMLDivElement>(null);

  const selectedCustom = customStrategies.find(s => s.id === selectedCustomId) ?? null;
  const selectedOptionsStrat =
    mode === "options"
      ? optionsStrategies.find(s => (s as any).id === selectedOptionsStratId) ?? null
      : null;
  const stratLabel =
    mode === "options"
      ? String((selectedOptionsStrat as any)?.name ?? "Options ORB")
      : (selectedCustom?.name
        ?? STRATEGIES.find(s => s.value === strategy)?.label
        ?? strategy);

  // Load full custom strategy details including entry/exit conditions
  const loadCustomStrategies = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_strategies" as any)
        .select(
          "id,name,description,trading_mode,is_intraday,start_time,end_time,squareoff_time,risk_per_trade_pct,stop_loss_pct,take_profit_pct,entry_conditions,exit_conditions,market_type,paper_strategy_type,symbols,is_active,execution_days,position_config,risk_config,chart_config,updated_at",
        )
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      setCustomStrategies((Array.isArray(data) ? data : []) as unknown as FullCustomStrategy[]);
    } catch {
      // non-fatal
    }
  }, []);

  const loadOptionsStrategies = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("options_strategies" as any)
        .select("id,name,underlying,exchange,trade_direction,expiry_type,entry_conditions,orb_config,exit_rules,risk_config")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!Array.isArray(data)) return;
      // Flatten the JSON sub-columns into a flat shape for easy use in the picker
      const flat = data.map((s: any) => {
        const orb = s.orb_config ?? {};
        const er = s.exit_rules ?? {};
        const ec = s.entry_conditions ?? {};
        const rc = s.risk_config ?? {};
        return {
          id: s.id,
          name: s.name,
          underlying: s.underlying,
          exchange: s.exchange,
          direction: s.trade_direction ?? "neutral",
          expiry_type: s.expiry_type ?? "weekly",
          // exit rules
          stop_loss_pct: er.sl_pct ?? 30,
          take_profit_pct: er.tp_pct ?? 50,
          trailing_stop: er.trailing_enabled ?? true,
          trailing_trigger_pct: er.trail_after_pct ?? 30,
          trailing_stop_pct: er.trail_pct ?? 15,
          time_exit_hhmm: er.time_exit_hhmm ?? "15:15",
          max_reentry_count: er.max_reentry_count ?? 1,
          // orb config
          orb_duration_minutes: orb.orb_duration_mins ?? 15,
          min_range_pct: orb.min_range_pct ?? 0.2,
          max_range_pct: orb.max_range_pct ?? 1.0,
          momentum_bars: orb.momentum_bars ?? 3,
          // entry conditions
          expiry_day_guard: ec.expiry_day_guard ?? true,
          // risk config
          lot_size: rc.lot_size ?? 1,
        };
      });
      setOptionsStrategies(flat as Record<string, unknown>[]);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => { loadCustomStrategies(); }, [loadCustomStrategies]);
  useEffect(() => { void loadOptionsStrategies(); }, [loadOptionsStrategies]);

  // ── Load expiries when an options strategy is selected ─────────────────
  useEffect(() => {
    if (mode !== "options" || !selectedOptionsStratId || !symbol) {
      setOrbExpiries([]);
      setOrbExpiryIso("");
      setOrbOptionRows([]);
      setOrbOptionSymbol("");
      setOrbPickerError(null);
      return;
    }
    const selStrat = optionsStrategies.find(s => (s as any).id === selectedOptionsStratId);
    if (!selStrat) return;
    const underlying = String((selStrat as any).underlying ?? symbol);
    // Exchange for F&O chain fetching (need NFO/BFO, not NSE/BSE)
    const rawExchange = String((selStrat as any).exchange ?? "NFO");
    let cancelled = false;
    (async () => {
      setOrbLoadingExpiries(true);
      setOrbPickerError(null);
      setOrbOptionRows([]);
      setOrbOptionSymbol("");
      try {
        const data = await fetchExpiryDates({
          symbol: underlying,
          exchange: rawExchange,
          instrument: instrumentTypeForUnderlying(underlying),
        });
        if (cancelled) return;
        setOrbExpiries(data.expiries);
        const pick = pickExpiryForStrategyType(data.expiries, String((selStrat as any).expiry_type ?? "weekly") as "weekly" | "monthly");
        setOrbExpiryIso(pick?.date ?? data.expiries[0]?.date ?? "");
      } catch (e) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : String(e);
          setOrbPickerError(friendlyBrokerMarketDataError(raw));
        }
      } finally {
        if (!cancelled) setOrbLoadingExpiries(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedOptionsStratId, symbol]);

  // ── Load option chain when expiry is chosen ────────────────────────────
  useEffect(() => {
    if (mode !== "options" || !selectedOptionsStratId || !orbExpiryIso || !symbol) {
      setOrbOptionRows([]);
      setOrbOptionSymbol("");
      return;
    }
    const selStrat = optionsStrategies.find(s => (s as any).id === selectedOptionsStratId);
    if (!selStrat) return;
    const underlying = String((selStrat as any).underlying ?? symbol);
    const rawExchange = String((selStrat as any).exchange ?? "NFO");
    let cancelled = false;
    (async () => {
      setOrbLoadingChain(true);
      setOrbPickerError(null);
      try {
        const chain = await fetchOptionChain({
          underlying,
          exchange: rawExchange,
          expiry_date: orbExpiryIso,
        });
        if (cancelled) return;
        const list = tradableRowsFromChain(chain);
        setOrbOptionRows(list);
        setOrbOptionSymbol(prev => (prev && list.some(r => r.symbol === prev) ? prev : (list[0]?.symbol ?? "")));
      } catch (e) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : String(e);
          setOrbPickerError(friendlyBrokerMarketDataError(raw));
        }
      } finally {
        if (!cancelled) setOrbLoadingChain(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedOptionsStratId, orbExpiryIso]);

  useEffect(() => {
    let cancelled = false;
    fetchUsdInr()
      .then(q => {
        if (!cancelled) {
          setInrPerUsd(q.inrPerUsd);
          setFxRateDate(q.rateDate);
        }
      })
      .catch(() => { /* optional: show once */ });
    return () => { cancelled = true; };
  }, []);

  const parseNotionalInput = (s: string) =>
    Math.max(1000, parseFloat(String(s).replace(/,/g, "")) || 0);

  const onDisplayCurrencyChange = useCallback(async (next: "INR" | "USD") => {
    if (next === displayCurrency) return;
    let rate = inrPerUsd;
    if (rate == null) {
      try {
        const q = await fetchUsdInr();
        rate = q.inrPerUsd;
        setInrPerUsd(rate);
        setFxRateDate(q.rateDate);
      } catch {
        toast.error("Could not load USD/INR for conversion. Check your connection.");
        return;
      }
    }
    const n = parseNotionalInput(initialCapital);
    const converted = next === "INR"
      ? Math.round(displayCurrency === "USD" ? n * rate : n)
      : Math.round(displayCurrency === "INR" ? Math.max(1000, n / rate) : n);
    setInitialCapital(String(converted));
    setDisplayCurrency(next);
  }, [displayCurrency, initialCapital, inrPerUsd]);

  const loadHistory = useCallback(async (): Promise<number> => {
    setHistoryLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setHistory([]);
        return 0;
      }
      const { data, error } = await supabase
        .from("backtest_runs" as any).select("*")
        .order("created_at", { ascending: false }).limit(200);
      const list = !error && Array.isArray(data) ? data : [];
      setHistory(list);
      return list.length;
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null);
  const [historyClearing, setHistoryClearing] = useState(false);
  const [clearHistoryDialogOpen, setClearHistoryDialogOpen] = useState(false);
  const [lastBacktestClientMs, setLastBacktestClientMs] = useState<number | null>(null);

  const deleteHistoryRun = useCallback(async (id: string) => {
    setHistoryDeletingId(id);
    try {
      const { error } = await supabase.from("backtest_runs" as any).delete().eq("id", id);
      if (error) throw error;
      setTradePopup(null);
      if (resultViewContext?.historyId === id) {
        setResultViewContext(null);
        setResultPopupOpen(false);
        setResult(null);
      } else {
        setResultViewContext((c) => (c?.historyId === id ? null : c));
      }
      const n = await loadHistory();
      setHistoryPage(p => Math.min(p, Math.max(1, Math.ceil(n / historyPerPage))));
      toast.success("Removed from history");
    } catch {
      toast.error("Could not delete backtest");
    } finally {
      setHistoryDeletingId(null);
    }
  }, [loadHistory, historyPerPage, resultViewContext?.historyId]);

  const clearAllBacktestHistory = useCallback(async () => {
    setHistoryClearing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sign in to manage history");
        return;
      }
      const { error } = await supabase.from("backtest_runs" as any).delete().eq("user_id", user.id);
      if (error) throw error;
      setResultViewContext(null);
      setResultPopupOpen(false);
      setResult(null);
      setTradePopup(null);
      await loadHistory();
      setHistoryPage(1);
      setClearHistoryDialogOpen(false);
      toast.success("All backtest history cleared");
    } catch {
      toast.error("Could not clear history");
    } finally {
      setHistoryClearing(false);
    }
  }, [loadHistory]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const openTradeFromLive = useCallback((t: Trade, d: BacktestResult) => {
    setTradePopup({
      trade: t,
      symbol: d.symbol,
      exchange: d.exchange,
      action: d.action,
      snapshots: d.historicalSnapshots ?? [],
      allTrades: d.trades ?? [],
    });
  }, []);

  const openHistoryBacktest = useCallback((h: Record<string, unknown>) => {
    const restored = backtestResultFromHistoryRow(h);
    if (!restored) {
      toast.error("Could not load this backtest");
      return;
    }
    const p = (h.params ?? {}) as Record<string, unknown>;
    const cap =
      p.initial_capital != null && p.initial_capital !== ""
        ? Math.max(1000, parseFloat(String(p.initial_capital)) || 100000)
        : 100000;
    const cur = p.display_currency === "USD" ? "USD" : "INR";
    const act = String(h.action ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
    const hid = String(h.id ?? "");
    setResultViewContext({
      mode: h.mode === "simple" ? "simple" : "strategy",
      stratLabel: String(h.strategy_label ?? "Backtest"),
      action: act,
      reportNotional: cap,
      displayCurrency: cur,
      historyId: hid.length > 0 ? hid : null,
      savedAt: String(h.created_at ?? ""),
    });
    setResult(normalizeBacktestResult(restored));
    // Restore saved AI filter result if present
    const saved = (h as any).ai_filter_snapshot;
    if (saved && saved.rawMetrics && saved.aiMetrics) {
      setAiFilterResult(saved as AiFilterResponse);
      setResultView("ai");
    } else {
      setAiFilterResult(null);
      setResultView("raw");
    }
    setTradesPage(1);
    setActiveTab("trades");
    setTradePopup(null);
    setResultPopupOpen(true);
  }, []);

  const applyConfigFromHistoryRow = useCallback((h: Record<string, unknown>) => {
    const p = (h.params ?? {}) as Record<string, unknown>;
    setSymbol(String(h.symbol ?? ""));
    setExchange(String(h.exchange ?? "NSE"));
    setAction((String(h.action ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL");
    if (p.stop_loss_pct != null) setSlPct(String(p.stop_loss_pct));
    if (p.take_profit_pct != null) setTpPct(String(p.take_profit_pct));
    if (p.days != null) setDays(String(p.days));
    if (p.display_currency === "INR" || p.display_currency === "USD") {
      setDisplayCurrency(p.display_currency);
    }
    if (p.initial_capital != null && p.initial_capital !== "") {
      setInitialCapital(String(p.initial_capital));
    }
    const csid = p.custom_strategy_id;
    if (csid != null && String(csid).length > 0) {
      setSelectedCustomId(String(csid));
    }
    setResultPopupOpen(false);
    toast.info("Config loaded — click Run Backtesting");
  }, []);

  const openTradeFromHistory = useCallback((t: Trade, row: Record<string, unknown>) => {
    const snaps = Array.isArray(row.historical_snapshots) ? row.historical_snapshots as HistoricalSnapshot[] : [];
    const trades = Array.isArray(row.trades) ? row.trades as Trade[] : [];
    const p = (row.params && typeof row.params === "object" ? row.params : {}) as Record<string, unknown>;
    const capRaw = p.initial_capital;
    const cap = capRaw != null && capRaw !== "" ? Math.max(1000, parseFloat(String(capRaw)) || 0) : undefined;
    const dc = p.display_currency;
    const cur = dc === "INR" || dc === "USD" ? dc : undefined;
    setTradePopup({
      trade: t,
      symbol: String(row.symbol ?? ""),
      exchange: String(row.exchange ?? "NSE"),
      action: String(row.action ?? "BUY"),
      snapshots: snaps,
      allTrades: trades,
      notionalOverride: cap,
      currencyOverride: cur,
    });
  }, []);

  const runVectorBt = useCallback(async () => {
    // For options mode, validate strategy is selected (symbol comes from strategy)
    if (mode === "options") {
      if (!selectedOptionsStratId) { toast.error("Select an options strategy first"); return; }
      if (!symbol) { toast.error("No underlying symbol — re-select your strategy"); return; }
      if (!(parseInt(orbLots, 10) >= 1)) { toast.error("Enter a valid lot size (≥ 1)"); return; }
      if (!orbExpiryIso) { toast.error("Select an expiry date"); return; }
      if (!orbOptionSymbol) { toast.error("Select an options symbol (CE/PE)"); return; }
    }
    const sym = (mode === "options" ? symbol : symbol.trim()).toUpperCase();
    if (!sym) { toast.error("Enter a symbol"); return; }
    setLoading(true);
    setAiFilterResult(null);
    setResultView("raw");
    setResult(null); setTimingReview(null);
    setTradesPage(1); setTradePopup(null); setActiveTab("trades");
    const runStarted = performance.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();

      let backtestBody: Record<string, unknown>;

      if (mode === "options") {
        // ── Options ORB backtest ────────────────────────────────────────────
        backtestBody = {
          symbol: sym,
          exchange: exchange || "NSE",
          strategy: "options_orb",
          days: Math.min(365, Math.max(10, parseInt(days, 10) || 90)),
          options_config: {
            orb_duration_mins: parseInt(orbDurationMins, 10) || 15,
            min_range_pct: parseFloat(orbMinRangePct) || 0.2,
            max_range_pct: parseFloat(orbMaxRangePct) || 1.0,
            momentum_bars: parseInt(orbMomentumBars, 10) || 3,
            trade_direction: orbDirection,
            expiry_type: orbExpiry,
            expiry_day_guard: orbExpiryGuard,
            sl_pct: parseFloat(orbSlPct) || 30,
            tp_pct: parseFloat(orbTpPct) || 50,
            trailing_enabled: orbTrailingEnabled,
            trail_after_pct: parseFloat(orbTrailAfterPct) || 30,
            trail_pct: parseFloat(orbTrailPct) || 15,
            time_exit_hhmm: orbTimeExit || "15:15",
            max_reentry_count: parseInt(orbMaxReentry, 10) || 1,
            lot_size: parseInt(orbLots, 10) || 1,
            options_symbol: orbOptionSymbol,
            expiry_date: orbExpiryIso,
          },
        };
      } else {
        // ── Standard equity/algo backtest ───────────────────────────────────
        const customEntryConditions = selectedCustom?.entry_conditions ?? null;
        const customExitConditions = selectedCustom?.exit_conditions ?? null;
        const hasCustomConds = entryConditionsConfigured(customEntryConditions);
        const runSl = parseFloat(slPct) || 2;
        const runTp = parseFloat(tpPct) || 4;
        const customSnapshot = selectedCustom
          ? mergeSnapshotWithBacktestRun(selectedCustom, sym, exchange, runSl, runTp)
          : null;
        const derivedMaxHold =
          mode === "strategy" && selectedCustom
            ? deriveMaxHoldDaysForStrategy(selectedCustom)
            : null;

        const engineStrategy =
          mode !== "strategy"
            ? "trend_following"
            : selectedCustom
              ? resolveEngineStrategyIdForCustom(selectedCustom.paper_strategy_type)
              : strategy;

        backtestBody = {
          symbol: sym,
          exchange: exchange,
          strategy: engineStrategy,
          action: selectedCustom?.trading_mode === "SHORT" ? "SELL" : action,
          days: Math.min(730, Math.max(30, parseInt(days, 10) || 365)),
          stop_loss_pct: runSl,
          take_profit_pct: runTp,
          entry_conditions: hasCustomConds ? customEntryConditions : null,
          exit_conditions: hasCustomConds ? customExitConditions : null,
          custom_strategy_name: selectedCustom?.name ?? null,
          custom_strategy_id: selectedCustom?.id ?? null,
          custom_strategy_snapshot: customSnapshot,
          execution_days:
            mode === "strategy" && selectedCustom
            && Array.isArray(selectedCustom.execution_days)
            && selectedCustom.execution_days.length > 0
              ? selectedCustom.execution_days
              : null,
        };
        if (derivedMaxHold != null) backtestBody.max_hold_days = derivedMaxHold;
      }
      // (body assembled above; fallthrough to invoke)

      const res = await supabase.functions.invoke("backtest-vectorbt", {
        body: backtestBody,
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      const d = normalizeBacktestResult(res.data as BacktestResult & { error?: string });
      setLastBacktestClientMs(Math.round(performance.now() - runStarted));
      if (res.error || (d as any)?.error) {
        const raw = String((d as any)?.error ?? res.error?.message ?? "Backtest failed");
        toast.error(friendlyBrokerMarketDataError(raw));
        return;
      }
      setResult(d);
      const runLabel = mode === "options"
        ? `ORB Options · ${sym}`
        : mode === "strategy" ? stratLabel : `Simple ${action}`;
      setResultViewContext({
        mode: mode === "options" ? "strategy" : mode,
        stratLabel: runLabel,
        action: mode === "options" ? "BUY" : (selectedCustom?.trading_mode === "SHORT" ? "SELL" : action),
        reportNotional: Math.max(1000, parseFloat(initialCapital) || 100000),
        displayCurrency,
        historyId: null,
        savedAt: undefined,
      });
      setResultPopupOpen(true);

      // Save to history
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("backtest_runs" as any).insert({
            user_id: user.id, symbol: sym, exchange,
            action: mode === "options" ? "BUY" : (selectedCustom?.trading_mode === "SHORT" ? "SELL" : action),
            mode: mode === "options" ? "strategy" : mode,
            strategy_label: runLabel,
            params: {
              ...(mode !== "options" ? {
                stop_loss_pct: parseFloat(slPct) || 2,
                take_profit_pct: parseFloat(tpPct) || 4,
              } : { options_config: backtestBody.options_config }),
              days: parseInt(days, 10) || 365,
              session_start: startTime, session_end: endTime, squareoff_time: squareoff,
              used_custom_conditions: d.usedCustomConditions ?? false,
              display_currency: displayCurrency,
              initial_capital: Math.max(1000, parseFloat(initialCapital) || 100000),
              engine_strategy: mode === "options" ? "options_orb" : (backtestBody.strategy ?? strategy),
              custom_strategy_id: mode !== "options" ? (selectedCustom?.id ?? null) : null,
            },
            summary: {
              totalTrades: d.totalTrades, winRate: d.winRate,
              totalReturn: d.totalReturn, maxDrawdown: d.maxDrawdown,
              profitFactor: d.profitFactor, sharpeRatio: d.sharpeRatio,
              backtestPeriod: d.backtestPeriod, strategyAchieved: d.strategyAchieved,
              bestTrade: d.bestTrade, worstTrade: d.worstTrade,
              avgHoldingDays: d.avgHoldingDays, expectancy: d.expectancy,
              usedCustomConditions: d.usedCustomConditions,
            },
            trades: Array.isArray(d.trades) ? d.trades : [],
            historical_snapshots: Array.isArray(d.historicalSnapshots) ? d.historicalSnapshots : [],
            returns: Array.isArray(d.dailyReturns) ? d.dailyReturns : [],
            result_snapshot: d,
          });
          loadHistory();
        }
      } catch { /* non-fatal */ }

      const modeNote = mode === "options" ? " · options ORB" : (d.usedCustomConditions ? " · custom conditions applied" : "");
      toast.success(`Backtest ready · ${d.totalTrades} trades · WR ${d.winRate}%${modeNote}`);
    } catch (e) {
      setLastBacktestClientMs(Math.round(performance.now() - runStarted));
      const raw = e instanceof Error ? e.message : "Backtest failed";
      toast.error(friendlyBrokerMarketDataError(raw));
    }
    finally { setLoading(false); }
  }, [
    symbol, exchange, strategy, action, slPct, tpPct, days, mode, selectedCustom, stratLabel,
    startTime, endTime, squareoff, loadHistory, displayCurrency, initialCapital,
    orbDurationMins, orbMinRangePct, orbMaxRangePct, orbMomentumBars, orbDirection, orbExpiry,
    orbExpiryGuard, orbSlPct, orbTpPct, orbTrailingEnabled, orbTrailAfterPct, orbTrailPct,
    orbTimeExit, orbMaxReentry,
    // Options ORB — must be listed or run handler sees stale "" and wrongly toasts "Select an expiry date"
    selectedOptionsStratId, orbLots, orbExpiryIso, orbOptionSymbol,
  ]);

  const runAiFilteredComparison = useCallback(async () => {
    if (!result) {
      toast.error("Run Backtesting first");
      return;
    }
    const sym = symbol.trim().toUpperCase() || result.symbol;
    setAiFilterLoading(true);
    setShowFilterAnalysis(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("backtest-ai-filter", {
        body: {
          symbol: sym,
          exchange,
          strategy: result.strategy || (mode === "options" ? "options_orb" : "trend_following"),
          trades: result.trades,
          days: Math.min(730, Math.max(30, parseInt(days, 10) || 365)),
          filterThreshold: 50,
          backtest_mode: mode === "options" ? "options_orb" : "equity",
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const d = res.data as (AiFilterResponse & { error?: string }) | null;
      if (res.error || !d || d.error) {
        toast.error(String(d?.error ?? res.error?.message ?? "AI filter failed"));
        return;
      }
      setAiFilterResult(d);
      setResultView("ai");
      setResultPopupOpen(true);  // open the dialog showing comparison
      const note = typeof d.filterNote === "string" && d.filterNote ? ` ${d.filterNote}` : "";
      toast.success(
        `AI filter ready · ${d.aiMetrics.totalTrades}/${d.rawMetrics.totalTrades} trades kept · WR ${d.aiMetrics.winRate}%${note}`,
        { duration: 10000 },
      );
      // Persist AI filter result into the history row (if it was saved)
      if (resultViewContext?.historyId) {
        try {
          await (supabase.from("backtest_runs" as any) as any)
            .update({ ai_filter_snapshot: d })
            .eq("id", resultViewContext.historyId);
        } catch { /* non-fatal */ }
      }
    } catch {
      toast.error("AI filter failed");
    } finally {
      setAiFilterLoading(false);
    }
  }, [result, symbol, exchange, days, mode, resultViewContext?.historyId]);

  const runTimingReview = useCallback(async () => {
    if (!result) { toast.error("Run backtest first"); return; }
    const sym = symbol.trim().toUpperCase();
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("analyze-trade", {
        body: {
          symbol: sym, exchange, action, quantity: 1,
          product: mode === "strategy" && !selectedCustom && STRATEGIES.find(s => s.value === strategy)?.product === "MIS" ? "MIS" : "CNC",
          timing_review: {
            mode: mode === "options"
              ? "options_orb_backtest"
              : mode === "strategy"
                ? (selectedCustom ? "custom_strategy" : "preset_strategy")
                : "simple_trade",
            strategy_label: mode === "strategy" || mode === "options" ? stratLabel : undefined,
            stop_loss_pct: parseFloat(slPct) || 2,
            take_profit_pct: parseFloat(tpPct) || 4,
            session_start: startTime, session_end: endTime, squareoff_time: squareoff,
            vectorbt: {
              totalTrades: result.totalTrades, winRate: result.winRate,
              totalReturn: result.totalReturn, sharpeRatio: result.sharpeRatio,
              bestTrade: result.bestTrade, worstTrade: result.worstTrade,
              expectancy: result.expectancy, maxWinStreak: result.maxWinStreak,
              maxLossStreak: result.maxLossStreak, exitReasonCounts: result.exitReasonCounts,
              strategyAchieved: result.strategyAchieved,
              usedCustomConditions: result.usedCustomConditions,
            },
          },
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setTimingReview(String((res.data as any)?.analysis ?? "No review returned."));
      toast.info("AI review ready", { duration: 8000 });
    } catch { toast.error("Review failed"); }
    finally { setAiLoading(false); }
  }, [result, symbol, exchange, action, slPct, tpPct, startTime, endTime, squareoff, mode, strategy, stratLabel, selectedCustom]);

  const activeTrades = resultView === "ai" && aiFilterResult
    ? (aiFilterResult.filteredTrades ?? [])
    : (result?.trades ?? []);
  const pagedTrades = activeTrades.slice((tradesPage - 1) * tradesPerPage, tradesPage * tradesPerPage);
  const totalTradePages = Math.max(1, Math.ceil(activeTrades.length / tradesPerPage));

  const reportNotional = Math.max(1000, parseFloat(initialCapital) || 100000);

  const handleExportBacktestPdf = useCallback(async () => {
    const el = backtestPdfRef.current;
    if (!result || !el) {
      toast.error("Nothing to export.");
      return;
    }
    setPdfExporting(true);
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
      addCanvasToPdfPaginated(canvas, pdf, 36);
      const safeSymbol = String(result.symbol ?? "backtest").replace(/[^\w.-]+/g, "_");
      pdf.save(`backtest-report_${safeSymbol}_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF report downloaded.");
    } catch (e) {
      console.error(e);
      toast.error("Could not generate PDF.");
    } finally {
      setPdfExporting(false);
    }
  }, [result]);

  // Summarise what conditions a custom strategy has (visual + raw + time/hybrid)
  const customConditionsSummary = (() => {
    const ecRaw = selectedCustom?.entry_conditions;
    if (!ecRaw || typeof ecRaw !== "object") return null;
    const ec = ecRaw as Record<string, unknown>;
    const st = String(ec.strategySubtype ?? "").toLowerCase();
    if (st === "time_based") return "Time-based entry (wall-clock) — sent to backtest engine";
    if (st === "hybrid") return "Hybrid (time + indicators) — sent to backtest engine";
    const groups = Array.isArray(ec.groups) ? ec.groups as { conditions?: unknown[] }[] : [];
    const nVis = groups.reduce(
      (a, g) => a + (Array.isArray(g?.conditions) ? g.conditions.length : 0),
      0,
    );
    const raw = typeof ec.rawExpression === "string" && ec.rawExpression.trim().length > 0;
    if (ec.mode === "raw" && raw) return "Raw expression entry — sent to backtest engine";
    if (nVis > 0) {
      return `${groups.length} group(s), ${nVis} condition(s) — ${String(ec.groupLogic ?? "AND")} logic`;
    }
    if (raw) return "Raw expression (check builder mode) — sent if expression is non-empty";
    return null;
  })();

  const rv = resultViewContext;
  const rvMode = rv?.mode ?? mode;
  const rvStrat = rv?.stratLabel ?? stratLabel;
  const rvAction = rv?.action ?? action;
  const rvNotional = rv?.reportNotional ?? reportNotional;
  const rvCurrency = rv?.displayCurrency ?? displayCurrency;
  const activeMetrics = resultView === "ai" && aiFilterResult
    ? aiFilterResult.aiMetrics
    : result;
  const strategyTitleForPdf = rvMode === "strategy" ? rvStrat : `Simple ${rvAction}`;

  return (
    <>
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-white flex items-center gap-2">
          <LineChartIcon className="h-4 w-4 text-teal-400" />
          Backtesting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Mode */}
        <div className="flex flex-wrap gap-2">
          {([
            ["strategy", "Strategy"],
            ["simple", "Simple BUY / SELL"],
            ["options", "Options ORB"],
          ] as [typeof mode, string][]).map(([m, label]) => (
            <Button key={m} size="sm" variant={mode === m ? "default" : "outline"}
              className={mode === m
                ? (m === "options" ? "bg-violet-600 hover:bg-violet-500" : "bg-teal-600")
                : "border-zinc-600"}
              onClick={() => {
                setMode(m);
                // When switching to options mode, default exchange to NSE (underlying market)
                // and default days to 90 (reasonable for 5-min intraday data)
                if (m === "options") {
                  if (!exchange || exchange === "NFO") setExchange("NSE");
                  if (!days || parseInt(days, 10) > 180) setDays("90");
                }
              }}>
              {label}
            </Button>
          ))}
        </div>

        {/* Strategy first (Strategy mode) — then symbol; Simple mode uses symbol then direction */}
        {mode === "strategy" ? (
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">
              Strategy <span className="text-zinc-600 font-normal text-[10px]">· choose custom or built-in first</span>
            </Label>
            <Select
              value={selectedCustomId ? `custom:${selectedCustomId}` : `preset:${strategy}`}
              onValueChange={v => {
                if (v.startsWith("custom:")) {
                  const id = v.replace("custom:", "");
                  setSelectedCustomId(id);
                  const cs = customStrategies.find(s => s.id === id);
                  if (!cs) return;
                  const fe = firstSymbolAndExchangeFromStrategy(cs);
                  if (fe) {
                    setSymbol(fe.symbol);
                    setExchange(fe.exchange);
                    setDisplayCurrency(defaultDisplayCurrency(fe.exchange, fe.symbol));
                  }
                  let sl = cs.stop_loss_pct;
                  let tp = cs.take_profit_pct;
                  const xc = cs.exit_conditions;
                  if (xc && typeof xc === "object") {
                    const x = xc as Record<string, unknown>;
                    if (sl == null && typeof x.stopLossPct === "number") sl = x.stopLossPct;
                    if (tp == null && typeof x.takeProfitPct === "number") tp = x.takeProfitPct;
                  }
                  if (sl != null) setSlPct(String(sl));
                  if (tp != null) setTpPct(String(tp));
                } else {
                  setSelectedCustomId("");
                  setStrategy(v.replace("preset:", ""));
                }
              }}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700 max-h-64">
                <div className="px-2 py-1.5 text-[10px] text-zinc-500">Custom strategies</div>
                {customStrategies.length ? customStrategies.map(s => (
                  <SelectItem key={s.id} value={`custom:${s.id}`} className="text-xs">
                    {s.name}{s.is_active === false ? " (INACTIVE)" : ""}
                  </SelectItem>
                )) : <div className="px-2 py-2 text-xs text-zinc-600">No custom strategies yet</div>}
                <div className="px-2 py-1.5 text-[10px] text-zinc-500">Built-in presets</div>
                {STRATEGIES.map(s => <SelectItem key={s.value} value={`preset:${s.value}`} className="text-xs">{s.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Show custom conditions summary */}
            {customConditionsSummary && (
              <p className="text-[10px] text-teal-500 mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
                Custom conditions: {customConditionsSummary}
              </p>
            )}
            {selectedCustom && !customConditionsSummary && (
              <p className="text-[10px] text-zinc-500 mt-1">Custom strategy loaded · no visual conditions (uses preset signals)</p>
            )}
            {selectedCustom?.execution_days && selectedCustom.execution_days.length > 0 && (
              <p className="text-[10px] text-zinc-500 mt-1">
                Execution days: {selectedCustom.execution_days.map(d => EXEC_DAY_LABELS[d] ?? d).join(", ")}
              </p>
            )}
            {selectedCustom && (
              <details className="mt-2 rounded border border-zinc-800 bg-zinc-950/50 text-[11px]">
                <summary className="cursor-pointer px-2.5 py-2 text-zinc-400 hover:text-zinc-200 select-none">
                  Strategy details (included in backtest)
                </summary>
                <div className="px-2.5 pb-2.5 pt-0 space-y-3 border-t border-zinc-800/80">
                  <p className="text-zinc-500 text-[10px] pt-2 leading-relaxed">
                    Choosing a custom strategy fills <span className="text-zinc-400">Symbol</span>, <span className="text-zinc-400">Stop-loss</span>, and <span className="text-zinc-400">Take-profit</span> from what you saved.
                    Anything you change in those fields before <span className="text-zinc-400">Run Backtesting</span> wins for that run.
                  </p>
                  <div className="rounded border border-zinc-800/60 bg-zinc-950/80 p-2 space-y-1.5">
                    <p className="text-[9px] font-medium text-teal-600/90 uppercase tracking-wide">This run uses</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px] text-zinc-500">
                      <dt className="text-zinc-600">Symbol</dt>
                      <dd className="font-mono text-zinc-200">{symbol.trim() || "—"}</dd>
                      <dt className="text-zinc-600">Exchange</dt>
                      <dd className="font-mono text-zinc-200">{exchange}</dd>
                      <dt className="text-zinc-600">Stop-loss %</dt>
                      <dd className="font-mono text-zinc-200">{slPct || "—"}</dd>
                      <dt className="text-zinc-600">Take-profit %</dt>
                      <dd className="font-mono text-zinc-200">{tpPct || "—"}</dd>
                    </dl>
                  </div>
                  <div>
                    <p className="text-[9px] font-medium text-zinc-600 uppercase tracking-wide mb-1">Saved on strategy</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-zinc-500 text-[10px]">
                      <dt className="text-zinc-600">Symbols list</dt>
                      <dd className="font-mono text-zinc-400 break-words">{formatSavedSymbolsList(selectedCustom)}</dd>
                      <dt className="text-zinc-600">Engine preset</dt>
                      <dd className="font-mono text-teal-400/90">{resolveEngineStrategyIdForCustom(selectedCustom.paper_strategy_type)}</dd>
                      <dt className="text-zinc-600">Direction</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.trading_mode ?? "—"}</dd>
                      <dt className="text-zinc-600">Market</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.market_type ?? "—"}</dd>
                      <dt className="text-zinc-600">Session (IST)</dt>
                      <dd className="font-mono text-zinc-300">
                        {selectedCustom.start_time ?? "—"}–{selectedCustom.end_time ?? "—"} · SQ {selectedCustom.squareoff_time ?? "—"}
                      </dd>
                      <dt className="text-zinc-600">Intraday</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.is_intraday ? "Yes" : "No"}</dd>
                      <dt className="text-zinc-600">Risk / trade %</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.risk_per_trade_pct ?? "—"}</dd>
                      <dt className="text-zinc-600">Saved SL / TP %</dt>
                      <dd className="font-mono text-zinc-300">{selectedCustom.stop_loss_pct ?? "—"} / {selectedCustom.take_profit_pct ?? "—"}</dd>
                    </dl>
                  </div>
                </div>
              </details>
            )}
            {/* <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
              Backtesting scans the whole history: a trade opens on any past day where your entry conditions pass (and execution-day filters apply).
              “Setup not active” on the last bar only describes today, not whether the run will find trades in the past.
            </p> */}
          </div>
        ) : null}

        {/* Options ORB — strategy-first picker */}
        {mode === "options" && (() => {
          const selStrat = optionsStrategies.find(x => (x as any).id === selectedOptionsStratId) ?? null;
          return (
          <div className="space-y-3">
            {/* Strategy picker — the primary input */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">Options strategy to backtest</Label>
              {optionsStrategies.length === 0 ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs text-zinc-500">
                  No options strategies yet — create one in <strong className="text-zinc-400">Algo &amp; Options → Options strategies</strong> first.
                </div>
              ) : (
                <Select value={selectedOptionsStratId} onValueChange={id => {
                  setSelectedOptionsStratId(id);
                  const s = optionsStrategies.find(x => (x as any).id === id);
                  if (!s) return;
                  // Auto-fill everything from the saved strategy
                  if (s.underlying) setSymbol(String(s.underlying));
                  if (s.exchange) {
                    const ex = String(s.exchange).toUpperCase();
                    setExchange(ex === "NFO" ? "NSE" : ex === "BFO" ? "BSE" : ex);
                  }
                  setOrbSlPct(String(s.stop_loss_pct ?? 30));
                  setOrbTpPct(String(s.take_profit_pct ?? 50));
                  setOrbTrailingEnabled(Boolean(s.trailing_stop ?? true));
                  setOrbTrailAfterPct(String(s.trailing_trigger_pct ?? 30));
                  setOrbTrailPct(String(s.trailing_stop_pct ?? 15));
                  setOrbDurationMins(String(s.orb_duration_minutes ?? 15));
                  setOrbTimeExit(String(s.time_exit_hhmm ?? "15:15"));
                  setOrbMaxReentry(String(s.max_reentry_count ?? 1));
                  setOrbDirection(String(s.direction ?? "neutral").toLowerCase());
                  setOrbExpiry((s.expiry_type === "monthly" ? "monthly" : "weekly") as "weekly" | "monthly");
                  setOrbExpiryGuard(Boolean(s.expiry_day_guard ?? true));
                  setOrbMinRangePct(String(s.min_range_pct ?? 0.2));
                  setOrbMaxRangePct(String(s.max_range_pct ?? 1.0));
                  setOrbMomentumBars(String(s.momentum_bars ?? 3));
                  setOrbLots(String((s as any).lot_size ?? 1));
                }}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm h-10">
                    <SelectValue placeholder="Pick a strategy…" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    {optionsStrategies.map(s => (
                      <SelectItem key={String((s as any).id)} value={String((s as any).id)} className="text-sm">
                        <span className="font-medium">{String((s as any).name)}</span>
                        <span className="text-zinc-500 ml-2 text-xs">
                          {String((s as any).underlying ?? "")} · SL {String((s as any).stop_loss_pct ?? "—")}% · TP {String((s as any).take_profit_pct ?? "—")}%
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Summary + lot size — shown after a strategy is selected */}
            {selStrat && (
              <div className="rounded-lg border border-violet-800/30 bg-violet-950/20 px-3 py-2.5 space-y-2.5">
                <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">Strategy loaded — ready to run</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
                  <div><span className="text-zinc-600">Underlying</span> <span className="text-zinc-200 font-mono ml-1">{symbol || String((selStrat as any).underlying)}</span></div>
                  <div><span className="text-zinc-600">Direction</span> <span className="text-zinc-200 ml-1 capitalize">{String((selStrat as any).direction ?? orbDirection)}</span></div>
                  <div><span className="text-zinc-600">SL %</span> <span className="text-zinc-200 ml-1">{orbSlPct}%</span></div>
                  <div><span className="text-zinc-600">TP %</span> <span className="text-zinc-200 ml-1">{orbTpPct}%</span></div>
                  <div><span className="text-zinc-600">ORB</span> <span className="text-zinc-200 ml-1">{orbDurationMins}min</span></div>
                  <div><span className="text-zinc-600">Exit</span> <span className="text-zinc-200 ml-1">{orbTimeExit} IST</span></div>
                  <div><span className="text-zinc-600">Expiry guard</span> <span className="text-zinc-200 ml-1">{orbExpiryGuard ? "On" : "Off"}</span></div>
                  <div><span className="text-zinc-600">Trailing</span> <span className="text-zinc-200 ml-1">{orbTrailingEnabled ? `On (>${orbTrailAfterPct}%)` : "Off"}</span></div>
                </div>
                {/* Lot size — required so PnL is in real rupees */}
                <div className="border-t border-violet-800/20 pt-2 flex items-center gap-3">
                  <Label className="text-xs text-zinc-300 shrink-0 font-medium">Number of lots <span className="text-violet-400">*</span></Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={orbLots}
                    onChange={e => setOrbLots(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 h-8 text-sm w-20 font-mono"
                    placeholder="1"
                  />
                  <span className="text-[11px] text-zinc-500">lot(s) per trade — affects PnL in ₹</span>
                </div>

                {/* Expiry picker */}
                <div className="border-t border-violet-800/20 pt-2 space-y-2">
                  <p className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">Pick options contract to backtest</p>
                  {orbPickerError && (
                    <div className="rounded bg-red-950/50 border border-red-800/40 px-2.5 py-1.5 text-[11px] text-red-400">{orbPickerError}</div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Expiry */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-zinc-500">Expiry <span className="text-violet-400">*</span></Label>
                      {orbLoadingExpiries ? (
                        <div className="flex items-center gap-2 h-9 px-2 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-500">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading expiries…
                        </div>
                      ) : (
                        <Select value={orbExpiryIso} onValueChange={v => { setOrbExpiryIso(v); setOrbOptionSymbol(""); }}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 h-9 text-xs">
                            <SelectValue placeholder="Select expiry…" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700">
                            {orbExpiries.map(e => (
                              <SelectItem key={e.date} value={e.date} className="text-xs">
                                {e.display} <span className="text-zinc-500 ml-1">({e.days_to_expiry}d)</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Option symbol */}
                    <div className="space-y-1">
                      <Label className="text-[10px] text-zinc-500">Option symbol (CE/PE) <span className="text-violet-400">*</span></Label>
                      {orbLoadingChain ? (
                        <div className="flex items-center gap-2 h-9 px-2 rounded bg-zinc-800 border border-zinc-700 text-xs text-zinc-500">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading chain…
                        </div>
                      ) : (
                        <Select value={orbOptionSymbol} onValueChange={setOrbOptionSymbol} disabled={!orbExpiryIso || orbOptionRows.length === 0}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 h-9 text-xs">
                            <SelectValue placeholder={orbExpiryIso ? "Select symbol…" : "Pick expiry first"} />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700 max-h-64">
                            {orbOptionRows.map(r => (
                              <SelectItem key={r.symbol} value={r.symbol} className="text-xs font-mono">
                                {r.symbol}
                                {r.strike ? <span className="text-zinc-500 ml-2">{r.strike} {r.side}</span> : null}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  {orbOptionSymbol && (
                    <p className="text-[11px] text-emerald-400">Backtest will simulate ORB signals on <span className="font-mono font-semibold">{orbOptionSymbol}</span></p>
                  )}
                </div>
              </div>
            )}

            {/* Lookback days — compact */}
            <div className="flex items-center gap-3">
              <Label className="text-[10px] text-zinc-500 shrink-0">Lookback</Label>
              <div className="flex gap-1.5">
                {[30, 60, 90, 180, 365].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(String(d))}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                      parseInt(days, 10) === d
                        ? "border-violet-500 bg-violet-500/20 text-violet-300"
                        : "border-zinc-700 text-zinc-500 hover:border-violet-500/40"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced tweaks — collapsed by default */}
            <details className="rounded border border-zinc-800 bg-zinc-950/40 text-[11px]">
              <summary className="cursor-pointer px-3 py-2 text-zinc-500 hover:text-zinc-300 select-none flex items-center gap-1.5">
                <span>Advanced config overrides</span>
                <span className="text-zinc-700 text-[10px]">(optional — strategy values used by default)</span>
              </summary>
              <div className="px-3 pb-3 pt-2 space-y-2.5 border-t border-zinc-800/60">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">ORB window (mins)</Label>
                    <Input value={orbDurationMins} onChange={e => setOrbDurationMins(e.target.value)} className="bg-zinc-800 border-zinc-700 h-7 text-xs" placeholder="15" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Options SL %</Label>
                    <Input value={orbSlPct} onChange={e => setOrbSlPct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-7 text-xs" placeholder="30" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Options TP %</Label>
                    <Input value={orbTpPct} onChange={e => setOrbTpPct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-7 text-xs" placeholder="50" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Min range %</Label>
                    <Input value={orbMinRangePct} onChange={e => setOrbMinRangePct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-7 text-xs" placeholder="0.2" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Max range %</Label>
                    <Input value={orbMaxRangePct} onChange={e => setOrbMaxRangePct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-7 text-xs" placeholder="1.0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Momentum bars</Label>
                    <Input value={orbMomentumBars} onChange={e => setOrbMomentumBars(e.target.value)} className="bg-zinc-800 border-zinc-700 h-7 text-xs" placeholder="3" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Trail after % gain</Label>
                    <Input value={orbTrailAfterPct} onChange={e => setOrbTrailAfterPct(e.target.value)} disabled={!orbTrailingEnabled} className="bg-zinc-800 border-zinc-700 h-7 text-xs disabled:opacity-40" placeholder="30" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Trail by %</Label>
                    <Input value={orbTrailPct} onChange={e => setOrbTrailPct(e.target.value)} disabled={!orbTrailingEnabled} className="bg-zinc-800 border-zinc-700 h-7 text-xs disabled:opacity-40" placeholder="15" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Time exit (IST)</Label>
                    <Input value={orbTimeExit} onChange={e => setOrbTimeExit(e.target.value)} className="bg-zinc-800 border-zinc-700 h-7 text-xs" placeholder="15:15" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Max re-entries</Label>
                    <Input value={orbMaxReentry} onChange={e => setOrbMaxReentry(e.target.value)} className="bg-zinc-800 border-zinc-700 h-7 text-xs" placeholder="1" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 items-center pt-1">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Direction</Label>
                    <Select value={orbDirection} onValueChange={setOrbDirection}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-xs h-7 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="neutral">Neutral (CE+PE)</SelectItem>
                        <SelectItem value="bullish">Bullish (CE only)</SelectItem>
                        <SelectItem value="bearish">Bearish (PE only)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-zinc-500">Expiry type</Label>
                    <Select value={orbExpiry} onValueChange={v => setOrbExpiry(v as "weekly" | "monthly")}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-xs h-7 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <button type="button" onClick={() => setOrbTrailingEnabled(v => !v)}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${orbTrailingEnabled ? "bg-violet-500" : "bg-zinc-700"}`}>
                      <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${orbTrailingEnabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
                    </button>
                    <Label className="text-[10px] text-zinc-400 cursor-pointer" onClick={() => setOrbTrailingEnabled(v => !v)}>Trailing SL</Label>
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <button type="button" onClick={() => setOrbExpiryGuard(v => !v)}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${orbExpiryGuard ? "bg-violet-500" : "bg-zinc-700"}`}>
                      <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${orbExpiryGuard ? "translate-x-3.5" : "translate-x-0.5"}`} />
                    </button>
                    <Label className="text-[10px] text-zinc-400 cursor-pointer" onClick={() => setOrbExpiryGuard(v => !v)}>Skip expiry day</Label>
                  </div>
                </div>
              </div>
            </details>
          </div>
          );
        })()}

        {/* Symbol + Exchange — hidden for options mode (symbol comes from the strategy) */}
        {mode !== "options" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">
              Symbol{selectedCustom ? <span className="text-zinc-600 font-normal text-[10px]"> · this run</span> : null}
            </Label>
            <SymbolSearchInput value={symbol} onChange={setSymbol}
              onSelect={(s, ex) => {
                const u = s.toUpperCase();
                setSymbol(u); setExchange(ex);
                setDisplayCurrency(defaultDisplayCurrency(ex, u));
              }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">Exchange</Label>
            <Select value={exchange} onValueChange={v => { setExchange(v); setDisplayCurrency(defaultDisplayCurrency(v, symbol)); }}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                {EXCHANGES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        )}

        {mode === "simple" ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" className={action === "BUY" ? "bg-emerald-600" : "bg-zinc-800"} onClick={() => setAction("BUY")}>BUY</Button>
            <Button type="button" size="sm" className={action === "SELL" ? "bg-red-600" : "bg-zinc-800"} onClick={() => setAction("SELL")}>SELL</Button>
          </div>
        ) : null}

        {/* Parameters — hidden for options mode (days + config are in the options section above) */}
        {mode !== "options" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">
              Stop-loss %{selectedCustom ? <span className="text-zinc-600 font-normal"> · this run</span> : null}
            </Label>
            <Input value={slPct} onChange={e => setSlPct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">
              Take-profit %{selectedCustom ? <span className="text-zinc-600 font-normal"> · this run</span> : null}
            </Label>
            <Input value={tpPct} onChange={e => setTpPct(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">Days history (30–730)</Label>
            <Input value={days} onChange={e => setDays(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-zinc-500">P&amp;L display currency</Label>
            <Select value={displayCurrency} onValueChange={v => { void onDisplayCurrencyChange(v as "INR" | "USD"); }}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-900 border-zinc-700">
                <SelectItem value="INR">INR (₹)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[10px] text-zinc-500">
              Notional ({displayCurrency === "INR" ? "₹" : "$"}) for % → money P&amp;L · switching ₹/$ converts this amount at live USD/INR
            </Label>
            <Input value={initialCapital} onChange={e => setInitialCapital(e.target.value)} className="bg-zinc-800 border-zinc-700 h-8 text-xs" placeholder="100000" />
            {inrPerUsd != null && (
              <p className="text-[9px] text-zinc-600">
                USD/INR ref ≈ {inrPerUsd.toFixed(2)}
                {fxRateDate ? ` (${fxRateDate})` : ""} · ECB via Frankfurter
              </p>
            )}
          </div>
        </div>
        )}

        {/* Session — hide for options mode */}
        {mode !== "options" && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
          <p className="text-[10px] font-medium text-zinc-400">Session & exit time (for AI timing review)</p>
          <div className="grid grid-cols-3 gap-2">
            {[["Start IST", startTime, setStartTime], ["End IST", endTime, setEndTime], ["Square-off", squareoff, setSquareoff]].map(([lbl, val, set]) => (
              <div key={lbl as string}>
                <Label className="text-[9px] text-zinc-600">{lbl as string}</Label>
                <Input value={val as string} onChange={e => (set as any)(e.target.value)} className="h-7 text-xs bg-zinc-800 border-zinc-700" />
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={runVectorBt}
            disabled={loading || (mode === "options" && (!selectedOptionsStratId || !(parseInt(orbLots, 10) >= 1) || !orbExpiryIso || !orbOptionSymbol))}
            className={mode === "options" ? "bg-violet-600 hover:bg-violet-500 disabled:opacity-40" : "bg-teal-600 hover:bg-teal-500"}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
            {mode === "options"
              ? (!selectedOptionsStratId ? "Select a strategy first"
                  : !(parseInt(orbLots, 10) >= 1) ? "Enter lot size"
                  : !orbExpiryIso ? "Select expiry"
                  : !orbOptionSymbol ? "Select option symbol"
                  : "Run Options Backtest")
              : "Run Backtesting"}
          </Button>
          <Button
            variant="outline"
            onClick={runAiFilteredComparison}
            disabled={!result || aiFilterLoading}
            className="border-emerald-600/50 text-emerald-300"
          >
            {aiFilterLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            {mode === "options" ? "AI-Filtered Options (Gemini)" : "Run AI-Filtered Comparison"}
          </Button>
          <Button variant="outline" onClick={runTimingReview} disabled={!result || aiLoading} className="border-purple-600/50 text-purple-300">
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
            AI Review SL/TP & Timing
          </Button>
          {result && !resultPopupOpen && (
            <Button variant="ghost" onClick={() => setResultPopupOpen(true)} className="text-teal-400 hover:text-teal-300 hover:bg-teal-400/10">
              <Eye className="h-4 w-4 mr-2" /> View Last Result
            </Button>
          )}
        </div>

        {/* ─── Results Popup ────────────────────────────────────────────── */}
        <Dialog open={resultPopupOpen} onOpenChange={setResultPopupOpen}>
          <DialogContent className="flex h-[94vh] max-h-[94vh] w-[98vw] !max-w-[98vw] flex-col gap-0 !overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:h-[90vh] sm:max-h-[90vh] sm:!max-w-[1200px]">
            <div className="shrink-0 border-b border-zinc-800 px-5 py-4 flex items-center justify-between bg-zinc-950/50 backdrop-blur-xl">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-white text-lg flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-teal-500/10 border border-teal-500/20">
                    <BarChart3 className="h-5 w-5 text-teal-400" />
                  </div>
                  Backtest Analysis
                </DialogTitle>
                {result && (
                  <p className="text-zinc-500 text-[10px] sm:text-xs font-mono">
                    {result.symbol} · {result.exchange} · {result.backtestPeriod}
                    {resultViewContext?.historyId && resultViewContext.savedAt ? (
                      <span className="block text-zinc-600 mt-1">
                        Saved run · {new Date(resultViewContext.savedAt).toLocaleString()}
                      </span>
                    ) : null}
                  </p>
                )}
              </DialogHeader>
              <div className="flex items-center gap-3">
                {result?.strategyAchieved && (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wider hidden sm:flex">
                    Setup Active
                  </Badge>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 scrollbar-none hover:scrollbar-thin scrollbar-thumb-zinc-800">
              {result && (
                <div className="space-y-10 pb-10 max-w-6xl mx-auto">
                  {/* Performance Summary Header */}
                  <div className="relative group">
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-zinc-900/40 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800/50">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h2 className="text-teal-400 font-bold text-xl tracking-tight">
                            {rvMode === "strategy" ? rvStrat : `Simple ${rvAction}`}
                          </h2>
                          {result.usedCustomConditions && (
                            <Badge className="bg-teal-500/10 text-teal-300 border-teal-500/30 text-[9px] px-2 py-0">CUSTOM LOGIC</Badge>
                          )}
                        </div>
                        {aiFilterResult && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => setResultView("raw")}
                              className={`px-2 py-1 text-[10px] rounded border ${resultView === "raw" ? "text-teal-300 border-teal-500/40 bg-teal-500/10" : "text-zinc-400 border-zinc-700"}`}
                            >
                              Raw
                            </button>
                            <button
                              type="button"
                              onClick={() => setResultView("ai")}
                              className={`px-2 py-1 text-[10px] rounded border ${resultView === "ai" ? "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" : "text-zinc-400 border-zinc-700"}`}
                            >
                              AI-Filtered
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Net Return</p>
                          <p className={`text-3xl font-black font-mono leading-none ${Number(activeMetrics?.totalReturn ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {Number(activeMetrics?.totalReturn ?? 0) >= 0 ? "+" : ""}{Number(activeMetrics?.totalReturn ?? 0)}%
                          </p>
                        </div>
                        <div className="w-px h-10 bg-zinc-800/50 hidden sm:block" />
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Win Rate</p>
                          <p className={`text-3xl font-black font-mono leading-none ${Number(activeMetrics?.winRate ?? 0) >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                            {Number(activeMetrics?.winRate ?? 0)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AI Filter comparison strip or run button */}
                  {aiFilterResult ? (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-2">
                      {result?.strategy === "options_orb" && (
                        <p className="text-[10px] text-violet-300/90 border-b border-violet-500/20 pb-2 mb-2">
                          Options ORB: Gemini ranks each entry using the <span className="font-semibold">underlying</span> daily bar context (Yahoo),
                          same pipeline as equity AI filter. For live accuracy, use a connected broker via OpenAlgo.
                        </p>
                      )}
                      {/* Summary row — Raw side uses actual result metrics (portfolio compound), AI side uses simple-sum */}
                      {(() => {
                        const rawTotal = result?.totalReturn ?? 0;
                        const rawWR    = result?.winRate ?? 0;
                        const rawCount = result?.totalTrades ?? aiFilterResult.rawMetrics.totalTrades;
                        const aiTotal  = aiFilterResult.aiMetrics.totalReturn;
                        const aiWR     = aiFilterResult.aiMetrics.winRate;
                        const aiCount  = aiFilterResult.aiMetrics.totalTrades;
                        const filteredPct = rawCount > 0 ? Math.max(0, Math.round(((rawCount - aiCount) / rawCount) * 100)) : 0;
                        // Detect when same trade count but return values differ (compound vs simple-sum mismatch)
                        const sameCount = rawCount === aiCount;
                        const returnsDiffer = sameCount && Math.abs(rawTotal - aiTotal) > 0.5;
                        return (
                          <>
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="text-zinc-400 font-semibold uppercase tracking-wide text-[10px]">Comparison</span>
                              {aiFilterResult.usedGemini ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 font-semibold">✦ Gemini AI</span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-700/50 border border-zinc-600/30 text-zinc-400">Indicator fallback</span>
                              )}
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-300 font-medium">Raw:</span>
                                <span className="text-zinc-100">{rawCount} trades</span>
                                <span className="text-zinc-400">·</span>
                                <span className="text-zinc-100">{rawWR}% WR</span>
                                <span className="text-zinc-400">·</span>
                                <span className={rawTotal >= 0 ? "text-emerald-400" : "text-red-400"}>
                                  {rawTotal >= 0 ? "+" : ""}{rawTotal}%
                                </span>
                              </div>
                              <span className="text-zinc-600">→</span>
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-300 font-medium">AI-Filtered:</span>
                                <span className="text-zinc-100">{aiCount} trades</span>
                                <span className="text-zinc-400">·</span>
                                <span className={aiWR >= rawWR ? "text-emerald-300" : "text-amber-300"}>{aiWR}% WR</span>
                                <span className="text-zinc-400">·</span>
                                <span className={aiTotal >= 0 ? "text-emerald-400" : "text-red-400"}>
                                  {aiTotal >= 0 ? "+" : ""}{aiTotal}%
                                </span>
                              </div>
                              <div className="ml-auto flex items-center gap-3">
                                <span className="text-zinc-500 text-[10px]">
                                  {filteredPct}% filtered out
                                  {aiFilterResult.effectiveThreshold != null && aiFilterResult.effectiveThreshold !== aiFilterResult.filterThreshold
                                    ? ` · cutoff ${aiFilterResult.effectiveThreshold}` : ""}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowFilterAnalysis(v => !v)}
                                  className="text-[10px] text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded px-2 py-0.5 hover:bg-emerald-500/10 transition-colors"
                                >
                                  {showFilterAnalysis ? "Hide Analysis ▲" : "Why? Show Analysis ▼"}
                                </button>
                              </div>
                            </div>
                            {/* Explain when same trade count but return numbers differ between views */}
                            {returnsDiffer && (
                              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200/80 flex gap-2 items-start">
                                <span className="text-amber-400 mt-0.5 shrink-0">ℹ</span>
                                <span>
                                  <strong>Why does Net Return differ even though all {rawCount} trades were kept?</strong>{" "}
                                  The Raw view shows the backtest engine's <em>portfolio compound return</em> ({rawTotal >= 0 ? "+" : ""}{rawTotal}%) — each trade reinvests on a running balance, so losses compound.
                                  The AI-Filtered view shows the <em>simple sum</em> of individual trade returns ({aiTotal >= 0 ? "+" : ""}{aiTotal}%) — trades are treated as equal-sized independent bets.
                                  Both use the exact same trades; only the return formula differs.
                                </span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {aiFilterResult.filterNote ? (
                        <p className="text-[11px] text-zinc-500">{aiFilterResult.filterNote}</p>
                      ) : null}

                      {/* Expandable filter analysis */}
                      {showFilterAnalysis && (() => {
                        const kept = aiFilterResult.filteredTrades ?? [];
                        const removed = aiFilterResult.removedTrades ?? [];
                        const TradeCard = ({ t, isKept }: { t: ScoredTrade; isKept: boolean }) => (
                          <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${isKept ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                            {/* Header row */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isKept ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                                {isKept ? "✓ KEPT" : "✕ REMOVED"}
                              </span>
                              <span className="text-[11px] text-zinc-300 font-medium">Trade #{t.tradeNo}</span>
                              <span className="text-[10px] text-zinc-500">{t.entryDate ?? "—"}</span>
                              <span className={`text-[11px] font-mono font-semibold ${Number(t.returnPct ?? 0) > 0 ? "text-emerald-400" : Number(t.returnPct ?? 0) < 0 ? "text-red-400" : "text-zinc-400"}`}>
                                {Number(t.returnPct ?? 0) > 0 ? "+" : ""}{Number(t.returnPct ?? 0).toFixed(2)}% actual result
                              </span>
                              {t.score != null && (
                                <span className="text-[10px] text-zinc-500 ml-auto">Entry score: <span className="text-zinc-300 font-semibold">{t.score}</span>/100</span>
                              )}
                            </div>
                            {/* Signal tags */}
                            {Array.isArray(t.signals) && t.signals.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {t.signals.map((sig, si) => (
                                  <span
                                    key={si}
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${sig.positive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}
                                  >
                                    {sig.positive ? "↑" : "↓"} {sig.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Plain-English reasoning paragraph */}
                            {t.reason && (
                              <p className={`text-[11px] leading-relaxed ${isKept ? "text-emerald-200/70" : "text-red-200/60"}`}>
                                {t.reason}
                              </p>
                            )}
                          </div>
                        );
                        return (
                          <div className="pt-2 space-y-3 border-t border-zinc-800/50 mt-1">
                            {kept.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                                  ✓ Kept — {kept.length} trade{kept.length !== 1 ? "s" : ""} {aiFilterResult.usedGemini ? "selected by Gemini AI" : "had strong entry conditions"}
                                </p>
                                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                  {kept.map((t) => <TradeCard key={t.tradeNo} t={t} isKept={true} />)}
                                </div>
                              </div>
                            )}
                            {removed.length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">
                                  ✕ Removed — {removed.length} trade{removed.length !== 1 ? "s" : ""} {aiFilterResult.usedGemini ? "rejected by Gemini AI" : "filtered out (entry conditions)"}
                                </p>
                                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                  {removed.map((t) => <TradeCard key={t.tradeNo} t={t} isKept={false} />)}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-zinc-300">AI-Filtered Comparison</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Scores each entry purely on EMA / RSI / Volume at entry time (no outcome knowledge). Realistic simulation of what an AI filter would have done before the trade happened.</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-1.5 text-xs"
                        onClick={runAiFilteredComparison}
                        disabled={aiFilterLoading}
                      >
                        {aiFilterLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</> : <><Zap className="h-3 w-3" /> Run AI Filter</>}
                      </Button>
                    </div>
                  )}

                  {/* Warning: all trades have 0% return */}
                  {(() => {
                    const trades = resultView === "ai" && aiFilterResult
                      ? aiFilterResult.filteredTrades
                      : result?.trades ?? [];
                    const allZero = trades.length > 0 && trades.every(t => Number(t.returnPct ?? 0) === 0);
                    const allHold = allZero && trades.every(t => { const r = String(t.exitReason ?? "").toLowerCase(); return r === "hold" || r === "max_hold"; });
                    if (!allZero) return null;
                    return (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/80 flex gap-2 items-start">
                        <span className="text-amber-400 mt-0.5">⚠</span>
                        <span>
                          {allHold
                            ? "All trades exited via max hold period with 0% return. This usually happens when an intraday strategy (ORB, VWAP, Supertrend) is tested on daily OHLCV — the engine fires entry signals but cannot compute intraday TP/SL exits on daily bars. Try a delivery-mode strategy or set a TP/SL that the daily high/low can realistically hit."
                            : "All trades show 0% return. The backtesting engine may not have received valid entry/exit price data for this strategy/instrument combination."
                          }
                        </span>
                      </div>
                    );
                  })()}

                  {/* Key Metrics Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Executed Trades" value={activeMetrics?.totalTrades ?? 0} sub={`${activeMetrics?.wins ?? 0}W / ${activeMetrics?.losses ?? 0}L`} />
                    <StatCard label="Profit Factor" value={activeMetrics?.profitFactor ?? 0} color={Number(activeMetrics?.profitFactor ?? 0) >= 1.5 ? "green" : Number(activeMetrics?.profitFactor ?? 0) >= 1 ? "yellow" : "red"} />
                    <StatCard label="Avg. Return" value={`${Number(activeMetrics?.expectancy ?? 0) >= 0 ? "+" : ""}${Number(activeMetrics?.expectancy ?? 0)}%`} color={Number(activeMetrics?.expectancy ?? 0) >= 0 ? "green" : "red"} />
                    <StatCard label="Max Drawdown" value={`${Number(activeMetrics?.maxDrawdown ?? 0)}%`} color="red" />
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Sharpe Ratio" value={activeMetrics?.sharpeRatio ?? 0} color={Number(activeMetrics?.sharpeRatio ?? 0) >= 1 ? "green" : "default"} />
                    <StatCard label="Avg Hold Time" value={result?.isOptionsBacktest
                      ? formatFractionalHoldAsHM(Number(activeMetrics?.avgHoldingDays ?? 0))
                      : `${Number(activeMetrics?.avgHoldingDays ?? 0)}d`}
                    />
                    <StatCard label="Best Trade" value={`+${Number(activeMetrics?.bestTrade ?? 0)}%`} color="green" />
                    <StatCard label="Worst Trade" value={`${Number(activeMetrics?.worstTrade ?? 0)}%`} color="red" />
                  </div>

                  {/* Analysis Tabs */}
                  <div className="space-y-6">
                    <div className="flex flex-wrap gap-2 bg-zinc-900/20 p-1.5 rounded-xl border border-zinc-900/50">
                      {(["trades", "equity", "returns", "daily"] as const).map(tab => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setActiveTab(tab)}
                          className={`px-5 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                            activeTab === tab
                              ? "bg-teal-500/10 text-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.1)] border border-teal-500/20"
                              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                          }`}
                        >
                          {tab === "trades" ? `Trade Log (${activeTrades.length})` : tab === "equity" ? "Equity Curve" : tab === "returns" ? "Return Distribution" : "Daily Returns"}
                        </button>
                      ))}
                    </div>

                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="pt-2"
                      >
                        {activeTab === "trades" && (
                          <div className="space-y-8">
                            {/* Card View for Recent Trades */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {activeTrades.slice(0, 12).map(t => (
                                <button
                                  key={t.tradeNo}
                                  type="button"
                                  onClick={() => openTradeFromLive(t, result)}
                                  className="text-left rounded-xl border border-zinc-800/60 bg-zinc-900/20 p-4 hover:border-teal-500/30 hover:bg-zinc-900/40 transition-all group relative overflow-hidden"
                                >
                                  <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-40 transition-opacity">
                                    <TrendingUp className="h-12 w-12 text-zinc-700" />
                                  </div>
                                  <div className="flex items-center justify-between mb-4 relative z-10">
                                    <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase tracking-widest">TRD-{t.tradeNo}</span>
                                    <ExitReasonBadge reason={t.exitReason} />
                                  </div>
                                  <div className="flex items-end justify-between relative z-10">
                                    <div className="space-y-1">
                                      <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-tighter">Exit Date</p>
                                      <p className="text-xs text-zinc-300 font-mono">{t.exitDate}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-xl font-black font-mono tracking-tighter ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                                        {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>

                            {/* Full Journal Table */}
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                  <ListFilter className="h-3.5 w-3.5" />
                                  Complete Trade Journal
                                </h3>
                              </div>
                              <div className="rounded-xl border border-zinc-800/80 overflow-hidden bg-black/40">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px] leading-relaxed">
                                    <thead className="bg-zinc-900/80 border-b border-zinc-800">
                                      <tr className="text-zinc-500 uppercase tracking-tighter">
                                        <th className="text-left px-4 py-3 font-bold"># ID</th>
                                        <th className="text-left px-4 py-3 font-bold">Execution Timeline</th>
                                        <th className="text-right px-4 py-3 font-bold">Hold</th>
                                        <th className="text-right px-4 py-3 font-bold">Price Point (In → Out)</th>
                                        <th className="text-right px-4 py-3 font-bold">Performance</th>
                                        <th className="text-center px-4 py-3 font-bold">Exit</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-900/50">
                                      {pagedTrades.map(t => {
                                        const isOptions = result.isOptionsBacktest || (t as any).direction;
                                        return (
                                        <tr key={t.tradeNo}
                                          className={`${isOptions ? "" : "cursor-pointer"} hover:bg-teal-500/[0.03] transition-colors group`}
                                          onClick={() => { if (!isOptions) openTradeFromLive(t, result); }}>
                                          <td className="px-4 py-3.5 text-zinc-600 font-mono font-bold group-hover:text-zinc-400">#{t.tradeNo}</td>
                                          <td className="px-4 py-3.5">
                                            <div className="font-mono text-zinc-400 group-hover:text-zinc-200">
                                              {t.entryDate}
                                              {isOptions && (t as any).entry_hhmm && (
                                                <span className="text-zinc-600 text-[10px] ml-1">{(t as any).entry_hhmm}–{(t as any).exit_hhmm}</span>
                                              )}
                                            </div>
                                          </td>
                                          {isOptions ? (
                                            <td className="px-4 py-3.5 text-center">
                                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${(t as any).direction === "CE" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                                                {(t as any).direction ?? "—"}
                                              </span>
                                            </td>
                                          ) : (
                                            <td className="px-4 py-3.5 text-right text-zinc-500 font-mono group-hover:text-zinc-300">{t.holdingDays ?? "—"}d</td>
                                          )}
                                          <td className="px-4 py-3.5 text-right">
                                            {isOptions ? (
                                              <span className="font-mono text-zinc-500 text-[10px] group-hover:text-zinc-300">
                                                ₹{t.entryPrice?.toLocaleString() ?? "—"} <span className="text-zinc-800 mx-1">→</span> ₹{t.exitPrice?.toLocaleString() ?? "—"}
                                                <span className="text-zinc-700 ml-1.5">
                                                  ({formatFractionalHoldAsHM(Number(t.holdingDays ?? 0))})
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="font-mono text-zinc-500 group-hover:text-zinc-300">
                                                {t.entryPrice?.toLocaleString() ?? "—"} <span className="text-zinc-800 mx-1">→</span> {t.exitPrice?.toLocaleString() ?? "—"}
                                              </span>
                                            )}
                                          </td>
                                          <td className={`px-4 py-3.5 text-right font-mono font-bold ${t.profitable ? "text-emerald-400" : "text-red-400"}`}>
                                            {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                                          </td>
                                          <td className="px-4 py-3.5 text-center"><ExitReasonBadge reason={t.exitReason} /></td>
                                        </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between px-2 pt-2">
                                <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-teal-400 transition-colors"
                                  onClick={() => setTradesPage(p => Math.max(1, p - 1))} disabled={tradesPage <= 1}>
                                  <ChevronLeft className="h-4 w-4 mr-2" /> Previous Era
                                </Button>
                                <div className="flex gap-2">
                                  {[...Array(totalTradePages)].map((_, i) => (
                                    <button
                                      key={i}
                                      onClick={() => setTradesPage(i + 1)}
                                      className={`w-1 h-1 rounded-full transition-all duration-300 ${tradesPage === i + 1 ? "bg-teal-500 w-6" : "bg-zinc-800 hover:bg-zinc-600"}`}
                                    />
                                  ))}
                                </div>
                                <Button size="sm" variant="ghost" className="text-zinc-500 hover:text-teal-400 transition-colors"
                                  onClick={() => setTradesPage(p => Math.min(totalTradePages, p + 1))} disabled={tradesPage >= totalTradePages}>
                                  Next Era <ChevronRight className="h-4 w-4 ml-2" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {activeTab === "equity" && (
                          <div className="max-w-5xl mx-auto py-4">
                            {(resultView === "ai" && aiFilterResult ? aiFilterResult.aiMetrics.equityCurve : result.equityCurve) && (resultView === "ai" && aiFilterResult ? aiFilterResult.aiMetrics.equityCurve : result.equityCurve).length > 0 ? (
                              <EquityCurveChart
                                data={(resultView === "ai" && aiFilterResult ? aiFilterResult.aiMetrics.equityCurve : result.equityCurve) ?? []}
                                initialCapital={rvNotional}
                                displayCurrency={rvCurrency}
                              />
                            ) : (
                              <p className="text-sm text-zinc-500 text-center py-12 border border-dashed border-zinc-800 rounded-xl">
                                Equity curve was not stored for this run (older history). Run a new backtest to save the full chart.
                              </p>
                            )}
                          </div>
                        )}

                        {activeTab === "returns" && (
                          <div className="max-w-5xl mx-auto py-4">
                            <TradeReturnsChart trades={activeTrades} />
                          </div>
                        )}

                        {activeTab === "daily" && (
                          <div className="max-w-5xl mx-auto">
                            <DailyPortfolioReturnsChart data={result.dailyReturns || []} />
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Compliance & Footnote */}
                   <div className="border-t border-zinc-900/50 flex flex-col sm:flex-row justify-between items-center gap-6">
                     <div className="flex items-center gap-6">
                       <div className="space-y-1">
                         <p className="text-[10px] text-zinc-600 uppercase font-bold tracking-[0.2em]">Data Origin</p>
                         <p className="text-xs text-zinc-400 font-mono">{result.exchange}:{result.symbol}</p>
                       </div>
                     </div>
                     <p className="text-[10px] text-zinc-600 italic text-center sm:text-right max-w-sm">
                        Hypothetical performance results have inherent limitations. No representation is being made that any account will achieve profits similar to those shown.
                     </p>
                   </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-900 p-5 bg-zinc-950 flex flex-col gap-3">
              {resultViewContext?.historyId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-teal-700/50 text-teal-300 text-xs"
                    onClick={() => {
                      const row = history.find((it) => String((it as { id?: string }).id) === resultViewContext.historyId);
                      if (row) applyConfigFromHistoryRow(row as Record<string, unknown>);
                    }}
                  >
                    <Zap className="h-3 w-3 mr-1" /> Re-run this config
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-red-900/40 text-zinc-400 hover:text-red-400"
                    disabled={historyDeletingId === resultViewContext.historyId}
                    onClick={() => {
                      if (resultViewContext.historyId) void deleteHistoryRun(resultViewContext.historyId);
                    }}
                  >
                    {historyDeletingId === resultViewContext.historyId ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                    )}
                    Remove from history
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2 text-zinc-600 text-[10px] uppercase font-bold tracking-widest">
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-600/50" />
                  Verified Backtest Service
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <Button variant="outline" size="sm" onClick={() => setResultPopupOpen(false)} className="flex-1 sm:flex-none border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900">
                    Close Analysis
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 sm:flex-none bg-teal-600 hover:bg-teal-500 shadow-lg shadow-teal-500/10"
                    disabled={pdfExporting}
                    onClick={() => void handleExportBacktestPdf()}
                  >
                    {pdfExporting ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-2" />}
                    {pdfExporting ? "Building PDF…" : "Export PDF Report"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {timingReview && (
          <Alert className="bg-purple-950/30 border-purple-800">
            <Brain className="h-4 w-4 text-purple-400" />
            <AlertDescription className="text-zinc-300 text-xs whitespace-pre-wrap">{timingReview}</AlertDescription>
          </Alert>
        )}

        {/* ─── History ───────────────────────────────────────────────────── */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-300 font-medium">Backtest History</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="border-red-900/60 text-red-300 hover:bg-red-950/40"
                disabled={history.length === 0 || historyClearing || historyLoading}
                onClick={() => setClearHistoryDialogOpen(true)}>
                {historyClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span className="ml-1.5">Clear all</span>
              </Button>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200" onClick={() => void loadHistory()} disabled={historyLoading}>
                {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
              </Button>
            </div>
          </div>

          <AlertDialog open={clearHistoryDialogOpen} onOpenChange={setClearHistoryDialogOpen}>
            <AlertDialogContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all backtest history?</AlertDialogTitle>
                <AlertDialogDescription className="text-zinc-400">
                  This permanently deletes every saved backtest run for your account. You cannot undo this.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-zinc-600 bg-zinc-800 text-zinc-200">Cancel</AlertDialogCancel>
                <Button
                  type="button"
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-500"
                  disabled={historyClearing}
                  onClick={() => void clearAllBacktestHistory()}
                >
                  {historyClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete all"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {history.length === 0 ? (
            <p className="text-xs text-zinc-600">
              No backtests saved yet—runs you save show up here with the same trade-level detail we describe on the public platform tour.
            </p>
          ) : (
            <>
              <p className="text-[10px] text-zinc-600">
                Tap a row to open the same full analysis view as after a fresh run (trades, equity, return distribution, daily returns).
              </p>
              <div className="space-y-1.5">
                {history.slice((historyPage - 1) * historyPerPage, historyPage * historyPerPage).map((h) => {
                  const s = (h as { summary?: Record<string, unknown> }).summary ?? {};
                  const ret = Number(s.totalReturn ?? 0);
                  const hId = String((h as { id?: string }).id);
                  const when = String((h as { created_at?: string }).created_at ?? "").slice(0, 16).replace("T", " ");
                  const sym = String((h as { symbol?: string }).symbol ?? "—");
                  const strat = String((h as { strategy_label?: string; mode?: string }).strategy_label ?? (h as { mode?: string }).mode ?? "—");
                  return (
                    <div key={hId} className="flex items-stretch gap-1 rounded-lg border border-zinc-800/80 bg-zinc-950/40 hover:border-teal-500/25 transition-colors">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1"
                        onClick={() => openHistoryBacktest(h as Record<string, unknown>)}
                      >
                        <span className="text-[10px] text-zinc-500 font-mono shrink-0">{when}</span>
                        <span className="text-xs font-mono text-zinc-200 shrink-0">{sym}</span>
                        <span className="text-[11px] text-zinc-400 min-w-0 truncate flex items-center gap-1">
                          {strat}
                          {s.usedCustomConditions ? (
                            <Badge className="bg-teal-900/60 text-teal-300 border-teal-700 text-[9px] px-1 py-0 shrink-0">CC</Badge>
                          ) : null}
                        </span>
                        <span className="text-[11px] text-zinc-500 font-mono ml-auto shrink-0">
                          {String(s.totalTrades ?? "—")} trades · WR {String(s.winRate ?? "—")}%
                          <span className={`ml-2 font-semibold ${ret >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {ret >= 0 ? "+" : ""}
                            {String(s.totalReturn ?? "—")}%
                          </span>
                        </span>
                      </button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-auto px-2 rounded-l-none text-zinc-500 hover:text-red-400 hover:bg-red-950/30 shrink-0"
                        title="Delete this run"
                        disabled={historyDeletingId === hId}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteHistoryRun(hId);
                        }}
                      >
                        {historyDeletingId === hId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200"
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="text-[10px] text-zinc-600">
                  Page {historyPage} / {Math.max(1, Math.ceil(history.length / historyPerPage))}
                </p>
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200"
                  onClick={() => setHistoryPage(p => Math.min(Math.max(1, Math.ceil(history.length / historyPerPage)), p + 1))}
                  disabled={historyPage >= Math.max(1, Math.ceil(history.length / historyPerPage))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </CardContent>

      {/* Trade detail popup — shared between live result and history trades */}
      {tradePopup && (
        <TradeDetailPopup
          trade={tradePopup.trade}
          action={tradePopup.action}
          symbol={tradePopup.symbol}
          exchangeForQuote={tradePopup.exchange}
          snapshots={tradePopup.snapshots}
          allTrades={tradePopup.allTrades}
          open={!!tradePopup}
          onClose={() => setTradePopup(null)}
          initialCapital={tradePopup.notionalOverride ?? Math.max(1000, parseFloat(initialCapital) || 100000)}
          displayCurrency={tradePopup.currencyOverride ?? displayCurrency}
          inrPerUsd={inrPerUsd}
          fxRateDate={fxRateDate}
        />
      )}
    </Card>

    {result && resultPopupOpen && typeof document !== "undefined" && createPortal(
      <div
        ref={backtestPdfRef}
        className="box-border bg-white p-8 text-zinc-900 antialiased"
        style={{ position: "fixed", left: "-14000px", top: 0, width: 760, zIndex: -1, pointerEvents: "none" }}
      >
        <header className="border-b border-zinc-300 pb-4 mb-6">
          <h1 className="text-[22px] font-bold tracking-tight text-zinc-900">Backtest analysis report</h1>
          <p className="mt-1 font-mono text-[10px] text-zinc-600">
            {result.symbol} · {result.exchange} · {result.backtestPeriod}
          </p>
          <p className="mt-1 text-[9px] text-zinc-500">Generated {new Date().toLocaleString()}</p>
        </header>

        <section className="mb-6">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-600">1. Performance summary</h2>
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div>
              <p className="text-lg font-bold text-teal-700">{strategyTitleForPdf}</p>
              {result.usedCustomConditions && (
                <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-teal-600">Custom logic</p>
              )}
            </div>
            <div className="flex gap-8 text-right">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Net return</p>
                <p className={`text-2xl font-black font-mono ${result.totalReturn >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {result.totalReturn >= 0 ? "+" : ""}{result.totalReturn}%
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Win rate</p>
                <p className={`text-2xl font-black font-mono ${result.winRate >= 50 ? "text-emerald-700" : "text-amber-700"}`}>
                  {result.winRate}%
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-600">2. Key metrics</h2>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded border border-zinc-200 p-2">
              <p className="text-[8px] font-bold uppercase text-zinc-500">Executed trades</p>
              <p className="font-mono text-sm font-bold">{result.totalTrades}</p>
              <p className="text-zinc-500">{result.wins}W / {result.losses}L</p>
            </div>
            <div className="rounded border border-zinc-200 p-2">
              <p className="text-[8px] font-bold uppercase text-zinc-500">Profit factor</p>
              <p className="font-mono text-sm font-bold">{result.profitFactor}</p>
            </div>
            <div className="rounded border border-zinc-200 p-2">
              <p className="text-[8px] font-bold uppercase text-zinc-500">Avg. return (expectancy)</p>
              <p className="font-mono text-sm font-bold">
                {result.expectancy >= 0 ? "+" : ""}{result.expectancy}%
              </p>
            </div>
            <div className="rounded border border-zinc-200 p-2">
              <p className="text-[8px] font-bold uppercase text-zinc-500">Max drawdown</p>
              <p className="font-mono text-sm font-bold text-red-700">{result.maxDrawdown}%</p>
            </div>
            <div className="rounded border border-zinc-200 p-2">
              <p className="text-[8px] font-bold uppercase text-zinc-500">Sharpe ratio</p>
              <p className="font-mono text-sm font-bold">{result.sharpeRatio}</p>
            </div>
            <div className="rounded border border-zinc-200 p-2">
              <p className="text-[8px] font-bold uppercase text-zinc-500">Avg hold time</p>
              <p className="font-mono text-sm font-bold">
                {result.isOptionsBacktest
                  ? formatFractionalHoldAsHM(result.avgHoldingDays)
                  : `${result.avgHoldingDays}d`}
              </p>
            </div>
            <div className="rounded border border-zinc-200 p-2">
              <p className="text-[8px] font-bold uppercase text-zinc-500">Best trade</p>
              <p className="font-mono text-sm font-bold text-emerald-700">+{result.bestTrade}%</p>
            </div>
            <div className="rounded border border-zinc-200 p-2">
              <p className="text-[8px] font-bold uppercase text-zinc-500">Worst trade</p>
              <p className="font-mono text-sm font-bold text-red-700">{result.worstTrade}%</p>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-600">3. Complete trade journal</h2>
          <p className="mb-2 text-[9px] text-zinc-500">All {(result.trades ?? []).length} trades (same columns as on-screen journal).</p>
          <div className="overflow-hidden rounded-lg border border-zinc-300">
            <table className="w-full border-collapse text-[8px]">
              <thead>
                <tr className="border-b border-zinc-300 bg-zinc-100 text-left text-zinc-600">
                  <th className="px-2 py-2 font-bold">#</th>
                  <th className="px-2 py-2 font-bold">Entry → exit</th>
                  <th className="px-2 py-2 text-right font-bold">Hold</th>
                  <th className="px-2 py-2 text-right font-bold">Prices in → out</th>
                  <th className="px-2 py-2 text-right font-bold">Return</th>
                  <th className="px-2 py-2 font-bold">Exit</th>
                </tr>
              </thead>
              <tbody>
                {(result.trades ?? []).map(t => (
                  <tr key={t.tradeNo} className="border-t border-zinc-200">
                    <td className="px-2 py-1.5 font-mono font-semibold text-zinc-700">#{t.tradeNo}</td>
                    <td className="px-2 py-1.5 font-mono text-zinc-800">
                      {t.entryDate} → {t.exitDate}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-600">
                      {(t as { direction?: string }).direction
                        ? formatFractionalHoldAsHM(t.holdingDays ?? 0)
                        : `${t.holdingDays ?? "—"}d`}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-zinc-600">
                      {t.entryPrice?.toLocaleString() ?? "—"} → {t.exitPrice?.toLocaleString() ?? "—"}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono font-bold ${t.profitable ? "text-emerald-700" : "text-red-700"}`}>
                      {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                    </td>
                    <td className="px-2 py-1.5 text-zinc-700">{exitReasonPdfLabel(t.exitReason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-white">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400">4. Equity curve</h2>
          {result.equityCurve && result.equityCurve.length > 0 ? (
            <EquityCurveChart
              data={result.equityCurve}
              initialCapital={rvNotional}
              displayCurrency={rvCurrency}
            />
          ) : (
            <p className="text-[10px] text-zinc-500">Equity curve not available for this export.</p>
          )}
        </section>

        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-white">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400">5. Return per trade</h2>
          <TradeReturnsChart trades={result.trades} />
        </section>

        <section className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-white">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-zinc-400">6. Daily returns</h2>
          <DailyPortfolioReturnsChart data={result.dailyReturns || []} />
        </section>

        <footer className="border-t border-zinc-300 pt-4 text-[8px] text-zinc-600">
          <p className="mb-2 font-mono">
            <span className="font-bold uppercase tracking-wide text-zinc-500">Data origin </span>
            {result.exchange}:{result.symbol}
          </p>
          <p className="italic leading-relaxed">
            Hypothetical performance results have inherent limitations. No representation is being made that any account will achieve profits similar to those shown.
          </p>
        </footer>
      </div>,
      document.body,
    )}
    </>
  );
}
