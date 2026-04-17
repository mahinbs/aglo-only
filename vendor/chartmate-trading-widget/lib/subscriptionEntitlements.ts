import type { UserSubscription } from "@/services/stripeService";
import { hasActiveSubscription } from "@/services/stripeService";

/** $49 bot / internal algo checkout plan ids — legacy; live OpenAlgo, historically no full analysis product. */
export const ALGO_ONLY_PLAN_IDS = new Set([
  "botIntegration",
  "algoTrading",
  "algoTrading_test",
  "test_1_rupee",
]);

/** Legacy: $99 probability + $129 pro — analysis tiers. */
export const LEGACY_ANALYSIS_PLAN_IDS = new Set(["probIntelligence", "proPlan"]);

/** New monthly tiers — full app unlock (analysis + OpenAlgo); strategy quotas differ. */
export const NEW_MONTHLY_PLAN_IDS = new Set(["starterPlan", "growthPlan", "professionalPlan"]);

/** Live OpenAlgo, broker execution, algo onboarding. */
export function planAllowsAlgo(planId: string | null | undefined): boolean {
  if (!planId) return false;
  if (NEW_MONTHLY_PLAN_IDS.has(planId)) return true;
  if (ALGO_ONLY_PLAN_IDS.has(planId)) return true;
  return planId === "proPlan";
}

/** Predict / analysis / paper flows (not Probability-only legacy without algo — they still get analysis). */
export function planAllowsAnalysis(planId: string | null | undefined): boolean {
  if (!planId) return false;
  if (NEW_MONTHLY_PLAN_IDS.has(planId)) return true;
  return LEGACY_ANALYSIS_PLAN_IDS.has(planId);
}

export function subscriptionAllowsAlgo(sub: UserSubscription | null): boolean {
  return hasActiveSubscription(sub) && planAllowsAlgo(sub.plan_id);
}

export function subscriptionAllowsAnalysis(sub: UserSubscription | null): boolean {
  return hasActiveSubscription(sub) && planAllowsAnalysis(sub.plan_id);
}

/**
 * Subscribed on a non-top tier — show only Pro in-app, or use billing portal to upgrade.
 */
export function isMidTierEligibleForProOnlyUpgrade(planId: string | null | undefined): boolean {
  if (!planId || planId === "professionalPlan") return false;
  return (
    planId === "starterPlan" ||
    planId === "growthPlan" ||
    planId === "botIntegration" ||
    planId === "probIntelligence" ||
    ALGO_ONLY_PLAN_IDS.has(planId)
  );
}
