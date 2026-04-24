import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL ?? "https://tradingsmart.ai";

export function RequireSubscription({ children }: { children: ReactNode }) {
  const { loading: authLoading } = useAuth();
  const { hasAlgoAccess, loading: subLoading, expiredMessage } = useSubscription();

  if (authLoading || subLoading) {
    return (
      <div className="login-screen">
        <div className="bg-grid" />
        <div className="bg-orbs">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
        </div>
        <div className="scanlines" />
        <p className="relative z-[3] px-4 text-center text-[13px] text-[var(--text-muted)]">
          Checking subscription…
        </p>
      </div>
    );
  }

  if (!hasAlgoAccess) {
    return (
      <div className="login-screen">
        <div className="bg-grid" />
        <div className="bg-orbs">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
        </div>
        <div className="scanlines" />
        <div className="relative z-[3] flex flex-col items-center gap-5 px-6 text-center max-w-sm mx-auto">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 border border-cyan-300/20 text-2xl">
            🔒
          </div>
          <h2 className="text-xl font-semibold text-slate-100">Subscription Required</h2>
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            {expiredMessage ?? "An active TradingSmart plan is required to access the algo dashboard."}
          </p>
          <a
            href={`${MAIN_APP_URL}/pricing`}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 px-6 text-[11px] font-semibold uppercase tracking-[2px] text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] transition hover:brightness-110"
          >
            View Plans →
          </a>
          <a
            href={`${MAIN_APP_URL}/auth`}
            className="text-[11px] text-cyan-300/70 transition hover:text-cyan-200"
          >
            Already subscribed? Sign in on main platform
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
