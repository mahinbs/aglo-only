import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import gsap from "gsap";
import {
  Activity,
  BarChart3,
  Bot,
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  LineChart,
  Lock,
  LogOut,
  Menu,
  Newspaper,
  ShieldCheck,
  Target,
  User,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/hooks/useAuth";
import { useAdmin } from "@/hooks/useAdmin";
import { useSubscription } from "@/hooks/useSubscription";
import { isAnalysisExceptionEmail } from "@/lib/manualSubscriptionBypass";
import { supabase } from "@/integrations/supabase/client";
import type { DashboardNavLink } from "./dashboard-nav-types";
import { isDashboardNavActive } from "./dashboard-nav-types";
import { DashboardMobileDrawer } from "./DashboardMobileDrawer";
import { cn } from "@/lib/utils";
import { useSignupProfile } from "@/hooks/useSignupProfile";
import { useUserRole } from "@/hooks/useUserRole";

export interface DashboardSidebarProps {
  className?: string;
  widthClassName?: string;
}

function useDashboardNavLinks(): DashboardNavLink[] {
  const { isAdmin } = useAdmin();
  const { isAffiliate } = useUserRole();
  const { hasAlgoAccess } = useSubscription();
  const { user } = useAuth();
  /** New Analysis + Past Analyses — exception list only (not all Pro / Probability users). */
  const canSeePredictPastTabs = isAnalysisExceptionEmail(user?.email);
  const [algoStatus, setAlgoStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchAlgoStatus = async () => {
      if (!user?.id || !hasAlgoAccess) {
        setAlgoStatus(null);
        return;
      }
      const { data } = await (supabase as any)
        .from("algo_onboarding")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      setAlgoStatus(data?.status ?? null);
    };
    fetchAlgoStatus();
  }, [user?.id, hasAlgoAccess]);

  const canUseAlgoTools =
    hasAlgoAccess && (algoStatus === "provisioned" || algoStatus === "active");

  return useMemo(() => {
    const next: DashboardNavLink[] = [
      { to: "/home", label: "Dashboard", icon: LayoutDashboard },
      ...(canSeePredictPastTabs
        ? [
            {
              to: "/predict",
              label: "New Analysis",
              icon: LineChart,
            } as DashboardNavLink,
            {
              to: "/predictions",
              label: "Past Analyses",
              icon: Activity,
            } as DashboardNavLink,
          ]
        : []),
      {
        to: "/active-trades?tab=performance",
        label: "Paper Trade Performance",
        icon: BarChart3,
      },
      { to: "/news", label: "News Feed", icon: Newspaper },
    ];

    // Affiliates are restricted to /affiliate/dashboard only (ProtectedRoute); keep a single nav item if they ever hit a shelled layout.
    if (isAffiliate) {
      return [{ to: "/affiliate/dashboard", label: "Affiliate Dashboard", icon: LayoutDashboard }];
    }

    if (hasAlgoAccess) {
      if (canUseAlgoTools) {
        next.push({
          to: "/trading-dashboard",
          label: "Algo & Options",
          icon: Bot,
          iconColor: "text-primary opacity-80",
        });
      } else {
        next.push({
          to: "/algo-setup",
          label: "Algo & Options",
          icon: Bot,
          iconColor: "text-primary opacity-80",
        });
      }
    } else {
      next.push({
        to: "/pricing?feature=algo",
        label: "Algo & Options",
        icon: Bot,
        iconColor: "text-primary opacity-80",
        locked: true,
      });
    }

    next.push({
      to: "/ai-trading-analysis",
      label: "AI Trading Analysis",
      icon: Target,
      iconColor: "text-primary opacity-80",
    });
    next.push({
      to: "/backtest",
      label: "Backtesting",
      icon: LineChart,
      iconColor: "text-primary opacity-80",
    });

    next.push({
      to: "/subscription",
      label: "Subscription",
      icon: CreditCard,
      iconColor: "text-muted-foreground opacity-90",
    });

    if (isAdmin) {
      next.push({
        to: "/admin",
        label: "Admin Panel",
        icon: ShieldCheck,
        iconColor: "text-destructive opacity-80",
      });
    }

    return next;
  }, [isAdmin, hasAlgoAccess, canUseAlgoTools, canSeePredictPastTabs, isAffiliate]);
}

export function DashboardSidebar({
  className,
  widthClassName = "w-[240px]",
}: DashboardSidebarProps) {
  const { pathname, search } = useLocation();
  const { signOut, user } = useAuth();
  const { isAffiliate } = useUserRole();
  const { displayName } = useSignupProfile();
  const links = useDashboardNavLinks();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const userEmail = user?.email;

  useEffect(() => {
    if (isMobileMenuOpen && mobileMenuRef.current) {
      gsap.fromTo(
        mobileMenuRef.current,
        { x: -500, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.3, ease: "power2.out" },
      );
    }
  }, [isMobileMenuOpen]);

  const closeMobileMenu = () => {
    if (mobileMenuRef.current) {
      gsap.to(mobileMenuRef.current, {
        x: -500,
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => setIsMobileMenuOpen(false),
      });
    } else {
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <>
      <aside
        className={cn(
          "shrink-0 border-r border-sidebar-border bg-sidebar flex-col h-full hidden lg:flex",
          widthClassName,
          className,
        )}
      >
        <div className="p-4 flex items-center justify-center mb-2 mt-2">
          <img
            src={logo}
            alt="ChartMate"
            className="w-[5rem] object-contain opacity-90"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-6 scrollbar-hide bg-gradient-to-br from-transparent via-transparent to-primary/20">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-widest px-2 mb-2.5 font-semibold opacity-80">
              Navigation
            </p>
            <div className="space-y-2">
              {links.map((link) => {
                const Icon = link.icon;
                const isActive =
                  link.matchActive === false
                    ? false
                    : isDashboardNavActive(link.to, pathname, search);
                return (
                  <Link
                    key={link.label}
                    to={link.to}
                    title={link.locked ? "Upgrade to unlock" : undefined}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors border-l-[3px]",
                      link.locked && "opacity-75",
                      isActive
                        ? "bg-sidebar-primary/10 text-primary border-primary font-semibold shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
                        : "text-sidebar-foreground hover:text-foreground hover:bg-sidebar-primary/5 font-medium border-transparent ml-[1px]",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        !isActive && link.iconColor,
                        !isActive && link.iconOpacity,
                      )}
                    />
                    <span className="flex-1 truncate">{link.label}</span>
                    {link.locked && (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-80" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-sidebar-border mt-auto bg-sidebar pb-6">
          <Link
            to="/contact-us"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:text-foreground hover:bg-white/5 glass-button-premium transition-all text-sm font-medium mb-3 border-l-[3px] border-transparent ml-[1px]"
          >
            <HelpCircle className="h-4 w-4 opacity-70" /> Help Center (FAQ)
          </Link>
          <div className="flex items-center gap-2 rounded-xl border border-transparent hover:border-border hover:bg-sidebar-accent/50 transition-colors group px-2 py-1.5">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-foreground border border-border shrink-0 overflow-hidden shadow-sm">
              <User className="h-4 w-4 opacity-50" />
            </div>
            <div className="flex-1 min-w-0 pr-1">
              <Link
                to="/profile"
                className="text-sm font-semibold text-foreground truncate leading-tight block hover:text-primary transition-colors"
              >
                {displayName}
              </Link>
              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                {userEmail}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                signOut();
              }}
              className="text-muted-foreground hover:text-destructive transition-colors px-2 py-1.5 shrink-0 rounded-r-xl"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-background/95 backdrop-blur-xl border-b border-border shadow-sm z-[85] flex items-center px-4 gap-3">
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-[22px] w-[22px]" />
        </button>
        <span className="font-bold text-foreground truncate tracking-tight text-[17px]">
          {pathname === "/home" && "Dashboard"}
          {pathname.startsWith("/active-trades") && "Active Trades"}
          {pathname === "/news" && "Market News"}
          {pathname === "/trading-dashboard" && "Live Trading Dashboard"}
          {pathname === "/ai-trading-analysis" && "Analysis"}
          {pathname === "/backtest" && "Backtesting"}
          {pathname === "/subscription" && "Subscription & billing"}
        </span>
      </div>

      <DashboardMobileDrawer
        ref={mobileMenuRef}
        open={isMobileMenuOpen}
        onClose={closeMobileMenu}
        links={links}
        userEmail={userEmail}
        profileDisplayName={displayName}
        onSignOut={signOut}
      />
    </>
  );
}
