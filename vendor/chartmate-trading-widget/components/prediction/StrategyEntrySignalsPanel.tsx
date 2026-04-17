/**
 * Post-analysis: multi-strategy library entry & exit scan + AI probability / verdict.
 * Scans BOTH BUY (entry) and SELL (exit) simultaneously so users can see all opportunities.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import {
  Loader2,
  Sparkles,
  Target,
  History,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Trash2,
  FlaskConical,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LiveEntryTrackingSection } from "@/components/prediction/LiveEntryTrackingSection";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { tradeTrackingService } from "@/services/tradeTrackingService";
import { isUsdDenominatedSymbol } from "@/lib/tradingview-symbols";
import { PaperTradeSetupDialog } from "@/components/trading/PaperTradeSetupDialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface PostAnalysisContext {
  result?: string;
  actualChangePercent?: number;
  predictedDirection?: string | null;
}

export interface StrategyEntrySignalsPanelProps {
  symbol: string;
  postAnalysis?: PostAnalysisContext | null;
  /** Only show when user has run post-analysis (recommended) */
  requirePostAnalysis?: boolean;
  /** Optional deep-link history id to open full saved scan detail */
  initialHistoryId?: string | null;
}

type SignalRow = {
  strategyId: string;
  strategyLabel: string;
  entryDate: string;
  entryTime?: string;
  entryTimestamp?: number | null;
  side: string;
  priceAtEntry: number;
  probabilityScore: number;
  verdict: string;
  rationale: string;
  entryExitRuleSummary?: string;
  whyThisScore?: string;
  liveViability?: string;
  rejectionDetail?: string;
  confirmationDetail?: string;
  /** Echo of saved custom strategy fields passed through the scanner (session, SL/TP, risk, etc.) */
  customStrategyMeta?: Record<string, unknown> | null;
  scoreSource?: string;
  isLive?: boolean;
  isPredicted?: boolean;
  marketData?: {
    rsi14?: number | null;
    sma20?: number | null;
    high20?: number | null;
    low20?: number | null;
    dataSource?: string;
    indicatorSource?: string;
  } | null;
  /** Server time when this row was scored (same for all signals in one scan). */
  scanEvaluatedAt?: string;
  /** When set (live rows), live badge/countdown uses this instead of entry time + liveWindow (scan latency no longer eats the window). */
  liveUiExpiresAtMs?: number | null;
  ohlcvPipeline?: string;
  indicatorPipeline?: string;
  /** follow_through | adverse_first | mixed | pending | unknown */
  simpleOutcomeLabel?: string;
  simpleOutcomeNote?: string;
  forwardProbeBars?: number;
  forwardMaxFavorablePct?: number | null;
  forwardMaxAdversePct?: number | null;
  conditionAudit?: {
    kind: string;
    overallMatch: boolean;
    lines?: Array<{ ok: boolean; label: string }>;
    snapshot?: Record<string, unknown>;
  } | null;
  /** 7-module score breakdown from the ScoringEngine */
  score_vector?: {
    trend_direction: "UP" | "DOWN" | "NEUTRAL";
    market_strength_score: number;
    trend_alignment_score: number;
    signal_strength_score: number;
    volume_confirmation_score: number;
    volatility_score: number;
    rr_score: number;
    trap_probability: number;
    final_score: number;
    entry_quality: "A" | "B" | "C";
    execute_trade: boolean;
    stop_loss_price: number | null;
    take_profit_price: number | null;
    rr_ratio: number | null;
    adx_value: number | null;
    market_phase: string | null;
  } | null;
};

const HISTORY_LIST_PAGE_SIZE = 25;
const DETAIL_SIGNALS_PAGE_SIZE = 12;
/** Main scanner card grid — paginate so tall cards don’t bury controls */
const MAIN_SIGNALS_PAGE_SIZE = 8;

/** Row is from a user-defined strategy (Algo Guide preset or custom builder), not built-in momentum/trend/mean_reversion ids. */
function isCustomStrategySignalRow(
  row: SignalRow,
  customStrategies: CustomStrategy[],
): boolean {
  if (row.customStrategyMeta && typeof row.customStrategyMeta === "object") {
    return true;
  }
  return customStrategies.some((c) => c.id === row.strategyId);
}

type CustomStrategy = {
  id: string;
  name: string;
  description: string | null;
  trading_mode: string;
  is_intraday: boolean;
  stop_loss_pct: number;
  take_profit_pct: number;
  paper_strategy_type?: string | null;
  entry_conditions?: Record<string, unknown> | null;
  exit_conditions?: Record<string, unknown> | null;
  position_config?: Record<string, unknown> | null;
  risk_config?: Record<string, unknown> | null;
  chart_config?: Record<string, unknown> | null;
  execution_days?: number[] | null;
  market_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  squareoff_time?: string | null;
  risk_per_trade_pct?: number | null;
};

type ExistingScheduleRow = {
  id: string;
  symbol: string;
  timezone: string;
  notify_time: string;
  enabled: boolean;
  schedule_mode: string;
  selected_strategies?: string[];
  selected_custom_strategy_ids?: string[];
  days_of_week?: number[];
  one_off_local_date?: string | null;
  last_digest_on?: string | null;
};

const DAY_LABELS: { bit: number; label: string }[] = [
  { bit: 0, label: "Sun" },
  { bit: 1, label: "Mon" },
  { bit: 2, label: "Tue" },
  { bit: 3, label: "Wed" },
  { bit: 4, label: "Thu" },
  { bit: 5, label: "Fri" },
  { bit: 6, label: "Sat" },
];

const TIMEFRAME_PRESET_DAYS: Record<string, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  "730d": 730,
};

function clampInt(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

/** One bar step every ~this long while the edge function runs (slow enough you rarely sit at the cap for minutes). */
const SCAN_PROGRESS_STEP_MS = 2000;
/** Do not pass this with server still running — then we flush 1% at a time to 100 when the response returns. */
const SCAN_PROGRESS_CAP_WHILE_WAITING = 93;
/** Completing the bar to 100% (1% per tick) after the server responds — ties “full bar” to “analysis done”. */
const SCAN_PROGRESS_FLUSH_STEP_MS = 26;
/** Rotates sub-lines inside each phase (ChatGPT-style “thinking” copy). */
const SCAN_THINKING_ROTATE_MS = 2400;

const SCAN_THINKING_PHASES: { max: number; lines: string[] }[] = [
  {
    max: 22,
    lines: [
      "Connecting to the market data service…",
      "Requesting intraday candles for your lookback window…",
      "Aligning timestamps and session boundaries…",
    ],
  },
  {
    max: 45,
    lines: [
      "Computing RSI, MACD, and volatility context…",
      "Walking each bar with built-in strategy templates…",
      "Checking BUY/SELL rules across selected strategies…",
    ],
  },
  {
    max: 72,
    lines: [
      "Preparing candidate signals for the AI pass…",
      "Gemini is scoring each candidate vs indicators…",
      "Blending model output with the rule engine…",
    ],
  },
  {
    max: SCAN_PROGRESS_CAP_WHILE_WAITING,
    lines: [
      "Resolving verdicts — confirm, mixed, or reject…",
      "Building signal cards with entry time and price…",
      "Preparing rows for your scan history…",
    ],
  },
  {
    max: 99,
    lines: [
      "Sealing this run into your history…",
      "Syncing signal cards to the page…",
      "Final checks before showing results…",
    ],
  },
];

function pickScanThinkingLine(
  progressPercent: number,
  rotateTick: number,
): string {
  const p = Math.min(100, Math.max(0, Math.floor(progressPercent)));
  if (p >= 100) return "Analysis complete — showing your results below…";
  for (const phase of SCAN_THINKING_PHASES) {
    if (p <= phase.max) {
      const lines = phase.lines;
      return lines[rotateTick % lines.length] ?? lines[0];
    }
  }
  return "Working…";
}

function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function verdictUiLabel(verdict: string): string {
  const v = String(verdict || "").toLowerCase();
  if (v === "mixed" || v === "review") return "Mixed signal";
  if (v === "confirm") return "Confirm";
  if (v === "reject") return "Reject";
  return verdict;
}

function isMixedVerdict(v: string): boolean {
  const x = String(v || "").toLowerCase();
  return x === "mixed" || x === "review";
}

function splitIndexedIntoColumns<T>(
  items: T[],
): [
    Array<{ item: T; originalIndex: number }>,
    Array<{ item: T; originalIndex: number }>,
  ] {
  const left: Array<{ item: T; originalIndex: number }> = [];
  const right: Array<{ item: T; originalIndex: number }> = [];
  items.forEach((item, originalIndex) => {
    if (originalIndex % 2 === 0) left.push({ item, originalIndex });
    else right.push({ item, originalIndex });
  });
  return [left, right];
}

function metricBoxValues(row: SignalRow, currSymbol: string): {
  entry: string;
  sl: string;
  target: string;
  rr: string;
} {
  const sv = row.score_vector;
  const entry = Number.isFinite(row.priceAtEntry)
    ? `${currSymbol}${fmtNum(row.priceAtEntry)}`
    : "—";
  const sl =
    sv?.stop_loss_price != null && Number.isFinite(sv.stop_loss_price)
      ? `${currSymbol}${fmtNum(sv.stop_loss_price)}`
      : "—";
  const target =
    sv?.take_profit_price != null && Number.isFinite(sv.take_profit_price)
      ? `${currSymbol}${fmtNum(sv.take_profit_price)}`
      : "—";
  const rr =
    sv?.rr_ratio != null && Number.isFinite(sv.rr_ratio)
      ? `1:${sv.rr_ratio >= 10 ? sv.rr_ratio.toFixed(0) : sv.rr_ratio.toFixed(1)}`
      : "—";
  return { entry, sl, target, rr };
}

function mergeEquivalentSignals(rows: SignalRow[]): SignalRow[] {
  const merged = new Map<string, SignalRow>();
  for (const row of rows) {
    const sv = row.score_vector;
    const key = [
      row.side,
      finalDisplayScore(row),
      row.priceAtEntry,
      sv?.stop_loss_price ?? "n",
      sv?.take_profit_price ?? "n",
      sv?.rr_ratio ?? "n",
      (row.whyThisScore ?? "").trim(),
      (row.rationale ?? "").trim(),
    ].join("|");
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
      continue;
    }
    const names = Array.from(
      new Set(
        `${prev.strategyLabel} + ${row.strategyLabel}`
          .split("+")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    merged.set(key, { ...prev, strategyLabel: names.join(" + ") });
  }
  return Array.from(merged.values());
}

function finalDisplayScore(row: SignalRow): number {
  const v = row.score_vector?.final_score;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return Number(row.probabilityScore) || 0;
}

function displayGrade(row: SignalRow): string {
  const q = row.score_vector?.entry_quality;
  if (q === "A" || q === "B" || q === "C") return q;
  const s = finalDisplayScore(row);
  if (s >= 80) return "A";
  if (s >= 60) return "B";
  return "C";
}

function firstReadableSentence(
  text: string | undefined | null,
  maxLen = 220,
): string {
  if (!text || !String(text).trim()) return "";
  const t = String(text).replace(/\s+/g, " ").trim();
  const parts = t.split(/(?<=[.!?])\s+/);
  const cut = parts[0] ?? t;
  if (cut.length <= maxLen) return cut;
  return `${cut.slice(0, maxLen - 1)}…`;
}

function traderPlainEnglishLine(row: SignalRow): string {
  const raw =
    row.whyThisScore?.trim() ||
    row.confirmationDetail?.trim() ||
    row.rejectionDetail?.trim() ||
    row.rationale?.trim() ||
    "";
  return firstReadableSentence(raw);
}

function verdictStatusShortLabel(verdict: string): string {
  const v = String(verdict || "").toLowerCase();
  if (v === "confirm") return "Confirmed";
  if (v === "reject") return "Rejected";
  if (v === "mixed" || v === "review") return "Mixed";
  return verdictUiLabel(verdict);
}

type ScanSynthesis = {
  strategyCount: number;
  strongestLine: string;
  score: number;
  grade: string;
  statusLabel: string;
  conclusion: string;
  nextStep: string;
  hasConflict: boolean;
};

function buildScanSynthesis(signals: SignalRow[]): ScanSynthesis {
  const strategyCount = new Set(signals.map((s) => s.strategyId)).size;
  const ranked = [...signals].sort((a, b) => {
    const ds = finalDisplayScore(b) - finalDisplayScore(a);
    if (ds !== 0) return ds;
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return 0;
  });
  const best = ranked[0];
  const bestScore = finalDisplayScore(best);
  const buyScores = signals
    .filter((s) => s.side === "BUY")
    .map((s) => finalDisplayScore(s));
  const sellScores = signals
    .filter((s) => s.side === "SELL")
    .map((s) => finalDisplayScore(s));
  const buyHigh = buyScores.length ? Math.max(...buyScores) : 0;
  const sellHigh = sellScores.length ? Math.max(...sellScores) : 0;
  const hasConflict =
    buyScores.length > 0 &&
    sellScores.length > 0 &&
    buyHigh >= 45 &&
    sellHigh >= 45;

  const sideWord =
    String(best.side || "").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const strongestLine = `${best.strategyLabel} — ${sideWord}`;
  const grade = displayGrade(best);
  const statusLabel = verdictStatusShortLabel(best.verdict);
  const sv = best.score_vector;

  let conclusion: string;
  if (sv?.execute_trade && sv.entry_quality === "A") {
    conclusion =
      "High module alignment — size with your playbook and honor stops.";
  } else if (sv?.execute_trade) {
    conclusion =
      "Execution gates passed — conviction is workable if risk matches the weak modules.";
  } else if (best.verdict === "reject" || bestScore < 55) {
    conclusion = "No confirmed high-confidence entry in this scan window.";
  } else if (hasConflict) {
    conclusion =
      "Strategies point different ways — treat as low-conviction until one path clearly wins.";
  } else {
    conclusion =
      "Moderate conviction — the strongest card below still has modules holding it back.";
  }

  let nextStep: string;
  if (sv?.execute_trade && bestScore >= 75) {
    nextStep = "Act from your plan or track the live window on that card.";
  } else {
    nextStep =
      "Set an alert when scan scores cross 75 or wait for cleaner modules.";
  }

  return {
    strategyCount,
    strongestLine,
    score: Math.round(bestScore),
    grade,
    statusLabel,
    conclusion,
    nextStep,
    hasConflict,
  };
}

function entryBarMs(row: SignalRow): number | null {
  if (
    row.entryTimestamp != null &&
    Number.isFinite(Number(row.entryTimestamp))
  ) {
    return Number(row.entryTimestamp);
  }
  if (row.entryTime) {
    const t = new Date(row.entryTime).getTime();
    return Number.isFinite(t) ? t : null;
  }
  const d = Date.parse(`${row.entryDate}T12:00:00.000Z`);
  return Number.isFinite(d) ? d : null;
}

/** Mirrors `intervalLabelToBarMinutes` in strategy-entry-signals (fallback when API omits liveWindowMs). */
function intervalLabelToBarMinutesClient(interval: string): number {
  const s = String(interval).trim().toLowerCase();
  const m = /^(\d+)\s*m$/.exec(s);
  if (m) return Math.max(1, Number(m[1]));
  if (s === "1h" || s === "60m") return 60;
  if (s.endsWith("d") || s === "1d") return 24 * 60;
  return 5;
}

/** Live badge window = one chart bar from scan (server sends ms; else derive from interval). */
function resolveLiveWindowMs(
  serverMs: number | null | undefined,
  interval: string | null | undefined,
): number {
  if (
    typeof serverMs === "number" &&
    Number.isFinite(serverMs) &&
    serverMs >= 60_000
  ) {
    return Math.min(serverMs, 7 * 24 * 60 * 60 * 1000);
  }
  const mins = interval ? intervalLabelToBarMinutesClient(interval) : 5;
  return Math.max(60_000, mins * 60 * 1000);
}

function applyRowLiveWindow(
  row: SignalRow,
  nowMs: number,
  liveWindowMs: number,
): SignalRow {
  const uiExp = row.liveUiExpiresAtMs;
  if (typeof uiExp === "number" && Number.isFinite(uiExp)) {
    return {
      ...row,
      isPredicted: false,
      isLive: row.isLive ? nowMs <= uiExp : false,
    };
  }
  const ts = row.entryTimestamp
    ? Number(row.entryTimestamp)
    : row.entryTime
      ? new Date(row.entryTime).getTime()
      : NaN;
  if (!Number.isFinite(ts)) {
    return { ...row, isPredicted: false };
  }
  const isFuture = ts > nowMs;
  return {
    ...row,
    isPredicted: false,
    isLive: row.isLive ? !isFuture && nowMs - ts <= liveWindowMs : false,
  };
}

/**
 * Cash equities that follow a Mon–Fri calendar (Sat/Sun off in the venue timezone).
 * Does not include Sun–Thu markets (e.g. Tel Aviv); those rely on Yahoo `marketState` only.
 * Keep in sync with `get-market-status` edge function (MON_FRI_CASH_EXCHANGE_HINTS + rules).
 */
const MON_FRI_CASH_EXCHANGE_HINTS = [
  "NSE",
  "BSE",
  "BOM",
  "CNX",
  "INDNSE",
  "INDBOM",
  "NYSE",
  "NMS",
  "NAS",
  "NYQ",
  "PCX",
  "NGM",
  "LSE",
  "LNR",
  "HKEX",
  "HKG",
  "TSE",
  "JPX",
  "ASX",
  "TSX",
  "VAN",
];

function equityUsesMonFriWeekends(row: Record<string, unknown>): boolean {
  const sym = String(row.symbol ?? "").toUpperCase();
  if (sym.endsWith(".NS") || sym.endsWith(".BO")) return true;
  if (
    sym.endsWith(".L") ||
    sym.endsWith(".HK") ||
    sym.endsWith(".T") ||
    sym.endsWith(".AX")
  )
    return true;
  const ex = String(row.exchange ?? "").toUpperCase();
  return MON_FRI_CASH_EXCHANGE_HINTS.some((h) => ex === h || ex.startsWith(h));
}

/** Venue timezone for weekend check; must match exchange hours conventions. */
function equityWeekendCheckTimeZone(
  row: Record<string, unknown>,
): string | null {
  const sym = String(row.symbol ?? "").toUpperCase();
  if (sym.endsWith(".NS") || sym.endsWith(".BO")) return "Asia/Kolkata";
  if (sym.endsWith(".L")) return "Europe/London";
  if (sym.endsWith(".HK")) return "Asia/Hong_Kong";
  if (sym.endsWith(".T")) return "Asia/Tokyo";
  if (sym.endsWith(".AX")) return "Australia/Sydney";
  const tz = row.exchangeTimezoneName;
  return typeof tz === "string" && tz.length > 0 ? tz : null;
}

function isSatOrSunInTimeZone(nowMs: number, timeZone: string): boolean {
  try {
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(new Date(nowMs));
    return wd === "Sat" || wd === "Sun";
  } catch {
    return false;
  }
}

/** True when local weekend for a Mon–Fri cash venue — Live UI should stay off even if a feed mislabels session. */
function isEquityWeekendClosed(
  row: Record<string, unknown>,
  nowMs: number,
): boolean {
  const qt = String(row.quoteType ?? "").toUpperCase();
  if (qt !== "EQUITY" && qt !== "ETF" && qt !== "MUTUALFUND") return false;
  if (!equityUsesMonFriWeekends(row)) return false;
  const tz = equityWeekendCheckTimeZone(row);
  if (!tz) return false;
  return isSatOrSunInTimeZone(nowMs, tz);
}

/** Approximate FX spot weekend: closed Fri ~5pm ET through Sun ~5pm ET (same framing as venue copy). */
function isForexSpotSessionOpen(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return true;
  const mins = hour * 60 + minute;
  if (wd === "Sat") return false;
  if (wd === "Sun") return mins >= 17 * 60;
  if (wd === "Fri") return mins < 17 * 60;
  return true;
}

/**
 * Same rule-set as `computeLiveSignalsAllowed` in `get-market-status` (client uses local clock).
 */
function allowsLiveEntryExitUIComputed(
  row: Record<string, unknown>,
  nowMs: number,
): boolean {
  const ms = String(row.marketState ?? "").toUpperCase();
  if (ms === "LIVE_24_7") return true;
  if (ms === "LIVE_24_5") return isForexSpotSessionOpen(new Date(nowMs));
  const qt = String(row.quoteType ?? "").toUpperCase();
  if (qt === "CRYPTOCURRENCY") return true;
  if (qt === "CURRENCY" || qt === "FOREX")
    return isForexSpotSessionOpen(new Date(nowMs));
  if (isEquityWeekendClosed(row, nowMs)) return false;
  if (ms === "REGULAR" || ms === "PRE" || ms === "POST") return true;
  if (ms === "CLOSED") return false;
  return row.isRegularOpen === true;
}

/**
 * Live badge + countdown only when venue session rules pass locally (clock-aware) and the
 * edge function agrees when it sends `liveSignalsAllowed` — avoids showing Live on stale quotes.
 */
function allowsLiveEntryExitUI(marketStatus: unknown, nowMs: number): boolean {
  if (!marketStatus || typeof marketStatus !== "object") return false;
  const row = marketStatus as Record<string, unknown>;
  const local = allowsLiveEntryExitUIComputed(row, nowMs);
  if (typeof row.liveSignalsAllowed === "boolean") {
    return local && row.liveSignalsAllowed;
  }
  return local;
}

function stripLiveWhenVenueClosed(
  row: SignalRow,
  venueAllowsLive: boolean,
): SignalRow {
  if (venueAllowsLive) return row;
  return { ...row, isLive: false, liveUiExpiresAtMs: null };
}

/** 12-hour times for scanner cards (not minute-truncated — uses full Date when formatting). */
const SCAN_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
};

function LiveOnAirBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/45 bg-gradient-to-r from-teal-950/90 via-cyan-950/80 to-teal-950/90 px-2.5 py-1 shadow-[0_0_14px_rgba(45,212,191,0.22)] ring-1 ring-teal-500/20"
      aria-label="Live signal on latest bar"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-50">
        Live
      </span>
    </span>
  );
}

function fmtNum(n: number, d = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(d);
}

/** Uses saved custom meta (tradingMode, signalSide) so BUY/SELL map to entry vs exit correctly. */
function resolveScannerPointPresentation(row: SignalRow): {
  badgeText: string;
  badgeClass: string;
  detailLine: string;
  timeLabel: string;
  priceLabel: string;
} {
  const meta = row.customStrategyMeta;
  const tm = String(meta?.tradingMode ?? "").toUpperCase();
  const side = String(row.side).toUpperCase();
  const isClock =
    meta?.signalKind === "scheduled_clock_exit" ||
    String(row.strategyLabel).toLowerCase().includes("(time exit)");

  if (isClock) {
    return {
      badgeText: "Exit — scheduled time",
      badgeClass: "bg-amber-500/25 text-amber-200 border border-amber-500/35",
      detailLine:
        tm === "SHORT"
          ? "Cover / flatten short at this bar per your clock exit rule."
          : "Sell / flatten long at this bar per your clock exit rule.",
      timeLabel: "Exit time (bar)",
      priceLabel: "Exit price (bar close)",
    };
  }

  if (tm === "SHORT") {
    if (side === "SELL") {
      return {
        badgeText: "Entry — short",
        badgeClass: "bg-rose-500/20 text-rose-200 border border-rose-500/35",
        detailLine: "Open or add to a short position at this price.",
        timeLabel: "Entry time",
        priceLabel: "Entry price",
      };
    }
    if (side === "BUY") {
      return {
        badgeText: "Exit — cover short",
        badgeClass: "bg-sky-500/20 text-sky-200 border border-sky-500/35",
        detailLine: "Buy to cover / exit a short per your rules.",
        timeLabel: "Exit time",
        priceLabel: "Exit price",
      };
    }
  }

  if (tm === "LONG") {
    if (side === "BUY") {
      return {
        badgeText: "Entry — long",
        badgeClass:
          "bg-emerald-500/20 text-emerald-200 border border-emerald-500/35",
        detailLine: "Open or add to a long position at this price.",
        timeLabel: "Entry time",
        priceLabel: "Entry price",
      };
    }
    if (side === "SELL") {
      return {
        badgeText: "Exit — close long",
        badgeClass: "bg-amber-500/20 text-amber-200 border border-amber-500/35",
        detailLine: "Sell / reduce long exposure at this price.",
        timeLabel: "Exit time",
        priceLabel: "Exit price",
      };
    }
  }

  if (side === "BUY") {
    return {
      badgeText: "BUY at this bar",
      badgeClass:
        "bg-emerald-500/15 text-emerald-300/95 border border-emerald-500/25",
      detailLine:
        "Strategy allows both directions — treat as a long entry unless your playbook uses this as another leg.",
      timeLabel: "Signal time",
      priceLabel: "Price at bar",
    };
  }
  return {
    badgeText: "SELL at this bar",
    badgeClass: "bg-red-500/15 text-red-300/95 border border-red-500/25",
    detailLine:
      "Strategy allows both directions — may be long exit or short entry depending on how you trade this setup.",
    timeLabel: "Signal time",
    priceLabel: "Price at bar",
  };
}

function savedPlanSlTpLine(
  row: SignalRow,
  meta: Record<string, unknown>,
): string | null {
  const slPct = Number(meta.stopLossPct);
  const tpPct = Number(meta.takeProfitPct);
  const p = row.priceAtEntry;
  if (!Number.isFinite(p) || !Number.isFinite(slPct) || !Number.isFinite(tpPct))
    return null;
  const tm = String(meta.tradingMode ?? "").toUpperCase();
  const side = String(row.side).toUpperCase();
  const isClock = meta.signalKind === "scheduled_clock_exit";
  if (isClock) return null;

  if (tm === "LONG" && side === "BUY") {
    return `Saved plan: stop ≈ ${fmtNum(p * (1 - slPct / 100))} (−${slPct}%) · target ≈ ${fmtNum(p * (1 + tpPct / 100))} (+${tpPct}%) from this entry.`;
  }
  if (tm === "SHORT" && side === "SELL") {
    return `Saved plan: stop ≈ ${fmtNum(p * (1 + slPct / 100))} (+${slPct}%) · target ≈ ${fmtNum(p * (1 - tpPct / 100))} (−${tpPct}%) from this entry.`;
  }
  if (tm === "BOTH" && side === "BUY") {
    return `If trading long from this BUY: stop ≈ ${fmtNum(p * (1 - slPct / 100))} (−${slPct}%) · target ≈ ${fmtNum(p * (1 + tpPct / 100))} (+${tpPct}%).`;
  }
  if (tm === "BOTH" && side === "SELL") {
    return `If trading short from this SELL: stop ≈ ${fmtNum(p * (1 + slPct / 100))} (+${slPct}%) · target ≈ ${fmtNum(p * (1 - tpPct / 100))} (−${tpPct}%).`;
  }
  return null;
}

function CustomStrategySavedPlanBlock({
  meta,
}: {
  meta: Record<string, unknown>;
}) {
  const days = Array.isArray(meta.executionDays)
    ? (meta.executionDays as unknown[]).filter((x) => typeof x === "number")
    : [];
  const dayStr =
    days.length > 0
      ? days
        .map((d) => DAY_LABELS.find((x) => x.bit === d)?.label ?? String(d))
        .join(", ")
      : null;
  const ex =
    meta.exitConditions && typeof meta.exitConditions === "object"
      ? (meta.exitConditions as Record<string, unknown>)
      : null;
  const pos =
    meta.positionConfig && typeof meta.positionConfig === "object"
      ? (meta.positionConfig as Record<string, unknown>)
      : null;
  const risk =
    meta.riskConfig && typeof meta.riskConfig === "object"
      ? (meta.riskConfig as Record<string, unknown>)
      : null;
  const chart =
    meta.chartConfig && typeof meta.chartConfig === "object"
      ? (meta.chartConfig as Record<string, unknown>)
      : null;

  const rows: Array<{ k: string; v: string }> = [];
  if (meta.tradingMode != null)
    rows.push({ k: "Direction", v: String(meta.tradingMode) });
  if (meta.marketType != null)
    rows.push({ k: "Market type", v: String(meta.marketType) });
  if (meta.isIntraday != null)
    rows.push({ k: "Intraday", v: meta.isIntraday ? "Yes" : "No" });
  if (meta.stopLossPct != null)
    rows.push({ k: "Stop loss (saved)", v: `${meta.stopLossPct}%` });
  if (meta.takeProfitPct != null)
    rows.push({ k: "Take profit (saved)", v: `${meta.takeProfitPct}%` });
  if (meta.riskPerTradePct != null)
    rows.push({ k: "Risk / trade (saved)", v: `${meta.riskPerTradePct}%` });
  if (meta.sessionStart != null && meta.sessionEnd != null) {
    rows.push({
      k: "Session window",
      v: `${meta.sessionStart} – ${meta.sessionEnd}`,
    });
  }
  if (meta.squareoffTime != null)
    rows.push({ k: "Square-off", v: String(meta.squareoffTime) });
  if (dayStr) rows.push({ k: "Execution days", v: dayStr });
  if (ex?.clockExitTime)
    rows.push({ k: "Clock exit", v: String(ex.clockExitTime) });
  if (ex?.timeBasedExit === true && typeof ex.exitAfterMinutes === "number") {
    rows.push({ k: "Time-based exit", v: `After ${ex.exitAfterMinutes} min` });
  }
  if (ex?.trailingStop === true) {
    const tpct = ex.trailingStopPct != null ? String(ex.trailingStopPct) : "?";
    rows.push({ k: "Trailing stop", v: `${tpct}%` });
  }
  if (pos?.orderType != null)
    rows.push({ k: "Order type", v: String(pos.orderType) });
  if (pos?.sizingMode != null)
    rows.push({ k: "Sizing", v: String(pos.sizingMode) });
  if (pos?.capitalPct != null)
    rows.push({ k: "Capital %", v: String(pos.capitalPct) });
  if (risk?.maxOpenPositions != null)
    rows.push({ k: "Max open positions", v: String(risk.maxOpenPositions) });
  if (risk?.maxDailyLossPct != null)
    rows.push({ k: "Max daily loss %", v: String(risk.maxDailyLossPct) });
  if (chart?.interval != null)
    rows.push({ k: "Chart interval", v: String(chart.interval) });
  if (chart?.chartType != null)
    rows.push({ k: "Chart type", v: String(chart.chartType) });
  if (meta.description != null && String(meta.description).trim()) {
    const note = String(meta.description);
    rows.push({
      k: "Notes",
      v: note.length > 280 ? `${note.slice(0, 280)}…` : note,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/15 p-3 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-cyan-300/95">
        Saved strategy (this scan)
      </p>
      <p className="text-[11px] text-zinc-500 leading-snug">
        Values below are from your custom strategy record — use them together
        with the signal time and price above.
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        {rows.map((r) => (
          <div
            key={r.k}
            className={`min-w-0 ${r.k === "Notes" ? "col-span-2" : ""}`}
          >
            <dt className="text-zinc-500 font-medium">{r.k}</dt>
            <dd className="text-zinc-200 font-mono break-words">{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SignalAnalysisCard(props: {
  row: SignalRow;
  symbolForExecution: string;
  todayKey: string;
  nowMs: number;
  liveWindowMs: number;
  formatEntry: (row: SignalRow) => string;
  formatEntryWithZone: (row: SignalRow) => string;
  formatMarketData: (row: SignalRow) => string;
  sideLabel: (side: string) => string;
  sideClass: (side: string) => string;
  verdictVariant: (v: string) => "default" | "destructive" | "secondary";
  onStartTradeSession?: (
    row: SignalRow,
    symbolForExecution: string,
  ) => Promise<void>;
  trackingSignalKey?: string | null;
  compactZone?: boolean;
  /** Live custom-strategy row: show one-tap paper trade (strategy + symbol pre-filled). */
  onPaperTrade?: () => void;
  paperTradeEnabled?: boolean;
}) {
  const {
    row,
    symbolForExecution,
    todayKey,
    nowMs,
    liveWindowMs,
    formatEntry,
    formatEntryWithZone,
    formatMarketData,
    sideLabel,
    sideClass,
    verdictVariant,
    onStartTradeSession: _onStartTradeSession,
    trackingSignalKey: _trackingSignalKey,
    compactZone,
    onPaperTrade,
    paperTradeEnabled,
  } = props;
  void _trackingSignalKey;
  void _onStartTradeSession;
  const currSymbol = isUsdDenominatedSymbol(symbolForExecution) ? "$" : "₹";
  const isPast = !row.isLive && row.entryDate !== todayKey;
  const barMs = entryBarMs(row);
  const uiExp =
    typeof row.liveUiExpiresAtMs === "number" &&
      Number.isFinite(row.liveUiExpiresAtMs)
      ? row.liveUiExpiresAtMs
      : null;
  const liveRemainingMs =
    row.isLive && uiExp != null
      ? Math.max(0, uiExp - nowMs)
      : row.isLive && barMs != null
        ? Math.max(0, liveWindowMs - (nowMs - barMs))
        : null;
  const liveElapsedMs =
    row.isLive && liveRemainingMs != null
      ? uiExp != null
        ? Math.max(0, liveWindowMs - liveRemainingMs)
        : barMs != null
          ? Math.max(0, nowMs - barMs)
          : null
      : null;
  const pointUi = row.customStrategyMeta
    ? resolveScannerPointPresentation(row)
    : null;
  const slTpHint =
    row.customStrategyMeta && typeof row.customStrategyMeta === "object"
      ? savedPlanSlTpLine(row, row.customStrategyMeta)
      : null;
  const plainEnglish = traderPlainEnglishLine(row);
  const headerScore = Math.round(finalDisplayScore(row));
  const grade = displayGrade(row);
  const statusShort = verdictStatusShortLabel(row.verdict);
  const metricBoxes = metricBoxValues(row, currSymbol);
  const entrySignalLabel =
    String(row.side || "").toUpperCase() === "SELL"
      ? "SELL ENTRY"
      : "BUY ENTRY";
  const statusIcon =
    row.verdict === "reject"
      ? "⚠"
      : isMixedVerdict(row.verdict)
        ? "⚠"
        : row.verdict === "confirm"
          ? "✓"
          : "·";
  const headerWhen = row.scanEvaluatedAt
    ? new Date(row.scanEvaluatedAt).toLocaleString(
      undefined,
      SCAN_DATETIME_OPTS,
    )
    : formatEntry(row);

  return (
    <div
      className={`self-start rounded-xl border p-4 space-y-3 ${row.verdict === "reject"
          ? "border-red-500/40 bg-red-950/25"
          : row.isLive
            ? "border-teal-500/35 bg-teal-950/20"
            : row.entryDate === todayKey
              ? "border-teal-500/20 bg-black/35"
              : "border-white/10 bg-black/25"
        }`}
    >
      <div className="border-b border-white/10 pb-3 space-y-2">
        <p className="font-mono text-[11px] sm:text-xs text-zinc-300 tracking-tight">
          <span className="text-white/95 font-semibold">
            {(symbolForExecution.trim() || "—").toUpperCase()}
          </span>
          <span className="text-zinc-600 mx-1.5">|</span>
          <span className="text-zinc-400">{headerWhen}</span>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {row.isLive ? <LiveOnAirBadge /> : null}
            {isPast ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Past
              </span>
            ) : null}
            {!row.isLive && row.entryDate === todayKey ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-teal-400/90">
                Today
              </span>
            ) : null}
            {pointUi ? (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider rounded px-2 py-0.5 inline-block ${pointUi.badgeClass}`}
              >
                {pointUi.badgeText}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xl font-bold tabular-nums text-teal-300">
              {headerScore}
            </span>
            <Badge
              variant={verdictVariant(row.verdict)}
              className="text-[10px] font-semibold px-2 py-0.5 h-fit"
            >
              {verdictUiLabel(row.verdict)}
            </Badge>
            {/* Start Tracking temporarily hidden — use Paper Trade button on strategy instead
            {onStartTradeSession ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] border-teal-500/30 text-teal-300 hover:bg-teal-500/10"
                disabled={isStarting}
                onClick={() =>
                  void onStartTradeSession(row, symbolForExecution)
                }
              >
                {isStarting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Start tracking"
                )}
              </Button>
            ) : null}
            */}
          </div>
        </div>
      </div>

      {/* Level 1 — instant view */}
      <div className="space-y-2 pt-0.5">
        <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          {row.strategyLabel}
        </h3>
        <p className={`text-sm font-bold ${sideClass(row.side)}`}>
          ● {entrySignalLabel}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded border border-white/10 bg-zinc-900/50 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">Entry</p>
            <p className="text-sm font-mono text-zinc-100">{metricBoxes.entry}</p>
          </div>
          <div className="rounded border border-red-500/30 bg-red-950/20 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">SL</p>
            <p className="text-sm font-mono text-red-300">{metricBoxes.sl}</p>
          </div>
          <div className="rounded border border-emerald-500/30 bg-emerald-950/20 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">Target</p>
            <p className="text-sm font-mono text-emerald-300">{metricBoxes.target}</p>
          </div>
          <div className="rounded border border-teal-500/30 bg-teal-950/20 px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">RR</p>
            <p className="text-sm font-mono text-teal-300">{metricBoxes.rr}</p>
          </div>
        </div>
        {slTpHint ? (
          <p className="text-[10px] text-cyan-200/90 leading-snug border-l-2 border-cyan-500/40 pl-2">
            {slTpHint}
          </p>
        ) : null}
        <p className="text-[11px] text-zinc-400">
          Score: {headerScore}/100{" "}
          <span className="text-zinc-500">[{grade} Grade]</span>{" "}
          <span className="text-amber-300/90">{statusIcon}</span>{" "}
          <span className="text-zinc-300">{statusShort}</span>
        </p>
      </div>

      {plainEnglish ? (
        <blockquote className="border-l-[3px] border-teal-500/50 pl-3 py-0.5 text-[13px] text-zinc-200/95 leading-relaxed not-italic">
          {plainEnglish}
        </blockquote>
      ) : null}

      {row.score_vector ? (
        <ScorecardPanel sv={row.score_vector} symbol={symbolForExecution} />
      ) : null}

      <details className="rounded-lg border border-zinc-800/80 bg-zinc-950/25 group">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-3 py-2 font-semibold text-zinc-500 hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
          <span className="text-[11px]">Technical details</span>
          <span className="text-zinc-600 transition-transform group-open:rotate-180 inline-block w-4 h-4 min-w-4">
            ▾
          </span>
        </summary>
        <div className="px-3 pb-3 pt-0 space-y-3 border-t border-zinc-800/40">
          {row.isLive && liveElapsedMs != null && liveRemainingMs != null ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="w-full max-w-full text-left rounded-md border border-transparent px-0 py-0.5 hover:border-teal-500/20 hover:bg-teal-500/5 transition-colors"
                >
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    <span className="text-zinc-500">Since signal bar: </span>
                    <span className="font-mono text-teal-200/95 tabular-nums">
                      {formatDurationShort(liveElapsedMs)}
                    </span>
                    <span className="text-zinc-500"> · </span>
                    {liveRemainingMs > 0 ? (
                      <span className="text-teal-300/95">
                        {formatDurationShort(liveRemainingMs)} left of{" "}
                        {formatDurationShort(liveWindowMs)} live window
                      </span>
                    ) : (
                      <span className="text-zinc-500">Live window ended</span>
                    )}
                  </p>
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                className="max-w-[280px] text-xs leading-relaxed"
              >
                {uiExp != null ? (
                  <>
                    This live window is one bar long and starts when the scan
                    finished (so slow scoring doesn&apos;t shrink your time to
                    act). Signal bar time and price are unchanged. Total window:{" "}
                    <span className="font-medium">
                      {formatDurationShort(liveWindowMs)}
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Elapsed = your clock minus the signal bar&apos;s full
                    timestamp. This card&apos;s live window is{" "}
                    <span className="font-medium">
                      {formatDurationShort(liveWindowMs)}
                    </span>{" "}
                    — one bar of the OHLCV interval used for this scan (
                    <code className="text-[10px]">liveWindowMs</code> from the
                    server when available).
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {pointUi ? (
            <p className="text-xs text-zinc-400 leading-snug">
              {pointUi.detailLine}
            </p>
          ) : null}
          <p className={`text-xs font-medium ${sideClass(row.side)}`}>
            {sideLabel(row.side)}
          </p>
          <div className="grid gap-1 text-sm text-zinc-300">
            <p>
              <span className="text-zinc-500 font-medium">
                {pointUi ? `${pointUi.timeLabel}: ` : "When: "}
              </span>
              <span className="font-mono text-zinc-200">
                {compactZone ? formatEntry(row) : formatEntryWithZone(row)}
              </span>
            </p>
            <p>
              <span className="text-zinc-500 font-medium">
                {pointUi ? `${pointUi.priceLabel}: ` : "Price: "}
              </span>
              <span className="font-mono text-white">
                {currSymbol}
                {row.priceAtEntry?.toFixed?.(2) ?? row.priceAtEntry}
              </span>
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              <span className="text-zinc-500 font-medium">Bar context: </span>
              {formatMarketData(row)}
            </p>
            {row.scoreSource ? (
              <p className="text-[11px] text-zinc-600">
                Score mix:{" "}
                <span className="text-zinc-500">{row.scoreSource}</span>
              </p>
            ) : null}
            {row.scanEvaluatedAt ? (
              <p className="text-[11px] text-zinc-500">
                <span className="font-medium text-zinc-600">Scored at: </span>
                {new Date(row.scanEvaluatedAt).toLocaleString(
                  undefined,
                  SCAN_DATETIME_OPTS,
                )}
              </p>
            ) : null}
            {row.ohlcvPipeline || row.indicatorPipeline ? (
              <p className="text-[11px] text-zinc-600 leading-snug">
                <span className="font-medium text-zinc-600">
                  Feeds this row:{" "}
                </span>
                OHLCV{" "}
                <span className="text-zinc-500">
                  {row.ohlcvPipeline ?? "—"}
                </span>
                {" · "}Indicators{" "}
                <span className="text-zinc-500">
                  {row.indicatorPipeline ?? "—"}
                </span>
              </p>
            ) : null}
          </div>

          {row.customStrategyMeta &&
            typeof row.customStrategyMeta === "object" ? (
            <CustomStrategySavedPlanBlock meta={row.customStrategyMeta} />
          ) : null}

          {row.simpleOutcomeLabel &&
            row.simpleOutcomeLabel !== "pending" &&
            row.simpleOutcomeLabel !== "unknown" &&
            row.simpleOutcomeNote ? (
            <div className="rounded-lg border border-zinc-600/40 bg-zinc-900/40 p-3 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                After signal (same chart series)
              </p>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {row.simpleOutcomeNote}
              </p>
              {row.forwardMaxFavorablePct != null &&
                row.forwardMaxAdversePct != null ? (
                <p className="text-[11px] text-zinc-500">
                  Max favorable ≈ {row.forwardMaxFavorablePct}% · Max adverse ≈{" "}
                  {row.forwardMaxAdversePct}% over {row.forwardProbeBars ?? "?"}
                  bars — not a full trade result.
                </p>
              ) : null}
            </div>
          ) : row.simpleOutcomeLabel === "pending" && row.simpleOutcomeNote ? (
            <p className="text-xs text-zinc-500 leading-relaxed">
              {row.simpleOutcomeNote}
            </p>
          ) : null}

          {row.conditionAudit &&
            row.conditionAudit.lines &&
            row.conditionAudit.lines.length > 0 ? (
            <div className="rounded-lg border border-purple-500/30 bg-purple-950/20 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-purple-300">
                Strategy conditions (this bar, engine-checked)
              </p>
              <p className="text-[11px] text-zinc-500">
                Kind:{" "}
                <span className="text-zinc-400 font-mono">
                  {row.conditionAudit?.kind ?? "—"}
                </span>
                {" · "}
                Stack:{" "}
                <span
                  className={
                    row.conditionAudit.overallMatch
                      ? "text-emerald-400 font-semibold"
                      : "text-red-400 font-semibold"
                  }
                >
                  {row.conditionAudit.overallMatch
                    ? "all required checks passed"
                    : "check log below"}
                </span>
              </p>
              <ul className="space-y-1.5 text-sm leading-snug">
                {row.conditionAudit.lines.map((ln, j) => (
                  <li
                    key={j}
                    className={`font-mono text-[13px] pl-2 border-l-2 ${ln.ok
                        ? "border-emerald-500/60 text-emerald-100/95"
                        : "border-red-500/60 text-red-200/90"
                      }`}
                  >
                    {ln.label}
                  </li>
                ))}
              </ul>
              {row.conditionAudit.snapshot &&
                Object.keys(row.conditionAudit.snapshot).length > 0 ? (
                <details className="pt-2 border-t border-white/10">
                  <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300 [&::-webkit-details-marker]:hidden">
                    Show raw data ▾
                  </summary>
                  <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono text-zinc-400">
                    {Object.entries(row.conditionAudit.snapshot).map(
                      ([k, v]) => (
                        <span
                          key={k}
                          className="truncate"
                          title={`${k}: ${String(v)}`}
                        >
                          <span className="text-zinc-600">{k}</span>={String(v)}
                        </span>
                      ),
                    )}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          {row.entryExitRuleSummary ? (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Rule / setup
              </p>
              <p className="text-sm text-zinc-100 leading-relaxed font-medium">
                {row.entryExitRuleSummary}
              </p>
            </div>
          ) : null}

          {row.whyThisScore ? (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Why this score (full)
              </p>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {row.whyThisScore}
              </p>
            </div>
          ) : null}

          {row.isLive && row.liveViability ? (
            <div className="rounded-lg border border-teal-500/25 bg-teal-950/15 p-3 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-teal-400/90">
                Why live could work (or break)
              </p>
              <p className="text-sm text-teal-100/90 leading-relaxed">
                {row.liveViability}
              </p>
            </div>
          ) : null}

          {(row.verdict === "reject" || isMixedVerdict(row.verdict)) &&
            (row.rejectionDetail || row.rationale) ? (
            <div
              className={`rounded-lg border p-3 space-y-1 ${row.verdict === "reject"
                  ? "border-red-500/30 bg-red-950/20"
                  : "border-amber-500/25 bg-amber-950/15"
                }`}
            >
              <p
                className={`text-xs font-bold uppercase tracking-wide ${row.verdict === "reject"
                    ? "text-red-300"
                    : "text-amber-200/90"
                  }`}
              >
                {row.verdict === "reject"
                  ? "Rejected — detail"
                  : "Mixed signal — why not a full confirm"}
              </p>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {row.rejectionDetail || row.rationale}
              </p>
            </div>
          ) : null}

          {row.verdict === "confirm" ? (
            <div className="rounded-lg border border-emerald-500/35 bg-emerald-950/20 p-3 space-y-1">
              {row.confirmationDetail?.trim() || row.whyThisScore ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-wide text-emerald-300">
                    Why confirmed
                  </p>
                  <p className="text-sm text-emerald-50/95 leading-relaxed">
                    {row.confirmationDetail?.trim() || row.whyThisScore}
                  </p>
                </>
              ) : null}
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Gap, liquidity, and headline risk still apply — size positions
                and use stops.
              </p>
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7-MODULE AI SCORECARD PANEL
// ─────────────────────────────────────────────────────────────────────────────

type ScoreVector = NonNullable<SignalRow["score_vector"]>;

const MODULE_ROWS: {
  key: keyof ScoreVector;
  label: string;
  invert?: boolean;
}[] = [
    { key: "market_strength_score", label: "Market Context" },
    { key: "trend_alignment_score", label: "Trend Alignment" },
    { key: "signal_strength_score", label: "Signal Strength" },
    { key: "volume_confirmation_score", label: "Volume & Flow" },
    { key: "volatility_score", label: "Volatility" },
    { key: "rr_score", label: "Risk-Reward" },
    { key: "trap_probability", label: "Trap Risk" },
  ];

function scoreBandBarClass(score0to100: number): string {
  if (score0to100 < 40) return "bg-red-500";
  if (score0to100 < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function trimMarketPhase(phase: string | null): string {
  if (!phase) return "";
  return phase.replace(/_/g, " ");
}

function moduleShortContext(
  key: keyof ScoreVector,
  sv: ScoreVector,
  rawVal: number,
  displayVal: number,
): string {
  const phase = trimMarketPhase(sv.market_phase);
  switch (key) {
    case "market_strength_score":
      if (displayVal < 40) return phase ? `Weak — ${phase}` : "Weak context";
      if (displayVal >= 70)
        return phase ? `Strong — ${phase}` : "Favorable phase";
      return phase || "Neutral context";
    case "trend_alignment_score": {
      const d = sv.trend_direction;
      if (displayVal >= 70)
        return d === "UP"
          ? "Strong uptrend"
          : d === "DOWN"
            ? "Strong downtrend"
            : "Trend supportive";
      if (displayVal < 40)
        return d === "NEUTRAL" ? "Choppy drift" : "Trend mismatch";
      return d === "UP"
        ? "Moderate uptrend"
        : d === "DOWN"
          ? "Moderate downtrend"
          : "Mixed trend";
    }
    case "signal_strength_score":
      if (displayVal >= 70) return "Setup well aligned";
      if (displayVal < 40) return "Weak trigger";
      return "Average signal";
    case "volume_confirmation_score":
      if (displayVal >= 70) return "Participation strong";
      if (displayVal < 40) return "Thin flow";
      return "Average volume";
    case "volatility_score":
      if (displayVal < 40) return "Low ATR — quiet tape";
      if (displayVal >= 70) return "Wide swings";
      return "Normal volatility";
    case "rr_score":
      if (displayVal >= 70) return "RR goal met";
      if (displayVal < 40) return "RR stretched";
      return "Moderate payoff";
    case "trap_probability":
      if (rawVal >= 60) return "Possible liquidity trap";
      if (rawVal < 25) return "No manipulation pattern";
      return "Some wick risk";
    default:
      return "";
  }
}

function qualityColors(q: "A" | "B" | "C"): {
  bg: string;
  border: string;
  text: string;
} {
  if (q === "A")
    return {
      bg: "bg-emerald-500/20",
      border: "border-emerald-500/40",
      text: "text-emerald-300",
    };
  if (q === "B")
    return {
      bg: "bg-amber-500/20",
      border: "border-amber-500/40",
      text: "text-amber-300",
    };
  return {
    bg: "bg-red-500/15",
    border: "border-red-500/35",
    text: "text-red-300",
  };
}

function gateColors(execute: boolean): {
  bg: string;
  border: string;
  text: string;
} {
  return execute
    ? {
      bg: "bg-teal-500/15",
      border: "border-teal-500/35",
      text: "text-teal-200",
    }
    : {
      bg: "bg-zinc-800/60",
      border: "border-zinc-700",
      text: "text-zinc-400",
    };
}

function trendArrow(d: "UP" | "DOWN" | "NEUTRAL"): string {
  return d === "UP" ? "↑" : d === "DOWN" ? "↓" : "→";
}

function reviewSetupReason(sv: ScoreVector): string {
  const blockers: string[] = [];
  if (sv.final_score <= 75)
    blockers.push(
      `final score ${sv.final_score}/100 is below execute threshold (>75)`,
    );
  if (sv.trap_probability >= 70)
    blockers.push(`trap risk ${sv.trap_probability}% is too high`);

  const weakModules: string[] = [];
  if (sv.market_strength_score < 55)
    weakModules.push(`Market ${sv.market_strength_score}`);
  if (sv.trend_alignment_score < 55)
    weakModules.push(`Trend ${sv.trend_alignment_score}`);
  if (sv.signal_strength_score < 55)
    weakModules.push(`Signal ${sv.signal_strength_score}`);
  if (sv.volume_confirmation_score < 50)
    weakModules.push(`Volume ${sv.volume_confirmation_score}`);
  if (sv.volatility_score < 50)
    weakModules.push(`Volatility ${sv.volatility_score}`);
  if (sv.rr_score < 60) weakModules.push(`RR ${sv.rr_score}`);
  if (sv.trap_probability > 40) weakModules.push(`Trap ${sv.trap_probability}`);

  const core =
    blockers.length > 0
      ? blockers.join(" and ")
      : "confirmation filters are not strong enough yet";
  const weak =
    weakModules.length > 0 ? ` Weak modules: ${weakModules.join(", ")}.` : "";
  return `Review before entry: ${core}.${weak}`;
}

function ScanSignalSummaryBanner({
  synthesis,
  symbol,
  titleSuffix = "Today's Signal Summary",
  onSetAlert,
}: {
  synthesis: ScanSynthesis;
  symbol: string;
  titleSuffix?: string;
  onSetAlert?: () => void;
}) {
  const sym = symbol.trim().toUpperCase() || "—";
  return (
    <div className="rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-950/35 via-zinc-950/50 to-black/50 p-4 space-y-2.5 shadow-[0_0_24px_rgba(20,184,166,0.06)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-sm font-semibold text-white tracking-tight">
            {sym}
          </span>
          <span className="text-zinc-600 hidden sm:inline">|</span>
          <span className="text-xs font-medium text-teal-200/95">
            {titleSuffix}
          </span>
        </div>
        {onSetAlert ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-[11px] bg-teal-600 hover:bg-teal-500 text-white shrink-0"
            onClick={onSetAlert}
          >
            Set Alert
          </Button>
        ) : null}
      </div>
      <p className="text-[11px] text-zinc-500">
        {synthesis.strategyCount} strategies analyzed
        {synthesis.hasConflict ? (
          <>
            {" "}
            —{" "}
            <span className="text-amber-300/95">
              conflicting BUY vs&nbsp;SELL
            </span>
          </>
        ) : null}
      </p>
      <p className="text-sm font-semibold text-white leading-snug">
        STRONGEST SIGNAL:{" "}
        <span className="text-teal-300">{synthesis.strongestLine}</span>
      </p>
      <p className="text-[11px] font-mono text-zinc-300">
        Score: {synthesis.score}/100 | Grade: {synthesis.grade} |{" "}
        {synthesis.statusLabel}
      </p>
      <p className="text-sm text-zinc-200 leading-relaxed">
        {synthesis.conclusion}
      </p>
      <p className="text-xs text-teal-200/90 font-medium leading-snug">
        {synthesis.nextStep}
      </p>
    </div>
  );
}

function ScorecardPanel({ sv, symbol }: { sv: ScoreVector; symbol?: string }) {
  const currSymbol = symbol && isUsdDenominatedSymbol(symbol) ? "$" : "₹";
  const [open, setOpen] = useState(false);
  const qc = qualityColors(sv.entry_quality);
  const gc = gateColors(sv.execute_trade);
  const moduleContexts = MODULE_ROWS.map(({ key, label, invert }) => {
    const rawVal = sv[key] as number;
    const displayVal = invert ? 100 - rawVal : rawVal;
    return { label, ctx: moduleShortContext(key, sv, rawVal, displayVal) };
  });

  return (
    <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 overflow-hidden">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            7-module scorecard
          </span>
          {/* Entry quality badge */}
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${qc.bg} ${qc.border} ${qc.text}`}
          >
            Grade {sv.entry_quality}
          </span>
          {/* Execute gate chip */}
          <span
            title={
              sv.execute_trade
                ? "All execution gates passed."
                : sv.entry_quality === "B"
                  ? "Borderline setup: score is not strong enough for auto-execution yet. Review rationale and module scores."
                  : "Rejected setup: quality is too low or risk is too high."
            }
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${gc.bg} ${gc.border} ${gc.text}`}
          >
            {sv.execute_trade
              ? "Ready to Execute"
              : sv.entry_quality === "B"
                ? "Review Setup"
                : "Rejected"}
          </span>
          {/* Trend direction */}
          <span className="text-[11px] text-zinc-400 font-mono">
            {trendArrow(sv.trend_direction)} {sv.trend_direction}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-bold text-zinc-300">
            {sv.final_score}/100
          </span>
          <span
            className={`text-zinc-500 transition-transform w-4 h-4 ${open ? "rotate-180" : ""}`}
            style={{ display: "inline-block" }}
          >
            ▾
          </span>
        </div>
      </button>

      {(sv.stop_loss_price !== null || sv.take_profit_price !== null) && (
        <div className="mx-3 mb-2 rounded border border-zinc-700/50 bg-zinc-800/40 px-3 py-2 grid grid-cols-3 gap-2 text-center">
          {sv.stop_loss_price !== null && (
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">
                Stop Loss
              </p>
              <p className="text-sm font-mono text-red-300">
                {currSymbol}
                {sv.stop_loss_price.toFixed(2)}
              </p>
            </div>
          )}
          {sv.take_profit_price !== null && (
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">
                Target
              </p>
              <p className="text-sm font-mono text-emerald-300">
                {currSymbol}
                {sv.take_profit_price.toFixed(2)}
              </p>
            </div>
          )}
          {sv.rr_ratio !== null && (
            <div>
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">
                RR Ratio
              </p>
              <p className="text-sm font-mono text-teal-300">
                1:{sv.rr_ratio.toFixed(1)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Trap warning — shown inline if probability is high */}
      {sv.trap_probability >= 50 && (
        <div className="mx-3 mb-2 rounded border border-red-500/35 bg-red-950/20 px-3 py-1.5 flex items-start gap-2">
          <span className="text-red-400 text-sm leading-none mt-0.5">⚠</span>
          <p className="text-[11px] text-red-200/90 leading-snug">
            Liquidity trap risk{" "}
            <span className="font-bold">{sv.trap_probability}%</span> — wick
            pattern or fakeout detected. Validate before entry.
          </p>
        </div>
      )}

      {/* Collapsible detail */}
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-zinc-700/50 pt-3">
          {!sv.execute_trade && sv.entry_quality === "B" && (
            <div className="rounded border border-amber-500/35 bg-amber-950/20 px-3 py-1.5 flex items-start gap-2">
              <span className="text-amber-300 text-sm leading-none mt-0.5">
                i
              </span>
              <p className="text-[11px] text-amber-100/90 leading-snug">
                {reviewSetupReason(sv)}
              </p>
            </div>
          )}
          {/* Module progress bars */}
          <div className="space-y-2.5">
            {MODULE_ROWS.map(({ key, label, invert }) => {
              const rawVal = sv[key] as number;
              const displayVal = invert ? 100 - rawVal : rawVal;
              const barPct = Math.min(100, Math.max(0, displayVal));
              const shownNum = invert ? rawVal : rawVal;
              const barTone = scoreBandBarClass(displayVal);
              const ctx = moduleShortContext(key, sv, rawVal, displayVal);
              return (
                <div
                  key={key}
                  className="grid gap-1 sm:grid-cols-[minmax(0,7.5rem)_1.75rem_1fr] sm:gap-x-2 sm:items-center"
                >
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider truncate leading-tight">
                    {label}
                  </p>
                  <span className="text-[11px] font-mono text-zinc-200 tabular-nums sm:text-right">
                    {Math.round(shownNum)}
                  </span>
                  <div className="min-w-0 sm:col-span-1 space-y-0.5">
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barTone}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-snug sm:whitespace-nowrap sm:truncate">
                      {ctx}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ADX + Phase */}
          {(sv.adx_value !== null || sv.market_phase !== null) && (
            <div className="flex flex-wrap gap-2">
              {sv.adx_value !== null && (
                <span className="text-[10px] bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300 font-mono">
                  ADX {sv.adx_value}
                </span>
              )}
              {sv.market_phase !== null && (
                <span className="text-[10px] bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-300">
                  Phase: {sv.market_phase.replace(/_/g, " ")}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function timeInputValueFromDb(t: string | undefined): string {
  if (!t) return "09:30";
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t).trim());
  if (!m) return "09:30";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function dbTimeFromInput(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return "09:30:00";
  return `${m[1].padStart(2, "0")}:${m[2]}:00`;
}

function formatDateKeyInTz(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const da = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${mo}-${da}`;
}

function getTomorrowDateKeyInTz(tz: string): string {
  const now = new Date();
  const today = formatDateKeyInTz(now, tz);
  let t = now.getTime();
  for (let step = 0; step < 72; step++) {
    t += 3600000;
    const k = formatDateKeyInTz(new Date(t), tz);
    if (k !== today) return k;
  }
  return formatDateKeyInTz(new Date(now.getTime() + 36 * 3600000), tz);
}

type HistoryItem = {
  id: string;
  symbol: string;
  scan_started_at: string;
  scan_completed_at: string;
  signal_count: number;
  live_count: number;
  predicted_count: number;
  data_source?: string | null;
  indicator_source?: string | null;
  asset_type?: string | null;
  created_at: string;
};

type HistoryDetail = {
  id: string;
  symbol: string;
  scan_started_at: string;
  scan_completed_at: string;
  signal_count: number;
  live_count: number;
  predicted_count: number;
  data_source?: string | null;
  indicator_source?: string | null;
  interval?: string | null;
  signals: SignalRow[];
};

export function StrategyEntrySignalsPanel({
  symbol,
  postAnalysis,
  requirePostAnalysis = false,
  initialHistoryId = null,
}: StrategyEntrySignalsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["trend_following", "mean_reversion", "momentum"]),
  );
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [marketStatus, setMarketStatus] = useState<any>(null);
  const [scanMeta, setScanMeta] = useState<{
    dataSource?: string;
    indicatorSource?: string;
    assetType?: string;
    lookbackDaysUsed?: number;
    resultWindowDays?: number | null;
    interval?: string;
    liveWindowMs?: number;
    barMinutesApprox?: number;
    dataIsIntraday?: boolean;
    isIntraday?: boolean;
    customSelectionDailyOnly?: boolean;
  } | null>(null);
  const [timeframePreset, setTimeframePreset] = useState<string>("90d");
  const [customWindowDays, setCustomWindowDays] = useState<string>("90");
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>(
    [],
  );
  const [selectedCustom, setSelectedCustom] = useState<Set<string>>(new Set());
  const [nowMs, setNowMs] = useState(Date.now());
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(
    null,
  );
  const [historySignalPage, setHistorySignalPage] = useState(1);
  const [mainResultsPage, setMainResultsPage] = useState(1);
  const [historyDeleteTarget, setHistoryDeleteTarget] =
    useState<HistoryItem | null>(null);
  const [historyDeleting, setHistoryDeleting] = useState(false);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [scanResultsOpen, setScanResultsOpen] = useState(false);
  const [pendingHistoryId, setPendingHistoryId] = useState<string | null>(
    initialHistoryId,
  );
  const [entryAlarmsOpen, setEntryAlarmsOpen] = useState(false);
  const [entryAlarmTargetSymbol, setEntryAlarmTargetSymbol] = useState("");
  const [scheduleTab, setScheduleTab] = useState<"create" | "existing">(
    "create",
  );
  const [existingSchedules, setExistingSchedules] = useState<
    ExistingScheduleRow[]
  >([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(
    null,
  );
  const [scanProgress, setScanProgress] = useState(0);
  /** Cycles ChatGPT-style status lines while the same % band can last many seconds. */
  const [scanThinkingTick, setScanThinkingTick] = useState(0);
  const [trackingSignalKey, setTrackingSignalKey] = useState<string | null>(
    null,
  );
  const [paperDialogOpen, setPaperDialogOpen] = useState(false);
  const [paperPresetId, setPaperPresetId] = useState<string | null>(null);
  const [paperInitialSymbol, setPaperInitialSymbol] = useState<string | null>(
    null,
  );
  const liveCustomToastKeyRef = useRef<string | null>(null);
  const mainSignalsScrollRef = useRef<HTMLDivElement | null>(null);
  const historySignalsScrollRef = useRef<HTMLDivElement | null>(null);
  const scanProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const scanProgressRef = useRef(0);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const resultWindowDays = useMemo(() => {
    if (timeframePreset === "custom") {
      const n = parseInt(String(customWindowDays).trim(), 10);
      return clampInt(Number.isFinite(n) ? n : 90, 1, 730);
    }
    return TIMEFRAME_PRESET_DAYS[timeframePreset] ?? 90;
  }, [timeframePreset, customWindowDays]);

  /** OHLCV fetch depth — engine needs ≥60 daily bars for stable indicators; can be wider than the results window. */
  const fetchDays = useMemo(
    () => Math.min(730, Math.max(60, resultWindowDays)),
    [resultWindowDays],
  );

  const intradayLookbackMinutes = useMemo(
    () => Math.min(7 * 24 * 60, Math.max(60, resultWindowDays * 24 * 60)),
    [resultWindowDays],
  );

  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const activeEntryAlarmSymbol = useMemo(() => {
    const target = entryAlarmTargetSymbol.trim();
    return target || symbol;
  }, [entryAlarmTargetSymbol, symbol]);

  const openEntryAlarmsForSymbol = useCallback(
    (targetSymbol?: string | null) => {
      const nextSymbol = (targetSymbol ?? symbol).trim();
      setEntryAlarmTargetSymbol(nextSymbol);
      setEntryAlarmsOpen(true);
    },
    [symbol],
  );

  const fetchMarketStatus = useCallback(async () => {
    const sym = symbolRef.current?.trim();
    if (!sym) {
      setMarketStatus(null);
      return;
    }
    try {
      const { data } = await supabase.functions.invoke("get-market-status", {
        body: { symbol: sym },
      });
      if (symbolRef.current?.trim() !== sym) return;
      setMarketStatus(data ?? null);
    } catch {
      if (symbolRef.current?.trim() !== sym) return;
      setMarketStatus(null);
    }
  }, []);

  /** Initial fetch, every 3m while mounted, and when the tab wakes — keeps Yahoo session/holiday state fresh. */
  useEffect(() => {
    void fetchMarketStatus();
    const interval = setInterval(() => void fetchMarketStatus(), 3 * 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void fetchMarketStatus();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [symbol, fetchMarketStatus]);

  // Fetch user's custom strategies
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const res = await supabase.functions.invoke("manage-strategy", {
          body: { action: "list" },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.error) throw new Error(res.error.message);
        const data =
          (res.data as { strategies?: CustomStrategy[] } | null)?.strategies ??
          [];
        if (!cancelled) {
          setCustomStrategies(data);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          toast({
            title: "Could not load custom strategies",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Live cards: tick every second while results are open so the live timer stays accurate.
  useEffect(() => {
    const fast = signals.length > 0;
    const id = setInterval(() => setNowMs(Date.now()), fast ? 1000 : 30000);
    return () => clearInterval(id);
  }, [signals.length]);

  useEffect(() => {
    return () => {
      if (scanProgressTimerRef.current != null) {
        clearInterval(scanProgressTimerRef.current);
        scanProgressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(
      () => setScanThinkingTick((t) => t + 1),
      SCAN_THINKING_ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [loading]);

  const fetchHistoryList = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke("strategy-scan-history", {
        body: { action: "list", page, pageSize: HISTORY_LIST_PAGE_SIZE },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as {
        items?: HistoryItem[];
        totalPages?: number;
        page?: number;
        error?: string;
      };
      if (payload?.error) throw new Error(String(payload.error));
      setHistoryItems(Array.isArray(payload?.items) ? payload.items : []);
      setHistoryTotalPages(Math.max(1, Number(payload?.totalPages) || 1));
      setHistoryPage(Math.max(1, Number(payload?.page) || page));
    } catch {
      setHistoryItems([]);
      setHistoryTotalPages(1);
      setHistoryPage(1);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const confirmDeleteHistoryScan = useCallback(async () => {
    if (!historyDeleteTarget) return;
    const delId = historyDeleteTarget.id;
    const delSymbol = historyDeleteTarget.symbol;
    setHistoryDeleting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke("strategy-scan-history", {
        body: { action: "delete", id: delId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const payload = res.data as { error?: string; ok?: boolean };
      if (payload?.error) throw new Error(payload.error);
      if (historyDetail?.id === delId) {
        setHistoryOpen(false);
        setHistoryDetail(null);
      }
      setHistoryDeleteTarget(null);
      toast({
        title: "Scan removed",
        description: `${delSymbol} · snapshot deleted.`,
      });
      setHistoryPage(1);
      await fetchHistoryList(1);
    } catch (e: unknown) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setHistoryDeleting(false);
    }
  }, [historyDeleteTarget, historyDetail, toast, fetchHistoryList]);

  const openHistoryDetail = useCallback(
    async (id: string) => {
      setHistoryDetailLoading(true);
      setHistoryOpen(true);
      setHistorySignalPage(1);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;
        const res = await supabase.functions.invoke("strategy-scan-history", {
          body: { action: "detail", id },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.error) throw new Error(res.error.message);
        const payload = res.data as { item?: HistoryDetail };
        setHistoryDetail(payload?.item ?? null);
      } catch {
        setHistoryDetail(null);
        toast({
          title: "Could not load history details",
          variant: "destructive",
        });
      } finally {
        setHistoryDetailLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (initialHistoryId) setPendingHistoryId(initialHistoryId);
  }, [initialHistoryId]);

  useEffect(() => {
    if (!pendingHistoryId) return;
    void openHistoryDetail(pendingHistoryId);
    setPendingHistoryId(null);
  }, [pendingHistoryId, openHistoryDetail]);

  useEffect(() => {
    fetchHistoryList(1);
  }, [fetchHistoryList]);

  /** When a scheduled digest finishes, `entry_point_alerts` includes `history_id` — refresh Past analyses without reload. */
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`strategy_scan_history_on_digest_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "entry_point_alerts",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const meta = (payload.new as { metadata?: { history_id?: unknown } })
            ?.metadata;
          const hid = meta?.history_id;
          if (typeof hid === "string" && hid.length > 0) {
            void fetchHistoryList(1);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, fetchHistoryList]);

  const marketNote = useMemo(() => {
    if (!marketStatus)
      return "Scans intraday candles (with daily fallback) for both entry & exit points.";
    const qt = (marketStatus?.quoteType ?? "").toString().toUpperCase();
    const venueAllowsLive = allowsLiveEntryExitUI(marketStatus, nowMs);
    if (qt === "CRYPTOCURRENCY") {
      return "Crypto runs 24/7 — Live tags only when the signal bar is still inside the one-bar window.";
    }
    if (qt === "FOREX" || qt === "CURRENCY") {
      return venueAllowsLive
        ? "FX session open (approx. Sun 5pm–Fri 5pm ET) — Live tags apply on the latest bar when scored. Uses FX weekend rules in US Eastern Time, not your browser timezone."
        : "FX weekend / session break — last valid signals shown without Live entry/exit tags until the market reopens (ET-based FX week).";
    }
    if (venueAllowsLive) {
      return "Trading session active (regular, pre-, or after-hours) — Live tags apply when the signal bar is still inside the one-bar window. Open/closed follows the listing exchange clock (e.g. IST for NSE/BSE), not only your device timezone.";
    }
  }, [marketStatus, nowMs]);

  const toggle = (value: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(value)) n.delete(value);
      else n.add(value);
      return n;
    });
  };

  const toggleCustom = (id: string) => {
    setSelectedCustom((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const loadExistingSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const uid = session.user.id;
      const { data, error } = await (supabase as any)
        .from("live_entry_trackers")
        .select(
          "id,symbol,timezone,notify_time,enabled,schedule_mode,selected_strategies,selected_custom_strategy_ids,days_of_week,one_off_local_date,last_digest_on",
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setExistingSchedules((data as ExistingScheduleRow[]) ?? []);
    } catch (e: unknown) {
      toast({
        title: "Could not load schedules",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSchedulesLoading(false);
    }
  }, [toast]);

  const removeExistingSchedule = useCallback(
    async (id: string) => {
      setDeletingScheduleId(id);
      try {
        const { error } = await (supabase as any)
          .from("live_entry_trackers")
          .delete()
          .eq("id", id);
        if (error) throw error;
        setExistingSchedules((prev) => prev.filter((r) => r.id !== id));
        toast({ title: "Schedule removed" });
      } catch (e: unknown) {
        toast({
          title: "Delete failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setDeletingScheduleId(null);
      }
    },
    [toast],
  );

  const applyCurrentStrategySelectionToSchedule = useCallback(
    async (id: string) => {
      try {
        const payload = {
          selected_strategies:
            selected.size > 0
              ? Array.from(selected)
              : ["trend_following", "mean_reversion", "momentum"],
          selected_custom_strategy_ids: Array.from(selectedCustom),
        };
        const { error } = await (supabase as any)
          .from("live_entry_trackers")
          .update(payload)
          .eq("id", id);
        if (error) throw error;
        setExistingSchedules((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...payload } : r)),
        );
        toast({
          title: "Schedule updated",
          description: "Strategy selection saved.",
        });
      } catch (e: unknown) {
        toast({
          title: "Could not update schedule",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [selected, selectedCustom, toast],
  );

  const updateExistingSchedule = useCallback(
    async (
      id: string,
      patch: Partial<{
        notify_time: string;
        schedule_mode: string;
        days_of_week: number[];
        enabled: boolean;
        one_off_local_date: string | null;
      }>,
    ) => {
      try {
        // Reset last_digest_on so updated schedule can still fire today if time window is upcoming.
        const fullPatch = { ...patch, last_digest_on: null };
        const { error } = await (supabase as any)
          .from("live_entry_trackers")
          .update(fullPatch)
          .eq("id", id);
        if (error) throw error;
        setExistingSchedules((prev) =>
          prev.map((r) => (r.id === id ? { ...r, ...fullPatch } : r)),
        );
      } catch (e: unknown) {
        toast({
          title: "Could not update schedule",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const toggleExistingDay = useCallback(
    (id: string, bit: number, selectedDays: number[]) => {
      const set = new Set(selectedDays ?? []);
      if (set.has(bit)) set.delete(bit);
      else set.add(bit);
      void updateExistingSchedule(id, {
        days_of_week: Array.from(set).sort((a, b) => a - b),
      });
    },
    [updateExistingSchedule],
  );

  useEffect(() => {
    if (entryAlarmsOpen && scheduleTab === "existing")
      void loadExistingSchedules();
  }, [entryAlarmsOpen, scheduleTab, loadExistingSchedules]);
  const selectAllBuiltIn = () =>
    setSelected(new Set(STRATEGIES.map((s) => s.value)));
  const clearBuiltIn = () => setSelected(new Set());
  const selectAllCustom = () =>
    setSelectedCustom(new Set(customStrategies.map((cs) => cs.id)));
  const clearCustom = () => setSelectedCustom(new Set());

  const runScan = useCallback(async () => {
    if (!symbol.trim()) return;
    if (selected.size === 0 && selectedCustom.size === 0) {
      toast({ title: "Pick at least one strategy", variant: "destructive" });
      return;
    }
    if (requirePostAnalysis && !postAnalysis?.result) {
      toast({
        title: "Run post-analysis first",
        description:
          "This scan works best after probability outcome is available.",
        variant: "destructive",
      });
      return;
    }

    if (scanProgressTimerRef.current != null) {
      clearInterval(scanProgressTimerRef.current);
      scanProgressTimerRef.current = null;
    }
    setScanThinkingTick(0);
    scanProgressRef.current = 1;
    setScanProgress(1);
    setLoading(true);
    setSignals([]);
    scanProgressTimerRef.current = setInterval(() => {
      setScanProgress((prev) => {
        const n = Math.min(SCAN_PROGRESS_CAP_WHILE_WAITING, prev + 1);
        scanProgressRef.current = n;
        return n;
      });
    }, SCAN_PROGRESS_STEP_MS);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in required");

      // Build custom strategy configs for the edge function
      const customConfigs = customStrategies
        .filter((cs) => selectedCustom.has(cs.id))
        .map((cs) => ({
          id: `custom_${cs.id}`,
          name: cs.name,
          baseType: cs.paper_strategy_type || "trend_following",
          tradingMode: cs.trading_mode,
          stopLossPct: cs.stop_loss_pct,
          takeProfitPct: cs.take_profit_pct,
          isIntraday: cs.is_intraday,
          entryConditions: cs.entry_conditions ?? null,
          exitConditions: cs.exit_conditions ?? null,
          positionConfig: cs.position_config ?? null,
          riskConfig: cs.risk_config ?? null,
          chartConfig: cs.chart_config ?? null,
          executionDays: Array.isArray(cs.execution_days)
            ? cs.execution_days
            : [],
          marketType: cs.market_type === "global_equity" ? "stocks" : (cs.market_type ?? "stocks"),
          startTime: cs.start_time ?? undefined,
          endTime: cs.end_time ?? undefined,
          squareoffTime: cs.squareoff_time ?? undefined,
          riskPerTradePct: cs.risk_per_trade_pct ?? undefined,
          description: cs.description ?? undefined,
        }));

      const { data, error } = await supabase.functions.invoke(
        "strategy-entry-signals",
        {
          body: {
            symbol: symbol.trim(),
            strategies: Array.from(selected),
            customStrategies: customConfigs,
            action: "BOTH",
            days: fetchDays,
            maxSignalAgeDays: resultWindowDays,
            preferIntraday: true,
            intradayInterval: "5m",
            intradayLookbackMinutes,
            postAnalysis: postAnalysis?.result
              ? {
                result: postAnalysis.result,
                actualChangePercent: postAnalysis.actualChangePercent,
                predictedDirection:
                  postAnalysis.predictedDirection ?? undefined,
              }
              : undefined,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );

      if (error) throw new Error(error.message);
      const err = (data as any)?.error;
      if (err) throw new Error(String(err));

      const list = Array.isArray((data as any)?.signals)
        ? ((data as any).signals as SignalRow[])
        : [];
      if (scanProgressTimerRef.current != null) {
        clearInterval(scanProgressTimerRef.current);
        scanProgressTimerRef.current = null;
      }
      while (scanProgressRef.current < 100) {
        await new Promise((r) => setTimeout(r, SCAN_PROGRESS_FLUSH_STEP_MS));
        scanProgressRef.current = Math.min(100, scanProgressRef.current + 1);
        setScanProgress(scanProgressRef.current);
      }
      setSignals(list);
      if (list.length > 0) {
        setScanResultsOpen(true);
      }
      setScanMeta({
        dataSource: (data as any)?.dataSource,
        indicatorSource: (data as any)?.indicatorSource,
        assetType: (data as any)?.assetType,
        lookbackDaysUsed:
          typeof (data as any)?.lookbackDaysUsed === "number"
            ? (data as any).lookbackDaysUsed
            : undefined,
        resultWindowDays:
          typeof (data as any)?.resultWindowDays === "number"
            ? (data as any).resultWindowDays
            : resultWindowDays,
        interval:
          typeof (data as any)?.interval === "string"
            ? (data as any).interval
            : undefined,
        liveWindowMs:
          typeof (data as any)?.liveWindowMs === "number"
            ? (data as any).liveWindowMs
            : undefined,
        barMinutesApprox:
          typeof (data as any)?.barMinutesApprox === "number"
            ? (data as any).barMinutesApprox
            : undefined,
        dataIsIntraday:
          typeof (data as any)?.dataIsIntraday === "boolean"
            ? (data as any).dataIsIntraday
            : undefined,
        isIntraday:
          typeof (data as any)?.isIntraday === "boolean"
            ? (data as any).isIntraday
            : undefined,
        customSelectionDailyOnly:
          typeof (data as any)?.customSelectionDailyOnly === "boolean"
            ? (data as any).customSelectionDailyOnly
            : undefined,
      });

      const allowLiveUi = allowsLiveEntryExitUI(marketStatus, Date.now());
      const isEffectiveLive = (s: SignalRow) => allowLiveUi && !!s.isLive;
      const live = list.filter(isEffectiveLive);
      const todaysCount = list.filter((s) => s.entryDate === todayKey).length;
      const historical = list.filter(
        (s) => !isEffectiveLive(s) && s.entryDate !== todayKey,
      ).length;

      if (!list.length) {
        const onlyCustom = selected.size === 0 && selectedCustom.size > 0;
        toast({
          title: "No signals found",
          description: onlyCustom
            ? "No bars matched your custom entry logic on this lookback (rules too strict, session/day filter, or quiet tape)."
            : "Try selecting more strategies or check the symbol.",
        });
      } else {
        const parts: string[] = [];
        if (live.length) parts.push(`${live.length} live`);
        if (todaysCount) parts.push(`${todaysCount} today`);
        if (historical > 0) parts.push(`${historical} past`);
        toast({
          title: `${list.length} signals scored`,
          description:
            parts.join(" · ") ||
            "Live and historical only (no projected entries).",
        });
      }
      fetchHistoryList(1);
      await new Promise((r) => setTimeout(r, 320));
    } catch (e: unknown) {
      if (scanProgressTimerRef.current != null) {
        clearInterval(scanProgressTimerRef.current);
        scanProgressTimerRef.current = null;
      }
      while (scanProgressRef.current > 0) {
        await new Promise((r) => setTimeout(r, 42));
        scanProgressRef.current = Math.max(0, scanProgressRef.current - 1);
        setScanProgress(scanProgressRef.current);
      }
      toast({
        title: "Scan failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      scanProgressRef.current = 0;
      setScanProgress(0);
    }
  }, [
    symbol,
    selected,
    selectedCustom,
    customStrategies,
    postAnalysis,
    requirePostAnalysis,
    toast,
    todayKey,
    fetchHistoryList,
    fetchDays,
    resultWindowDays,
    intradayLookbackMinutes,
    marketStatus,
  ]);

  const openPaperTradeFromSignal = useCallback(
    (row: SignalRow) => {
      const sym = String(symbol || "").trim();
      if (!sym) {
        toast({
          title: "Symbol missing",
          description: "Select a symbol before paper trading.",
          variant: "destructive",
        });
        return;
      }
      setPaperPresetId(row.strategyId);
      setPaperInitialSymbol(sym);
      setPaperDialogOpen(true);
    },
    [symbol, toast],
  );

  const startTradeSessionFromSignal = useCallback(
    async (row: SignalRow, symbolForExecution: string) => {
      const signalKey = `${row.strategyId}|${row.entryDate}|${row.side}|${row.entryTimestamp ?? ""}`;
      setTrackingSignalKey(signalKey);
      try {
        const tradeSymbol = String(symbolForExecution || symbol || "").trim();
        if (!tradeSymbol) throw new Error("Symbol is missing for this signal.");
        const action = row.side === "SELL" ? "SELL" : "BUY";
        const entryPrice = Number(row.priceAtEntry);
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
          throw new Error("Invalid entry price for this signal.");
        }

        const sv = row.score_vector ?? null;
        const slPct =
          sv?.stop_loss_price != null
            ? Math.max(
              0.1,
              Math.abs(
                ((entryPrice - sv.stop_loss_price) / entryPrice) * 100,
              ),
            )
            : 2;
        const tpPct =
          sv?.take_profit_price != null
            ? Math.max(
              0.1,
              Math.abs(
                ((sv.take_profit_price - entryPrice) / entryPrice) * 100,
              ),
            )
            : 4;

        const response = await tradeTrackingService.startTradeSession({
          symbol: tradeSymbol,
          action,
          confidence: Number.isFinite(Number(row.probabilityScore))
            ? Number(row.probabilityScore)
            : 50,
          riskGrade:
            row.verdict === "reject"
              ? "HIGH"
              : row.verdict === "confirm"
                ? "LOW"
                : "MEDIUM",
          referenceEntryPrice: entryPrice,
          entryPrice,
          shares: 1,
          investmentAmount: entryPrice,
          exchange: /(\.NS|\.BO)$/i.test(tradeSymbol)
            ? tradeSymbol.toUpperCase().endsWith(".BO")
              ? "BSE"
              : "NSE"
            : "NSE",
          product: scanMeta?.isIntraday === false ? "CNC" : "MIS",
          strategyType: row.strategyId,
          stopLossPercentage: slPct,
          targetProfitPercentage: tpPct,
          holdingPeriod:
            scanMeta?.isIntraday === false ? "3-5 days" : "Same day",
          aiRecommendedHoldPeriod:
            scanMeta?.isIntraday === false ? "3-5 days" : "Same day",
          isPaperTrade: true,
          scoreVector: sv,
        });

        if (response.error) throw new Error(response.error);
        toast({
          title: "Tracking started",
          description: `${action} ${tradeSymbol} is now tracked with this scorecard snapshot.`,
        });
      } catch (e: unknown) {
        toast({
          title: "Could not start tracking",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        });
      } finally {
        setTrackingSignalKey(null);
      }
    },
    [symbol, scanMeta?.isIntraday, toast],
  );

  const verdictVariant = (v: string) => {
    if (v === "confirm") return "default" as const;
    if (v === "reject") return "destructive" as const;
    return "secondary" as const;
  };

  const sideLabel = (side: string) =>
    side === "BUY" ? "Entry (BUY)" : side === "SELL" ? "Exit (SELL)" : side;

  const sideClass = (side: string) =>
    side === "BUY"
      ? "text-emerald-400 font-semibold"
      : side === "SELL"
        ? "text-red-400 font-semibold"
        : "text-muted-foreground";

  const formatEntry = (row: SignalRow) => {
    if (
      row.entryTimestamp != null &&
      Number.isFinite(Number(row.entryTimestamp))
    ) {
      return new Date(Number(row.entryTimestamp)).toLocaleString(
        undefined,
        SCAN_DATETIME_OPTS,
      );
    }
    const iso = row.entryTime || "";
    if (!iso) return row.entryDate;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return row.entryDate;
    if (row.entryTime && row.entryTime.length <= 10) return row.entryTime;
    return dt.toLocaleString(undefined, SCAN_DATETIME_OPTS);
  };

  const formatEntryWithZone = (row: SignalRow) => {
    if (
      row.entryTimestamp != null &&
      Number.isFinite(Number(row.entryTimestamp))
    ) {
      const dt = new Date(Number(row.entryTimestamp));
      return `${dt.toLocaleString(undefined, SCAN_DATETIME_OPTS)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
    }
    const iso = row.entryTime || "";
    if (!iso) return row.entryDate;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return row.entryDate;
    return `${dt.toLocaleString(undefined, SCAN_DATETIME_OPTS)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;
  };

  const formatMarketData = (row: SignalRow) => {
    const m = row.marketData;
    if (!m) return "n/a";
    const rsi = m.rsi14 != null ? `RSI ${m.rsi14}` : "RSI n/a";
    const sma = m.sma20 != null ? `SMA20 ${m.sma20}` : "SMA20 n/a";
    const h20 = m.high20 != null ? `H20 ${m.high20}` : "H20 n/a";
    const l20 = m.low20 != null ? `L20 ${m.low20}` : "L20 n/a";
    return `${rsi} · ${sma} · ${h20} · ${l20}`;
  };

  const liveWindowMsMain = useMemo(
    () =>
      resolveLiveWindowMs(scanMeta?.liveWindowMs, scanMeta?.interval ?? null),
    [scanMeta?.liveWindowMs, scanMeta?.interval],
  );

  const liveWindowMsHistory = useMemo(
    () => resolveLiveWindowMs(undefined, historyDetail?.interval ?? null),
    [historyDetail?.interval],
  );

  const visibleSignals = useMemo(() => {
    const w = liveWindowMsMain;
    const venueAllowsLive = allowsLiveEntryExitUI(marketStatus, nowMs);
    const mapped = signals
      .map((row) => applyRowLiveWindow(row, nowMs, w))
      .map((row) => stripLiveWhenVenueClosed(row, venueAllowsLive))
      .filter((s) => !s.isPredicted);
    const deduped = mergeEquivalentSignals(mapped);
    return deduped.sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      const ta = entryBarMs(a) ?? 0;
      const tb = entryBarMs(b) ?? 0;
      return tb - ta;
    });
  }, [signals, nowMs, liveWindowMsMain, marketStatus]);

  useEffect(() => {
    if (loading || !scanResultsOpen) return;
    const liveCustom = visibleSignals.filter(
      (s) => s.isLive && isCustomStrategySignalRow(s, customStrategies),
    );
    if (liveCustom.length === 0) return;
    const key = `${symbol}:${liveCustom
      .map((x) => x.strategyId)
      .sort()
      .join(",")}`;
    if (liveCustomToastKeyRef.current === key) return;
    liveCustomToastKeyRef.current = key;
    toast({
      title: "Live custom strategy signal",
      description: `Found ${liveCustom.length} live signal(s) for your saved strategies. Use Paper trade on a card — only quantity is required.`,
    });
  }, [
    loading,
    scanResultsOpen,
    visibleSignals,
    customStrategies,
    symbol,
    toast,
  ]);

  useEffect(() => {
    if (loading) liveCustomToastKeyRef.current = null;
  }, [loading]);

  useEffect(() => {
    setMainResultsPage(1);
  }, [signals]);

  const mainResultsTotalPages = Math.max(
    1,
    Math.ceil(visibleSignals.length / MAIN_SIGNALS_PAGE_SIZE),
  );
  const effectiveMainPage = Math.min(mainResultsPage, mainResultsTotalPages);
  const pagedMainSignals = useMemo(() => {
    const start = (effectiveMainPage - 1) * MAIN_SIGNALS_PAGE_SIZE;
    return visibleSignals.slice(start, start + MAIN_SIGNALS_PAGE_SIZE);
  }, [visibleSignals, effectiveMainPage]);
  const [mainLeftColumn, mainRightColumn] = useMemo(
    () => splitIndexedIntoColumns(pagedMainSignals),
    [pagedMainSignals],
  );

  const counts = useMemo(() => {
    const live = visibleSignals.filter((s) => s.isLive);
    const todays = visibleSignals.filter((s) => s.entryDate === todayKey);
    const history = visibleSignals.filter(
      (s) => !s.isLive && s.entryDate !== todayKey,
    );
    return {
      total: visibleSignals.length,
      today: todays.length,
      live: live.length,
      history: history.length,
      buyTotal: visibleSignals.filter((s) => s.side === "BUY").length,
      sellTotal: visibleSignals.filter((s) => s.side === "SELL").length,
    };
  }, [visibleSignals, todayKey]);

  const historySignals = useMemo(() => {
    const w = liveWindowMsHistory;
    const venueAllowsLive = allowsLiveEntryExitUI(marketStatus, nowMs);
    return mergeEquivalentSignals(
      (historyDetail?.signals ?? [])
        .filter((s) => !s.isPredicted)
        .map((row) => applyRowLiveWindow(row, nowMs, w))
        .map((row) => stripLiveWhenVenueClosed(row, venueAllowsLive)),
    );
  }, [historyDetail, nowMs, liveWindowMsHistory, marketStatus]);
  const historySignalTotalPages = Math.max(
    1,
    Math.ceil(historySignals.length / DETAIL_SIGNALS_PAGE_SIZE),
  );
  const effectiveHistorySignalPage = Math.min(
    historySignalPage,
    historySignalTotalPages,
  );
  const pagedHistorySignals = useMemo(() => {
    const start = (effectiveHistorySignalPage - 1) * DETAIL_SIGNALS_PAGE_SIZE;
    return historySignals.slice(start, start + DETAIL_SIGNALS_PAGE_SIZE);
  }, [historySignals, effectiveHistorySignalPage]);
  const [historyLeftColumn, historyRightColumn] = useMemo(
    () => splitIndexedIntoColumns(pagedHistorySignals),
    [pagedHistorySignals],
  );

  const scanSynthesis = useMemo(
    () => (visibleSignals.length ? buildScanSynthesis(visibleSignals) : null),
    [visibleSignals],
  );
  const historyScanSynthesis = useMemo(
    () => (historySignals.length ? buildScanSynthesis(historySignals) : null),
    [historySignals],
  );

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Target className="h-4 w-4 text-teal-400 shrink-0" />
              {symbol ? "Strategy scanner " : "AI Trading Analysis & History"}
            </CardTitle>
            {symbol ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Symbol:{" "}
                  <span className="text-white/90 font-mono font-medium">
                    {symbol}
                  </span>
                </p>
                {marketNote ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    {marketNote}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Search for a symbol above to analyze its historical performance,
                detected entry/exit points, and AI-scored signals. Your previous
                scans are saved below for quick access.
              </p>
            )}
            {scanMeta && symbol && (
              <p className="text-[11px] text-zinc-500 mt-1">
                Data:{" "}
                <span className="text-zinc-400">
                  {scanMeta.dataSource ?? "yahoo"}
                </span>
                {" · "}Indicators:{" "}
                <span className="text-zinc-400">
                  {scanMeta.indicatorSource ?? "computed"}
                </span>
                {" · "}Data lookback:{" "}
                <span className="text-zinc-400">
                  {scanMeta.lookbackDaysUsed != null
                    ? `${scanMeta.lookbackDaysUsed}d`
                    : "—"}
                </span>
                {scanMeta.resultWindowDays != null ? (
                  <>
                    {" · "}Results window:{" "}
                    <span className="text-zinc-400">
                      {scanMeta.resultWindowDays}d
                    </span>
                  </>
                ) : null}
                {scanMeta.interval ? (
                  <>
                    {" · "}Chart:{" "}
                    <span className="text-zinc-400 font-mono">
                      {scanMeta.interval}
                    </span>
                  </>
                ) : null}
                {scanMeta.customSelectionDailyOnly ? (
                  <>
                    {" · "}
                    <span className="text-zinc-500">Customs:</span>{" "}
                    <span className="text-zinc-400">
                      all daily — daily OHLCV only
                    </span>
                  </>
                ) : scanMeta.isIntraday != null ? (
                  <>
                    {" · "}Intraday scan:{" "}
                    <span className="text-zinc-400">
                      {scanMeta.isIntraday ? "yes" : "no"}
                    </span>
                  </>
                ) : null}
                {" · "}Live window:{" "}
                <span className="text-zinc-400">
                  {formatDurationShort(liveWindowMsMain)}
                </span>
                {" · "}AI:{" "}
                <span className="text-teal-400">Gemini + rule blend</span>
              </p>
            )}
          </div>
          {symbol && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 px-3 rounded-md border-teal-500/30 bg-black/40 text-teal-300 hover:bg-teal-500/10 hover:border-teal-400/50 text-xs"
                  aria-label="Open schedule popup"
                  onClick={() => openEntryAlarmsForSymbol(symbol)}
                >
                  <Clock3 className="h-3.5 w-3.5 mr-1.5" />
                  Schedule
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[220px]">
                Open schedule popup: create/edit and manage existing schedules.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardHeader>

      <Sheet
        open={entryAlarmsOpen}
        onOpenChange={(open) => {
          setEntryAlarmsOpen(open);
          if (!open) setEntryAlarmTargetSymbol("");
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-4 pt-10"
        >
          <SheetHeader className="mb-3">
            <SheetTitle className="text-zinc-100">Schedule</SheetTitle>
            <SheetDescription className="text-zinc-400 space-y-2">
              <span className="block">
                Turn on{" "}
                <span className="text-zinc-300">entry point alarms</span> for{" "}
                <span className="font-mono text-teal-200/90">
                  {activeEntryAlarmSymbol.trim().toUpperCase() || "this symbol"}
                </span>{" "}
                at a daily wall time. When due, the backend runs the same
                scanner as &quot;Run strategy entry scan&quot;, saves a row in{" "}
                <span className="text-zinc-300">Past analyses</span>, and adds
                one in-app item to the{" "}
                <span className="text-zinc-300">bell</span> (no browser push).
                Open the bell to jump to the snapshot (
                <span className="text-zinc-500">
                  live counts in the message
                </span>
                ).{" "}
                <span className="text-zinc-500">
                  Keep this Live Trading area open for best alignment: the app
                  triggers the digest at your chosen minute via Supabase
                  Realtime; cron still runs if the tab is closed.
                </span>
              </span>
              <span className="block text-[11px] text-zinc-500 leading-snug">
                Requires the hosted job{" "}
                <code className="text-[10px]">entry-point-daily-digest</code> on
                a short cron (e.g. every minute) and{" "}
                <code className="text-[10px]">ENTRY_DIGEST_SECRET</code> set on
                Edge Functions — see{" "}
                <code className="text-[10px]">
                  supabase/functions/entry-point-daily-digest/README.md
                </code>
                . This is separate from the built-in &quot;Time Scheduled&quot;
                strategy checkbox (clock-based signals inside a manual scan).
              </span>
            </SheetDescription>
          </SheetHeader>

          <Tabs
            value={scheduleTab}
            onValueChange={(v) => setScheduleTab(v as "create" | "existing")}
            className="space-y-3"
          >
            <TabsList className="grid w-full grid-cols-2 bg-zinc-900 border border-zinc-800">
              <TabsTrigger
                value="create"
                className="text-xs data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300"
              >
                Create schedule
              </TabsTrigger>
              <TabsTrigger
                value="existing"
                className="text-xs data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300"
              >
                Existing schedules
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-0">
              <LiveEntryTrackingSection
                symbol={activeEntryAlarmSymbol}
                selectedBuiltInStrategies={Array.from(selected)}
                selectedCustomStrategyIds={Array.from(selectedCustom)}
              />
            </TabsContent>

            <TabsContent value="existing" className="mt-0">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                {schedulesLoading ? (
                  <p className="text-xs text-zinc-500">Loading schedules…</p>
                ) : existingSchedules.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No schedules created yet.
                  </p>
                ) : (
                  existingSchedules.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-md border border-white/10 p-2 space-y-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-white font-mono">
                          {row.symbol}
                        </p>
                        <p className="text-[11px] text-zinc-400">
                          {row.notify_time?.slice(0, 5)} · {row.timezone} ·{" "}
                          {row.schedule_mode}
                          {!row.enabled ? " · off" : ""}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Strategies:{" "}
                          {(row.selected_strategies ?? []).length > 0
                            ? (row.selected_strategies ?? [])
                              .map(
                                (id) =>
                                  STRATEGIES.find((s) => s.value === id)
                                    ?.label ?? id,
                              )
                              .join(", ")
                            : "Default"}
                          {(row.selected_custom_strategy_ids ?? []).length > 0
                            ? ` · Custom: ${(
                              row.selected_custom_strategy_ids ?? []
                            )
                              .map(
                                (id) =>
                                  customStrategies.find((c) => c.id === id)
                                    ?.name ?? id,
                              )
                              .join(", ")}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!row.enabled}
                          onCheckedChange={(v) => {
                            void updateExistingSchedule(row.id, {
                              enabled: !!v,
                            });
                          }}
                        />
                        <input
                          type="time"
                          className="h-7 rounded-md border border-zinc-700 bg-black/40 px-2 text-xs text-white"
                          value={timeInputValueFromDb(row.notify_time)}
                          onChange={(e) => {
                            void updateExistingSchedule(row.id, {
                              notify_time: dbTimeFromInput(e.target.value),
                            });
                          }}
                        />
                        <Select
                          value={row.schedule_mode || "all_days"}
                          onValueChange={(v) => {
                            if (v === "tomorrow_once") {
                              void updateExistingSchedule(row.id, {
                                schedule_mode: v,
                                one_off_local_date: getTomorrowDateKeyInTz(
                                  row.timezone,
                                ),
                                days_of_week: [],
                              });
                            } else if (v === "custom") {
                              void updateExistingSchedule(row.id, {
                                schedule_mode: v,
                              });
                            } else {
                              void updateExistingSchedule(row.id, {
                                schedule_mode: v,
                                days_of_week: [],
                                one_off_local_date: null,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 w-[170px] text-xs bg-black/40 border-zinc-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all_days">Every day</SelectItem>
                            <SelectItem value="weekdays">Weekdays</SelectItem>
                            <SelectItem value="custom">Custom days</SelectItem>
                            <SelectItem value="tomorrow_once">
                              Tomorrow once
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] border-teal-500/30 text-teal-300"
                          onClick={() =>
                            void applyCurrentStrategySelectionToSchedule(row.id)
                          }
                        >
                          Save current selection
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-zinc-400 hover:text-red-300 ml-auto"
                          disabled={deletingScheduleId === row.id}
                          onClick={() => void removeExistingSchedule(row.id)}
                        >
                          {deletingScheduleId === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      {row.schedule_mode === "custom" && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {DAY_LABELS.map(({ bit, label }) => (
                            <label
                              key={bit}
                              className="flex items-center gap-1.5 text-[11px] text-zinc-300 cursor-pointer"
                            >
                              <Checkbox
                                checked={(row.days_of_week ?? []).includes(bit)}
                                onCheckedChange={() =>
                                  toggleExistingDay(
                                    row.id,
                                    bit,
                                    row.days_of_week ?? [],
                                  )
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <CardContent className="space-y-4">
        {symbol && (
          <>
            <details className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 group">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2 p-3 pb-2 text-[11px] font-semibold text-cyan-300 [&::-webkit-details-marker]:hidden">
                <span>Scan window & data settings</span>
                <span className="text-zinc-500 transition-transform group-open:rotate-180 text-[10px]">
                  ▾
                </span>
              </summary>
              <div className="px-3 pb-3 space-y-2 border-t border-cyan-500/10 pt-2">
                <p className="text-[10px] text-zinc-500 leading-snug">
                  Only entry/exit points from the last{" "}
                  <span className="text-zinc-400">{resultWindowDays} days</span>{" "}
                  through now are returned. Data fetch uses at least 60 days
                  when needed for indicators.
                </p>
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                      Preset
                    </p>
                    <Select
                      value={timeframePreset}
                      onValueChange={setTimeframePreset}
                    >
                      <SelectTrigger className="h-9 text-xs bg-black/40 border-zinc-700">
                        <SelectValue placeholder="Window" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1d">Last 1 day</SelectItem>
                        <SelectItem value="7d">Last 7 days</SelectItem>
                        <SelectItem value="30d">Last 1 month (~30d)</SelectItem>
                        <SelectItem value="90d">
                          Last 3 months (~90d)
                        </SelectItem>
                        <SelectItem value="180d">
                          Last 6 months (~180d)
                        </SelectItem>
                        <SelectItem value="365d">Last 1 year</SelectItem>
                        <SelectItem value="730d">Last 2 years</SelectItem>
                        <SelectItem value="custom">Custom (days)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {timeframePreset === "custom" ? (
                    <div className="w-full sm:w-32 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                        Days (1–730)
                      </p>
                      <Input
                        type="number"
                        min={1}
                        max={730}
                        value={customWindowDays}
                        onChange={(e) => setCustomWindowDays(e.target.value)}
                        className="h-9 text-xs bg-black/40 border-zinc-700"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </details>

            <div className="rounded-lg border border-teal-500/20 bg-teal-500/5 p-3 space-y-2">
              <p className="text-[11px] font-semibold text-teal-300">
                Select strategies for this scan
              </p>
              <p className="text-[10px] text-zinc-400">
                Selected: {selected.size} built-in
                {customStrategies.length > 0
                  ? ` + ${selectedCustom.size} custom`
                  : ""}
              </p>
              {selected.size + selectedCustom.size === 0 ? (
                <p className="text-[10px] text-amber-300">
                  Pick at least one strategy before running scan.
                </p>
              ) : null}
            </div>

            {/* Signal counts — always visible once results exist */}
            {counts.total > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {counts.live > 0 && (
                  <Badge className="bg-teal-500/20 border border-teal-400/40 text-teal-200 hover:bg-teal-500/30 text-sm font-semibold px-2.5 py-1">
                    Live: {counts.live}
                  </Badge>
                )}
                <Badge className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20 text-sm font-medium">
                  Entry (BUY): {counts.buyTotal}
                </Badge>
                <Badge className="bg-red-500/15 border border-red-500/30 text-red-200 hover:bg-red-500/20 text-sm font-medium">
                  Exit (SELL): {counts.sellTotal}
                </Badge>
                {counts.today > 0 && (
                  <span className="text-teal-400 text-sm font-medium">
                    Today: {counts.today}
                  </span>
                )}
                {counts.history > 0 && (
                  <span className="text-zinc-400 text-sm font-medium">
                    Past: {counts.history}
                  </span>
                )}
              </div>
            )}

            {/* Strategy picker */}
            <div className="rounded-lg border border-white/10 p-3 max-h-48 overflow-y-auto space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Built-in strategies
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={selectAllBuiltIn}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={clearBuiltIn}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STRATEGIES.map((s) => (
                  <label
                    key={s.value}
                    className="flex items-start gap-2 text-xs cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(s.value)}
                      onCheckedChange={() => toggle(s.value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-white font-medium">{s.label}</span>
                      <span className="text-muted-foreground block text-[10px] leading-snug">
                        {s.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* User's custom algo strategies */}
            {customStrategies.length > 0 && (
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 max-h-40 overflow-y-auto space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-purple-300">
                    Your custom strategies ({customStrategies.length})
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-purple-200 hover:text-purple-100"
                      onClick={selectAllCustom}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-purple-200 hover:text-purple-100"
                      onClick={clearCustom}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {customStrategies.map((cs) => {
                    const baseLabel = STRATEGIES.find(
                      (s) => s.value === (cs.paper_strategy_type || ""),
                    )?.label;
                    return (
                      <label
                        key={cs.id}
                        className="flex items-start gap-2 text-xs cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedCustom.has(cs.id)}
                          onCheckedChange={() => toggleCustom(cs.id)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="text-purple-200 font-medium">
                            {cs.name}
                          </span>
                          <span className="text-muted-foreground block text-[10px] leading-snug">
                            {cs.trading_mode} · SL {cs.stop_loss_pct}% · TP{" "}
                            {cs.take_profit_pct}%
                            {baseLabel ? ` · based on ${baseLabel}` : ""}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {loading ? (
              <div
                className="rounded-lg border border-teal-500/30 bg-teal-950/15 p-4 space-y-2"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-teal-100/95 font-medium leading-snug min-w-0">
                    {pickScanThinkingLine(scanProgress, scanThinkingTick)}
                  </span>
                  <span className="tabular-nums text-zinc-500 shrink-0">
                    {Math.min(100, Math.floor(scanProgress))}%
                  </span>
                </div>
                <Progress
                  value={Math.min(100, Math.floor(scanProgress))}
                  className="h-2.5 bg-zinc-800/90 [&>div]:bg-gradient-to-r [&>div]:from-teal-500 [&>div]:to-cyan-400"
                />
              </div>
            ) : (
              <Button
                className="w-full bg-teal-600 hover:bg-teal-500"
                onClick={runScan}
                disabled={loading}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Run strategy entry scan
              </Button>
            )}
          </>
        )}

        {/* Results popup */}
        <Dialog open={scanResultsOpen} onOpenChange={setScanResultsOpen}>
          <DialogContent className="flex h-[92vh] max-h-[92vh] w-[95vw] sm:w-[98vw] sm:max-w-[98vw] flex-col gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-zinc-800 px-5 py-4">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-white text-lg">
                    Strategy scan results
                  </DialogTitle>
                  <DialogDescription>
                    Detected entry & exit points for {symbol}. Live vs past
                    labels update with your current clock.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
                {visibleSignals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No signals detected in this window.
                  </p>
                ) : (
                  <div className="flex h-full min-h-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                        Signal breakdown
                      </p>
                      {visibleSignals.length > MAIN_SIGNALS_PAGE_SIZE ? (
                        <span className="text-[11px] text-zinc-500">
                          Page {effectiveMainPage} / {mainResultsTotalPages} (
                          {MAIN_SIGNALS_PAGE_SIZE} per page)
                        </span>
                      ) : null}
                    </div>

                    <div
                      ref={mainSignalsScrollRef}
                      className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-black/20 p-3"
                    >
                      {scanSynthesis ? (
                        <div className="mb-3">
                          <ScanSignalSummaryBanner
                            synthesis={scanSynthesis}
                            symbol={symbol.trim()}
                            onSetAlert={() => openEntryAlarmsForSymbol(symbol)}
                          />
                        </div>
                      ) : null}
                      <div className="space-y-4 xl:hidden">
                        {pagedMainSignals.map((row, i) => (
                          <SignalAnalysisCard
                            key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveMainPage}-${i}`}
                            row={row}
                            symbolForExecution={symbol}
                            todayKey={todayKey}
                            nowMs={nowMs}
                            liveWindowMs={liveWindowMsMain}
                            formatEntry={formatEntry}
                            formatEntryWithZone={formatEntryWithZone}
                            formatMarketData={formatMarketData}
                            sideLabel={sideLabel}
                            sideClass={sideClass}
                            verdictVariant={verdictVariant}
                            onStartTradeSession={startTradeSessionFromSignal}
                            trackingSignalKey={trackingSignalKey}
                            paperTradeEnabled={
                              row.isLive &&
                              isCustomStrategySignalRow(
                                row,
                                customStrategies,
                              )
                            }
                            onPaperTrade={() =>
                              openPaperTradeFromSignal(row)
                            }
                          />
                        ))}
                      </div>
                      <div className="hidden xl:grid xl:grid-cols-2 xl:gap-4">
                        <div className="space-y-4">
                          {mainLeftColumn.map(
                            ({ item: row, originalIndex }) => (
                              <SignalAnalysisCard
                                key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveMainPage}-${originalIndex}`}
                                row={row}
                                symbolForExecution={symbol}
                                todayKey={todayKey}
                                nowMs={nowMs}
                                liveWindowMs={liveWindowMsMain}
                                formatEntry={formatEntry}
                                formatEntryWithZone={formatEntryWithZone}
                                formatMarketData={formatMarketData}
                                sideLabel={sideLabel}
                                sideClass={sideClass}
                                verdictVariant={verdictVariant}
                                onStartTradeSession={
                                  startTradeSessionFromSignal
                                }
                                trackingSignalKey={trackingSignalKey}
                              />
                            ),
                          )}
                        </div>
                        <div className="space-y-4">
                          {mainRightColumn.map(
                            ({ item: row, originalIndex }) => (
                              <SignalAnalysisCard
                                key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveMainPage}-${originalIndex}`}
                                row={row}
                                symbolForExecution={symbol}
                                todayKey={todayKey}
                                nowMs={nowMs}
                                liveWindowMs={liveWindowMsMain}
                                formatEntry={formatEntry}
                                formatEntryWithZone={formatEntryWithZone}
                                formatMarketData={formatMarketData}
                                sideLabel={sideLabel}
                                sideClass={sideClass}
                                verdictVariant={verdictVariant}
                                onStartTradeSession={
                                  startTradeSessionFromSignal
                                }
                                trackingSignalKey={trackingSignalKey}
                              />
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-5 py-3 pr-14 sm:pr-5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 px-3 border-teal-500/30"
                  aria-label="Previous signals page"
                  onClick={() => setMainResultsPage((p) => Math.max(1, p - 1))}
                  disabled={effectiveMainPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Prev</span>
                </Button>
                <span className="min-w-0 flex-1 text-center text-xs text-muted-foreground">
                  {visibleSignals.length} signals · page {effectiveMainPage} of{" "}
                  {mainResultsTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 px-3 border-teal-500/30"
                  aria-label="Next signals page"
                  onClick={() =>
                    setMainResultsPage((p) =>
                      Math.min(mainResultsTotalPages, p + 1),
                    )
                  }
                  disabled={effectiveMainPage >= mainResultsTotalPages}
                >
                  <span className="mr-1 hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Saved scan history — all symbols; does not depend on current symbol */}
        <div className="rounded-lg border border-white/10 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-white/90 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-teal-400" />
                Saved scan history
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                All commodities · newest first
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] shrink-0"
              onClick={() => fetchHistoryList(historyPage)}
              disabled={historyLoading}
            >
              Refresh
            </Button>
          </div>
          {historyLoading ? (
            <p className="text-[11px] text-muted-foreground">
              Loading history…
            </p>
          ) : historyItems.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No saved scans yet.
            </p>
          ) : (
            <div className="space-y-2">
              {historyItems.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-1 rounded-lg border border-white/10 bg-black/25 transition-colors hover:border-teal-400/40"
                >
                  <button
                    type="button"
                    onClick={() => openHistoryDetail(item.id)}
                    className="min-w-0 flex-1 text-left p-3 rounded-l-lg"
                  >
                    <p className="text-sm font-semibold text-white font-mono tracking-tight">
                      {item.symbol}
                    </p>
                    <p className="text-sm text-zinc-400 font-medium leading-snug">
                      {new Date(item.scan_completed_at).toLocaleString(
                        undefined,
                        SCAN_DATETIME_OPTS,
                      )}{" "}
                      · {item.signal_count} signals ·{" "}
                      <span className="text-teal-400/90">
                        live {item.live_count}
                      </span>
                      {" · "}
                      <span className="text-zinc-500">
                        past {Math.max(0, item.signal_count - item.live_count)}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Open for full snapshot. Delete removes this run only.
                    </p>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-auto min-h-[3rem] shrink-0 rounded-l-none rounded-r-lg text-zinc-500 hover:text-red-400 hover:bg-red-950/30"
                    aria-label={`Delete scan for ${item.symbol}`}
                    disabled={historyDeleting}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHistoryDeleteTarget(item);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => fetchHistoryList(Math.max(1, historyPage - 1))}
                  disabled={historyPage <= 1 || historyLoading}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Page {historyPage} / {historyTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() =>
                    fetchHistoryList(
                      Math.min(historyTotalPages, historyPage + 1),
                    )
                  }
                  disabled={historyPage >= historyTotalPages || historyLoading}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="flex h-[92vh] max-h-[92vh] w-[95vw] sm:w-[98vw] sm:max-w-[98vw] flex-col gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-zinc-800 px-5 py-4">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-white text-lg">
                    Saved scan details
                  </DialogTitle>
                  <DialogDescription>
                    Snapshot from when the scan ran. Live vs past labels update
                    with your current clock; we do not store projected future
                    entries.
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
                {historyDetailLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : !historyDetail ? (
                  <p className="text-sm text-muted-foreground">
                    No detail found.
                  </p>
                ) : (
                  <div className="flex h-full min-h-0 flex-col gap-3">
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {historyDetail.symbol} ·{" "}
                      {new Date(historyDetail.scan_completed_at).toLocaleString(
                        undefined,
                        SCAN_DATETIME_OPTS,
                      )}{" "}
                      · Data {historyDetail.data_source ?? "n/a"} · Indicators{" "}
                      {historyDetail.indicator_source ?? "n/a"}
                    </p>
                    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-black/20 p-3">
                      {historyScanSynthesis ? (
                        <div className="mb-3">
                          <ScanSignalSummaryBanner
                            synthesis={historyScanSynthesis}
                            symbol={historyDetail.symbol}
                            titleSuffix="Saved scan summary"
                            onSetAlert={() =>
                              openEntryAlarmsForSymbol(historyDetail.symbol)
                            }
                          />
                        </div>
                      ) : null}
                      <div className="space-y-4 lg:hidden">
                        {pagedHistorySignals.map((row, i) => (
                          <SignalAnalysisCard
                            key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveHistorySignalPage}-${i}`}
                            row={row}
                            symbolForExecution={historyDetail?.symbol ?? symbol}
                            todayKey={todayKey}
                            nowMs={nowMs}
                            liveWindowMs={liveWindowMsHistory}
                            formatEntry={formatEntry}
                            formatEntryWithZone={formatEntryWithZone}
                            formatMarketData={formatMarketData}
                            sideLabel={sideLabel}
                            sideClass={sideClass}
                            verdictVariant={verdictVariant}
                            onStartTradeSession={startTradeSessionFromSignal}
                            trackingSignalKey={trackingSignalKey}
                          />
                        ))}
                      </div>
                      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4">
                        <div className="space-y-4">
                          {historyLeftColumn.map(
                            ({ item: row, originalIndex }) => (
                              <SignalAnalysisCard
                                key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveHistorySignalPage}-${originalIndex}`}
                                row={row}
                                symbolForExecution={
                                  historyDetail?.symbol ?? symbol
                                }
                                todayKey={todayKey}
                                nowMs={nowMs}
                                liveWindowMs={liveWindowMsHistory}
                                formatEntry={formatEntry}
                                formatEntryWithZone={formatEntryWithZone}
                                formatMarketData={formatMarketData}
                                sideLabel={sideLabel}
                                sideClass={sideClass}
                                verdictVariant={verdictVariant}
                                onStartTradeSession={
                                  startTradeSessionFromSignal
                                }
                                trackingSignalKey={trackingSignalKey}
                              />
                            ),
                          )}
                        </div>
                        <div className="space-y-4">
                          {historyRightColumn.map(
                            ({ item: row, originalIndex }) => (
                              <SignalAnalysisCard
                                key={`${row.strategyId}-${row.entryDate}-${row.side}-${effectiveHistorySignalPage}-${originalIndex}`}
                                row={row}
                                symbolForExecution={
                                  historyDetail?.symbol ?? symbol
                                }
                                todayKey={todayKey}
                                nowMs={nowMs}
                                liveWindowMs={liveWindowMsHistory}
                                formatEntry={formatEntry}
                                formatEntryWithZone={formatEntryWithZone}
                                formatMarketData={formatMarketData}
                                sideLabel={sideLabel}
                                sideClass={sideClass}
                                verdictVariant={verdictVariant}
                                onStartTradeSession={
                                  startTradeSessionFromSignal
                                }
                                trackingSignalKey={trackingSignalKey}
                              />
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950 px-5 py-3 pr-14 sm:pr-5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 px-3"
                  aria-label="Previous page of signals"
                  onClick={() =>
                    setHistorySignalPage((p) => {
                      const next = Math.max(1, p - 1);
                      if (next !== p) {
                        historySignalsScrollRef.current?.scrollTo({
                          top: 0,
                          behavior: "smooth",
                        });
                      }
                      return next;
                    })
                  }
                  disabled={effectiveHistorySignalPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Prev</span>
                </Button>
                <span className="min-w-0 flex-1 text-center text-xs text-muted-foreground">
                  Page {effectiveHistorySignalPage} / {historySignalTotalPages}{" "}
                  · {DETAIL_SIGNALS_PAGE_SIZE} per page
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 px-3"
                  aria-label="Next page of signals"
                  onClick={() =>
                    setHistorySignalPage((p) => {
                      const next = Math.min(historySignalTotalPages, p + 1);
                      if (next !== p) {
                        historySignalsScrollRef.current?.scrollTo({
                          top: 0,
                          behavior: "smooth",
                        });
                      }
                      return next;
                    })
                  }
                  disabled={
                    effectiveHistorySignalPage >= historySignalTotalPages
                  }
                >
                  <span className="mr-1 hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={historyDeleteTarget !== null}
          onOpenChange={(open) => {
            if (!open && !historyDeleting) setHistoryDeleteTarget(null);
          }}
        >
          <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Delete this scan?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-sm text-zinc-400">
                  {historyDeleteTarget ? (
                    <p>
                      Permanently remove the saved snapshot for{" "}
                      <span className="font-mono text-zinc-200">
                        {historyDeleteTarget.symbol}
                      </span>{" "}
                      from{" "}
                      {new Date(
                        historyDeleteTarget.scan_completed_at,
                      ).toLocaleString(undefined, SCAN_DATETIME_OPTS)}
                      . This cannot be undone.
                    </p>
                  ) : null}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                disabled={historyDeleting}
                className="border-zinc-700 bg-zinc-900 text-zinc-200"
              >
                Cancel
              </AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={historyDeleting}
                className="bg-red-600 hover:bg-red-500"
                onClick={() => void confirmDeleteHistoryScan()}
              >
                {historyDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <PaperTradeSetupDialog
          open={paperDialogOpen}
          onOpenChange={(o) => {
            setPaperDialogOpen(o);
            if (!o) {
              setPaperPresetId(null);
              setPaperInitialSymbol(null);
            }
          }}
          preselectedStrategyId={paperPresetId}
          initialSymbol={paperInitialSymbol}
          scannerQuickMode
        />
      </CardContent>
    </Card>
  );
}
