import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { BrainCircuit, TrendingUp, BarChart3, Search, Shield, Sparkles, Check } from "lucide-react";

interface AdvancedPredictLoaderProps {
  isVisible: boolean;
  symbol: string;
  timeframe: string;
  ready: boolean;
  onComplete: () => void;
}

const ANALYSIS_STEPS = [
  {
    id: "data",
    label: "Fetching Market Data",
    icon: Search,
    duration: 1200,
    description: "Retrieving real-time price data and historical patterns"
  },
  {
    id: "patterns",
    label: "Analyzing Patterns",
    icon: BarChart3,
    duration: 1800,
    description: "Identifying technical indicators and chart patterns"
  },
  {
    id: "sentiment",
    label: "Processing Sentiment",
    icon: TrendingUp,
    duration: 1500,
    description: "Analyzing market sentiment and news impact"
  },
  {
    id: "risk",
    label: "Risk Assessment",
    icon: Shield,
    duration: 1100,
    description: "Calculating risk factors and volatility metrics"
  },
  {
    id: "ai",
    label: "AI Model Processing",
    icon: BrainCircuit,
    duration: 1700,
    description: "Running neural network analysis"
  },
  {
    id: "final",
    label: "Finalizing Analysis",
    icon: Sparkles,
    duration: 900,
    description: "Compiling comprehensive analysis report"
  }
];

export function AdvancedPredictLoader({ isVisible, symbol, timeframe, ready, onComplete }: AdvancedPredictLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [telemetryLines, setTelemetryLines] = useState<Array<{ id: string; text: string; timestamp: number }>>([]);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      setProgress(0);
      setCompletedSteps(new Set());
      setTelemetryLines([]);
      return;
    }

    let stepIndex = 0;
    let overallProgress = 0;
    const totalDuration = ANALYSIS_STEPS.reduce((sum, step) => sum + step.duration, 0);
    let accumulatedTime = 0;

    const processStep = () => {
      if (stepIndex >= ANALYSIS_STEPS.length) {
        // Hold at 95% until ready becomes true
        if (!ready) {
          setProgress(prev => Math.max(prev, 95));
          setTelemetryLines(prev => {
            const newLines = [...prev, {
              id: `waiting-${Date.now()}`,
              text: `Waiting for analysis results... ${symbol}`,
              timestamp: Date.now()
            }];
            return newLines.slice(-4);
          });
          // Check every 500ms if ready
          setTimeout(() => {
            if (ready) {
              setProgress(prev => Math.max(prev, 100));
              setTimeout(onComplete, 300);
            } else {
              processStep();
            }
          }, 500);
          return;
        }
        setProgress(prev => Math.max(prev, 100));
        setTimeout(onComplete, 300);
        return;
      }

      const step = ANALYSIS_STEPS[stepIndex];
      setCurrentStep(stepIndex);

      // Add telemetry line
      setTelemetryLines(prev => {
        const newLines = [...prev, {
          id: `${step.id}-${Date.now()}`,
          text: `${step.label}... ${Math.random() > 0.5 ? 'Processing' : 'Analyzing'} ${symbol}`,
          timestamp: Date.now()
        }];
        return newLines.slice(-4); // Keep only last 4 lines
      });

      // Animate progress for this step (stop at 95% for last step if not ready)
      const maxProgressForStep = stepIndex === ANALYSIS_STEPS.length - 1 && !ready ? 95 : 100;
      const stepProgressInterval = setInterval(() => {
        const stepProgress = (step.duration / totalDuration) * maxProgressForStep / 30; // 30 updates per step
        overallProgress += stepProgress;
        setProgress(prev => Math.max(prev, Math.min(overallProgress, maxProgressForStep)));
      }, step.duration / 30);

      setTimeout(() => {
        clearInterval(stepProgressInterval);
        setCompletedSteps(prev => new Set([...prev, stepIndex]));
        accumulatedTime += step.duration;
        stepIndex++;
        processStep();
      }, step.duration);
    };

    const startDelay = setTimeout(processStep, 200);

    return () => {
      clearTimeout(startDelay);
    };
  }, [isVisible, symbol, onComplete]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-background/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-border">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/15 text-primary mb-3">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">AI Analysis in Progress</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Analyzing <span className="font-mono font-medium text-primary">{symbol}</span>
          </p>
        </div>

        {/* Progress */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold text-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Steps — simple list, no busy borders */}
        <div className="px-6 pb-6 space-y-2 max-h-[200px] overflow-y-auto">
          {ANALYSIS_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = completedSteps.has(index);
            const isCurrent = currentStep === index;
            const isPending = index > currentStep;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-4 rounded-lg px-3 py-2.5 transition-colors ${
                  isCurrent ? "bg-primary/10" : isCompleted ? "bg-muted/50" : "bg-muted/20"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    isCompleted
                      ? "bg-emerald-500 text-white"
                      : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      isCompleted
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isCurrent
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live feed — compact */}
        <div className="px-6 pb-6">
          <div className="rounded-lg bg-muted/30 px-3 py-2 border border-border">
            <div className="space-y-1 font-mono text-xs text-muted-foreground max-h-16 overflow-y-auto">
              {telemetryLines.map((line) => (
                <div key={line.id} className="flex justify-between gap-2">
                  <span className="truncate text-foreground/80">{line.text}</span>
                  <span className="shrink-0 opacity-70">
                    {new Date(line.timestamp).toLocaleTimeString([], {
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
              ))}
              {telemetryLines.length === 0 && (
                <span className="italic opacity-70">Starting...</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
