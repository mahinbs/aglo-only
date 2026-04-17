/**
 * Custom algo strategy quotas by subscription plan_id.
 * Legacy plan_ids remain for existing subscribers; new checkout uses starter/growth/professional.
 */

export const UNLIMITED_CUSTOM_STRATEGIES = -1;

export type AlgoStrategyLimits = {
  maxCustomStrategies: number;
  allowDeleteStrategies: boolean;
};

export function getAlgoStrategyLimits(planId: string | null | undefined): AlgoStrategyLimits | null {
  if (!planId) return null;
  switch (planId) {
    case "starterPlan":
    case "botIntegration":
    case "algoTrading":
    case "algoTrading_test":
    case "test_1_rupee":
      return { maxCustomStrategies: 1, allowDeleteStrategies: false };
    case "growthPlan":
    case "probIntelligence":
      return { maxCustomStrategies: 3, allowDeleteStrategies: false };
    case "professionalPlan":
    case "proPlan":
      return { maxCustomStrategies: UNLIMITED_CUSTOM_STRATEGIES, allowDeleteStrategies: true };
    default:
      return null;
  }
}

export function isAtCustomStrategyCap(count: number, limits: AlgoStrategyLimits | null): boolean {
  if (!limits) return false;
  if (limits.maxCustomStrategies === UNLIMITED_CUSTOM_STRATEGIES) return false;
  return count >= limits.maxCustomStrategies;
}

export function strategyCapToastMessage(limits: AlgoStrategyLimits): string {
  if (limits.maxCustomStrategies === UNLIMITED_CUSTOM_STRATEGIES) return "";
  const n = limits.maxCustomStrategies;
  return `Your plan allows up to ${n} custom strateg${n === 1 ? "y" : "ies"}. Upgrade in billing to add more.`;
}
