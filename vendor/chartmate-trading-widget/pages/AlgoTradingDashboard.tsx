/**
 * AlgoTradingDashboard — /algo-trading
 *
 * The user's full real-money trading workspace.
 * Everything here goes through OpenAlgo invisibly:
 *   1. Broker sync (daily token)
 *   2. Live account data (funds, positions, holdings, orders)
 *   3. Place orders — symbol, qty, product, order type
 *   4. AI quick analysis before placing
 *   5. Strategy management
 *
 * Broker limitations are enforced: e.g. Zerodha = Indian equities only, no crypto.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BrokerSyncSection, ALL_BROKERS } from "@/components/trading/BrokerSyncSection";
import { BrokerPortfolioCard } from "@/components/trading/BrokerPortfolioCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, ArrowLeft, BarChart3, BookOpen, Brain,
  ChevronRight, Loader2, ShoppingCart, TrendingDown, TrendingUp, Zap, LineChart,
} from "lucide-react";
import BacktestingSection from "@/components/trading/BacktestingSection";
import { toast } from "sonner";

// ── Broker capability map ─────────────────────────────────────────────────────
// Which asset classes each broker supports. Indian brokers = no crypto/forex.
const BROKER_CAPABILITIES: Record<string, { equities: boolean; fno: boolean; crypto: boolean; forex: boolean; commodities: boolean }> = {
  zerodha:       { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  upstox:        { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  angel:         { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  groww:         { equities: true,  fno: false, crypto: false, forex: false, commodities: false },
  dhan:          { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  fyers:         { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  kotak:         { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  aliceblue:     { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  shoonya:       { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  flattrade:     { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  samco:         { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  zebu:          { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
  pocketful:     { equities: true,  fno: true,  crypto: false, forex: false, commodities: false },
  paytm:         { equities: true,  fno: false, crypto: false, forex: false, commodities: false },
  indmoney:      { equities: true,  fno: false, crypto: false, forex: false, commodities: false },
  dhan_sandbox:  { equities: true,  fno: true,  crypto: false, forex: false, commodities: true  },
};

const DEFAULT_CAP = { equities: true, fno: false, crypto: false, forex: false, commodities: false };

const EXCHANGES = [
  { value: "NSE",  label: "NSE — National Stock Exchange (India)", requiresCap: "equities" },
  { value: "BSE",  label: "BSE — Bombay Stock Exchange (India)",   requiresCap: "equities" },
  { value: "NFO",  label: "NFO — NSE Futures & Options",           requiresCap: "fno"      },
  { value: "BFO",  label: "BFO — BSE Futures & Options",           requiresCap: "fno"      },
  { value: "MCX",  label: "MCX — Multi Commodity Exchange",         requiresCap: "commodities" },
  { value: "CDS",  label: "CDS — Currency Derivatives",            requiresCap: "forex"    },
  { value: "CRYPTO", label: "CRYPTO — Cryptocurrency (not all brokers)", requiresCap: "crypto" },
];

const PRODUCTS = [
  { value: "CNC",  label: "CNC — Delivery (hold overnight)" },
  { value: "MIS",  label: "MIS — Intraday (auto-close by 3:15PM)" },
  { value: "NRML", label: "NRML — Normal F&O" },
];

const ORDER_TYPES = [
  { value: "MARKET", label: "MARKET — Execute immediately at best price" },
  { value: "LIMIT",  label: "LIMIT — Execute only at your price" },
  { value: "SL",     label: "SL — Stop Loss (trigger + limit)" },
  { value: "SL-M",   label: "SL-M — Stop Loss Market (trigger only)" },
];

interface OrderForm {
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL";
  quantity: string;
  product: string;
  price_type: string;
  price: string;
  trigger_price: string;
}

const EMPTY_ORDER: OrderForm = {
  symbol: "", exchange: "NSE", action: "BUY",
  quantity: "", product: "CNC", price_type: "MARKET",
  price: "", trigger_price: "",
};

export default function AlgoTradingDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [broker, setBroker] = useState<string>("zerodha");
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Order form
  const [order, setOrder] = useState<OrderForm>(EMPTY_ORDER);
  const [placing, setPlacing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Strategy
  const [strategies, setStrategies] = useState<any[]>([]);

  const cap = BROKER_CAPABILITIES[broker] ?? DEFAULT_CAP;

  // ── Load user + integration ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      setUser(user);

      // Onboarding status
      const { data: ob } = await (supabase as any)
        .from("algo_onboarding")
        .select("status, broker")
        .eq("user_id", user.id)
        .maybeSingle();
      setOnboardingStatus(ob?.status ?? null);
      if (ob?.broker) setBroker(ob.broker);

      // Broker session status
      const { data: intg } = await (supabase as any)
        .from("user_trading_integration")
        .select("broker, token_expires_at, is_active")
        .eq("user_id", user.id)
        .maybeSingle();
      if (intg) {
        if (intg.broker) setBroker(intg.broker);
        const exp = intg.token_expires_at ? new Date(intg.token_expires_at) : null;
        setBrokerConnected(intg.is_active && !!exp && exp > new Date());
      }

      setLoading(false);
    })();
  }, [navigate]);

  // ── Quick AI analysis for an order ───────────────────────────────────────
  const runAiAnalysis = useCallback(async () => {
    if (!order.symbol.trim()) { toast.error("Enter a symbol first"); return; }
    setAnalysing(true);
    setAiAnalysis(null);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-strategy", {
        body: {
          symbol: order.symbol.toUpperCase(),
          exchange: order.exchange,
          action: order.action,
          quantity: Number(order.quantity) || 1,
          product: order.product,
        },
      });
      if (error) throw error;
      const txt = (data as any)?.analysis ?? (data as any)?.summary ?? JSON.stringify(data);
      setAiAnalysis(txt);
    } catch (e: any) {
      toast.error("AI analysis failed: " + (e.message ?? "unknown"));
    } finally {
      setAnalysing(false);
    }
  }, [order]);

  // ── Place order via openalgo-place-order edge function ────────────────────
  const placeOrder = useCallback(async () => {
    if (!order.symbol.trim() || !order.quantity) {
      toast.error("Symbol and quantity are required");
      return;
    }
    setPlacing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("openalgo-place-order", {
        body: {
          symbol:        order.symbol.toUpperCase().trim(),
          exchange:      order.exchange,
          action:        order.action,
          quantity:      String(order.quantity),
          product:       order.product,
          price_type:    order.price_type,
          price:         order.price_type === "MARKET" ? "0" : order.price,
          trigger_price: (order.price_type === "SL" || order.price_type === "SL-M") ? order.trigger_price : "0",
          strategy:      "ChartMate AI",
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error ?? error?.message);
      }
      toast.success(`✓ Order placed — ${order.action} ${order.quantity} ${order.symbol}`);
      setOrder(EMPTY_ORDER);
      setShowConfirm(false);
      setAiAnalysis(null);
    } catch (e: any) {
      toast.error("Order failed: " + (e.message ?? "unknown"));
    } finally {
      setPlacing(false);
    }
  }, [order]);

  const brokerInfo = ALL_BROKERS.find(b => b.value === broker);
  const availableExchanges = EXCHANGES.filter(ex => cap[ex.requiresCap as keyof typeof cap]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (onboardingStatus !== "provisioned" && onboardingStatus !== "active") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <h2 className="text-xl font-bold text-white">Account not ready yet</h2>
        <p className="text-zinc-400 text-center max-w-sm">
          Your algo trading account is still being set up. Our team will activate it within 24 hours of your form submission.
        </p>
        <Button onClick={() => navigate("/algo-setup")} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Setup
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost" size="sm"
              onClick={() => navigate("/algo-setup")}
              className="text-zinc-400 hover:text-white px-2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-teal-500/20 border border-teal-500/40 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-teal-400" />
              </div>
              <span className="font-bold text-white">Trading Dashboard</span>
              {brokerInfo && (
                <Badge className={`${brokerInfo.color} bg-zinc-800 border-zinc-700 text-xs`}>
                  {brokerInfo.label}
                </Badge>
              )}
            </div>
          </div>
          <Badge className={brokerConnected
            ? "bg-green-500/20 text-green-400 border-green-500/40"
            : "bg-zinc-700 text-zinc-400 border-zinc-600"
          }>
            {brokerConnected ? "● Connected" : "○ Not connected"}
          </Badge>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Broker limitation banner ──────────────────────────────────────── */}
        {!cap.crypto && (
          <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>{brokerInfo?.label ?? broker}</strong> supports Indian equities (NSE/BSE){cap.fno ? ", F&O" : ""}{cap.commodities ? ", MCX" : ""} only.
              Crypto and forex orders are <strong>not supported</strong> by this broker and will be rejected.
            </AlertDescription>
          </Alert>
        )}

        {/* ── Main tabs ────────────────────────────────────────────────────── */}
        <Tabs defaultValue="trade">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-zinc-900 border border-zinc-800 h-auto gap-1 p-1">
            <TabsTrigger value="trade" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              Place Order
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
              <BookOpen className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              Portfolio
            </TabsTrigger>
            <TabsTrigger value="backtest" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
              <LineChart className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              Backtesting
            </TabsTrigger>
            <TabsTrigger value="sync" className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-300 text-xs sm:text-sm">
              <Zap className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              Broker Sync
            </TabsTrigger>
          </TabsList>

          {/* ── TAB: PLACE ORDER ─────────────────────────────────────────────── */}
          <TabsContent value="trade" className="space-y-4 pt-2">

            {!brokerConnected && (
              <Alert className="bg-zinc-800/60 border-zinc-700">
                <Zap className="h-4 w-4 text-amber-400" />
                <AlertDescription className="text-zinc-300 text-sm">
                  Broker not connected today. Go to <strong>Broker Sync</strong> tab and connect first.
                </AlertDescription>
              </Alert>
            )}

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-teal-400" />
                  New Order
                </CardTitle>
                <CardDescription className="text-zinc-500 text-xs">
                  Orders are placed through your connected {brokerInfo?.label ?? broker} account instantly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Action toggle */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => setOrder(o => ({ ...o, action: "BUY" }))}
                    className={order.action === "BUY"
                      ? "bg-green-600 hover:bg-green-500 text-white font-bold"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}
                  >
                    <TrendingUp className="h-4 w-4 mr-2" /> BUY
                  </Button>
                  <Button
                    onClick={() => setOrder(o => ({ ...o, action: "SELL" }))}
                    className={order.action === "SELL"
                      ? "bg-red-600 hover:bg-red-500 text-white font-bold"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}
                  >
                    <TrendingDown className="h-4 w-4 mr-2" /> SELL
                  </Button>
                </div>

                {/* Symbol + Exchange */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs">Symbol *</Label>
                    <Input
                      placeholder="e.g. RELIANCE, NIFTY25MARFUT"
                      value={order.symbol}
                      onChange={e => setOrder(o => ({ ...o, symbol: e.target.value.toUpperCase() }))}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs">Exchange *</Label>
                    <Select value={order.exchange} onValueChange={v => setOrder(o => ({ ...o, exchange: v }))}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                        {availableExchanges.map(ex => (
                          <SelectItem key={ex.value} value={ex.value} className="text-xs">
                            {ex.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Quantity + Product */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs">Quantity *</Label>
                    <Input
                      type="number" min={1} placeholder="e.g. 10"
                      value={order.quantity}
                      onChange={e => setOrder(o => ({ ...o, quantity: e.target.value }))}
                      className="bg-zinc-800 border-zinc-700 text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs">Product</Label>
                    <Select value={order.product} onValueChange={v => setOrder(o => ({ ...o, product: v }))}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                        {PRODUCTS.map(p => (
                          <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Order type + Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs">Order Type</Label>
                    <Select value={order.price_type} onValueChange={v => setOrder(o => ({ ...o, price_type: v }))}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-700 text-white">
                        {ORDER_TYPES.map(ot => (
                          <SelectItem key={ot.value} value={ot.value} className="text-xs">{ot.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {order.price_type !== "MARKET" && (
                    <div className="space-y-1.5">
                      <Label className="text-zinc-300 text-xs">
                        {order.price_type === "SL" ? "Limit Price" : "Limit Price"}
                      </Label>
                      <Input
                        type="number" placeholder="0.00" step="0.05"
                        value={order.price}
                        onChange={e => setOrder(o => ({ ...o, price: e.target.value }))}
                        className="bg-zinc-800 border-zinc-700 text-white"
                      />
                    </div>
                  )}
                </div>

                {(order.price_type === "SL" || order.price_type === "SL-M") && (
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300 text-xs">Trigger Price</Label>
                    <Input
                      type="number" placeholder="0.00" step="0.05"
                      value={order.trigger_price}
                      onChange={e => setOrder(o => ({ ...o, trigger_price: e.target.value }))}
                      className="bg-zinc-800 border-zinc-700 text-white"
                    />
                  </div>
                )}

                {/* AI analysis */}
                {aiAnalysis && (
                  <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                    <p className="text-teal-400 font-semibold mb-1 flex items-center gap-1">
                      <Brain className="h-3 w-3" /> AI Quick Analysis
                    </p>
                    {aiAnalysis}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={runAiAnalysis}
                    disabled={analysing || !order.symbol.trim()}
                    className="flex-1 border-zinc-700 text-zinc-300 hover:text-teal-300 hover:border-teal-500/50"
                  >
                    {analysing
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analysing…</>
                      : <><Brain className="h-3.5 w-3.5 mr-1.5" /> AI Analysis</>
                    }
                  </Button>
                  <Button
                    disabled={!brokerConnected || placing || !order.symbol.trim() || !order.quantity}
                    onClick={() => setShowConfirm(true)}
                    className={order.action === "BUY"
                      ? "flex-1 bg-green-600 hover:bg-green-500 text-white font-bold"
                      : "flex-1 bg-red-600 hover:bg-red-500 text-white font-bold"
                    }
                  >
                    {order.action === "BUY"
                      ? <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                      : <TrendingDown className="h-3.5 w-3.5 mr-1.5" />
                    }
                    {order.action} {order.quantity || "—"} {order.symbol || "—"}
                  </Button>
                </div>

                <p className="text-[11px] text-zinc-600 text-center">
                  Orders go directly to your {brokerInfo?.label ?? broker} account via ChartMate. No separate login needed.
                </p>
              </CardContent>
            </Card>

            {/* ── Order confirmation overlay ──────────────────────────────── */}
            {showConfirm && (
              <Card className="bg-zinc-900 border-2 border-amber-500/40 shadow-xl shadow-amber-500/10">
                <CardContent className="p-5 space-y-4">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    Confirm Order — Real Money
                  </h3>
                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    {[
                      ["Action",    order.action],
                      ["Symbol",    order.symbol],
                      ["Exchange",  order.exchange],
                      ["Quantity",  order.quantity],
                      ["Product",   order.product],
                      ["Type",      order.price_type],
                    ].map(([label, val]) => (
                      <div key={label} className="bg-zinc-800 rounded-lg p-2">
                        <p className="text-zinc-500">{label}</p>
                        <p className="font-bold text-white">{val}</p>
                      </div>
                    ))}
                  </div>
                  {aiAnalysis && (
                    <p className="text-xs text-zinc-400 border border-zinc-700 rounded-lg p-2 line-clamp-2">
                      AI: {aiAnalysis.slice(0, 200)}…
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 border-zinc-700"
                      onClick={() => setShowConfirm(false)}
                      disabled={placing}
                    >
                      Cancel
                    </Button>
                    <Button
                      className={`flex-1 font-bold ${order.action === "BUY" ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`}
                      onClick={placeOrder}
                      disabled={placing}
                    >
                      {placing
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Placing…</>
                        : `Confirm ${order.action}`
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── TAB: PORTFOLIO ───────────────────────────────────────────────── */}
          <TabsContent value="portfolio" className="pt-2">
            {brokerConnected
              ? <BrokerPortfolioCard />
              : (
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardContent className="p-8 text-center space-y-3">
                    <Zap className="h-8 w-8 text-zinc-600 mx-auto" />
                    <p className="text-zinc-400 text-sm">
                      Connect your broker first to see live funds, positions, holdings and orders.
                    </p>
                    <Button
                      variant="outline"
                      className="border-teal-500/50 text-teal-300 hover:bg-teal-500/10"
                      onClick={() => {
                        const el = document.querySelector('[data-radix-collection-item][data-value="sync"]') as HTMLElement;
                        el?.click();
                      }}
                    >
                      Go to Broker Sync <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </CardContent>
                </Card>
              )
            }
          </TabsContent>

          <TabsContent value="backtest" className="pt-2 space-y-3">
            <Alert className="bg-zinc-800/80 border-zinc-700">
              <BarChart3 className="h-4 w-4 text-teal-400" />
            </Alert>
            <BacktestingSection />
          </TabsContent>

          {/* ── TAB: BROKER SYNC ─────────────────────────────────────────────── */}
          <TabsContent value="sync" className="pt-2">
            <BrokerSyncSection broker={broker} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
