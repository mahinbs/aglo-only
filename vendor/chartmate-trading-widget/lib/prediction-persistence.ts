import { supabase } from "@/integrations/supabase/client";
import type { CachedAnalysisData } from "@/lib/prediction-analysis-cache";

/** Shape aligned with predict-movement response + PredictPage `PredictionResult` */
export type SavedPredictionResult = Record<string, unknown> & {
  symbol?: string;
  currentPrice?: number;
  geminiForecast?: unknown;
  meta?: { pipeline?: unknown };
};

export function predictionRowToResult(row: {
  id: string;
  symbol: string;
  timeframe: string;
  investment: number | null;
  current_price: number | null;
  recommendation?: string | null;
  confidence?: number | null;
  expected_move_direction?: string | null;
  expected_move_percent?: number | null;
  price_target_min?: number | null;
  price_target_max?: number | null;
  rationale?: string | null;
  patterns?: unknown;
  opportunities?: unknown;
  raw_response?: SavedPredictionResult | null;
}): SavedPredictionResult | null {
  const raw = row.raw_response;
  if (!raw || typeof raw !== "object") return null;

  const price = row.current_price ?? (raw.currentPrice as number) ?? 0;

  return {
    ...raw,
    symbol: row.symbol || (raw.symbol as string),
    currentPrice: price,
    timeframe: row.timeframe,
    recommendation: (raw.recommendation as string) ?? row.recommendation ?? undefined,
    confidence: (raw.confidence as number) ?? row.confidence ?? undefined,
    expectedMove: (raw.expectedMove as object) ?? {
      percent: row.expected_move_percent ?? undefined,
      direction: row.expected_move_direction ?? undefined,
      priceTarget:
        row.price_target_min != null && row.price_target_max != null
          ? { min: row.price_target_min, max: row.price_target_max }
          : undefined,
    },
    rationale: (raw.rationale as string) ?? row.rationale ?? undefined,
    patterns: raw.patterns ?? row.patterns,
    opportunities: raw.opportunities ?? row.opportunities,
    geminiForecast: raw.geminiForecast,
    meta: raw.meta,
  };
}

export type PostOutcomeRow = {
  evaluation?: CachedAnalysisData["evaluation"];
  ai?: CachedAnalysisData["ai"];
  marketData?: CachedAnalysisData["marketData"];
  dataSource?: string;
  summary?: string;
  updated_at?: string;
};

export async function persistPostOutcomeAnalysis(
  predictionId: string,
  payload: CachedAnalysisData,
): Promise<void> {
  const row: PostOutcomeRow = {
    evaluation: payload.evaluation,
    ai: payload.ai,
    marketData: payload.marketData,
    dataSource: payload.dataSource,
    summary: payload.summary,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("predictions" as any)
    .update({ post_outcome_analysis: row })
    .eq("id", predictionId);
  if (error) console.error("persistPostOutcomeAnalysis:", error);
}

export async function loadPredictionForUser(predictionId: string, userId: string) {
  const { data, error } = await supabase
    .from("predictions" as any)
    .select("*")
    .eq("id", predictionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
