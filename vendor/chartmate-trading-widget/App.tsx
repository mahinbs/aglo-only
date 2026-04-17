import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import HomePage from "./pages/HomePage";
import PredictPage from "./pages/PredictPage";
import PredictionsPage from "./pages/PredictionsPage";
import SavedAnalysisRedirect from "./pages/SavedAnalysisRedirect";
import IntradayPage from "./pages/IntradayPage";
import ActiveTradesPage from "./pages/ActiveTradesPage";
import ActiveTradeDetailsPage from "./pages/ActiveTradeDetailsPage";
import AuthPage from "./pages/AuthPage";
import BrokerCallbackPage from "./pages/BrokerCallbackPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AnalysisFeatureGate } from "./components/AnalysisFeatureGate";
import { PredictPastAnalysisGate } from "./components/PredictPastAnalysisGate";
import { TradesHubGate } from "./components/TradesHubGate";
import LandingPage from "./pages/LandingPage";
import WhiteLabelPage from "./pages/WhiteLabelPage";
import TermsOfService from "./pages/TermsOfService";
import RiskDisclaimer from "./pages/RiskDisclaimer";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ContactUsPage from "./pages/ContactUs";
import SubscriptionSettingsPage from "./pages/SubscriptionSettingsPage";
import ProfilePage from "./pages/ProfilePage";
import MarketPicksPage from "./pages/MarketPicksPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminPredictionsPage from "./pages/admin/AdminPredictionsPage";
import AdminBlogsPage from "./pages/admin/AdminBlogsPage";
import AdminPublicDashboardPage from "./pages/admin/AdminPublicDashboardPage";
import AdminAffiliatesPage from "./pages/admin/AdminAffiliatesPage";
import AdminContactsPage from "./pages/admin/AdminContactsPage";
import AdminWhitelabelsPage from "./pages/admin/AdminWhitelabelsPage";
import AdminAlgoRequestsPage from "./pages/admin/AdminAlgoRequestsPage";
import AdminAlgoAccessRequestsPage from "./pages/admin/AdminAlgoAccessRequestsPage";
import BlogsPage from "./pages/BlogsPage";
import BlogDetailPage from "./pages/BlogDetailPage";
import PublicDashboardPage from "./pages/PublicDashboardPage";
import WhitelabelLoginPage from "./pages/WhitelabelLoginPage";
import WhitelabelDashboardPage from "./pages/WhitelabelDashboardPage";
import { AdminRoute } from "./components/AdminRoute";
import { AdminLayout } from "./components/admin/AdminLayout";
import MainLandingPage from "./pages/MainLandingPage";
import AiTradingAnalysisPage from "./pages/AiTradingAnalysisPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import AffiliateDashboard from "./pages/AffiliateDashboard";
import { AffiliateRoute } from "./components/AffiliateRoute";
import { HelmetProvider } from "react-helmet-async";
import { PlatformChatbot } from "./components/PlatformChatbot";
import RegisterPage from "./pages/RegisterPage";
import AffiliatePartnerPage from "./pages/AffiliatePartnerPage";
import TradingDashboardPage from "./pages/TradingDashboardPage";
import TradingAiAnalysisPage from "./pages/TradingAiAnalysisPage";
import TradingBacktestPage from "./pages/TradingBacktestPage";
import WlCheckoutPage from "./pages/WlCheckoutPage";
import AlgoOnboardingPage from "./pages/AlgoOnboardingPage";
import StrategiesPage from "./pages/StrategiesPage";
import NewsPage from "./pages/NewsPage";
import NewsDetailPage from "./pages/NewsDetailPage";
import TickChart from "./pages/TickChart";
import PricingPage from "./pages/PricingPage";
import { PredictionChatbot } from "./components/PredictionChatbot";
import { useAuth } from "./hooks/useAuth";
import { useAffiliateRef } from "./hooks/useAffiliateRef";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";
import { AlgoToolsDashboardLayout } from "./components/layout/AlgoToolsDashboardLayout";
import LandingPageNew from "./pages/LandingPageNew";
import FeaturesPage from "./pages/FeaturesPage";
import { MobileSplashScreens } from "./mobile-app/MobileSplashScreens";
import { MobileAppOverlay } from "./mobile-app/MobileAppOverlay";
import { useIsMobileApp } from "./mobile-app/isMobileDevice";
import TrialDashboardPage from "./pages/TrialDashboardPage";

// OpenAlgo ping temporarily disabled in mock-order mode to avoid CORS noise

const queryClient = new QueryClient();

/** Public marketing site — platform / product enquiry chatbot (guests only). */
function isPublicMarketingPath(pathname: string): boolean {
  if (pathname.startsWith("/admin")) return false;
  const exact = new Set([
    "/",
    "/pricing",
    "/rsb-fintech-founder",
    "/dsn-fintech-founder",
    "/contact-us",
    "/white-label",
    "/terms",
    "/risk-disclaimer",
    "/privacy-policy",
    "/ai-trading-analysis-and-back-testing",
    "/features",
    "/affiliate-partner",
    "/dashboard",
    "/market-picks",
  ]);
  if (exact.has(pathname)) return true;
  if (pathname === "/blogs" || pathname.startsWith("/blogs/")) return true;
  if (/^\/wl\/[^/]+$/.test(pathname)) return true;
  return false;
}

/** Logged-in trading app — stock / market assistant chatbot. */
export function isLoggedInAppPath(pathname: string): boolean {
  if (pathname === "/tick-chart") return false;
  if (pathname === "/auth" || pathname === "/register") return false;
  if (pathname.startsWith("/auth/") && pathname !== "/auth/change-password") return false;
  if (pathname.startsWith("/admin")) return false;

  if (pathname === "/auth/change-password") return true;
  if (pathname.startsWith("/predictions")) return true;
  if (pathname.startsWith("/trade/")) return true;
  if (pathname.startsWith("/trading-dashboard")) return true;
  if (pathname.startsWith("/wl-checkout/")) return true;
  if (/^\/wl\/[^/]+\/dashboard/.test(pathname)) return true;

  const exactApp = new Set([
    "/home",
    "/predict",
    "/intraday",
    "/active-trades",
    "/news",
    "/ai-trading-analysis",
    "/backtest",
    "/strategies",
    "/broker-callback",
    "/affiliate/dashboard",
    "/algo-setup",
    "/market-picks",
    "/subscription",
    "/profile",
  ]);
  if (exactApp.has(pathname)) return true;
  if (pathname.startsWith("/news/")) return true;

  return false;
}

/** Records ?ref= on any route and persists affiliate id in sessionStorage for signup / checkout. */
function AffiliateRefCapture() {
  useAffiliateRef();
  return null;
}

/** If the user visited a ?ref= link (IP recorded) but never typed a code, attach affiliate from IP once. */
function AffiliateIpAttributionSync() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading || !user?.id) return;
    const k = `affiliate_ip_sync_v1_${user.id}`;
    try {
      if (sessionStorage.getItem(k)) return;
    } catch {
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;
      await supabase.functions.invoke("sync-affiliate-from-ip", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      try {
        sessionStorage.setItem(k, "1");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);
  return null;
}

/** Old bookmarked URLs → same UI as modal on list/dashboard with ?view= */
function AdminAffiliateDeepLinkRedirect() {
  const { affiliateId } = useParams<{ affiliateId: string }>();
  const q = affiliateId ? `?view=${encodeURIComponent(affiliateId)}` : "";
  return <Navigate to={`/admin/affiliates${q}`} replace />;
}

function WhitelabelAffiliateDeepLinkRedirect() {
  const { slug, affiliateId } = useParams<{ slug: string; affiliateId: string }>();
  const q = affiliateId
    ? `?tab=affiliates&view=${encodeURIComponent(affiliateId)}`
    : "?tab=affiliates";
  return <Navigate to={`/wl/${slug}/dashboard${q}`} replace />;
}

function AppChatbots() {
  const { user } = useAuth();
  const { pathname, hash } = useLocation();
  const [predictionOpen, setPredictionOpen] = useState(false);

  const showPredictionChatbot = !!user && isLoggedInAppPath(pathname);
  const isTrialDemoExperience =
    pathname === "/1414ghgh" || (pathname === "/" && hash === "#1414ghgh");
  /** Marketing pages: platform bot unless the logged-in app assistant already owns this URL (e.g. /market-picks). */
  const showPlatformChatbot =
    !isTrialDemoExperience &&
    isPublicMarketingPath(pathname) &&
    !showPredictionChatbot;

  return (
    <>
      {showPlatformChatbot ? <PlatformChatbot /> : null}
      {showPredictionChatbot ? (
        <PredictionChatbot open={predictionOpen} setOpen={setPredictionOpen} />
      ) : null}
    </>
  );
}

function MobileSplashGuard({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobileApp();
  const { pathname } = useLocation();
  const hasSeenSplash = localStorage.getItem('hasSeenMobileSplash') === 'true';

  if (isMobile && pathname === '/') {
    if (!hasSeenSplash) {
      return <MobileSplashScreens />;
    }
  }

  return <>{children}</>;
}

function RootRoute() {
  const { hash } = useLocation();
  if (hash === "#1414ghgh") {
    return <TrialDashboardPage />;
  }
  return <LandingPageNew />;
}

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AffiliateRefCapture />
          <AffiliateIpAttributionSync />
          <MobileSplashGuard>
          <div className="min-h-screen bg-background text-foreground">
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/1414ghgh" element={<TrialDashboardPage />} />
              <Route path="/classic" element={<MainLandingPage />} />
              <Route path="/rsb-fintech-founder" element={<LandingPage />} />
              <Route path="/dsn-fintech-founder" element={<LandingPage />} />
              <Route path="/white-label" element={<WhiteLabelPage />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/risk-disclaimer" element={<RiskDisclaimer />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/ai-trading-analysis-and-back-testing" element={<AiTradingAnalysisPage />} />
              <Route path="/features" element={<FeaturesPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route
                path="/ai-probability-engine"
                element={<Navigate to="/ai-trading-analysis-and-back-testing" replace />}
              />
              <Route path="/affiliate-partner" element={<AffiliatePartnerPage />} />
              <Route
                element={
                  <ProtectedRoute>
                    <AlgoToolsDashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/ai-trading-analysis" element={<TradingAiAnalysisPage />} />
                <Route path="/backtest" element={<TradingBacktestPage />} />
              </Route>
              <Route
                path="/trading-dashboard"
                element={
                  <ProtectedRoute>
                    <TradingDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/wl-checkout/:token" element={<WlCheckoutPage />} />
              <Route path="/algo-setup" element={<AlgoOnboardingPage />} />
              <Route path="/tick-chart" element={<TickChart />} />
              <Route
                path="/strategies"
                element={
                  <ProtectedRoute>
                    <StrategiesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/options-strategies"
                element={
                  <ProtectedRoute>
                    <Navigate to="/trading-dashboard?tab=options" replace />
                  </ProtectedRoute>
                }
              />
              <Route path="/contact-us" element={<ContactUsPage />} />
              <Route
                path="/subscription"
                element={
                  <ProtectedRoute>
                    <SubscriptionSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route path="/blogs" element={<BlogsPage />} />
              <Route path="/blogs/:slug" element={<BlogDetailPage />} />
              <Route path="/dashboard" element={<PublicDashboardPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/auth/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
              <Route path="/affiliate/dashboard" element={<AffiliateRoute><AffiliateDashboard /></AffiliateRoute>} />
              <Route
                path="/broker-callback"
                element={
                  <ProtectedRoute>
                    <BrokerCallbackPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/home"
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/predict"
                element={
                  <ProtectedRoute>
                    <PredictPastAnalysisGate>
                      <PredictPage />
                    </PredictPastAnalysisGate>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/predictions"
                element={
                  <ProtectedRoute>
                    <PredictPastAnalysisGate>
                      <PredictionsPage />
                    </PredictPastAnalysisGate>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/predictions/:predictionId/full"
                element={
                  <ProtectedRoute>
                    <PredictPastAnalysisGate>
                      <SavedAnalysisRedirect />
                    </PredictPastAnalysisGate>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/intraday"
                element={
                  <ProtectedRoute>
                    <AnalysisFeatureGate>
                      <IntradayPage />
                    </AnalysisFeatureGate>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/active-trades"
                element={
                  <ProtectedRoute>
                    <TradesHubGate>
                      <ActiveTradesPage />
                    </TradesHubGate>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/news"
                element={
                  <ProtectedRoute>
                    <NewsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/news/:articleId"
                element={
                  <ProtectedRoute>
                    <NewsDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trade/:id"
                element={
                  <ProtectedRoute>
                    <TradesHubGate>
                      <ActiveTradeDetailsPage />
                    </TradesHubGate>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/market-picks"
                element={<MarketPicksPage />}
              />
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="predictions" element={<AdminPredictionsPage />} />
                <Route path="blogs" element={<AdminBlogsPage />} />
                <Route path="dashboard" element={<PublicDashboardPage embedInAdmin />} />
                <Route path="public-dashboard" element={<AdminPublicDashboardPage />} />
                <Route path="affiliates" element={<AdminAffiliatesPage />} />
                <Route path="affiliates/:affiliateId" element={<AdminAffiliateDeepLinkRedirect />} />
                <Route path="contacts" element={<AdminContactsPage />} />
                <Route path="whitelabels" element={<AdminWhitelabelsPage />} />
                <Route path="algo-requests" element={<AdminAlgoRequestsPage />} />
                <Route path="algo-access-requests" element={<AdminAlgoAccessRequestsPage />} />
              </Route>
              <Route path="/wl/:slug" element={<WhitelabelLoginPage />} />
              <Route path="/wl/:slug/dashboard" element={<WhitelabelDashboardPage />} />
              <Route path="/wl/:slug/affiliates/:affiliateId" element={<WhitelabelAffiliateDeepLinkRedirect />} />
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
            <AppChatbots />
            <MobileAppOverlay />
          </div>
          </MobileSplashGuard>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
