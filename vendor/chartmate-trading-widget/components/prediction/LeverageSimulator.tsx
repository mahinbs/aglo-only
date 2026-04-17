import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatPercentage } from "@/lib/display-utils";

interface LeverageSimulatorProps {
  investment: number;
  expectedMove: number; // Expected price movement in %
  currentLeverage?: number;
  currency?: "INR" | "USD";
}

export function LeverageSimulator({ 
  investment, 
  expectedMove,
  currentLeverage = 1,
  currency = "USD",
}: LeverageSimulatorProps) {
  const fmt = (amount: number, decimals: number, allowNegative = false) =>
    formatCurrency(amount, decimals, allowNegative, currency);
  
  const scenarios = [
    { leverage: 1, label: 'No Leverage (Cash)', safe: true },
    { leverage: 2, label: '2x Leverage', safe: true },
    { leverage: 3, label: '3x Leverage', safe: false },
    { leverage: 5, label: '5x Leverage', safe: false },
    ...(currentLeverage > 5 ? [{ leverage: currentLeverage, label: `${currentLeverage}x (Your Choice)`, safe: false }] : [])
  ];

  const calculateScenario = (leverage: number) => {
    const leveragedReturn = expectedMove * leverage;
    const gainAmount = (investment * leveragedReturn) / 100;
    
    // Calculate loss scenario (e.g., if expected is +10%, loss scenario is -5%)
    const lossScenario = Math.abs(expectedMove) * 0.5;
    const leveragedLoss = -lossScenario * leverage;
    const lossAmount = (investment * leveragedLoss) / 100;

    // Calculate margin call level (typically at 50% loss)
    const marginCallPrice = leverage > 1 ? (50 / leverage) : null;

    return {
      gainPercent: leveragedReturn,
      gainAmount,
      lossPercent: leveragedLoss,
      lossAmount,
      marginCallPercent: marginCallPrice,
      totalExposure: investment * leverage
    };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Leverage Impact Simulation
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          See how different leverage levels affect your potential gains and losses
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        
        {/* Scenarios Grid */}
        <div className="grid md:grid-cols-2 gap-4">
          {scenarios.map(({ leverage, label, safe }) => {
            const scenario = calculateScenario(leverage);
            const isUserChoice = leverage === currentLeverage;
            
            return (
              <div 
                key={leverage}
                className={`p-4 rounded-lg border-2 ${
                  isUserChoice 
                    ? 'border-primary bg-primary/5' 
                    : safe 
                      ? 'border-green-500/30 bg-green-500/5' 
                      : 'border-orange-500/30 bg-orange-500/5'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">{label}</h4>
                  {!safe && leverage > 2 && (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  )}
                </div>

                <div className="space-y-2 text-sm">
                  {/* Exposure */}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Total Exposure:</span>
                    <span className="font-medium">{fmt(scenario.totalExposure, 0)}</span>
                  </div>

                  {/* Gain Scenario */}
                  <div className="p-2 bg-green-500/10 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-green-600 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Gain Scenario:
                      </span>
                      <div className="text-right">
                        <div className="font-bold text-green-600">
                          +{fmt(scenario.gainAmount, 0)}
                        </div>
                        <div className="text-xs text-green-600">
                          ({formatPercentage(scenario.gainPercent, 1, true)})
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Loss Scenario */}
                  <div className="p-2 bg-red-500/10 rounded">
                    <div className="flex items-center justify-between">
                      <span className="text-red-600 flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        Loss Scenario:
                      </span>
                      <div className="text-right">
                        <div className="font-bold text-red-600">
                          {fmt(scenario.lossAmount, 0, true)}
                        </div>
                        <div className="text-xs text-red-600">
                          ({formatPercentage(scenario.lossPercent, 1, true)})
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Margin Call Warning */}
                  {scenario.marginCallPercent && (
                    <div className="text-xs text-orange-600 font-medium">
                      ⚠️ Margin call at {formatPercentage(scenario.marginCallPercent, 1, false)} drop
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Warning Alert */}
        {currentLeverage > 2 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-semibold">High Leverage Risk:</span> With {currentLeverage}x leverage, 
              a {(100/currentLeverage).toFixed(1)}% move against you could trigger a margin call. 
              Consider using lower leverage or wider stop-losses.
            </AlertDescription>
          </Alert>
        )}

        {/* Educational Note */}
        <div className="p-3 bg-primary/10 rounded-lg border border-primary/30 text-sm">
          <p className="font-semibold text-blue-600 mb-1">💡 Understanding Leverage:</p>
          <ul className="space-y-1 text-muted-foreground">
            <li>• <strong>1x (No Leverage)</strong>: Safest - you can only lose what you invest</li>
            <li>• <strong>2x Leverage</strong>: Moderate risk - doubles gains and losses</li>
            <li>• <strong>3x+ Leverage</strong>: High risk - can lose more than your investment</li>
            <li>• <strong>5x+ Leverage</strong>: Extreme risk - small moves have huge impact</li>
          </ul>
        </div>

      </CardContent>
    </Card>
  );
}
