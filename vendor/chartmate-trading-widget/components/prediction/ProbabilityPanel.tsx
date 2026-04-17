import { useMemo, type ReactNode } from "react";
import { formatCurrency, formatKeyDriver } from "@/lib/display-utils";
import { isUsdDenominatedSymbol } from "@/lib/tradingview-symbols";
import { convertQuoteToDisplayAmount } from "@/lib/convert-quote-display-currency";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Brain,
  Target,
  Flame,
  Clock,
  Activity,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { HELP } from "@/lib/analysis-ui-help";
import { buildExpandedReasoning, softenPunctuation } from "@/lib/expand-analysis-narrative";

/* ─────────────────────────────── types ─────────────────────────────── */

interface Forecast {
  horizon: string;
  direction: "up" | "down" | "sideways";
  probabilities: { up: number; down: number; sideways: number };
  expected_return_bp: number;
  expected_range_bp?: { p10: number; p50: number; p90: number };
  key_drivers?: string[];
  confidence: number;
}

interface GeminiForecast {
  symbol: string;
  forecasts?: Forecast[];
  action_signal?: { action: "BUY" | "SELL" | "HOLD"; confidence: number };
  risk_grade?: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  support_resistance?: {
    supports?: Array<{ level: number; strength: number }>;
    resistances?: Array<{ level: number; strength: number }>;
  };
  deep_analysis?: {
    bullish_case?: string;
    bearish_case?: string;
    conviction_rationale?: string;
    contrarian_view?: string;
    success_probability?: number;
    risk_reward_ratio?: number;
  };
  positioning_guidance?: { bias: string; notes: string };
}

interface ProbabilityPanelProps {
  symbol: string;
  currentPrice: number;
  geminiForecast: GeminiForecast;
  volumeData?: {
    volume24h?: number | null;
    volumeProfile?: string;
    volumeConfirmation?: number;
    avgVolume?: number;
  };
  /** ISO timestamp when analysis was run (predictedAt). */
  analysedAt?: Date | null;
  /** Callback to re-run the analysis from the parent. */
  onRefresh?: () => void;
  /**
   * User-selected analysis horizon (e.g. `1h`, `4h`, or custom `2d`).
   * Shown after each panel card title, e.g. “… (for next 1 hr)”.
   */
  selectedHorizon?: string;
  /** User display currency; defaults to match instrument quote (USD vs INR). */
  displayCurrency?: "INR" | "USD";
  /** From Frankfurter INR→USD when converting levels for display */
  usdPerInr?: number | null;
}

/* ─────────────────────────────── helpers ────────────────────────────── */

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/** A simple horizontal bar with colour gradient. */
function PctBar({
  value,
  color,
  height = "h-2",
}: {
  value: number;
  color: string;
  height?: string;
}) {
  return (
    <div className={`w-full bg-white/5 rounded-full overflow-hidden ${height}`}>
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${clamp(value)}%` }}
      />
    </div>
  );
}

/** Circular arc gauge (SVG). value 0-100. */
function ArcGauge({
  value,
  label,
  color,
  size = 100,
}: {
  value: number;
  label: string;
  color: string;
  size?: number;
}) {
  const r = 38;
  const cx = 50;
  const cy = 50;
  const strokeWidth = 8;
  const circumference = Math.PI * r; // half-circle arc
  const offset = circumference * (1 - clamp(value) / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size * 0.62}
        viewBox="0 0 100 55"
        className="overflow-visible"
      >
        {/* Track */}
        <path
          d={`M 12 50 A ${r} ${r} 0 0 1 88 50`}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M 12 50 A ${r} ${r} 0 0 1 88 50`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        {/* Text */}
        <text
          x={cx}
          y={48}
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill="white"
        >
          {Math.round(value)}%
        </text>
      </svg>
      <span className="text-[11px] text-zinc-500 font-medium tracking-wide uppercase">
        {label}
      </span>
    </div>
  );
}

/** Derive good "reasoning" text from AI data without using Buy/Sell/Hold words. */
function deriveReasoning(
  direction: "up" | "down" | "sideways",
  confidence: number,
  drivers?: string[],
  deepAnalysis?: GeminiForecast["deep_analysis"]
): string {
  // Prefer rich AI-generated deep analysis text first
  if (direction === "up" && deepAnalysis?.bullish_case) return deepAnalysis.bullish_case;
  if (direction === "down" && deepAnalysis?.bearish_case) return deepAnalysis.bearish_case;

  // Build from drivers, but map internal names to readable phrases
  const readable = (drivers ?? [])
    .map((d) => {
      const map: Record<string, string> = {
        quantum_ensemble: "multi-model ensemble agreement",
        market_regime_awareness: "market regime analysis",
        rsi_signal: "RSI momentum signal",
        macd_signal: "MACD crossover signal",
        volume_confirmation: "volume confirmation",
        sma_crossover: "moving average crossover",
        bollinger_squeeze: "Bollinger Band squeeze",
        trend_following: "trend-following indicators",
        mean_reversion: "mean-reversion signal",
      };
      return map[d] ?? d.replace(/_/g, " ");
    })
    .filter(Boolean)
    .slice(0, 3);

  if (direction === "up") {
    if (readable.length)
      return `Upward bias detected via ${readable.join(", ")}. ${confidence}% model confidence.`;
    return `Technical indicators suggest ${confidence}% probability of upward continuation.`;
  }
  if (direction === "down") {
    if (readable.length)
      return `Downside pressure signalled by ${readable.join(", ")}. ${confidence}% model confidence.`;
    return `Bearish signals detected with ${confidence}% confidence of downward pressure.`;
  }
  return `Market in consolidation — no strong directional edge (${confidence}% signal confidence). Probability split across all three scenarios.`;
}

/* ─────────────────────────────── main component ─────────────────────── */

/** Auto-convert decimal probabilities (0–1) → percentage (0–100) */
function normPct(raw: number | undefined, fallback: number): number {
  if (raw == null) return fallback;
  // If all three sum to ≤ 1.5 they are fractions → ×100
  return raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
}

/** Format a volume number for display (e.g. 17.13K, 1.2M) */
function fmtVolume(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString();
}

/** Human label for the user’s timeframe (presets + compact codes like 2h, 3d). */
function formatSelectedHorizonForPanel(horizon: string | undefined): string | null {
  if (!horizon?.trim()) return null;
  const h = horizon.trim();
  if (h.toLowerCase() === "custom") return null;

  const presets: Record<string, string> = {
    "15m": "15 min",
    "30m": "30 min",
    "1h": "1 hr",
    "4h": "4 hr",
    "1d": "1 day",
    "1w": "1 week",
  };
  if (presets[h]) return presets[h];

  const compact = h.replace(/\s+/g, "");
  const m = /^(\d+)(m|h|d|w)$/i.exec(compact);
  if (m) {
    const n = m[1];
    const u = m[2].toLowerCase();
    if (u === "m") return `${n} min`;
    if (u === "h") return `${n} hr`;
    if (u === "d") return `${n} ${n === "1" ? "day" : "days"}`;
    return `${n} ${n === "1" ? "week" : "weeks"}`;
  }

  return h;
}

function PanelSectionTitle({
  icon: Icon,
  iconClassName,
  children,
  horizonLabel,
}: {
  icon: LucideIcon;
  iconClassName: string;
  children: ReactNode;
  /** Preformatted label from {@link formatSelectedHorizonForPanel} */
  horizonLabel: string | null;
}) {
  return (
    <CardTitle
      className={cn(
        "text-sm font-semibold text-zinc-200",
        "flex items-start gap-2",
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", iconClassName)} aria-hidden />
      <span className="min-w-0 leading-snug">
        {children}
        {horizonLabel ? <>{" "}(for next {horizonLabel})</> : null}
      </span>
    </CardTitle>
  );
}

export function ProbabilityPanel({
  symbol,
  currentPrice,
  geminiForecast,
  volumeData,
  analysedAt,
  onRefresh,
  selectedHorizon,
  displayCurrency: displayCurrencyProp,
  usdPerInr = null,
}: ProbabilityPanelProps) {
  const forecasts = geminiForecast.forecasts ?? [];
  const primaryForecast = forecasts[0];
  const actionSignal = geminiForecast.action_signal;
  const deep = geminiForecast.deep_analysis;
  const riskGrade = geminiForecast.risk_grade ?? "MEDIUM";
  const supports = geminiForecast.support_resistance?.supports ?? [];
  const resistances = geminiForecast.support_resistance?.resistances ?? [];

  /* Direction probabilities — auto-normalise decimal (0-1) or pct (0-100) */
  const rawUp = primaryForecast?.probabilities?.up;
  const rawDown = primaryForecast?.probabilities?.down;
  const rawSide = primaryForecast?.probabilities?.sideways;

  // detect decimal format: if all three sum ≤ 1.5 they are 0-1 fractions
  const isDecimal = (rawUp ?? 0) + (rawDown ?? 0) + (rawSide ?? 0) <= 1.5;
  const scale = isDecimal ? 100 : 1;

  const upPct   = clamp(Math.round((rawUp   ?? 0.50) * scale));
  const downPct  = clamp(Math.round((rawDown  ?? 0.35) * scale));
  const sidewaysPct = clamp(Math.round((rawSide ?? 0.15) * scale));

  /* AI confidence */
  const aiConfidence = clamp(
    actionSignal?.confidence ?? primaryForecast?.confidence ?? 60
  );

  /* Momentum & trend derived from primary expected return */
  const returnBp = primaryForecast?.expected_return_bp ?? 0;
  const momentumScore = useMemo(() => {
    const raw = Math.min(10, Math.max(0, 5 + (returnBp / 200) * 5));
    return Math.round(raw * 10) / 10;
  }, [returnBp]);

  const trendStrength =
    aiConfidence >= 75 ? "Strong" : aiConfidence >= 55 ? "Moderate" : "Weak";

  const volatilityRisk =
    riskGrade === "VERY_HIGH" || riskGrade === "HIGH"
      ? "High"
      : riskGrade === "MEDIUM"
      ? "Medium"
      : "Low";

  /* Buyer / seller pressure
   * Start from the directional probability ratio, then skew it using:
   *   1. AI action signal direction + confidence (breaks 50/50 ties)
   *   2. Volume confirmation nudge (±8 pts)
   * This prevents the meter from always reading 50/50 when up ≈ down.
   */
  const buyerPressure = useMemo(() => {
    // Base ratio from probability
    let bp = (upPct + downPct) > 0
      ? Math.round((upPct / (upPct + downPct)) * 100)
      : 50;

    // Break 50/50 when up≈down: use model expected move (bp) + momentum score
    const retBp = primaryForecast?.expected_return_bp ?? 0;
    bp = clamp(Math.round(bp + Math.max(-20, Math.min(20, retBp / 260))));
    bp = clamp(Math.round(bp + (momentumScore - 5) * 3.2));

    // Action-signal bias — confidence above 50% pulls the needle
    const sig  = actionSignal?.action;
    const conf = clamp(actionSignal?.confidence ?? 50);
    if (sig === "BUY" && conf > 50) {
      bp = clamp(Math.round(bp + (conf - 50) * 0.6));
    } else if (sig === "SELL" && conf > 50) {
      bp = clamp(Math.round(bp - (conf - 50) * 0.6));
    }

    // Volume confirmation nudge (−1 to +1 scale → −8 to +8 pts)
    if (volumeData?.volumeConfirmation != null) {
      bp = clamp(Math.round(bp + volumeData.volumeConfirmation * 10));
    }

    return bp;
  }, [upPct, downPct, actionSignal, volumeData, primaryForecast?.expected_return_bp, momentumScore]);
  const sellerPressure = 100 - buyerPressure;

  /* Price targets from support/resistance */
  const priceTargets = useMemo(() => {
    const tgts: Array<{ price: number; probability: number; tag: "sup" | "res" }> = [];
    resistances.slice(0, 2).forEach((r, i) =>
      tgts.push({ price: r.level, probability: i === 0 ? upPct : Math.round(upPct * 0.4), tag: "res" })
    );
    supports.slice(0, 1).forEach((s) =>
      tgts.push({ price: s.level, probability: Math.round(downPct * 0.7), tag: "sup" })
    );
    return tgts.sort((a, b) => b.price - a.price).slice(0, 3);
  }, [supports, resistances, upPct, downPct]);

  /* Probability timeline across multiple horizons — normalise same as primary */
  const timeline = useMemo(
    () =>
      forecasts.slice(0, 4).map((f) => {
        const fRawUp = f.probabilities?.up ?? 0;
        const fRawDn = f.probabilities?.down ?? 0;
        const fRawSd = f.probabilities?.sideways ?? 0;
        const fIsDecimal = fRawUp + fRawDn + fRawSd <= 1.5;
        const fScale = fIsDecimal ? 100 : 1;
        return {
          horizon: f.horizon,
          upPct: clamp(Math.round(fRawUp * fScale)),
          confidence: Math.round(f.confidence),
          direction: f.direction,
        };
      }),
    [forecasts]
  );

  /* Why directions section - reasoning text */
  const primaryDirection = primaryForecast?.direction ?? "sideways";
  const reasoning = useMemo(() => {
    const expanded = softenPunctuation(
      buildExpandedReasoning({
        rationale: geminiForecast.positioning_guidance?.notes,
        positioningNotes: geminiForecast.positioning_guidance?.notes,
        keyDrivers: primaryForecast?.key_drivers,
        technicalFactors: undefined,
        convictionRationale: deep?.conviction_rationale,
        bullishCase: deep?.bullish_case,
        bearishCase: deep?.bearish_case,
        contrarianView: deep?.contrarian_view,
        volumeProfile: volumeData?.volumeProfile ?? undefined,
        symbol,
      })
    );
    const base = deriveReasoning(
      primaryDirection,
      aiConfidence,
      primaryForecast?.key_drivers,
      deep
    );
    if (expanded.replace(/\s/g, "").length >= 220) return expanded;
    const merged = `${expanded} ${base}`.replace(/\s+/g, " ").trim();
    return merged.length > expanded.length ? merged : expanded || base;
  }, [
    primaryDirection,
    aiConfidence,
    primaryForecast?.key_drivers,
    deep,
    geminiForecast.positioning_guidance?.notes,
    volumeData?.volumeProfile,
    symbol,
  ]);

  const horizonDisplay = formatSelectedHorizonForPanel(selectedHorizon);

  const quoteInUsd = isUsdDenominatedSymbol(symbol);
  const dc = displayCurrencyProp ?? (quoteInUsd ? "USD" : "INR");
  const mismatch =
    (dc === "USD" && !quoteInUsd) || (dc === "INR" && quoteInUsd);
  const effectivePanelPriceCurrency: "INR" | "USD" =
    mismatch && (usdPerInr == null || usdPerInr <= 0)
      ? quoteInUsd
        ? "USD"
        : "INR"
      : dc;
  const formatPanelPrice = (n: number) =>
    formatCurrency(
      convertQuoteToDisplayAmount(n, quoteInUsd, dc, mismatch ? usdPerInr : null),
      2,
      false,
      effectivePanelPriceCurrency,
    );

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1.5 bg-gradient-to-b from-primary to-accent rounded-full" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-tight">
                AI Probability Analysis
                {horizonDisplay ? ` (for next ${horizonDisplay})` : ""}
              </h2>
              <CardInfoTooltip text={HELP.probabilityPanel} className="text-zinc-500" />
            </div>
            <p className="text-xs text-zinc-500">
              Market intelligence from technical and quantitative signals; interpret with your own risk rules
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {analysedAt && (
            <span className="text-[10px] text-zinc-600">
              Analysed {analysedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
              title="Re-run AI analysis with latest market data"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Row 1: Direction gauge + Confidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 1. Directional Probability Gauge — single card, three directions */}
        <Card className="glass-panel border-white/10 bg-zinc-900/50">
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <PanelSectionTitle
              icon={TrendingUp}
              iconClassName="text-emerald-400"
              horizonLabel={horizonDisplay}
            >
              Market Direction Probability
            </PanelSectionTitle>
            <CardInfoTooltip text={HELP.marketDirection} className="text-zinc-500" />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Three gauges in one row: up / sideways / down */}
            <div className="flex justify-around items-end">
              <ArcGauge value={upPct}       label="Upward"    color="#10b981" />
              <ArcGauge value={sidewaysPct} label="Sideways"  color="#6b7280" />
              <ArcGauge value={downPct}     label="Downward"  color="#ef4444" />
            </div>
            {/* Small bar summary so numbers are unambiguous */}
            <div className="space-y-1.5">
              {[
                { label: "↑ Upward total",   pct: upPct,       bar: "bg-emerald-500" },
                { label: "→ Sideways",        pct: sidewaysPct, bar: "bg-zinc-500"    },
                { label: "↓ Downward total",  pct: downPct,     bar: "bg-red-500"     },
              ].map(({ label, pct, bar }) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="w-28 text-zinc-500 shrink-0">{label}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right font-semibold text-zinc-300">{pct}%</span>
                </div>
              ))}
            </div>
            {/* Reasoning why */}
            <div className="text-xs text-zinc-400 bg-white/[0.03] rounded-lg p-3 border border-white/5 leading-relaxed">
              <span className="text-zinc-300 font-medium">Why:</span>{" "}
              {reasoning}
            </div>
          </CardContent>
        </Card>

        {/* 2. AI Confidence Score */}
        <Card className="glass-panel border-white/10 bg-zinc-900/50">
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <PanelSectionTitle
              icon={Brain}
              iconClassName="text-primary"
              horizonLabel={horizonDisplay}
            >
              AI Market Confidence
            </PanelSectionTitle>
            <CardInfoTooltip text={HELP.aiConfidence} className="text-zinc-500" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-bold text-white tracking-tight">
                  {aiConfidence}%
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Overall AI signal strength</p>
              </div>
              <ArcGauge
                value={aiConfidence}
                label="Confidence"
                color={aiConfidence >= 70 ? "#10b981" : aiConfidence >= 50 ? "#f59e0b" : "#ef4444"}
                size={90}
              />
            </div>

            <div className="space-y-2 pt-1 border-t border-white/5">
              {[
                {
                  label: "Trend Strength",
                  value: trendStrength,
                  color:
                    trendStrength === "Strong"
                      ? "text-emerald-400"
                      : trendStrength === "Moderate"
                      ? "text-amber-400"
                      : "text-zinc-400",
                },
                {
                  label: "Momentum Score",
                  value: `${momentumScore} / 10`,
                  color: "text-blue-400",
                },
                {
                  label: "Volatility Risk",
                  value: volatilityRisk,
                  color:
                    volatilityRisk === "High"
                      ? "text-red-400"
                      : volatilityRisk === "Medium"
                      ? "text-amber-400"
                      : "text-emerald-400",
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">{label}</span>
                  <span className={`font-semibold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Scenario probabilities + Heatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 3. Scenario Probability — sub-breakdown of direction totals above */}
        <Card className="glass-panel border-white/10 bg-zinc-900/50">
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <PanelSectionTitle
              icon={Activity}
              iconClassName="text-indigo-400"
              horizonLabel={horizonDisplay}
            >
              Next Move Scenarios
            </PanelSectionTitle>
            <CardInfoTooltip text={HELP.nextMoveScenarios} className="text-zinc-500" />
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Note: Upward scenarios sum to total upward %; Downward = total downward % */}
            <p className="text-[10px] text-zinc-600 -mt-1 mb-1">
              ↑ Upward scenarios split from total {upPct}% · ↓ Downward = {downPct}%
            </p>
            {[
              {
                label: "Strong Upward Move",
                pct: Math.round(upPct * 0.62),
                color: "bg-emerald-500",
                indent: false,
              },
              {
                label: "Moderate Uptrend",
                pct: Math.round(upPct * 0.38),
                color: "bg-emerald-700",
                indent: true,
              },
              {
                label: "Sideways Range",
                pct: sidewaysPct,
                color: "bg-zinc-500",
                indent: false,
              },
              {
                label: "Downward Move",
                pct: downPct,
                color: "bg-red-500",
                indent: false,
              },
            ].map(({ label, pct, color, indent }) => (
              <div key={label} className={`space-y-1 ${indent ? "ml-3" : ""}`}>
                <div className="flex justify-between text-xs">
                  <span className={`${indent ? "text-zinc-500" : "text-zinc-300"}`}>
                    {indent ? "└ " : ""}{label}
                  </span>
                  <span className="font-semibold text-white">{pct}%</span>
                </div>
                <PctBar value={pct} color={color} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 4. Heat Map — Bullish / Neutral / Bearish */}
        <Card className="glass-panel border-white/10 bg-zinc-900/50">
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <PanelSectionTitle
              icon={Flame}
              iconClassName="text-orange-400"
              horizonLabel={horizonDisplay}
            >
              Market Pressure Map
            </PanelSectionTitle>
            <CardInfoTooltip text={HELP.pressureMap} className="text-zinc-500" />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Visual gradient heat strip */}
            <div className="relative h-5 rounded-full overflow-hidden">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `linear-gradient(to right, #ef4444, #6b7280, #10b981)`,
                }}
              />
              {/* Net directional bias: bearish ← → bullish (not raw up% alone) */}
              <div
                className="absolute top-0 h-full w-1 bg-white rounded-full shadow-lg"
                style={{
                  left: `${clamp(50 + (upPct - downPct) / 2)}%`,
                  transform: "translateX(-50%)",
                  transition: "left 0.7s ease",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 -mt-2">
              <span>Bearish</span>
              <span>Neutral</span>
              <span>Bullish</span>
            </div>

            <div className="space-y-2 pt-2">
              {[
                {
                  label: "🟢 Bullish Pressure",
                  pct: upPct,
                  bar: "bg-gradient-to-r from-emerald-700 to-emerald-400",
                },
                {
                  label: "⬜ Neutral Zone",
                  pct: sidewaysPct,
                  bar: "bg-zinc-600",
                },
                {
                  label: "🔴 Bearish Pressure",
                  pct: downPct,
                  bar: "bg-gradient-to-r from-red-700 to-red-400",
                },
              ].map(({ label, pct, bar }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">{label}</span>
                    <span className="font-semibold text-white">{pct}%</span>
                  </div>
                  <PctBar value={pct} color={bar} height="h-2.5" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Price targets + Timeline + Buyer/Seller */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4">

        {/* 5. Price Target Probability */}
        <Card className="glass-panel border-white/10 bg-zinc-900/50">
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <PanelSectionTitle
              icon={Target}
              iconClassName="text-amber-400"
              horizonLabel={horizonDisplay}
            >
              Price Level Probabilities
            </PanelSectionTitle>
            <CardInfoTooltip text={HELP.priceLevels} className="text-zinc-500" />
          </CardHeader>
          <CardContent className="space-y-3">
            {priceTargets.length > 0 ? (
              priceTargets.map(({ price, probability, tag }, idx) => (
                <div
                  key={`${tag}-${price}-${idx}`}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        tag === "res"
                          ? "border-red-500/40 text-red-400"
                          : "border-emerald-500/40 text-emerald-400"
                      }`}
                    >
                      {tag === "res" ? "R" : "S"}
                    </Badge>
                    <span className="font-mono text-white">{formatPanelPrice(price)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${tag === "res" ? "bg-red-400" : "bg-emerald-400"}`}
                        style={{ width: `${probability}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-zinc-300 w-8 text-right">
                      {probability}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Resistance zone", pct: upPct, tag: "res" as const },
                  { label: "Current price", pct: 100, tag: "cur" as const },
                  { label: "Support zone", pct: downPct, tag: "sup" as const },
                ].map(({ label, pct }) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-zinc-400">{label}</span>
                    <span className="font-semibold text-white">{pct}% reach probability</span>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-zinc-500 space-y-2 border-t border-white/10 pt-3 mt-1 leading-relaxed">
              {analysedAt && (
                <p>
                  <span className="font-semibold text-zinc-400">Snapshot: </span>
                  {analysedAt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  . Levels use prices and structure known at this time.
                </p>
              )}
              <p className="whitespace-pre-line">{HELP.priceLevelsCardGuide}</p>
            </div>
          </CardContent>
        </Card>

        {/* 6. Probability Timeline */}
        <Card className="glass-panel border-white/10 bg-zinc-900/50">
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <PanelSectionTitle
              icon={Clock}
              iconClassName="text-sky-400"
              horizonLabel={horizonDisplay}
            >
              Probability Timeline
            </PanelSectionTitle>
            <CardInfoTooltip text={HELP.probTimeline} className="text-zinc-500" />
          </CardHeader>
          <CardContent className="space-y-3">
            {timeline.length > 0 ? (
              timeline.map(({ horizon, upPct: u, direction }, idx) => (
                <div
                  key={`${horizon}-${idx}-${direction}`}
                  className="flex items-center gap-3"
                >
                  <span className="text-xs font-mono text-zinc-400 w-14 flex-shrink-0">
                    {horizon}
                  </span>
                  <PctBar
                    value={u}
                    color={
                      direction === "up"
                        ? "bg-emerald-500"
                        : direction === "down"
                        ? "bg-red-500"
                        : "bg-zinc-500"
                    }
                  />
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {direction === "up" ? (
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                    ) : direction === "down" ? (
                      <TrendingDown className="h-3 w-3 text-red-400" />
                    ) : null}
                    <span className="text-xs font-bold text-white w-8">{u}%</span>
                  </div>
                </div>
              ))
            ) : (
              [
                { horizon: "15 min", upPct: Math.max(35, upPct - 5) },
                { horizon: "1 hour", upPct },
                { horizon: "4 hours", upPct: Math.min(85, upPct + 4) },
              ].map(({ horizon, upPct: u }) => (
                <div key={horizon} className="flex items-center gap-3">
                  <span className="text-xs font-mono text-zinc-400 w-14 flex-shrink-0">
                    {horizon}
                  </span>
                  <PctBar
                    value={u}
                    color={u >= 50 ? "bg-emerald-500" : "bg-red-500"}
                  />
                  <span className="text-xs font-bold text-white w-8 flex-shrink-0">
                    {u}%
                  </span>
                </div>
              ))
            )}
            <div className="text-[10px] text-zinc-500 space-y-2 border-t border-white/10 pt-3 mt-1 leading-relaxed">
              {analysedAt && (
                <p>
                  <span className="font-semibold text-zinc-400">Snapshot: </span>
                  {analysedAt.toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  .
                </p>
              )}
              <p className="whitespace-pre-line">{HELP.probTimelineCardGuide}</p>
            </div>
          </CardContent>
        </Card>

        {/* 7. Market Pressure Meter (Buyer vs Seller) */}
        <Card className="glass-panel border-white/10 bg-zinc-900/50">
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <PanelSectionTitle
              icon={Activity}
              iconClassName="text-violet-400"
              horizonLabel={horizonDisplay}
            >
              Market Pressure Meter
            </PanelSectionTitle>
            <CardInfoTooltip text={HELP.pressureMeter} className="text-zinc-500" />
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Split bar */}
            <div className="relative h-7 rounded-full overflow-hidden flex">
              <div
                className="bg-gradient-to-r from-emerald-600 to-emerald-400 flex items-center justify-center transition-all duration-700"
                style={{ width: `${buyerPressure}%` }}
              >
                {buyerPressure > 25 && (
                  <span className="text-[10px] font-bold text-white">
                    {buyerPressure}%
                  </span>
                )}
              </div>
              <div
                className="bg-gradient-to-r from-red-600 to-red-400 flex items-center justify-center transition-all duration-700"
                style={{ width: `${sellerPressure}%` }}
              >
                {sellerPressure > 25 && (
                  <span className="text-[10px] font-bold text-white">
                    {sellerPressure}%
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 -mt-2">
              <span>🟢 Buyer Pressure</span>
              <span>🔴 Seller Pressure</span>
            </div>

            <div className="space-y-2 pt-1">
              {[
                {
                  label: "Buyer Pressure",
                  pct: buyerPressure,
                  color: "text-emerald-400",
                  bar: "bg-emerald-500",
                },
                {
                  label: "Seller Pressure",
                  pct: sellerPressure,
                  color: "text-red-400",
                  bar: "bg-red-500",
                },
              ].map(({ label, pct, color, bar }) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">{label}</span>
                    <span className={`font-bold ${color}`}>{pct}%</span>
                  </div>
                  <PctBar value={pct} color={bar} />
                </div>
              ))}
            </div>

            {/* Bias note: explicit BUY/SELL only when meter pegs ~100% */}
            <div className="text-[11px] leading-relaxed border-t border-white/5 pt-2 space-y-2">
              {buyerPressure >= 99 ? (
                <div className="space-y-1">
                  <p className="text-emerald-400 font-semibold tracking-wide">BUY</p>
                  <p className="text-zinc-300">
                    Meter is pegged buyer side ({buyerPressure}% buyer vs {sellerPressure}% seller). Every blended input
                    in this widget (direction odds, momentum nudge, volume tilt, action bias) is stacked long. That is the
                    strongest reading here. It is still not a profit guarantee: keep your own stops, leverage, and headline
                    risk in mind.
                  </p>
                </div>
              ) : sellerPressure >= 99 ? (
                <div className="space-y-1">
                  <p className="text-red-400 font-semibold tracking-wide">SELL</p>
                  <p className="text-zinc-300">
                    Meter is pegged seller side ({sellerPressure}% seller vs {buyerPressure}% buyer). The same blend is
                    stacked short. Treat it as strong pressure in the model, not a guaranteed outcome.
                  </p>
                </div>
              ) : Math.abs(buyerPressure - 50) <= 5 ? (
                <p className="text-amber-500 font-medium">
                  Market is evenly contested: no dominant pressure in this blend. Wait for volume confirmation or a clean
                  break before leaning hard either way.
                </p>
              ) : buyerPressure > 50 ? (
                <p className="text-emerald-500">
                  Buyer pressure leads ({buyerPressure}% vs {sellerPressure}%). Momentum in this panel favours upside, but
                  the meter is not pegged max, so we do not label BUY here.
                </p>
              ) : (
                <p className="text-red-500">
                  Seller pressure leads ({sellerPressure}% vs {buyerPressure}%). Downside lean in this blend, but the meter
                  is not pegged max, so we do not label SELL here.
                </p>
              )}
              {geminiForecast.positioning_guidance?.notes?.trim() ? (
                <p className="text-zinc-500 pt-1 border-t border-white/5">
                  {geminiForecast.positioning_guidance.notes.trim()}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Volume Intelligence Strip */}
      {volumeData && (volumeData.volume24h || volumeData.volumeProfile) && (
        <Card className="glass-panel border-white/10 bg-zinc-900/50">
          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0 gap-2">
            <PanelSectionTitle
              icon={Activity}
              iconClassName="text-cyan-400"
              horizonLabel={horizonDisplay}
            >
              Volume Intelligence
            </PanelSectionTitle>
            <CardInfoTooltip text={HELP.volumeIntel} className="text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {volumeData.volume24h != null && (
                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">24h Volume</p>
                  <p className="text-base font-bold text-cyan-300">{fmtVolume(volumeData.volume24h)}</p>
                </div>
              )}
              {volumeData.avgVolume != null && volumeData.avgVolume > 0 && (
                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Avg Volume</p>
                  <p className="text-base font-bold text-zinc-200">{fmtVolume(volumeData.avgVolume)}</p>
                </div>
              )}
              {volumeData.volumeProfile && (
                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Volume Profile</p>
                  <p className={`text-base font-bold capitalize ${
                    volumeData.volumeProfile === "high" ? "text-emerald-400" :
                    volumeData.volumeProfile === "low" ? "text-zinc-500" : "text-amber-400"
                  }`}>
                    {volumeData.volumeProfile === "high" ? "⬆ High Activity" :
                     volumeData.volumeProfile === "low" ? "⬇ Low Activity" : "↔ Normal"}
                  </p>
                </div>
              )}
              {volumeData.volumeConfirmation != null && (
                <div className="bg-white/[0.03] rounded-lg p-3 border border-white/5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Vol Confirms Move</p>
                  <p className={`text-base font-bold ${
                    volumeData.volumeConfirmation > 0.5 ? "text-emerald-400" :
                    volumeData.volumeConfirmation < 0 ? "text-red-400" : "text-zinc-400"
                  }`}>
                    {volumeData.volumeConfirmation > 0.5 ? "✓ Confirms" :
                     volumeData.volumeConfirmation < 0 ? "✗ Weak" : "~ Neutral"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
