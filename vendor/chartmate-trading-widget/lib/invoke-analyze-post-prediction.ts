import { supabase } from "@/integrations/supabase/client";
import { getEffectiveStart, getEffectiveTarget } from "@/lib/market-hours";
import { resolvePredictionHorizon } from "@/lib/prediction-window";
import type { CachedAnalysisData } from "@/lib/prediction-analysis-cache";

export interface PredictionRow {
  id: string;
  symbol: string;
  timeframe: string;
  created_at: string;
  expected_move_direction: string | null;
  expected_move_percent: number | null;
  price_target_min: number | null;
  price_target_max: number | null;
  raw_response: any;
}

/**
 * Calls analyze-post-prediction Edge function. Returns adapted AnalysisData or throws.
 */
export async function invokeAnalyzePostPrediction(
  prediction: PredictionRow,
  marketStatus: any,
  toOverride?: Date,
): Promise<CachedAnalysisData> {
  const effectiveStart = getEffectiveStart(new Date(prediction.created_at), marketStatus);
  const horizon = resolvePredictionHorizon(prediction.timeframe, prediction.raw_response);
  const effectiveEnd = toOverride || getEffectiveTarget(horizon, effectiveStart);

  const requestBody = {
    symbol: prediction.symbol,
    from: effectiveStart.toISOString(),
    to: effectiveEnd.toISOString(),
    expected: prediction.expected_move_direction
      ? {
          direction: prediction.expected_move_direction,
          movePercent: prediction.expected_move_percent || 0,
          priceTargetMin: prediction.price_target_min || null,
          priceTargetMax: prediction.price_target_max || null,
        }
      : null,
    marketMeta: prediction.raw_response?.marketMeta || null,
  };

  const { data, error } = await supabase.functions.invoke("analyze-post-prediction", {
    body: requestBody,
  });

  if (error) {
    throw new Error(error.message || "Edge function failed");
  }

  if (!data) {
    throw new Error("No data returned from analysis");
  }

  if (data.status === "no_data") {
    return {
      symbol: prediction.symbol,
      summary: data.summary,
      dataSource: data.dataSource,
      evaluation: {
        result: "inconclusive",
        startPrice: 0,
        endPrice: 0,
        actualChangePercent: 0,
        reasoning: "No market data available for this timeframe",
      },
    };
  }

  if ((data as any).error) {
    throw new Error(String((data as any).message || (data as any).error));
  }

  return {
    symbol: prediction.symbol,
    summary: data.summary,
    dataSource: data.dataSource,
    marketData: data.marketData,
    from: data.from || prediction.created_at,
    to: data.to || new Date().toISOString(),
    ai: data.ai || { summary: data.summary },
    evaluation: data.evaluation,
  };
}
