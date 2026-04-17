import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RiskGrade } from "./RiskGrade";
import { formatCurrency, formatPercentage } from "@/lib/display-utils";
import {
  DollarSign,
  Target,
  AlertTriangle,
  Clock,
  Package,
  Scale,
  LineChart,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DecisionScreenProps {
  symbol: string;
  currentPrice: number;
  investment: number;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
  expectedROI: {
    best: number;
    likely: number;
    worst: number;
  };
  positionSize: {
    shares: number;
    costPerShare: number;
    totalCost: number;
  };
  recommendedHoldPeriod?: string;
  stopLoss: number;
  takeProfit: number;
  leverage?: number;
  /** Display currency for notional, ROI % amounts, SL/TP (user’s chosen currency). */
  currency?: "INR" | "USD";
  /** Quote currency for spot / share prices; defaults to `currency`. */
  priceCurrency?: "INR" | "USD";
  /** If true, show fractional units (crypto). */
  isCrypto?: boolean;
}

const tileClass =
  "p-3 sm:p-4 bg-background rounded-lg border border-primary/20 shadow-sm shadow-black/5";

export function DecisionScreen({
  symbol,
  currentPrice,
  investment,
  action,
  confidence,
  riskLevel,
  expectedROI,
  positionSize,
  recommendedHoldPeriod,
  stopLoss,
  takeProfit,
  leverage = 1,
  currency = "USD",
  priceCurrency: priceCurrencyProp,
  isCrypto = false,
}: DecisionScreenProps) {
  const priceCurrency = priceCurrencyProp ?? currency;
  const fmt = (amount: number, decimals = 2, allowNegative = false) =>
    formatCurrency(amount, decimals, allowNegative, currency);
  const fmtPrice = (amount: number, decimals = 2, allowNegative = false) =>
    formatCurrency(amount, decimals, allowNegative, priceCurrency);

  const bestCaseAmount = (investment * expectedROI.best) / 100;
  const likelyCaseAmount = (investment * expectedROI.likely) / 100;
  const worstCaseAmount = (investment * expectedROI.worst) / 100;

  const stopLossAmount = (investment * stopLoss) / 100;
  const takeProfitAmount = (investment * takeProfit) / 100;

  const getActionRecommendation = () => {
    if (action === "BUY" && confidence >= 70) {
      return {
        explanation: `On ${symbol}, the run shows strong upward lean at about ${confidence}% internal agreement. Several technical votes line up with continuation, while headline and liquidity risk stay at a ${riskLevel.toLowerCase()} bucket. This describes structure, not a personal order ticket.`,
      };
    }
    if (action === "BUY" && confidence >= 50) {
      return {
        explanation: `On ${symbol}, the lean is cautiously upward at about ${confidence}% agreement, but not every input agrees. Risk is tagged ${riskLevel.toLowerCase()}; the next sessions matter for whether participation confirms the move.`,
      };
    }
    if (action === "SELL") {
      return {
        explanation: `On ${symbol}, the run tilts toward weaker near-term structure at about ${confidence}% agreement. That is a read on pressure and indicators for this window, not a comment on what you already hold.`,
      };
    }
    if (action === "HOLD") {
      return {
        explanation: `On ${symbol}, the model sees a muddy edge at about ${confidence}% agreement: sentiment or flow can look fine while candles, volume, or horizon math still disagree. The write-up below is the detail; treat it as context for your plan, not a label to obey blindly.`,
      };
    }
    return {
      explanation: `On ${symbol}, signals are mixed at about ${confidence}% agreement, so reward for directional bets is uncertain versus ${riskLevel.toLowerCase()} risk. Let the chart print a cleaner story or refresh after news before leaning hard either way.`,
    };
  };

  const recommendation = getActionRecommendation();

  const actionStyles =
    action === "BUY"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : action === "SELL"
        ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
        : "border-primary/40 bg-primary/10 text-primary";

  return (
    <Card className="border-primary/30 bg-primary/5 overflow-hidden">
      <CardContent className="pt-6 space-y-4">
        {/* Title + risk + signal badges */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <LineChart className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold text-base tracking-tight text-foreground">Investment analysis</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Scenario outlook for your notional size — illustrative only, not a promise of returns.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground">{symbol}</span>
                </span>
                <span className="text-border">·</span>
                <span>Spot {fmtPrice(currentPrice, isCrypto ? 4 : 2)}</span>
                <span className="text-border">·</span>
                <span>Notional {fmt(investment, 0)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end lg:flex-col lg:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="outline" className={cn("text-xs font-semibold border", actionStyles)}>
                {action}
              </Badge>
              <Badge
                variant="outline"
                className="text-xs font-medium border-primary/30 bg-background text-foreground"
              >
                {confidence}% confidence
              </Badge>
            </div>
            <div className="flex justify-end rounded-lg border border-primary/20 bg-background/80 px-2 py-1.5">
              <RiskGrade level={riskLevel} size="lg" />
            </div>
          </div>
        </div>

        <Alert className="border-primary/50 bg-background/80">
          <Scale className="h-4 w-4 text-primary" />
          <AlertDescription>
            <p className="font-semibold text-sm mb-1.5 text-foreground">Market context</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{recommendation.explanation}</p>
          </AlertDescription>
        </Alert>

        {/* ROI scenarios */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary shrink-0" />
            <h4 className="font-semibold text-sm text-foreground">
              If you allocate {fmt(investment, 0)} today
            </h4>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div
              className={cn(
                tileClass,
                "text-center border-emerald-500/25 bg-emerald-500/[0.06]",
              )}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Best case</p>
              <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {fmt(bestCaseAmount, 2)}
              </p>
              <p className="text-xs font-medium text-emerald-600/90 dark:text-emerald-400/90 mt-0.5">
                {formatPercentage(expectedROI.best)}
              </p>
            </div>
            <div
              className={cn(
                tileClass,
                "text-center border-primary/40 bg-primary/10 ring-1 ring-primary/20",
              )}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Likely</p>
              <p className="text-xl sm:text-2xl font-bold text-primary tabular-nums">
                {fmt(likelyCaseAmount, 2)}
              </p>
              <p className="text-xs font-medium text-primary/90 mt-0.5">{formatPercentage(expectedROI.likely)}</p>
            </div>
            <div className={cn(tileClass, "text-center border-red-500/25 bg-red-500/[0.06]")}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Worst case</p>
              <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                {fmt(worstCaseAmount, 2, true)}
              </p>
              <p className="text-xs font-medium text-red-600/90 dark:text-red-400/90 mt-0.5">
                {formatPercentage(expectedROI.worst)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className={tileClass}>
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold text-sm text-foreground">Position size</span>
            </div>
            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{isCrypto ? "Units" : "Shares"}</span>
                <span className="font-semibold text-foreground tabular-nums text-right">
                  {isCrypto
                    ? positionSize.shares.toFixed(6).replace(/\.?0+$/, "")
                    : positionSize.shares}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{isCrypto ? "Price / unit" : "Price / share"}</span>
                <span className="font-medium text-foreground tabular-nums">{fmtPrice(positionSize.costPerShare, 2)}</span>
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t border-primary/10">
                <span className="text-muted-foreground">Total cost</span>
                <span className="font-semibold text-foreground tabular-nums">{fmtPrice(positionSize.totalCost, 2)}</span>
              </div>
            </div>
          </div>

          <div className={tileClass}>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold text-sm text-foreground">Risk management</span>
            </div>
            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Stop loss</span>
                <span className="font-semibold text-red-600 dark:text-red-400 tabular-nums text-right">
                  -{fmt(stopLossAmount, 0)} ({formatPercentage(stopLoss, 0, false)})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Take profit</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums text-right">
                  +{fmt(takeProfitAmount, 0)} ({formatPercentage(takeProfit, 0, false)})
                </span>
              </div>
              {leverage > 1 && (
                <div className="flex justify-between gap-2 pt-2 border-t border-primary/10">
                  <span className="text-muted-foreground">Leverage</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{leverage}×</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {recommendedHoldPeriod && (
          <Alert className="border-primary/30 bg-muted/40">
            <Clock className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              <span className="font-semibold text-foreground">Suggested horizon: </span>
              <span className="text-primary font-semibold">{recommendedHoldPeriod}</span>
            </AlertDescription>
          </Alert>
        )}

        {leverage > 1 && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-semibold text-sm mb-1">Leverage warning</p>
              <p className="text-xs leading-relaxed opacity-95">
                {leverage}× leverage magnifies both gains and losses. A {(100 / leverage).toFixed(1)}% move against
                you can eliminate the position. Use only if you understand the risk.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <div className="p-4 bg-muted/50 rounded-lg border border-primary/15 text-xs space-y-2">
          <p className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Illustrative only:</strong> ROI bands are model-derived scenarios,
            not guaranteed outcomes. Slippage, fees, and market gaps are not fully reflected.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground pt-1 border-t border-primary/15">
          Do your own research — this screen supports decisions; it does not replace professional advice
        </p>
      </CardContent>
    </Card>
  );
}
