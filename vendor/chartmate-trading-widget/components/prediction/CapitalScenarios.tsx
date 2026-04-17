import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DollarSign, TrendingUp, TrendingDown, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercentage } from "@/lib/display-utils";

interface CapitalScenariosProps {
  /** Price per share in the same currency as `currency` (parent should convert from quote if needed). */
  currentPrice: number;
  expectedROI: {
    best: number;
    likely: number;
    worst: number;
  };
  stopLossPercentage: number;
  leverage?: number;
  allowFractionalShares?: boolean; // Some brokers allow, some don't
  /** Currency for notionals (10k / 100k / 1M) and formatted amounts */
  currency?: "INR" | "USD";
}

/** Returns a sensible number of decimal places so crypto/small amounts never show $0 */
function smartDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return 2;
  if (abs < 0.01) return 6;
  if (abs < 1) return 4;
  if (abs < 10) return 2;
  return 0;
}

export function CapitalScenarios({ 
  currentPrice, 
  expectedROI,
  stopLossPercentage,
  leverage = 1,
  allowFractionalShares = true, // Default: allow fractional (modern brokers like Robinhood, Webull)
  currency = "USD",
}: CapitalScenariosProps) {
  const fmt = (amount: number, decimals: number, allowNegative = false) =>
    formatCurrency(amount, decimals, allowNegative, currency);
  
  const scenarios = [
    { amount: 10000, label: 'Small Investor', icon: '👤' },
    { amount: 100000, label: 'Medium Investor', icon: '👥' },
    { amount: 1000000, label: 'Large Investor', icon: '🏢' }
  ];

  const calculateScenario = (investment: number) => {
    // Calculate shares based on broker capability
    let shares: number;
    let actualInvestment: number;
    
    if (allowFractionalShares) {
      // Modern brokers (Robinhood, Webull, etc.) - allow fractional shares
      shares = investment / currentPrice;
      actualInvestment = investment; // Use full investment
    } else {
      // Traditional brokers - only whole shares
      shares = Math.floor(investment / currentPrice);
      actualInvestment = shares * currentPrice; // Actual investment based on whole shares
    }
    
    // expectedROI values are already in percentage format (e.g., 5 for 5%)
    // Convert to decimal by dividing by 100, then multiply by investment
    const bestCase = actualInvestment * (expectedROI.best / 100) * leverage;
    const likelyCase = actualInvestment * (expectedROI.likely / 100) * leverage;
    const worstCase = actualInvestment * (expectedROI.worst / 100) * leverage;
    const maxLoss = actualInvestment * (stopLossPercentage / 100) * leverage;

    return {
      shares,
      actualInvestment,
      bestCase,
      likelyCase,
      worstCase,
      maxLoss
    };
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="flex gap-2 text-white">
          <Users className="h-5 w-5 mt-0.5 min-w-5 text-primary" />
          Investment Planning - Capital Scenarios
        </CardTitle>
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <p className="text-sm text-muted-foreground">
            See how the same signal performs across different investment sizes (USD)
          </p>
          <Badge variant={allowFractionalShares ? "default" : "secondary"} className="text-xs">
            {allowFractionalShares ? "✓ Fractional Shares" : "Whole Shares Only"}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-6">
          
          {scenarios.map(({ amount, label, icon }) => {
            const scenario = calculateScenario(amount);
            
            return (
              <div key={amount} className="p-4 rounded-lg border border-white/5 bg-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{icon}</span>
                    <div>
                      <h4 className="font-bold text-white">{label}</h4>
                      <p className="text-sm text-muted-foreground">
                        {fmt(amount, 0)} investment
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-white/10 text-zinc-300">
                    {scenario.shares < 1 
                      ? scenario.shares.toFixed(4) 
                      : scenario.shares < 10 
                        ? scenario.shares.toFixed(2) 
                        : Math.floor(scenario.shares)
                    } shares
                  </Badge>
                </div>

                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">

                  {/* Best Case */}
                  <div className="text-center p-3 bg-green-500/10 rounded border border-green-500/20">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Best Case</p>
                    <p className="text-lg font-bold text-green-400">
                      {fmt(scenario.bestCase, smartDecimals(scenario.bestCase))}
                    </p>
                    <p className="text-xs text-green-500">{formatPercentage(expectedROI.best)}</p>
                  </div>

                  {/* Likely Case */}
                  <div className="text-center p-3 bg-primary/10 rounded border border-primary/20">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Likely</p>
                    <p className="text-lg font-bold text-blue-400">
                      {fmt(scenario.likelyCase, smartDecimals(scenario.likelyCase))}
                    </p>
                    <p className="text-xs text-primary">{formatPercentage(expectedROI.likely)}</p>
                  </div>

                  {/* Worst Case */}
                  <div className="text-center p-3 bg-orange-500/10 rounded border border-orange-500/20">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Worst Case</p>
                    <p className="text-lg font-bold text-orange-400">
                      {fmt(scenario.worstCase, smartDecimals(scenario.worstCase), true)}
                    </p>
                    <p className="text-xs text-orange-500">{formatPercentage(expectedROI.worst, 2, false)}</p>
                  </div>

                  {/* Max Loss (Stop Loss) */}
                  <div className="text-center p-3 bg-red-500/10 rounded border border-red-500/20">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Max Loss</p>
                    <p className="text-lg font-bold text-red-400">
                      -{fmt(scenario.maxLoss, smartDecimals(scenario.maxLoss))}
                    </p>
                    <p className="text-xs text-red-500">-{stopLossPercentage}%</p>
                  </div>

                </div>

                {/* Risk per Trade */}
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Risk per trade:</span>
                    <span className="font-semibold text-zinc-300">
                      {fmt(scenario.maxLoss, smartDecimals(scenario.maxLoss))} ({stopLossPercentage}% of capital)
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">Risk-Reward Ratio:</span>
                    <span className="font-semibold text-zinc-300">
                      1:{(scenario.likelyCase / scenario.maxLoss).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Leverage Impact Notice */}
          {leverage > 1 && (
            <Alert className="border-orange-500/30 bg-orange-500/10">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-sm text-orange-200">
                All scenarios above reflect <strong>{leverage}x leverage</strong>. 
                Returns and losses are amplified by {leverage}x compared to cash trading.
              </AlertDescription>
            </Alert>
          )}

          {/* Investment Guidance */}
          <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
            <p className="font-semibold text-sm mb-2 text-blue-400">💡 Position Sizing Guidance:</p>
            <ul className="text-sm text-zinc-400 space-y-1">
              <li>• <strong>Conservative:</strong> Risk 1-2% of capital per trade</li>
              <li>• <strong>Moderate:</strong> Risk 2-3% of capital per trade</li>
              <li>• <strong>Aggressive:</strong> Risk 3-5% of capital per trade</li>
              <li>• <strong>Never risk more than 5%</strong> on a single trade</li>
            </ul>
          </div>

          {/* Broker Fractional Shares Info */}
          {!allowFractionalShares && (
            <Alert className="border-amber-500/30 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm text-amber-200">
                <strong>Whole Shares Only:</strong> Calculations use whole shares only. 
                If you can't afford 1 full share, consider brokers that support fractional shares 
                (Robinhood, Webull, Fidelity, Charles Schwab, etc.)
              </AlertDescription>
            </Alert>
          )}

          {allowFractionalShares && (
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <p className="text-sm text-green-400">
                ✓ <strong>Fractional Shares Enabled:</strong> You can invest any amount, even if it's less than 1 full share. 
                Most modern brokers support this feature.
              </p>
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}
