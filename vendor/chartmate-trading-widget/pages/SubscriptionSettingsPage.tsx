import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  CalendarDays,
  Check,
  CreditCard,
  ExternalLink,
  Gift,
  Loader2,
  Minus,
  Sparkles,
  XCircle,
  Zap,
  Shield,
  HelpCircle,
  Receipt,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSubscription } from "@/hooks/useSubscription";
import {
  isMidTierEligibleForProOnlyUpgrade,
  planAllowsAlgo,
  planAllowsAnalysis,
} from "@/lib/subscriptionEntitlements";
import {
  changePlan,
  createBillingPortalSession,
  hasActiveSubscription,
  listStripeInvoices,
  type BillingPortalFlow,
  type StripeInvoiceRow,
} from "@/services/stripeService";
import { cn } from "@/lib/utils";
import { planIdToDisplayName } from "@/lib/referredUserPlanDisplay";
import { PRICING_PLANS, type PricingPlan } from "@/constants/pricing";

function planLabel(planId: string | undefined): string {
  if (!planId) return "No active plan";
  return planIdToDisplayName(planId);
}

function planPriceHint(planId: string | undefined): string {
  const fromCatalog = PRICING_PLANS.find((p) => p.id === planId);
  if (fromCatalog) {
    return `$${fromCatalog.integrationFee} setup + $${fromCatalog.price}/mo (after 30 days)`;
  }
  switch (planId) {
    case "botIntegration":
      return "Legacy — Bot tier";
    case "probIntelligence":
      return "Legacy — Probability tier";
    case "proPlan":
      return "Legacy — Pro tier";
    default:
      return "";
  }
}

function FeatureTile({
  included,
  title,
  description,
}: {
  included: boolean;
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-4 transition-colors",
        included
          ? "border-primary/25 bg-gradient-to-br from-primary/[0.08] via-transparent to-teal-500/[0.04] hover:border-primary/35"
          : "border-border/60 bg-muted/10 opacity-80",
      )}
    >
      <div className="flex gap-3.5">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-inner",
            included
              ? "bg-primary/20 text-primary ring-1 ring-primary/30"
              : "bg-muted/60 text-muted-foreground",
          )}
        >
          {included ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <Minus className="h-5 w-5" />}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground leading-snug">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
      {included && (
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      )}
    </div>
  );
}

function formatInvoiceAmount(cents: number, currency: string): string {
  const sym = (cents / 100).toFixed(2);
  return `${sym} ${currency.toUpperCase()}`;
}

/** Tier order for the three active plans */
const PLAN_TIER: Record<string, number> = {
  starterPlan: 0,
  growthPlan: 1,
  professionalPlan: 2,
};

export default function SubscriptionSettingsPage() {
  const { subscription, loading, manualFullAccessBypass, hasBillingIssue } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);
  const [invoices, setInvoices] = useState<StripeInvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);

  // Change-plan dialog state
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [changePlanTarget, setChangePlanTarget] = useState<PricingPlan | null>(null);
  const [changePlanLoading, setChangePlanLoading] = useState(false);
  const [changePlanResult, setChangePlanResult] = useState<string | null>(null);

  const paid = hasActiveSubscription(subscription);
  const planId = subscription?.plan_id;
  const showProPortalCta = paid && isMidTierEligibleForProOnlyUpgrade(planId);
  const periodEnd = subscription?.current_period_end
    ? format(new Date(subscription.current_period_end), "PPP")
    : null;
  const pendingDowngrade = subscription?.pending_plan_change
    ? PRICING_PLANS.find((p) => p.id === subscription.pending_plan_change) ?? null
    : null;

  const manualStripeProfile = Boolean(
    subscription?.stripe_customer_id?.startsWith("cus_manual_exc_"),
  );
  const noBillingPortal = manualFullAccessBypass || manualStripeProfile;
  const stripeReady = Boolean(
    subscription?.stripe_customer_id && !manualStripeProfile && !manualFullAccessBypass,
  );
  const hasStripeSub = Boolean(subscription?.stripe_subscription_id?.startsWith("sub_"));

  useEffect(() => {
    if (!stripeReady || loading) return;
    let cancelled = false;
    (async () => {
      setInvoicesLoading(true);
      setInvoicesError(null);
      const r = await listStripeInvoices();
      if (cancelled) return;
      setInvoicesLoading(false);
      if ("error" in r) {
        setInvoicesError(r.error);
        setInvoices([]);
        return;
      }
      setInvoices(r.invoices);
    })();
    return () => {
      cancelled = true;
    };
  }, [stripeReady, loading, subscription?.stripe_customer_id]);

  const openChangePlanDialog = (target: PricingPlan) => {
    setChangePlanTarget(target);
    setChangePlanResult(null);
    setChangePlanOpen(true);
  };

  const confirmChangePlan = async () => {
    if (!changePlanTarget) return;
    setChangePlanLoading(true);
    const result = await changePlan(changePlanTarget.id);
    setChangePlanLoading(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setChangePlanResult(result.message);
    toast.success(
      result.action === "upgraded"
        ? `Upgraded to ${changePlanTarget.name}!`
        : `Downgrade to ${changePlanTarget.name} scheduled.`,
    );
  };

  const openBillingSession = async (portal_flow: BillingPortalFlow = "default") => {
    setPortalLoading(true);
    const r = await createBillingPortalSession({
      return_url: `${window.location.origin}/subscription`,
      portal_flow,
    });
    setPortalLoading(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    window.location.href = r.url;
  };

  return (
    <DashboardShellLayout>
      <div className="relative mx-auto max-w-5xl pb-16 pt-14 lg:pt-6">
        {/* ambient */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-none opacity-40"
          aria-hidden
        >
          <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-primary/20 blur-[100px]" />
          <div className="absolute right-0 top-48 h-64 w-64 rounded-full bg-teal-500/15 blur-[90px]" />
        </div>

        <header className="mb-10 space-y-4 max-lg:hidden">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary shadow-sm shadow-primary/10">
            <Sparkles className="h-3.5 w-3.5" />
            Billing & access
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Subscription{" "}
              <span className="bg-gradient-to-r from-primary via-teal-400 to-cyan-300 bg-clip-text text-transparent">
                & billing
              </span>
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Your plan controls analysis, paper trading, and live algo. Manage payment and renewal
              securely through Stripe whenever you need to.
            </p>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="space-y-6">
            <Card className="overflow-hidden border border-white/10 bg-zinc-950/60 shadow-2xl shadow-black/40 ring-1 ring-primary/10 backdrop-blur-sm">
              <CardHeader className="relative space-y-0 border-b border-white/5 bg-gradient-to-br from-zinc-900/90 via-zinc-950 to-primary/[0.07] px-6 py-8 sm:px-8">
                <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/4 -translate-y-1/4 rounded-full bg-primary/10 blur-3xl" />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-4">
                    <CardTitle className="flex items-center gap-2.5 text-base font-semibold text-muted-foreground">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                        <CreditCard className="h-5 w-5" />
                      </span>
                      Current plan
                    </CardTitle>
                    {loading ? (
                      <div className="space-y-3 pt-1">
                        <Skeleton className="h-8 w-56 rounded-lg" />
                        <Skeleton className="h-4 w-full max-w-md rounded-md" />
                      </div>
                    ) : paid ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            {planLabel(planId)}
                          </span>
                          {planPriceHint(planId) && (
                            <Badge className="border-0 bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/25">
                              {planPriceHint(planId)}
                            </Badge>
                          )}
                          {noBillingPortal && (
                            <Badge
                              variant="outline"
                              className="gap-1.5 border-primary/40 bg-primary/10 font-medium text-primary"
                            >
                              <Gift className="h-3.5 w-3.5" />
                              Complimentary
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                          Your active subscription controls which trading and analysis features are
                          unlocked. Plans renew monthly through Stripe unless you cancel.
                        </CardDescription>
                      </>
                    ) : hasBillingIssue && subscription ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                            {planLabel(planId)}
                          </span>
                          <Badge className="border-0 bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            Past due — access paused
                          </Badge>
                        </div>
                        <CardDescription className="max-w-lg text-sm leading-relaxed text-muted-foreground">
                          Update your payment method in Stripe&apos;s billing portal. When the charge
                          succeeds, access turns back on automatically.
                        </CardDescription>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-semibold text-foreground">No active subscription</p>
                        <CardDescription className="max-w-lg text-sm leading-relaxed">
                          Subscribe to unlock AI analysis, paper trading, and live algo execution on
                          Starter, Growth, or Pro. Pick a plan that matches how you trade.
                        </CardDescription>
                      </>
                    )}
                  </div>
                  {!loading && (paid || (hasBillingIssue && subscription)) && !noBillingPortal && (
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => openBillingSession("default")}
                      disabled={portalLoading}
                      className={`shrink-0 gap-2 rounded-xl px-6 font-semibold shadow-lg transition ${
                        hasBillingIssue && !paid
                          ? "bg-amber-600 text-white shadow-amber-900/30 hover:bg-amber-500"
                          : "bg-primary text-primary-foreground shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/35"
                      }`}
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      Open billing portal
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-6 px-6 py-8 sm:px-8">
                {!loading && hasBillingIssue && subscription && !noBillingPortal && (
                  <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-6 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Payment failed or past due</p>
                          <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
                            Stripe could not charge your card for the latest renewal. Premium access is
                            paused until payment succeeds. Open the billing portal to update your
                            payment method or retry.
                          </p>
                          {subscription.payment_failed_at ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Last failed charge notice:{" "}
                              {format(new Date(subscription.payment_failed_at), "PPp")}
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs text-muted-foreground">
                            Plan on file: <span className="font-medium text-foreground">{planLabel(planId)}</span>
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        onClick={() => openBillingSession("payment_method_update")}
                        disabled={portalLoading}
                        className="shrink-0 gap-2 rounded-xl bg-amber-600 px-6 font-semibold text-white hover:bg-amber-500"
                      >
                        {portalLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                        Fix payment in portal
                      </Button>
                    </div>
                  </div>
                )}

                {!loading && paid && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FeatureTile
                        included={planAllowsAnalysis(planId)}
                        title="AI analysis & paper hub"
                        description="New Analysis, saved analyses, intraday, and paper-trade performance — on Probability and Pro."
                      />
                      <FeatureTile
                        included={planAllowsAlgo(planId)}
                        title="Live algo / OpenAlgo"
                        description="Broker-linked execution and the live trading dashboard — included on all paid tiers (legacy Probability-only plans excepted)."
                      />
                    </div>

                    {periodEnd && (
                      <div className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.12] via-primary/[0.06] to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary ring-1 ring-primary/30">
                            <CalendarDays className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary/90">
                              Billing period
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              Renews or ends on{" "}
                              <span className="text-primary">{periodEnd}</span>
                            </p>
                            {subscription?.cancel_at_period_end ? (
                              <p className="mt-2 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
                                Auto-renew is off — you keep access until that date unless you turn
                                renewal back on in the portal.
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="hidden h-10 w-px shrink-0 bg-primary/20 sm:block" />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground sm:max-w-[200px] sm:text-right">
                          <Shield className="h-4 w-4 shrink-0 text-primary/70" />
                          <span>Payments and cards are managed securely by Stripe.</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!loading && !paid && !hasBillingIssue && (
                  <div className="rounded-2xl border border-dashed border-primary/35 bg-gradient-to-br from-primary/[0.08] to-transparent p-8 text-center sm:text-left">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary ring-1 ring-primary/30 sm:mx-0">
                      <Bot className="h-7 w-7" />
                    </div>
                    <p className="text-base font-semibold text-foreground">Ready when you are</p>
                    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground sm:mx-0">
                      Plans bill monthly through Stripe with auto-renewal. Use the billing portal anytime
                      to change plans, cancel auto-renew, or update your card.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {paid && noBillingPortal && (
                    <div className="flex w-full items-start gap-3 rounded-2xl border border-border/80 bg-muted/20 p-4 text-sm text-muted-foreground">
                      <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <p>
                        This account uses{" "}
                        <span className="font-semibold text-foreground">complimentary</span> access.
                        There is no Stripe customer portal — billing is managed internally.
                      </p>
                    </div>
                  )}
                  {!paid && !hasBillingIssue && (
                    <>
                      <Button type="button" size="lg" asChild className="gap-2 rounded-xl font-semibold">
                        <Link to="/pricing">
                          View plans
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button type="button" variant="outline" size="lg" asChild className="rounded-xl">
                        <Link to="/home">Back to dashboard</Link>
                      </Button>
                    </>
                  )}
                  {!paid && hasBillingIssue && subscription && !noBillingPortal && (
                    <Button type="button" variant="outline" size="lg" asChild className="rounded-xl">
                      <Link to="/home">Back to dashboard</Link>
                    </Button>
                  )}
                </div>

                {showProPortalCta && !noBillingPortal && (
                  <div className="rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                      <Zap className="h-4 w-4 text-primary" />
                      Upgrade to Pro ($399 setup + $129/mo after 30 days)
                    </span>
                    <p className="mt-2">
                      You&apos;re on Starter or Growth (or a legacy mid-tier). In the billing portal,
                      switch to Pro for unlimited strategies. Stripe applies proration
                      or schedules the change for the next period depending on your{" "}
                      <strong className="text-foreground">Stripe Customer Portal</strong> and product
                      settings.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {!loading && stripeReady && (
              <Card className="overflow-hidden border border-white/10 bg-zinc-950/50 shadow-xl shadow-black/30 ring-1 ring-white/5">
                <CardHeader className="border-b border-white/5 bg-zinc-900/40 px-6 py-6 sm:px-8">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                        <Receipt className="h-5 w-5" />
                      </span>
                      <div>
                        <CardTitle className="text-lg font-semibold">Billing actions & invoices</CardTitle>
                        <CardDescription className="mt-1 max-w-xl text-sm leading-relaxed">
                          These buttons open Stripe&apos;s secure Customer Portal (your configured{" "}
                          <span className="font-medium text-foreground">bpc_</span> flow). Plan and
                          payment changes sync back to ChartMate via webhooks.
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-8 px-6 py-8 sm:px-8">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 justify-start gap-2 rounded-xl border-white/15 bg-zinc-900/30 py-3 text-left font-medium"
                      disabled={portalLoading}
                      onClick={() => openBillingSession("default")}
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
                      )}
                      <span>
                        <span className="block text-sm font-semibold">Full billing portal</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          Invoices, history, and all portal options
                        </span>
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 justify-start gap-2 rounded-xl border-white/15 bg-zinc-900/30 py-3 text-left font-medium"
                      disabled={portalLoading}
                      onClick={() => openBillingSession("payment_method_update")}
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <CreditCard className="h-4 w-4 shrink-0 text-primary" />
                      )}
                      <span>
                        <span className="block text-sm font-semibold">Update payment method</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          Add or replace the card on file
                        </span>
                      </span>
                    </Button>
                    {/* ── Custom plan-change buttons ── */}
                    {hasStripeSub && paid && planId && PLAN_TIER[planId] !== undefined && (
                      <>
                        {PRICING_PLANS.filter((p) => p.id !== planId).map((p) => {
                          const isUp = (PLAN_TIER[p.id] ?? -1) > (PLAN_TIER[planId] ?? -1);
                          const isPendingTarget = pendingDowngrade?.id === p.id;
                          return (
                            <Button
                              key={p.id}
                              type="button"
                              variant="outline"
                              disabled={changePlanLoading || isPendingTarget}
                              className={cn(
                                "h-auto min-h-11 justify-start gap-2 rounded-xl py-3 text-left font-medium",
                                isUp
                                  ? "border-teal-500/30 bg-teal-950/20 hover:bg-teal-950/40"
                                  : "border-white/15 bg-zinc-900/30",
                              )}
                              onClick={() => openChangePlanDialog(p)}
                            >
                              {isUp ? (
                                <ArrowUp className="h-4 w-4 shrink-0 text-teal-400" />
                              ) : (
                                <ArrowDown className="h-4 w-4 shrink-0 text-zinc-400" />
                              )}
                              <span>
                                <span className="block text-sm font-semibold">
                                  {isUp ? "Upgrade" : "Downgrade"} to {p.name}
                                </span>
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {isUp
                                    ? `$${p.integrationFee} setup delta + prorated monthly — charged now`
                                    : isPendingTarget
                                    ? "Already scheduled for next renewal"
                                    : `$${p.price}/mo — starts at next renewal`}
                                </span>
                              </span>
                            </Button>
                          );
                        })}
                      </>
                    )}
                    {/* Legacy / non-catalog plans: fall back to portal */}
                    {hasStripeSub && paid && (!planId || PLAN_TIER[planId] === undefined) && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-auto min-h-11 justify-start gap-2 rounded-xl border-white/15 bg-zinc-900/30 py-3 text-left font-medium"
                        disabled={portalLoading}
                        onClick={() => openBillingSession("subscription_update")}
                      >
                        {portalLoading ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4 shrink-0 text-primary" />
                        )}
                        <span>
                          <span className="block text-sm font-semibold">Change plan</span>
                          <span className="block text-xs font-normal text-muted-foreground">
                            Upgrade or downgrade via Stripe portal
                          </span>
                        </span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 justify-start gap-2 rounded-xl border-amber-500/25 bg-amber-500/5 py-3 text-left font-medium text-amber-800 hover:bg-amber-500/10 dark:text-amber-200"
                      disabled={portalLoading || !hasStripeSub}
                      onClick={() => openBillingSession("subscription_cancel")}
                      title={!hasStripeSub ? "No Stripe subscription id on file" : undefined}
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0" />
                      )}
                      <span>
                        <span className="block text-sm font-semibold">Cancel subscription</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          Stripe-hosted cancel / end-of-period flow
                        </span>
                      </span>
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">Recent invoices</p>
                    {invoicesLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-10 w-full rounded-lg" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </div>
                    ) : invoicesError ? (
                      <p className="text-sm text-destructive">{invoicesError}</p>
                    ) : invoices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No invoices yet, or they are not available for this customer.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="w-[120px]"> </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="text-muted-foreground">
                                {inv.created
                                  ? format(new Date(inv.created * 1000), "PP")
                                  : "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {inv.number ?? inv.id.slice(-8)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs capitalize">
                                  {inv.status ?? "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatInvoiceAmount(inv.total || inv.amount_paid, inv.currency)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  {inv.hosted_invoice_url ? (
                                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                                      <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                                        View
                                      </a>
                                    </Button>
                                  ) : null}
                                  {inv.invoice_pdf ? (
                                    <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" asChild>
                                      <a href={inv.invoice_pdf} target="_blank" rel="noreferrer">
                                        <FileDown className="h-3.5 w-3.5" />
                                        PDF
                                      </a>
                                    </Button>
                                  ) : null}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {!loading && !paid && !hasBillingIssue && (
              <p className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/80" />
                <span>
                  Seeing locked items in the sidebar? They unlock once an active subscription is on
                  your account and the app has refreshed. If you just paid, wait a few seconds or
                  refresh the page.
                </span>
              </p>
            )}
          </div>

          <aside className="lg:sticky lg:top-6">
            <Card className="overflow-hidden border border-white/10 bg-zinc-950/50 shadow-xl shadow-black/30 ring-1 ring-white/5">
              <CardHeader className="border-b border-white/5 bg-zinc-900/40 px-5 py-5">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle className="text-base font-semibold">How billing works</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      Summary — exact behaviour depends on your Stripe Customer Portal.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 pb-2 pt-2">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="upgrade" className="border-border/50 px-3">
                    <AccordionTrigger className="py-4 text-sm font-semibold hover:no-underline hover:text-primary">
                      Upgrades — immediate
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        Upgrades take effect <strong className="text-foreground">immediately</strong>.
                        You are charged two amounts in a single invoice today:
                      </p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>
                          <strong className="text-foreground">Integration delta</strong> — new plan&apos;s
                          setup fee minus what you have already paid (e.g. Starter → Pro: $399 − $149 = $250).
                        </li>
                        <li>
                          <strong className="text-foreground">Monthly proration</strong> — the monthly
                          rate difference × days remaining in your current billing cycle ÷ 30.
                        </li>
                      </ul>
                      <p>
                        Your next monthly bill stays on its original date but at the new rate.
                        New features unlock right away.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="downgrade" className="border-border/50 px-3">
                    <AccordionTrigger className="py-4 text-sm font-semibold hover:no-underline hover:text-primary">
                      Downgrades — next renewal
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        Downgrades are <strong className="text-foreground">scheduled</strong>, not
                        instant. No charge or refund today — you keep your current plan&apos;s full
                        features until the period ends.
                      </p>
                      <p>
                        At your next renewal the lower monthly rate kicks in automatically.
                        Integration fees are <strong className="text-foreground">non-refundable</strong>,
                        but if you upgrade again later you only pay the difference between plans.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="cancel" className="border-border/50 px-3">
                    <AccordionTrigger className="py-4 text-sm font-semibold hover:no-underline hover:text-primary">
                      Cancel & auto-renew
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2 pb-4 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        Use <strong className="text-foreground">Cancel subscription</strong> — it opens
                        Stripe&apos;s secure hosted cancel flow. You can turn off auto-renew or cancel
                        outright. Access continues until the end of the{" "}
                        <strong className="text-foreground">current paid period</strong>.
                      </p>
                      <p>
                        If a renewal payment fails, Stripe marks your subscription{" "}
                        <strong className="text-foreground">past_due</strong> and premium access is
                        paused until the card is updated.
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
      {/* ── Pending downgrade notice ── */}
      {pendingDowngrade && periodEnd && (
        <div className="mx-auto mt-4 max-w-5xl flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>
            <strong>Downgrade scheduled:</strong> You will move to{" "}
            <strong>{pendingDowngrade.name}</strong> (${pendingDowngrade.price}/mo) at your next
            renewal on <strong>{periodEnd}</strong>. You keep full access to your current plan until
            then. No refund is issued for the integration fee — if you upgrade again later, you only
            pay the difference.
          </span>
        </div>
      )}

      {/* ── Change plan confirmation dialog ── */}
      <Dialog
        open={changePlanOpen}
        onOpenChange={(open) => {
          if (!changePlanLoading) {
            setChangePlanOpen(open);
            if (!open) setChangePlanResult(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {changePlanTarget && (() => {
            const currentMeta = PRICING_PLANS.find((p) => p.id === planId);
            const isUp = (PLAN_TIER[changePlanTarget.id] ?? -1) > (PLAN_TIER[planId ?? ""] ?? -1);
            const integFee = subscription?.integration_fee_paid ?? 0;
            const integDelta = Math.max(0, changePlanTarget.integrationFee - integFee);
            const periodEndDate = subscription?.current_period_end
              ? new Date(subscription.current_period_end)
              : null;
            const daysLeft = periodEndDate
              ? Math.max(0, (periodEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : 0;
            const oldMonthly = currentMeta?.price ?? 0;
            const prorated = isUp
              ? Math.max(0, ((changePlanTarget.price - oldMonthly) / 30) * daysLeft)
              : 0;
            const totalNow = isUp ? integDelta + prorated : 0;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {isUp ? (
                      <ArrowUp className="h-5 w-5 text-teal-400" />
                    ) : (
                      <ArrowDown className="h-5 w-5 text-amber-400" />
                    )}
                    {isUp ? "Upgrade" : "Downgrade"} to {changePlanTarget.name}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                    {isUp ? (
                      <>
                        You will be charged{" "}
                        <strong className="text-foreground">${totalNow.toFixed(2)}</strong> immediately:
                        <ul className="mt-2 space-y-1 list-disc list-inside">
                          <li>
                            Integration fee delta:{" "}
                            <strong className="text-foreground">${integDelta.toFixed(2)}</strong>{" "}
                            <span className="text-xs">
                              (${changePlanTarget.integrationFee} − ${integFee.toFixed(2)} already paid)
                            </span>
                          </li>
                          <li>
                            Monthly proration for ~{Math.round(daysLeft)} days remaining:{" "}
                            <strong className="text-foreground">${prorated.toFixed(2)}</strong>
                          </li>
                        </ul>
                        <p className="mt-2">
                          Your next monthly bill will be{" "}
                          <strong className="text-foreground">${changePlanTarget.price}/mo</strong> and
                          features unlock immediately.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong className="text-foreground">No charge today.</strong> You keep{" "}
                          <strong className="text-foreground">{currentMeta?.name}</strong> features
                          until your current period ends on{" "}
                          <strong className="text-foreground">{periodEnd ?? "renewal date"}</strong>.
                        </p>
                        <p className="mt-2">
                          At renewal your plan switches to{" "}
                          <strong className="text-foreground">{changePlanTarget.name}</strong> and you
                          are charged{" "}
                          <strong className="text-foreground">${changePlanTarget.price}/mo</strong>.
                          Integration fees are non-refundable — if you upgrade again later you only
                          pay the difference.
                        </p>
                      </>
                    )}
                  </DialogDescription>
                </DialogHeader>

                {changePlanResult ? (
                  <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 px-4 py-3 text-sm text-teal-300">
                    {changePlanResult}
                  </div>
                ) : (
                  <DialogFooter className="mt-2">
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={changePlanLoading}
                      onClick={() => setChangePlanOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className={cn(
                        "rounded-xl font-semibold",
                        isUp
                          ? "bg-teal-500 text-black hover:bg-teal-400"
                          : "bg-amber-500 text-black hover:bg-amber-400",
                      )}
                      disabled={changePlanLoading}
                      onClick={confirmChangePlan}
                    >
                      {changePlanLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : isUp ? (
                        <ArrowUp className="mr-2 h-4 w-4" />
                      ) : (
                        <ArrowDown className="mr-2 h-4 w-4" />
                      )}
                      {isUp
                        ? `Confirm upgrade — pay $${totalNow.toFixed(2)} now`
                        : `Schedule downgrade at renewal`}
                    </Button>
                  </DialogFooter>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardShellLayout>
  );
}
