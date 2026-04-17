/**
 * Options strategy quota limits by subscription plan_id.
 * Mirrors the pattern in algoStrategyLimits.ts for equity strategies.
 */

export const UNLIMITED_OPTIONS_STRATEGIES = -1;

export type OptionsStrategyLimits = {
  maxOptionsStrategies: number;
  allowPaperOnly: boolean;
  allowLiveTrading: boolean;
};

export function getOptionsStrategyLimits(
  planId: string | null | undefined,
): OptionsStrategyLimits | null {
  if (!planId) return null;
  switch (planId) {
    // Starter / Bot tier — paper only, 1 strategy
    case "starterPlan":
    case "botIntegration":
    case "algoTrading":
    case "algoTrading_test":
    case "test_1_rupee":
      return { maxOptionsStrategies: 1, allowPaperOnly: true, allowLiveTrading: false };

    // Growth / Pro-Intelligence tier — 3 strategies, paper + live
    case "growthPlan":
    case "probIntelligence":
      return { maxOptionsStrategies: 3, allowPaperOnly: true, allowLiveTrading: true };

    // Professional / Pro tier — unlimited
    case "professionalPlan":
    case "proPlan":
      return {
        maxOptionsStrategies: UNLIMITED_OPTIONS_STRATEGIES,
        allowPaperOnly: true,
        allowLiveTrading: true,
      };

    default:
      return null;
  }
}

export function isAtOptionsStrategyCap(
  count: number,
  limits: OptionsStrategyLimits | null,
): boolean {
  if (!limits) return false;
  if (limits.maxOptionsStrategies === UNLIMITED_OPTIONS_STRATEGIES) return false;
  return count >= limits.maxOptionsStrategies;
}

export function optionsStrategyCapMessage(limits: OptionsStrategyLimits): string {
  if (limits.maxOptionsStrategies === UNLIMITED_OPTIONS_STRATEGIES) return "";
  const n = limits.maxOptionsStrategies;
  return `Your plan allows up to ${n} options strateg${n === 1 ? "y" : "ies"}. Upgrade to add more.`;
}
