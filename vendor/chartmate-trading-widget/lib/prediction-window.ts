import { getEffectiveStart, getEffectiveTarget } from "@/lib/market-hours";

type RawLike = Record<string, unknown> | null | undefined;

/**
 * DB column `timeframe` may be "custom" while the real window lives on the saved model payload.
 */
export function resolvePredictionHorizon(timeframeColumn: string, rawResponse: RawLike): string | number {
  const fromRaw =
    rawResponse && typeof rawResponse.timeframe === "string" ? rawResponse.timeframe : null;
  if (fromRaw && fromRaw !== "custom") return fromRaw;
  if (timeframeColumn && timeframeColumn !== "custom") return timeframeColumn;
  const focus =
    rawResponse && typeof (rawResponse as { focusTimeframe?: string }).focusTimeframe === "string"
      ? (rawResponse as { focusTimeframe: string }).focusTimeframe
      : null;
  if (focus) return focus;
  return "1h";
}

/** When the selected prediction window ends (wall clock + optional market-aware start). */
export function getPredictionWindowEnd(
  createdAt: string,
  timeframeColumn: string,
  rawResponse: RawLike,
  marketStatus?: unknown,
): Date {
  const wallStart = new Date(createdAt);
  const effectiveStart = getEffectiveStart(wallStart, marketStatus as Parameters<typeof getEffectiveStart>[1]);
  const horizon = resolvePredictionHorizon(timeframeColumn, rawResponse);
  return getEffectiveTarget(horizon, effectiveStart);
}
