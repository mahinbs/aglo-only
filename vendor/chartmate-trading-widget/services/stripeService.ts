import { supabase } from "@/integrations/supabase/client";

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end?: boolean | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  /** Set by stripe-webhook on invoice.payment_failed; cleared on invoice.paid */
  payment_failed_at?: string | null;
  /** Running total of one-time integration fees collected. Used to compute upgrade deltas. */
  integration_fee_paid?: number | null;
  /** Scheduled downgrade plan_id — applies at next renewal. */
  pending_plan_change?: string | null;
  /** When the downgrade was requested. */
  pending_plan_change_at?: string | null;
}

export async function createCheckoutSession(params: {
  plan_id: string;
  type?: "premium" | "whitelabel";
  success_url?: string;
  cancel_url?: string;
  wl?: { brand_name?: string; slug?: string; token?: string };
}): Promise<{ url: string } | { error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: "Please sign in to continue" };
  }

  const res = await supabase.functions.invoke("create-checkout-session", {
    body: {
      plan_id: params.plan_id,
      type: params.type ?? "premium",
      success_url: params.success_url,
      cancel_url: params.cancel_url,
      wl: params.wl,
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const data = res.data as { url?: string; error?: string } | null;
  const errMsg = data?.error ?? res.error?.message ?? "Failed to create checkout";
  if (res.error || data?.error) return { error: errMsg };
  if (!data?.url) return { error: "No checkout URL returned" };
  return { url: data.url };
}

export type BillingPortalFlow =
  | "default"
  | "payment_method_update"
  | "subscription_update"
  | "subscription_cancel";

export type CreateBillingPortalOptions = {
  return_url?: string;
  portal_flow?: BillingPortalFlow;
};

export async function createBillingPortalSession(
  returnUrlOrOptions?: string | CreateBillingPortalOptions,
): Promise<{ url: string } | { error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: "Please sign in to continue" };
  }

  let return_url: string;
  let portal_flow: BillingPortalFlow = "default";
  if (typeof returnUrlOrOptions === "string") {
    return_url = returnUrlOrOptions;
  } else {
    return_url = returnUrlOrOptions?.return_url ?? `${window.location.origin}/subscription`;
    portal_flow = returnUrlOrOptions?.portal_flow ?? "default";
  }

  const res = await supabase.functions.invoke("create-customer-portal-session", {
    body: { return_url, portal_flow },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const data = res.data as { url?: string; error?: string } | null;
  const errMsg = data?.error ?? res.error?.message ?? "Failed to open billing portal";
  if (res.error || data?.error) return { error: errMsg };
  if (!data?.url) return { error: "No portal URL returned" };
  return { url: data.url };
}

export interface StripeInvoiceRow {
  id: string;
  number: string | null;
  status: string | null;
  /** Invoice total (cents). */
  total: number;
  amount_paid: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export async function listStripeInvoices(): Promise<
  { invoices: StripeInvoiceRow[] } | { error: string }
> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: "Please sign in to continue" };
  }

  const res = await supabase.functions.invoke("list-stripe-invoices", {
    body: {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const data = res.data as { invoices?: StripeInvoiceRow[]; error?: string } | null;
  const errMsg = data?.error ?? res.error?.message ?? "Failed to load invoices";
  if (res.error || data?.error) return { error: errMsg };
  return { invoices: data?.invoices ?? [] };
}

export interface ChangePlanResult {
  ok: true;
  action: "upgraded" | "downgrade_scheduled";
  message: string;
  effective_date?: string;
  total_charged_usd?: string;
  integration_delta_usd?: string;
  proration_usd?: string;
  new_plan_id?: string;
}

export async function changePlan(
  newPlanId: string,
): Promise<ChangePlanResult | { error: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { error: "Please sign in to continue" };
  }

  const res = await supabase.functions.invoke("change-plan", {
    body: { new_plan_id: newPlanId },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const data = res.data as (ChangePlanResult & { error?: string }) | null;
  const errMsg = data?.error ?? res.error?.message ?? "Failed to change plan";
  if (res.error || data?.error) return { error: errMsg };
  if (!data?.ok) return { error: "Unexpected response from server" };
  return data as ChangePlanResult;
}

export async function getSubscription(): Promise<UserSubscription | null> {
  // Resolve the current user explicitly so the query always has a user_id filter,
  // avoiding timing edge-cases where auth.uid() isn't yet set in the RLS context.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return null;

  const { data, error } = await (supabase as any)
    .from("user_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserSubscription;
}

export function hasActiveSubscription(sub: UserSubscription | null): boolean {
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  // Keep OpenAlgo access for a 24h grace window after expiry.
  if (sub.current_period_end) {
    const graceEndMs = new Date(sub.current_period_end).getTime() + (24 * 60 * 60 * 1000);
    if (graceEndMs < Date.now()) return false;
  }
  return true;
}
