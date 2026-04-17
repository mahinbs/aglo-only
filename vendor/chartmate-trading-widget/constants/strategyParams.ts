/**
 * Strategy-specific risk params used for real-time tracking.
 * Each strategy has different SL/TP/hold — trades follow these unless manually overridden.
 */
export interface StrategyParams {
  stopLossPercentage: number;
  targetProfitPercentage: number;
  /** Recommended hold: e.g. "Same day", "2–10 days", "1–3 days" */
  defaultHoldPeriod: string;
}

export const STRATEGY_PARAMS: Record<string, StrategyParams> = {
  trend_following:    { stopLossPercentage: 5,  targetProfitPercentage: 10, defaultHoldPeriod: "3–7 days" },
  breakout_breakdown: { stopLossPercentage: 3,  targetProfitPercentage: 8,  defaultHoldPeriod: "1–5 days" },
  mean_reversion:     { stopLossPercentage: 3,  targetProfitPercentage: 5,  defaultHoldPeriod: "1–3 days" },
  momentum:           { stopLossPercentage: 3,  targetProfitPercentage: 6,  defaultHoldPeriod: "Intraday–2 days" },
  scalping:           { stopLossPercentage: 0.5, targetProfitPercentage: 1, defaultHoldPeriod: "Same day (minutes–hours)" },
  swing_trading:      { stopLossPercentage: 5,  targetProfitPercentage: 15, defaultHoldPeriod: "2–10 days" },
  range_trading:      { stopLossPercentage: 2,  targetProfitPercentage: 4,  defaultHoldPeriod: "1–5 days" },
  news_based:         { stopLossPercentage: 5,  targetProfitPercentage: 12, defaultHoldPeriod: "Event-driven" },
  options_buying:     { stopLossPercentage: 50, targetProfitPercentage: 100, defaultHoldPeriod: "Until expiry" },
  options_selling:    { stopLossPercentage: 50, targetProfitPercentage: 25, defaultHoldPeriod: "Until expiry" },
  pairs_trading:      { stopLossPercentage: 2,  targetProfitPercentage: 4,  defaultHoldPeriod: "Days–weeks" },
};

export function getStrategyParams(strategyCode: string): StrategyParams {
  return STRATEGY_PARAMS[strategyCode] ?? {
    stopLossPercentage: 5,
    targetProfitPercentage: 10,
    defaultHoldPeriod: "2–7 days",
  };
}
