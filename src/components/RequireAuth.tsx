import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname, search } = useLocation();

  if (loading) {
    return (
      <div className="login-screen">
        <div className="bg-grid" />
        <div className="bg-orbs">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
        </div>
        <div className="scanlines" />
        <p className="relative z-[3] px-4 text-center text-[13px] text-[var(--text-muted)]">Loading…</p>
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(`${pathname}${search}`);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}
