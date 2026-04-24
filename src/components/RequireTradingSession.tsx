import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { bffConfigured, bffMe } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/**
 * After Supabase auth, require BFF cookie + TOTP enrollment + per-session TOTP (VAPT).
 */
export function RequireTradingSession({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { pathname, search } = useLocation();
  const [gate, setGate] = useState<"loading" | "ok" | "totp" | "setup" | "nocate">("loading");

  useEffect(() => {
    if (authLoading || !user) return;
    if (!bffConfigured()) {
      setGate("ok");
      return;
    }
    let cancelled = false;
    void (async () => {
      const me = await bffMe();
      if (cancelled) return;
      if (!me?.user_id) {
        setGate("nocate");
        return;
      }
      if (me.totp_enabled === false) {
        setGate("setup");
        return;
      }
      if (me.totp_enabled && !me.totp_verified_this_session) {
        setGate("totp");
        return;
      }
      setGate("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, pathname]);

  if (authLoading || gate === "loading") {
    return (
      <div className="login-screen">
        <div className="bg-grid" />
        <p className="relative z-[3] px-4 text-center text-[13px] text-[var(--text-muted)]">Securing session…</p>
      </div>
    );
  }

  if (gate === "nocate") {
    return <Navigate to="/login?reason=bff" replace />;
  }

  if (gate === "setup") {
    return <Navigate to="/totp-setup" replace />;
  }

  if (gate === "totp") {
    const redirect = encodeURIComponent(`${pathname}${search}`);
    return <Navigate to={`/session-totp?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
}
