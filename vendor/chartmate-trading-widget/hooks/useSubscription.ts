import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isManualFullAccessEmail } from "@/lib/manualSubscriptionBypass";
import { getSubscription, hasActiveSubscription, type UserSubscription } from "@/services/stripeService";
import {
  subscriptionAllowsAlgo,
  subscriptionAllowsAnalysis,
} from "@/lib/subscriptionEntitlements";

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);

  const manualFullAccessBypass = isManualFullAccessEmail(user?.email);

  useEffect(() => {
    if (!user?.id) {
      setSubscription(null);
      setFetchLoading(false);
      return;
    }
    setFetchLoading(true);
    getSubscription().then((s) => {
      setSubscription(s);
      setFetchLoading(false);
    });
  }, [user?.id]);

  /** False until auth has settled and (if signed in) subscription row fetch finished. */
  const loading = authLoading || (Boolean(user?.id) && fetchLoading);

  const subscriptionForUi = useMemo((): UserSubscription | null => {
    if (subscription) return subscription;
    if (manualFullAccessBypass && user?.id) {
      return {
        id: "client-manual-bypass",
        user_id: user.id,
        plan_id: "professionalPlan",
        status: "active",
        current_period_end: null,
        stripe_customer_id: "cus_manual_exc_client_bypass",
      };
    }
    return null;
  }, [subscription, manualFullAccessBypass, user?.id]);

  const isPremium =
    manualFullAccessBypass || hasActiveSubscription(subscriptionForUi);
  const hasAlgoAccess =
    manualFullAccessBypass || subscriptionAllowsAlgo(subscriptionForUi);
  const hasAnalysisAccess =
    manualFullAccessBypass || subscriptionAllowsAnalysis(subscriptionForUi);
  const nowMs = Date.now();
  const periodEndMs = subscriptionForUi?.current_period_end
    ? new Date(subscriptionForUi.current_period_end).getTime()
    : null;
  const daysUntilExpiry =
    periodEndMs != null ? Math.ceil((periodEndMs - nowMs) / (24 * 60 * 60 * 1000)) : null;
  const isExpiringSoon =
    isPremium && daysUntilExpiry != null && daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
  const isAutoRenewDisabled = Boolean(subscriptionForUi?.cancel_at_period_end);
  const isInGracePeriod = Boolean(
    periodEndMs != null &&
      periodEndMs < nowMs &&
      periodEndMs + 24 * 60 * 60 * 1000 > nowMs,
  );

  const hasBillingIssue =
    !manualFullAccessBypass &&
    Boolean(subscriptionForUi) &&
    !hasActiveSubscription(subscriptionForUi) &&
    (subscriptionForUi!.status === "past_due" ||
      Boolean(subscriptionForUi!.payment_failed_at));

  return {
    subscription: subscriptionForUi,
    loading,
    manualFullAccessBypass,
    isPremium,
    hasAlgoAccess,
    hasAnalysisAccess,
    isExpiringSoon,
    daysUntilExpiry,
    isAutoRenewDisabled,
    isInGracePeriod,
    hasBillingIssue,
  };
}
