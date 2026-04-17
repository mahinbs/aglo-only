import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { tradeTrackingService, ActiveTrade } from "@/services/tradeTrackingService";
import { isUsdDenominatedSymbol } from "@/lib/tradingview-symbols";
import { supabase } from "@/integrations/supabase/client";
import YahooChartPanel from "@/components/YahooChartPanel";
import {
    ArrowLeft, Loader2, TrendingDown, TrendingUp, Target,
    AlertTriangle, CheckCircle, X, ExternalLink
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ActionSignal } from "@/components/prediction/ActionSignal";
import { RiskGrade } from "@/components/prediction/RiskGrade";
import { CountdownTimer } from "@/components/tracking/CountdownTimer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Drawer, DrawerContent, DrawerDescription, DrawerHeader,
    DrawerTitle, DrawerFooter, DrawerClose,
} from "@/components/ui/drawer";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeEntrySlippage, formatSlippageLine } from "@/lib/tradeSlippage";

export default function ActiveTradeDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [trade, setTrade] = useState<ActiveTrade | null>(null);
    const [loading, setLoading] = useState(true);
    const [displayCurrency] = useState<"INR" | "USD">("INR");
    const [usdPerInr, setUsdPerInr] = useState<number | null>(null);
    const [manageDrawerOpen, setManageDrawerOpen] = useState(false);
    const [closing, setClosing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [addToPositionOpen, setAddToPositionOpen] = useState(false);
    const [addQuantity, setAddQuantity] = useState("");
    const [adding, setAdding] = useState(false);
    /** Latest quote in quote currency (same as DB). Updated on every tick so "Add" uses the price at click time. */
    const latestQuoteRef = useRef<number | null>(null);

    useEffect(() => {
        const loadTrade = async () => {
            if (!id) return;
            const { data, error } = await tradeTrackingService.getTrade(id);
            if (error) {
                toast({ title: "Error", description: "Failed to load trade details.", variant: "destructive" });
                navigate("/active-trades");
            } else {
                setTrade(data);
            }
            setLoading(false);
        };
        loadTrade();
    }, [id, navigate, toast]);

    useEffect(() => {
        if (!trade || !isUsdDenominatedSymbol(trade.symbol) || usdPerInr !== null) return;
        const loadFx = async () => {
            try {
                const res = await fetch("https://open.er-api.com/v6/latest/INR");
                const json = await res.json();
                if (json?.rates?.USD) setUsdPerInr(json.rates.USD);
            } catch (e) { console.error("FX load error", e); }
        };
        loadFx();
    }, [trade, usdPerInr]);

    const applyLiveQuote = useCallback((price: number) => {
        if (!Number.isFinite(price) || price <= 0) return;
        latestQuoteRef.current = price;
        setTrade((prev) => {
            if (!prev) return prev;
            const pnl = (price - prev.entryPrice) * prev.shares * (prev.action === "SELL" ? -1 : 1);
            const pnlPct = prev.investmentAmount > 0 ? (pnl / prev.investmentAmount) * 100 : 0;
            return {
                ...prev,
                currentPrice: price,
                currentPnl: pnl,
                currentPnlPercentage: pnlPct,
                lastPriceUpdate: new Date().toISOString(),
            };
        });
    }, []);

    useEffect(() => {
        if (!trade) return;
        const p = trade.currentPrice ?? trade.entryPrice;
        if (p != null && p > 0) latestQuoteRef.current = p;
    }, [trade?.id, trade?.currentPrice, trade?.entryPrice]);

    // While "Add" is open, poll quotes so the modal price keeps moving even if chart WS is quiet behind the overlay.
    useEffect(() => {
        if (!addToPositionOpen || !trade?.symbol) return;
        let cancelled = false;
        const poll = async () => {
            if (cancelled) return;
            try {
                const { data, error } = await supabase.functions.invoke("get-chart-data", {
                    body: { symbol: trade.symbol, interval: "1m", range: "1d" },
                });
                if (cancelled || error) return;
                const p = Number((data as { meta?: { regularMarketPrice?: number } })?.meta?.regularMarketPrice);
                if (Number.isFinite(p) && p > 0) applyLiveQuote(p);
            } catch {
                /* ignore */
            }
        };
        void poll();
        const id = window.setInterval(poll, 2000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [addToPositionOpen, trade?.symbol, applyLiveQuote]);

    const convertAmount = (value: number | undefined) => {
        const v = value ?? 0;
        const assetCurrency = trade && isUsdDenominatedSymbol(trade.symbol) ? "USD" : "INR";
        if (displayCurrency === assetCurrency) return v;
        if (displayCurrency === "USD" && assetCurrency === "INR" && usdPerInr) return v * usdPerInr;
        if (displayCurrency === "INR" && assetCurrency === "USD" && usdPerInr) return v / usdPerInr;
        return v;
    };

    // Sell action:
    // - real trade => square off via broker, then close in DB
    // - paper/manual => close in DB only
    const handleCloseTracking = async () => {
        if (!trade) return;
        setClosing(true);
        const isPaperTrade = trade.brokerOrderId?.startsWith("PAPER-") ?? false;
        if (!isPaperTrade && trade.brokerOrderId) {
            const { exitOrderId, error } = await tradeTrackingService.squareOff(trade.id);
            if (!error) {
                toast({
                    title: "Trade Squared Off",
                    description: exitOrderId
                        ? `Exit order placed on broker. Order ID: ${exitOrderId}`
                        : "Exit order placed on broker.",
                });
                navigate("/active-trades");
            } else {
                toast({ title: "Error", description: error, variant: "destructive" });
            }
        } else {
            const { error } = await tradeTrackingService.closeTrade(trade.id, trade.currentPrice || trade.entryPrice);
            if (!error) {
                toast({ title: "Trade Closed", description: "Successfully closed active tracking." });
                navigate("/active-trades");
            } else {
                toast({ title: "Error", description: "Failed to close trade.", variant: "destructive" });
            }
        }
        setClosing(false);
    };

    // Stop Tracking (cancel / remove the trade record)
    const handleStopTracking = async () => {
        if (!trade) return;
        setCancelling(true);
        const { error } = await tradeTrackingService.cancelTrade(trade.id);
        if (!error) {
            toast({ title: "Tracking Stopped", description: "Trade removed from tracking." });
            navigate("/active-trades");
        } else {
            toast({ title: "Error", description: "Failed to stop tracking.", variant: "destructive" });
        }
        setCancelling(false);
    };

    if (loading || !trade) {
        return (
            <div className="min-h-[100dvh] bg-[#111114] text-white flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const assetCurrency = isUsdDenominatedSymbol(trade.symbol) ? "USD" : "INR";
    const currencySymbol = displayCurrency === "USD" ? "$" : "₹";
    const convertedPnl = convertAmount(trade.currentPnl);
    const pnlPct = trade.currentPnlPercentage ?? 0;
    const isNeutral = Math.abs(convertedPnl) < 0.005 && Math.abs(pnlPct) < 0.005;
    const isPositive = !isNeutral && convertedPnl > 0;
    const pnlTextClass = isNeutral ? "text-slate-400" : isPositive ? "text-[#1db152]" : "text-[#e53935]";
    const pnlCardClass = isNeutral ? "text-slate-400" : isPositive ? "text-[#1db152]" : "text-red-400";
    const pnlPrefix = isNeutral ? "" : isPositive ? "+" : "";
    const displayPnl = isNeutral ? 0 : convertedPnl;
    const displayPnlPct = isNeutral ? 0 : pnlPct;
    const formatPrice = (p: number) => p < 10 ? p.toFixed(5) : p.toFixed(2);
    const isNearStopLoss = trade.stopLossPrice && trade.currentPrice &&
        Math.abs(trade.currentPrice - trade.stopLossPrice) / trade.stopLossPrice < 0.05;
    const isNearTarget = trade.takeProfitPrice && trade.currentPrice &&
        Math.abs(trade.currentPrice - trade.takeProfitPrice) / trade.takeProfitPrice < 0.05;
    const strategyLabel = trade.strategyType
        ? trade.strategyType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Not specified";
    const isPaperTrade = trade.brokerOrderId?.startsWith("PAPER-") ?? false;

    const handleAddToPosition = async () => {
        const qty = parseFloat(addQuantity);
        // Prefer ref (last tick / poll) so we never use a stale render; fallback to state.
        const px =
            latestQuoteRef.current ??
            trade.currentPrice ??
            trade.entryPrice;
        if (!Number.isFinite(qty) || qty <= 0) return;
        if (!Number.isFinite(px) || px <= 0) {
            toast({
                title: "No live price",
                description: "Wait for the chart to load a live price, then try again.",
                variant: "destructive",
            });
            return;
        }
        setAdding(true);
        const { data, error } = await tradeTrackingService.addToPosition({
            tradeId: trade.id,
            quantity: qty,
            marketPrice: px,
            currentPrice: px,
            allowFractional: isUsdDenominatedSymbol(trade.symbol),
        });
        setAdding(false);
        if (!error && data) {
            const sym = currencySymbol;
            const addNotional = qty * px;
            toast({
                title: "Position updated",
                description: `Added ${qty} at ${sym}${formatPrice(px)}. Average entry updated. Total ~${sym}${(trade.investmentAmount + addNotional).toFixed(2)}.`,
            });
            setAddToPositionOpen(false);
            setAddQuantity("");
            const { data: updated } = await tradeTrackingService.getTrade(trade.id);
            if (updated) setTrade(updated);
        } else {
            toast({ title: "Error", description: error || "Failed to add to position", variant: "destructive" });
        }
    };

    // Action panel (shared between desktop inline and mobile drawer)
    const ActionPanel = () => (
        <div className="space-y-3">
            {/* Add to Position */}
            <Button
                variant="default"
                className="w-full bg-teal-600 hover:bg-teal-500 text-white py-5"
                onClick={() => setAddToPositionOpen(true)}
            >
                <TrendingUp className="h-4 w-4 mr-2" />
                {trade.action === "SELL" ? "Sell More / Add to Short" : "Buy More / Add to Position"}
            </Button>

            {/* View on Yahoo Finance */}
            <Button
                variant="outline"
                className="w-full border-white/10 text-slate-300 hover:bg-white/5 hover:text-white py-5"
                onClick={() => window.open(`https://finance.yahoo.com/chart/${encodeURIComponent(trade.symbol)}`, '_blank')}
            >
                <ExternalLink className="h-4 w-4 mr-2" />
                View on Yahoo Finance
            </Button>

            {/* Primary: Close Tracking (Sell / mark done) */}
            <div className="grid grid-cols-2 gap-2">
                <Button
                    variant="outline"
                    className="border-green-600 text-green-500 hover:bg-green-600 hover:text-white py-5"
                    onClick={handleCloseTracking}
                    disabled={closing || cancelling}
                >
                    {closing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    Sell
                </Button>

                <Button
                    variant="ghost"
                    className="text-slate-400 hover:text-white hover:bg-white/5 py-5"
                    onClick={handleStopTracking}
                    disabled={closing || cancelling}
                >
                    {cancelling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
                    Stop tracking
                </Button>
            </div>

            <p className="text-[11px] text-center text-slate-500 leading-relaxed">
                "Sell" squares off on broker for real trades (paper trades close in ChartMate only).
                {trade.exchange && !isUsdDenominatedSymbol(trade.symbol)
                    ? ` Exchange: ${trade.exchange}.`
                    : ""}{" "}
                "Stop tracking" only removes it from tracking.
            </p>
        </div>
    );

    return (
        <div className="bg-[#111114] text-slate-200 font-sans">
            <div className="flex flex-col gap-4 min-h-[100dvh] max-w-[90rem] mx-auto">
                {/* ── Header ── */}
                <div className="flex items-center h-14 px-4 lg:px-8 bg-[#111114] border-b border-white/5 sticky top-0 z-50 shrink-0">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-400 hover:text-white transition">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div className="flex-1 text-center font-bold text-lg tracking-tight pr-7">
                        {trade.symbol.replace('-USD', '')}
                    </div>
                </div>

                {/* ── Main Layout ── */}
                <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_400px] lg:overflow-hidden">

                    {/* ═══════════════════════════
                    LEFT — Price Hero + Chart
                    ═══════════════════════════ */}
                    <div className="flex flex-col lg:overflow-y-auto">

                        {/* Hero Price Blocks */}
                        <div className="flex flex-col sm:flex-row mt-4 lg:mt-6 px-4 lg:px-6 gap-2">
                            <div className="flex-1 bg-[#1e2025] rounded-xl py-5 px-5 flex flex-col gap-1 border border-white/5">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Entry Price</span>
                                <span className="text-2xl font-bold text-white tracking-tight">
                                    {currencySymbol}{formatPrice(convertAmount(trade.entryPrice))}
                                </span>
                            </div>
                            <div className={`flex-1 rounded-xl py-5 px-5 flex flex-col gap-1 relative overflow-hidden ${trade.action === "BUY" ? "bg-[#1db152]" : "bg-[#e53935]"}`}>
                                <div className="absolute inset-0 bg-black/10" />
                                <span className="relative z-10 text-[10px] font-semibold text-white/70 uppercase tracking-widest">
                                    {trade.action} · Live
                                </span>
                                <span className="relative z-10 text-2xl font-bold text-white tracking-tight drop-shadow-sm">
                                    {currencySymbol}{formatPrice(convertAmount(trade.currentPrice || trade.entryPrice))}
                                </span>
                            </div>
                        </div>

                        {/* Signal Badges */}
                        <div className="flex items-center flex-wrap gap-2 mt-3 px-4 lg:px-6">
                            <ActionSignal action={trade.action} confidence={trade.confidence || 0} size="sm" />
                            {trade.riskGrade && <RiskGrade level={trade.riskGrade as any} size="sm" />}
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide border-white/10 text-slate-300">
                                {strategyLabel}
                            </Badge>
                            {isPaperTrade && (
                                <Badge className="bg-violet-500/15 text-violet-400 border border-violet-500/40 text-[10px] uppercase tracking-wide">
                                    🧪 Paper Trade
                                </Badge>
                            )}
                        </div>

                        {/* Investment line */}
                        <div className="mt-3 lg:mt-4 px-4 lg:px-6 border-b border-white/8 pb-3">
                            <p className="text-[11px] text-slate-500 mb-0.5">Investment Amount</p>
                            <div className="flex items-baseline justify-between">
                                <span className="text-xl font-semibold text-white">
                                    {currencySymbol}{convertAmount(trade.investmentAmount).toFixed(2)}
                                </span>
                                <div className="text-[11px] text-slate-500 flex gap-4">
                                    <span>Shares: {trade.shares}</span>
                                    <span>{assetCurrency}</span>
                                </div>
                            </div>
                            {(() => {
                                const refPx = trade.referenceEntryPrice ?? trade.entryPrice;
                                const slip = computeEntrySlippage(trade.action, trade.referenceEntryPrice, trade.entryPrice);
                                const slipMoney = (n: number) => `${currencySymbol}${formatPrice(convertAmount(n))}`;
                                return (
                                    <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 space-y-1">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Execution vs reference</p>
                                        <p className="text-xs text-slate-300">
                                            Reference quote: {slipMoney(refPx)} · Fill: {slipMoney(trade.entryPrice)}
                                        </p>
                                        <p className={`text-xs font-medium ${slip.isZero ? "text-slate-400" : slip.isAdverse ? "text-amber-400" : "text-teal-400"}`}>
                                            {formatSlippageLine(trade.action, trade.referenceEntryPrice, trade.entryPrice, slipMoney)}
                                        </p>
                                        {trade.shares > 0 && !slip.isZero && (
                                            <p className="text-[11px] text-slate-500">
                                                On {trade.shares} share{trade.shares === 1 ? "" : "s"}: ~{slipMoney(slip.slipPerShare * trade.shares)} vs reference notional
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Chart */}
                        <div className="mt-0 lg:flex-1 h-[45vh] lg:h-full min-h-[300px] bg-[#0d0e10] border-t border-white/5">
                            <YahooChartPanel
                                symbol={trade.symbol}
                                displayName={trade.symbol}
                                onLivePrice={applyLiveQuote}
                            />
                        </div>

                        {/* PnL Bar */}
                        <div className="px-6 py-4 border-t border-white/5 bg-[#111114] grid grid-cols-3 gap-4">
                            <div>
                                <p className="text-[10px] text-slate-500 mb-0.5">Return</p>
                                <p className={`text-base font-semibold ${pnlTextClass}`}>
                                    {pnlPrefix}{currencySymbol}{displayPnl.toFixed(2)}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 mb-0.5">Percentage</p>
                                <p className={`text-base font-semibold ${pnlTextClass}`}>
                                    {pnlPrefix}{displayPnlPct.toFixed(2)}%
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] text-slate-500 mb-0.5">Status</p>
                                <p className="text-base font-semibold text-white capitalize">
                                    {trade.status.replace("_", " ")}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ═══════════════════════════
                    RIGHT — Details Sidebar
                    ═══════════════════════════ */}
                    <div className="border-t lg:border-t-0 lg:border-l border-white/5 bg-[#141517] lg:overflow-y-auto flex flex-col">
                        <div className="p-5 lg:p-6 space-y-5 flex-1">

                            {/* Live P/L */}
                            <div className={`rounded-xl border p-4 ${isNeutral ? 'border-slate-500/30 bg-slate-500/10' : isPositive ? 'border-[#1db152]/40 bg-[#1db152]/10' : 'border-red-500/40 bg-red-500/10'}`}>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider">Live Profit / Loss</p>
                                <p className={`text-2xl font-bold mt-1 ${pnlCardClass}`}>
                                    {pnlPrefix}{currencySymbol}{displayPnl.toFixed(2)}
                                </p>
                                <p className={`text-sm font-semibold mt-1 ${pnlCardClass}`}>
                                    {pnlPrefix}{displayPnlPct.toFixed(2)}%
                                </p>
                            </div>

                            {/* Stop Loss / Take Profit */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className={`p-4 rounded-xl border ${isNearStopLoss ? 'border-red-500/40 bg-red-500/10' : 'border-white/8 bg-white/4'}`}>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">Stop Loss</span>
                                    </div>
                                    <p className="text-lg font-bold text-red-500 leading-tight">
                                        {trade.stopLossPrice != null ? `${currencySymbol}${convertAmount(trade.stopLossPrice).toFixed(2)}` : "N/A"}
                                    </p>
                                    {trade.stopLossPercentage && (
                                        <p className="text-xs text-slate-500 mt-1">-{trade.stopLossPercentage}%</p>
                                    )}
                                </div>

                                <div className={`p-4 rounded-xl border ${isNearTarget ? 'border-[#1db152]/40 bg-[#1db152]/10' : 'border-white/8 bg-white/4'}`}>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Target className="h-3.5 w-3.5 text-[#1db152]" />
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wider">Take Profit</span>
                                    </div>
                                    <p className="text-lg font-bold text-[#1db152] leading-tight">
                                        {trade.takeProfitPrice != null ? `${currencySymbol}${convertAmount(trade.takeProfitPrice).toFixed(2)}` : "N/A"}
                                    </p>
                                    {trade.targetProfitPercentage && (
                                        <p className="text-xs text-slate-500 mt-1">+{trade.targetProfitPercentage}%</p>
                                    )}
                                </div>
                            </div>

                            {/* Countdown */}
                            {trade.expectedExitTime && (
                                <div className="p-4 rounded-xl border border-white/8 bg-white/4 text-slate-200">
                                    <CountdownTimer targetTime={trade.expectedExitTime} label="Holding Period" size="sm" />
                                </div>
                            )}

                            {/* Alerts */}
                            <div className="space-y-2">
                                {isNearStopLoss && (
                                    <Alert variant="destructive" className="bg-red-500/10 border-red-500/40 text-red-400 py-2.5">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <AlertDescription className="text-xs">Price within 5% of stop loss!</AlertDescription>
                                    </Alert>
                                )}
                                {isNearTarget && (
                                    <Alert className="bg-[#1db152]/10 border-[#1db152]/40 text-[#1db152] py-2.5">
                                        <TrendingUp className="h-3.5 w-3.5" />
                                        <AlertDescription className="text-xs">Price within 5% of take profit!</AlertDescription>
                                    </Alert>
                                )}
                                {trade.status === 'exit_zone' && (
                                    <Alert className="bg-orange-500/10 border-orange-500/40 text-orange-400 py-2.5">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <AlertDescription className="text-xs">Exit Zone warning only. Auto-exit triggers when SL/TP/holding-end is actually hit.</AlertDescription>
                                    </Alert>
                                )}
                                {trade.leverage && trade.leverage > 1 && (
                                    <Alert className="bg-yellow-500/10 border-yellow-500/40 text-yellow-400 py-2.5">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        <AlertDescription className="text-xs">{trade.leverage}x leverage — P&L is amplified</AlertDescription>
                                    </Alert>
                                )}
                            </div>

                            {/* Metadata */}
                            <div className="space-y-2.5 pt-2 border-t border-white/8 text-xs text-slate-400">
                                <div className="flex justify-between items-center">
                                    <span>Investment</span>
                                    <span className="font-medium text-slate-200">{currencySymbol}{convertAmount(trade.investmentAmount).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Shares</span>
                                    <span className="font-medium text-slate-200">{trade.shares}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Multiplier</span>
                                    <span className="font-medium text-slate-200">{trade.leverage || 1}x</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Account Type</span>
                                    <span className="font-medium capitalize text-slate-200">{trade.marginType || 'cash'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Holding Period</span>
                                    <span className="font-medium text-slate-200">
                                        {trade.holdingPeriod === 'none' || (!trade.holdingPeriod && !trade.aiRecommendedHoldPeriod)
                                            ? 'Unlimited ∞'
                                            : (trade.holdingPeriod || trade.aiRecommendedHoldPeriod)}
                                    </span>
                                </div>
                                {trade.exchange && (
                                    <div className="flex justify-between items-center">
                                        <span>Exchange</span>
                                        <span className="font-medium text-slate-200">{trade.exchange}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span>Entry Time</span>
                                    <span className="font-medium text-slate-200">{new Date(trade.entryTime).toLocaleString()}</span>
                                </div>
                                {trade.lastPriceUpdate && (
                                    <div className="flex justify-between items-center">
                                        <span>Last Update</span>
                                        <span className="font-medium text-slate-200">
                                            {new Date(trade.lastPriceUpdate).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* ── Desktop inline action panel ── */}
                            <div className="hidden lg:block pt-3 border-t border-white/8">
                                <ActionPanel />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Mobile: Fixed bottom CTA ── */}
                <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0d0e10] via-[#111114]/90 to-transparent pointer-events-none z-40">
                    <button
                        onClick={() => setManageDrawerOpen(true)}
                        className="w-full bg-[#1db152] hover:bg-[#199d48] text-white font-semibold text-lg py-5 rounded-2xl shadow-xl pointer-events-auto active:scale-[0.98] transition-all tracking-wide"
                    >
                        Manage Trade
                    </button>
                </div>
                <div className="lg:hidden h-24 shrink-0" />

                {/* ── Mobile Drawer ── */}
                <Drawer open={manageDrawerOpen} onOpenChange={setManageDrawerOpen}>
                    <DrawerContent className="bg-[#1a1b1e] text-white border-white/5">
                        <DrawerHeader>
                            <DrawerTitle>Manage Position</DrawerTitle>
                            <DrawerDescription className="text-slate-400">
                                Select an action for {trade.symbol}
                            </DrawerDescription>
                        </DrawerHeader>
                        <div className="p-4 pb-2">
                            <ActionPanel />
                        </div>
                        <DrawerFooter className="pt-1">
                            <DrawerClose asChild>
                                <Button variant="ghost" className="w-full py-5 text-slate-400">
                                    Cancel
                                </Button>
                            </DrawerClose>
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>

                {/* Add to Position Dialog */}
                <Dialog
                    open={addToPositionOpen}
                    onOpenChange={(open) => {
                        setAddToPositionOpen(open);
                        if (open) setAddQuantity("");
                    }}
                >
                    <DialogContent className="bg-[#1a1b1e] text-white border-white/10 sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>{trade.action === "SELL" ? "Add to Short Position" : "Add to Position"}</DialogTitle>
                            <DialogDescription className="sr-only">
                                Enter quantity to add. Fill uses live price when you confirm.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-5 py-2">
                            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-center">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Live price</p>
                                <p className="text-xl font-semibold text-[#1db152] tabular-nums transition-colors duration-150">
                                    {trade.currentPrice != null && trade.currentPrice > 0
                                        ? `${currencySymbol}${formatPrice(convertAmount(trade.currentPrice))}`
                                        : trade.entryPrice > 0
                                            ? `${currencySymbol}${formatPrice(convertAmount(trade.entryPrice))}`
                                            : "—"}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-2">
                                    Updates with the chart and every 2s while this dialog is open. Add uses the latest value at the moment you tap Add.
                                </p>
                            </div>
                            <div>
                                <Label htmlFor="add-qty" className="text-slate-300">Quantity to add</Label>
                                <Input
                                    id="add-qty"
                                    type="number"
                                    min="0.00000001"
                                    step={isUsdDenominatedSymbol(trade.symbol) ? "0.000001" : "1"}
                                    placeholder="e.g. 1"
                                    value={addQuantity}
                                    onChange={(e) => setAddQuantity(e.target.value)}
                                    className="mt-2 bg-white/5 border-white/10 text-white"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setAddToPositionOpen(false);
                                    setAddQuantity("");
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAddToPosition}
                                disabled={
                                    !addQuantity ||
                                    parseFloat(addQuantity) <= 0 ||
                                    adding ||
                                    !(latestQuoteRef.current ?? trade.currentPrice ?? trade.entryPrice)
                                }
                                className="bg-teal-600 hover:bg-teal-500"
                            >
                                {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Add {addQuantity ? parseFloat(addQuantity).toFixed(isUsdDenominatedSymbol(trade.symbol) ? 6 : 0) : "0"} @ live
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
