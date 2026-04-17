import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CountdownTimer } from "./CountdownTimer";
import { ActionSignal } from "../prediction/ActionSignal";
import { RiskGrade } from "../prediction/RiskGrade";
import {
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  X,
  ExternalLink,
  CheckCircle,
  LogOut,
  Loader2,
} from "lucide-react";
import { ActiveTrade } from "@/services/tradeTrackingService";
import { isUsdDenominatedSymbol, getTradingViewSymbol } from "@/lib/tradingview-symbols";
import TradingViewWidget from "@/components/TradingViewWidget";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ActiveTradeCardProps {
  trade: ActiveTrade;
  onCancel?: (tradeId: string) => void;
  onClose?: (tradeId: string) => void;
  /** Square off via broker (places real SELL order). If not provided, button is hidden. */
  onSquareOff?: (tradeId: string) => Promise<void>;
  onViewDetails?: (tradeId: string) => void;
  /** Display currency for amounts. If USD, values are assumed INR and converted using usdPerInr. */
  displayCurrency?: "INR" | "USD";
  usdPerInr?: number | null;
}

export function ActiveTradeCard({
  trade,
  onCancel,
  onClose,
  onSquareOff,
  onViewDetails,
  displayCurrency = "INR",
  usdPerInr,
}: ActiveTradeCardProps) {
  const [squaringOff, setSquaringOff] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const isProfitable = (trade.currentPnl || 0) >= 0;
  const isNearStopLoss = trade.stopLossPrice && trade.currentPrice &&
    Math.abs(trade.currentPrice - trade.stopLossPrice) / trade.stopLossPrice < 0.05;
  const isNearTarget = trade.takeProfitPrice && trade.currentPrice &&
    Math.abs(trade.currentPrice - trade.takeProfitPrice) / trade.takeProfitPrice < 0.05;

  const getStatusBadge = () => {
    switch (trade.status) {
      case 'active':
        return <Badge variant="default" className="bg-primary">Active</Badge>;
      case 'monitoring':
        return <Badge variant="default" className="bg-yellow-500">Monitoring</Badge>;
      case "exit_zone":
        return <Badge variant="destructive">Exit Zone</Badge>;
      default:
        return <Badge variant="outline">{trade.status}</Badge>;
    }
  };

  const assetCurrency: "INR" | "USD" = isUsdDenominatedSymbol(trade.symbol) ? "USD" : "INR";
  // Card always shows prices in the asset's native currency (INR for Indian stocks, USD for US/crypto)
  const convertAmount = (value: number | undefined | null) => {
    const v = value ?? 0;
    return v;
  };

  const currencySymbol = assetCurrency === "USD" ? "$" : "₹";
  const strategyLabel = trade.strategyType
    ? trade.strategyType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Not specified";
  const isPaperTrade = trade.brokerOrderId?.startsWith("PAPER-") ?? false;

  return (
    <Card className={cn(
      "relative overflow-hidden",
      trade.status === 'exit_zone' && "border-orange-500 border-2"
    )}>
      {/* Status Indicator Bar */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-1",
        trade.status === 'active' && "bg-primary",
        trade.status === 'monitoring' && "bg-yellow-500",
        trade.status === 'exit_zone' && "bg-orange-500"
      )} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between pt-3">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-2xl font-bold">{trade.symbol}</CardTitle>
              <ActionSignal
                action={trade.action}
                confidence={trade.confidence || 0}
                size="sm"
              />
              {trade.riskGrade && (
                <RiskGrade level={trade.riskGrade as any} size="sm" />
              )}
              {isPaperTrade && (
                <Badge className="bg-violet-500/15 text-violet-700 border border-violet-500/40 text-[10px] uppercase tracking-wide">
                  🧪 Paper Trade
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Strategy:</span>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                {strategyLabel}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* P&L Display - Prominent */}
        <div className={cn(
          "p-4 rounded-lg border-2 transition-all duration-300",
          isProfitable ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
        )}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current P&L</p>
              <p
                className={cn(
                  "text-3xl font-bold transition-all duration-300",
                  isProfitable ? "text-green-600" : "text-red-600",
                )}
              >
                {isProfitable ? "+" : ""}
                {currencySymbol}
                {convertAmount(trade.currentPnl).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Percentage</p>
              <p className={cn(
                "text-2xl font-bold transition-all duration-300",
                isProfitable ? "text-green-600" : "text-red-600"
              )}>
                {isProfitable ? '+' : ''}{(trade.currentPnlPercentage || 0).toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Price Info */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-muted-foreground mb-1">Entry</p>
            <p className="font-semibold">
              {currencySymbol}
              {convertAmount(trade.entryPrice).toFixed(2)}
            </p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-muted-foreground mb-1">Current</p>
            <p className="font-semibold">
              {currencySymbol}
              {convertAmount(trade.currentPrice ?? trade.entryPrice).toFixed(2)}
            </p>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded">
            <p className="text-muted-foreground mb-1">Shares</p>
            <p className="font-semibold">{trade.shares}</p>
          </div>
        </div>

        {/* Targets */}
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(
            "p-3 rounded-lg border",
            isNearStopLoss && "border-red-500 bg-red-500/10"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <p className="text-xs text-muted-foreground">Stop Loss</p>
            </div>
            <p className="text-lg font-bold text-red-600">
              {trade.stopLossPrice != null
                ? `${currencySymbol}${convertAmount(trade.stopLossPrice).toFixed(2)}`
                : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">
              -{trade.stopLossPercentage}%
            </p>
          </div>

          <div className={cn(
            "p-3 rounded-lg border",
            isNearTarget && "border-green-500 bg-green-500/10"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-green-500" />
              <p className="text-xs text-muted-foreground">Take Profit</p>
            </div>
            <p className="text-lg font-bold text-green-600">
              {trade.takeProfitPrice != null
                ? `${currencySymbol}${convertAmount(trade.takeProfitPrice).toFixed(2)}`
                : "N/A"}
            </p>
            <p className="text-xs text-muted-foreground">
              +{trade.targetProfitPercentage}%
            </p>
          </div>
        </div>

        {/* Countdown Timer */}
        {trade.expectedExitTime && (
          <CountdownTimer
            targetTime={trade.expectedExitTime}
            label="Holding Period"
            size="md"
          />
        )}

        {/* Alerts */}
        {isNearStopLoss && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Warning:</strong> Price is within 5% of stop loss!
            </AlertDescription>
          </Alert>
        )}

        {isNearTarget && (
          <Alert className="border-green-500 bg-green-500/10">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-600">
              <strong>Target Approaching:</strong> Price is within 5% of take profit!
            </AlertDescription>
          </Alert>
        )}

        {trade.status === 'exit_zone' && (
          <Alert className="border-orange-500 bg-orange-500/10">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-sm text-orange-600">
              <strong>Exit Zone:</strong> Holding period is almost complete. Consider closing position.
            </AlertDescription>
          </Alert>
        )}

        {/* Leverage Warning */}
        {trade.leverage && trade.leverage > 1 && (
          <Alert variant="default" className="border-yellow-500/30 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-sm">
              {trade.leverage}x leverage active - P&L is amplified
            </AlertDescription>
          </Alert>
        )}

        {/* Trade Details */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <div className="flex justify-between">
            <span>Investment:</span>
            <span className="font-medium">
              {currencySymbol}
              {convertAmount(trade.investmentAmount).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Account Type:</span>
            <span className="font-medium capitalize">{trade.marginType || 'cash'}</span>
          </div>
          <div className="flex justify-between">
            <span>Holding Period:</span>
            <span className="font-medium">
              {trade.holdingPeriod === 'none' || (!trade.holdingPeriod && !trade.aiRecommendedHoldPeriod)
                ? 'Unlimited ∞'
                : (trade.holdingPeriod || trade.aiRecommendedHoldPeriod)
              }
            </span>
          </div>
          <div className="flex justify-between">
            <span>Entry Time:</span>
            <span className="font-medium">{new Date(trade.entryTime).toLocaleString()}</span>
          </div>
          {trade.lastPriceUpdate && (
            <div className="flex justify-between">
              <span>Last Update:</span>
              <span className="font-medium">{new Date(trade.lastPriceUpdate).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* TradingView chart (expandable) */}
        <div className="border rounded-lg overflow-hidden">
          <Button
            variant="ghost"
            className="w-full justify-between"
            onClick={() => setChartExpanded((e) => !e)}
          >
            <span className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              {chartExpanded ? "Hide" : "Show"} TradingView chart
            </span>
            {chartExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {chartExpanded && (
            <div className="h-64 w-full">
              <TradingViewWidget symbol={getTradingViewSymbol(trade.symbol)} interval="15" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {onViewDetails && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onViewDetails(trade.id)}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View on TradingView
            </Button>
          )}

          {/* Square Off via Broker — places a real SELL order via TradeBrainX trading engine */}
          {/* {onSquareOff && (
            <Button
              variant="default"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              disabled={squaringOff}
              onClick={async () => {
                if (!confirm(`Square off ${trade.shares} shares of ${trade.symbol} at market price via your broker?`)) return;
                setSquaringOff(true);
                try {
                  await onSquareOff(trade.id);
                } finally {
                  setSquaringOff(false);
                }
              }}
            >
              {squaringOff ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Placing exit order…</>
              ) : (
                <><LogOut className="h-4 w-4 mr-2" />Square Off via Broker</>
              )}
            </Button>
          )} */}

          <div className="grid grid-cols-2 gap-2">
            {onClose && (
              <Button
                variant="outline"
                className="border-green-600 text-green-600 hover:bg-green-600"
                onClick={() => onClose(trade.id)}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Sell
              </Button>
            )}
            {onCancel && (
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => onCancel(trade.id)}
              >
                <X className="h-4 w-4 mr-2" />
                Stop tracking
              </Button>
            )}
          </div>
          <p className="text-xs text-center text-muted-foreground">
            "Square Off" places a real {trade.action === 'BUY' ? 'SELL' : 'BUY'} order {trade.exchange && !isUsdDenominatedSymbol(trade.symbol) ? `on ${trade.exchange} ` : ''}via your broker.
            "Close" only updates this app.
          </p>
        </div>

      </CardContent>
    </Card>
  );
}
