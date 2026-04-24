import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

type Sub = {
  id?: string;
  user_id?: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end?: boolean | null;
  payment_failed_at?: string | null;
};

const ALGO_ELIGIBLE_PLAN_IDS = new Set([
  "starterPlan",
  "growthPlan",
  "professionalPlan",
  "institutionalPlan",
  "botIntegration",
  "algoTrading",
  "algoTrading_test",
  "test_1_rupee",
  "proPlan",
]);

function hasActiveSubscription(sub: Sub | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing" && sub.status !== "pro_trial") {
    return false;
  }
  if (sub.current_period_end) {
    const graceEndMs = new Date(sub.current_period_end).getTime() + 24 * 60 * 60 * 1000;
    if (graceEndMs < Date.now()) return false;
  }
  return true;
}

function planAllowsAlgo(planId: string | null | undefined): boolean {
  if (!planId) return false;
  return ALGO_ELIGIBLE_PLAN_IDS.has(planId);
}

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSub] = useState<Sub | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSub(null);
      setFetchLoading(false);
      return;
    }
    setFetchLoading(true);
    supabase
      .from("user_subscriptions")
      .select("id, user_id, plan_id, status, current_period_end, cancel_at_period_end, payment_failed_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setSub(data ?? null);
        setFetchLoading(false);
      });
  }, [user?.id, authLoading]);

  const loading = authLoading || (Boolean(user?.id) && fetchLoading);
  const isPremium = hasActiveSubscription(subscription);
  const hasAlgoAccess = isPremium && planAllowsAlgo(subscription?.plan_id);

  const hasBillingIssue = useMemo(() => {
    if (!subscription) return false;
    return !isPremium && (subscription.status === "past_due" || Boolean(subscription.payment_failed_at));
  }, [subscription, isPremium]);

  return { subscription, loading, isPremium, hasAlgoAccess, hasBillingIssue };
}
