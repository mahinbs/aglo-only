import { PRICING_PLANS } from "@/constants/pricing";
import { hasActiveSubscription, type UserSubscription } from "@/services/stripeService";

const PLAN_NAMES: Record<string, string> = Object.fromEntries(PRICING_PLANS.map((p) => [p.id, p.name]));

const LEGACY_PLAN_LABELS: Record<string, string> = {
  botIntegration: "AI Auto Trading Bot (legacy)",
  probIntelligence: "Probability Intelligence (legacy)",
  proPlan: "Pro Plan (legacy)",
  algoTrading: "Algo Trading Setup (legacy)",
  algoTrading_test: "Algo Trading Test (legacy)",
  test_1_rupee: "Test",
  wl_1_year: "White Label (1 year)",
  wl_2_years: "White Label (2 years)",
  wl_5_years: "White Label (5 years)",
};

export function planIdToDisplayName(planId: string | null | undefined): string {
  if (!planId) return "—";
  return PLAN_NAMES[planId] ?? LEGACY_PLAN_LABELS[planId] ?? planId;
}

export function describeReferredUserSubscription(
  sub: Pick<UserSubscription, "plan_id" | "status" | "current_period_end"> | null | undefined,
): { billing: "Paid" | "Free"; planLine: string; statusRaw: string } {
  if (!sub) {
    return { billing: "Free", planLine: "—", statusRaw: "—" };
  }
  const paid = hasActiveSubscription(sub as UserSubscription);
  const name = planIdToDisplayName(sub.plan_id);
  const statusRaw = sub.status ?? "—";
  if (paid) {
    return { billing: "Paid", planLine: name, statusRaw };
  }
  if (sub.plan_id) {
    return { billing: "Free", planLine: `${name} (inactive)`, statusRaw };
  }
  return { billing: "Free", planLine: "—", statusRaw };
}
