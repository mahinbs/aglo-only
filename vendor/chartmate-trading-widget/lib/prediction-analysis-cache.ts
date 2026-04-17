/**
 * Shared localStorage cache for post-prediction analysis (used by Predictions list + full analysis page).
 */
export const PREDICTION_ANALYSIS_CACHE_KEY = "prediction-analysis-cache";

export interface CachedAnalysisData {
  symbol: string;
  summary?: string;
  dataSource?: string;
  marketData?: { candleCount: number; source: string; interval: string };
  from?: string;
  to?: string;
  ai?: {
    summary?: string;
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
  evaluation?: {
    result: "accurate" | "partial" | "failed" | "inconclusive";
    startPrice: number;
    endPrice: number;
    actualChangePercent: number;
    predictedDirection?: "up" | "down" | "neutral" | "sideways" | null;
    predictedMovePercent?: number | null;
    hitTargetMin?: boolean;
    hitTargetMax?: boolean;
    endTimeUsed?: string;
    reasoning?: string;
  };
}

export interface AnalysisStateRow {
  loading: boolean;
  data: CachedAnalysisData | null;
  error: string | null;
}

export function readPredictionAnalysisCache(): Record<string, AnalysisStateRow> {
  try {
    const raw = localStorage.getItem(PREDICTION_ANALYSIS_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, AnalysisStateRow>;
  } catch {
    return {};
  }
}

export function writePredictionAnalysisCache(states: Record<string, AnalysisStateRow>) {
  try {
    localStorage.setItem(PREDICTION_ANALYSIS_CACHE_KEY, JSON.stringify(states));
  } catch (e) {
    console.error("Failed to save prediction analysis cache:", e);
  }
}

export function removePredictionAnalysisFromCache(predictionId: string) {
  const all = readPredictionAnalysisCache();
  delete all[predictionId];
  writePredictionAnalysisCache(all);
}
