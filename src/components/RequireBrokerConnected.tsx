import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBrokerIntegration } from "@/hooks/useBrokerIntegration";

/**
 * Optional full-page gate: redirect to `/connect-broker` until the daily broker session is live.
 * The main app routes the home dashboard without this wrapper so connect/reconnect lives in the header
 * (same idea as chartmate-trading-widget). Import and wrap routes only if you want the gate back.
 */
export function RequireBrokerConnected({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { brokerReady, brokerLoading } = useBrokerIntegration(user?.id);

  if (brokerLoading) {
    return (
      <div className="login-screen" style={{ position: "fixed" }}>
        <div className="bg-grid" />
        <div className="bg-orbs">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
        </div>
        <div className="scanlines" />
        <p style={{ position: "relative", zIndex: 3, color: "var(--text-muted)" }}>Checking broker…</p>
      </div>
    );
  }

  if (!brokerReady) {
    return <Navigate to="/connect-broker" replace />;
  }

  return <>{children}</>;
}
