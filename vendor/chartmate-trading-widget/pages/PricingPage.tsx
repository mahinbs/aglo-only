import { Helmet } from "react-helmet-async";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import AiPredictionHeader from "@/components/landingpage/mainlandingpage/AiPredictionHeader";
import AiPredictionFooter from "@/components/landingpage/mainlandingpage/AiPredictionFooter";
import { TradingSmartPricingMatrix } from "@/components/landingpage/TradingSmartPricingMatrix";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { isAnalysisExceptionEmail } from "@/lib/manualSubscriptionBypass";

const PricingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { loading: subLoading, hasAnalysisAccess, hasAlgoAccess } = useSubscription();

  useEffect(() => {
    if (subLoading) return;
    const f = searchParams.get("feature");

    if (user?.id && f === "analysis" && hasAnalysisAccess) {
      navigate(
        isAnalysisExceptionEmail(user.email) ? "/predict" : "/home",
        { replace: true },
      );
      return;
    }
    if (user?.id && f === "algo" && hasAlgoAccess) {
      navigate("/trading-dashboard", { replace: true });
      return;
    }
    if (user?.id && f === "trades") {
      navigate("/active-trades", { replace: true });
      return;
    }
  }, [searchParams, subLoading, user?.id, hasAnalysisAccess, hasAlgoAccess, navigate]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 overflow-x-hidden">
      <Helmet>
        <title>Pricing — TradingSmart.ai</title>
        <meta
          name="description"
          content="Starter, Growth, and Pro — one-time setup plus monthly plans after 30 days. Full platform access and flexible algo strategy limits."
        />
      </Helmet>

      <AiPredictionHeader />

      <main className="pt-36 pb-16">
        <TradingSmartPricingMatrix />
      </main>

      <AiPredictionFooter />
    </div>
  );
};

export default PricingPage;
