import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBrokerIntegration } from "@/hooks/useBrokerIntegration";
import { startZerodhaKiteConnect } from "@/lib/zerodhaOAuth";
import { toUserFacingErrorMessage } from "@/lib/userFacingErrors";
import { supabase } from "@/lib/supabase";

function normalizeBroker(value: unknown): "fyers" | "zerodha" | "upstox" | "angel" | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/_/g, " ");
  if (!raw || raw === "other" || raw === "others") return null;
  if (raw.includes("fyers") || raw.includes("fayer")) return "fyers";
  if (raw.includes("upstox")) return "upstox";
  if (raw.includes("angel")) return "angel";
  if (raw.includes("zerodha") || raw.includes("kite")) return "zerodha";
  return null;
}

/** Standalone `/connect-broker` screen (optional). Home dashboard uses the header Connect broker control. */
export default function BrokerConnectPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { brokerReady, brokerLoading, refreshBroker, tokenExpiresAt, hasBrokerCredentials } = useBrokerIntegration(user?.id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [broker, setBroker] = useState<"fyers" | "zerodha" | "upstox" | "angel">("zerodha");
  const brokerLabel =
    broker === "fyers"
      ? "Fyers"
      : broker === "upstox"
        ? "Upstox"
        : broker === "angel"
          ? "Angel One"
          : "Zerodha (Kite)";

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const { data: intg } = await (supabase as any)
        .from("user_trading_integration")
        .select("broker")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      const b1 = normalizeBroker(intg?.broker);
      if (b1) {
        setBroker(b1);
        return;
      }
      const { data: ob } = await (supabase as any)
        .from("algo_onboarding")
        .select("broker,broker_client_id,notes")
        .eq("user_id", user.id)
        .maybeSingle();
      const b2 = normalizeBroker(ob?.broker) || normalizeBroker(ob?.broker_client_id) || normalizeBroker(ob?.notes);
      if (b2) setBroker(b2);
    })();
  }, [user?.id]);

  if (!authLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  if (!authLoading && !brokerLoading && brokerReady) {
    return <Navigate to="/dashboard" replace />;
  }

  const onConnect = async () => {
    setErr(null);
    setBusy(true);
    try {
      await startZerodhaKiteConnect(broker);
    } catch (e: unknown) {
      setErr(toUserFacingErrorMessage(e instanceof Error ? e.message : "Could not start broker login"));
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="bg-grid" />
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <div className="scanlines" />
      <div className="login-container">
        <div className="login-card">
          <div className="broker-connect-title">Connect your broker</div>
          <p className="broker-connect-copy">
            Link {brokerLabel} via OAuth (same OpenAlgo flow as ChartMate). After you authorize, you&apos;ll return here
            and the dashboard will open automatically. Broker day tokens expire at midnight IST — reconnect each trading day.
          </p>
          {hasBrokerCredentials && tokenExpiresAt && (
            <p className="broker-connect-copy" style={{ fontSize: 11, opacity: 0.85 }}>
              Last session valid until{" "}
              {new Date(tokenExpiresAt).toLocaleString(undefined, {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          )}
          {err && (
            <div className="login-error show" style={{ marginBottom: 16 }}>
              {err}
            </div>
          )}
          <button type="button" className="login-btn" onClick={() => void onConnect()} disabled={busy || brokerLoading}>
            {busy ? `Opening ${brokerLabel}…` : `CONNECT ${brokerLabel.toUpperCase()} →`}
          </button>
          <p className="broker-connect-copy" style={{ marginTop: 16, fontSize: 11, opacity: 0.8 }}>
            VAPT stack: up to <strong>4 brokers</strong> per account via BFF <code>/api/broker/connect</code> (Zerodha,
            Fyers, Angel, Upstox). Register your static IP with <strong>/api/account/register-current-ip</strong> after
            signing in.
          </p>
          <p className="broker-connect-copy" style={{ marginTop: 20, fontSize: 12 }}>
            Already finished in another tab?{" "}
            <button
              type="button"
              onClick={() => void refreshBroker()}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent-cyan)",
                cursor: "pointer",
                textDecoration: "underline",
                font: "inherit",
              }}
            >
              Refresh status
            </button>
          </p>
          <div className="login-footer" style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={() => void signOut()}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
