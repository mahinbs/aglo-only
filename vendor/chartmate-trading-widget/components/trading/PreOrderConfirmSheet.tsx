/**
 * PreOrderConfirmSheet
 *
 * Final deep-analysis confirmation before a LIVE order fires.
 * Shows after the user picks their strategy in StrategySelectionDialog
 * but BEFORE the actual broker order is placed.
 *
 * Runs a quick Gemini analysis on the exact trade setup and shows:
 *  - AI verdict + confidence
 *  - Risk grade
 *  - Expected ROI (best / likely / worst)
 *  - SL & TP prices
 *  - Key warnings
 *  - 10-second countdown auto-confirm OR manual buttons
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Brain,
  CheckCircle2, Loader2, ShieldAlert, Target, TrendingDown, TrendingUp, Wallet, Zap,
} from "lucide-react";

export interface PreOrderData {
  symbol:       string;
  action:       "BUY" | "SELL";
  quantity:     number;
  price:        number;
  exchange:     string;
  product:      string;
  strategy:     string;
  stopLoss?:    number;
  takeProfit?:  number;
  investment?:  number;
  pricetype?:   string;
}

interface Props {
  open:       boolean;
  onConfirm:  () => void;
  onCancel:   () => void;
  order:      PreOrderData | null;
}

interface PreAnalysis {
  verdict:      "strong_buy" | "buy" | "neutral" | "sell" | "avoid";
  confidence:   number;  // 0-100
  risk_grade:   "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  expected_roi: { best: number; likely: number; worst: number };
  warnings:     string[];
  summary:      string;
}

const VERDICT_CFG = {
  strong_buy: { label: "Strong Buy",  color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", icon: TrendingUp },
  buy:        { label: "Buy",         color: "text-teal-400",    bg: "bg-teal-500/10 border-teal-500/30",       icon: TrendingUp },
  neutral:    { label: "Neutral",     color: "text-zinc-300",    bg: "bg-zinc-700/30 border-zinc-600",          icon: Zap },
  sell:       { label: "Sell",        color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/30",   icon: TrendingDown },
  avoid:      { label: "Avoid",       color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30",         icon: TrendingDown },
};

const RISK_CFG = {
  LOW:     "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  MEDIUM:  "text-amber-400   bg-amber-500/10   border-amber-500/30",
  HIGH:    "text-orange-400  bg-orange-500/10  border-orange-500/30",
  EXTREME: "text-red-400     bg-red-500/10     border-red-500/30",
};

const COUNTDOWN_SECS = 12;

export default function PreOrderConfirmSheet({ open, onConfirm, onCancel, order }: Props) {
  const [analysis, setAnalysis]   = useState<PreAnalysis | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECS);
  const [margin, setMargin]       = useState<number | null>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ── Run pre-order AI analysis ─────────────────────────────────────────────
  const runAnalysis = useCallback(async (o: PreOrderData) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("predict-movement", {
        body: {
          symbol:     o.symbol,
          action:     o.action,
          investment: o.investment ?? o.price * o.quantity,
          timeframe:  "1d",
          mode:       "pre_order_check",
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      const d = res.data as any;
      if (res.error || !d) throw new Error(res.error?.message ?? "Analysis failed");

      // Map predict-movement response to our PreAnalysis shape
      const forecast = d?.geminiForecast ?? d;
      const actionSig = forecast?.action_signal ?? {};
      const roi = forecast?.expected_roi ?? {};

      const rawVerdict = (actionSig?.action ?? o.action ?? "neutral").toLowerCase();
      const verdict: PreAnalysis["verdict"] =
        rawVerdict === "buy"  ? (Number(actionSig?.confidence ?? 0) > 75 ? "strong_buy" : "buy")  :
        rawVerdict === "sell" ? "sell" :
        rawVerdict === "hold" ? "neutral" : "neutral";

      setAnalysis({
        verdict,
        confidence:   Number(actionSig?.confidence ?? 65),
        risk_grade:   (forecast?.risk_grade ?? "MEDIUM") as PreAnalysis["risk_grade"],
        expected_roi: {
          best:   Number(roi?.best_case   ?? 0),
          likely: Number(roi?.likely_case ?? 0),
          worst:  Number(roi?.worst_case  ?? 0),
        },
        warnings: (forecast?.risk_factors ?? []).slice(0, 3),
        summary:  forecast?.summary ?? actionSig?.rationale ?? "Analysis complete.",
      });
    } catch (e: any) {
      // Non-blocking — still allow order to proceed
      setError("AI analysis unavailable. You can still place the order.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Start countdown once analysis is ready (or after timeout) ────────────
  useEffect(() => {
    if (!open) { clearTimer(); setCountdown(COUNTDOWN_SECS); return; }
    if (loading) return;

    setCountdown(COUNTDOWN_SECS);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearTimer(); onConfirm(); return 0; }
        return c - 1;
      });
    }, 1000);

    return clearTimer;
  }, [open, loading, onConfirm]);

  // ── Fetch margin requirement from broker ─────────────────────────────────
  const fetchMargin = useCallback(async (o: PreOrderData) => {
    setMargin(null);
    setMarginLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("broker-data", {
        body: {
          action: "margin",
          positions: [{
            symbol:    o.symbol,
            exchange:  o.exchange ?? "NSE",
            action:    o.action,
            quantity:  o.quantity,
            product:   o.product ?? "CNC",
            pricetype: o.pricetype ?? "MARKET",
            price:     o.price,
          }],
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const raw = (res.data as any)?.data;
      const val = raw?.required_margin ?? raw?.margin ?? raw?.total_margin ?? null;
      if (val != null) setMargin(Number(val));
    } catch {
      // non-critical — silently ignore
    } finally {
      setMarginLoading(false);
    }
  }, []);

  // ── Fetch analysis when sheet opens ──────────────────────────────────────
  useEffect(() => {
    if (open && order) {
      clearTimer();
      setMargin(null);
      runAnalysis(order);
      fetchMargin(order);
    }
  }, [open, order, runAnalysis, fetchMargin]);

  if (!order) return null;

  const vCfg = VERDICT_CFG[analysis?.verdict ?? "neutral"];
  const VIcon = vCfg.icon;
  const isBuy = order.action === "BUY";
  const currency = order.exchange === "NSE" || order.exchange === "BSE" ? "₹" : "$";
  const orderValue = order.price * order.quantity;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onCancel()}>
      <SheetContent side="bottom" className="bg-zinc-950 border-t border-zinc-800 max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-white flex items-center gap-2 text-lg">
            <Brain className="h-5 w-5 text-teal-400" />
            Pre-Order AI Analysis
          </SheetTitle>
          <SheetDescription className="text-zinc-400 text-sm">
            Deep analysis of this trade before your money moves. Review carefully.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Order summary */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {isBuy
                ? <ArrowUpRight className="h-8 w-8 text-emerald-400 bg-emerald-500/10 rounded-lg p-1.5" />
                : <ArrowDownRight className="h-8 w-8 text-red-400 bg-red-500/10 rounded-lg p-1.5" />}
              <div>
                <p className="font-black text-xl text-white">{order.symbol}</p>
                <p className="text-zinc-400 text-sm">{order.strategy} · {order.exchange} · {order.product}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-black text-2xl ${isBuy ? "text-emerald-400" : "text-red-400"}`}>
                {order.action}
              </p>
              <p className="text-zinc-300 text-sm font-semibold">
                {order.quantity} shares @ {currency}{order.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-zinc-500 text-xs">= {currency}{orderValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              {(margin != null || marginLoading) && (
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <Wallet className="h-3 w-3 text-amber-400" />
                  <p className="text-[10px] text-amber-300">
                    {marginLoading
                      ? "Fetching margin…"
                      : `Margin required: ${currency}${Number(margin).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* SL / TP */}
          {(order.stopLoss || order.takeProfit) && (
            <div className="grid grid-cols-2 gap-3">
              {order.stopLoss && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-red-400">Stop Loss</p>
                    <p className="font-bold text-sm text-white">{currency}{order.stopLoss.toFixed(2)}</p>
                    <p className="text-[10px] text-red-500">Auto-exit if breached</p>
                  </div>
                </div>
              )}
              {order.takeProfit && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-emerald-400">Take Profit</p>
                    <p className="font-bold text-sm text-white">{currency}{order.takeProfit.toFixed(2)}</p>
                    <p className="text-[10px] text-emerald-500">Auto-exit when hit</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI analysis */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
              <span className="text-sm">Running deep AI analysis…</span>
            </div>
          )}

          {error && (
            <Alert className="bg-zinc-900 border-zinc-700">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-zinc-400 text-sm">{error}</AlertDescription>
            </Alert>
          )}

          {analysis && (
            <div className="space-y-3">
              {/* Verdict + confidence */}
              <div className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${vCfg.bg}`}>
                <div className="flex items-center gap-2">
                  <VIcon className={`h-5 w-5 ${vCfg.color} shrink-0`} />
                  <div>
                    <p className={`font-black text-base ${vCfg.color}`}>{vCfg.label}</p>
                    <p className="text-zinc-300 text-xs mt-0.5 max-w-xs">{analysis.summary}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <Badge className={`border text-xs ${RISK_CFG[analysis.risk_grade]}`}>
                    {analysis.risk_grade} RISK
                  </Badge>
                  <p className="text-xs text-zinc-400 mt-1">AI Confidence</p>
                  <p className={`font-black text-lg ${vCfg.color}`}>{analysis.confidence}%</p>
                </div>
              </div>

              {/* Expected ROI */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Best Case",   val: analysis.expected_roi.best,   color: "text-emerald-400" },
                  { label: "Likely",      val: analysis.expected_roi.likely,  color: "text-teal-300" },
                  { label: "Worst Case",  val: analysis.expected_roi.worst,   color: "text-red-400" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-center">
                    <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
                    <p className={`font-bold text-sm ${color}`}>
                      {val >= 0 ? "+" : ""}{val.toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>

              {/* Warnings */}
              {analysis.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {analysis.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Countdown + action buttons */}
          {!loading && (
            <div className="space-y-3 pt-2 pb-safe">
              {countdown > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Auto-confirming in {countdown}s</span>
                    <span className="text-zinc-600">or choose below</span>
                  </div>
                  <Progress value={(1 - countdown / COUNTDOWN_SECS) * 100} className="h-1.5 bg-zinc-800 [&>div]:bg-teal-500" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => { clearTimer(); onCancel(); }}
                  className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-bold py-5"
                >
                  Cancel Order
                </Button>
                <Button
                  onClick={() => { clearTimer(); onConfirm(); }}
                  className={`font-black py-5 text-base ${
                    isBuy
                      ? "bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 text-white"
                      : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirm {order.action}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
