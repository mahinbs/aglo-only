import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SymbolSearch } from "@/components/SymbolSearch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import YahooChartPanel from "@/components/YahooChartPanel";
import { AdvancedPredictLoader } from "@/components/AdvancedPredictLoader";
import { PredictionTimeline } from "@/components/PredictionTimeline";
import { Stepper } from "@/components/ui/stepper";
import { StepContainer } from "@/components/ui/step-container";
import { ForecastTable } from "@/components/prediction/ForecastTable";
import { KeyLevels } from "@/components/prediction/KeyLevels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Insights } from "@/components/prediction/Insights";
import { NewsAnalysis } from "@/components/news/NewsAnalysis";
import { MarketStatus } from "@/components/market/MarketStatus";
import {
  UserProfileForm,
  UserProfile,
} from "@/components/prediction/UserProfileForm";
import { DecisionScreen } from "@/components/prediction/DecisionScreen";
import { ProbabilityPanel } from "@/components/prediction/ProbabilityPanel";
import { LeverageSimulator } from "@/components/prediction/LeverageSimulator";
import { RegulatoryDisclaimer } from "@/components/prediction/RegulatoryDisclaimer";
import { AIReasoningDisplay } from "@/components/prediction/AIReasoningDisplay";
// StrategyEntrySignalsPanel moved to Trading Dashboard
import { CapitalScenarios } from "@/components/prediction/CapitalScenarios";
import { MarketConditionsDashboard } from "@/components/market/MarketConditionsDashboard";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { HELP } from "@/lib/analysis-ui-help";
import { supabase } from "@/integrations/supabase/client";
import type { SymbolData } from "@/components/SymbolSearch";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTradingIntegration } from "@/hooks/useTradingIntegration";
import { useSubscription } from "@/hooks/useSubscription";
import { TradingIntegrationModal } from "@/components/trading/TradingIntegrationModal";
import BrokerSyncSection from "@/components/trading/BrokerSyncSection";
import PreOrderConfirmSheet, {
  PreOrderData,
} from "@/components/trading/PreOrderConfirmSheet";
import {
  StrategySelectionDialog,
  STRATEGIES,
} from "@/components/trading/StrategySelectionDialog";
import { UsePreviousOrNewStrategyDialog } from "@/components/trading/UsePreviousOrNewStrategyDialog";
import { PRICING_PLANS, PRICING_SETUP_AND_MONTHLY_NOTE } from "@/constants/pricing";
import { isMidTierEligibleForProOnlyUpgrade } from "@/lib/subscriptionEntitlements";
import {
  createBillingPortalSession,
  createCheckoutSession,
  hasActiveSubscription,
} from "@/services/stripeService";
import { getStrategyParams } from "@/constants/strategyParams";
import { toast } from "sonner";
import {
  Loader2,
  AlertTriangle,
  BrainCircuit,
  BarChart3,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  LogOut,
  History,
  Timer,
  Home,
  FlaskConical,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  Minus,
  ExternalLink,
  Repeat2,
  Menu,
  X,
} from "lucide-react";
import gsap from "gsap";
import { Container } from "@/components/layout/Container";
import { formatCurrency } from "@/lib/display-utils";
import { isUsdDenominatedSymbol } from "@/lib/tradingview-symbols";
import { fetchUsdPerInr } from "@/lib/fx-inr-usd";
import {
  convertQuoteToDisplayAmount,
  convertDisplayInputToQuoteAmount,
} from "@/lib/convert-quote-display-currency";
import type { ActiveTrade } from "@/services/tradeTrackingService";
import {
  predictionRowToResult,
  loadPredictionForUser,
  type PostOutcomeRow,
} from "@/lib/prediction-persistence";
import { readPredictionAnalysisCache } from "@/lib/prediction-analysis-cache";
import { cn } from "@/lib/utils";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";

interface GeminiForecast {
  symbol: string;
  as_of: string;
  forecasts: Array<{
    horizon: string;
    direction: "up" | "down" | "sideways";
    probabilities: { up: number; down: number; sideways: number };
    expected_return_bp: number;
    expected_range_bp: { p10: number; p50: number; p90: number };
    key_drivers: string[];
    risk_flags: string[];
    confidence: number;
    invalid_if: string[];
  }>;
  support_resistance: {
    supports: Array<{ level: number; strength: number }>;
    resistances: Array<{ level: number; strength: number }>;
  };
  positioning_guidance: {
    bias: "long" | "short" | "flat";
    notes: string;
    recommended_hold_period?: string;
  };
  // Enhanced decision-making fields
  action_signal?: {
    action: "BUY" | "SELL" | "HOLD";
    confidence: number;
    urgency: "HIGH" | "MEDIUM" | "LOW";
  };
  risk_grade?: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  expected_roi?: {
    best_case: number;
    likely_case: number;
    worst_case: number;
  };
  // NEW: Deep analysis fields
  deep_analysis?: {
    bullish_case?: string;
    bearish_case?: string;
    contrarian_view?: string;
    conviction_rationale?: string;
    invalidation_triggers?: string[];
    risk_reward_ratio?: number;
    success_probability?: number;
  };
  market_context?: {
    correlation_insight?: string;
    sector_strength?: string;
    macro_factors?: string;
    institutional_activity?: string;
  };
}

interface PipelineStep {
  name: string;
  status: "pending" | "running" | "completed" | "error";
  startTime?: number;
  endTime?: number;
  duration?: number;
  details?: string;
}

interface PipelineMeta {
  totalDuration: number;
  steps: PipelineStep[];
  startTime: number;
  endTime: number;
}

interface PredictionResult {
  symbol: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  timeframe: string;
  analysis: string;
  stockData: {
    currentPrice: number;
    openPrice: number;
    highPrice: number;
    lowPrice: number;
    previousClose: number;
    change: number;
    changePercent: number;
  };
  geminiForecast?: GeminiForecast;
  meta?: {
    pipeline?: PipelineMeta;
  };
  // Legacy structured fields for backward compatibility
  recommendation?: "bullish" | "bearish" | "neutral";
  confidence?: number;
  expectedMove?: {
    percent?: number;
    direction?: "up" | "down" | "flat";
    priceTarget?: {
      min: number;
      max: number;
    };
  };
  patterns?: string[];
  keyLevels?: {
    support?: number[];
    resistance?: number[];
  };
  risks?: string[];
  opportunities?: string[];
  rationale?: string;
  // Enhanced decision-making fields
  positionSize?: {
    shares: number;
    costPerShare: number;
    totalCost: number;
    remainingCash?: number;
  };
  leverage?: number;
  marginType?: string;
  isCrypto?: boolean;
  volumeData?: {
    volume24h?: number | null;
    volumeProfile?: string;
    volumeConfirmation?: number;
    avgVolume?: number | null;
  };
}

interface PredictionPreset {
  symbol: string | null;
  timeframe: string | null;
  custom_timeframe: string | null;
  investment: number | null;
  profile: Partial<UserProfile> | null;
}

const PredictPage = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const savedPredictionId = searchParams.get("saved");

  useEffect(() => {
    if (isMobileMenuOpen && mobileMenuRef.current) {
      gsap.fromTo(
        mobileMenuRef.current,
        { x: -500, y: 0, scale: 0.5, opacity: 1 },
        {
          x: 0,
          y: 0,
          scale: 1,
          opacity: 1,
          duration: 0.2,
          ease: "sine",
          transformOrigin: "top left",
        },
      );
    }
  }, [isMobileMenuOpen]);

  const closeMobileMenu = () => {
    if (mobileMenuRef.current) {
      gsap.to(mobileMenuRef.current, {
        x: -500,
        scale: 0.5,
        opacity: 0,
        duration: 0.2,
        ease: "sine.in",
        onComplete: () => setIsMobileMenuOpen(false),
      });
    } else {
      setIsMobileMenuOpen(false);
    }
  };
  const [symbol, setSymbol] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolData | null>(null);
  const [investment, setInvestment] = useState("");
  const [userProfile, setUserProfile] = useState<Partial<UserProfile>>({
    riskTolerance: "medium",
    tradingStyle: "swing_trading",
    investmentGoal: "growth",
    stopLossPercentage: 5,
    targetProfitPercentage: 15,
    marginType: "cash",
    leverage: 1,
  });
  const [timeframe, setTimeframe] = useState("1h"); // User-selectable timeframe
  const [customTimeframe, setCustomTimeframe] = useState(""); // For custom timeframe input
  const [currentStep, setCurrentStep] = useState("choose-asset");
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdvancedLoader, setShowAdvancedLoader] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [chartAnalysis, setChartAnalysis] = useState<string | null>(null);
  const [chartDataSource, setChartDataSource] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<any>(null);
  const [marketClosed, setMarketClosed] = useState(false);
  const [predictedAt, setPredictedAt] = useState<Date | null>(null);
  const [marketTimeZone, setMarketTimeZone] = useState<string | null>(null);
  /** Post-window outcome + optional DB merge for entry-signal AI context */
  const [loadedPostOutcome, setLoadedPostOutcome] =
    useState<PostOutcomeRow | null>(null);
  const [latestPreset, setLatestPreset] = useState<PredictionPreset | null>(
    null,
  );
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetChecked, setPresetChecked] = useState(false);
  // Have we already asked \"use previous details?\" in this flow (after symbol + investment)?
  const [presetPromptShown, setPresetPromptShown] = useState(false);
  /** Tracks last non-null `saved` query so we can detect /predict?saved=… → /predict */
  const prevSavedPredictionIdRef = useRef<string | null>(null);

  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  // Open a previously saved analysis (same Results UI as live run)
  useEffect(() => {
    if (!savedPredictionId || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await loadPredictionForUser(savedPredictionId, user.id);
        if (cancelled || !row) throw new Error("not found");
        const parsed = predictionRowToResult(
          row as Parameters<typeof predictionRowToResult>[0],
        );
        if (!parsed?.geminiForecast) throw new Error("incomplete");

        setResult(parsed as PredictionResult);
        setSymbol((row as any).symbol || "");
        setInvestment(
          (row as any).investment != null
            ? String((row as any).investment)
            : "10000",
        );
        setTimeframe((row as any).timeframe || "1h");
        const raw = (row as any).raw_response;
        if (raw?.savedUserProfile && typeof raw.savedUserProfile === "object") {
          setUserProfile((prev) => ({ ...prev, ...raw.savedUserProfile }));
        }
        if (
          raw?.savedDisplayCurrency === "USD" ||
          raw?.savedDisplayCurrency === "INR"
        ) {
          setDisplayCurrency(raw.savedDisplayCurrency);
        } else if ((parsed as PredictionResult).isCrypto) {
          setDisplayCurrency("USD");
        }
        setPredictedAt(new Date((row as any).created_at));
        setLoadedPostOutcome(() => {
          const po = (row as any).post_outcome_analysis as
            | PostOutcomeRow
            | null
            | undefined;
          if (po?.evaluation) return po;
          const cache = readPredictionAnalysisCache()[savedPredictionId];
          if (cache?.data?.evaluation) {
            return {
              evaluation: cache.data.evaluation,
              ai: cache.data.ai,
              marketData: cache.data.marketData,
              dataSource: cache.data.dataSource,
            };
          }
          return po ?? null;
        });
        setCurrentStep("results");
        setCompletedSteps([
          "choose-asset",
          "trading-profile",
          "review",
          "analysis",
          "results",
        ]);
        setPlacedTrade(null);

        const sym = (row as any).symbol as string;
        const { data: ms } = await supabase.functions.invoke(
          "get-market-status",
          {
          body: { symbol: sym },
          },
        );
        if (!cancelled && ms) {
          setMarketStatus(ms);
          setMarketTimeZone(ms.exchangeTimezoneName ?? null);
          setMarketClosed(
            ms.marketState === "CLOSED" ||
              ms.marketState === "PRE" ||
              ms.marketState === "POST",
          );
        }
      } catch {
        if (!cancelled) {
          toast.error("Could not load saved analysis");
          navigate("/predictions", { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [savedPredictionId, user?.id, navigate]);
  const isMobile = useIsMobile();

  const navItems = [
    { label: "Home", icon: Home, path: "/home", mobileLabel: "Home" },
    {
      label: "My Analyses",
      icon: History,
      path: "/predictions",
      mobileLabel: "History",
    },
    {
      label: "Intraday Trading",
      icon: Timer,
      path: "/intraday",
      mobileLabel: "Intraday",
    },
    { 
      label: "Sign Out", 
      icon: LogOut, 
      mobileLabel: "Sign Out",
      onClick: async () => {
        const { error } = await signOut();
        if (error) {
          toast.error("Failed to sign out");
        }
      },
    },
  ];
  const { save: saveTradingIntegration, refresh: refreshTradingIntegration } =
    useTradingIntegration();
  const {
    hasAlgoAccess,
    subscription,
    isExpiringSoon,
    daysUntilExpiry,
    isAutoRenewDisabled,
    isInGracePeriod,
  } = useSubscription();

  const midTierProOnlyUpgrade =
    hasActiveSubscription(subscription) &&
    isMidTierEligibleForProOnlyUpgrade(subscription?.plan_id);

  const algoDialogPlans = useMemo(
    () =>
      midTierProOnlyUpgrade ? PRICING_PLANS.filter((p) => p.id === "professionalPlan") : PRICING_PLANS,
    [midTierProOnlyUpgrade],
  );
  const [showIntegrationModal, setShowIntegrationModal] = useState(false);
  const [showStrategyDialog, setShowStrategyDialog] = useState(false);
  const [showPreviousOrNewDialog, setShowPreviousOrNewDialog] = useState(false);
  const [lastUsedStrategy, setLastUsedStrategy] = useState<{
    strategyType: string;
    product: string;
    label: string;
  } | null>(null);
  const [assignedStrategy, setAssignedStrategy] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<"INR" | "USD">("INR");
  /** USD per 1 INR — loaded on results when display currency ≠ quote currency */
  const [usdPerInr, setUsdPerInr] = useState<number | null>(null);
  const [isPaperTrade, setIsPaperTrade] = useState(false);
  const [showPremiumDialog, setShowPremiumDialog] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);
  const [preOrderData, setPreOrderData] = useState<PreOrderData | null>(null);
  const [showPreOrderSheet, setShowPreOrderSheet] = useState(false);
  const pendingOrderRef = useRef<{
    strategy: string;
    product: string;
    action: "BUY" | "SELL";
    sellPosition?: { entryPrice: number; shares: number };
  } | null>(null);

  // ── After-order live P&L tracking state ──────────────────────────────────────
  const [placedTrade, setPlacedTrade] = useState<ActiveTrade | null>(null);
  const [showBuyMoreDialog, setShowBuyMoreDialog] = useState(false);
  const [showSellDialog, setShowSellDialog] = useState(false);
  const [buyMoreAmount, setBuyMoreAmount] = useState("");
  const [sellSharesInput, setSellSharesInput] = useState("");
  const [buyMoreLoading, setBuyMoreLoading] = useState(false);
  const [sellLoading, setSellLoading] = useState(false);

  const quoteInUsd = useMemo(
    () => Boolean(result && isUsdDenominatedSymbol(result.symbol)),
    [result?.symbol],
  );

  const effectivePriceCurrency = useMemo((): "INR" | "USD" => {
    if (!result) return displayCurrency;
    const mismatch =
      (displayCurrency === "USD" && !quoteInUsd) ||
      (displayCurrency === "INR" && quoteInUsd);
    if (mismatch && (usdPerInr == null || usdPerInr <= 0))
      return quoteInUsd ? "USD" : "INR";
    return displayCurrency;
  }, [result, displayCurrency, usdPerInr, quoteInUsd]);

  const formatPriceForUi = useCallback(
    (n: number, decimals = 2) =>
      formatCurrency(
        convertQuoteToDisplayAmount(n, quoteInUsd, displayCurrency, usdPerInr),
        decimals,
        false,
        effectivePriceCurrency,
      ),
    [quoteInUsd, displayCurrency, usdPerInr, effectivePriceCurrency],
  );

  useEffect(() => {
    if (currentStep !== "results" || !result) return;
    const q = isUsdDenominatedSymbol(result.symbol);
    const needsFx =
      (displayCurrency === "USD" && !q) || (displayCurrency === "INR" && q);
    if (!needsFx) return;
    let cancelled = false;
    fetchUsdPerInr().then((r) => {
      if (!cancelled && r != null) setUsdPerInr(r);
    });
    return () => {
      cancelled = true;
    };
  }, [currentStep, result?.symbol, displayCurrency, result]);

  // ── Mock / Paper order + track ────────────────────────────────────────────
  // `selectedAction` = user's chosen direction from StrategySelectionDialog.
  // `sellPosition`   = optional existing position data (buy price + shares) for SELL orders.
  const placeMockOrderAndTrack = useCallback(
    async (
    strategyCode: string,
    product: string,
    selectedAction: "BUY" | "SELL",
    sellPosition?: { entryPrice: number; shares: number },
  ) => {
    if (!result) return;
    const prefix = isPaperTrade ? "PAPER" : "OPENALGO";
    let brokerOrderId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const action = selectedAction;

    // For SELL: use the position data the user provided; default to current price / calculated shares
      const entryPrice =
        selectedAction === "SELL" && sellPosition?.entryPrice
      ? sellPosition.entryPrice
      : result.currentPrice;
      const shares =
        selectedAction === "SELL" && sellPosition?.shares
      ? sellPosition.shares
      : result.isCrypto
        ? (result.positionSize?.shares ?? 0)
        : Math.floor(result.positionSize?.shares || 0) || 1;

    const sp = getStrategyParams(strategyCode);
      const aiRecommendedPeriod =
        result.geminiForecast?.positioning_guidance?.recommended_hold_period;
    const userChosenPeriod = userProfile.userHoldingPeriod;
      const effectiveHoldingPeriod =
        !userChosenPeriod || userChosenPeriod === "ai_recommendation"
      ? (aiRecommendedPeriod ?? sp.defaultHoldPeriod)
          : userChosenPeriod === "none"
            ? sp.defaultHoldPeriod
            : userChosenPeriod;

      toast.loading("Placing order…", { id: "trade-start" });
    try {
        const { tradeTrackingService } =
          await import("@/services/tradeTrackingService");

      // Real trade path: place broker order first, then create tracking record.
      if (!isPaperTrade) {
          const strategyLabel =
            STRATEGIES.find((s) => s.value === strategyCode)?.label ??
            "ChartMate AI";
          const { data: orderData, error: orderErr } =
            await supabase.functions.invoke("openalgo-place-order", {
          body: {
            symbol: result.symbol,
            action,
            quantity: shares || 1,
            exchange: "NSE",
            product,
            pricetype: "MARKET",
            strategy: strategyLabel,
            strategy_code: strategyCode,
            intent: "entry",
          },
        });

        const orderError = (orderData as any)?.error ?? orderErr?.message;
        if (orderError) {
          toast.error(`Order failed: ${orderError}`, { id: "trade-start" });
          return;
        }

        brokerOrderId =
          (orderData as any)?.orderid ||
          (orderData as any)?.order_id ||
          (orderData as any)?.data?.orderid ||
          brokerOrderId;

        // Background: poll order fill status (non-blocking)
        if (brokerOrderId && !brokerOrderId.startsWith("OPENALGO-")) {
          (async () => {
              const {
                data: { session },
              } = await supabase.auth.getSession();
            for (let i = 0; i < 5; i++) {
                await new Promise((r) => setTimeout(r, 2500));
              try {
                  const pollRes = await supabase.functions.invoke(
                    "broker-data",
                    {
                  body: { action: "orderstatus", orderid: brokerOrderId },
                      headers: {
                        Authorization: `Bearer ${session?.access_token}`,
                      },
                    },
                  );
                  const status = (
                    (pollRes.data as any)?.data?.status ?? ""
                  ).toLowerCase();
                if (status === "complete") {
                    toast.success(
                      `Order ${brokerOrderId.slice(-6)} filled successfully ✓`,
                      { duration: 5000 },
                    );
                  break;
                } else if (status === "rejected" || status === "cancelled") {
                    toast.error(
                      `Order ${brokerOrderId.slice(-6)} ${status}: ${(pollRes.data as any)?.data?.rejectreason ?? ""}`,
                      { duration: 6000 },
                    );
                  break;
                }
                } catch {
                  break;
                }
            }
          })();
        }
      }

      const response = await tradeTrackingService.startTradeSession({
        symbol: result.symbol,
        action,
          confidence:
            result.geminiForecast?.action_signal?.confidence ||
            result.confidence ||
            0,
          riskGrade: result.geminiForecast?.risk_grade || "MEDIUM",
        referenceEntryPrice: result.currentPrice,
        entryPrice,
        shares: shares || 1,
        investmentAmount: parseFloat(investment),
        leverage: userProfile.leverage,
        marginType: userProfile.marginType,
          exchange: "NSE",
        product,
        brokerOrderId,
        strategyType: strategyCode,
        stopLossPercentage: sp.stopLossPercentage,
        targetProfitPercentage: sp.targetProfitPercentage,
        holdingPeriod: effectiveHoldingPeriod,
        aiRecommendedHoldPeriod: aiRecommendedPeriod ?? sp.defaultHoldPeriod,
        expectedRoiBest: result.geminiForecast?.expected_roi?.best_case,
        expectedRoiLikely: result.geminiForecast?.expected_roi?.likely_case,
        expectedRoiWorst: result.geminiForecast?.expected_roi?.worst_case,
      });
      if (response.error) {
          toast.error("Tracking failed: " + response.error, {
            id: "trade-start",
          });
      } else {
        const label = isPaperTrade
          ? `Paper ${action} trade started — tracking live`
          : `${action} order placed. Tracking live!`;
          toast.success(label, { id: "trade-start" });

        // Build a local trade object for the immediate P&L card —
        // use response data if available, otherwise construct from known values
          const tradeId =
            (response.data as any)?.id ||
            (response.data as any)?.trade?.id ||
            brokerOrderId;
          const strategyLabel =
            STRATEGIES.find((s) => s.value === strategyCode)?.label ??
            strategyCode;
        setPlacedTrade({
            id: tradeId,
            symbol: result.symbol,
          action,
            status: "active",
          entryPrice,
            entryTime: new Date().toISOString(),
            shares: shares || 1,
          investmentAmount: parseFloat(investment),
            strategyType: strategyCode,
            stopLossPercentage: sp.stopLossPercentage,
          targetProfitPercentage: sp.targetProfitPercentage,
            currentPrice: result.currentPrice,
            currentPnl: 0,
          currentPnlPercentage: 0,
          brokerOrderId,
          product,
            confidence:
              result.geminiForecast?.action_signal?.confidence ||
              result.confidence ||
              0,
        } as ActiveTrade & { strategyLabel: string });
        setSellSharesInput(String(shares || 1));
      }
    } catch (e: any) {
        toast.error(e?.message || "Failed", { id: "trade-start" });
    }
    },
    [result, investment, userProfile, isPaperTrade],
  );

  // ── Intercept strategy confirm for live orders → show pre-order sheet ─────
  const handleStrategyConfirm = useCallback(
    (
    strategyCode: string,
    product: string,
    selectedAction: "BUY" | "SELL",
    sellPosition?: { entryPrice: number; shares: number },
  ) => {
    if (isPaperTrade || !result) {
        placeMockOrderAndTrack(
          strategyCode,
          product,
          selectedAction,
          sellPosition,
        );
      return;
    }
      pendingOrderRef.current = {
        strategy: strategyCode,
        product,
        action: selectedAction,
        sellPosition,
      };
    const sp = getStrategyParams(strategyCode);
    const price = result.currentPrice;
    const shares = result.isCrypto
      ? (result.positionSize?.shares ?? 0)
      : Math.floor(result.positionSize?.shares || 0) || 1;
    const isBuy = selectedAction === "BUY";
    setPreOrderData({
        symbol: result.symbol,
        action: selectedAction,
        quantity: shares || 1,
      price,
        exchange: "NSE",
      product,
        strategy:
          STRATEGIES.find((s) => s.value === strategyCode)?.label ??
          "ChartMate AI",
        stopLoss: parseFloat(
          (isBuy
            ? price * (1 - sp.stopLossPercentage / 100)
            : price * (1 + sp.stopLossPercentage / 100)
          ).toFixed(2),
        ),
        takeProfit: parseFloat(
          (isBuy
            ? price * (1 + sp.targetProfitPercentage / 100)
            : price * (1 - sp.targetProfitPercentage / 100)
          ).toFixed(2),
        ),
      investment: parseFloat(investment),
    });
    setShowPreOrderSheet(true);
    },
    [isPaperTrade, result, investment, placeMockOrderAndTrack],
  );

  // ── Poll placed trade for live P&L updates ───────────────────────────────────
  useEffect(() => {
    if (!placedTrade?.id || placedTrade.id === placedTrade.brokerOrderId)
      return; // skip if only local (no DB id yet)
    const interval = setInterval(async () => {
      const { tradeTrackingService } =
        await import("@/services/tradeTrackingService");
      const { data } = await tradeTrackingService.getTrade(placedTrade.id);
      if (data) setPlacedTrade(data);
    }, 12000);
    return () => clearInterval(interval);
  }, [placedTrade?.id]);

  // Fetch market status when symbol is selected
  useEffect(() => {
    const fetchMarketStatus = async () => {
      if (!selectedSymbol) {
        setMarketStatus(null);
        setMarketClosed(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke(
          "get-market-status",
          {
          body: {
            symbol: selectedSymbol.full_symbol || selectedSymbol.symbol,
            exchange: selectedSymbol.exchange,
              type: selectedSymbol.type,
            },
          },
        );

        if (!error && data) {
          setMarketStatus(data);
          setMarketClosed(
            data.marketState === "CLOSED" ||
              data.marketState === "PRE" ||
              data.marketState === "POST",
          );
        }
      } catch (err) {
        console.error("Failed to fetch market status:", err);
      }
    };

    fetchMarketStatus();
  }, [selectedSymbol]);

  const applyPreset = (preset: PredictionPreset, keepSymbol = false) => {
    const presetCurrency = (
      preset.profile as { displayCurrency?: "INR" | "USD" }
    )?.displayCurrency;
    // When keepSymbol is true, the user just set symbol + amount + currency on step 1;
    // do not overwrite their currency with an older preset (common INR default).
    if (presetCurrency && !keepSymbol) setDisplayCurrency(presetCurrency);

    if (!keepSymbol) {
      setSymbol("");
      setInvestment("");
      setSelectedSymbol(null);
      if (preset.investment != null) setInvestment(String(preset.investment));
    } else {
      if (preset.investment != null) setInvestment(String(preset.investment));
    }
    setTimeframe(preset.timeframe || "1h");
    setCustomTimeframe(preset.custom_timeframe || "");
    if (preset.profile) {
      setUserProfile((prev) => ({
        ...prev,
        ...preset.profile,
        riskAcceptance: false,
      }));
    } else {
      setUserProfile((prev) => ({ ...prev, riskAcceptance: false }));
    }
  };

  const resetPredictionForm = (clearAll: boolean = true) => {
    setCurrentStep("choose-asset");
    setCompletedSteps([]);
    setResult(null);
    setSelectedSymbol(null);
    setMarketStatus(null);
    setPredictedAt(null);

    if (clearAll) {
      setSymbol("");
      setInvestment("");
      setTimeframe("1h");
      setCustomTimeframe("");
    }
  };

  const loadLatestPreset = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from("user_prediction_presets" as any)
        .select("symbol, timeframe, custom_timeframe, investment, profile")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error loading user preset:", error);
        return;
      }

      if (data) {
        setLatestPreset(data as unknown as PredictionPreset);
        // Dialog is shown only after user fills symbol and clicks Continue (see handleNextStep)
      }
    } catch (error) {
      console.error("Failed to load latest preset:", error);
    } finally {
      setPresetChecked(true);
    }
  };

  const saveLatestPreset = async () => {
    if (!user?.id) return;
    try {
      const payload = {
        user_id: user.id,
        symbol: symbol || null,
        timeframe: timeframe || null,
        custom_timeframe:
          timeframe === "custom" ? customTimeframe || null : null,
        investment: investment ? parseFloat(investment) : null,
        profile: { ...userProfile, displayCurrency },
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("user_prediction_presets" as any)
        .upsert(payload, { onConflict: "user_id" });

      if (error) {
        console.error("Error saving user preset:", error);
      } else {
        setLatestPreset({
          symbol: payload.symbol,
          timeframe: payload.timeframe,
          custom_timeframe: payload.custom_timeframe,
          investment: payload.investment,
          profile: payload.profile as PredictionPreset["profile"],
        });
      }
    } catch (error) {
      console.error("Failed to save latest preset:", error);
    }
  };

  const startNewPredictionFlow = () => {
    resetPredictionForm(false);
    setSymbol("");
    setInvestment("");
    setSelectedSymbol(null);
    setUserProfile((prev) => ({ ...prev, riskAcceptance: false }));
    resetPredictionForm(true);
    setPresetPromptShown(false);
    // Preset dialog is shown when user completes asset + investment and continues
  };

  // Leaving a saved analysis (e.g. sidebar "New Analysis" → /predict) clears `saved` but
  // React keeps component state — reset to a fresh flow.
  useEffect(() => {
    if (savedPredictionId) {
      prevSavedPredictionIdRef.current = savedPredictionId;
      return;
    }
    const hadSaved = prevSavedPredictionIdRef.current != null;
    prevSavedPredictionIdRef.current = null;
    if (!hadSaved) return;
    startNewPredictionFlow();
    setLoadedPostOutcome(null);
    setPlacedTrade(null);
    setChartAnalysis(null);
    setChartDataSource(null);
    setShowAdvancedLoader(false);
    setLoading(false);
    setAnalysisReady(false);
    setMarketClosed(false);
    setMarketTimeZone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to `saved` query; same as startNewPredictionFlow
  }, [savedPredictionId]);

  useEffect(() => {
    if (!user?.id || presetChecked) return;
    loadLatestPreset();
  }, [user?.id, presetChecked]);

  // Scroll to top whenever currentStep changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  const steps = [
    {
      id: "choose-asset",
      title: "Asset & investment",
      description: "Symbol, timeframe & amount",
    },
    {
      id: "trading-profile",
      title: "Trading Profile",
      description: "Risk & preferences",
    },
    { id: "review", title: "Review & Start", description: "Confirm details" },
    { id: "analysis", title: "Live Analysis", description: "AI processing" },
    { id: "results", title: "Results", description: "View analysis" },
  ];

  // Auto-save prediction to database
  const savePrediction = async (predictionData: PredictionResult) => {
    try {
      if (!user?.id) return;

      const { error } = await supabase.from("predictions" as any).insert({
          user_id: user.id,
          symbol: predictionData.symbol,
          timeframe,
          investment: parseFloat(investment),
          current_price: predictionData.currentPrice,
          recommendation: predictionData.recommendation || null,
          confidence: predictionData.confidence || null,
          expected_move_direction: predictionData.expectedMove?.direction || null,
          expected_move_percent: predictionData.expectedMove?.percent || null,
          price_target_min: predictionData.expectedMove?.priceTarget?.min || null,
          price_target_max: predictionData.expectedMove?.priceTarget?.max || null,
          rationale: predictionData.rationale || null,
          patterns: predictionData.patterns || null,
          key_levels: predictionData.keyLevels || null,
          risks: predictionData.risks || null,
          opportunities: predictionData.opportunities || null,
          raw_response: {
            ...predictionData,
            geminiForecast: predictionData.geminiForecast,
            savedUserProfile: userProfile,
            savedDisplayCurrency: displayCurrency,
          focusTimeframe:
            timeframe === "custom" && customTimeframe
              ? customTimeframe
              : timeframe,
          },
        });

      if (error) {
        console.error("Error saving prediction:", error);
      }
    } catch (error) {
      console.error("Error saving prediction:", error);
    }
  };

  const handleNextStep = () => {
    if (currentStep === "choose-asset") {
      const inv = parseFloat(investment || "0");
      if (!symbol || !investment || inv <= 0 || Number.isNaN(inv)) return;
      if (latestPreset && !presetPromptShown) {
        setShowPresetDialog(true);
        setPresetPromptShown(true);
        return;
      }
      setCompletedSteps((prev) => [...prev, "choose-asset"]);
      setCurrentStep("trading-profile");
    } else if (currentStep === "trading-profile") {
      setCompletedSteps((prev) => [...prev, "trading-profile"]);
      setCurrentStep("review");
    } else if (currentStep === "review") {
      setCompletedSteps((prev) => [...prev, "review"]);
      setCurrentStep("analysis");
      handlePredict();
    }
  };

  const handlePrevStep = () => {
    const stepOrder = [
      "choose-asset",
      "trading-profile",
      "review",
      "analysis",
      "results",
    ];
    const idx = stepOrder.indexOf(currentStep);
    if (idx <= 0) return;
    const prevStep = stepOrder[idx - 1];
    // Remove current step from completedSteps so stepper reflects going back
    setCompletedSteps((prev) =>
      prev.filter((s) => s !== currentStep && s !== prevStep),
    );
    setCurrentStep(prevStep);
  };

  // Convert timeframe to minutes for API
  const getTimeframeMinutes = (tf: string): number => {
    const match = tf.match(/^(\d+)([mhd]|w)$/);
    if (!match) return 60; // Default 1h
    const [, value, unit] = match;
    const num = parseInt(value);
    switch (unit) {
      case "m":
        return num;
      case "h":
        return num * 60;
      case "d":
        return num * 1440;
      case "w":
        return num * 10080;
      default:
        return 60;
    }
  };

  const handlePredict = async () => {
    if (!symbol || !investment) {
      toast.error("Please fill in all fields");
      return;
    }

    // Validate and get effective timeframe
    const effectiveTimeframe =
      timeframe === "custom" && customTimeframe ? customTimeframe : timeframe;
    if (timeframe === "custom" && !customTimeframe) {
      toast.error("Please enter a custom timeframe");
      return;
    }

    setLoading(true);
    setShowAdvancedLoader(true);
    setAnalysisReady(false);
    setResult(null);

    try {
      const primaryHorizon = getTimeframeMinutes(effectiveTimeframe);
      const { data, error } = await supabase.functions.invoke(
        "predict-movement",
        {
        body: {
            symbol: symbol.split(":")[1] || symbol,
          investment: parseFloat(investment),
          timeframe: effectiveTimeframe,
            focusTimeframe: effectiveTimeframe,
            horizons: [primaryHorizon, 240, 1440, 10080],
            ...userProfile,
          },
        },
      );

      if (error) {
        console.error("Analysis error:", error);
        setShowAdvancedLoader(false);
        toast.error("Failed to get analysis. Please try again.");
        return;
      }

      setResult(data);
      setLoadedPostOutcome(null);
      setAnalysisReady(true);
      setPredictedAt(new Date()); // Capture stable timestamp

      // Fetch market status for the symbol
      await fetchMarketStatus(
        symbol.split(":")[1] || symbol,
        selectedSymbol?.exchange,
        selectedSymbol?.type,
      );

      // Auto-save the prediction
      await savePrediction(data);
      await saveLatestPreset();
      // Loader will complete when it's ready
    } catch (error) {
      console.error("Error:", error);
      setShowAdvancedLoader(false);
      setAnalysisReady(false);
      toast.error("An error occurred while getting the analysis");
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketStatus = async (
    symbol: string,
    exchange?: string,
    type?: string,
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-market-status",
        {
          body: { symbol, exchange, type },
        },
      );
      if (!error && data) {
        setMarketStatus(data);
        setMarketTimeZone(data.exchangeTimezoneName);
      }
    } catch (error) {
      console.error("Failed to fetch market status:", error);
    }
  };

  const handleLoaderComplete = () => {
    setShowAdvancedLoader(false);
    setCompletedSteps((prev) => [...prev, "analysis"]);
    setCurrentStep("results");
    toast.success("Analysis generated successfully!");
  };

  const chartSymbol = selectedSymbol?.full_symbol || symbol || "BTC-USD";
  const chartDisplayName =
    selectedSymbol?.description || selectedSymbol?.symbol || symbol;

  function LiveChartBlock({
    cardClassName,
    wrapperClassName,
    title = "Live Market Chart",
    showAnalysis = true,
  }: {
    cardClassName: string;
    wrapperClassName?: string;
    title?: string;
    showAnalysis?: boolean;
  }) {
  return (
      <div className="min-w-0 w-full lg:self-stretch lg:min-h-0">
        <div className={cn("min-w-0 space-y-4", wrapperClassName)}>
          <Card
            className={cn(
              "glass-panel overflow-hidden border-white/5 bg-gradient-to-b from-card/80 to-background/90 shadow-2xl flex flex-col w-full",
              cardClassName,
            )}
          >
            <CardHeader className="pb-3 border-b border-white/5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base sm:text-lg text-white">
                  {title}
                </CardTitle>
                {symbol ? (
                  <Badge
                    variant="outline"
                    className="text-xs border-white/10 shrink-0"
                  >
                    {symbol}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-[10rem] relative min-w-0">
              <div className="absolute inset-0">
                <YahooChartPanel
                  symbol={chartSymbol}
                  displayName={chartDisplayName}
                />
              </div>
            </CardContent>
          </Card>
          {showAnalysis && chartAnalysis ? (
            <Card className="glass-panel w-full">
              <CardHeader className={isMobile ? "pb-2" : ""}>
                <CardTitle
                  className={cn(
                    isMobile ? "text-base" : "text-lg",
                    "text-white",
                  )}
                >
                  Chart Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className={isMobile ? "pt-2" : ""}>
                <div className="space-y-3">
                  <p className="leading-relaxed text-sm text-muted-foreground">
                    {chartAnalysis}
                  </p>
                  {chartDataSource ? (
                    <p className="text-xs text-muted-foreground/60">
                      Data source: {chartDataSource}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <DashboardShellLayout>
        <div className="bg-background text-foreground">
      {/* Analysis Loader — rendered at root level so fixed overlay works correctly */}
      {showAdvancedLoader && (
        <AdvancedPredictLoader
          onComplete={handleLoaderComplete}
          ready={analysisReady}
          symbol={symbol}
          isVisible={showAdvancedLoader}
          timeframe={timeframe}
        />
      )}

      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent className="mx-auto">
          <DialogHeader>
            <DialogTitle>Use previous analysis details?</DialogTitle>
          </DialogHeader>

          <DialogFooter className="!pt-5">
            <Button
              variant="outline"
              onClick={() => {
                setShowPresetDialog(false);
                // User wants fresh settings; continue to Trading Profile with current symbol + amount
                    setCompletedSteps((prev) => [...prev, "choose-asset"]);
                setCurrentStep("trading-profile");
              }}
            >
              Use New
            </Button>
            <Button
              onClick={() => {
                if (latestPreset) {
                  applyPreset(latestPreset, true);
                      setCompletedSteps((prev) => [...prev, "choose-asset"]);
                  setCurrentStep("trading-profile");
                  setShowPresetDialog(false);
                  setTimeout(() => {
                        document
                          .getElementById("risk-acknowledge-block")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          });
                  }, 300);
                } else {
                  setShowPresetDialog(false);
                }
              }}
            >
              Use Prefilled Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl z-50">
        <Container className="py-3 sm:py-4">
              <div className="text-center space-y-2 pt-10 lg:pt-0 max-lg:hidden">
                <h1
                  className={`${isMobile ? "text-2xl" : "text-3xl md:text-4xl"} font-bold text-gradient`}
                >
              Probability-Based Analysis Software
            </h1>
                <p
                  className={`text-muted-foreground ${isMobile ? "text-sm" : ""}`}
                >
                  Get real-time AI-powered probability-based analysis for any
                  stock, forex, or crypto
            </p>
            {user?.email && (
              <p className="text-xs text-muted-foreground">
                Welcome back, {user.email}
              </p>
            )}
          </div>

          {/* Progress Stepper */}
              <div className={`${isMobile ? "mt-4" : "mt-8"}`}>
            <Stepper
              steps={steps}
              currentStep={currentStep}
              completedSteps={completedSteps}
                  className={isMobile ? "mobile-stepper" : ""}
            />
          </div>
        </Container>
      </div>

      {/* Main Content */}
      <Container className="py-4 sm:py-8">
            {/* Step 1 — asset, timeframe & investment + tall chart */}
            {currentStep === "choose-asset" && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,55%)] gap-4 sm:gap-6 lg:gap-8 items-start">
                <div className="min-w-0">
              <StepContainer
                    title="Asset & investment"
                    description="Pick what to analyze, choose a timeframe, and enter the amount for position sizing"
                isActive={true}
                    className="max-w-2xl w-full"
              >
                    <div className="space-y-6">
                <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Market
                        </p>
                  <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Label
                              htmlFor="symbol"
                              className="text-sm font-medium"
                            >
                      Symbol
                    </Label>
                            <CardInfoTooltip
                              text={HELP.predictSymbol}
                              className="text-muted-foreground"
                              side="top"
                            />
                          </div>
                    <SymbolSearch
                      value={symbol}
                      onValueChange={setSymbol}
                      onSelectSymbol={setSelectedSymbol}
                            placeholder={
                              isMobile
                                ? "Search symbols..."
                                : "Search stocks, crypto, forex... (e.g., AAPL, BTC-USD)"
                            }
                    />
                  </div>

                  {symbol && (
                      <div className="p-4 bg-muted/30 rounded-lg border">
                        <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                              <span className="font-medium">
                                Selected: {selectedSymbol?.symbol || symbol}
                              </span>
                        </div>
                      </div>
                        )}

                      <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Label
                              htmlFor="timeframe"
                              className="text-sm font-medium"
                            >
                              Analysis timeframe
                        </Label>
                            <CardInfoTooltip
                              text={HELP.predictTimeframe}
                              className="text-muted-foreground"
                              side="top"
                            />
                          </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                            {["15m", "30m", "1h", "4h", "1d", "1w"].map(
                              (tf) => (
                            <Button
                              key={tf}
                                  variant={
                                    timeframe === tf ? "default" : "outline"
                                  }
                              size="sm"
                              onClick={() => {
                                setTimeframe(tf);
                                    setCustomTimeframe("");
                              }}
                              className="w-full"
                            >
                              {tf}
                            </Button>
                              ),
                            )}
                          <Button
                              variant={
                                timeframe === "custom" ? "default" : "outline"
                              }
                            size="sm"
                              onClick={() => setTimeframe("custom")}
                            className="w-full"
                          >
                            Custom
                          </Button>
                        </div>
                          {timeframe === "custom" && (
                          <div className="mt-2">
                            <Input
                              id="customTimeframe"
                              type="text"
                              placeholder="e.g., 2h, 3d, 2w"
                              value={customTimeframe}
                                onChange={(e) =>
                                  setCustomTimeframe(e.target.value)
                                }
                              className="w-full"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              Format: 15m, 30m, 1h, 2h, 4h, 1d, 2d, 1w, etc.
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                            {timeframe === "15m" &&
                              "⚡ Ultra short-term: AI will analyze next 15 minutes"}
                            {timeframe === "30m" &&
                              "⏰ Very short-term: AI will analyze next 30 minutes"}
                            {timeframe === "1h" &&
                              "🕐 Short-term: AI will analyze next 1 hour (recommended)"}
                            {timeframe === "4h" &&
                              "🕓 Medium-term: AI will analyze next 4 hours"}
                            {timeframe === "1d" &&
                              "📅 Daily: AI will analyze today's movement"}
                            {timeframe === "1w" &&
                              "📆 Weekly: AI will analyze this week's movement"}
                            {timeframe === "custom" &&
                              "✏️ Custom timeframe: Enter your desired analysis window"}
                        </p>
                      </div>

                      {selectedSymbol && (
                        <MarketStatus
                          symbol={selectedSymbol.full_symbol}
                          displaySymbol={selectedSymbol.symbol}
                          exchange={selectedSymbol.exchange}
                          type={selectedSymbol.type}
                        />
                      )}
                    </div>

                      <div className="border-t border-border pt-6 space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Position size
                        </p>
                  <div className="flex items-center justify-between gap-2">
                          <Label className="text-sm text-muted-foreground">
                            Show amounts in
                          </Label>
                    <div className="flex rounded-full border p-0.5 bg-muted/60">
                      <button
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm ${displayCurrency === "INR" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setDisplayCurrency("INR")}
                      >
                        INR
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1 rounded-full text-sm ${displayCurrency === "USD" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setDisplayCurrency("USD")}
                      >
                        USD
                      </button>
                    </div>
                  </div>
                  <div>
                          <div className="flex items-center gap-1.5 mb-2">
                            <Label
                              htmlFor="investment"
                              className="text-sm font-medium"
                            >
                              Investment amount ({displayCurrency})
                    </Label>
                            <CardInfoTooltip
                              text={HELP.predictInvestment}
                              className="text-muted-foreground"
                              side="top"
                            />
                          </div>
                    <div className="relative">
                      <span className="absolute left-3 top-3 h-4 w-4 flex items-center justify-center text-muted-foreground font-medium">
                        {displayCurrency === "INR" ? "₹" : "$"}
                      </span>
                      <Input
                        id="investment"
                        type="number"
                        placeholder="1000"
                        value={investment}
                        onChange={(e) => setInvestment(e.target.value)}
                        className="pl-10"
                        min="1"
                        step="0.01"
                      />
                    </div>
                  </div>

                        {investment && parseFloat(investment) > 0 && (
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                              <span className="font-medium">
                                Investment:{" "}
                                {formatCurrency(
                                  parseFloat(investment),
                                  0,
                                  false,
                                  displayCurrency,
                                )}
                              </span>
                      </div>
                    </div>
                  )}
                      </div>

                    <Button
                      onClick={handleNextStep}
                        disabled={
                          !symbol ||
                          !investment ||
                          parseFloat(investment) <= 0 ||
                          Number.isNaN(parseFloat(investment))
                        }
                        className="w-full"
                      size="lg"
                    >
                        Continue to trading profile
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
              </StepContainer>
                </div>
                <LiveChartBlock
                  cardClassName="h-[min(17rem,48vh)] sm:h-[21rem] lg:min-h-[32rem] lg:h-[min(28rem,70vh)] xl:min-h-[28rem]"
                  wrapperClassName="w-full lg:sticky lg:top-4"
                />
              </div>
            )}

            {/* Step 2 — full-width chart below the form */}
            {currentStep === "trading-profile" && (
              <div className="flex flex-col-reverse gap-4 sm:gap-6 lg:gap-8 items-start">
                <div className="min-w-0 w-full">
              <StepContainer
                title="Your Trading Profile"
                description="Tell us about your trading style and risk preferences for personalized AI analysis"
                isActive={true}
              >
                <div className="space-y-6">
                  <UserProfileForm
                    profile={userProfile}
                    onChange={setUserProfile}
                    investmentAmount={parseFloat(investment || "0")}
                    marketClosed={marketClosed}
                        marketOpenTime={
                          marketStatus?.nextRegularOpen
                            ? new Date(
                                marketStatus.nextRegularOpen,
                              ).toLocaleString()
                            : undefined
                        }
                  />

                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <BrainCircuit className="h-5 w-5" />
                      AI Personalization
                    </h4>
                    <p className="text-sm text-muted-foreground">
                          AI will use your trading profile to provide tailored
                          probability-based analysis, risk assessments, and
                          recommendations that match your strategy and goals.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          variant="outline"
                          onClick={handlePrevStep}
                          className="w-full sm:w-auto sm:flex-shrink-0"
                        >
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      className="w-full sm:flex-1"
                      size="lg"
                    >
                      Continue to Review
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </StepContainer>
                </div>
                <LiveChartBlock
                  cardClassName="h-[min(17rem,48vh)] sm:h-[21rem] lg:h-[28rem]"
                  wrapperClassName="w-full lg:sticky lg:top-4"
                />
              </div>
            )}

            {/* Step 3 — medium chart on the right */}
            {currentStep === "review" && (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,36%)] gap-4 sm:gap-6 lg:gap-8 items-start">
                <div className="min-w-0">
              <StepContainer
                title="Review & Start Analysis"
                description="Confirm your analysis parameters before starting the AI analysis"
                isActive={true}
              >
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/30 rounded-lg border">
                      <p className="text-sm text-muted-foreground">Asset</p>
                          <p className="text-lg font-semibold">
                            {selectedSymbol?.symbol || symbol}
                          </p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg border">
                          <p className="text-sm text-muted-foreground">
                            Investment
                          </p>
                          <p className="text-lg font-semibold">
                            {formatCurrency(
                              parseFloat(investment || "0"),
                              0,
                              false,
                              displayCurrency,
                            )}
                          </p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg border">
                        <h4 className="font-medium mb-3">
                          Trading Profile Summary
                        </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                            <span className="text-muted-foreground">
                              Risk Tolerance:
                            </span>
                            <span className="ml-2 font-medium capitalize">
                              {userProfile.riskTolerance}
                            </span>
                      </div>
                      <div>
                            <span className="text-muted-foreground">
                              Trading Style:
                            </span>
                            <span className="ml-2 font-medium capitalize">
                              {userProfile.tradingStyle?.replace(/_/g, " ")}
                            </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Goal:</span>
                            <span className="ml-2 font-medium capitalize">
                              {userProfile.investmentGoal}
                            </span>
                      </div>
                      <div>
                            <span className="text-muted-foreground">
                              Account Type:
                            </span>
                            <span className="ml-2 font-medium capitalize">
                              {userProfile.marginType}
                            </span>
                      </div>
                      <div>
                            <span className="text-muted-foreground">
                              Stop Loss:
                            </span>
                            <span className="ml-2 font-medium">
                              {userProfile.stopLossPercentage}%
                            </span>
                      </div>
                      <div>
                            <span className="text-muted-foreground">
                              Target Profit:
                            </span>
                            <span className="ml-2 font-medium">
                              {userProfile.targetProfitPercentage}%
                            </span>
                      </div>
                          {userProfile.marginType !== "cash" && (
                        <div>
                              <span className="text-muted-foreground">
                                Leverage:
                              </span>
                              <span className="ml-2 font-medium text-orange-500">
                                {userProfile.leverage}x
                              </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedSymbol && (
                    <MarketStatus
                      symbol={selectedSymbol.full_symbol}
                      displaySymbol={selectedSymbol.symbol}
                      exchange={selectedSymbol.exchange}
                      type={selectedSymbol.type}
                    />
                  )}

                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <BrainCircuit className="h-5 w-5" />
                      AI Analysis
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                          <li>
                            • Multi-horizon forecasts personalized to your
                            profile
                          </li>
                          <li>
                            • Deep AI reasoning with advanced market analysis
                          </li>
                          <li>
                            • Risk-adjusted recommendations based on your
                            tolerance
                          </li>
                          <li>
                            • Support & resistance levels with confidence scores
                          </li>
                          <li>
                            • Tailored entry/exit strategies for your trading
                            style
                          </li>
                    </ul>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          variant="outline"
                          onClick={handlePrevStep}
                          disabled={loading}
                          className="w-full sm:w-auto sm:flex-shrink-0"
                        >
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                    <Button
                      onClick={handleNextStep}
                      disabled={loading}
                      className="w-full sm:flex-1"
                      size="lg"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Starting Analysis...
                        </>
                      ) : (
                        <>
                          Start AI Analysis
                          <BrainCircuit className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </StepContainer>
                </div>
                <LiveChartBlock
                  cardClassName="h-[min(15rem,40vh)] sm:h-[18rem] lg:h-[25rem] xl:h-[28rem]"
                  wrapperClassName="w-full lg:sticky lg:top-4"
                />
              </div>
            )}

            {/* Step 4 — compact chart above status */}
            {currentStep === "analysis" && (
              <div className="flex flex-col gap-4">
                <LiveChartBlock
                  title="Price while analyzing"
                  cardClassName="h-[9.5rem] sm:h-[11.5rem] lg:h-[13rem]"
                  wrapperClassName="w-full max-w-4xl mx-auto"
                  showAnalysis={false}
                />
                <div className="min-w-0">
              <StepContainer
                title="Live AI Analysis"
                description="Our AI is analyzing market data and generating your probability-based analysis"
                isActive={true}
              >
                <div className="py-8 text-center text-muted-foreground text-sm">
                  Running AI analysis…
                </div>
              </StepContainer>
                </div>
              </div>
            )}

            {/* Step 5 — wide results + tall sticky chart on xl+ */}
            {currentStep === "results" && result && (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,30%)] gap-6 xl:gap-8 items-start">
                <div className="space-y-6 relative z-10 w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {/* Ambient glow effects behind results */}
                <div className="pointer-events-none absolute -inset-32 bg-primary/5 blur-[120px] -z-10 rounded-[100%]" />
                <div className="pointer-events-none absolute top-1/4 -right-32 w-96 h-96 bg-accent/5 blur-[120px] -z-10 rounded-[100%]" />

                {/* Probability Panel — most important, shown first */}
                {result.geminiForecast && (
                  <ProbabilityPanel
                    symbol={result.symbol}
                    currentPrice={result.currentPrice}
                    geminiForecast={result.geminiForecast}
                    volumeData={result.volumeData}
                    analysedAt={predictedAt}
                      displayCurrency={displayCurrency}
                      usdPerInr={usdPerInr}
                      selectedHorizon={
                        timeframe === "custom" && customTimeframe.trim()
                          ? customTimeframe.trim()
                          : timeframe
                      }
                    onRefresh={() => {
                      if (savedPredictionId) {
                          toast.info(
                            "Start a new analysis from Predict to refresh this dashboard.",
                          );
                        navigate("/predict");
                        return;
                      }
                      setCurrentStep("review");
                        setCompletedSteps((prev) =>
                          prev.filter(
                            (s) => s !== "analysis" && s !== "results",
                          ),
                        );
                    }}
                  />
                )}

                {/* AI Reasoning - Why this signal? */}
                {result.geminiForecast && (
                  <AIReasoningDisplay
                    symbol={result.symbol}
                      action={
                        result.geminiForecast.action_signal?.action || "HOLD"
                      }
                      confidence={
                        result.geminiForecast.action_signal?.confidence ||
                        result.confidence ||
                        50
                      }
                    technicalFactors={result.patterns}
                      keyDrivers={
                        result.geminiForecast.forecasts?.[0]?.key_drivers
                      }
                      riskFlags={
                        result.geminiForecast.forecasts?.[0]?.risk_flags
                      }
                    oneLineSummary={result.rationale}
                    deepAnalysis={result.geminiForecast.deep_analysis}
                    marketContext={result.geminiForecast.market_context}
                      positioningNotes={
                        result.geminiForecast.positioning_guidance?.notes
                      }
                      volumeProfile={
                        result.volumeData?.volumeProfile ?? undefined
                      }
                      analysedAt={predictedAt}
                  />
                )}

                {/* Entry/exit scanner moved to Trading Dashboard → Scanner tab */}

                {/* Decision Screen - Primary Call to Action */}
                {result.geminiForecast && (
                  <DecisionScreen
                    symbol={result.symbol}
                      currentPrice={convertQuoteToDisplayAmount(
                        result.currentPrice,
                        quoteInUsd,
                        displayCurrency,
                        usdPerInr,
                      )}
                    investment={parseFloat(investment)}
                      action={
                        result.geminiForecast.action_signal?.action || "HOLD"
                      }
                      confidence={
                        result.geminiForecast.action_signal?.confidence ||
                        result.confidence ||
                        50
                      }
                      riskLevel={result.geminiForecast.risk_grade || "MEDIUM"}
                    expectedROI={{
                        best:
                          result.geminiForecast.expected_roi?.best_case || 10,
                        likely:
                          result.geminiForecast.expected_roi?.likely_case || 5,
                        worst:
                          result.geminiForecast.expected_roi?.worst_case || -5,
                    }}
                    positionSize={{
                      shares: result.positionSize?.shares || 0,
                        costPerShare: convertQuoteToDisplayAmount(
                          result.positionSize?.costPerShare ||
                            result.currentPrice,
                          quoteInUsd,
                          displayCurrency,
                          usdPerInr,
                        ),
                        totalCost: convertQuoteToDisplayAmount(
                          result.positionSize?.totalCost || 0,
                          quoteInUsd,
                          displayCurrency,
                          usdPerInr,
                        ),
                      }}
                      recommendedHoldPeriod={
                        result.geminiForecast.positioning_guidance
                          ?.recommended_hold_period
                      }
                    stopLoss={userProfile.stopLossPercentage || 5}
                    takeProfit={userProfile.targetProfitPercentage || 15}
                    leverage={userProfile.leverage || 1}
                    currency={displayCurrency}
                      priceCurrency={effectivePriceCurrency}
                    isCrypto={result.isCrypto}
                  />
                )}

                {/* Key Price Levels - shown before Place Order */}
                {result.geminiForecast?.support_resistance && (
                  <Card className="glass-panel">
                    <CardHeader>
                        <CardTitle className="text-white">
                          Key Price Levels
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <KeyLevels
                          supportLevels={
                            result.geminiForecast.support_resistance.supports
                          }
                          resistanceLevels={
                            result.geminiForecast.support_resistance.resistances
                          }
                        currentPrice={result.currentPrice}
                          formatLevelPrice={(lvl) => formatPriceForUi(lvl, 2)}
                      />
                    </CardContent>
                  </Card>
                )}

                  

                      {/* Use previous strategy or choose new */}
                      {result && lastUsedStrategy && (
                        <UsePreviousOrNewStrategyDialog
                          open={showPreviousOrNewDialog}
                          onOpenChange={setShowPreviousOrNewDialog}
                          lastStrategyLabel={lastUsedStrategy.label}
                          symbol={result.symbol}
                      action={
                        result.geminiForecast?.action_signal?.action === "SELL"
                          ? "SELL"
                          : "BUY"
                      }
                          onUsePrevious={() => {
                            setShowStrategyDialog(true);
                          }}
                          onChooseNew={() => setShowStrategyDialog(true)}
                        />
                      )}

                      {/* Strategy selection (AI + market research) → place order */}
                      {result && (
                        <StrategySelectionDialog
                          open={showStrategyDialog}
                          onOpenChange={setShowStrategyDialog}
                      currentStrategy={
                        assignedStrategy ??
                        lastUsedStrategy?.strategyType ??
                        userProfile.tradingStrategy ??
                        "trend_following"
                      }
                          symbol={result.symbol}
                      action={
                        result.geminiForecast?.action_signal?.action === "SELL"
                          ? "SELL"
                          : "BUY"
                      }
                          investment={investment ? parseFloat(investment) : 10000}
                      timeframe={
                        timeframe === "custom"
                          ? customTimeframe || "1d"
                          : timeframe || "1d"
                      }
                    currentPrice={result.currentPrice}
                          isPaperTrade={isPaperTrade}
                          onConfirm={handleStrategyConfirm}
                        />
                      )}

                      <TradingIntegrationModal
                        open={showIntegrationModal}
                        onOpenChange={setShowIntegrationModal}
                        onSaved={async () => {
                          await refreshTradingIntegration();
                          setShowIntegrationModal(false);
                          setShowStrategyDialog(true);
                        }}
                        onSkip={() => setShowIntegrationModal(false)}
                        save={async (params) => saveTradingIntegration(params)}
                      />

                {/* Analytical Deep Dives - Grouped in Tabs to reduce scrolling */}
                {/* Secondary Analytics - Grouped into Tabs */}
                <div className="mt-8 animate-in fade-in delay-200 fill-mode-both duration-700">
                  <Tabs defaultValue="action-plan" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-8 bg-black/40 backdrop-blur-xl border border-white/10 p-1.5 rounded-full shadow-lg">
                      <TabsTrigger
                        value="action-plan"
                        className="rounded-full data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300"
                      >
                        Action Plan
                      </TabsTrigger>
                      <TabsTrigger
                        value="market-context"
                        className="rounded-full data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300"
                      >
                        Market Context
                      </TabsTrigger>
                      <TabsTrigger
                        value="deep-insights"
                        className="rounded-full data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all duration-300"
                      >
                        Deep Insights
                      </TabsTrigger>
                    </TabsList>

                    {/* TAB 1: Action Plan & Risk Mgmt */}
                      <TabsContent
                        value="action-plan"
                        className="space-y-6 mt-0"
                      >
                      {/* Capital Scenarios - Small vs Large investors */}
                      {result.geminiForecast?.expected_roi && (
                        <CapitalScenarios
                            currentPrice={convertQuoteToDisplayAmount(
                              result.currentPrice,
                              quoteInUsd,
                              displayCurrency,
                              usdPerInr,
                            )}
                          expectedROI={{
                              best:
                                result.geminiForecast.expected_roi.best_case ||
                                0.5,
                              likely:
                                result.geminiForecast.expected_roi
                                  .likely_case || 0.2,
                              worst:
                                result.geminiForecast.expected_roi.worst_case ||
                                -2.0,
                            }}
                            stopLossPercentage={
                              userProfile.stopLossPercentage || 5
                            }
                          leverage={userProfile.leverage}
                          allowFractionalShares={true}
                            currency={displayCurrency}
                        />
                      )}

                      {/* Leverage Simulator */}
                        {(userProfile.leverage && userProfile.leverage > 1) ||
                        userProfile.marginType !== "cash" ? (
                        <LeverageSimulator
                          investment={parseFloat(investment)}
                            expectedMove={
                              result.geminiForecast?.forecasts?.[0]
                                ?.expected_return_bp
                                ? result.geminiForecast.forecasts[0]
                                    .expected_return_bp / 100
                                : 5
                            }
                          currentLeverage={userProfile.leverage || 1}
                            currency={displayCurrency}
                        />
                      ) : null}

                      {/* Key Levels moved above Place Order */}
                    </TabsContent>

                    {/* TAB 2: Market Context & Forecasts */}
                      <TabsContent
                        value="market-context"
                        className="space-y-6 mt-0"
                      >
                      {/* Market Conditions Dashboard */}
                        <MarketConditionsDashboard symbol={result.symbol} />

                      {/* Multi-Horizon Forecasts */}
                      {result.geminiForecast?.forecasts && (
                        <Card className="glass-panel">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                            <CardTitle className="flex items-center gap-2 text-white">
                              <BarChart3 className="h-5 w-5" />
                              Multi-Horizon Forecasts
                            </CardTitle>
                              <CardInfoTooltip
                                text={HELP.multiHorizonTable}
                                className="text-zinc-400"
                              />
                          </CardHeader>
                          <CardContent>
                            <ForecastTable
                              forecasts={result.geminiForecast.forecasts}
                              predictedAt={predictedAt}
                              marketTimeZone={marketTimeZone}
                              marketStatus={marketStatus}
                            />
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    {/* TAB 3: Deep Insights & Timeline */}
                      <TabsContent
                        value="deep-insights"
                        className="space-y-6 mt-0"
                      >
                      <Card className="glass-panel">
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                            <CardTitle className="text-white">
                              AI Insights & Analysis
                            </CardTitle>
                            <CardInfoTooltip text={HELP.aiInsights} className="text-zinc-400" />
                        </CardHeader>
                        <CardContent>
                          <Insights
                              symbol={result.symbol}
                              keyDrivers={
                                result.geminiForecast?.forecasts?.[0]?.key_drivers
                              }
                              riskFlags={
                                result.geminiForecast?.forecasts?.[0]?.risk_flags
                              }
                            opportunities={result.opportunities}
                            rationale={result.rationale}
                            patterns={result.patterns}
                              technicalFactors={result.patterns}
                              deepAnalysis={result.geminiForecast?.deep_analysis}
                              action={result.geminiForecast?.action_signal?.action}
                              confidence={
                                result.geminiForecast?.action_signal?.confidence ??
                                result.confidence ??
                                0
                              }
                              positioningNotes={
                                result.geminiForecast?.positioning_guidance?.notes
                              }
                              volumeProfile={
                                result.volumeData?.volumeProfile ?? undefined
                              }
                          />
                        </CardContent>
                      </Card>

                      <NewsAnalysis
                        symbol={result.symbol}
                        predictedAt={predictedAt}
                      />

                      {result.meta?.pipeline && (
                        <Card className="glass-panel">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
                            <CardTitle className="text-white">Analysis Timeline</CardTitle>
                              <CardInfoTooltip
                                text={HELP.analysisTimelineCard}
                                className="text-zinc-400"
                              />
                          </CardHeader>
                          <CardContent>
                            <PredictionTimeline
                              pipeline={result.meta.pipeline}
                                forecasts={
                                  result.geminiForecast?.forecasts?.map((f) => ({
                                horizon: f.horizon,
                                direction: f.direction,
                                probabilities: f.probabilities,
                                expected_return_bp: f.expected_return_bp,
                                    confidence: f.confidence,
                                  })) || []
                                }
                              predictedAt={predictedAt || new Date()}
                              marketTimeZone={marketTimeZone}
                              marketStatus={marketStatus}
                            />
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Regulatory Disclaimer */}
                <RegulatoryDisclaimer />

                {/* Action Buttons */}
                <div className="flex flex-col gap-4">
                  {/* Back to review / re-run buttons */}
                  <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={handlePrevStep}
                        className="flex-shrink-0 border-white/10 hover:bg-white/5"
                      >
                      <ArrowLeft className="h-4 w-4 mr-1" /> Back to Review
                    </Button>
                    <Button
                      variant="outline"
                        onClick={() => {
                          setCurrentStep("review");
                          setCompletedSteps((prev) =>
                            prev.filter(
                              (s) => s !== "analysis" && s !== "results",
                            ),
                          );
                        }}
                      className="flex-1 border-white/10 hover:bg-white/5"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" /> Re-run Analysis
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={startNewPredictionFlow}
                      variant="outline"
                      className="border-white/10 hover:bg-white/5"
                    >
                      New Analysis
                    </Button>
                    <Button
                        onClick={() => navigate("/predictions")}
                      variant="outline"
                      className="border-white/10 hover:bg-white/5"
                    >
                      View All Analyses
                    </Button>
                  </div>

                  <Button
                      onClick={() => navigate("/active-trades")}
                    variant="secondary"
                    className="w-full"
                  >
                    View Active Trades
                  </Button>
                </div>
              </div>


              <div className="xl:sticky xl:top-4 flex flex-col gap-3">
                  {/* ── Trading mode CTA — OpenAlgo or Paper only ── */}
                  {!placedTrade && (
                    <Card className="glass-panel border border-primary/30 bg-gradient-to-br from-background/80 to-primary/5 shadow-xl">
                      <CardContent className="p-5 space-y-3">
                        {/* Header row */}
              <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-bold text-white">
                              Trade {result.symbol}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              AI signal:{" "}
                              <span
                                className={
                                  result.geminiForecast?.action_signal
                                    ?.action === "SELL"
                                    ? "text-red-400 font-semibold"
                                    : "text-green-400 font-semibold"
                                }
                              >
                                {result.geminiForecast?.action_signal?.action ??
                                  "HOLD"}
                              </span>
                              {" · "}Confidence:{" "}
                              <span className="font-semibold">
                                {result.geminiForecast?.action_signal
                                  ?.confidence ??
                                  result.confidence ??
                                  0}
                                %
                              </span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              Current price
                            </p>
                            <p className="text-lg font-bold text-white">
                              {formatPriceForUi(result.currentPrice)}
                            </p>
                          </div>
                        </div>

                        {/* Subscription status for OpenAlgo users */}
                        {hasAlgoAccess && (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="bg-teal-500/20 text-teal-300 border border-teal-500/40">
                                Subscription Active
                              </Badge>
                              {isInGracePeriod && (
                                <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  Grace Period (24h after expiry)
                  </Badge>
                )}
              </div>

                            {isExpiringSoon && (
                              <Alert className="bg-amber-500/10 border-amber-500/40 text-amber-300 py-2.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <AlertDescription className="text-xs">
                                  Your subscription expires in{" "}
                                  {Math.max(daysUntilExpiry ?? 0, 0)} day(s).
                                  Renew to avoid OpenAlgo interruption.
                                </AlertDescription>
                              </Alert>
                            )}

                            {isAutoRenewDisabled && (
                              <Alert className="bg-red-500/10 border-red-500/40 text-red-300 py-2.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <AlertDescription className="text-xs">
                                  Auto-renew is OFF. OpenAlgo access disables 24
                                  hours after expiry unless you renew.
                                </AlertDescription>
                              </Alert>
                            )}
              </div>
                        )}

                        {/* Two main buttons */}
                        <div className="grid grid-cols-1 gap-2">
                          <Button
                            disabled={checkingOnboarding}
                            onClick={async () => {
                              if (!hasAlgoAccess) {
                                setShowPremiumDialog(true);
                                return;
                              }
                              // Check algo_onboarding provisioning status
                              setCheckingOnboarding(true);
                              const { data: onboarding } = await (
                                supabase as any
                              )
                                .from("algo_onboarding")
                                .select("status")
                                .eq("user_id", user?.id)
                                .maybeSingle();
                              setCheckingOnboarding(false);

                              if (!onboarding) {
                                navigate("/algo-setup");
                                return;
                              }
                              if (onboarding.status === "pending") {
                                toast.info(
                                  "Your algo trading account is being set up. Our team will activate it within 24 hours.",
                                  { duration: 5000 },
                                );
                                return;
                              }
                              navigate("/algo-setup");
                            }}
                            className="py-5 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 w-full"
                          >
                            {checkingOnboarding ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Timer className="mr-2 h-4 w-4" />
                            )}
                            OpenAlgo Dashboard
                          </Button>
                          <Button
                            variant="outline"
                            onClick={async () => {
                              setIsPaperTrade(true);
                              setAssignedStrategy(null);
                              const { tradeTrackingService } =
                                await import("@/services/tradeTrackingService");
                              const last =
                                await tradeTrackingService.getLastUsedStrategy();
                              if (last) {
                                const label =
                                  STRATEGIES.find(
                                    (s) => s.value === last.strategyType,
                                  )?.label ?? last.strategyType;
                                setLastUsedStrategy({ ...last, label });
                                setShowPreviousOrNewDialog(true);
                              } else {
                                setShowStrategyDialog(true);
                              }
                            }}
                            className="py-5 border-2 border-violet-500/50 text-violet-300 hover:bg-violet-500/10 hover:border-violet-500 w-full"
                          >
                            <FlaskConical className="mr-2 h-4 w-4" />
                            Paper Trade
                          </Button>
                        </div>

                        <p className="text-[11px] text-center text-muted-foreground/70">
                          <strong className="text-muted-foreground">
                            Paper Trade
                          </strong>{" "}
                          is free & simulated — no real money.{" "}
                          <strong className="text-muted-foreground">
                            OpenAlgo Dashboard
                          </strong>{" "}
                          requires a premium plan.
                        </p>
            </CardContent>
          </Card>
                  )}

                  {/* ── Live P&L card — appears after order is placed ── */}
                  {placedTrade &&
                    (() => {
                      const isShort = placedTrade.action === "SELL";
                      const livePrice =
                        placedTrade.currentPrice ?? placedTrade.entryPrice;
                      const pnl = isShort
                        ? (placedTrade.entryPrice - livePrice) *
                          placedTrade.shares
                        : (livePrice - placedTrade.entryPrice) *
                          placedTrade.shares;
                      const pnlPct =
                        placedTrade.investmentAmount > 0
                          ? (pnl / placedTrade.investmentAmount) * 100
                          : 0;
                      const isNeutral =
                        Math.abs(pnl) < 0.005 && Math.abs(pnlPct) < 0.005;
                      const isProfit = !isNeutral && pnl > 0;
                      const pnlPrefix = isNeutral ? "" : isProfit ? "+" : "";
                      const pnlTone = isNeutral
                        ? "text-slate-400"
                        : isProfit
                          ? "text-green-400"
                          : "text-red-400";
                      const pnlToneSoft = isNeutral
                        ? "text-slate-500"
                        : isProfit
                          ? "text-green-500"
                          : "text-red-500";
                      const pnlBoxTone = isNeutral
                        ? "bg-slate-500/10 border-slate-500/30"
                        : isProfit
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-red-500/10 border-red-500/30";
                      const strategyLabel =
                        STRATEGIES.find(
                          (s) => s.value === placedTrade.strategyType,
                        )?.label ??
                        placedTrade.strategyType ??
                        "Strategy";
                      const isPaper = (
                        placedTrade.brokerOrderId ?? ""
                      ).startsWith("PAPER-");

                      return (
                        <Card
                          className={`border-2 ${isNeutral ? "border-slate-500/40 bg-slate-500/5" : isProfit ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5"} shadow-xl`}
                        >
                          <CardContent className="p-4 space-y-3">
                            {/* Header */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                className={
                                  isShort ? "bg-red-600" : "bg-green-600"
                                }
                              >
                                {isShort ? (
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                ) : (
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                )}
                                {placedTrade.action} {placedTrade.symbol}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {strategyLabel}
                              </Badge>
                              {isPaper && (
                                <Badge className="bg-violet-500/20 text-violet-300 border border-violet-500/40 text-[10px]">
                                  🧪 Paper
                                </Badge>
                              )}
                              <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                                <Repeat2 className="h-3 w-3" />
                                <span>Auto-exit on strategy achievement</span>
                              </div>
                            </div>

                            {/* Price row */}
                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                              <div className="rounded bg-background/60 border p-2">
                                <p className="text-muted-foreground">
                                  Entry price
                                </p>
                                <p className="font-bold text-sm text-white">
                                  {formatPriceForUi(placedTrade.entryPrice)}
                                </p>
                              </div>
                              <div className="rounded bg-background/60 border p-2">
                                <p className="text-muted-foreground">
                                  Live price
                                </p>
                                <p className="font-bold text-sm text-white">
                                  {formatPriceForUi(livePrice)}
                                </p>
                              </div>
                              <div
                                className={`rounded border p-2 ${pnlBoxTone}`}
                              >
                                <p className="text-muted-foreground">P&amp;L</p>
                                <p className={`font-bold text-sm ${pnlTone}`}>
                                  {!isNeutral && isProfit ? "+" : ""}
                                  {formatCurrency(
                                    convertQuoteToDisplayAmount(
                                      isNeutral ? 0 : Math.abs(pnl),
                                      quoteInUsd,
                                      displayCurrency,
                                      usdPerInr,
                                    ),
                                    2,
                                    false,
                                    effectivePriceCurrency,
                                  )}
                                </p>
                                <p className={`text-[10px] ${pnlToneSoft}`}>
                                  {pnlPrefix}
                                  {(isNeutral ? 0 : pnlPct).toFixed(2)}%
                                </p>
                              </div>
                            </div>

                            {/* Shares & investment */}
                            <div className="flex gap-4 text-xs text-muted-foreground">
                              <span>
                                Shares held:{" "}
                                <strong className="text-white">
                                  {placedTrade.shares}
                                </strong>
                              </span>
                              <span>
                                Invested:{" "}
                                <strong className="text-white">
                                  {formatCurrency(
                                    placedTrade.investmentAmount,
                                    0,
                                    false,
                                    displayCurrency,
                                  )}
                                </strong>
                              </span>
                              {placedTrade.stopLossPercentage && (
                                <span>
                                  SL:{" "}
                                  <strong className="text-red-400">
                                    {placedTrade.stopLossPercentage}%
                                  </strong>
                                </span>
                              )}
                              {placedTrade.targetProfitPercentage && (
                                <span>
                                  TP:{" "}
                                  <strong className="text-green-400">
                                    {placedTrade.targetProfitPercentage}%
                                  </strong>
                                </span>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="grid grid-cols-1 gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 border-green-500/50 text-green-400 hover:bg-green-500/10"
                                onClick={() => {
                                  setBuyMoreAmount("");
                                  setShowBuyMoreDialog(true);
                                }}
                              >
                                <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                                Buy More
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                                onClick={() => {
                                  setSellSharesInput(
                                    String(placedTrade.shares),
                                  );
                                  setShowSellDialog(true);
                                }}
                              >
                                <Minus className="h-3.5 w-3.5 mr-1.5" />
                                Sell
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-muted-foreground hover:text-white"
                                onClick={() =>
                                  navigate(`/trade/${placedTrade.id}`)
                                }
                              >
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Full view
                              </Button>
                  </div>
                </CardContent>
              </Card>
                      );
                    })()}
                <LiveChartBlock
                  cardClassName="h-[11rem] sm:h-[14rem] xl:min-h-[22rem] xl:h-[min(23rem,78vh)] 2xl:h-[23rem]"
                  wrapperClassName="w-full"
                  title="Live price"
                />
            </div>
        </div>
            )}
      </Container>

      {/* ── Buy More Dialog ── */}
      <Dialog open={showBuyMoreDialog} onOpenChange={setShowBuyMoreDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-green-500" />
              Buy More — {placedTrade?.symbol}
            </DialogTitle>
            <DialogDescription>
              Additional shares will be bought at the current market price.
              Your average entry price will update automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {placedTrade && (
              <div className="grid grid-cols-2 gap-3 text-sm rounded-lg bg-muted/30 p-3 border text-center">
                <div>
                      <p className="text-xs text-muted-foreground">
                        Current avg price
                      </p>
                      <p className="font-bold">
                        {formatPriceForUi(placedTrade.entryPrice)}
                      </p>
                </div>
                <div>
                      <p className="text-xs text-muted-foreground">
                        Shares held
                      </p>
                  <p className="font-bold">{placedTrade.shares}</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
                  <Label>Additional amount ({displayCurrency})</Label>
              <Input
                type="number"
                min={1}
                placeholder="e.g. 5000"
                value={buyMoreAmount}
                    onChange={(e) => setBuyMoreAmount(e.target.value)}
                  />
                </div>
            {buyMoreAmount && result?.currentPrice && (
              <p className="text-xs text-muted-foreground">
                    ≈{" "}
                    {Math.floor(
                      convertDisplayInputToQuoteAmount(
                        parseFloat(buyMoreAmount),
                        quoteInUsd,
                        displayCurrency,
                        usdPerInr,
                      ) / result.currentPrice,
                    )}{" "}
                    more shares at current price{" "}
                    {formatPriceForUi(result.currentPrice)}
                      </p>
                    )}
                  </div>
          <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowBuyMoreDialog(false)}
                >
                  Cancel
                </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
                  disabled={
                    !buyMoreAmount ||
                    parseFloat(buyMoreAmount) <= 0 ||
                    buyMoreLoading
                  }
              onClick={async () => {
                if (!placedTrade || !buyMoreAmount || !result) return;
                setBuyMoreLoading(true);
                try {
                      const { tradeTrackingService } =
                        await import("@/services/tradeTrackingService");
                  const res = await tradeTrackingService.addToPosition({
                    tradeId: placedTrade.id,
                        additionalAmount: convertDisplayInputToQuoteAmount(
                          parseFloat(buyMoreAmount),
                          quoteInUsd,
                          displayCurrency,
                          usdPerInr,
                        ),
                    currentPrice: result.currentPrice,
                    allowFractional: result.isCrypto,
                  });
                  if (res.error) {
                    toast.error("Buy more failed: " + res.error);
                  } else {
                    toast.success("Position increased — avg price updated");
                    // Refresh trade state
                        const { data } = await tradeTrackingService.getTrade(
                          placedTrade.id,
                        );
                    if (data) setPlacedTrade(data);
                    setShowBuyMoreDialog(false);
                    setBuyMoreAmount("");
                  }
                } catch (e: any) {
                  toast.error(e?.message || "Failed");
                } finally {
                  setBuyMoreLoading(false);
                }
              }}
            >
                  {buyMoreLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <PlusCircle className="h-4 w-4 mr-2" />
                  )}
              Confirm Buy More
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sell Dialog (partial or full) ── */}
      <Dialog open={showSellDialog} onOpenChange={setShowSellDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Minus className="h-5 w-5 text-red-500" />
              Sell — {placedTrade?.symbol}
            </DialogTitle>
            <DialogDescription>
                  Choose how many shares to sell. Selling all shares closes the
                  position.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
                {placedTrade &&
                  (() => {
              const isShort = placedTrade.action === "SELL";
                    const livePrice =
                      placedTrade.currentPrice ?? placedTrade.entryPrice;
              const sellQty = parseFloat(sellSharesInput) || 0;
                    const fraction =
                      placedTrade.shares > 0 ? sellQty / placedTrade.shares : 0;
              const pnlPerShare = isShort
                ? placedTrade.entryPrice - livePrice
                : livePrice - placedTrade.entryPrice;
              const estimatedPnl = pnlPerShare * sellQty;
              const isProfit = estimatedPnl >= 0;
              return (
                <>
                  <div className="grid grid-cols-3 gap-2 text-sm rounded-lg bg-muted/30 p-3 border text-center">
                    <div>
                            <p className="text-xs text-muted-foreground">
                              Entry
                            </p>
                            <p className="font-bold">
                              {formatPriceForUi(placedTrade.entryPrice)}
                            </p>
                    </div>
                    <div>
                            <p className="text-xs text-muted-foreground">
                              Live price
                            </p>
                            <p className="font-bold">
                              {formatPriceForUi(livePrice)}
                            </p>
                    </div>
                    <div>
                            <p className="text-xs text-muted-foreground">
                              You hold
                            </p>
                            <p className="font-bold">
                              {placedTrade.shares} shares
                            </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Shares to sell</Label>
                      <button
                        className="text-xs text-primary underline"
                              onClick={() =>
                                setSellSharesInput(String(placedTrade.shares))
                              }
                      >
                        Sell all ({placedTrade.shares})
                      </button>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={placedTrade.shares}
                      value={sellSharesInput}
                            onChange={(e) => setSellSharesInput(e.target.value)}
                    />
                    {sellQty > 0 && sellQty <= placedTrade.shares && (
                      <p className="text-xs text-muted-foreground">
                        {Math.round(fraction * 100)}% of your position
                        {" · "}Est. P&amp;L:{" "}
                              <span
                                className={
                                  isProfit
                                    ? "text-green-600 font-semibold"
                                    : "text-red-600 font-semibold"
                                }
                              >
                                {estimatedPnl > 0 ? "+" : ""}
                                {formatCurrency(
                                  convertQuoteToDisplayAmount(
                                    Math.abs(estimatedPnl),
                                    quoteInUsd,
                                    displayCurrency,
                                    usdPerInr,
                                  ),
                                  2,
                                  false,
                                  effectivePriceCurrency,
                                )}
                        </span>
                      </p>
            )}
          </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowSellDialog(false)}
                >
                  Cancel
                </Button>
            <Button
              variant="destructive"
              disabled={
                !sellSharesInput ||
                parseFloat(sellSharesInput) <= 0 ||
                    (placedTrade
                      ? parseFloat(sellSharesInput) > placedTrade.shares
                      : true) ||
                sellLoading
              }
              onClick={async () => {
                if (!placedTrade || !result) return;
                setSellLoading(true);
                try {
                      const { tradeTrackingService } =
                        await import("@/services/tradeTrackingService");
                      const res = await tradeTrackingService.closeTrade(
                        placedTrade.id,
                        result.currentPrice,
                      );
                  if ((res as any)?.error) {
                    toast.error("Sell failed: " + (res as any).error);
                  } else {
                    toast.success("Position closed — trade recorded");
                    setPlacedTrade(null);
                    setShowSellDialog(false);
                  }
                } catch (e: any) {
                  toast.error(e?.message || "Failed");
                } finally {
                  setSellLoading(false);
                }
              }}
            >
                  {sellLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Minus className="h-4 w-4 mr-2" />
                  )}
              Confirm Sell
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Premium Plan Required Dialog */}
      <Dialog open={showPremiumDialog} onOpenChange={setShowPremiumDialog}>
        <DialogContent className="max-w-[95vw] md:max-w-5xl bg-zinc-950 border border-zinc-800 text-white p-5 sm:p-8 md:p-10 rounded-2xl md:rounded-3xl overflow-y-auto max-h-[90vh]">
          <DialogHeader className="mb-8">
                <DialogTitle className="text-2xl md:text-4xl font-black text-center tracking-tight">
                  Algo plan required
                </DialogTitle>
            <DialogDescription className="text-center text-zinc-400 text-base md:text-lg mt-2 max-w-2xl mx-auto">
              {midTierProOnlyUpgrade ? (
                <>
                  You already have an active plan. Upgrade to{" "}
                  <strong className="text-zinc-200">Pro</strong> in the billing portal for unlimited
                  strategies and premium support — Stripe prorates when enabled.
                </>
              ) : (
                <>
                  Live OpenAlgo is included on{" "}
                  <strong className="text-zinc-200">Starter</strong> ($149 setup + $49/mo after 30 days),{" "}
                  <strong className="text-zinc-200">Growth</strong> ($249 + $79/mo), and{" "}
                  <strong className="text-zinc-200">Pro</strong> ($399 + $129/mo). Legacy Probability-only
                  plans do not include live broker execution.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div
            className={`grid gap-6 ${
              algoDialogPlans.length === 1 ? "grid-cols-1 max-w-md mx-auto" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {algoDialogPlans.map((plan) => (
              <div
                key={plan.id}
                    className={`p-6 rounded-2xl flex flex-col relative transition-all border ${
                      plan.recommended
                        ? "bg-gradient-to-b from-teal-950/40 to-black border-teal-500/30 shadow-[0_0_30px_rgba(20,184,166,0.1)] lg:-mt-2"
                        : "bg-black border-zinc-800 shadow-md"
                    } ${plan.id === "professionalPlan" && "md:col-span-2 lg:col-span-1"}`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-500 text-black text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest z-10">
                    Recommended
                  </div>
                )}
                    <h3
                      className={`text-lg font-bold mb-2 ${plan.recommended ? "text-teal-400" : "text-zinc-200"}`}
                    >
                      {plan.name}
                    </h3>
                <div className="space-y-1 mb-4 tracking-tight text-white">
                  <div className="text-2xl font-black">
                    ${plan.integrationFee}
                    <span className="text-sm text-zinc-500 font-normal ml-1">one-time setup</span>
                  </div>
                  <div className="text-lg font-bold text-zinc-200">
                    ${plan.price}
                    <span className="text-sm text-zinc-500 font-normal ml-1">/{plan.period}</span>
                    <span className="block text-xs text-zinc-500 font-normal mt-0.5">
                      starting after 30 days
                    </span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1 text-sm text-zinc-300">
                  {plan.features.slice(0, 6).map((feature, i) => (
                    <li key={i} className="flex gap-3 items-start text-xs">
                          <CheckCircle
                            className={`h-4 w-4 shrink-0 mt-0.5 ${plan.recommended ? "text-teal-400" : "text-teal-500"}`}
                          />
                      <span className="leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                      className={`w-full py-5 rounded-xl ${plan.recommended ? "bg-teal-500 hover:bg-teal-400 text-black shadow-lg shadow-teal-500/20" : "bg-zinc-100 hover:bg-zinc-300 text-black"} font-bold transition-all`}
                  onClick={async () => {
                        const {
                          data: { session },
                        } = await supabase.auth.getSession();
                    if (!session) {
                    setShowPremiumDialog(false);
                          navigate(
                            "/auth?redirect=" + encodeURIComponent("/predict"),
                          );
                      return;
                    }
                    setShowPremiumDialog(false);
                    const origin = window.location.origin;
                    if (midTierProOnlyUpgrade && plan.id === "professionalPlan") {
                      const r = await createBillingPortalSession(`${origin}/predict`);
                      if ("error" in r) {
                        toast.error(r.error);
                        return;
                      }
                      window.location.href = r.url;
                      return;
                    }
                    const successAfterPay =
                      plan.id === "starterPlan"
                        ? `${origin}/algo-setup?checkout=success`
                        : `${origin}/home?checkout=success`;
                    const result = await createCheckoutSession({
                      plan_id: plan.id,
                      success_url: successAfterPay,
                      cancel_url: `${origin}/predict`,
                    });
                    if ("error" in result) {
                      toast.error(result.error);
                      return;
                    }
                    if ("url" in result) window.location.href = result.url;
                  }}
                >
                  {midTierProOnlyUpgrade && plan.id === "professionalPlan"
                    ? "Upgrade in billing portal"
                    : plan.recommended
                      ? "Get Growth Plan"
                      : "Get Started"}
                </Button>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-zinc-500 mt-4 px-2 max-w-xl mx-auto leading-relaxed">
            {PRICING_SETUP_AND_MONTHLY_NOTE}
          </p>
        </DialogContent>
      </Dialog>

      {/* Disclaimer */}
          <div className="border-t bg-muted/20">
        <Container className="py-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
                <AlertDescription
                  className={`${isMobile ? "text-xs" : "text-sm"}`}
                >
                  This is AI-generated probability-based analysis for
                  educational purposes only. Not financial advice. Past
                  performance does not guarantee future results. Always do your
                  own research.
            </AlertDescription>
          </Alert>
        </Container>
          </div>

      {/* ── Pre-order deep AI analysis sheet ──────────────────────────────── */}
      <PreOrderConfirmSheet
        open={showPreOrderSheet}
        order={preOrderData}
        onConfirm={() => {
          setShowPreOrderSheet(false);
          const p = pendingOrderRef.current;
              if (p)
                placeMockOrderAndTrack(
                  p.strategy,
                  p.product,
                  p.action,
                  p.sellPosition,
                );
          pendingOrderRef.current = null;
        }}
        onCancel={() => {
          setShowPreOrderSheet(false);
          pendingOrderRef.current = null;
        }}
      />
        </div>
      </DashboardShellLayout>
    </>
  );
};

export default PredictPage;
