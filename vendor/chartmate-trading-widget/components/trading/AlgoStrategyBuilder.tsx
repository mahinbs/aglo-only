/**
 * AlgoStrategyBuilder — full-page multi-step algo strategy wizard.
 * Mirrors the Algorooms / Streak style of strategy creation:
 *  Step 1  Foundation    — name, strategy type, instrument, F&O metadata, order type, direction (symbol & qty at live deploy only)
 *  Step 2  Timing        — session hours, execution days, chart interval & type
 *  Step 3  Entry         — visual condition builder OR time-based entry OR raw expression
 *  Step 4  Exit          — TP%, SL%, trailing stop, indicator / time-based exit rules
 *  Step 5  Position      — order placement type, sizing, limit offset, scaling
 *  Step 6  Risk          — max risk/trade, max daily loss, max positions
 */

import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  AlgoCondition,
  AlgoGuideParams,
  AlgoGuidePresetId,
  ChartConfig,
  ConditionGroup,
  ConditionOp,
  EntryConditions,
  ExitConditions,
  IndicatorId,
  PositionConfig,
  RiskConfig,
} from "@/lib/algoStrategyTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

type BuilderStrategy = {
  id: string;
  name: string;
  description?: string | null;
  /** When true, strategy is live (active) — edits are blocked in UI and API. */
  is_active?: boolean;
  trading_mode: string;
  is_intraday: boolean;
  start_time: string;
  end_time: string;
  squareoff_time: string;
  risk_per_trade_pct: number;
  stop_loss_pct: number | null;
  take_profit_pct: number | null;
  symbols: string[];
  paper_strategy_type?: string | null;
  market_type?: string | null;
  entry_conditions?: EntryConditions | null;
  exit_conditions?: ExitConditions | null;
  position_config?: PositionConfig | null;
  risk_config?: RiskConfig | null;
  chart_config?: ChartConfig | null;
  execution_days?: number[] | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: BuilderStrategy | null;
  onSaved: () => void;
};

type StrategyType  = "indicator_based" | "time_based" | "hybrid";
type InstrumentType = "equity" | "futures" | "options" | "indices";
type OrderProduct  = "MIS" | "CNC" | "BTST" | "NRML";
type Direction     = "LONG" | "SHORT" | "BOTH";
type ExpiryType    = "weekly" | "monthly";
type StrikeType    = "ATM" | "ITM_1" | "ITM_2" | "OTM_1" | "OTM_2";

const GLOBAL_STOCK_EXCHANGES = [
  { id: "LSE", label: "LSE (London)" },
  { id: "LON", label: "LSE / LON" },
  { id: "NYSE", label: "NYSE" },
  { id: "NASDAQ", label: "NASDAQ" },
  { id: "AMEX", label: "NYSE American" },
  { id: "ARCA", label: "NYSE Arca" },
  { id: "NSE", label: "NSE (India)" },
  { id: "BSE", label: "BSE (India)" },
] as const;

type BuilderForm = {
  // Step 1
  name: string;
  description: string;
  strategyType: StrategyType;
  instrumentType: InstrumentType;
  /** Single-exchange deploy default; when globalMarketsMode, first allowed exchange is used until deploy */
  exchange: string;
  orderProduct: OrderProduct;
  /** London / New York multi-exchange + session venues (one place with preset SMC) */
  globalMarketsMode: boolean;
  allowedExchanges: string[];
  sessionVenues: ("london" | "new_york")[];
  direction: Direction;
  // Step 2
  symbol: string;
  lotSize: number;
  expiryType: ExpiryType;
  strikeType: StrikeType;
  // Step 3
  startTime: string;
  endTime: string;
  squareoffTime: string;
  executionDays: number[];
  chartInterval: ChartConfig["interval"];
  chartType: ChartConfig["chartType"];
  // Step 4
  entryConditions: EntryConditions;
  entryTime: string;   // time_based + hybrid — clock entry (HH:MM)
  // Step 5
  exitClockTime: string; // wall-clock exit for time-based / hybrid (HH:MM)
  clockExitEnabled: boolean;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStop: boolean;
  trailingStopPct: number;
  timeBasedExit: boolean;
  exitAfterMinutes: number;
  useExitIndicators: boolean;
  exitIndicatorGroups: ConditionGroup[];
  // Step 6
  orderType: PositionConfig["orderType"];
  sizingMode: PositionConfig["sizingMode"];
  capitalPct: number;
  limitOffsetPct: number;
  // Step 7
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenPositions: number;
  capitalAllocationPct: number;
  /** When false, no automated exits — you flatten manually; SL/TP/time exits are not used in live scans. */
  autoExitEnabled: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { idx: 0, title: "Foundation",   sub: "Name, type, market & direction" },
  { idx: 1, title: "Timing",       sub: "Session hours & chart" },
  { idx: 2, title: "Entry",        sub: "When to enter a trade" },
  { idx: 3, title: "Exit",         sub: "All exit rules optional" },
  { idx: 4, title: "Position",     sub: "Order type & sizing" },
  { idx: 5, title: "Risk Rules",   sub: "Limits & capital" },
];

const DAY_LABELS: Array<{ v: number; l: string }> = [
  { v: 1, l: "Mon" }, { v: 2, l: "Tue" }, { v: 3, l: "Wed" },
  { v: 4, l: "Thu" }, { v: 5, l: "Fri" }, { v: 6, l: "Sat" }, { v: 0, l: "Sun" },
];

const INDICATORS: IndicatorId[] = [
  "RSI", "MACD", "MACD_SIGNAL", "MACD_HIST",
  "EMA", "SMA", "BB_UPPER", "BB_MIDDLE", "BB_LOWER",
  "PRICE", "CHANGE_PCT", "VOLUME",
];

const OPS: Array<{ v: ConditionOp; l: string }> = [
  { v: "less_than",           l: "<" },
  { v: "greater_than",        l: ">" },
  { v: "equals",              l: "=" },
  { v: "less_than_or_equal",  l: "≤" },
  { v: "greater_than_or_equal", l: "≥" },
  { v: "crosses_above",       l: "crosses above" },
  { v: "crosses_below",       l: "crosses below" },
];

function makeCond(): AlgoCondition {
  return { id: crypto.randomUUID(), indicator: "EMA", period: 50, op: "crosses_above", rhs: { kind: "indicator", id: "EMA", period: 200 } };
}
function makeGroup(): ConditionGroup {
  return { id: crypto.randomUUID(), logic: "AND", conditions: [makeCond()] };
}

/** IST minute-of-day ↔ `<input type="time" />` (engine uses minutes from midnight IST). */
function istMinutesToTimeInput(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24;
  const mi = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

function timeInputToIstMinutes(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || mi > 59 || h > 23) return null;
  return h * 60 + mi;
}

/** Shown on Entry step when `entry_conditions.algoGuidePreset` is set (ORB, VWAP, etc.). */
const ALGO_GUIDE_PRESET_ENTRY_COPY: Record<
  AlgoGuidePresetId,
  { title: string; bullets: string[] }
> = {
  ema_crossover: {
    title: "EMA trend crossover (Strategy Guide #1)",
    bullets: [
      "Fast EMA crosses slow EMA with RSI band, volume vs average, and price vs higher timeframe EMA — all tunable below.",
      "Use a 15m chart on the Timing step for guide fidelity. Live engine runs this preset (not generic visual rows).",
    ],
  },
  orb: {
    title: "Opening Range Breakout (ORB)",
    bullets: [
      "Builds the opening range from the first 15 minutes of the session (e.g. 9:15–9:30 IST), then watches for a breakout with range width between 0.2% and 1% of mid.",
      "After the range forms, a close beyond the range high or low triggers entry (direction follows the breakout). Use a 5m chart interval to match the strategy guide.",
      "This is not an EMA crossover strategy — entry is computed by the ORB engine on your candle data.",
    ],
  },
  vwap_bounce: {
    title: "VWAP bounce",
    bullets: [
      "Uses session VWAP from typical price × volume on your chart bars, with a touch / bounce heuristic and volume versus a short average (see Algo Guide).",
      "Entry is evaluated by the VWAP preset logic, not by generic EMA cross conditions.",
      "A 5m interval is typical; session hours on the Timing step should cover the cash session you trade.",
    ],
  },
  supertrend_7_3: {
    title: "Supertrend (7, ATR mult 3)",
    bullets: [
      "Uses Supertrend(7, 3) trend flips on live candles (dual timeframe in the engine: 5m + 15m confirmation).",
      "Entry fires on qualifying flip signals inside your configured session window — not from manual EMA rows here.",
    ],
  },
  rsi_divergence: {
    title: "RSI divergence reversal",
    bullets: [
      "Looks for simplified pivot-based RSI divergence with MACD histogram confirmation on your symbol’s bars (often 1h).",
      "Entry is driven by the divergence detector, not the visual builder when this preset is active.",
    ],
  },
  liquidity_sweep_bos: {
    title: "Liquidity sweep + break of structure (BOS)",
    bullets: [
      "Marks liquidity from equal highs/lows and swing points; waits for a sweep (price beyond those levels) then a BOS in the trade direction.",
      "Entry on BOS confirmation; SL beyond the sweep; TP toward the next opposing liquidity zone — aligned with smart-money style flow.",
      "Tune lookback, swing width, equal-zone tolerance, and ATR period below; live + paper use the same engine path.",
    ],
  },
  smc_mtf_confluence: {
    title: "SMC multi-timeframe confluence (SMC Strategy.pdf)",
    bullets: [
      "4H→15M→1M stack: HTF bias, 15m zones/FVG, 1m liquidity sweep + ChoCH + mitigation, with London/NY session gate (optional off for NSE testing).",
    ],
  },
};

function AlgoGuidePresetEntryPanel({
  presetId,
  entryConditions,
  onUpdate,
  onSwitchToCustom,
}: {
  presetId: AlgoGuidePresetId;
  entryConditions: EntryConditions;
  onUpdate: (next: EntryConditions) => void;
  onSwitchToCustom: () => void;
}) {
  const [replaceAck, setReplaceAck] = useState(false);
  const p: AlgoGuideParams = entryConditions.algoGuideParams ?? {};
  const copy = ALGO_GUIDE_PRESET_ENTRY_COPY[presetId];

  const patchParams = (partial: Partial<AlgoGuideParams>) => {
    onUpdate({
      ...entryConditions,
      algoGuideParams: { ...p, ...partial },
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-sky-300/95">Algo Guide preset</p>
      <p className="text-sm font-semibold text-zinc-100">{copy.title}</p>
      <ul className="list-disc space-y-2 pl-4 text-xs text-zinc-300 leading-relaxed">
        {copy.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>

      {presetId === "orb" && (
        <>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-t border-sky-500/20 pt-3">
            Edit ORB parameters
          </p>
          <p className="text-[11px] text-zinc-500">
            Times are <strong className="text-zinc-400">IST</strong>, minute-of-day. Use 5m chart on the Timing step. Live engine reads{" "}
            <code className="text-zinc-400">algoGuideParams</code>.
          </p>
          <Row>
            <Field label="Range start" hint="First bar included (e.g. 09:15)">
              <Input
                type="time"
                className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-[140px]"
                value={istMinutesToTimeInput(p.orbOpenStartMin ?? 555)}
                onChange={(e) => {
                  const mm = timeInputToIstMinutes(e.target.value);
                  if (mm != null) patchParams({ orbOpenStartMin: mm });
                }}
              />
            </Field>
            <Field label="Range end" hint="Exclusive — breakouts after this time">
              <Input
                type="time"
                className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-[140px]"
                value={istMinutesToTimeInput(p.orbOpenEndMin ?? 570)}
                onChange={(e) => {
                  const mm = timeInputToIstMinutes(e.target.value);
                  if (mm != null) patchParams({ orbOpenEndMin: mm });
                }}
              />
            </Field>
            <Field label="Min range %" hint="% of mid price (width filter)">
              <Input
                type="number"
                step={0.05}
                min={0.05}
                max={2}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={100 * (p.orbMinRangePct ?? 0.002)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v)) return;
                  patchParams({ orbMinRangePct: v / 100 });
                }}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Max range %" hint="% of mid price">
              <Input
                type="number"
                step={0.05}
                min={0.1}
                max={5}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={100 * (p.orbMaxRangePct ?? 0.01)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v)) return;
                  patchParams({ orbMaxRangePct: v / 100 });
                }}
              />
            </Field>
            <Field label="TP × range" hint="Take-profit distance in range heights">
              <Input
                type="number"
                step={0.1}
                min={0.5}
                max={4}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={p.orbTpRangeMult ?? 1.5}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v)) return;
                  patchParams({ orbTpRangeMult: v });
                }}
              />
            </Field>
          </Row>
          <Row>
            <Field label="VIX max" hint="India VIX (live gate)">
              <Input
                type="number"
                step={0.5}
                min={8}
                max={40}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={p.orbVixMax ?? 22}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v)) return;
                  patchParams({ orbVixMax: v });
                }}
              />
            </Field>
            <Field label="Macro block (min)" hint="Skip entries this many min before high-impact IN/US event">
              <Input
                type="number"
                step={5}
                min={5}
                max={120}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={p.orbMacroBlockWindowMin ?? 30}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isFinite(v)) return;
                  patchParams({ orbMacroBlockWindowMin: v });
                }}
              />
            </Field>
          </Row>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch
                checked={p.orbRequireFiiNetBuying !== false}
                onCheckedChange={(v) => patchParams({ orbRequireFiiNetBuying: Boolean(v) })}
              />
              <span className="text-sm text-zinc-300">Require FII net buying (NSE daily)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch
                checked={p.orbBlockMacroEvents !== false}
                onCheckedChange={(v) => patchParams({ orbBlockMacroEvents: Boolean(v) })}
              />
              <span className="text-sm text-zinc-300">Block before high-impact macro events</span>
            </label>
          </div>
        </>
      )}

      {presetId === "vwap_bounce" && (
        <>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-t border-sky-500/20 pt-3">
            Edit VWAP bounce parameters
          </p>
          <p className="text-[11px] text-zinc-500">
            Live engine reads <code className="text-zinc-400">algoGuideParams</code>. Rejection/touch heuristics stay guide-style; you tune tests, time cut-off, volume lookback, and SL distance.
          </p>
          <Row>
            <Field label="Max VWAP tests / day" hint="After this many crosses, no entry">
              <Input
                type="number"
                step={1}
                min={1}
                max={5}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={p.vwapMaxTestsPerDay ?? 2}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isFinite(v)) return;
                  patchParams({ vwapMaxTestsPerDay: v });
                }}
              />
            </Field>
            <Field label="No entry after (IST)" hint="Last bar minute allowed">
              <Input
                type="time"
                className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-[140px]"
                value={istMinutesToTimeInput(p.vwapLastEntryBeforeMin ?? 870)}
                onChange={(e) => {
                  const mm = timeInputToIstMinutes(e.target.value);
                  if (mm != null) patchParams({ vwapLastEntryBeforeMin: mm });
                }}
              />
            </Field>
            <Field label="Volume lookback" hint="Bars for average volume on touch bar">
              <Input
                type="number"
                step={1}
                min={2}
                max={60}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={p.vwapVolLookback ?? 10}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isFinite(v)) return;
                  patchParams({ vwapVolLookback: v });
                }}
              />
            </Field>
          </Row>
          <Row>
            <Field label="SL distance from VWAP" hint="Percent (0.5 = half percent)">
              <Input
                type="number"
                step={0.05}
                min={0.1}
                max={2}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={100 * (p.vwapSlPctFromVwap ?? 0.005)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v)) return;
                  patchParams({ vwapSlPctFromVwap: v / 100 });
                }}
              />
            </Field>
            <Field label="VIX min" hint="India VIX (live gate)">
              <Input
                type="number"
                step={0.5}
                min={5}
                max={30}
                className="h-10 bg-zinc-900 border-zinc-700 text-sm"
                value={p.vwapVixMin ?? 11}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v)) return;
                  patchParams({ vwapVixMin: v });
                }}
              />
            </Field>
          </Row>
        </>
      )}

      {presetId === "ema_crossover" && (
        <>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-t border-sky-500/20 pt-3">
            Edit EMA crossover parameters
          </p>
          <Row>
            <Field label="Fast EMA period" hint="Default 20"><Input type="number" min={2} max={100} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaFastPeriod ?? 20} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ emaFastPeriod: v }); }} /></Field>
            <Field label="Slow EMA period" hint="Default 50"><Input type="number" min={2} max={200} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaSlowPeriod ?? 50} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ emaSlowPeriod: v }); }} /></Field>
            <Field label="Trend EMA period" hint="200 EMA filter"><Input type="number" min={20} max={300} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaTrendPeriod ?? 200} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ emaTrendPeriod: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="RSI period"><Input type="number" min={2} max={30} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaRsiPeriod ?? 14} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ emaRsiPeriod: v }); }} /></Field>
            <Field label="Long RSI min"><Input type="number" step={1} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaRsiLongMin ?? 50} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaRsiLongMin: v }); }} /></Field>
            <Field label="Long RSI max"><Input type="number" step={1} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaRsiLongMax ?? 75} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaRsiLongMax: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="Short RSI min"><Input type="number" step={1} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaRsiShortMin ?? 25} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaRsiShortMin: v }); }} /></Field>
            <Field label="Short RSI max"><Input type="number" step={1} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaRsiShortMax ?? 50} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaRsiShortMax: v }); }} /></Field>
            <Field label="Volume multiple" hint="vs avg"><Input type="number" step={0.1} min={0.5} max={5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaVolMult ?? 1.5} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaVolMult: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="Volume lookback"><Input type="number" min={2} max={100} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaVolLookback ?? 20} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ emaVolLookback: v }); }} /></Field>
            <Field label="Trade window start (IST)"><Input type="time" className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-[140px]" value={istMinutesToTimeInput(p.emaTradeStartMin ?? 570)} onChange={(e) => { const mm = timeInputToIstMinutes(e.target.value); if (mm != null) patchParams({ emaTradeStartMin: mm }); }} /></Field>
            <Field label="Trade window end (IST)"><Input type="time" className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-[140px]" value={istMinutesToTimeInput(p.emaTradeEndMin ?? 840)} onChange={(e) => { const mm = timeInputToIstMinutes(e.target.value); if (mm != null) patchParams({ emaTradeEndMin: mm }); }} /></Field>
          </Row>
          <Row>
            <Field label="TP risk:reward" hint="× SL distance"><Input type="number" step={0.1} min={0.5} max={6} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaTpRiskReward ?? 2.5} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaTpRiskReward: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="VIX min" hint="India VIX (live gate)">
              <Input type="number" step={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaVixMin ?? 12} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaVixMin: v }); }} />
            </Field>
            <Field label="VIX max">
              <Input type="number" step={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaVixMax ?? 25} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaVixMax: v }); }} />
            </Field>
          </Row>
        </>
      )}

      {presetId === "supertrend_7_3" && (
        <>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-t border-sky-500/20 pt-3">Edit Supertrend parameters</p>
          <Row>
            <Field label="ATR period"><Input type="number" min={2} max={30} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.stPeriod ?? 7} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ stPeriod: v }); }} /></Field>
            <Field label="ATR multiplier"><Input type="number" step={0.1} min={0.5} max={10} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.stMult ?? 3} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ stMult: v }); }} /></Field>
            <Field label="Session start (IST)"><Input type="time" className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-[140px]" value={istMinutesToTimeInput(p.stSessionStartMin ?? 570)} onChange={(e) => { const mm = timeInputToIstMinutes(e.target.value); if (mm != null) patchParams({ stSessionStartMin: mm }); }} /></Field>
          </Row>
          <Row>
            <Field label="Session end (IST)"><Input type="time" className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-[140px]" value={istMinutesToTimeInput(p.stSessionEndMin ?? 750)} onChange={(e) => { const mm = timeInputToIstMinutes(e.target.value); if (mm != null) patchParams({ stSessionEndMin: mm }); }} /></Field>
            <Field label="Min ATR filter" hint="% of price (skip chop)"><Input type="number" step={0.01} min={0} max={1} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={100 * (p.stAtrFilterPct ?? 0.001)} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ stAtrFilterPct: v / 100 }); }} /></Field>
            <Field label="TP (× ATR)"><Input type="number" step={0.1} min={0.5} max={8} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.stTpAtrMult ?? 3} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ stTpAtrMult: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="VIX min" hint="India VIX (live gate)">
              <Input type="number" step={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.stVixMin ?? 12} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ stVixMin: v }); }} />
            </Field>
            <Field label="VIX max">
              <Input type="number" step={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.stVixMax ?? 25} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ stVixMax: v }); }} />
            </Field>
          </Row>
        </>
      )}

      {presetId === "rsi_divergence" && (
        <>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-t border-sky-500/20 pt-3">Edit RSI divergence parameters</p>
          <Row>
            <Field label="RSI period"><Input type="number" min={2} max={30} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.rsiDivPeriod ?? 14} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ rsiDivPeriod: v }); }} /></Field>
            <Field label="Pivot width"><Input type="number" min={2} max={12} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.rsiDivPivotWidth ?? 5} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ rsiDivPivotWidth: v }); }} /></Field>
            <Field label="Min pivot span (bars)"><Input type="number" min={2} max={40} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.rsiDivMinSpan ?? 5} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ rsiDivMinSpan: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="Max pivot span"><Input type="number" min={10} max={120} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.rsiDivMaxSpan ?? 60} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ rsiDivMaxSpan: v }); }} /></Field>
            <Field label="Confirm within (bars)"><Input type="number" min={2} max={20} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.rsiDivConfirmBars ?? 6} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ rsiDivConfirmBars: v }); }} /></Field>
            <Field label="TP2 × risk"><Input type="number" step={0.1} min={1} max={8} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.rsiDivTp2Mult ?? 3} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ rsiDivTp2Mult: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="VIX min" hint="India VIX (live gate)">
              <Input type="number" step={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaVixMin ?? 12} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaVixMin: v }); }} />
            </Field>
            <Field label="VIX max">
              <Input type="number" step={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.emaVixMax ?? 25} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ emaVixMax: v }); }} />
            </Field>
          </Row>
        </>
      )}

      {presetId === "liquidity_sweep_bos" && (
        <>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-t border-sky-500/20 pt-3">Edit liquidity sweep + BOS parameters</p>
          <Row>
            <Field label="Lookback bars"><Input type="number" min={30} max={300} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.lqLookback ?? 80} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ lqLookback: v }); }} /></Field>
            <Field label="Swing width"><Input type="number" min={2} max={12} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.lqSwingWidth ?? 4} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ lqSwingWidth: v }); }} /></Field>
            <Field label="Equal zone tol." hint="% of mid"><Input type="number" step={0.01} min={0.05} max={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={100 * (p.lqEqualZonePct ?? 0.0015)} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ lqEqualZonePct: v / 100 }); }} /></Field>
          </Row>
          <Row>
            <Field label="ATR period (SL)"><Input type="number" min={2} max={21} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.lqAtrPeriod ?? 7} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ lqAtrPeriod: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="VIX min" hint="India VIX (live gate)">
              <Input type="number" step={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.lqVixMin ?? 12} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ lqVixMin: v }); }} />
            </Field>
            <Field label="VIX max">
              <Input type="number" step={0.5} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.lqVixMax ?? 30} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ lqVixMax: v }); }} />
            </Field>
          </Row>
        </>
      )}

      {presetId === "smc_mtf_confluence" && (
        <>
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest border-t border-sky-500/20 pt-3">Edit SMC MTF parameters</p>
          <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <Switch checked={Boolean(p.smcDisableSessionGate)} onCheckedChange={(v) => patchParams({ smcDisableSessionGate: Boolean(v) })} />
            <div>
              <p className="text-sm text-zinc-300 font-medium">Disable London/NY session gate</p>
              <p className="text-[11px] text-zinc-500">Use for NSE symbols or paper when you need signals outside UTC windows.</p>
            </div>
          </label>
          <p className="text-[11px] text-zinc-500">Session times are <strong className="text-zinc-400">UTC minutes</strong> from midnight (420 = 07:00).</p>
          <Row>
            <Field label="London start UTC"><Input type="number" min={0} max={1439} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.smcLondonStartUtcMin ?? 420} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ smcLondonStartUtcMin: v }); }} /></Field>
            <Field label="London end UTC"><Input type="number" min={0} max={1439} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.smcLondonEndUtcMin ?? 600} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ smcLondonEndUtcMin: v }); }} /></Field>
            <Field label="NY start UTC"><Input type="number" min={0} max={1439} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.smcNyStartUtcMin ?? 810} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ smcNyStartUtcMin: v }); }} /></Field>
          </Row>
          <Row>
            <Field label="NY end UTC"><Input type="number" min={0} max={1439} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.smcNyEndUtcMin ?? 960} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ smcNyEndUtcMin: v }); }} /></Field>
            <Field label="15m zone body min" hint="× ATR (impulse)"><Input type="number" step={1} min={10} max={100} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={100 * (p.smcDemandBodyAtrRatio ?? 0.4)} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) patchParams({ smcDemandBodyAtrRatio: v / 100 }); }} /></Field>
            <Field label="1m swing width"><Input type="number" min={2} max={8} className="h-10 bg-zinc-900 border-zinc-700 text-sm" value={p.smcSwingWidth1m ?? 3} onChange={(e) => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) patchParams({ smcSwingWidth1m: v }); }} /></Field>
          </Row>
        </>
      )}

      <details
        className="rounded-lg border border-zinc-800 bg-zinc-950/60"
        onToggle={(e) => {
          if (!(e.currentTarget as HTMLDetailsElement).open) setReplaceAck(false);
        }}
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-zinc-500">
          Advanced — replace with generic indicator builder
        </summary>
        <div className="space-y-3 border-t border-zinc-800 px-3 py-3">
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Only if you want <strong className="text-zinc-400">EMA / RSI / MACD</strong> rows instead of this guide preset. That removes ORB/VWAP/Supertrend logic from the live engine for this strategy.
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox
              checked={replaceAck}
              onCheckedChange={(v) => setReplaceAck(Boolean(v))}
              className="mt-0.5 border-zinc-600"
            />
            <span className="text-xs text-zinc-400 leading-snug">
              I understand this replaces the Algo Guide preset with the visual condition builder.
            </span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!replaceAck}
            className="h-8 border-red-500/40 text-xs text-red-300/90 disabled:opacity-40"
            onClick={() => {
              onSwitchToCustom();
              setReplaceAck(false);
            }}
          >
            Replace with custom builder
          </Button>
        </div>
      </details>
    </div>
  );
}

/** Parse TIME_IS(HH:MM) from saved raw expression → value suitable for <input type="time" /> */
function parseTimeFromSavedRaw(raw: string | undefined): string | null {
  const m = /TIME_IS\s*\(\s*(\d{1,2}):(\d{2})\s*\)/i.exec(String(raw ?? ""));
  if (!m) return null;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2].padStart(2, "0")}`;
}

/** Maps builder mode to `paper_strategy_type` for backtests / fallbacks */
function mapPaperStrategyType(st: StrategyType, orderProduct: OrderProduct): string {
  if (st === "time_based") return "time_scheduled";
  if (st === "hybrid") return "trend_following";
  if (orderProduct === "MIS" || orderProduct === "BTST") return "momentum";
  if (orderProduct === "NRML") return "swing_trading";
  return "trend_following";
}

const DEFAULT_FORM: BuilderForm = {
  name: "",
  description: "",
  strategyType: "indicator_based",
  instrumentType: "equity",
  exchange: "NSE",
  orderProduct: "MIS",
  direction: "LONG",
  globalMarketsMode: false,
  allowedExchanges: ["LSE", "NYSE", "NASDAQ"],
  sessionVenues: ["london", "new_york"],
  symbol: "",
  lotSize: 0,
  expiryType: "weekly",
  strikeType: "ATM",
  startTime: "09:15",
  endTime: "15:15",
  squareoffTime: "15:15",
  executionDays: [1, 2, 3, 4, 5],
  chartInterval: "5m",
  chartType: "candlestick",
  entryConditions: {
    mode: "visual",
    groupLogic: "AND",
    groups: [makeGroup()],
    rawExpression: "EMA(50) > EMA(200) AND RSI(14) > 50",
  },
  entryTime: "09:20",
  exitClockTime: "13:01",
  clockExitEnabled: false,
  takeProfitPct: 0,
  stopLossPct: 0,
  trailingStop: false,
  trailingStopPct: 1,
  timeBasedExit: false,
  exitAfterMinutes: 180,
  useExitIndicators: false,
  exitIndicatorGroups: [],
  orderType: "MARKET",
  sizingMode: "fixed_qty",
  capitalPct: 10,
  limitOffsetPct: 0.2,
  maxRiskPerTradePct: 1,
  maxDailyLossPct: 3,
  maxOpenPositions: 3,
  capitalAllocationPct: 30,
  autoExitEnabled: true,
};

function fromExisting(e?: BuilderStrategy | null): BuilderForm {
  if (!e) return { ...DEFAULT_FORM, entryConditions: { ...DEFAULT_FORM.entryConditions, groups: [makeGroup()] } };
  const ec = e.entry_conditions ?? DEFAULT_FORM.entryConditions;
  const xc = e.exit_conditions ?? null;
  const pc = e.position_config ?? null;
  const rc = e.risk_config ?? null;
  const cc = e.chart_config ?? null;

  const mtRaw = String(e.market_type ?? "equity");
  const isGlobalEquity = mtRaw === "global_equity";
  const instrumentType: InstrumentType = (
    mtRaw === "global_equity"
      ? "equity"
      : (["equity", "futures", "options", "indices"].includes(mtRaw) ? mtRaw : "equity")
  ) as InstrumentType;
  const algoGuidePreset = (ec as EntryConditions).algoGuidePreset;
  const rcEx = Array.isArray((rc as RiskConfig)?.allowedExchanges) ? (rc as RiskConfig).allowedExchanges as string[] : null;
  const rcVenues = Array.isArray((rc as RiskConfig)?.sessionVenues)
    ? ((rc as RiskConfig).sessionVenues as string[]).filter((v): v is "london" | "new_york" => v === "london" || v === "new_york")
    : null;
  const globalMarketsMode =
    isGlobalEquity ||
    algoGuidePreset === "smc_mtf_confluence" ||
    (rcEx != null && rcEx.length > 0);

  const sub = ec.strategySubtype;
  const strategyType: StrategyType =
    sub === "time_based" || sub === "hybrid" || sub === "indicator_based"
      ? sub
      : /^\s*TIME_IS\s*\(/i.test(String(ec.rawExpression ?? "")) && (!ec.groups || ec.groups.length === 0)
        ? "time_based"
        : "indicator_based";

  const entryTime =
    (ec.clockEntryTime && String(ec.clockEntryTime).trim()) ||
    parseTimeFromSavedRaw(ec.rawExpression) ||
    "09:20";

  const savedClockExit =
    xc && "clockExitTime" in xc && typeof (xc as ExitConditions).clockExitTime === "string"
      ? String((xc as ExitConditions).clockExitTime).trim()
      : "";
  const exitClockTime = savedClockExit || String(e.squareoff_time ?? "15:15");
  const clockExitEnabled = Boolean(savedClockExit);

  const indGroups = Array.isArray(xc?.indicatorGroups) ? xc!.indicatorGroups! : [];
  const useExitIndicators = indGroups.length > 0;

  return {
    name: e.name ?? "",
    description: e.description ?? "",
    strategyType,
    instrumentType,
    exchange: (() => {
      const ex = (pc as PositionConfig)?.exchange ?? "NSE";
      if (globalMarketsMode && rcEx?.length) return rcEx[0];
      return ex;
    })(),
    orderProduct: ((pc as PositionConfig)?.orderProduct as OrderProduct) ?? ((e.is_intraday ? "MIS" : "CNC") as OrderProduct),
    globalMarketsMode,
    allowedExchanges: rcEx?.length ? [...rcEx] : ["LSE", "NYSE", "NASDAQ"],
    sessionVenues: rcVenues?.length ? rcVenues : ["london", "new_york"],
    direction: e.trading_mode as Direction ?? "LONG",
    symbol: (() => {
      if (!Array.isArray(e.symbols) || e.symbols.length === 0) return "";
      const x = e.symbols[0];
      if (typeof x === "string") return x;
      if (x && typeof x === "object" && "symbol" in x) return String((x as { symbol?: string }).symbol ?? "");
      return "";
    })(),
    lotSize: Number((pc as PositionConfig)?.quantity ?? 0),
    expiryType: ((pc as PositionConfig)?.expiryType as ExpiryType) ?? "weekly",
    strikeType: ((pc as PositionConfig)?.strikeType as StrikeType) ?? "ATM",
    startTime: e.start_time ?? "09:15",
    endTime: e.end_time ?? "15:15",
    squareoffTime: e.squareoff_time ?? "15:15",
    executionDays: Array.isArray(e.execution_days) && e.execution_days.length ? e.execution_days : [1,2,3,4,5],
    chartInterval: cc?.interval ?? "5m",
    chartType: cc?.chartType ?? "candlestick",
    entryConditions: (() => {
      const groups: ConditionGroup[] = (() => {
        if (!Array.isArray(ec.groups)) return [makeGroup()];
        if (ec.groups.length > 0) return ec.groups;
        if (algoGuidePreset) return [];
        return [makeGroup()];
      })();
      const base: EntryConditions = {
        mode: ec.mode ?? "visual",
        groupLogic: ec.groupLogic ?? "AND",
        groups,
        rawExpression: ec.rawExpression ?? "",
        strategySubtype: strategyType,
        clockEntryTime: entryTime,
      };
      if (algoGuidePreset) base.algoGuidePreset = algoGuidePreset;
      if ((ec as EntryConditions).algoGuideBlockFirstSessionMinutes === true) {
        base.algoGuideBlockFirstSessionMinutes = true;
      }
      const rawAgp = (ec as EntryConditions).algoGuideParams;
      if (rawAgp && typeof rawAgp === "object" && !Array.isArray(rawAgp)) {
        base.algoGuideParams = { ...(rawAgp as AlgoGuideParams) };
      }
      return base;
    })(),
    entryTime,
    exitClockTime,
    clockExitEnabled,
    takeProfitPct: Number(
      xc?.takeProfitPct !== undefined && xc.takeProfitPct !== null
        ? xc.takeProfitPct
        : (e.take_profit_pct != null ? e.take_profit_pct : 0),
    ),
    stopLossPct: Number(
      xc?.stopLossPct !== undefined && xc.stopLossPct !== null
        ? xc.stopLossPct
        : (e.stop_loss_pct != null ? e.stop_loss_pct : 0),
    ),
    trailingStop: Boolean(xc?.trailingStop ?? false),
    trailingStopPct: Number(xc?.trailingStopPct ?? 1),
    timeBasedExit: Boolean(xc?.timeBasedExit ?? false),
    exitAfterMinutes: Number(xc?.exitAfterMinutes ?? 180),
    useExitIndicators,
    exitIndicatorGroups: useExitIndicators && indGroups.length ? indGroups : [],
    orderType: (pc as PositionConfig)?.orderType ?? "MARKET",
    sizingMode: (pc as PositionConfig)?.sizingMode ?? "fixed_qty",
    capitalPct: Number((pc as PositionConfig)?.capitalPct ?? 10),
    limitOffsetPct: Number((pc as PositionConfig)?.limitOffsetPct ?? 0.2),
    maxRiskPerTradePct: Number((rc as RiskConfig)?.maxRiskPerTradePct ?? e.risk_per_trade_pct ?? 1),
    maxDailyLossPct: Number((rc as RiskConfig)?.maxDailyLossPct ?? 3),
    maxOpenPositions: Number((rc as RiskConfig)?.maxOpenPositions ?? 3),
    capitalAllocationPct: Number((rc as RiskConfig)?.capitalAllocationPct ?? 30),
    autoExitEnabled: !(xc && typeof xc === "object" && (xc as ExitConditions).autoExitEnabled === false),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-zinc-300">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest pt-2 pb-1 border-b border-zinc-800 mb-3">{children}</p>;
}

function ChoiceGroup<T extends string>({
  value, onChange, options, size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ v: T; l: string; sub?: string }>;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ v, l, sub }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-lg border px-3 py-2 text-left transition-all ${
            value === v
              ? "border-sky-500 bg-sky-500/15 text-sky-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          } ${size === "sm" ? "text-xs" : "text-sm"}`}
        >
          <p className="font-semibold leading-tight">{l}</p>
          {sub && <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">{sub}</p>}
        </button>
      ))}
    </div>
  );
}

function ConditionBuilder({
  groups,
  groupLogic,
  onGroups,
  onGroupLogic,
}: {
  groups: ConditionGroup[];
  groupLogic: "AND" | "OR";
  onGroups: (g: ConditionGroup[]) => void;
  onGroupLogic: (v: "AND" | "OR") => void;
}) {
  const updateCond = (gi: number, ci: number, patch: Partial<AlgoCondition>) => {
    const next = groups.map((g, i) => i !== gi ? g : {
      ...g,
      conditions: g.conditions.map((c, j) => j !== ci ? c : { ...c, ...patch }),
    });
    onGroups(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-zinc-400">Match</p>
        <ChoiceGroup
          value={groupLogic} onChange={onGroupLogic}
          size="sm"
          options={[{ v: "AND", l: "ALL groups (AND)" }, { v: "OR", l: "ANY group (OR)" }]}
        />
      </div>

      {groups.map((group, gi) => (
        <div key={group.id} className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <p className="text-xs text-zinc-500 font-bold">Group {gi + 1}</p>
              <ChoiceGroup
                value={group.logic}
                onChange={(v) => onGroups(groups.map((g, i) => i !== gi ? g : { ...g, logic: v }))}
                size="sm"
                options={[{ v: "AND", l: "AND" }, { v: "OR", l: "OR" }]}
              />
            </div>
            {groups.length > 1 && (
              <button type="button" onClick={() => onGroups(groups.filter((_, i) => i !== gi))}
                className="text-zinc-600 hover:text-red-400 text-xs transition-colors">Remove group</button>
            )}
          </div>

          {group.conditions.map((cond, ci) => (
            <div key={cond.id} className="grid grid-cols-12 gap-2 items-center">
              {/* Indicator */}
              <Select value={cond.indicator} onValueChange={(v) => updateCond(gi, ci, { indicator: v as IndicatorId })}>
                <SelectTrigger className="col-span-3 h-9 bg-zinc-900 border-zinc-700 text-sm text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {INDICATORS.map(ind => <SelectItem key={ind} value={ind} className="text-sm text-zinc-200">{ind}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Period */}
              <Input type="number" min="1" value={cond.period ?? 14}
                onChange={(e) => updateCond(gi, ci, { period: Number(e.target.value || 14) })}
                className="col-span-1 h-9 bg-zinc-900 border-zinc-700 text-sm text-white text-center" />
              {/* Op */}
              <Select value={cond.op} onValueChange={(v) => updateCond(gi, ci, { op: v as ConditionOp })}>
                <SelectTrigger className="col-span-2 h-9 bg-zinc-900 border-zinc-700 text-sm text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {OPS.map(op => <SelectItem key={op.v} value={op.v} className="text-sm text-zinc-200">{op.l}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* RHS kind */}
              <Select value={cond.rhs.kind ?? "number"} onValueChange={(v) => updateCond(gi, ci, {
                rhs: v === "number" ? { kind: "number", value: 30 } : { kind: "indicator", id: "EMA", period: 200 },
              })}>
                <SelectTrigger className="col-span-2 h-9 bg-zinc-900 border-zinc-700 text-sm text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="number" className="text-sm text-zinc-200">Value</SelectItem>
                  <SelectItem value="indicator" className="text-sm text-zinc-200">Indicator</SelectItem>
                </SelectContent>
              </Select>
              {/* RHS value or indicator */}
              {cond.rhs.kind === "number" ? (
                <Input type="number" value={(cond.rhs as any).value ?? 0}
                  onChange={(e) => updateCond(gi, ci, { rhs: { kind: "number", value: Number(e.target.value || 0) } })}
                  className="col-span-3 h-9 bg-zinc-900 border-zinc-700 text-sm text-white" />
              ) : (
                <div className="col-span-3 grid grid-cols-2 gap-2">
                  <Select value={(cond.rhs as any).id ?? "EMA"} onValueChange={(v) => updateCond(gi, ci, { rhs: { ...cond.rhs, kind: "indicator", id: v as IndicatorId } })}>
                    <SelectTrigger className="h-9 bg-zinc-900 border-zinc-700 text-sm text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      {INDICATORS.map(ind => <SelectItem key={ind} value={ind} className="text-sm text-zinc-200">{ind}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="1" value={(cond.rhs as any).period ?? 200}
                    onChange={(e) => updateCond(gi, ci, { rhs: { ...cond.rhs, period: Number(e.target.value || 200) } })}
                    className="h-9 bg-zinc-900 border-zinc-700 text-sm text-white text-center" />
                </div>
              )}
              {/* Delete */}
              <button type="button" onClick={() => {
                const newConds = group.conditions.filter(c => c.id !== cond.id);
                onGroups(groups.map((g, i) => i !== gi ? g : { ...g, conditions: newConds.length ? newConds : [makeCond()] }));
              }} className="col-span-1 flex items-center justify-center h-9 w-9 rounded text-zinc-600 hover:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="h-8 text-xs border-zinc-700 text-zinc-300"
            onClick={() => onGroups(groups.map((g, i) => i !== gi ? g : { ...g, conditions: [...g.conditions, makeCond()] }))}>
            <Plus className="h-3 w-3 mr-1" /> Add condition
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="h-8 text-xs border-zinc-700 text-zinc-300"
        onClick={() => onGroups([...groups, makeGroup()])}>
        <Plus className="h-3 w-3 mr-1" /> Add group
      </Button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AlgoStrategyBuilder({ open, onOpenChange, existing, onSaved }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<BuilderForm>(DEFAULT_FORM);
  const isEdit = Boolean(existing?.id);
  const isLiveLocked = Boolean(isEdit && existing?.is_active === true);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setForm(fromExisting(existing));
  }, [open, existing]);

  const set = <K extends keyof BuilderForm>(k: K, v: BuilderForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (isLiveLocked) {
      toast.error("Deactivate this strategy before editing.");
      return;
    }
    if (!form.name.trim()) { toast.error("Strategy name is required"); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in required");

      const entryConditions: EntryConditions =
        form.strategyType === "time_based"
          ? {
              mode: "raw",
              groupLogic: "AND",
              groups: [],
              rawExpression: `TIME_IS(${form.entryTime})`,
              strategySubtype: "time_based",
              clockEntryTime: form.entryTime,
            }
          : form.strategyType === "hybrid"
            ? {
                ...form.entryConditions,
                strategySubtype: "hybrid",
                clockEntryTime: form.entryTime,
              }
            : {
                ...form.entryConditions,
                strategySubtype: "indicator_based",
              };

      const exitPayload: ExitConditions | null = form.autoExitEnabled
        ? (() => {
            const base: ExitConditions = { autoExitEnabled: true };
            if (form.stopLossPct > 0) base.stopLossPct = form.stopLossPct;
            if (form.takeProfitPct > 0) base.takeProfitPct = form.takeProfitPct;
            base.trailingStop = Boolean(form.trailingStop && form.trailingStopPct > 0);
            if (form.trailingStop && form.trailingStopPct > 0) base.trailingStopPct = form.trailingStopPct;
            base.indicatorGroups = form.useExitIndicators ? form.exitIndicatorGroups : [];
            if (form.timeBasedExit) {
              base.timeBasedExit = true;
              base.exitAfterMinutes = form.exitAfterMinutes;
            }
            if (
              (form.strategyType === "time_based" || form.strategyType === "hybrid") &&
              form.clockExitEnabled &&
              form.exitClockTime.trim()
            ) {
              base.clockExitTime = form.exitClockTime.trim();
            }
            return base;
          })()
        : { autoExitEnabled: false };

      const paperType = mapPaperStrategyType(form.strategyType, form.orderProduct);
      const sessionEnd =
        form.strategyType === "time_based"
          ? (form.clockExitEnabled && form.exitClockTime.trim() ? form.exitClockTime : form.endTime)
          : form.endTime;
      const sessionSq =
        form.strategyType === "time_based"
          ? (form.clockExitEnabled && form.exitClockTime.trim() ? form.exitClockTime : form.squareoffTime)
          : form.squareoffTime;

      const body: Record<string, unknown> = {
        action: isEdit ? "update" : "create",
        ...(isEdit ? { strategy_id: existing?.id } : {}),
        name: form.name.trim(),
        description: form.description.trim(),
        trading_mode: form.direction,
        is_intraday: form.orderProduct === "MIS" || form.orderProduct === "BTST",
        start_time: form.startTime,
        end_time: sessionEnd,
        squareoff_time: sessionSq,
        risk_per_trade_pct: form.maxRiskPerTradePct,
        stop_loss_pct: form.autoExitEnabled && form.stopLossPct > 0 ? form.stopLossPct : null,
        take_profit_pct: form.autoExitEnabled && form.takeProfitPct > 0 ? form.takeProfitPct : null,
        symbols: [...new Set(form.symbol.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))],
        paper_strategy_type: paperType,
        market_type: form.globalMarketsMode ? "global_equity" : form.instrumentType,
        entry_conditions: entryConditions,
        exit_conditions: exitPayload,
        position_config: {
          orderType: form.orderType,
          sizingMode: form.sizingMode,
          quantity: Math.max(0, form.lotSize),
          capitalPct: form.capitalPct,
          limitOffsetPct: form.limitOffsetPct,
          scaling: [],
          expiryType: form.expiryType,
          strikeType: form.strikeType,
          exchange: form.globalMarketsMode
            ? (form.allowedExchanges[0] ?? form.exchange ?? "NYSE")
            : form.exchange,
          orderProduct: form.orderProduct,
        },
        risk_config: {
          maxRiskPerTradePct: form.maxRiskPerTradePct,
          maxDailyLossPct: form.maxDailyLossPct,
          maxOpenPositions: form.maxOpenPositions,
          capitalAllocationPct: form.capitalAllocationPct,
          ...(form.globalMarketsMode && form.allowedExchanges.length > 0
            ? {
                allowedExchanges: [...new Set(form.allowedExchanges.map((x) => x.trim().toUpperCase()).filter(Boolean))],
                sessionVenues: form.sessionVenues.length
                  ? form.sessionVenues
                  : (["london", "new_york"] as const),
              }
            : {}),
        },
        chart_config: { interval: form.chartInterval, chartType: form.chartType },
        execution_days: form.executionDays,
      };

      const res = await supabase.functions.invoke("manage-strategy", {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const errBody = res.data as { error?: string; error_code?: string } | null;
      if (res.error || errBody?.error) {
        throw new Error(errBody?.error ?? res.error?.message ?? "Failed to save");
      }
      toast.success(isEdit ? "Strategy updated" : "Strategy created");
      onOpenChange(false);
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ts-theme-modal left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 !w-[98vw] !max-w-[98vw] sm:!max-w-[98vw] lg:!max-w-[98vw] !h-[96vh] !max-h-[96vh] rounded-xl m-0 overflow-hidden p-0 border-zinc-800 bg-zinc-950 text-white flex flex-col">

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-zinc-800 shrink-0">
          <div>
            <DialogTitle className="text-lg font-bold text-white">
              {isEdit ? "Edit Algo Strategy" : "New Algo Strategy"}
            </DialogTitle>
            <DialogDescription className="text-sm text-zinc-500 mt-0.5">
              Build indicator or time-based logic with risk controls and execution settings.
            </DialogDescription>
            {isLiveLocked && (
              <p className="mt-2 text-xs font-medium text-amber-200/95 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                This strategy is <span className="font-bold">live</span> (active). Deactivate it in your portfolio first, then you can edit rules and risk settings.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
            {STEPS.map((s, i) => (
              <button key={s.idx} type="button" onClick={() => !isLiveLocked && setStep(i)}
                disabled={isLiveLocked}
                className={`flex items-center gap-1 transition-colors ${i === step ? "text-sky-300 font-semibold" : "text-zinc-600 hover:text-zinc-400"} ${isLiveLocked ? "opacity-50 cursor-not-allowed" : ""}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  i < step ? "bg-sky-600 text-white" : i === step ? "bg-sky-500/20 border border-sky-500 text-sky-300" : "bg-zinc-800 text-zinc-500"
                }`}>{i + 1}</span>
                <span className="hidden lg:inline">{s.title}</span>
                {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-zinc-700" />}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <div className="w-44 shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-3 space-y-0.5 overflow-y-auto">
            {STEPS.map((s, i) => (
              <button key={s.idx} type="button" onClick={() => !isLiveLocked && setStep(i)}
                disabled={isLiveLocked}
                className={`w-full text-left rounded-lg px-3 py-2.5 transition-all ${
                  i === step ? "bg-sky-500/15 border border-sky-500/40 text-sky-300" : "text-zinc-400 hover:bg-zinc-800 border border-transparent"
                } ${isLiveLocked ? "opacity-50 cursor-not-allowed" : ""}`}>
                <p className={`text-xs font-bold leading-tight ${i === step ? "" : ""}`}>{i + 1}. {s.title}</p>
                <p className="text-[10px] text-zinc-600 leading-tight mt-0.5">{s.sub}</p>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className={`flex-1 overflow-y-auto px-6 py-5 space-y-5 ${isLiveLocked ? "pointer-events-none opacity-55" : ""}`}>

            {/* ── Step 0: Foundation ─────────────────────────────────────── */}
            {step === 0 && (
              <>
                <SectionTitle>Strategy Identity</SectionTitle>
                <Row>
                  <div className="col-span-2">
                    <Field label="Strategy Name *">
                      <Input value={form.name} onChange={e => set("name", e.target.value)}
                        placeholder="e.g. EMA Crossover Long, NIFTY Breakout"
                        className="h-10 bg-zinc-900 border-zinc-700 text-base" autoFocus />
                    </Field>
                  </div>
                </Row>
                <Field label="Description (optional)">
                  <Textarea value={form.description} onChange={e => set("description", e.target.value)}
                    placeholder="What does this strategy do? When does it work best?"
                    className="min-h-[80px] bg-zinc-900 border-zinc-700 text-sm resize-none" />
                </Field>

                <SectionTitle>Strategy Type</SectionTitle>
                <Field label="How does this strategy enter trades?" hint="Indicator-based uses technical signals. Time-based enters at a fixed time each day.">
                  <ChoiceGroup
                    value={form.strategyType} onChange={v => set("strategyType", v)}
                    options={[
                      { v: "indicator_based", l: "Indicator-Based", sub: "RSI, MACD, EMA crossover, etc." },
                      { v: "time_based",      l: "Time-Based",      sub: "Enter at a specific time daily" },
                      { v: "hybrid",          l: "Hybrid",          sub: "Time window + indicator confirmation" },
                    ]}
                  />
                </Field>

                {form.strategyType === "time_based" && (
                  <p className="text-xs text-sky-300/95 rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-2 leading-relaxed">
                    <strong>Time-based mode:</strong> set your <strong>entry clock</strong> on the Entry step and{" "}
                    <strong>exit clock</strong> on the Exit step (same idea as Algorooms: e.g. enter 1:00 PM, exit 1:01 PM). Scans use IST for NSE/BSE.
                  </p>
                )}
                {form.strategyType === "hybrid" && (
                  <p className="text-xs text-violet-300/95 rounded-lg border border-violet-500/35 bg-violet-500/10 px-3 py-2 leading-relaxed">
                    <strong>Hybrid:</strong> you must set both a <strong>daily entry time</strong> and <strong>indicator rules</strong> — both must agree to fire an entry.
                  </p>
                )}

                <SectionTitle>Instrument & Market</SectionTitle>
                <Field label="Instrument Type">
                  <ChoiceGroup
                    value={form.instrumentType} onChange={v => set("instrumentType", v)}
                    options={[
                      { v: "equity",  l: "Equity",  sub: "Stocks / Shares" },
                      { v: "futures", l: "Futures",  sub: "F&O — Carry" },
                      { v: "options", l: "Options",  sub: "Calls & Puts" },
                      { v: "indices", l: "Indices",  sub: "NIFTY, BANKNIFTY" },
                    ]}
                  />
                </Field>

                <Row>
                  <Field label="Exchange">
                    <Select value={form.exchange} onValueChange={v => set("exchange", v)}>
                      <SelectTrigger className="h-10 bg-zinc-900 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {["NSE", "BSE", "NFO", "BFO", "MCX", "CDS", "NCDEX"].map(ex => (
                          <SelectItem key={ex} value={ex} className="text-sm text-zinc-200">{ex}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Order Type" hint="MIS = Intraday, CNC = Delivery, BTST = Buy Today Sell Tomorrow">
                    <ChoiceGroup
                      value={form.orderProduct} onChange={v => set("orderProduct", v)} size="sm"
                      options={[
                        { v: "MIS",  l: "MIS",  sub: "Intraday" },
                        { v: "CNC",  l: "CNC",  sub: "Delivery" },
                        { v: "BTST", l: "BTST", sub: "Buy-Today-Sell-Tomorrow" },
                        { v: "NRML", l: "NRML", sub: "F&O Carry" },
                      ]}
                    />
                  </Field>
                </Row>

                <Field label="London & New York — multi-exchange">
                  <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3">
                    <Switch
                      checked={form.globalMarketsMode}
                      onCheckedChange={(v) => set("globalMarketsMode", Boolean(v))}
                      className="mt-0.5"
                    />
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-200">Enable multiple stock exchanges + session filters</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">
                        Turn this on for SMC and other strategies that trade across LSE / NYSE / NASDAQ etc., with London and New York cash session windows. One place — pick venues below; deploy still sets symbol per order.
                      </p>
                    </div>
                  </div>
                </Field>

                {form.globalMarketsMode && (
                  <>
                    <SectionTitle>Stock exchanges</SectionTitle>
                    <p className="text-xs text-zinc-500 -mt-2 mb-2 leading-relaxed">
                      Select every exchange this strategy is allowed to use. At least one session (London or New York) should stay enabled below.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {GLOBAL_STOCK_EXCHANGES.map(({ id, label }) => (
                        <label
                          key={id}
                          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300 cursor-pointer hover:border-zinc-600"
                        >
                          <Checkbox
                            checked={form.allowedExchanges.includes(id)}
                            onCheckedChange={(c) => {
                              const on = c === true;
                              set(
                                "allowedExchanges",
                                on
                                  ? [...form.allowedExchanges, id]
                                  : form.allowedExchanges.filter((x) => x !== id),
                              );
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <SectionTitle>Sessions (UTC)</SectionTitle>
                    <div className="flex flex-wrap gap-6">
                      <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                        <Checkbox
                          checked={form.sessionVenues.includes("london")}
                          onCheckedChange={(c) => {
                            const on = c === true;
                            const next = on
                              ? Array.from(new Set([...form.sessionVenues, "london"]))
                              : form.sessionVenues.filter((v) => v !== "london");
                            set("sessionVenues", next.length ? next : ["new_york"]);
                          }}
                        />
                        London stock session
                      </label>
                      <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                        <Checkbox
                          checked={form.sessionVenues.includes("new_york")}
                          onCheckedChange={(c) => {
                            const on = c === true;
                            const next = on
                              ? Array.from(new Set([...form.sessionVenues, "new_york"]))
                              : form.sessionVenues.filter((v) => v !== "new_york");
                            set("sessionVenues", next.length ? next : ["london"]);
                          }}
                        />
                        New York stock session
                      </label>
                    </div>
                  </>
                )}

                {(form.instrumentType === "futures" || form.instrumentType === "options") && (
                  <>
                    <SectionTitle>Derivatives metadata</SectionTitle>
                    <p className="text-xs text-zinc-500 -mt-2 mb-2 leading-relaxed">
                      Exact tradingsymbol and quantity are chosen when you <strong className="text-zinc-400">deploy live</strong> (broker portfolio → Execute → Deploy).
                    </p>
                    <Field label="Expiry Type">
                      <ChoiceGroup
                        value={form.expiryType} onChange={v => set("expiryType", v)}
                        options={[
                          { v: "weekly",  l: "Weekly",  sub: "Nearest weekly expiry" },
                          { v: "monthly", l: "Monthly", sub: "Current month expiry" },
                        ]}
                      />
                    </Field>

                    {form.instrumentType === "options" && (
                      <Field label="Strike Selection" hint="ATM = At the Money, ITM = In the Money, OTM = Out of the Money">
                        <ChoiceGroup
                          value={form.strikeType} onChange={v => set("strikeType", v)}
                          options={[
                            { v: "ITM_2", l: "ITM 2",  sub: "Deep in the money" },
                            { v: "ITM_1", l: "ITM 1",  sub: "1 strike ITM" },
                            { v: "ATM",   l: "ATM",    sub: "At the money" },
                            { v: "OTM_1", l: "OTM 1",  sub: "1 strike OTM" },
                            { v: "OTM_2", l: "OTM 2",  sub: "Deep out of money" },
                          ]}
                        />
                      </Field>
                    )}
                  </>
                )}

                <SectionTitle>Transaction Direction</SectionTitle>
                <Field label="Which way does this strategy trade?">
                  <ChoiceGroup
                    value={form.direction} onChange={v => set("direction", v)}
                    options={[
                      { v: "LONG",  l: "Long (Buy)",    sub: "Buy → expect price to rise" },
                      { v: "SHORT", l: "Short (Sell)",  sub: "Sell → expect price to fall" },
                      { v: "BOTH",  l: "Both",          sub: "Buy & Sell signals" },
                    ]}
                  />
                </Field>
              </>
            )}

            {/* ── Step 1: Timing ──────────────────────────────────────────── */}
            {step === 1 && (
              <>
                <SectionTitle>Session Hours (IST)</SectionTitle>
                <Row>
                  <Field label="Start Time" hint="Strategy activates from this time">
                    <Input type="time" value={form.startTime} onChange={e => set("startTime", e.target.value)}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                  <Field label="End Time" hint="No new entries after this time">
                    <Input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                  <Field label="Squareoff Time" hint="Force-close all positions at this time">
                    <Input type="time" value={form.squareoffTime} onChange={e => set("squareoffTime", e.target.value)}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                </Row>

                <SectionTitle>Execution Days</SectionTitle>
                <div className="flex flex-wrap gap-3">
                  {DAY_LABELS.map(d => (
                    <label key={d.v} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.executionDays.includes(d.v)}
                        onCheckedChange={() => set("executionDays", (() => {
                          const s = new Set(form.executionDays);
                          if (s.has(d.v)) s.delete(d.v); else s.add(d.v);
                          return Array.from(s).sort((a, b) => a - b);
                        })())}
                        className="border-zinc-600"
                      />
                      <span className="text-sm text-zinc-300 font-medium">{d.l}</span>
                    </label>
                  ))}
                </div>

                <SectionTitle>Chart Settings</SectionTitle>
                <Row>
                  <Field label="Chart Interval" hint="Candle time frame for signal detection">
                    <Select value={form.chartInterval} onValueChange={v => set("chartInterval", v as ChartConfig["interval"])}>
                      <SelectTrigger className="h-10 bg-zinc-900 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        {["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"].map(i => (
                          <SelectItem key={i} value={i} className="text-sm text-zinc-200">{i}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Chart Type">
                    <Select value={form.chartType} onValueChange={v => set("chartType", v as ChartConfig["chartType"])}>
                      <SelectTrigger className="h-10 bg-zinc-900 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700">
                        <SelectItem value="candlestick" className="text-sm text-zinc-200">Candlestick</SelectItem>
                        <SelectItem value="heikin_ashi" className="text-sm text-zinc-200">Heikin Ashi</SelectItem>
                        <SelectItem value="line" className="text-sm text-zinc-200">Line</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </Row>
              </>
            )}

            {/* ── Step 2: Entry Conditions ────────────────────────────────── */}
            {step === 2 && (
              <>
                <SectionTitle>Entry Conditions</SectionTitle>

                {form.strategyType === "time_based" || form.strategyType === "hybrid" ? (
                  <Field label="Entry Time" hint="Strategy places an order at exactly this time each day">
                    <Input type="time" value={form.entryTime} onChange={e => set("entryTime", e.target.value)}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-xs" />
                  </Field>
                ) : null}

                {(form.strategyType === "indicator_based" || form.strategyType === "hybrid") && (
                  <>
                    {form.entryConditions.algoGuidePreset ? (
                      <AlgoGuidePresetEntryPanel
                        presetId={form.entryConditions.algoGuidePreset}
                        entryConditions={form.entryConditions}
                        onUpdate={(next) => set("entryConditions", next)}
                        onSwitchToCustom={() => {
                          set("entryConditions", {
                            ...form.entryConditions,
                            algoGuidePreset: undefined,
                            algoGuideBlockFirstSessionMinutes: undefined,
                            algoGuideParams: undefined,
                            groups: form.entryConditions.groups.length ? form.entryConditions.groups : [makeGroup()],
                          });
                        }}
                      />
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-2">
                          <p className="text-sm font-semibold text-zinc-300">Builder Mode</p>
                          <ChoiceGroup
                            value={form.entryConditions.mode}
                            onChange={v => set("entryConditions", { ...form.entryConditions, mode: v })}
                            size="sm"
                            options={[
                              { v: "visual", l: "Visual Builder", sub: "Click to build conditions" },
                              { v: "raw",    l: "Expression Editor", sub: "Write formula manually" },
                            ]}
                          />
                        </div>

                        {form.entryConditions.mode === "visual" ? (
                          <ConditionBuilder
                            groups={form.entryConditions.groups}
                            groupLogic={form.entryConditions.groupLogic}
                            onGroups={g => set("entryConditions", { ...form.entryConditions, groups: g })}
                            onGroupLogic={v => set("entryConditions", { ...form.entryConditions, groupLogic: v })}
                          />
                        ) : (
                          <Field label="Entry Expression"
                            hint="Use: RSI(14) < 30 | EMA(50) > EMA(200) | MACD > MACD_SIGNAL | AND / OR">
                            <Textarea
                              value={form.entryConditions.rawExpression}
                              onChange={e => set("entryConditions", { ...form.entryConditions, rawExpression: e.target.value })}
                              className="min-h-[160px] bg-zinc-900 border-zinc-700 text-sm font-mono"
                              placeholder={`EMA(50) > EMA(200)\nAND RSI(14) > 55\nAND MACD > MACD_SIGNAL`}
                            />
                          </Field>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* ── Step 3: Exit Conditions ─────────────────────────────────── */}
            {step === 3 && (
              <>
                <SectionTitle>Automated exit</SectionTitle>
                <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                  <Switch checked={form.autoExitEnabled} onCheckedChange={(v) => set("autoExitEnabled", v)} />
                  <div>
                    <p className="text-sm font-semibold text-zinc-200">Enable automated exits</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Turn off if you only want entry signals and will take profit / stop loss manually.</p>
                  </div>
                </label>
                {!form.autoExitEnabled && (
                  <p className="text-xs text-amber-200/90 border border-amber-500/25 rounded-lg p-3 bg-amber-500/5 leading-relaxed">
                    Live scans still use real market data for your entry rules. No TP, SL, timed, indicator, or clock exit is applied for this strategy.
                  </p>
                )}

                {form.autoExitEnabled && (
                <>
                <p className="text-xs text-zinc-500 border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-900/40 leading-relaxed">
                  Each block below is <strong className="text-zinc-400">optional</strong>. Leave a percentage blank or 0, turn off switches, or skip indicator rules — only what you configure is used in live scans.
                </p>

                {(form.strategyType === "time_based" || form.strategyType === "hybrid") && (
                  <>
                    <SectionTitle>Scheduled exit (clock) — optional</SectionTitle>
                    <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 mb-2">
                      <Switch
                        checked={form.clockExitEnabled}
                        onCheckedChange={(v) => set("clockExitEnabled", v)}
                      />
                      <span className="text-sm text-zinc-300">Exit at a fixed clock time each session</span>
                    </label>
                    {form.clockExitEnabled && (
                      <Field
                        label="Exit clock time"
                        hint="IST for NSE/BSE; UTC for global symbols in scans."
                      >
                        <Input
                          type="time"
                          value={form.exitClockTime}
                          onChange={(e) => set("exitClockTime", e.target.value)}
                          className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-xs"
                        />
                      </Field>
                    )}
                  </>
                )}

                <SectionTitle>Take profit &amp; stop loss — optional</SectionTitle>
                <Row>
                  <Field label="Take profit %" hint="Leave empty or 0 to disable take-profit exits in scans.">
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={form.takeProfitPct > 0 ? String(form.takeProfitPct) : ""}
                        placeholder="Off"
                        onChange={(e) => {
                          const v = e.target.value;
                          set("takeProfitPct", v === "" ? 0 : Math.max(0, Number(v) || 0));
                        }}
                        className="h-10 bg-zinc-900 border-zinc-700 text-base text-green-400/90 font-bold pr-7"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                  <Field label="Stop loss %" hint="Leave empty or 0 to disable stop-loss exits in scans.">
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={form.stopLossPct > 0 ? String(form.stopLossPct) : ""}
                        placeholder="Off"
                        onChange={(e) => {
                          const v = e.target.value;
                          set("stopLossPct", v === "" ? 0 : Math.max(0, Number(v) || 0));
                        }}
                        className="h-10 bg-zinc-900 border-zinc-700 text-base text-red-400/90 font-bold pr-7"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                  <Field label="Trailing stop %" hint="Only used when trailing stop is enabled below.">
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        value={form.trailingStopPct > 0 ? String(form.trailingStopPct) : ""}
                        placeholder="—"
                        onChange={(e) => {
                          const v = e.target.value;
                          set("trailingStopPct", v === "" ? 0 : Math.max(0, Number(v) || 0));
                        }}
                        className="h-10 bg-zinc-900 border-zinc-700 text-base pr-7"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                </Row>

                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={form.trailingStop} onCheckedChange={v => set("trailingStop", v)} />
                    <span className="text-sm text-zinc-300">Trailing stop-loss (optional)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch checked={form.timeBasedExit} onCheckedChange={v => set("timeBasedExit", v)} />
                    <span className="text-sm text-zinc-300">Force-exit after N minutes (optional)</span>
                  </label>
                </div>

                {form.timeBasedExit && (
                  <Field label="Minutes after entry" hint="Close the simulated position after this many minutes (used in scans).">
                    <Input type="number" min={1} value={form.exitAfterMinutes}
                      onChange={e => set("exitAfterMinutes", Number(e.target.value || 1))}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm max-w-xs" />
                  </Field>
                )}

                <SectionTitle>Indicator-based exit — optional</SectionTitle>
                <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 mb-2">
                  <Switch
                    checked={form.useExitIndicators}
                    onCheckedChange={(v) => {
                      if (v && form.exitIndicatorGroups.length === 0) {
                        setForm((p) => ({ ...p, useExitIndicators: true, exitIndicatorGroups: [makeGroup()] }));
                      } else {
                        set("useExitIndicators", v);
                      }
                    }}
                  />
                  <span className="text-sm text-zinc-300">Use indicator rules to signal exits (e.g. EMA cross)</span>
                </label>
                <p className="text-xs text-zinc-500 -mt-1 mb-2">
                  Note: full indicator-exit execution in backtests may be limited; TP/SL and clock exits are applied in the scan engine today.
                </p>
                {form.useExitIndicators && (
                  <ConditionBuilder
                    groups={form.exitIndicatorGroups.length ? form.exitIndicatorGroups : [makeGroup()]}
                    groupLogic="AND"
                    onGroups={g => set("exitIndicatorGroups", g)}
                    onGroupLogic={() => {}}
                  />
                )}
                </>
                )}
              </>
            )}

            {/* ── Step 4: Position Builder ────────────────────────────────── */}
            {step === 4 && (
              <>
                <SectionTitle>Order Placement</SectionTitle>
                <Field label="Order Execution Type" hint="MARKET = execute at current price. LIMIT = set a specific price.">
                  <ChoiceGroup
                    value={form.orderType} onChange={v => set("orderType", v)}
                    options={[
                      { v: "MARKET",     l: "Market",     sub: "Execute at best available price" },
                      { v: "LIMIT",      l: "Limit",      sub: "Wait for specified price" },
                      { v: "STOP",       l: "Stop",       sub: "Trigger when price hits level" },
                      { v: "STOP_LIMIT", l: "Stop-Limit", sub: "Stop + limit combined" },
                    ]}
                  />
                </Field>

                {(form.orderType === "LIMIT" || form.orderType === "STOP_LIMIT") && (
                  <Field label="Limit Offset %" hint="% below market for BUY limit orders, % above for SELL">
                    <div className="relative max-w-xs">
                      <Input type="number" min="0" step="0.05" value={form.limitOffsetPct}
                        onChange={e => set("limitOffsetPct", Number(e.target.value || 0))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                )}

                <SectionTitle>Position Sizing</SectionTitle>
                <Field label="Sizing Mode" hint="How position size is calculated each trade">
                  <ChoiceGroup
                    value={form.sizingMode} onChange={v => set("sizingMode", v)}
                    options={[
                      { v: "fixed_qty",   l: "Fixed Qty",   sub: "Always use the lot size above" },
                      { v: "risk_based",  l: "Risk-Based",  sub: "Size based on max-risk % of capital" },
                      { v: "capital_pct", l: "Capital %",   sub: "Use N% of available capital" },
                    ]}
                  />
                </Field>

                {form.sizingMode === "capital_pct" && (
                  <Field label="Capital per trade %" hint="% of total capital to deploy per trade">
                    <div className="relative max-w-xs">
                      <Input type="number" min="1" max="100" value={form.capitalPct}
                        onChange={e => set("capitalPct", Number(e.target.value || 1))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                )}
              </>
            )}

            {/* ── Step 5: Risk Rules ──────────────────────────────────────── */}
            {step === 5 && (
              <>
                <SectionTitle>Per-Trade Limits</SectionTitle>
                <Row>
                  <Field label="Max Risk Per Trade %" hint="Maximum % of capital to risk per single trade">
                    <div className="relative">
                      <Input type="number" min="0.1" step="0.1" value={form.maxRiskPerTradePct}
                        onChange={e => set("maxRiskPerTradePct", Number(e.target.value || 0.1))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                  <Field label="Max Open Positions" hint="Stop taking new trades after this many are open">
                    <Input type="number" min="1" value={form.maxOpenPositions}
                      onChange={e => set("maxOpenPositions", Number(e.target.value || 1))}
                      className="h-10 bg-zinc-900 border-zinc-700 text-sm" />
                  </Field>
                </Row>

                <SectionTitle>Daily Limits</SectionTitle>
                <Row>
                  <Field label="Max Daily Loss %" hint="Stop all new trades for the day after this loss">
                    <div className="relative">
                      <Input type="number" min="0.1" step="0.1" value={form.maxDailyLossPct}
                        onChange={e => set("maxDailyLossPct", Number(e.target.value || 0.1))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                  <Field label="Capital Allocation %" hint="Max % of total portfolio allocated to this strategy">
                    <div className="relative">
                      <Input type="number" min="1" max="100" value={form.capitalAllocationPct}
                        onChange={e => set("capitalAllocationPct", Number(e.target.value || 1))}
                        className="h-10 bg-zinc-900 border-zinc-700 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                    </div>
                  </Field>
                </Row>
              </>
            )}
          </div>
        </div>

        {/* ─── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-start px-5 py-3 border-t border-zinc-800 shrink-0 bg-zinc-950 gap-10">
          <p className="text-xs text-zinc-600">Step {step + 1} of {STEPS.length} — {STEPS[step].title}</p>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" className="h-9 px-4 border-zinc-700 text-zinc-200"
              onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0 || saving || isLiveLocked}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" className="h-9 px-5 bg-sky-600 hover:bg-sky-500 text-white font-semibold"
                onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={isLiveLocked}>
                Next
              </Button>
            ) : (
              <Button type="button" className="h-9 px-5 bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                onClick={save} disabled={saving || isLiveLocked}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {isEdit ? "Update Strategy" : "Create Strategy"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
