import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GlowCard } from "@/components/ui/glow-card";
import { StatusPill } from "@/components/ui/status-pill";
import { HorizonTile } from "@/components/ui/horizon-tile";
import { 
  CheckCircle, 
  Clock, 
  XCircle, 
  Loader2, 
  Activity,
  TrendingUp,
  BarChart3,
  Brain,
  AlertTriangle,
  Timer
} from "lucide-react";
import { formatTimeRemaining, formatDuration, formatPipelineDuration, getRelativeTime, formatDateTime, getShortHorizonLabel } from "@/lib/time";
import { getEffectiveStart, getEffectiveTarget, shouldStartTiming } from "@/lib/market-hours";
import { formatPipelineStep } from "@/lib/display-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { CardInfoTooltip } from "@/components/ui/card-info-tooltip";
import { HELP } from "@/lib/analysis-ui-help";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PostPredictionReport } from "@/components/prediction/PostPredictionReport";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PipelineStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
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

interface HorizonForecast {
  horizon: string;
  direction: "up" | "down" | "sideways";
  probabilities: { up: number; down: number; sideways: number };
  expected_return_bp: number;
  confidence: number;
}

interface PredictionTimelineProps {
  pipeline?: PipelineMeta;
  forecasts?: HorizonForecast[];
  predictedAt?: Date;
  marketTimeZone?: string | null;
  symbol?: string;
  marketStatus?: any;
}

const stepIcons: Record<string, any> = {
  symbol_validation: CheckCircle,
  market_data_fetch: BarChart3,
  historical_analysis: TrendingUp,
  news_sentiment: Activity,
  technical_indicators: BarChart3,
  ai_prediction: Brain,
  multi_horizon_forecast: Timer,
  risk_assessment: AlertTriangle
};

const stepLabels: Record<string, string> = {
  symbol_validation: "Symbol Validation",
  market_data_fetch: "Market Data",
  historical_analysis: "Historical Analysis", 
  news_sentiment: "News Sentiment",
  technical_indicators: "Technical Indicators",
  ai_prediction: "AI Analysis",
  multi_horizon_forecast: "Multi-Horizon Forecast",
  risk_assessment: "Risk Assessment"
};

export function PredictionTimeline({ 
  pipeline, 
  forecasts = [],
  predictedAt = new Date(),
  marketTimeZone,
  symbol = '',
  marketStatus
}: PredictionTimelineProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const { toast } = useToast();

  // Update current time every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleViewReport = async (forecast: HorizonForecast) => {
    if (!symbol) return;
    
    setReportLoading(true);
    try {
      const effectiveStart = getEffectiveStart(predictedAt, marketStatus);
      const targetTime = getEffectiveTarget(forecast.horizon, effectiveStart);
      
      const { data, error } = await supabase.functions.invoke('analyze-post-prediction', {
        body: {
          symbol,
          from: effectiveStart.toISOString(),
          to: targetTime.toISOString(),
          expected: {
            direction: forecast.direction,
            movePercent: forecast.expected_return_bp / 100,
            horizon: forecast.horizon
          }
        }
      });

      if (error) throw error;
      
      setReportData({
        symbol,
        timeframe: forecast.horizon,
        evaluation: data.evaluation,
        marketData: data.marketData,
        ai: data.ai,
        dataSource: data.dataSource
      });
    } catch (error: any) {
      console.error('Report generation failed:', error);
      toast({
        title: "Report Failed",
        description: error.message || "Unable to generate analysis report",
        variant: "destructive",
      });
    } finally {
      setReportLoading(false);
    }
  };

  if (!pipeline?.steps) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Prediction Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            No pipeline data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedSteps = pipeline.steps.filter(step => step.status === 'completed').length;
  const totalSteps = pipeline.steps.length;
  const progressPercent = (completedSteps / totalSteps) * 100;

  return (
    <div className="space-y-6">
      {/* Pipeline Progress Overview */}
      <GlowCard glowColor="primary" intensity="medium" className="sheen">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
                <Timer className="h-5 w-5 text-primary" />
              </div>
              <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                Pipeline Progress
              </span>
              <CardInfoTooltip text={HELP.pipelineProgress} className="text-zinc-400" />
            </div>
            <StatusPill 
              status="running" 
              label={formatPipelineDuration(pipeline.totalDuration)}
              size="sm"
            />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enhanced Progress Bar */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Progress</span>
              <span className="text-primary font-mono">{completedSteps}/{totalSteps} steps</span>
            </div>
            <div className="relative">
              <Progress value={progressPercent} className="h-3 bg-muted/20" />
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
            </div>
          </div>

          {/* Advanced Pipeline Steps */}
          <div className="grid gap-3">
            {pipeline.steps.map((step, index) => {
              const Icon = stepIcons[step.name] || Clock;
              const isCompleted = step.status === 'completed';
              const isRunning = step.status === 'running'; 
              const isError = step.status === 'error';

              return (
                <div
                  key={step.name}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 hover:scale-[1.01]",
                    "bg-gradient-to-r backdrop-blur-sm",
                    isCompleted && "from-trading-green/10 to-trading-green/5 border-trading-green/30 shadow-lg shadow-trading-green/10",
                    isRunning && "from-primary/10 to-primary/5 border-primary/30 shadow-lg shadow-primary/10 animate-pulse",
                    isError && "from-trading-red/10 to-trading-red/5 border-trading-red/30 shadow-lg shadow-trading-red/10",
                    !isCompleted && !isRunning && !isError && "from-muted/10 to-muted/5 border-muted/20"
                  )}
                >
                  {/* Glassmorphism overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div className="relative flex items-center gap-4">
                    <StatusPill
                      status={step.status}
                      icon={isRunning ? Loader2 : isError ? XCircle : Icon}
                      size="sm"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">
                          {formatPipelineStep(step.name)}
                        </span>
                        {(step.duration != null && step.duration > 0) ? (
                          <Badge variant="outline" className="text-xs font-mono">
                            {formatDuration(step.duration)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs font-mono text-muted-foreground">
                            —
                          </Badge>
                        )}
                      </div>
                      {step.details && (
                        <p className="text-xs text-muted-foreground truncate">
                          {step.details}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </GlowCard>

      {/* Live Horizon Countdown */}
      {forecasts.length > 0 && (
        <GlowCard glowColor="accent" intensity="medium" className="sheen">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-accent/20 to-accent/10">
                <TrendingUp className="h-5 w-5 text-accent" />
              </div>
              <span className="bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                Live Horizon Countdown
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Market closed banner */}
            {!shouldStartTiming(predictedAt, marketStatus) && (
              <Alert className="mb-4 border-accent/30 bg-accent/5">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Market closed. Timers start at {formatDateTime(getEffectiveStart(predictedAt, marketStatus), marketTimeZone)}. 
                  "Completes in ..." includes the pre-open delay.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {forecasts.map((forecast) => {
                const effectiveStart = getEffectiveStart(predictedAt, marketStatus);
                const targetTime = getEffectiveTarget(forecast.horizon, effectiveStart);
                const now = currentTime;
                
                let phase: 'waiting' | 'active' | 'expired';
                let primaryLabel: string;
                let secondaryLabel: string | undefined;
                let isExpired: boolean;
                
                if (now < effectiveStart) {
                  // Market is closed - show total completion time and when market opens
                  phase = 'waiting';
                  primaryLabel = `Completes in ${formatTimeRemaining(targetTime, now)}`;
                  secondaryLabel = `Opens in ${formatTimeRemaining(effectiveStart, now)}`;
                  isExpired = false;
                } else if (now < targetTime) {
                  // Market is open, horizon not reached
                  phase = 'active';
                  primaryLabel = `${formatTimeRemaining(targetTime, now)} remaining`;
                  isExpired = false;
                } else {
                  // Horizon expired
                  phase = 'expired';
                  primaryLabel = 'Expired';
                  isExpired = true;
                }

                return (
                  <div key={forecast.horizon} className="space-y-2">
                    <HorizonTile
                      horizon={formatDateTime(targetTime, marketTimeZone)}
                      shortHorizon={getShortHorizonLabel(forecast.horizon)}
                      direction={forecast.direction}
                      expectedReturn={forecast.expected_return_bp / 100}
                      confidence={forecast.confidence}
                      phase={phase}
                      primaryLabel={primaryLabel}
                      secondaryLabel={secondaryLabel}
                    />
                    {isExpired && symbol && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full"
                            onClick={() => handleViewReport(forecast)}
                            disabled={reportLoading}
                          >
                            {reportLoading ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              'View Report'
                            )}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              {forecast.horizon} Analysis Report - {symbol}
                            </DialogTitle>
                          </DialogHeader>
                          {reportData && (
                            <PostPredictionReport {...reportData} />
                          )}
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </GlowCard>
      )}

      {/* Advanced Pipeline Stats */}
      <GlowCard glowColor="primary" intensity="low" className="glass-effect">
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center space-y-2">
              <div className="relative">
                <div className="text-3xl font-bold bg-gradient-to-br from-trading-green to-trading-green/80 bg-clip-text text-transparent">
                  {pipeline.steps.filter(s => s.status === 'completed').length}
                </div>
                <div className="absolute inset-0 bg-trading-green/10 blur-xl rounded-full scale-150 animate-pulse" />
              </div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Completed
              </div>
            </div>
            <div className="text-center space-y-2">
              <div className="relative">
                <div className="text-3xl font-bold bg-gradient-to-br from-primary to-primary/80 bg-clip-text text-transparent">
                  {pipeline.steps.filter(s => s.status === 'running').length}
                </div>
                <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full scale-150 animate-pulse" />
              </div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Running
              </div>
            </div>
            <div className="text-center space-y-2">
              <div className="relative">
                <div className="text-3xl font-bold bg-gradient-to-br from-trading-red to-trading-red/80 bg-clip-text text-transparent">
                  {pipeline.steps.filter(s => s.status === 'error').length}
                </div>
                <div className="absolute inset-0 bg-trading-red/10 blur-xl rounded-full scale-150 animate-pulse" />
              </div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Errors
              </div>
            </div>
          </div>
        </CardContent>
      </GlowCard>
    </div>
  );
}