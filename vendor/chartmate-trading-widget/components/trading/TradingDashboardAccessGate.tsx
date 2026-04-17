import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { hasActiveSubscription, type UserSubscription } from "@/services/stripeService";
import { planAllowsAlgo } from "@/lib/subscriptionEntitlements";
import { isManualFullAccessEmail } from "@/lib/manualSubscriptionBypass";
import { TradingDashboardLoadingScreen } from "./TradingDashboardShell";

interface GateState {
  loading: boolean;
  provisioned: boolean;
  broker: string | null;
  redirectTo: string | null;
}

export interface TradingDashboardAccessGateProps {
  children: (ctx: { broker: string }) => React.ReactNode;
  /** Where to redirect if the user has algo entitlement but hasn't finished onboarding. */
  notReadyRedirect?: string;
  /**
   * Skip the onboarding-provisioned check entirely.
   * Use for pages like AI Analysis + Backtesting that only require an active algo-tier
   * subscription, not a fully provisioned OpenAlgo account.
   */
  skipProvisioningCheck?: boolean;
}

/**
 * Signed-in users only. Unpaid → pricing. Paid Probability-only ($99) → subscription.
 * Bot/Pro not yet provisioned → algo-setup (or notReadyRedirect), unless skipProvisioningCheck.
 */
export function TradingDashboardAccessGate({
  children,
  notReadyRedirect = "/algo-setup",
  skipProvisioningCheck = false,
}: TradingDashboardAccessGateProps) {
  const { pathname, search } = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { loading: roleLoading } = useUserRole();
  const [status, setStatus] = useState<GateState>({
    loading: true,
    provisioned: false,
    broker: null,
    redirectTo: null,
  });

  useEffect(() => {
    if (!user?.id) return;
    if (isManualFullAccessEmail(user.email)) {
      setStatus({ loading: false, provisioned: true, broker: null, redirectTo: null });
      return;
    }
    (async () => {
      const { data: sub } = await supabase
        .from("user_subscriptions")
        .select("status, current_period_end, plan_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const row = sub as UserSubscription | null;
      const subActive = hasActiveSubscription(row);
      const planId = (row?.plan_id as string) ?? null;

      if (!subActive) {
        setStatus({ loading: false, provisioned: false, broker: null, redirectTo: "/pricing" });
        return;
      }

      if (!planAllowsAlgo(planId)) {
        setStatus({ loading: false, provisioned: false, broker: null, redirectTo: "/subscription?feature=algo" });
        return;
      }

      // AI Analysis + Backtesting only need an active algo-tier subscription — no broker needed.
      if (skipProvisioningCheck) {
        setStatus({ loading: false, provisioned: true, broker: null, redirectTo: null });
        return;
      }

      const { data: onboarding } = await (supabase as any)
        .from("algo_onboarding")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      const isProvisioned =
        onboarding?.status === "provisioned" || onboarding?.status === "active";

      const { data: integration } = await (supabase as any)
        .from("user_trading_integration")
        .select("is_active, broker")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      setStatus({
        loading: false,
        provisioned: !!isProvisioned,
        broker: integration?.broker ?? null,
        redirectTo: isProvisioned ? null : notReadyRedirect,
      });
    })();
  }, [user?.id, notReadyRedirect, skipProvisioningCheck]);

  if (authLoading || roleLoading || status.loading) {
    return <TradingDashboardLoadingScreen />;
  }

  if (!user) {
    const redirect = encodeURIComponent(`${pathname}${search}`);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }

  if (status.redirectTo) {
    return <Navigate to={status.redirectTo} replace />;
  }

  return <>{children({ broker: status.broker ?? "zerodha" })}</>;
}
