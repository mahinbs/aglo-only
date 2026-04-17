import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import BrokerSyncSection, { ALL_BROKERS } from "@/components/trading/BrokerSyncSection";
import BrokerPortfolioCard from "@/components/trading/BrokerPortfolioCard";
import { getTradingIntegration } from "@/services/openalgoIntegrationService";
import { planAllowsAlgo } from "@/lib/subscriptionEntitlements";
import {
  createBillingPortalSession,
  hasActiveSubscription,
  type UserSubscription,
} from "@/services/stripeService";

interface OnboardingForm {
  full_name: string;
  phone: string;
  broker: string;
  custom_broker: string;     // used when broker === "custom"
  broker_client_id: string;
  capital_amount: string;
  capital_currency: "INR" | "USD";
  risk_level: string;
  trade_type: string;
  trading_experience: string;
  preferred_timeframe: string;
  target_profit_pct: string;
  stop_loss_pct: string;
  max_drawdown_pct: string;
  leverage_preference: string;
  custom_leverage: string;
  trading_goal: string;
  trading_frequency: string;
  strategy_pref: string;
  custom_strategy: string;   // used when strategy_pref === "custom"
  risk_acknowledged: boolean;
  notes: string;
}

const EMPTY_FORM: OnboardingForm = {
  full_name: "",
  phone: "",
  broker: "",
  custom_broker: "",
  broker_client_id: "",
  capital_amount: "",
  capital_currency: "INR",
  risk_level: "medium",
  trade_type: "",
  trading_experience: "",
  preferred_timeframe: "",
  target_profit_pct: "",
  stop_loss_pct: "",
  max_drawdown_pct: "",
  leverage_preference: "",
  custom_leverage: "",
  trading_goal: "",
  trading_frequency: "",
  strategy_pref: "",
  custom_strategy: "",
  risk_acknowledged: false,
  notes: "",
};

const BROKERS = [
  ...ALL_BROKERS.map(b => ({ value: b.value, label: b.label })),
  { value: "custom", label: "Other / Not Listed" },
];

const STRATEGIES = [
  { value: "momentum", label: "Momentum Trading" },
  { value: "scalping", label: "Scalping" },
  { value: "swing", label: "Swing Trading" },
  { value: "intraday", label: "Intraday" },
  { value: "positional", label: "Positional" },
  { value: "options", label: "Options / F&O (Algo)" },
  { value: "custom", label: "Custom / Describe my own" },
];

const TRADE_TYPES = [
  { value: "stocks", label: "Stocks" },
  { value: "fno", label: "Futures & Options" },
  { value: "commodities", label: "Commodities" },
  { value: "currency", label: "Currency" },
  { value: "mixed", label: "Mixed" },
];

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner (< 1 year)" },
  { value: "intermediate", label: "Intermediate (1-3 years)" },
  { value: "advanced", label: "Advanced (3-5 years)" },
  { value: "expert", label: "Expert (5+ years)" },
];

const TIMEFRAMES = [
  { value: "intraday", label: "Intraday" },
  { value: "swing", label: "Swing (2-10 days)" },
  { value: "positional", label: "Positional (weeks+)" },
];

const LEVERAGE_PREFS = [
  { value: "none", label: "No leverage" },
  { value: "low", label: "Low (1x-2x)" },
  { value: "medium", label: "Medium (2x-5x)" },
  { value: "high", label: "High (5x+)" },
  { value: "custom", label: "Custom" },
];

const TRADING_GOALS = [
  { value: "growth", label: "Capital Growth" },
  { value: "income", label: "Regular Income" },
  { value: "both", label: "Both" },
];

const TRADING_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export default function AlgoOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFromPayment = searchParams.get("checkout") === "success";

  const [userId, setUserId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string>("premium");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [existingBroker, setExistingBroker] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState<OnboardingForm>(EMPTY_FORM);
  const [hasBrokerIntegration, setHasBrokerIntegration] = useState(false);
  const [tierGate, setTierGate] = useState<"ok" | "prob" | "unpaid">("ok");
  const [portalBusy, setPortalBusy] = useState(false);

  const checkBrokerIntegration = async () => {
    const { data } = await getTradingIntegration();
    const connected =
      !!data?.is_active &&
      !!data?.broker &&
      !!data?.openalgo_api_key?.trim() &&
      !!data?.api_key_encrypted?.trim();
    setHasBrokerIntegration(connected);
  };

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("Please sign in to continue.");
        navigate("/auth?redirect=/algo-setup");
        return;
      }

      setUserId(session.user.id);

      // Grab plan from user_subscriptions — need status + current_period_end for hasActiveSubscription
      const { data: sub } = await (supabase as any)
        .from("user_subscriptions")
        .select("plan_id, status, current_period_end, stripe_customer_id, stripe_subscription_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (sub?.plan_id) setPlanId(sub.plan_id);

      const subTyped = sub as UserSubscription | null;
      if (!hasActiveSubscription(subTyped)) {
        setTierGate("unpaid");
      } else if (subTyped?.plan_id === "probIntelligence") {
        setTierGate("prob");
      } else if (!planAllowsAlgo(subTyped?.plan_id)) {
        setTierGate("unpaid");
      } else {
        setTierGate("ok");
      }

      // Pre-fill name from profile if available
      const name = session.user.user_metadata?.full_name ?? session.user.email?.split("@")[0] ?? "";
      setForm((f) => ({ ...f, full_name: name }));

      // Check if already submitted
      const { data: existing } = await (supabase as any)
        .from("algo_onboarding")
        .select("id,status,broker")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (existing) {
        // If already provisioned/active, this page should not be shown.
        if (existing.status === "provisioned" || existing.status === "active") {
          navigate("/trading-dashboard", { replace: true });
          return;
        }
        setAlreadySubmitted(true);
        setExistingStatus(existing.status ?? null);
        setExistingBroker(existing.broker ?? null);
      }

      await checkBrokerIntegration();
      setChecking(false);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!(done || alreadySubmitted)) return;
    const status = done ? "pending" : (existingStatus ?? "pending");
    const isProvisioned = status === "provisioned" || status === "active";
    if (!isProvisioned) return;

    const id = setInterval(() => {
      checkBrokerIntegration();
    }, 10_000);
    return () => clearInterval(id);
  }, [done, alreadySubmitted, existingStatus]);

  const set = (k: keyof OnboardingForm, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const effectiveBroker = form.broker === "custom"
      ? (form.custom_broker.trim() || "custom")
      : form.broker;
    const effectiveStrategy = form.strategy_pref === "custom"
      ? null
      : (form.strategy_pref || null);
    const customStrategyText = form.strategy_pref === "custom"
      ? form.custom_strategy.trim()
      : null;

    if (!form.full_name.trim() || !effectiveBroker) {
      toast.error("Please fill in required fields (name and broker).");
      return;
    }

    if (
      !form.trade_type ||
      !form.trading_experience ||
      !form.preferred_timeframe ||
      !form.target_profit_pct ||
      !form.stop_loss_pct ||
      !form.leverage_preference ||
      !form.trading_goal ||
      !form.trading_frequency
    ) {
      toast.error("Please complete all required trading profile fields.");
      return;
    }

    if (!form.risk_acknowledged) {
      toast.error("Please acknowledge the risk disclosure to continue.");
      return;
    }

    setSubmitting(true);

    const { error } = await (supabase as any).from("algo_onboarding").insert({
      user_id:          userId,
      full_name:        form.full_name.trim(),
      phone:            form.phone.trim() || null,
      broker:           effectiveBroker,
      broker_client_id: form.broker_client_id.trim() || null,
      capital_amount:   form.capital_amount ? parseFloat(form.capital_amount) : null,
      capital_currency: form.capital_currency,
      risk_level:       form.risk_level,
      trade_type:       form.trade_type || null,
      trading_experience: form.trading_experience || null,
      preferred_timeframe: form.preferred_timeframe || null,
      target_profit_pct: form.target_profit_pct ? parseFloat(form.target_profit_pct) : null,
      stop_loss_pct:    form.stop_loss_pct ? parseFloat(form.stop_loss_pct) : null,
      max_drawdown_pct: form.max_drawdown_pct ? parseFloat(form.max_drawdown_pct) : null,
      leverage_preference: form.leverage_preference || null,
      custom_leverage:  form.leverage_preference === "custom" ? (form.custom_leverage.trim() || null) : null,
      trading_goal:     form.trading_goal || null,
      trading_frequency: form.trading_frequency || null,
      strategy_pref:    effectiveStrategy,
      custom_strategy:  customStrategyText,
      risk_acknowledged: form.risk_acknowledged,
      notes:            form.notes.trim() || null,
      plan_id:          planId,
    });

    setSubmitting(false);

    if (error) {
      toast.error("Failed to save your details. Please try again.");
      console.error(error);
      return;
    }

    setDone(true);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
      </div>
    );
  }

  if (tierGate === "prob") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="text-xl font-black">Live algo is not on your current plan</CardTitle>
            <CardDescription className="text-zinc-400">
              Probability ($99) includes detailed analysis and paper trading. OpenAlgo live execution is
              included on <strong className="text-zinc-200">Bot ($49)</strong> or{" "}
              <strong className="text-zinc-200">Pro ($129)</strong>. Upgrade to{" "}
              <strong className="text-teal-400">Pro</strong> in billing to get both — Stripe charges only
              the prorated difference when configured in the portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold"
              disabled={portalBusy}
              onClick={async () => {
                setPortalBusy(true);
                const r = await createBillingPortalSession();
                setPortalBusy(false);
                if ("error" in r) {
                  toast.error(r.error);
                  return;
                }
                window.location.href = r.url;
              }}
            >
              {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open billing portal"}
            </Button>
            <Button variant="outline" className="border-zinc-600" onClick={() => navigate("/subscription")}>
              Subscription help
            </Button>
            <Button variant="ghost" className="text-zinc-400" onClick={() => navigate("/home")}>
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tierGate === "unpaid") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg bg-zinc-900 border-zinc-800 text-white">
          <CardHeader>
            <CardTitle className="text-xl font-black">Subscribe to use Algo setup</CardTitle>
            <CardDescription className="text-zinc-400">
              OpenAlgo onboarding is for <strong className="text-zinc-200">Bot</strong> or{" "}
              <strong className="text-zinc-200">Pro</strong> subscribers. Choose a plan to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button className="bg-teal-500 hover:bg-teal-400 text-black font-bold" onClick={() => navigate("/pricing?feature=algo")}>
              View plans
            </Button>
            <Button variant="outline" className="border-zinc-600" onClick={() => navigate("/home")}>
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done || alreadySubmitted) {
    const status = done ? "pending" : (existingStatus ?? "pending");
    const broker = existingBroker ?? "other";
    const isProvisioned = status === "provisioned" || status === "active";

    const statusTone =
      status === "active"
        ? "bg-green-500/10 text-green-300 border-green-500/30"
        : status === "provisioned"
          ? "bg-teal-500/10 text-teal-300 border-teal-500/30"
          : "bg-amber-500/10 text-amber-300 border-amber-500/30";
    const statusLabel =
      status === "active"
        ? "Active"
        : status === "provisioned"
          ? "Provisioned — connect your broker below"
          : "Pending setup (24h)";

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-teal-500/10 p-6 border border-teal-500/30">
              <CheckCircle2 className="h-12 w-12 text-teal-400" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                {done ? "You're all set!" : "Already submitted"}
              </h1>
              <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                {isProvisioned
                  ? "Your algo trading account is ready. Connect your broker below to start placing live orders."
                  : done
                    ? "Our team will review and activate your algo trading account within 24 hours. You'll be notified once approved."
                    : "Your form has been submitted. Our team will activate your algo trading account within 24 hours. Live trading dashboard unlocks after approval."}
              </p>
            </div>
            <div className={`text-xs font-semibold px-4 py-2 rounded-full border ${statusTone}`}>
              Onboarding status: {statusLabel}
            </div>
            {!isProvisioned && (
              <div className="flex items-center gap-1 text-xs text-amber-400 border border-amber-500/30 bg-amber-500/10 rounded-full px-4 py-2">
                <Zap className="h-3.5 w-3.5 mr-1" />
                Our team will activate your account within 24 hours
              </div>
            )}
          </div>

          {/* Broker sync + live portfolio once provisioned */}
          {isProvisioned && (
            <>
              <BrokerSyncSection broker={broker} />
              {hasBrokerIntegration ? (
                <BrokerPortfolioCard />
              ) : (
                <div className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
                  Connect your broker above to load portfolio, holdings, positions and order controls.
                </div>
              )}
            </>
          )}

          {isProvisioned ? (
            <Button
              onClick={() => navigate("/trading-dashboard")}
              disabled={!hasBrokerIntegration}
              className="w-full bg-teal-500 hover:bg-teal-400 text-black font-bold px-8 rounded-xl"
            >
              {!hasBrokerIntegration ? "Connect Broker to Continue" : "Go to Trading Dashboard"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              disabled
              className="w-full bg-zinc-700 text-zinc-400 font-bold px-8 rounded-xl cursor-not-allowed"
            >
              Awaiting admin approval…
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {isFromPayment && (
          <div className="mb-6 flex items-center gap-3 bg-teal-500/10 border border-teal-500/30 rounded-xl px-4 py-3">
            <CheckCircle2 className="h-5 w-5 text-teal-400 shrink-0" />
            <p className="text-teal-300 text-sm font-medium">
              Payment successful! Complete this form so our team can activate your algo trading account.
            </p>
          </div>
        )}

        <Card className="bg-zinc-900 border-zinc-800 text-white">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="rounded-lg bg-teal-500/10 p-2 border border-teal-500/30">
                <TrendingUp className="h-5 w-5 text-teal-400" />
              </div>
              <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/40 text-xs">
                Algo Trade Setup
              </Badge>
            </div>
            <CardTitle className="text-xl font-black">OpenAlgo Onboarding</CardTitle>
            <CardDescription className="text-zinc-400 text-sm">
              Fill in your details below. We'll configure your OpenAlgo account and send you the API credentials via email within 24 hours.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">
                  Full Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="Your full name"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  required
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Phone Number</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>

              {/* Broker */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">
                  Broker <span className="text-red-400">*</span>
                </Label>
                <Select value={form.broker} onValueChange={(v) => set("broker", v)} required>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select your broker" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white max-h-64 overflow-y-auto">
                    {BROKERS.map((b) => (
                      <SelectItem key={b.value} value={b.value} className="focus:bg-zinc-700">
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.broker === "custom" && (
                  <Input
                    value={form.custom_broker}
                    onChange={(e) => set("custom_broker", e.target.value)}
                    placeholder="Enter your broker name"
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 mt-2"
                    autoFocus
                  />
                )}
              </div>

              {/* Broker Client ID — optional */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm flex items-center justify-between">
                  Broker Client ID
                  <span className="text-zinc-600 text-xs font-normal">optional — can share later</span>
                </Label>
                <Input
                  value={form.broker_client_id}
                  onChange={(e) => set("broker_client_id", e.target.value)}
                  placeholder="e.g. AB1234 (your broker's client/user ID)"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                />
              </div>

              {/* Capital with currency toggle + Risk */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">Trading Capital</Label>
                  <div className="flex gap-2">
                    {/* Currency toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-zinc-700 shrink-0">
                      {(["INR", "USD"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => set("capital_currency", c)}
                          className={`px-2.5 py-2 text-xs font-bold transition-colors ${
                            form.capital_currency === c
                              ? "bg-teal-600 text-white"
                              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                          }`}
                        >
                          {c === "INR" ? "₹" : "$"}
                        </button>
                      ))}
                    </div>
                    <Input
                      type="number"
                      value={form.capital_amount}
                      onChange={(e) => set("capital_amount", e.target.value)}
                      placeholder={form.capital_currency === "INR" ? "e.g. 100000" : "e.g. 5000"}
                      min={0}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-600">
                    {form.capital_currency === "INR" ? "Amount in Indian Rupees" : "Amount in US Dollars"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">Risk Level</Label>
                  <Select value={form.risk_level} onValueChange={(v) => set("risk_level", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectItem value="low" className="focus:bg-zinc-700">Low</SelectItem>
                      <SelectItem value="medium" className="focus:bg-zinc-700">Medium</SelectItem>
                      <SelectItem value="high" className="focus:bg-zinc-700">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Strategy */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">
                    Trade Type <span className="text-red-400">*</span>
                  </Label>
                  <Select value={form.trade_type} onValueChange={(v) => set("trade_type", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select trade type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      {TRADE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="focus:bg-zinc-700">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">
                    Trading Experience <span className="text-red-400">*</span>
                  </Label>
                  <Select value={form.trading_experience} onValueChange={(v) => set("trading_experience", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select experience" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      {EXPERIENCE_LEVELS.map((e) => (
                        <SelectItem key={e.value} value={e.value} className="focus:bg-zinc-700">{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">
                    Preferred Timeframe <span className="text-red-400">*</span>
                  </Label>
                  <Select value={form.preferred_timeframe} onValueChange={(v) => set("preferred_timeframe", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select timeframe" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      {TIMEFRAMES.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="focus:bg-zinc-700">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">
                    Trading Frequency <span className="text-red-400">*</span>
                  </Label>
                  <Select value={form.trading_frequency} onValueChange={(v) => set("trading_frequency", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      {TRADING_FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value} className="focus:bg-zinc-700">{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">
                    Target Profit (%) <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    type="number"
                    value={form.target_profit_pct}
                    onChange={(e) => set("target_profit_pct", e.target.value)}
                    placeholder="e.g. 10"
                    min={0}
                    max={100}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">
                    Stop Loss (%) <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    type="number"
                    value={form.stop_loss_pct}
                    onChange={(e) => set("stop_loss_pct", e.target.value)}
                    placeholder="e.g. 5"
                    min={0}
                    max={100}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">Max Drawdown (%)</Label>
                  <Input
                    type="number"
                    value={form.max_drawdown_pct}
                    onChange={(e) => set("max_drawdown_pct", e.target.value)}
                    placeholder="e.g. 15"
                    min={0}
                    max={100}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">
                    Leverage Preference <span className="text-red-400">*</span>
                  </Label>
                  <Select value={form.leverage_preference} onValueChange={(v) => set("leverage_preference", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select leverage" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      {LEVERAGE_PREFS.map((l) => (
                        <SelectItem key={l.value} value={l.value} className="focus:bg-zinc-700">{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.leverage_preference === "custom" && (
                    <Input
                      value={form.custom_leverage}
                      onChange={(e) => set("custom_leverage", e.target.value)}
                      placeholder="e.g. 3x"
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 mt-2"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300 text-sm">
                    Trading Goal <span className="text-red-400">*</span>
                  </Label>
                  <Select value={form.trading_goal} onValueChange={(v) => set("trading_goal", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select goal" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                      {TRADING_GOALS.map((g) => (
                        <SelectItem key={g.value} value={g.value} className="focus:bg-zinc-700">{g.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Strategy */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Preferred Strategy</Label>
                <Select value={form.strategy_pref} onValueChange={(v) => set("strategy_pref", v)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Choose a strategy (optional)" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                    {STRATEGIES.map((s) => (
                      <SelectItem key={s.value} value={s.value} className="focus:bg-zinc-700">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.strategy_pref === "custom" && (
                  <Textarea
                    value={form.custom_strategy}
                    onChange={(e) => set("custom_strategy", e.target.value)}
                    placeholder="Describe your strategy in detail — entry rules, exit rules, timeframe, instruments, indicators…"
                    rows={3}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 resize-none mt-2"
                  />
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Additional Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Any specific requirements or questions for our team..."
                  rows={3}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
                />
              </div>

              {/* Risk acknowledgement */}
              <label className="flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/40 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.risk_acknowledged}
                  onChange={(e) => set("risk_acknowledged", e.target.checked)}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    I acknowledge trading risk <span className="text-red-400">*</span>
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    I understand losses can happen, markets are volatile, and I am responsible for final trade decisions.
                  </p>
                </div>
              </label>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full py-5 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    Submit & Activate Algo Access
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>

              <p className="text-xs text-zinc-500 text-center">
                After submission our team provisions your OpenAlgo account (within 24h). Your Place Order button is already unlocked.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
