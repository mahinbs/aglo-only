import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionSignal } from "@/components/prediction/ActionSignal";
import { PerformanceDashboard } from "@/components/performance/PerformanceDashboard";
import { OptionsPaperDashboard } from "@/components/options/OptionsPaperDashboard";
import YahooChartPanel from "@/components/YahooChartPanel";
import {
  tradeTrackingService,
  ActiveTrade,
} from "@/services/tradeTrackingService";
import {
  isUsdDenominatedSymbol,
} from "@/lib/tradingview-symbols";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle,
  Bell,
  BarChart3,
  History,
  Loader2,
  ShieldAlert,
  Target,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  LogOut,
  Trash2,
  BookOpen,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  AlertTriangle,
  X,
  LineChart as LineChartIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { useAuth } from "@/hooks/useAuth";
import { isAnalysisExceptionEmail } from "@/lib/manualSubscriptionBypass";
import { cn } from "@/lib/utils";
import { SymbolSearch, SymbolData } from "@/components/SymbolSearch";
import { StrategySelectionDialog, STRATEGIES } from "@/components/trading/StrategySelectionDialog";
import { getStrategyParams } from "@/constants/strategyParams";
import { formatSlippageLine } from "@/lib/tradeSlippage";
import { PendingPaperTradeCard, PendingPaperTradeRow } from "@/components/trading/PendingPaperTradeCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BrokerOrder {
  id: string;
  broker_order_id: string | null;
  symbol: string | null;
  exchange: string | null;
  action: string | null;
  quantity: number | null;
  price: number | null;
  order_type: string | null;
  product_type: string | null;
  status: string | null;
  filled_quantity: number | null;
  average_price: number | null;
  strategy_name: string | null;
  rejection_reason: string | null;
  order_timestamp: string | null;
  synced_at: string;
}

interface StrategyHistoryRow {
  id: string;
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL";
  quantity: number;
  status: "executed" | "cancelled" | "expired" | string;
  is_paper_trade: boolean;
  scheduled_for: string | null;
  error_message: string | null;
  created_at: string;
  last_checked_at: string | null;
  strategy_id: string;
  strategy_name: string | null;
}

function decodeYFProto(bytes: Uint8Array): { id?: string; price?: number } {
  const out: Record<number, unknown> = {};
  let pos = 0;
  while (pos < bytes.length) {
    const tagByte = bytes[pos++];
    const field = tagByte >> 3;
    const wire = tagByte & 0x7;
    if (wire === 0) {
      // varint
      while (pos < bytes.length) {
        const b = bytes[pos++];
        if (!(b & 0x80)) break;
      }
    } else if (wire === 2) {
      // length-delimited
      let len = 0,
        shift = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        len |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      out[field] = new TextDecoder().decode(bytes.slice(pos, pos + len));
      pos += len;
    } else if (wire === 5) {
      // 32-bit float
      const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, 4);
      out[field] = dv.getFloat32(0, true);
      pos += 4;
    } else if (wire === 1) {
      pos += 8;
    } else {
      break;
    }
  }
  return {
    id: out[1] as string | undefined,
    price: out[2] as number | undefined,
  };
}

export default function ActiveTradesPage() {
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<"INR" | "USD">("INR");
  const [usdPerInr, setUsdPerInr] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [fxFailed, setFxFailed] = useState(false);
  const [brokerOrders, setBrokerOrders] = useState<BrokerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSyncing, setOrdersSyncing] = useState(false);
  // Quick paper trade (immediate entry — same as before)
  const [showQuickPaperDialog, setShowQuickPaperDialog] = useState(false);
  const [showPaperStrategyDialog, setShowPaperStrategyDialog] = useState(false);
  const [paperSymbolValue, setPaperSymbolValue] = useState("");
  const [paperSymbolData, setPaperSymbolData] = useState<SymbolData | null>(null);
  const [paperQuantity, setPaperQuantity] = useState<string>("1");
  const [paperInvestmentAmount, setPaperInvestmentAmount] = useState<string>("");
  const [paperInvestmentCurrency, setPaperInvestmentCurrency] = useState<"INR" | "USD">("INR");
  const paperInvestmentRawRef = useRef<number | null>(null);
  const [paperEntryPrice, setPaperEntryPrice] = useState<number | null>(null);
  const [paperSymbolPriceLoading, setPaperSymbolPriceLoading] = useState(false);
  const [paperPriceLoading, setPaperPriceLoading] = useState(false);
  const [paperCreating, setPaperCreating] = useState(false);
  // Pending paper trades (strategies waiting for conditions)
  const [pendingPaperTrades, setPendingPaperTrades] = useState<PendingPaperTradeRow[]>([]);
  const [pendingPaperLoading, setPendingPaperLoading] = useState(false);
  const [pendingPaperExpanded, setPendingPaperExpanded] = useState(true);
  // Close paper trade dialog
  const [closePaperTradeId, setClosePaperTradeId] = useState<string | null>(null);
  const [closePaperPrice, setClosePaperPrice] = useState<string>("");
  const [closingPaper, setClosingPaper] = useState(false);
  // Delete paper trade
  const [deletingTradeId, setDeletingTradeId] = useState<string | null>(null);
  // Full-screen trade detail dialog
  const [selectedTradeDetail, setSelectedTradeDetail] = useState<ActiveTrade | null>(null);
  const [tradeDetailChartReady, setTradeDetailChartReady] = useState(false);
  const [tradeDetailLivePrice, setTradeDetailLivePrice] = useState<number | null>(null);
  // Strategy history tab
  const [strategyHistory, setStrategyHistory] = useState<StrategyHistoryRow[]>([]);
  const [strategyHistoryLoading, setStrategyHistoryLoading] = useState(false);
  const yahooWsRef = useRef<WebSocket | null>(null);
  const yahooReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track trade IDs already auto-exited this session to avoid duplicate orders
  const triggeredRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const canLinkToPredict = isAnalysisExceptionEmail(user?.email);

  const rawTab = searchParams.get("tab") || "active";
  const tabValue = useMemo(() => {
    const allowed = ["active", "completed", "orders", "performance", "strategy-history"];
    return allowed.includes(rawTab) ? rawTab : "active";
  }, [rawTab]);

  const onTabChange = useCallback(
    (v: string) => {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("tab", v);
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // ── Real-time SL / TP auto-exit ────────────────────────────────────────────
  // Called on every live price tick. If SL or TP is breached for a live-order
  // trade, places an immediate MARKET exit order through OpenAlgo.
  const checkAndAutoExit = useCallback(
    async (trade: ActiveTrade, price: number) => {
      if (!trade.brokerOrderId?.startsWith("PAPER") === false) return; // paper trades — skip
      if (
        trade.status !== "active" &&
        trade.status !== "monitoring" &&
        trade.status !== "exit_zone"
      )
        return;
      if (triggeredRef.current.has(trade.id)) return; // already triggered

      const isBuy = trade.action === "BUY";
      const slHit = trade.stopLossPrice
        ? isBuy
          ? price <= trade.stopLossPrice
          : price >= trade.stopLossPrice
        : false;
      const tpHit = trade.takeProfitPrice
        ? isBuy
          ? price >= trade.takeProfitPrice
          : price <= trade.takeProfitPrice
        : false;

      if (!slHit && !tpHit) return;

      triggeredRef.current.add(trade.id); // prevent re-entry

      const reason = slHit ? "Stop Loss" : "Take Profit";
      const emoji = slHit ? "🛑" : "🎯";
      sonnerToast(
        `${emoji} ${reason} hit for ${trade.symbol} @ ${isUsdDenominatedSymbol(trade.symbol) ? "$" : "₹"}${price.toFixed(2)}`,
        {
          description: "Placing auto-exit order…",
          duration: 6000,
        },
      );

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        // Place the exit order
        const res = await supabase.functions.invoke("broker-order-action", {
          body: {
            action: "close_all_pos", // squares off all positions in strategy
            trade_id: trade.id,
          },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });

        const ok = !res.error && !(res.data as any)?.error;
        if (ok) {
          sonnerToast.success(
            `Auto-exit complete — ${reason} triggered on ${trade.symbol}`,
          );
          const exitStatus = slHit ? "stopped_out" : "target_hit";
          await supabase
            .from("active_trades" as any)
            .update({
              status: exitStatus,
              exit_price: price,
              exit_time: new Date().toISOString(),
              exit_reason: slHit ? "stop_loss_triggered" : "target_hit",
              actual_pnl: trade.currentPnl ?? null,
            })
            .eq("id", trade.id);

          // ── Auto post-trade AI analysis ──────────────────────────────────
          supabase.auth.getSession().then(({ data: { session } }) => {
            supabase.functions
              .invoke("analyze-post-prediction", {
                body: {
                  symbol: trade.symbol,
                  action: trade.action,
                  entry_price: trade.entryPrice,
                  exit_price: price,
                  exit_reason: slHit ? "stop_loss" : "take_profit",
                  pnl: trade.currentPnl ?? 0,
                  strategy: trade.strategyType ?? "unknown",
                  trade_id: trade.id,
                },
                headers: { Authorization: `Bearer ${session?.access_token}` },
              })
              .then(() => {
                sonnerToast.info(
                  `AI post-trade analysis ready for ${trade.symbol}`,
                  { duration: 4000 },
                );
              })
              .catch(() => {});
          });

          loadTrades();
        } else {
          sonnerToast.error(
            `Auto-exit order failed for ${trade.symbol}: ${(res.data as any)?.error ?? "unknown"}`,
          );
          triggeredRef.current.delete(trade.id); // allow retry
        }
      } catch (e: any) {
        sonnerToast.error("Auto-exit error: " + e.message);
        triggeredRef.current.delete(trade.id);
      }
    },
    [],
  );

  const loadBrokerOrders = useCallback(
    async (sync = false) => {
      if (sync) setOrdersSyncing(true);
      else setOrdersLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const res = await supabase.functions.invoke("sync-order-history", {
          body: {},
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const data = res.data as { orders?: BrokerOrder[] } | null;
        if (data?.orders) setBrokerOrders(data.orders);
        if (sync) toast({ title: "Orders synced from broker", duration: 2000 });
      } catch {
        // non-fatal — user may not have integration set up
      } finally {
        setOrdersLoading(false);
        setOrdersSyncing(false);
      }
    },
    [toast],
  );

  const loadTrades = async () => {
    try {
      const [activeResult, completedResult] = await Promise.all([
        tradeTrackingService.getActiveTrades(),
        tradeTrackingService.getCompletedTrades(20),
      ]);

      if (activeResult.data) {
        console.log("📊 Loaded active trades:", activeResult.data.length);
        // Force new array reference to trigger React re-render
        setActiveTrades([...activeResult.data]);
      }

      if (completedResult.data) {
        console.log("✅ Loaded completed trades:", completedResult.data.length);
        // Force new array reference to trigger React re-render
        setCompletedTrades([...completedResult.data]);
      }
    } catch (error) {
      console.error("Error loading trades:", error);
      toast({
        title: "Error",
        description: "Failed to load trades",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTrades();
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Trade data updated",
    });
  };

  const loadFxRate = async () => {
    try {
      setFxLoading(true);
      setFxError(null);
      const res = await fetch("https://open.er-api.com/v6/latest/INR");
      if (!res.ok) throw new Error("Failed to load FX rate");
      const json = await res.json();
      const rate = json?.rates?.USD;
      if (typeof rate === "number" && rate > 0) {
        setUsdPerInr(rate);
      } else {
        throw new Error("Invalid FX rate");
      }
    } catch (e: any) {
      console.error("FX load error", e);
      setFxError(e?.message || "Failed to load USD/INR rate");
      setFxFailed(true); // stop retrying — don't spam the API
    } finally {
      setFxLoading(false);
    }
  };

  const resolveLatestPrice = useCallback(async (symbol: string) => {
    const { data, error } = await supabase.functions.invoke("get-chart-data", {
      body: { symbol, interval: "1d", range: "1mo" },
    });
    if (error) throw new Error(error.message);
    const metaPrice = Number((data as any)?.meta?.regularMarketPrice);
    if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;
    const candles = Array.isArray((data as any)?.candles) ? (data as any).candles : [];
    const lastClose = Number(candles[candles.length - 1]?.close);
    if (Number.isFinite(lastClose) && lastClose > 0) return lastClose;
    throw new Error("Could not fetch current market price for selected symbol");
  }, []);

  const handleOpenQuickPaperTrade = useCallback(() => {
    setPaperSymbolValue("");
    setPaperSymbolData(null);
    setPaperQuantity("1");
    setPaperInvestmentAmount("");
    setPaperInvestmentCurrency("INR");
    paperInvestmentRawRef.current = null;
    setPaperEntryPrice(null);
    setShowQuickPaperDialog(true);
  }, []);

  const resolveExchangeCurrency = useCallback(
    (exchange?: string | null): "INR" | "USD" => {
      const normalized = (exchange ?? "").toUpperCase();
      return normalized === "NSE" || normalized === "BSE" ? "INR" : "USD";
    },
    [],
  );

  const convertBetweenInrUsd = useCallback(
    (amount: number, from: "INR" | "USD", to: "INR" | "USD") => {
      if (!Number.isFinite(amount) || from === to) return amount;
      if (!usdPerInr || usdPerInr <= 0) return amount;
      if (from === "INR" && to === "USD") return amount * usdPerInr;
      if (from === "USD" && to === "INR") return amount / usdPerInr;
      return amount;
    },
    [usdPerInr],
  );

  const paperAssetCurrency = useMemo(
    () => resolveExchangeCurrency(paperSymbolData?.exchange),
    [paperSymbolData?.exchange, resolveExchangeCurrency],
  );
  const isPaperCrypto = useMemo(
    () => String(paperSymbolData?.type || "").toLowerCase() === "crypto",
    [paperSymbolData?.type],
  );

  const handlePaperSymbolValueChange = useCallback(
    (value: string) => {
      setPaperSymbolValue(value);
      if (paperSymbolData && value !== paperSymbolData.full_symbol) {
        setPaperSymbolData(null);
        setPaperQuantity("1");
        setPaperEntryPrice(null);
        setPaperInvestmentAmount("");
        setPaperInvestmentCurrency("INR");
        paperInvestmentRawRef.current = null;
      }
    },
    [paperSymbolData],
  );

  const handlePaperSymbolSelect = useCallback(
    async (selected: SymbolData | null) => {
      const isSymbolChanged =
        (paperSymbolData?.full_symbol ?? "") !== (selected?.full_symbol ?? "");

      setPaperSymbolData(selected);
      if (!selected?.full_symbol) {
        setPaperQuantity("1");
        setPaperEntryPrice(null);
        setPaperInvestmentAmount("");
        setPaperInvestmentCurrency("INR");
        paperInvestmentRawRef.current = null;
        return;
      }

      try {
        setPaperSymbolPriceLoading(true);
        const assetCurrency = resolveExchangeCurrency(selected.exchange);
        setPaperInvestmentCurrency(assetCurrency);
        const latestPrice = await resolveLatestPrice(selected.full_symbol);
        setPaperEntryPrice(latestPrice);
        const qty = isSymbolChanged ? 1 : Math.max(1, Math.round(Number(paperQuantity) || 1));
        if (isSymbolChanged) setPaperQuantity("1");
        const investmentAmount = convertBetweenInrUsd(
          latestPrice * qty,
          assetCurrency,
          assetCurrency,
        );
        paperInvestmentRawRef.current = investmentAmount;
        setPaperInvestmentAmount(investmentAmount.toFixed(2));
      } catch (e: unknown) {
        setPaperEntryPrice(null);
        setPaperInvestmentAmount("");
        paperInvestmentRawRef.current = null;
        const message =
          e instanceof Error
            ? e.message
            : "Unable to fetch latest price for selected symbol.";
        toast({
          title: "Price lookup failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setPaperSymbolPriceLoading(false);
      }
    },
    [
      convertBetweenInrUsd,
      paperQuantity,
      paperSymbolData?.full_symbol,
      resolveExchangeCurrency,
      resolveLatestPrice,
      toast,
    ],
  );

  const handlePaperQuantityChange = useCallback(
    (value: string) => {
      if (!isPaperCrypto) {
        const wholePart = (value ?? "").split(/[.,]/)[0] ?? "";
        const integerValue = wholePart.replace(/[^\d]/g, "");
        setPaperQuantity(integerValue);
        const qty = Number(integerValue);
        if (
          paperSymbolData?.full_symbol &&
          Number.isFinite(qty) &&
          qty > 0 &&
          paperEntryPrice != null
        ) {
          const recalculated = convertBetweenInrUsd(
            paperEntryPrice * qty,
            paperAssetCurrency,
            paperInvestmentCurrency,
          );
          paperInvestmentRawRef.current = recalculated;
          setPaperInvestmentAmount(recalculated.toFixed(2));
        }
        return;
      }

      setPaperQuantity(value);
      const qty = Number(value);
      if (
        paperSymbolData?.full_symbol &&
        Number.isFinite(qty) &&
        qty > 0 &&
        paperEntryPrice != null
      ) {
        const recalculated = convertBetweenInrUsd(
          paperEntryPrice * qty,
          paperAssetCurrency,
          paperInvestmentCurrency,
        );
        paperInvestmentRawRef.current = recalculated;
        setPaperInvestmentAmount(recalculated.toFixed(2));
      }
    },
    [
      convertBetweenInrUsd,
      isPaperCrypto,
      paperAssetCurrency,
      paperEntryPrice,
      paperInvestmentCurrency,
      paperSymbolData,
    ],
  );

  const handlePaperInvestmentAmountChange = useCallback((value: string) => {
    setPaperInvestmentAmount(value);
    const parsed = Number(value);
    paperInvestmentRawRef.current =
      Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, []);

  const adjustPaperQuantity = useCallback(
    (direction: "up" | "down") => {
      if (!paperSymbolData) return;
      const step = isPaperCrypto ? 0.000001 : 1;
      const min = isPaperCrypto ? 0.000001 : 1;
      const parsedQty = Number(paperQuantity);
      const currentQty =
        Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : min;
      const nextQty =
        direction === "up"
          ? currentQty + step
          : Math.max(min, currentQty - step);
      const normalizedQty = isPaperCrypto
        ? Number(nextQty.toFixed(6))
        : Math.max(1, Math.round(nextQty));
      handlePaperQuantityChange(String(normalizedQty));
    },
    [handlePaperQuantityChange, isPaperCrypto, paperQuantity, paperSymbolData],
  );

  const adjustPaperInvestmentAmount = useCallback(
    (direction: "up" | "down") => {
      if (!paperSymbolData) return;
      const step = 0.01;
      const parsedInvestment = Number(paperInvestmentAmount);
      const currentInvestment =
        Number.isFinite(parsedInvestment) && parsedInvestment >= 0
          ? parsedInvestment
          : 0;
      const nextInvestment =
        direction === "up"
          ? currentInvestment + step
          : Math.max(0, currentInvestment - step);
      handlePaperInvestmentAmountChange(nextInvestment.toFixed(2));
    },
    [
      handlePaperInvestmentAmountChange,
      paperInvestmentAmount,
      paperSymbolData,
    ],
  );

  const handlePaperInvestmentCurrencyChange = useCallback(
    (nextCurrency: "INR" | "USD") => {
      if (nextCurrency === paperInvestmentCurrency) return;
      const currentAmount =
        paperInvestmentRawRef.current != null
          ? paperInvestmentRawRef.current
          : Number(paperInvestmentAmount);
      if (Number.isFinite(currentAmount) && currentAmount > 0) {
        const converted = convertBetweenInrUsd(
          currentAmount,
          paperInvestmentCurrency,
          nextCurrency,
        );
        paperInvestmentRawRef.current = converted;
        setPaperInvestmentAmount(converted.toFixed(2));
      }
      setPaperInvestmentCurrency(nextCurrency);
    },
    [convertBetweenInrUsd, paperInvestmentAmount, paperInvestmentCurrency],
  );

  const handleContinuePaperSetup = useCallback(async () => {
    const symbol = paperSymbolData?.full_symbol;
    const qty = Number(paperQuantity);
    if (!symbol || !paperSymbolData) {
      toast({
        title: "Symbol required",
        description: "Select a stock from results before continuing.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({
        title: "Invalid quantity",
        description: "Enter a quantity greater than 0.",
        variant: "destructive",
      });
      return;
    }
    if (!isPaperCrypto && !Number.isInteger(qty)) {
      toast({
        title: "Invalid quantity",
        description: "Fractional quantity is only allowed for crypto.",
        variant: "destructive",
      });
      return;
    }

    try {
      setPaperPriceLoading(true);
      const px =
        paperEntryPrice != null && paperEntryPrice > 0
          ? paperEntryPrice
          : await resolveLatestPrice(symbol);
      setPaperEntryPrice(px);
      setShowQuickPaperDialog(false);
      setShowPaperStrategyDialog(true);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : "Unable to fetch latest price for selected symbol.";
      toast({
        title: "Price lookup failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPaperPriceLoading(false);
    }
  }, [isPaperCrypto, paperEntryPrice, paperQuantity, paperSymbolData, resolveLatestPrice, toast]);

  const handleCreatePaperTrade = useCallback(
    async (
      strategyCode: string,
      product: string,
      action: "BUY" | "SELL",
      sellPosition?: { entryPrice: number; shares: number },
    ) => {
      const symbol = paperSymbolData?.full_symbol || paperSymbolValue;
      const qty = Number(paperQuantity);
      if (!symbol || !Number.isFinite(qty) || qty <= 0) return;

      setPaperCreating(true);
      try {
        let stopLossPct = getStrategyParams(strategyCode).stopLossPercentage;
        let takeProfitPct = getStrategyParams(strategyCode).targetProfitPercentage;

        if (!STRATEGIES.some((s) => s.value === strategyCode)) {
          const { data: customRow } = await (supabase as any)
            .from("user_strategies")
            .select("stop_loss_pct,take_profit_pct")
            .eq("id", strategyCode)
            .maybeSingle();
          if (customRow?.stop_loss_pct != null) stopLossPct = Number(customRow.stop_loss_pct);
          if (customRow?.take_profit_pct != null) takeProfitPct = Number(customRow.take_profit_pct);
        }

        const shares =
          action === "SELL" && sellPosition?.shares
            ? sellPosition.shares
            : isPaperCrypto
              ? qty
              : Math.max(1, Math.round(qty));
        const liveAtConfirm = await resolveLatestPrice(symbol);
        const entryPrice =
          action === "SELL" && sellPosition?.entryPrice
            ? sellPosition.entryPrice
            : liveAtConfirm;
        const investmentAmount = Math.max(1, entryPrice * shares);
        const brokerOrderId = `PAPER-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

        const response = await tradeTrackingService.startTradeSession({
          symbol,
          action,
          confidence: 75,
          riskGrade: "MEDIUM",
          referenceEntryPrice: entryPrice,
          entryPrice,
          shares,
          investmentAmount,
          exchange: paperSymbolData?.exchange || "NSE",
          product,
          brokerOrderId,
          strategyType: strategyCode,
          stopLossPercentage: stopLossPct,
          targetProfitPercentage: takeProfitPct,
          holdingPeriod: "Same day",
          aiRecommendedHoldPeriod: "Same day",
          isPaperTrade: true,
        });

        if (response.error) {
          toast({
            title: "Paper trade failed",
            description: response.error,
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Paper trade started",
          description: `${action} ${symbol} (${shares}) is now tracked. Tap it in the Active list to view live P&L.`,
        });
        setShowPaperStrategyDialog(false);
        // Switch to active tab and refresh — user can click the row to open the detail view
        onTabChange("active");
        loadTrades();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not complete paper trade.";
        toast({
          title: "Paper trade failed",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setPaperCreating(false);
      }
    },
    [isPaperCrypto, paperSymbolData, paperSymbolValue, paperQuantity, resolveLatestPrice, toast, navigate],
  );

  // ── Pending paper trades ────────────────────────────────────────────────────

  const loadPendingPaperTrades = useCallback(async () => {
    setPendingPaperLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const { data, error } = await (supabase as any)
        .from("pending_conditional_orders")
        .select(`
          id, symbol, exchange, action, quantity, status,
          is_paper_trade, scheduled_for, error_message, created_at,
          last_checked_at, strategy_id,
          user_strategies!inner(name)
        `)
        .eq("user_id", session.user.id)
        .eq("is_paper_trade", true)
        .in("status", ["pending", "scheduled"])
        .order("created_at", { ascending: false });

      if (!error && data) {
        const rows = (data as any[]).map((r) => ({
          ...r,
          strategy_name: r.user_strategies?.name ?? null,
        })) as PendingPaperTradeRow[];
        setPendingPaperTrades(rows);
      }
    } catch {
      // non-fatal
    } finally {
      setPendingPaperLoading(false);
    }
  }, []);

  const loadStrategyHistory = useCallback(async () => {
    setStrategyHistoryLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      const { data, error } = await (supabase as any)
        .from("pending_conditional_orders")
        .select(`
          id, symbol, exchange, action, quantity, status,
          is_paper_trade, scheduled_for, error_message, created_at,
          last_checked_at, strategy_id,
          user_strategies(name)
        `)
        .eq("user_id", session.user.id)
        .eq("is_paper_trade", true)
        .in("status", ["executed", "cancelled", "expired"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (!error && data) {
        const rows = (data as any[]).map((r) => ({
          ...r,
          strategy_name: r.user_strategies?.name ?? null,
        })) as StrategyHistoryRow[];
        setStrategyHistory(rows);
      }
    } catch {
      // non-fatal
    } finally {
      setStrategyHistoryLoading(false);
    }
  }, []);

  // ── Close active paper trade (manual override) ──────────────────────────────

  const handleOpenClosePaperTrade = useCallback((trade: ActiveTrade) => {
    setClosePaperTradeId(trade.id);
    setClosePaperPrice(String(trade.currentPrice ?? trade.entryPrice));
  }, []);

  const handleClosePaperTrade = useCallback(async () => {
    if (!closePaperTradeId) return;
    const px = Number(closePaperPrice);
    if (!Number.isFinite(px) || px <= 0) {
      toast({ title: "Invalid price", description: "Enter a valid exit price.", variant: "destructive" });
      return;
    }
    setClosingPaper(true);
    try {
      const { error } = await tradeTrackingService.closeActivePaperTrade(closePaperTradeId, px);
      if (error) throw new Error(error);
      toast({ title: "Paper trade closed", description: `Position closed at ${px.toFixed(2)}.` });
      setClosePaperTradeId(null);
      loadTrades();
    } catch (e: unknown) {
      toast({ title: "Close failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setClosingPaper(false);
    }
  }, [closePaperTradeId, closePaperPrice, toast]);

  // ── Delete completed paper trade ────────────────────────────────────────────

  const handleDeletePaperTrade = useCallback(async (tradeId: string) => {
    setDeletingTradeId(tradeId);
    try {
      const { error } = await tradeTrackingService.deletePaperTrade(tradeId);
      if (error) throw new Error(error);
      toast({ title: "Paper trade deleted" });
      loadTrades();
    } catch (e: unknown) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setDeletingTradeId(null);
    }
  }, [toast]);

  useEffect(() => {
    loadTrades();
    loadPendingPaperTrades();

    // Subscribe to real-time updates
    const subscription = tradeTrackingService.subscribeToTrades((payload) => {
      console.log("🔄 Trade updated:", payload);
      // Force reload trades immediately
      loadTrades();
    });

    // Subscribe to notifications
    const notifSubscription = tradeTrackingService.subscribeToNotifications(
      (payload) => {
        const notification = payload.new;
        toast({
          title: notification.title,
          description: notification.message,
        });
      },
    );

    let pendingRealtime: ReturnType<typeof supabase.channel> | null = null;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id;
      if (!uid) return;
      pendingRealtime = supabase
        .channel(`pending_conditional_${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pending_conditional_orders",
            filter: `user_id=eq.${uid}`,
          },
          () => {
            loadPendingPaperTrades();
          },
        )
        .subscribe();
    });

    return () => {
      subscription.unsubscribe();
      notifSubscription.unsubscribe();
      if (pendingRealtime) supabase.removeChannel(pendingRealtime);
    };
  }, []); // Remove dependency to avoid re-creating subscriptions

  useEffect(() => {
    const hasUsdAssets =
      activeTrades.some((t) => isUsdDenominatedSymbol(t.symbol)) ||
      completedTrades.some((t) => isUsdDenominatedSymbol(t.symbol));

    // Auto-switch display currency to match the majority of loaded trades
    const hasInrAssets =
      activeTrades.some((t) => !isUsdDenominatedSymbol(t.symbol)) ||
      completedTrades.some((t) => !isUsdDenominatedSymbol(t.symbol));
    if (hasUsdAssets && !hasInrAssets) {
      setDisplayCurrency("USD");
    } else if (hasInrAssets && !hasUsdAssets) {
      setDisplayCurrency("INR");
    }

    if (usdPerInr == null && !fxLoading && !fxFailed && hasUsdAssets) {
      loadFxRate();
    }
  }, [usdPerInr, fxLoading, fxFailed, activeTrades, completedTrades]);

  // Binance WebSocket for crypto symbols (BTC-USD, etc.) so prices match TradingView's Binance feed
  useEffect(() => {
    // Collect all USD-denominated symbols we are tracking (crypto/US stocks)
    const cryptoSymbols = Array.from(
      new Set(
        activeTrades
          .filter((t) => isUsdDenominatedSymbol(t.symbol))
          .map((t) => t.symbol.toUpperCase()),
      ),
    );

    if (cryptoSymbols.length === 0) {
      return;
    }

    const toBinanceSymbol = (symbol: string) => {
      // BTC-USD -> BTCUSDT, ETH-USD -> ETHUSDT, etc.
      const base = symbol.replace(/[^A-Z]/gi, "").replace(/USD$/i, "");
      return `${base}USDT`.toUpperCase();
    };

    const streams = cryptoSymbols.map(
      (s) => `${toBinanceSymbol(s).toLowerCase()}@trade`,
    );
    const url = `wss://stream.binance.com:9443/stream?streams=${streams.join("/")}`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("⚡ Binance WS connected for", cryptoSymbols.join(", "));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const tick = payload.data || payload;
          const binanceSymbol: string = (
            tick.s ||
            tick.symbol ||
            ""
          ).toUpperCase();
          const price: number = parseFloat(tick.p || tick.c || tick.price);
          if (!binanceSymbol || !price || Number.isNaN(price)) return;

          const fromBinanceToInternal = (sym: string) =>
            `${sym.replace(/USDT$/i, "")}-USD`;
          const internalSymbol =
            fromBinanceToInternal(binanceSymbol).toUpperCase();

          setActiveTrades((prev) => {
            const updated = prev.map((t) => {
              if (t.symbol.toUpperCase() !== internalSymbol) return t;
              const pnl =
                (price - t.entryPrice) *
                t.shares *
                (t.action === "SELL" ? -1 : 1);
              const pnlPct = (pnl / t.investmentAmount) * 100;
              return {
                ...t,
                currentPrice: price,
                currentPnl: pnl,
                currentPnlPercentage: pnlPct,
                lastPriceUpdate: new Date().toISOString(),
              };
            });
            // Check SL/TP on updated trades (outside setState to avoid stale closure)
            updated.forEach((t) => {
              if (
                t.symbol.toUpperCase() === internalSymbol &&
                t.brokerOrderId &&
                !t.brokerOrderId.startsWith("PAPER")
              ) {
                checkAndAutoExit(t, price);
              }
            });
            return updated;
          });
        } catch {
          // ignore malformed ticks
        }
      };

      ws.onerror = () => {
        console.warn("Binance WS error");
        ws?.close();
      };
    } catch (e) {
      console.error("Binance WS connect error", e);
    }

    return () => {
      ws?.close();
    };
  }, [activeTrades.map((t) => t.symbol).join(","), checkAndAutoExit]);

  // Yahoo WebSocket for non-USD symbols (NSE/BSE etc.) for truly live updates.
  useEffect(() => {
    const stockSymbols = Array.from(
      new Set(
        activeTrades
          .filter((t) => !isUsdDenominatedSymbol(t.symbol))
          .map((t) => t.symbol.toUpperCase()),
      ),
    );

    if (stockSymbols.length === 0) {
      if (yahooWsRef.current) {
        yahooWsRef.current.close(1000, "no-symbols");
        yahooWsRef.current = null;
      }
      if (yahooReconnectRef.current) {
        clearTimeout(yahooReconnectRef.current);
        yahooReconnectRef.current = null;
      }
      return;
    }

    const connectYahoo = () => {
      if (yahooWsRef.current) yahooWsRef.current.close(1000, "reconnect");
      if (yahooReconnectRef.current) {
        clearTimeout(yahooReconnectRef.current);
        yahooReconnectRef.current = null;
      }

      const ws = new WebSocket("wss://streamer.finance.yahoo.com");
      ws.onopen = () => {
        ws.send(JSON.stringify({ subscribe: stockSymbols }));
        console.log("⚡ Yahoo WS connected for", stockSymbols.join(", "));
      };

      ws.onmessage = (event) => {
        try {
          const raw = atob(event.data);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const msg = decodeYFProto(bytes);
          const symbol = (msg.id || "").toUpperCase();
          const price = Number(msg.price);
          if (!symbol || !price || Number.isNaN(price)) return;

          setActiveTrades((prev) => {
            const updated = prev.map((t) => {
              if (t.symbol.toUpperCase() !== symbol) return t;
              const pnl =
                (price - t.entryPrice) *
                t.shares *
                (t.action === "SELL" ? -1 : 1);
              const pnlPct = (pnl / t.investmentAmount) * 100;
              return {
                ...t,
                currentPrice: price,
                currentPnl: pnl,
                currentPnlPercentage: pnlPct,
                lastPriceUpdate: new Date().toISOString(),
              };
            });
            // Real-time SL/TP check on every tick
            updated.forEach((t) => {
              if (
                t.symbol.toUpperCase() === symbol &&
                t.brokerOrderId &&
                !t.brokerOrderId.startsWith("PAPER")
              ) {
                checkAndAutoExit(t, price);
              }
            });
            return updated;
          });
        } catch {
          // ignore malformed tick
        }
      };

      ws.onclose = (e) => {
        if (e.code !== 1000) {
          yahooReconnectRef.current = setTimeout(connectYahoo, 2000);
        }
      };

      ws.onerror = () => ws.close();
      yahooWsRef.current = ws;
    };

    connectYahoo();
    return () => {
      if (yahooWsRef.current) {
        yahooWsRef.current.close(1000, "cleanup");
        yahooWsRef.current = null;
      }
      if (yahooReconnectRef.current) {
        clearTimeout(yahooReconnectRef.current);
        yahooReconnectRef.current = null;
      }
    };
  }, [
    activeTrades
      .map((t) => t.symbol.toUpperCase())
      .sort()
      .join(","),
    checkAndAutoExit,
  ]);

  // Delay chart mount for trade detail dialog until dialog animation completes
  useEffect(() => {
    if (!selectedTradeDetail) {
      setTradeDetailChartReady(false);
      setTradeDetailLivePrice(null);
      return;
    }
    const t = setTimeout(() => setTradeDetailChartReady(true), 250);
    return () => clearTimeout(t);
  }, [selectedTradeDetail?.id]);

  const convertAmount = (value: number, symbol?: string) => {
    const assetCurrency = symbol
      ? isUsdDenominatedSymbol(symbol)
        ? "USD"
        : "INR"
      : "INR";
    if (displayCurrency === assetCurrency) return value;
    if (
      displayCurrency === "USD" &&
      assetCurrency === "INR" &&
      usdPerInr &&
      usdPerInr > 0
    )
      return value * usdPerInr;
    if (
      displayCurrency === "INR" &&
      assetCurrency === "USD" &&
      usdPerInr &&
      usdPerInr > 0
    )
      return value / usdPerInr;
    return value;
  };

  const calculatePortfolioStats = () => {
    // Top summary should reflect only ACTIVE portfolio,
    // so completed trades do not distort current P&L.
    const activeInvested = activeTrades.reduce(
      (sum, t) => sum + convertAmount(t.investmentAmount, t.symbol),
      0,
    );
    const activePnL = activeTrades.reduce(
      (sum, t) => sum + convertAmount(t.currentPnl ?? 0, t.symbol),
      0,
    );
    const totalInvested = activeInvested;
    const totalPnL = activePnL;
    const totalPnLPercentage =
      totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    return {
      totalInvested,
      totalPnL,
      totalPnLPercentage,
      activeInvested,
      activePnL,
      completedInvested: 0,
      completedPnL: 0,
    };
  };

  const stats = calculatePortfolioStats();

  const currencySymbol = displayCurrency === "USD" ? "$" : "₹";

  if (loading) {
    return (
      <DashboardShellLayout>
        <div className="container max-w-7xl mx-auto p-3 sm:p-6">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </DashboardShellLayout>
    );
  }

  return (
    <DashboardShellLayout>
      <div className="container max-w-7xl mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
          <div className="pt-10 lg:pt-0 max-lg:hidden">
            <h1 className="text-2xl sm:text-3xl font-bold text-gradient">
              Active Trades
            </h1>
            <p className="text-muted-foreground text-sm">
              Track your live positions in real-time
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-white/10 px-2 text-xs bg-zinc-900/50 py-2">
              <span className="text-muted-foreground">Currency:</span>
              <button
                className={`px-2 py-0.5 rounded-full ${displayCurrency === "INR" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDisplayCurrency("INR")}
              >
                INR
              </button>
              <button
                className={`px-2 py-0.5 rounded-full ${displayCurrency === "USD" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setDisplayCurrency("USD")}
              >
                USD
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="border-white/10 hover:bg-white/5"
            >
              <RefreshCw
                className={`h-4 w-4 sm:mr-2 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={handleOpenQuickPaperTrade}
              className="shadow-[0_0_20px_rgba(20,184,166,0.2)]"
            >
              <TrendingUp className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">New Paper Trade</span>
            </Button>
          </div>
        </div>

        {/* Pending Paper Strategies */}
        {(pendingPaperTrades.length > 0 || pendingPaperLoading) && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => setPendingPaperExpanded((v) => !v)}
            >
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-semibold text-violet-300">
                  Pending Paper Strategies
                </span>
                <Badge className="text-[10px] bg-violet-500/20 text-violet-300 border-violet-500/30 border">
                  {pendingPaperTrades.length}
                </Badge>
              </div>
              {pendingPaperExpanded ? (
                <ChevronUp className="h-4 w-4 text-violet-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-violet-400" />
              )}
            </button>
            {pendingPaperExpanded && (
              <div className="px-4 pb-4 space-y-3">
                {pendingPaperLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                  </div>
                ) : (
                  pendingPaperTrades.map((row) => (
                    <PendingPaperTradeCard
                      key={row.id}
                      row={row}
                      onCancelled={loadPendingPaperTrades}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Portfolio Summary */}
        {activeTrades.length > 0 && (
          <>
            {/* Prominent Real-time P/L Card */}
            <Card className="glass-panel border-teal-500/30 bg-gradient-to-br from-zinc-900/90 to-zinc-950">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full bg-teal-400 animate-pulse"
                      title="Live prices"
                    />
                    Profit &amp; Loss (Real-time)
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className="text-xs bg-teal-500/20 text-teal-400 border-teal-500/40"
                  >
                    Live
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                      Total P&amp;L
                    </p>
                    <p
                      className={`text-2xl sm:text-3xl md:text-4xl font-bold ${stats.totalPnL >= 0 ? "text-teal-400" : "text-red-500"}`}
                    >
                      {stats.totalPnL >= 0 ? "+" : ""}
                      {currencySymbol}
                      {stats.totalPnL.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                      Return
                    </p>
                    <p
                      className={`text-xl sm:text-2xl md:text-3xl font-bold ${stats.totalPnLPercentage >= 0 ? "text-teal-400" : "text-red-500"}`}
                    >
                      {stats.totalPnLPercentage >= 0 ? "+" : ""}
                      {stats.totalPnLPercentage.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                      Invested
                    </p>
                    <p className="text-lg sm:text-xl font-semibold text-white">
                      {currencySymbol}
                      {stats.totalInvested.toFixed(2)}
                    </p>
                  </div>
                </div>
                {/* Per-trade P&L breakdown */}
                <div className="border-t border-white/10 pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Per position
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeTrades.map((t) => {
                      const pnl = t.currentPnl ?? 0;
                      const pnlConverted = convertAmount(pnl, t.symbol);
                      const isPos = pnlConverted >= 0;
                      return (
                        <div
                          key={t.id}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-white/5 border border-white/10 text-sm"
                        >
                          <span className="font-medium text-white truncate max-w-[100px]">
                            {t.symbol}
                          </span>
                          <span
                            className={isPos ? "text-teal-400" : "text-red-500"}
                          >
                            {isPos ? "+" : ""}
                            {currencySymbol}
                            {pnlConverted.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            (
                            {t.currentPnlPercentage != null
                              ? `${t.currentPnlPercentage >= 0 ? "+" : ""}${t.currentPnlPercentage.toFixed(1)}%`
                              : "—"}
                            )
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <Card className="glass-panel">
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Total Invested
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <p className="text-lg sm:text-2xl font-bold text-white">
                    {currencySymbol}
                    {stats.totalInvested.toFixed(2)}
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Total P&amp;L
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <p
                    className={`text-lg sm:text-2xl font-bold ${stats.totalPnL >= 0 ? "text-teal-400" : "text-red-500"}`}
                  >
                    {stats.totalPnL >= 0 ? "+" : ""}
                    {currencySymbol}
                    {stats.totalPnL.toFixed(2)}
                  </p>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-[10px] sm:text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Portfolio Return
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  <p
                    className={`text-lg sm:text-2xl font-bold ${stats.totalPnLPercentage >= 0 ? "text-teal-400" : "text-red-500"}`}
                  >
                    {stats.totalPnLPercentage >= 0 ? "+" : ""}
                    {stats.totalPnLPercentage.toFixed(2)}%
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Trades Tabs */}
        <Tabs
          value={tabValue}
          className="w-full"
          onValueChange={(v) => {
            onTabChange(v);
            if (v === "orders" && brokerOrders.length === 0)
              loadBrokerOrders(false);
            if (v === "strategy-history")
              void loadStrategyHistory();
          }}
        >
          <div className="overflow-x-auto pb-1">
            <TabsList className="grid w-full max-w-4xl min-w-[420px] grid-cols-5">
              <TabsTrigger value="active" className="text-xs sm:text-sm">
                <Activity className="h-3.5 w-3.5 mr-1" />
                <span>Active ({activeTrades.length})</span>
              </TabsTrigger>
              <TabsTrigger value="completed" className="text-xs sm:text-sm">
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Completed</span>
                <span className="sm:hidden">Done</span>
                <span> ({completedTrades.length})</span>
              </TabsTrigger>
              <TabsTrigger value="orders" className="text-xs sm:text-sm">
                <History className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Broker Orders</span>
                <span className="sm:hidden">Orders</span>
              </TabsTrigger>
              <TabsTrigger value="strategy-history" className="text-xs sm:text-sm">
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Strategy Log</span>
                <span className="sm:hidden">Log</span>
              </TabsTrigger>
              <TabsTrigger value="performance" className="text-xs sm:text-sm">
                <BarChart3 className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Performance</span>
                <span className="sm:hidden">Perf.</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Active Trades */}
          <TabsContent value="active" className="space-y-4 mt-4">
            {/* Options paper positions — separate section */}
            <OptionsPaperDashboard showWhenEmpty />

            {activeTrades.length === 0 ? (
              <Alert className="border-white/10 bg-white/5">
                <Bell className="h-4 w-4 text-primary" />
                <AlertDescription>
                  No active trades.{" "}
                  {canLinkToPredict ? (
                    <>
                      Start by making a{" "}
                      <a
                        href="/predict"
                        className="underline font-medium text-primary"
                      >
                        new analysis
                      </a>{" "}
                      and clicking &quot;Start Tracking&quot;, or use{" "}
                    </>
                  ) : (
                    <>Use </>
                  )}
                  <span className="font-medium text-primary">New Paper Trade</span> above for a quick
                  paper position, or use{" "}
                  <span className="font-medium text-primary">Paper Trade</span> on a strategy in{" "}
                  <a href="/strategies" className="underline font-medium text-primary">
                    My Strategies
                  </a>{" "}
                  / Algo Trade to wait for your strategy conditions.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="minimal-panel rounded-xl overflow-hidden">
                  {/* Table Header — hidden on xs, visible sm+ */}
                  <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-4 py-3 border-b border-white/5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-black/20">
                    <div>Market</div>
                    <div className="text-right w-24 sm:w-32">Invested</div>
                    <div className="text-right w-24 sm:w-32">Entry</div>
                    <div className="text-right w-24 sm:w-32">Current</div>
                    <div className="text-right w-24 sm:w-32">P/L</div>
                  </div>

                  {/* Table Rows */}
                  <div className="divide-y divide-white/5">
                    {activeTrades.map((trade) => {
                      const pnl = convertAmount(
                        trade.currentPnl ?? 0,
                        trade.symbol,
                      );
                      const pnlPercentage =
                        trade.currentPnlPercentage != null
                          ? trade.currentPnlPercentage
                          : (trade.investmentAmount ?? 0) > 0
                            ? ((trade.currentPnl ?? 0) /
                                (trade.investmentAmount ?? 1)) *
                              100
                            : 0;
                      const isNeutral = Math.abs(pnl) < 0.005;
                      const isPositive = !isNeutral && pnl > 0;
                      const pnlClass = isNeutral
                        ? "text-slate-400"
                        : isPositive
                          ? "text-teal-400"
                          : "text-red-500";
                      const pnlPrefix = isNeutral ? "" : isPositive ? "+" : "";
                      const displayPnl = isNeutral ? 0 : pnl;

                      const isPaper = Boolean(trade.brokerOrderId?.startsWith("PAPER"));

                      return (
                        <div
                          key={trade.id}
                          className="flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 sm:items-center px-3 sm:px-4 py-3 sm:py-4 hover:bg-white/5 cursor-pointer transition-colors"
                          onClick={() => setSelectedTradeDetail(trade)}
                        >
                          {/* Mobile layout: full width info */}
                          <div className="flex flex-col gap-1 min-w-0">
                            <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-sm tracking-tight truncate text-white">
                                  {trade.symbol.replace("-USD", "")}
                                </span>
                                <span
                                  className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded leading-none uppercase font-bold ${
                                    trade.action === "BUY"
                                      ? "bg-teal-500/10 text-teal-400"
                                      : "bg-red-500/10 text-red-400"
                                  }`}
                                >
                                  {trade.action}
                                </span>
                                {isPaper && (
                                  <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded leading-none uppercase font-bold bg-violet-500/10 text-violet-400">
                                    Paper
                                  </span>
                                )}
                              </div>
                              {/* Mobile-only P/L on the right */}
                              <div
                                className={`sm:hidden flex flex-col items-end leading-tight ${pnlClass}`}
                              >
                                <div className="flex items-center gap-1 text-sm font-bold">
                                  {isNeutral ? null : isPositive ? (
                                    <TrendingUp className="h-3.5 w-3.5" />
                                  ) : (
                                    <TrendingDown className="h-3.5 w-3.5" />
                                  )}
                                  {pnlPrefix}
                                  {currencySymbol}
                                  {Math.abs(displayPnl).toFixed(2)}
                                </div>
                                <span className="text-[11px] font-medium">
                                  {pnlPercentage >= 0 ? "+" : ""}
                                  {pnlPercentage.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                            <div
                              className={`hidden sm:flex items-center gap-1 text-[11px] font-medium ${pnlClass}`}
                            >
                              {isNeutral ? null : isPositive ? (
                                <TrendingUp className="h-3 w-3 shrink-0" />
                              ) : (
                                <TrendingDown className="h-3 w-3 shrink-0" />
                              )}
                              <span className="truncate">
                                {pnlPrefix}
                                {currencySymbol}
                                {Math.abs(displayPnl).toFixed(2)}
                              </span>
                            </div>
                            {/* Mobile price row */}
                            <div className="flex items-center gap-3 sm:hidden text-xs text-muted-foreground">
                              <span>
                                Entry: {currencySymbol}
                                {convertAmount(
                                  trade.entryPrice,
                                  trade.symbol,
                                ).toFixed(2)}
                              </span>
                              <span className={`font-semibold ${pnlClass}`}>
                                Now: {currencySymbol}
                                {convertAmount(
                                  trade.currentPrice || trade.entryPrice,
                                  trade.symbol,
                                ).toFixed(2)}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 leading-snug">
                              Ref: {currencySymbol}
                              {convertAmount(
                                trade.referenceEntryPrice ?? trade.entryPrice,
                                trade.symbol,
                              ).toFixed(2)}{" "}
                              ·{" "}
                              {formatSlippageLine(
                                trade.action,
                                trade.referenceEntryPrice,
                                trade.entryPrice,
                                (n) =>
                                  `${currencySymbol}${convertAmount(n, trade.symbol).toFixed(2)}`,
                              )}
                            </p>
                            {/* SL / TP badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {trade.stopLossPrice && (
                                <span className="flex items-center gap-0.5 text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded">
                                  <ShieldAlert className="h-2.5 w-2.5" />
                                  SL {currencySymbol}
                                  {convertAmount(
                                    trade.stopLossPrice,
                                    trade.symbol,
                                  ).toFixed(2)}
                                </span>
                              )}
                              {trade.takeProfitPrice && (
                                <span className="flex items-center gap-0.5 text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                                  <Target className="h-2.5 w-2.5" />
                                  TP {currencySymbol}
                                  {convertAmount(
                                    trade.takeProfitPrice,
                                    trade.symbol,
                                  ).toFixed(2)}
                                </span>
                              )}
                              {isPaper && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenClosePaperTrade(trade);
                                  }}
                                  className="flex items-center gap-0.5 text-[9px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded hover:bg-orange-500/20 transition-colors"
                                >
                                  <LogOut className="h-2.5 w-2.5" />
                                  Close
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Invested Amount Column — desktop only */}
                          <div className="hidden sm:block text-right w-24 sm:w-32 text-xs sm:text-sm font-medium text-muted-foreground tabular-nums">
                            {currencySymbol}
                            {convertAmount(
                              trade.investmentAmount || 0,
                              trade.symbol,
                            ).toFixed(2)}
                          </div>

                          {/* Entry Price Column — desktop only */}
                          <div className="hidden sm:flex flex-col items-end justify-center w-24 sm:w-36 text-right gap-0.5">
                            <span className="text-xs sm:text-sm font-medium text-muted-foreground tabular-nums">
                              {currencySymbol}
                              {convertAmount(
                                trade.entryPrice,
                                trade.symbol,
                              ).toFixed(2)}
                            </span>
                            <span className="text-[9px] text-zinc-500 leading-tight max-w-[7rem] text-right">
                              {formatSlippageLine(
                                trade.action,
                                trade.referenceEntryPrice,
                                trade.entryPrice,
                                (n) =>
                                  `${currencySymbol}${convertAmount(n, trade.symbol).toFixed(2)}`,
                              )}
                            </span>
                          </div>

                          {/* Current Price Column — desktop only */}
                          <div
                            className={`hidden sm:block text-right w-24 sm:w-32 text-xs sm:text-sm font-bold tabular-nums ${pnlClass}`}
                          >
                            {currencySymbol}
                            {convertAmount(
                              trade.currentPrice || trade.entryPrice,
                              trade.symbol,
                            ).toFixed(2)}
                          </div>

                          {/* P/L Column — desktop only */}
                          <div
                            className={`hidden sm:flex flex-col items-end text-right w-24 sm:w-32 tabular-nums ${pnlClass}`}
                          >
                            <span className="text-xs sm:text-sm font-bold">
                              {pnlPrefix}
                              {currencySymbol}
                              {Math.abs(displayPnl).toFixed(2)}
                            </span>
                            <span className="text-[11px] font-medium">
                              {pnlPercentage >= 0 ? "+" : ""}
                              {pnlPercentage.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* Completed Trades */}
          <TabsContent value="completed" className="space-y-4 mt-4">
            {completedTrades.length === 0 ? (
              <Alert className="border-white/10 bg-white/5">
                <CheckCircle className="h-4 w-4 text-primary" />
                <AlertDescription>
                  No completed trades yet. Tracked trades will appear here after
                  they finish.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {completedTrades.map((trade) => {
                  const isCompletedPaper = Boolean(trade.brokerOrderId?.startsWith("PAPER"));
                  return (
                  <Card
                    key={trade.id}
                    className="p-4 sm:p-6 border-white/5 bg-card hover:bg-white/5 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg sm:text-xl font-bold text-white">
                            {trade.symbol}
                          </h3>
                          <ActionSignal
                            action={trade.action}
                            confidence={trade.confidence || 0}
                            size="sm"
                          />
                          {isCompletedPaper && (
                            <Badge className="text-[10px] bg-violet-500/20 text-violet-300 border-violet-500/30 border">
                              Paper
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          {new Date(trade.entryTime).toLocaleDateString()} -{" "}
                          {trade.exitTime &&
                            new Date(trade.exitTime).toLocaleDateString()}
                        </p>
                        <div className="mt-2 text-xs sm:text-sm text-muted-foreground space-y-0.5">
                          <p>
                            Invested:{" "}
                            <span className="font-semibold text-zinc-300">
                              {currencySymbol}
                              {convertAmount(
                                trade.investmentAmount || 0,
                                trade.symbol,
                              ).toFixed(2)}
                            </span>
                          </p>
                          <p>
                            Entry: {currencySymbol}
                            {convertAmount(
                              trade.entryPrice || 0,
                              trade.symbol,
                            ).toFixed(2)}{" "}
                            | Exit:{" "}
                            {trade.exitPrice != null
                              ? `${currencySymbol}${convertAmount(trade.exitPrice, trade.symbol).toFixed(2)}`
                              : "N/A"}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            Ref @ open: {currencySymbol}
                            {convertAmount(
                              trade.referenceEntryPrice ?? trade.entryPrice,
                              trade.symbol,
                            ).toFixed(2)}{" "}
                            —{" "}
                            {formatSlippageLine(
                              trade.action,
                              trade.referenceEntryPrice,
                              trade.entryPrice,
                              (n) =>
                                `${currencySymbol}${convertAmount(n, trade.symbol).toFixed(2)}`,
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p
                          className={`text-xl sm:text-2xl font-bold ${(trade.actualPnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                        >
                          {(trade.actualPnl || 0) >= 0 ? "+" : ""}
                          {currencySymbol}
                          {convertAmount(
                            trade.actualPnl || 0,
                            trade.symbol,
                          ).toFixed(2)}
                        </p>
                        <p
                          className={`text-sm font-medium ${(trade.actualPnlPercentage || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                        >
                          {(trade.actualPnlPercentage || 0) >= 0 ? "+" : ""}
                          {trade.actualPnlPercentage?.toFixed(2) || "0.00"}%
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className="capitalize border-white/10 text-muted-foreground text-xs"
                        >
                          {trade.exitReason?.replace(/_/g, " ")}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="bg-white/10 text-zinc-300 hover:bg-white/20 text-xs"
                        >
                          {trade.shares} shares
                        </Badge>
                      </div>
                      {isCompletedPaper && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeletePaperTrade(trade.id)}
                          disabled={deletingTradeId === trade.id}
                          className="h-7 text-xs text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          {deletingTradeId === trade.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          Delete
                        </Button>
                      )}
                    </div>
                  </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Broker Orders Tab */}
          <TabsContent value="orders" className="space-y-4 mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs sm:text-sm text-zinc-400">
                Real-time orders from your broker via OpenAlgo.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadBrokerOrders(true)}
                disabled={ordersSyncing}
                className="border-zinc-700 hover:bg-zinc-800 text-xs"
              >
                {ordersSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Sync from Broker
              </Button>
            </div>

            {ordersLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
              </div>
            ) : brokerOrders.length === 0 ? (
              <Alert className="border-white/10 bg-white/5">
                <History className="h-4 w-4 text-zinc-400" />
                <AlertDescription className="text-zinc-400">
                  No broker orders found. Click &quot;Sync from Broker&quot; to
                  fetch your latest orders.
                  <br />
                  <span className="text-xs text-zinc-500 mt-1 block">
                    Requires an active OpenAlgo integration. Complete onboarding
                    at{" "}
                    <a href="/algo-setup" className="underline text-teal-400">
                      Algo Setup
                    </a>
                    .
                  </span>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Desktop Table */}
                <Card className="hidden sm:block bg-zinc-900 border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-800 text-xs text-zinc-400">
                          <th className="text-left px-4 py-3">Symbol</th>
                          <th className="text-left px-4 py-3">Action</th>
                          <th className="text-right px-4 py-3">Qty</th>
                          <th className="text-right px-4 py-3">Price</th>
                          <th className="text-left px-4 py-3">Type</th>
                          <th className="text-left px-4 py-3">Strategy</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-left px-4 py-3">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brokerOrders.map((order) => {
                          const statusColors: Record<string, string> = {
                            complete:
                              "bg-green-500/10 text-green-400 border-green-500/30",
                            rejected:
                              "bg-red-500/10 text-red-400 border-red-500/30",
                            open: "bg-teal-500/10 text-teal-400 border-teal-500/30",
                            cancelled:
                              "bg-zinc-700 text-zinc-400 border-zinc-600",
                            trigger_pending:
                              "bg-amber-500/10 text-amber-400 border-amber-500/30",
                          };
                          const sc =
                            statusColors[(order.status ?? "").toLowerCase()] ??
                            "bg-zinc-700 text-zinc-400 border-zinc-600";
                          const isBuy =
                            (order.action ?? "").toUpperCase() === "BUY";

                          return (
                            <tr
                              key={order.id}
                              className="border-b border-zinc-800/60 hover:bg-zinc-800/30"
                            >
                              <td className="px-4 py-3 font-mono font-medium text-white">
                                {order.symbol ?? "—"}
                                {order.exchange && (
                                  <span className="text-[10px] text-zinc-500 ml-1">
                                    {order.exchange}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`font-bold text-xs ${isBuy ? "text-green-400" : "text-red-400"}`}
                                >
                                  {order.action ?? "—"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-zinc-300">
                                {order.filled_quantity != null
                                  ? `${order.filled_quantity}/${order.quantity}`
                                  : (order.quantity ?? "—")}
                              </td>
                              <td className="px-4 py-3 text-right text-zinc-300">
                                {order.average_price
                                  ? `₹${order.average_price.toLocaleString()}`
                                  : order.price
                                    ? `₹${order.price.toLocaleString()}`
                                    : "—"}
                              </td>
                              <td className="px-4 py-3 text-zinc-400 text-xs">
                                {[order.order_type, order.product_type]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </td>
                              <td className="px-4 py-3 text-zinc-400 text-xs max-w-[120px] truncate">
                                {order.strategy_name ?? "—"}
                              </td>
                              <td className="px-4 py-3">
                                <Badge className={`text-[10px] border ${sc}`}>
                                  {(order.status ?? "unknown")
                                    .charAt(0)
                                    .toUpperCase() +
                                    (order.status ?? "unknown").slice(1)}
                                </Badge>
                                {order.rejection_reason && (
                                  <p
                                    className="text-[10px] text-red-400 mt-0.5 max-w-[100px] truncate"
                                    title={order.rejection_reason}
                                  >
                                    {order.rejection_reason}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                                {order.order_timestamp
                                  ? new Date(
                                      order.order_timestamp,
                                    ).toLocaleString()
                                  : new Date(order.synced_at).toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
                {/* Mobile Card List */}
                <div className="sm:hidden space-y-2">
                  {brokerOrders.map((order) => {
                    const statusColors: Record<string, string> = {
                      complete:
                        "bg-green-500/10 text-green-400 border-green-500/30",
                      rejected: "bg-red-500/10 text-red-400 border-red-500/30",
                      open: "bg-teal-500/10 text-teal-400 border-teal-500/30",
                      cancelled: "bg-zinc-700 text-zinc-400 border-zinc-600",
                      trigger_pending:
                        "bg-amber-500/10 text-amber-400 border-amber-500/30",
                    };
                    const sc =
                      statusColors[(order.status ?? "").toLowerCase()] ??
                      "bg-zinc-700 text-zinc-400 border-zinc-600";
                    const isBuy = (order.action ?? "").toUpperCase() === "BUY";
                    return (
                      <Card
                        key={order.id}
                        className="bg-zinc-900 border-zinc-800 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-white text-sm truncate">
                                {order.symbol ?? "—"}
                              </span>
                              {order.exchange && (
                                <span className="text-[10px] text-zinc-500">
                                  {order.exchange}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span
                                className={`font-bold text-xs ${isBuy ? "text-green-400" : "text-red-400"}`}
                              >
                                {order.action ?? "—"}
                              </span>
                              <span className="text-zinc-400 text-xs">
                                {order.filled_quantity != null
                                  ? `${order.filled_quantity}/${order.quantity}`
                                  : (order.quantity ?? "—")}{" "}
                                shares
                              </span>
                              {(order.average_price || order.price) && (
                                <span className="text-zinc-300 text-xs font-mono">
                                  ₹
                                  {(
                                    order.average_price || order.price
                                  )?.toLocaleString()}
                                </span>
                              )}
                            </div>
                            {order.strategy_name && (
                              <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                                {order.strategy_name}
                              </p>
                            )}
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                              {order.order_timestamp
                                ? new Date(
                                    order.order_timestamp,
                                  ).toLocaleString()
                                : new Date(order.synced_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            <Badge className={`text-[10px] border ${sc}`}>
                              {(order.status ?? "unknown")
                                .charAt(0)
                                .toUpperCase() +
                                (order.status ?? "unknown").slice(1)}
                            </Badge>
                            {order.rejection_reason && (
                              <p
                                className="text-[10px] text-red-400 mt-0.5 max-w-[120px] truncate"
                                title={order.rejection_reason}
                              >
                                {order.rejection_reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* Strategy History Tab */}
          <TabsContent value="strategy-history" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-white">Strategy Trade Log</h2>
                <p className="text-xs text-zinc-500 mt-0.5">All paper strategy entries — executed, cancelled, and expired — grouped by strategy.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-zinc-700"
                onClick={() => void loadStrategyHistory()}
                disabled={strategyHistoryLoading}
              >
                {strategyHistoryLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Refresh
              </Button>
            </div>

            {strategyHistoryLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500 py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading strategy history…
              </div>
            ) : strategyHistory.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center space-y-2">
                <BookOpen className="h-8 w-8 text-zinc-600 mx-auto" />
                <p className="text-sm text-zinc-400">No strategy history yet.</p>
                <p className="text-xs text-zinc-600">Executed, cancelled, and expired paper strategies will appear here.</p>
              </div>
            ) : (() => {
              // Group by strategy name
              const grouped: Record<string, StrategyHistoryRow[]> = {};
              for (const r of strategyHistory) {
                const key = r.strategy_name ?? r.strategy_id ?? "Unknown Strategy";
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(r);
              }
              return (
                <div className="space-y-4">
                  {Object.entries(grouped).map(([stratName, rows]) => {
                    const executed = rows.filter((r) => r.status === "executed").length;
                    const cancelled = rows.filter((r) => r.status === "cancelled").length;
                    const expired = rows.filter((r) => r.status === "expired").length;
                    return (
                      <div key={stratName} className="rounded-xl border border-white/10 bg-zinc-900/40 overflow-hidden">
                        {/* Strategy header */}
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
                          <div className="flex items-center gap-2 min-w-0">
                            <FlaskConical className="h-4 w-4 text-teal-400 shrink-0" />
                            <span className="font-semibold text-sm text-white truncate">{stratName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] shrink-0">
                            {executed > 0 && (
                              <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="h-3 w-3" />{executed} executed
                              </span>
                            )}
                            {cancelled > 0 && (
                              <span className="flex items-center gap-1 text-zinc-400 bg-zinc-700/30 border border-zinc-600/30 px-2 py-0.5 rounded-full">
                                <Ban className="h-3 w-3" />{cancelled} cancelled
                              </span>
                            )}
                            {expired > 0 && (
                              <span className="flex items-center gap-1 text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                                <Clock className="h-3 w-3" />{expired} expired
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Rows */}
                        <div className="divide-y divide-zinc-800/60">
                          {rows.map((r) => {
                            const statusColor =
                              r.status === "executed"
                                ? "text-emerald-400"
                                : r.status === "expired"
                                ? "text-orange-400"
                                : "text-zinc-400";
                            const StatusIcon =
                              r.status === "executed"
                                ? CheckCircle2
                                : r.status === "expired"
                                ? Clock
                                : r.status === "cancelled"
                                ? Ban
                                : AlertTriangle;
                            const isUserCancel = r.error_message === "Cancelled by user";
                            const isTimeCancel = r.error_message?.startsWith("Auto-cancelled:");
                            return (
                              <div key={r.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                                <StatusIcon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", statusColor)} />
                                <div className="flex-1 min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm text-white">{r.symbol}</span>
                                    <span className={cn(
                                      "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                                      r.action === "BUY" ? "bg-teal-500/10 text-teal-400" : "bg-red-500/10 text-red-400"
                                    )}>
                                      {r.action}
                                    </span>
                                    <span className="text-[10px] text-zinc-500">×{r.quantity}</span>
                                    <span className={cn("text-[10px] font-medium capitalize", statusColor)}>
                                      {r.status}
                                    </span>
                                    <span className="text-[10px] text-zinc-600">
                                      {new Date(r.created_at).toLocaleDateString("en-IN", {
                                        day: "2-digit", month: "short", year: "2-digit",
                                        hour: "2-digit", minute: "2-digit",
                                      })}
                                    </span>
                                  </div>
                                  {r.error_message && !isUserCancel && !isTimeCancel && (
                                    <p className="text-[11px] text-zinc-500 leading-snug truncate" title={r.error_message}>
                                      {r.error_message}
                                    </p>
                                  )}
                                  {isUserCancel && (
                                    <p className="text-[11px] text-zinc-600">Manually cancelled</p>
                                  )}
                                  {isTimeCancel && (
                                    <p className="text-[11px] text-orange-400/70">Window expired for the day</p>
                                  )}
                                  {r.last_checked_at && (
                                    <p className="text-[10px] text-zinc-700">
                                      Last checked {new Date(r.last_checked_at).toLocaleTimeString()}
                                    </p>
                                  )}
                                </div>
                                {/* Pass/fail summary from error_message audit lines */}
                                {(() => {
                                  const lines = (r.error_message ?? "")
                                    .split("\n")
                                    .filter((l) => l.startsWith("PASS ") || l.startsWith("FAIL "));
                                  if (lines.length === 0) return null;
                                  const p = lines.filter((l) => l.startsWith("PASS ")).length;
                                  const f = lines.filter((l) => l.startsWith("FAIL ")).length;
                                  return (
                                    <div className="text-[10px] text-right shrink-0 space-y-0.5">
                                      <div className="text-emerald-400">{p} ✓</div>
                                      <div className="text-red-400">{f} ✗</div>
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </TabsContent>

          {/* Performance Tab - Paper trade stats only */}
          <TabsContent value="performance" className="space-y-6 mt-6">
            <PerformanceDashboard />
          </TabsContent>
        </Tabs>

        <Dialog open={showQuickPaperDialog} onOpenChange={setShowQuickPaperDialog}>
          <DialogContent className="w-[92vw] sm:max-w-lg">
            {(() => {
              const qty = Number(paperQuantity);
              const parsedInvestment = Number(paperInvestmentAmount);
              const actualInvestmentAmountInAsset =
                paperSymbolData?.full_symbol &&
                Number.isFinite(qty) &&
                qty > 0 &&
                paperEntryPrice != null
                  ? paperEntryPrice * qty
                  : null;
              const actualInvestmentAmount =
                actualInvestmentAmountInAsset != null
                  ? convertBetweenInrUsd(
                      actualInvestmentAmountInAsset,
                      paperAssetCurrency,
                      paperInvestmentCurrency,
                    )
                  : null;
              const showInvestmentMismatch =
                actualInvestmentAmount != null &&
                Number.isFinite(parsedInvestment) &&
                parsedInvestment > 0 &&
                Math.abs(parsedInvestment - actualInvestmentAmount) > 0.009;
              const quantityLabel =
                Number.isFinite(qty) && qty > 0
                  ? isPaperCrypto
                    ? qty
                    : Math.max(1, Math.round(qty))
                  : isPaperCrypto
                    ? 0
                    : 1;
              const paperCurrencySymbol =
                paperInvestmentCurrency === "USD" ? "$" : "₹";

              return (
                <>
            <DialogHeader>
              <DialogTitle>Quick Paper Trade</DialogTitle>
              <DialogDescription>
                Enter symbol and quantity, then pick a strategy for an immediate paper position (entry at current price).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Symbol</Label>
                <SymbolSearch
                  value={paperSymbolValue}
                  onValueChange={handlePaperSymbolValueChange}
                  onSelectSymbol={handlePaperSymbolSelect}
                  placeholder="Search symbol (NYSE, LSE, NSE, BSE, crypto, forex)"
                />
                {paperSymbolPriceLoading && (
                  <p className="text-xs text-muted-foreground">
                    Fetching latest price...
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[30%,1fr] gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paper-qty">Quantity</Label>
                  <div className="relative">
                    <Input
                      id="paper-qty"
                      type="number"
                      min={isPaperCrypto ? 0.000001 : 1}
                      step={isPaperCrypto ? "0.000001" : 1}
                      value={paperQuantity}
                      onChange={(e) => handlePaperQuantityChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          !isPaperCrypto &&
                          [".", ",", "e", "E", "+", "-"].includes(e.key)
                        ) {
                          e.preventDefault();
                        }
                      }}
                      placeholder={isPaperCrypto ? "e.g. 0.25" : "e.g. 10"}
                      disabled={!paperSymbolData}
                      className="pr-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <div className="absolute inset-y-0 right-1 my-1 flex w-7 flex-col overflow-hidden rounded border border-white/10 bg-black/30">
                      <button
                        type="button"
                        className="flex-1 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40"
                        onClick={() => adjustPaperQuantity("up")}
                        disabled={!paperSymbolData}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="flex-1 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 border-t border-white/10 disabled:opacity-40"
                        onClick={() => adjustPaperQuantity("down")}
                        disabled={!paperSymbolData}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="paper-investment">Investment Amount</Label>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md border border-white/10 bg-black/20 p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handlePaperInvestmentCurrencyChange("INR")}
                        disabled={!paperSymbolData}
                        className={`px-2 py-1 text-xs rounded ${paperInvestmentCurrency === "INR" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        ₹ INR
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePaperInvestmentCurrencyChange("USD")}
                        disabled={!paperSymbolData}
                        className={`px-2 py-1 text-xs rounded ${paperInvestmentCurrency === "USD" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        $ USD
                      </button>
                    </div>
                    <div className="relative flex-1">
                      <Input
                        id="paper-investment"
                        type="number"
                        min={0}
                        step="0.01"
                        value={paperInvestmentAmount}
                        onChange={(e) =>
                          handlePaperInvestmentAmountChange(e.target.value)
                        }
                        placeholder={
                          paperInvestmentCurrency === "USD" ? "e.g. 500.00 USD" : "e.g. 500.00 INR"
                        }
                        disabled={!paperSymbolData}
                        className="pr-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <div className="absolute inset-y-0 right-1 my-1 flex w-7 flex-col overflow-hidden rounded border border-white/10 bg-black/30">
                        <button
                          type="button"
                          className="flex-1 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40"
                          onClick={() => adjustPaperInvestmentAmount("up")}
                          disabled={!paperSymbolData}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          className="flex-1 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 border-t border-white/10 disabled:opacity-40"
                          onClick={() => adjustPaperInvestmentAmount("down")}
                          disabled={!paperSymbolData}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {showInvestmentMismatch && actualInvestmentAmount != null && (
                <p className="text-xs text-amber-400">
                  Actual amount for {quantityLabel} quantity is{" "}
                  {paperCurrencySymbol}
                  {actualInvestmentAmount.toFixed(2)}.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowQuickPaperDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleContinuePaperSetup}
                disabled={paperPriceLoading || paperSymbolPriceLoading || !paperSymbolData}
              >
                {paperPriceLoading ? "Loading price..." : "Continue to Strategy"}
              </Button>
            </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        <StrategySelectionDialog
          open={showPaperStrategyDialog}
          onOpenChange={setShowPaperStrategyDialog}
          currentStrategy="trend_following"
          symbol={paperSymbolData?.full_symbol || paperSymbolValue}
          action="BUY"
          investment={
            Number(paperInvestmentAmount) > 0
              ? Number(paperInvestmentAmount)
              : paperEntryPrice && Number(paperQuantity) > 0
                ? paperEntryPrice * Number(paperQuantity)
                : 10000
          }
          timeframe="1d"
          currentPrice={paperEntryPrice ?? undefined}
          isPaperTrade={true}
          onConfirm={handleCreatePaperTrade}
        />

        {/* ── Full-screen Trade Detail Dialog ─────────────────────────── */}
        <Dialog
          open={selectedTradeDetail != null}
          onOpenChange={(o) => { if (!o) setSelectedTradeDetail(null); }}
        >
          <DialogContent
            hideCloseButton
            className="!fixed !inset-0 !translate-x-0 !translate-y-0 !left-0 !top-0 !max-w-none !max-h-none !w-screen !h-screen !rounded-none bg-zinc-950 border-0 text-white p-0 !overflow-hidden flex flex-col"
          >
            {selectedTradeDetail && (() => {
              const t = selectedTradeDetail;
              const livePrice = tradeDetailLivePrice ?? t.currentPrice ?? t.entryPrice;
              const pnl = tradeDetailLivePrice != null
                ? (tradeDetailLivePrice - t.entryPrice) * t.shares * (t.action === "SELL" ? -1 : 1)
                : (t.currentPnl ?? 0);
              const pnlPct = t.investmentAmount > 0 ? (pnl / t.investmentAmount) * 100 : 0;
              const isPos = pnl >= 0;
              const isPaper = Boolean(t.brokerOrderId?.startsWith("PAPER"));
              const yahooSym = t.symbol.toUpperCase();
              return (
                <>
                  {/* Header */}
                  <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-white">{t.symbol}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${t.action === "BUY" ? "bg-teal-500/15 text-teal-400" : "bg-red-500/15 text-red-400"}`}>
                            {t.action}
                          </span>
                          {isPaper && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-violet-500/15 text-violet-400">Paper</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {t.strategyType ? `${t.strategyType} · ` : ""}{t.shares} units · entered {new Date(t.entryTime).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className={`text-lg font-bold tabular-nums ${isPos ? "text-teal-400" : "text-red-400"}`}>
                          {isPos ? "+" : ""}₹{Math.abs(pnl).toFixed(2)}
                        </div>
                        <div className={`text-xs tabular-nums ${isPos ? "text-teal-300" : "text-red-300"}`}>
                          {isPos ? "+" : ""}{pnlPct.toFixed(2)}%
                        </div>
                      </div>
                      <DialogPrimitive.Close className="rounded-sm opacity-70 hover:opacity-100 text-zinc-400 hover:text-white transition-opacity ml-2">
                        <X className="h-5 w-5" />
                      </DialogPrimitive.Close>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-800 overflow-hidden">
                    {/* Chart (left 2/3) */}
                    <div className="lg:col-span-2 h-[50vh] lg:h-auto">
                      {tradeDetailChartReady ? (
                        <YahooChartPanel
                          symbol={yahooSym}
                          displayName={t.symbol}
                          onLivePrice={(p) => setTradeDetailLivePrice(p)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-900/60">
                          <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
                        </div>
                      )}
                    </div>

                    {/* Details panel (right 1/3) */}
                    <div className="p-4 overflow-y-auto space-y-3 min-h-0">
                      {/* Key stats */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { label: "Entry", val: `₹${t.entryPrice.toFixed(2)}` },
                          { label: "Current", val: `₹${livePrice.toFixed(2)}` },
                          { label: "Invested", val: `₹${t.investmentAmount.toFixed(2)}` },
                          { label: "Qty", val: String(t.shares) },
                          t.stopLossPrice ? { label: "Stop Loss", val: `₹${t.stopLossPrice.toFixed(2)}` } : null,
                          t.takeProfitPrice ? { label: "Take Profit", val: `₹${t.takeProfitPrice.toFixed(2)}` } : null,
                        ].filter(Boolean).map((row) => (
                          <div key={row!.label} className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
                            <div className="text-zinc-500">{row!.label}</div>
                            <div className="text-zinc-100 font-semibold">{row!.val}</div>
                          </div>
                        ))}
                      </div>

                      {/* SL/TP progress bars */}
                      {(t.stopLossPrice || t.takeProfitPrice) && (
                        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 space-y-2 text-xs">
                          {t.stopLossPrice && (
                            <div className="flex items-center justify-between gap-2">
                              <ShieldAlert className="h-3 w-3 text-red-400 shrink-0" />
                              <span className="text-zinc-400">SL</span>
                              <span className="text-red-300 font-mono">₹{t.stopLossPrice.toFixed(2)}</span>
                            </div>
                          )}
                          {t.takeProfitPrice && (
                            <div className="flex items-center justify-between gap-2">
                              <Target className="h-3 w-3 text-emerald-400 shrink-0" />
                              <span className="text-zinc-400">TP</span>
                              <span className="text-emerald-300 font-mono">₹{t.takeProfitPrice.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Close action for paper trades */}
                      {isPaper && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTradeDetail(null);
                            handleOpenClosePaperTrade(t);
                          }}
                        >
                          <LogOut className="h-4 w-4 mr-2" />
                          Close Position
                        </Button>
                      )}

                      {/* View full details link */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTradeDetail(null);
                          navigate(`/trade/${t.id}`);
                        }}
                        className="w-full text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 py-1"
                      >
                        Open full detail page →
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Manual close active paper trade dialog */}
        <Dialog
          open={Boolean(closePaperTradeId)}
          onOpenChange={(o) => { if (!o) setClosePaperTradeId(null); }}
        >
          <DialogContent className="w-[92vw] sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Close Paper Position</DialogTitle>
              <DialogDescription>
                Enter the exit price to manually close this paper trade.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="close-paper-price">Exit Price</Label>
              <Input
                id="close-paper-price"
                type="number"
                min={0.01}
                step={0.01}
                value={closePaperPrice}
                onChange={(e) => setClosePaperPrice(e.target.value)}
                placeholder="e.g. 2450.50"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setClosePaperTradeId(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleClosePaperTrade}
                disabled={closingPaper}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {closingPaper ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <LogOut className="h-4 w-4 mr-1" />}
                Close Position
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShellLayout>
  );
}
