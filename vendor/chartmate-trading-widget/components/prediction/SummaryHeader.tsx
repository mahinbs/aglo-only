import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import {
  formatCurrency,
  formatPercentage,
  fractionDigitsToShowNonZero,
} from "@/lib/display-utils"
import { cn } from "@/lib/utils"

interface SummaryHeaderProps {
  symbol: string
  currentPrice: number
  change: number
  changePercent: number
  recommendation?: string
  confidence?: number
  /** `flat`: no inner panel — use beside actions in a parent grid (e.g. prediction cards). */
  variant?: "panel" | "flat"
  /** Decimal places for displayed prices (spot and absolute $ change). Default 2. */
  priceDecimals?: number
  /** Decimal places for the % next to price change (e.g. expected move on list cards). Default 1. */
  changePercentDecimals?: number
  /** Decimal places for confidence %. Default 1. */
  confidenceDecimals?: number
  /** Fiat symbol for prices (investment / list cards use saved analysis currency). */
  currency?: "INR" | "USD"
}

export function SummaryHeader({
  symbol,
  currentPrice,
  change,
  changePercent,
  recommendation,
  confidence,
  variant = "panel",
  priceDecimals = 2,
  changePercentDecimals = 1,
  confidenceDecimals = 1,
  currency = "USD",
}: SummaryHeaderProps) {
  const changeAmountDecimals = fractionDigitsToShowNonZero(
    Math.abs(change),
    priceDecimals,
  )

  const getChangeIcon = () => {
    if (changePercent > 0) return <TrendingUp className="h-4 w-4" />
    if (changePercent < 0) return <TrendingDown className="h-4 w-4" />
    return <Minus className="h-4 w-4" />
  }

  const getChangeColor = () => {
    if (changePercent > 0) return "text-emerald-400"
    if (changePercent < 0) return "text-red-400"
    return "text-muted-foreground"
  }

  const getRecommendationColor = () => {
    if (recommendation === "bullish") return "bg-green-500/10 text-green-600 border-green-500/20"
    if (recommendation === "bearish") return "bg-red-500/10 text-red-600 border-red-500/20"
    return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
  }

  if (variant === "flat") {
    return (
      <div className="min-w-0 w-full space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
            {symbol}
          </h2>
          {recommendation ? (
            <Badge className={cn("shrink-0 border", getRecommendationColor())}>
              {recommendation}
            </Badge>
          ) : null}
        </div>
        <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1.5 sm:gap-x-4">
          <span className="text-base sm:text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(currentPrice, priceDecimals, false, currency)}
          </span>
          <div
            className={cn("flex items-center gap-1 text-sm tabular-nums", getChangeColor())}
          >
            {getChangeIcon()}
            <span>
              {formatCurrency(Math.abs(change), changeAmountDecimals, false, currency)} (
              {formatPercentage(Math.abs(changePercent), changePercentDecimals, false)})
            </span>
          </div>
          {confidence != null && !Number.isNaN(confidence) ? (
            <div className="flex w-full min-[400px]:w-auto min-[400px]:flex-1 min-[400px]:justify-end sm:flex-none sm:justify-start items-baseline gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Confidence
              </span>
              <span className="text-sm sm:text-base font-semibold tabular-nums text-foreground">
                {formatPercentage(confidence, confidenceDecimals, false)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-muted/30 rounded-lg border w-full">
      <div className="flex items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">{symbol}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span className="text-base sm:text-lg font-semibold">{formatCurrency(currentPrice, priceDecimals, false, currency)}</span>
            <div className={`flex items-center gap-1 ${getChangeColor()}`}>
              {getChangeIcon()}
              <span className="text-sm">
                {formatCurrency(Math.abs(change), changeAmountDecimals, false, currency)} ({formatPercentage(Math.abs(changePercent), changePercentDecimals, false)})
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {recommendation && (
          <Badge className={getRecommendationColor()}>
            {recommendation}
          </Badge>
        )}
        {confidence != null && !Number.isNaN(confidence) ? (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Confidence</p>
            <p className="text-base sm:text-lg font-semibold">{formatPercentage(confidence, confidenceDecimals, false)}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}