/**
 * OptionsStrategyBuilderDialog — 5-step wizard for creating/editing options strategies.
 *
 * Step 1: Instrument Setup (underlying, exchange, expiry type, option type, strike)
 * Step 2: Strategy Style (buying/selling/spread/straddle/strangle)
 * Step 3: Entry Conditions (ORB, VWAP, momentum, VIX filter, expiry guard)
 * Step 4: Exit Rules (SL%, TP%, trailing, time exit, re-entries)
 * Step 5: Risk Config (max premium, max daily loss, lot size, paper-only toggle)
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Info,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { OptionsStrategy } from "@/pages/OptionsStrategyPage";
import { instrumentTypeForUnderlying } from "@/lib/optionsApi";

// ── Types ─────────────────────────────────────────────────────────────────

interface WizardState {
  // Step 1
  name: string;
  description: string;
  underlying: string;
  exchange: string;
  instrument_type: string;
  expiry_type: string;
  strike_selection: string;
  option_type: string;
  trade_direction: string;
  explicit_expiry_iso: string;
  explicit_options_symbol: string;
  // Step 2
  strategy_style: string;
  // Step 3
  orb_breakout: boolean;
  orb_duration_mins: number;
  min_range_pct: number;
  max_range_pct: number;
  momentum_bars: number;
  vwap_cross: boolean;
  vix_filter_enabled: boolean;
  vix_max: number;
  expiry_day_guard: boolean;
  // Step 4
  sl_pct: number;
  tp_pct: number;
  trailing_enabled: boolean;
  trail_after_pct: number;
  trail_pct: number;
  time_exit_hhmm: string;
  max_reentry_count: number;
  // Step 5
  max_premium_per_lot: number;
  max_daily_loss_inr: number;
  lot_size: number;
  is_paper_only: boolean;
}

const DEFAULT_STATE: WizardState = {
  name: "",
  description: "",
  underlying: "NIFTY",
  exchange: "NFO",
  instrument_type: "OPTIDX",
  expiry_type: "weekly",
  strike_selection: "ATM",
  option_type: "auto",
  trade_direction: "bullish",
  explicit_expiry_iso: "",
  explicit_options_symbol: "",
  strategy_style: "buying",
  orb_breakout: true,
  orb_duration_mins: 15,
  min_range_pct: 0.2,
  max_range_pct: 1.0,
  momentum_bars: 3,
  vwap_cross: false,
  vix_filter_enabled: true,
  vix_max: 22,
  expiry_day_guard: true,
  sl_pct: 30,
  tp_pct: 50,
  trailing_enabled: true,
  trail_after_pct: 30,
  trail_pct: 15,
  time_exit_hhmm: "15:15",
  max_reentry_count: 1,
  max_premium_per_lot: 500,
  max_daily_loss_inr: 2000,
  lot_size: 1,
  is_paper_only: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────

const STEP_TITLES = [
  "1. Instrument Setup",
  "2. Strategy Style",
  "3. Entry Conditions",
  "4. Exit Rules",
  "5. Risk & Deployment",
];

function stateToDb(state: WizardState, userId: string) {
  return {
    user_id: userId,
    name: state.name.trim(),
    description: state.description.trim() || null,
    underlying: state.underlying,
    exchange: state.exchange,
    instrument_type: state.instrument_type,
    expiry_type: state.expiry_type,
    strike_selection: state.strike_selection,
    option_type: state.option_type,
    trade_direction: state.trade_direction,
    strategy_style: state.strategy_style,
    legs: [],
    entry_conditions: {
      orb_breakout: state.orb_breakout,
      vwap_cross: state.vwap_cross,
      vix_filter: { enabled: state.vix_filter_enabled, max_vix: state.vix_max },
      expiry_day_guard: state.expiry_day_guard,
    },
    orb_config: {
      orb_duration_mins: state.orb_duration_mins,
      min_range_pct: state.min_range_pct,
      max_range_pct: state.max_range_pct,
      momentum_bars: state.momentum_bars,
    },
    exit_rules: {
      sl_pct: state.sl_pct,
      tp_pct: state.tp_pct,
      trailing_enabled: state.trailing_enabled,
      trail_after_pct: state.trail_after_pct,
      trail_pct: state.trail_pct,
      time_exit_hhmm: state.time_exit_hhmm,
      max_reentry_count: state.max_reentry_count,
    },
    risk_config: {
      max_premium_per_lot: state.max_premium_per_lot,
      max_daily_loss_inr: state.max_daily_loss_inr,
      lot_size: state.lot_size,
      explicit_expiry_iso: state.explicit_expiry_iso || null,
      explicit_options_symbol: state.explicit_options_symbol || null,
    },
    is_paper_only: state.is_paper_only,
  };
}

function dbToState(s: OptionsStrategy): WizardState {
  const ec = s.entry_conditions as Record<string, unknown>;
  const orb = s.orb_config as Record<string, unknown>;
  const er = s.exit_rules as Record<string, unknown>;
  const rc = s.risk_config as Record<string, unknown>;
  const vix = (ec.vix_filter as Record<string, unknown>) ?? {};
  return {
    name: s.name,
    description: s.description ?? "",
    underlying: s.underlying,
    exchange: s.exchange,
    instrument_type: s.instrument_type,
    expiry_type: s.expiry_type,
    strike_selection: s.strike_selection,
    option_type: s.option_type,
    trade_direction: s.trade_direction,
    explicit_expiry_iso: (rc.explicit_expiry_iso as string) ?? "",
    explicit_options_symbol: (rc.explicit_options_symbol as string) ?? "",
    strategy_style: s.strategy_style,
    orb_breakout: (ec.orb_breakout as boolean) ?? true,
    orb_duration_mins: (orb.orb_duration_mins as number) ?? 15,
    min_range_pct: (orb.min_range_pct as number) ?? 0.2,
    max_range_pct: (orb.max_range_pct as number) ?? 1.0,
    momentum_bars: (orb.momentum_bars as number) ?? 3,
    vwap_cross: (ec.vwap_cross as boolean) ?? false,
    vix_filter_enabled: (vix.enabled as boolean) ?? true,
    vix_max: (vix.max_vix as number) ?? 22,
    expiry_day_guard: (ec.expiry_day_guard as boolean) ?? true,
    sl_pct: (er.sl_pct as number) ?? 30,
    tp_pct: (er.tp_pct as number) ?? 50,
    trailing_enabled: (er.trailing_enabled as boolean) ?? true,
    trail_after_pct: (er.trail_after_pct as number) ?? 30,
    trail_pct: (er.trail_pct as number) ?? 15,
    time_exit_hhmm: (er.time_exit_hhmm as string) ?? "15:15",
    max_reentry_count: (er.max_reentry_count as number) ?? 1,
    max_premium_per_lot: (rc.max_premium_per_lot as number) ?? 500,
    max_daily_loss_inr: (rc.max_daily_loss_inr as number) ?? 2000,
    lot_size: (rc.lot_size as number) ?? 1,
    is_paper_only: s.is_paper_only,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm">{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">({hint})</span>}
      </div>
      {children}
    </div>
  );
}

function SliderField({
  label, hint, value, min, max, step, onChange, format,
}: {
  label: string; hint?: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-sm font-semibold text-primary">
          {format ? format(value) : value}
        </span>
      </div>
      {hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
      />
    </div>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────


function Step1({
  state,
  set,
}: {
  state: WizardState;
  set: (k: keyof WizardState, v: unknown) => void;
}) {
  const UNDERLYINGS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"];
  return (
    <div className="space-y-5">
      <FieldRow label="Strategy Name">
        <Input
          value={state.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. NIFTY ORB Momentum CE"
        />
      </FieldRow>

      <FieldRow label="Description" hint="optional">
        <Textarea
          value={state.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Brief description of when this strategy should trade..."
          rows={2}
        />
      </FieldRow>

      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Underlying">
          <Select
            value={state.underlying}
            onValueChange={(v) => {
              set("underlying", v);
              set("instrument_type", instrumentTypeForUnderlying(v));
              set("explicit_expiry_iso", "");
              set("explicit_options_symbol", "");
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {UNDERLYINGS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
              <SelectItem value="SENSEX">SENSEX</SelectItem>
              <SelectItem value="CUSTOM">Custom Stock</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Exchange">
          <Select
            value={state.exchange}
            onValueChange={(v) => {
              set("exchange", v);
              set("explicit_expiry_iso", "");
              set("explicit_options_symbol", "");
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NFO">NFO (NSE F&amp;O)</SelectItem>
              <SelectItem value="BFO">BFO (BSE F&amp;O)</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Expiry">
          <Select value={state.expiry_type} onValueChange={(v) => set("expiry_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly (Nearest)</SelectItem>
              <SelectItem value="next_weekly">Next Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Strike Offset">
          <Select value={state.strike_selection} onValueChange={(v) => set("strike_selection", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ITM2">ITM 2</SelectItem>
              <SelectItem value="ITM1">ITM 1</SelectItem>
              <SelectItem value="ATM">ATM (At-The-Money)</SelectItem>
              <SelectItem value="OTM1">OTM 1</SelectItem>
              <SelectItem value="OTM2">OTM 2</SelectItem>
              <SelectItem value="OTM3">OTM 3</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Option Type">
          <Select value={state.option_type} onValueChange={(v) => set("option_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (direction-based)</SelectItem>
              <SelectItem value="CE">CE — Call (Bullish)</SelectItem>
              <SelectItem value="PE">PE — Put (Bearish)</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>

        <FieldRow label="Trade Direction">
          <Select value={state.trade_direction} onValueChange={(v) => set("trade_direction", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bullish">Bullish (Buy CE)</SelectItem>
              <SelectItem value="bearish">Bearish (Buy PE)</SelectItem>
              <SelectItem value="neutral">Neutral (Both)</SelectItem>
            </SelectContent>
          </Select>
        </FieldRow>
      </div>

      <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground flex gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          <strong>Auto</strong> option type lets the strategy pick CE or PE based on the ORB breakout direction.
          Use it with <strong>Neutral</strong> direction for the most flexible execution.
          The <strong>expiry date, option symbol and lot size</strong> are selected when you tap{" "}
          <strong>Paper Trade</strong> or <strong>Activate Live</strong> — broker data loads fresh each session.
        </span>
      </div>
    </div>
  );
}

function Step2({ state, set }: { state: WizardState; set: (k: keyof WizardState, v: unknown) => void }) {
  const styles = [
    { value: "buying", label: "Simple Buying", desc: "Buy CE or PE at entry. Max loss = premium paid." },
    { value: "selling", label: "Option Selling", desc: "Sell CE or PE. Profit from time decay. Higher margin." },
    { value: "spread", label: "Bull/Bear Spread", desc: "Buy one strike, sell another. Defined risk." },
    { value: "straddle", label: "Straddle", desc: "Buy both ATM CE + PE. Profit from large moves." },
    { value: "strangle", label: "Strangle", desc: "Buy OTM CE + PE. Cheaper than straddle, needs bigger move." },
    { value: "iron_condor", label: "Iron Condor", desc: "Sell OTM CE + PE, buy farther strikes. Low-volatility play." },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Choose the structure of your options strategy. This determines how many legs are placed and your risk profile.
      </p>
      <div className="grid grid-cols-1 gap-2.5">
        {styles.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => set("strategy_style", s.value)}
            className={`text-left rounded-lg border px-4 py-3 transition-all ${
              state.strategy_style === s.value
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{s.label}</span>
              {state.strategy_style === s.value && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
          </button>
        ))}
      </div>

      {(state.strategy_style === "straddle" || state.strategy_style === "strangle" || state.strategy_style === "iron_condor") && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 text-xs text-yellow-600 dark:text-yellow-400 flex gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Multi-leg strategies require sufficient margin. Paper trading is recommended first.
            The entry scan will place separate legs using the OpenAlgo multi-order API.
          </span>
        </div>
      )}
    </div>
  );
}

function Step3({ state, set }: { state: WizardState; set: (k: keyof WizardState, v: unknown) => void }) {
  return (
    <div className="space-y-5">
      {/* ORB Breakout */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">ORB Breakout</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Trade breakout of the Opening Range (first N minutes)
            </p>
          </div>
          <Switch checked={state.orb_breakout} onCheckedChange={(v) => set("orb_breakout", v)} />
        </div>

        {state.orb_breakout && (
          <div className="pl-4 border-l-2 border-primary/30 space-y-4">
            <SliderField
              label="ORB Duration"
              hint="first N minutes form the range"
              value={state.orb_duration_mins}
              min={5} max={30} step={5}
              onChange={(v) => set("orb_duration_mins", v)}
              format={(v) => `${v} min`}
            />
            <SliderField
              label="Momentum Confirmation Bars"
              hint="consecutive higher/lower closes required"
              value={state.momentum_bars}
              min={1} max={5} step={1}
              onChange={(v) => set("momentum_bars", v)}
              format={(v) => `${v} bars`}
            />
            <div className="grid grid-cols-2 gap-4">
              <SliderField
                label="Min Range %"
                hint="skip if too narrow"
                value={state.min_range_pct}
                min={0.1} max={1.0} step={0.05}
                onChange={(v) => set("min_range_pct", v)}
                format={(v) => `${v.toFixed(2)}%`}
              />
              <SliderField
                label="Max Range %"
                hint="skip if too wide"
                value={state.max_range_pct}
                min={0.5} max={3.0} step={0.1}
                onChange={(v) => set("max_range_pct", v)}
                format={(v) => `${v.toFixed(1)}%`}
              />
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* VWAP Cross */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold">VWAP Cross Confirmation</Label>
            <Badge variant="outline" className="text-[10px] py-0 h-4 text-muted-foreground">Optional</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Require price above VWAP (CE) or below VWAP (PE) at entry
          </p>
        </div>
        <Switch checked={state.vwap_cross} onCheckedChange={(v) => set("vwap_cross", v)} />
      </div>

      <Separator />

      {/* VIX Filter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold">VIX Filter</Label>
              <Badge variant="outline" className="text-[10px] py-0 h-4 text-muted-foreground">Optional</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Skip trading if India VIX is too high (unsafe premium levels)
            </p>
          </div>
          <Switch checked={state.vix_filter_enabled} onCheckedChange={(v) => set("vix_filter_enabled", v)} />
        </div>
        {state.vix_filter_enabled && (
          <div className="pl-4 border-l-2 border-primary/30">
            <SliderField
              label="Max VIX Threshold"
              hint="skip trade if VIX is above this"
              value={state.vix_max}
              min={10} max={40} step={1}
              onChange={(v) => set("vix_max", v)}
              format={(v) => `${v}`}
            />
          </div>
        )}
      </div>

      <Separator />

      {/* Expiry Day Guard */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold">Expiry Day Guard</Label>
            <Badge variant="outline" className="text-[10px] py-0 h-4 text-muted-foreground">Optional</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Skip new entries on the contract's expiry day (avoid gamma risk)
          </p>
        </div>
        <Switch checked={state.expiry_day_guard} onCheckedChange={(v) => set("expiry_day_guard", v)} />
      </div>
    </div>
  );
}

function Step4({ state, set }: { state: WizardState; set: (k: keyof WizardState, v: unknown) => void }) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground flex gap-2">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          All SL/TP percentages are based on the <strong>premium paid/received</strong>, not the
          underlying price. E.g. 30% SL = exit when premium falls 30% from entry.
        </span>
      </div>

      <SliderField
        label="Stop Loss on Premium"
        hint="exit if premium drops by this %"
        value={state.sl_pct}
        min={5} max={80} step={5}
        onChange={(v) => set("sl_pct", v)}
        format={(v) => `${v}%`}
      />

      <SliderField
        label="Take Profit on Premium"
        hint="exit if premium rises by this %"
        value={state.tp_pct}
        min={10} max={200} step={5}
        onChange={(v) => set("tp_pct", v)}
        format={(v) => `${v}%`}
      />

      <Separator />

      {/* Trailing SL */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">Trailing Stop-Loss</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Once premium rises enough, trail the SL from the peak
            </p>
          </div>
          <Switch checked={state.trailing_enabled} onCheckedChange={(v) => set("trailing_enabled", v)} />
        </div>

        {state.trailing_enabled && (
          <div className="pl-4 border-l-2 border-primary/30 space-y-4">
            <SliderField
              label="Activate Trailing After"
              hint="% premium gain before trailing kicks in"
              value={state.trail_after_pct}
              min={10} max={100} step={5}
              onChange={(v) => set("trail_after_pct", v)}
              format={(v) => `${v}%`}
            />
            <SliderField
              label="Trail From Peak By"
              hint="% below peak premium triggers exit"
              value={state.trail_pct}
              min={5} max={50} step={5}
              onChange={(v) => set("trail_pct", v)}
              format={(v) => `${v}%`}
            />
            <div className="rounded bg-muted/40 p-2 text-xs text-muted-foreground">
              Example: If entry premium = ₹100, activate at ₹{100 + state.trail_after_pct},
              trail SL = peak × {((100 - state.trail_pct) / 100).toFixed(2)}.
              If peak hits ₹150, trailing SL = ₹{Math.round(150 * (100 - state.trail_pct) / 100)}.
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Time exit */}
      <FieldRow label="Hard Time Exit" hint="IST — force close at this time regardless of P&L">
        <Input
          type="time"
          value={state.time_exit_hhmm}
          onChange={(e) => set("time_exit_hhmm", e.target.value)}
          className="w-36"
        />
      </FieldRow>

      {/* Re-entries */}
      <FieldRow label="Max Re-entries Per Day" hint="0 = disabled — optional re-entry after stop-out">
        <Select
          value={String(state.max_reentry_count)}
          onValueChange={(v) => set("max_reentry_count", Number(v))}
        >
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0 — Disabled</SelectItem>
            <SelectItem value="1">1 — One re-entry</SelectItem>
            <SelectItem value="2">2 — Two re-entries</SelectItem>
            <SelectItem value="3">3 — Three re-entries</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
    </div>
  );
}

function Step5({ state, set }: { state: WizardState; set: (k: keyof WizardState, v: unknown) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <FieldRow label="Max Premium Per Lot" hint="₹ — skip entry if premium > this">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <Input
              type="number"
              value={state.max_premium_per_lot}
              onChange={(e) => set("max_premium_per_lot", Number(e.target.value))}
              className="pl-7"
              min={10}
              step={50}
            />
          </div>
        </FieldRow>

        <FieldRow label="Max Daily Loss" hint="₹ — pause after this loss">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
            <Input
              type="number"
              value={state.max_daily_loss_inr}
              onChange={(e) => set("max_daily_loss_inr", Number(e.target.value))}
              className="pl-7"
              min={100}
              step={500}
            />
          </div>
        </FieldRow>

        <FieldRow label="Lot Size" hint="number of lots per trade">
          <Input
            type="number"
            value={state.lot_size}
            onChange={(e) => set("lot_size", Math.max(1, Number(e.target.value)))}
            min={1}
            max={10}
            step={1}
          />
        </FieldRow>
      </div>

      <Separator />

      {/* Paper vs Live */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-semibold">Paper Trading Only</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Simulate trades with real market prices. No real money placed.
            </p>
          </div>
          <Switch
            checked={state.is_paper_only}
            onCheckedChange={(v) => set("is_paper_only", v)}
          />
        </div>

        {!state.is_paper_only && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-500 dark:text-red-400 space-y-1">
            <p className="font-semibold">Live Trading Enabled</p>
            <p>
              Real orders will be placed via your broker (through OpenAlgo). Ensure your API key
              is configured and you have sufficient margin before activating this strategy.
            </p>
          </div>
        )}

        {state.is_paper_only && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-xs text-blue-500 dark:text-blue-400">
            Paper mode uses real-time market prices to simulate entry and exit.
            Switch to live mode only after validating performance with paper trades.
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-lg bg-muted/30 px-4 py-3 space-y-1.5 text-xs">
        <p className="font-semibold text-sm mb-2">Strategy Summary</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
          <span>Underlying:</span><span className="text-foreground font-medium">{state.underlying} {state.exchange}</span>
          <span>Strike:</span><span className="text-foreground font-medium">{state.strike_selection} {state.option_type === "auto" ? "(auto)" : state.option_type}</span>
          <span>Style:</span><span className="text-foreground font-medium capitalize">{state.strategy_style}</span>
          <span>ORB:</span><span className="text-foreground font-medium">{state.orb_duration_mins} min, {state.momentum_bars} bars</span>
          <span>SL / TP:</span><span className="text-foreground font-medium">{state.sl_pct}% / {state.tp_pct}%</span>
          <span>Time Exit:</span><span className="text-foreground font-medium">{state.time_exit_hhmm} IST</span>
          <span>Mode:</span>
          <span className={state.is_paper_only ? "text-blue-400 font-semibold" : "text-red-400 font-semibold"}>
            {state.is_paper_only ? "Paper Only" : "Live Trading"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Dialog ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editStrategy?: OptionsStrategy | null;
  onSaved: () => void;
}

function stateToDbPayload(state: WizardState, userId: string, editStrategy: OptionsStrategy | null | undefined) {
  const base = stateToDb(state, userId);
  return {
    ...base,
    is_active: editStrategy ? editStrategy.is_active : false,
  };
}

export function OptionsStrategyBuilderDialog({ open, onOpenChange, editStrategy, onSaved }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);

  useEffect(() => {
    if (open) {
      setStep(0);
      setState(editStrategy ? dbToState(editStrategy) : DEFAULT_STATE);
    }
  }, [open, editStrategy]);

  const set = useCallback((key: keyof WizardState, value: unknown) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const canNext = () => {
    if (step === 0) return state.name.trim().length >= 2;
    return true;
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const payload = stateToDbPayload(state, user.id, editStrategy);
      let error;
      if (editStrategy) {
        ({ error } = await (supabase as any)
          .from("options_strategies")
          .update(payload)
          .eq("id", editStrategy.id));
      } else {
        ({ error } = await (supabase as any)
          .from("options_strategies")
          .insert(payload));
      }
      if (error) throw error;
      toast.success(editStrategy ? "Strategy updated!" : "Strategy created!");
      onSaved();
    } catch (err: unknown) {
      toast.error(`Failed to save: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    <Step1 key="s1" state={state} set={set} />,
    <Step2 key="s2" state={state} set={set} />,
    <Step3 key="s3" state={state} set={set} />,
    <Step4 key="s4" state={state} set={set} />,
    <Step5 key="s5" state={state} set={set} />,
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editStrategy ? "Edit" : "New"} Options Strategy — {STEP_TITLES[step]}
          </DialogTitle>

          {/* Step progress */}
          <div className="flex gap-1.5 mt-2">
            {STEP_TITLES.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </DialogHeader>

        <div className="py-2">{steps[step]}</div>

        <DialogFooter className="flex-row justify-between gap-2 pt-2 border-t border-border/50">
          <Button
            variant="outline"
            size="sm"
            onClick={() => step > 0 ? setStep(step - 1) : onOpenChange(false)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          {step < steps.length - 1 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={saving || !canNext()}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              {editStrategy ? "Save Changes" : "Create Strategy"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
