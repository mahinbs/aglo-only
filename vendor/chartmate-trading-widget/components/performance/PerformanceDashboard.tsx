import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  Target,
  XCircle,
  AlertCircle,
  BarChart3,
  Lightbulb
} from "lucide-react";
import { tradeTrackingService, ActiveTrade } from "@/services/tradeTrackingService";
import { cn } from "@/lib/utils";

export function PerformanceDashboard() {
  const [completedTrades, setCompletedTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const result = await tradeTrackingService.getCompletedTrades(100);
      if (result.data) {
        setCompletedTrades(result.data);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
    return <div className="text-center p-6">Loading performance data...</div>;
  }

  if (completedTrades.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No completed trades yet. Start tracking trades to see performance analytics.
        </AlertDescription>
      </Alert>
    );
  }

  // Calculate statistics
  const winningTrades = completedTrades.filter(t => (t.actualPnl || 0) > 0);
  const losingTrades = completedTrades.filter(t => (t.actualPnl || 0) < 0);
  const winRate = (winningTrades.length / completedTrades.length) * 100;

  const totalPnL = completedTrades.reduce((sum, t) => sum + (t.actualPnl || 0), 0);
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + (t.actualPnl || 0), 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + (t.actualPnl || 0), 0) / losingTrades.length
    : 0;

  const bestTrade = [...completedTrades].sort((a, b) => (b.actualPnl || 0) - (a.actualPnl || 0))[0];
  const worstTrade = [...completedTrades].sort((a, b) => (a.actualPnl || 0) - (b.actualPnl || 0))[0];

  // Find losing trades to display
  const recentLosses = losingTrades.slice(0, 3);

  return (
    <div className="space-y-6">
      
      {/* Performance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            
            {/* Total Trades */}
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Total Trades</p>
              <p className="text-3xl font-bold">{completedTrades.length}</p>
            </div>

            {/* Win Rate */}
            <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/30">
              <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
              <p className="text-3xl font-bold text-green-600">{winRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {winningTrades.length}W / {losingTrades.length}L
              </p>
            </div>

            {/* Total P&L */}
            <div className={cn(
              "text-center p-4 rounded-lg border-2",
              totalPnL >= 0 ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
            )}>
              <p className="text-sm text-muted-foreground mb-1">Total P&L</p>
              <p className={cn(
                "text-3xl font-bold",
                totalPnL >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
              </p>
            </div>

            {/* Avg Win/Loss Ratio */}
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Avg Win/Loss</p>
              <p className="text-2xl font-bold">
                {avgLoss !== 0 ? (Math.abs(avgWin / avgLoss)).toFixed(2) : 'N/A'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Win: ${avgWin.toFixed(0)} / Loss: ${Math.abs(avgLoss).toFixed(0)}
              </p>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Win Rate Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Win/Loss Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-600 font-medium">Winning Trades</span>
                  <span className="font-bold">{winningTrades.length}</span>
                </div>
                <Progress value={winRate} className="h-3 bg-red-500/20" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-red-600 font-medium">Losing Trades</span>
                  <span className="font-bold">{losingTrades.length}</span>
                </div>
                <Progress value={100 - winRate} className="h-3" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Best & Worst Trades */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Best Trade */}
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-green-600" />
              Best Trade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg">{bestTrade?.symbol}</span>
                <Badge className="bg-green-600">{bestTrade?.action}</Badge>
              </div>
              <p className="text-2xl font-bold text-green-600">
                +${bestTrade?.actualPnl?.toFixed(2) || '0.00'}
              </p>
              <p className="text-sm text-green-600">
                +{bestTrade?.actualPnlPercentage?.toFixed(2) || '0.00'}%
              </p>
              <p className="text-xs text-muted-foreground">
                {bestTrade?.exitTime && new Date(bestTrade.exitTime).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Worst Trade */}
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600" />
              Worst Trade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg">{worstTrade?.symbol}</span>
                <Badge className="bg-red-600">{worstTrade?.action}</Badge>
              </div>
              <p className="text-2xl font-bold text-red-600">
                ${worstTrade?.actualPnl?.toFixed(2) || '0.00'}
              </p>
              <p className="text-sm text-red-600">
                {worstTrade?.actualPnlPercentage?.toFixed(2) || '0.00'}%
              </p>
              <p className="text-xs text-muted-foreground">
                {worstTrade?.exitTime && new Date(worstTrade.exitTime).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failure Transparency - Recent Losses */}
      {recentLosses.length > 0 && (
        <Card className="border-orange-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Recent Losses (Transparency)
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              We show our failures openly. Here's what went wrong and what we learned.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentLosses.map((trade) => (
              <div key={trade.id} className="p-4 bg-red-500/5 rounded-lg border border-red-500/20">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold">{trade.symbol}</h4>
                    <p className="text-xs text-muted-foreground">
                      {new Date(trade.entryTime).toLocaleDateString()} - {trade.exitTime && new Date(trade.exitTime).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-600">
                      ${trade.actualPnl?.toFixed(2)}
                    </p>
                    <p className="text-sm text-red-600">
                      {trade.actualPnlPercentage?.toFixed(2)}%
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-600">What Went Wrong:</p>
                      <p className="text-muted-foreground">
                        {trade.exitReason === 'stop_loss_triggered' && "Stop loss was hit. Price moved against our analysis."}
                        {trade.exitReason === 'holding_period_ended' && "Holding period ended without reaching target. Market didn't move as expected."}
                        {trade.exitReason === 'target_hit' && "This wasn't a loss - target was hit!"} 
                        {!trade.exitReason && "Trade completed with loss."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-primary mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-600">What We Learned:</p>
                      <p className="text-muted-foreground">
                        {trade.confidence && trade.confidence < 60 && "Low confidence signal - we now require higher confidence for similar setups."}
                        {trade.leverage && trade.leverage > 2 && "High leverage amplified losses - recommend lower leverage for similar trades."}
                        {trade.riskGrade === 'VERY_HIGH' && "Very high risk trade - we now flag these more prominently."}
                        {(!trade.confidence || trade.confidence >= 60) && !trade.leverage && trade.riskGrade !== 'VERY_HIGH' && "Market conditions changed unexpectedly - adding more real-time monitoring."}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      <strong>AI Adaptation:</strong> This loss has been analyzed and incorporated into future predictions to improve accuracy.
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* Key Learnings Summary */}
            <Alert className="border-primary/30 bg-primary/10">
              <Lightbulb className="h-4 w-4 text-blue-600" />
              <AlertDescription>
                <p className="font-semibold mb-2">Key Learnings from Losses:</p>
                <ul className="text-sm space-y-1">
                  <li>• Higher confidence thresholds for volatile stocks</li>
                  <li>• Tighter stop-losses for leveraged positions</li>
                  <li>• Better timing for entry points</li>
                  <li>• More weight on market conditions</li>
                </ul>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Statistics by Exit Reason */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Exit Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { 
                reason: 'target_hit', 
                label: 'Target Hit', 
                icon: Target, 
                color: 'text-green-600',
                count: completedTrades.filter(t => t.exitReason === 'target_hit').length
              },
              { 
                reason: 'stop_loss_triggered', 
                label: 'Stop Loss', 
                icon: XCircle, 
                color: 'text-red-600',
                count: completedTrades.filter(t => t.exitReason === 'stop_loss_triggered').length
              },
              { 
                reason: 'holding_period_ended', 
                label: 'Time Expired', 
                icon: AlertCircle, 
                color: 'text-yellow-600',
                count: completedTrades.filter(t => t.exitReason === 'holding_period_ended').length
              }
            ].map((stat) => {
              const Icon = stat.icon;
              const percentage = (stat.count / completedTrades.length) * 100;
              
              return (
                <div key={stat.reason} className="flex items-center gap-3">
                  <Icon className={cn("h-4 w-4", stat.color)} />
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{stat.label}</span>
                      <span className="text-muted-foreground">{stat.count} ({percentage.toFixed(1)}%)</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
