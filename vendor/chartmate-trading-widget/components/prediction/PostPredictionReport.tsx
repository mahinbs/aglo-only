import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OutcomeBadge } from "./OutcomeBadge";
import { TrendingUp, TrendingDown, Minus, BarChart3, Brain, Target, AlertCircle } from "lucide-react";
import { formatCurrency, formatPercentage } from "@/lib/display-utils";

interface PostPredictionReportProps {
  symbol: string;
  timeframe?: string;
  evaluation?: {
    result: 'accurate' | 'partial' | 'failed' | 'inconclusive';
    startPrice: number;
    endPrice: number;
    actualChangePercent: number;
    predictedDirection?: 'up' | 'down' | 'neutral' | 'sideways' | null;
    predictedMovePercent?: number | null;
    reasoning?: string;
  };
  marketData?: {
    candleCount: number;
    source: string;
    interval: string;
  };
  ai?: {
    report?: {
      title: string;
      whatWePredicted: string;
      whatHappened: string;
      verdictExplanation: string;
      failureExcuse?: string | null;
      successExplanation?: string | null;
      keyFactors: string[];
      nextSteps: string[];
      confidenceNote: string;
    };
    rawText?: string;
  };
  dataSource?: string;
}

export function PostPredictionReport({
  symbol,
  timeframe,
  evaluation,
  marketData,
  ai,
  dataSource
}: PostPredictionReportProps) {
  const getDirectionIcon = (direction?: string) => {
    switch (direction) {
      case 'up': return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <Minus className="h-4 w-4 text-yellow-600" />;
    }
  };

  if (!evaluation && !ai?.report) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No analysis data available
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Data Caveat for Inconclusive Results */}
      {evaluation?.result === 'inconclusive' && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 sm:p-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-yellow-800 mb-1 text-sm">Limited Data Available</h4>
              <p className="text-xs sm:text-sm text-yellow-700">
                This analysis could not be properly evaluated due to insufficient market data during the specified timeframe.
                The analysis may not be reliable for this particular trading period.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {ai?.report && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <Brain className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="break-words">{ai.report.title}</span>
              </CardTitle>
              {evaluation && <OutcomeBadge outcome={evaluation.result} size="lg" />}
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Analysis vs Reality */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
              <Target className="h-3.5 w-3.5 flex-shrink-0" />
              What We Analyzed
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {ai?.report ? (
              <p className="text-xs sm:text-sm">{ai.report.whatWePredicted}</p>
            ) : evaluation ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {getDirectionIcon(evaluation.predictedDirection || undefined)}
                  <span className="text-xs sm:text-sm font-medium">
                    {evaluation.predictedDirection || 'neutral'} move
                  </span>
                </div>
                {evaluation.predictedMovePercent && (
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Expected: {formatPercentage(evaluation.predictedMovePercent, 2, true)}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground">No analysis data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="flex items-center gap-2 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5 flex-shrink-0" />
              What Happened
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {ai?.report ? (
              <p className="text-xs sm:text-sm">{ai.report.whatHappened}</p>
            ) : evaluation ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {getDirectionIcon(evaluation.actualChangePercent >= 0 ? 'up' : 'down')}
                  <span className="text-xs sm:text-sm font-medium">
                    {formatPercentage(evaluation.actualChangePercent, 2, true)}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {formatCurrency(evaluation.startPrice, 4)} → {formatCurrency(evaluation.endPrice, 4)}
                </p>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground">No market data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Metrics Grid */}
      {evaluation && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs sm:text-sm">Market Metrics</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Start Price</p>
                <p className="font-mono text-xs sm:text-sm">{formatCurrency(evaluation.startPrice, 4)}</p>
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">End Price</p>
                <p className="font-mono text-xs sm:text-sm">{formatCurrency(evaluation.endPrice, 4)}</p>
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Actual Move</p>
                <p className={`font-mono text-xs sm:text-sm ${evaluation.actualChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercentage(evaluation.actualChangePercent, 2, true)}
                </p>
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Data Points</p>
                <p className="font-mono text-xs sm:text-sm">{marketData?.candleCount || 0}</p>
              </div>
            </div>
            {marketData && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Data: {marketData.source} ({marketData.interval})
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Analysis */}
      {ai?.report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verdict Explanation */}
            <div>
              <h4 className="text-sm font-medium mb-2">Analysis</h4>
              <p className="text-sm text-muted-foreground">{ai.report.verdictExplanation}</p>
            </div>

            {/* Success/Failure Explanation */}
            {ai.report.successExplanation && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-green-600">Why It Worked</h4>
                <p className="text-sm text-muted-foreground">{ai.report.successExplanation}</p>
              </div>
            )}

            {ai.report.failureExcuse && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-orange-600">Why It Missed</h4>
                <p className="text-sm text-muted-foreground">{ai.report.failureExcuse}</p>
              </div>
            )}

            {/* Key Factors */}
            {ai.report.keyFactors?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Key Factors</h4>
                <ul className="space-y-1">
                  {ai.report.keyFactors.map((factor, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Next Steps */}
            {ai.report.nextSteps?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Next Steps</h4>
                <ul className="space-y-1">
                  {ai.report.nextSteps.map((step, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-accent mt-1">→</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Confidence Note */}
            {ai.report.confidenceNote && (
              <div className="pt-4 border-t">
                <Badge variant="outline" className="text-xs">
                  {ai.report.confidenceNote}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Raw Data Source */}
      {dataSource && (
        <div className="text-xs text-muted-foreground text-center">
          Data source: {dataSource}
        </div>
      )}
    </div>
  );
}