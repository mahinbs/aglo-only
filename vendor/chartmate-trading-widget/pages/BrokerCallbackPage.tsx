import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { dispatchBrokerSessionUpdated } from "@/services/openalgoIntegrationService";

/**
 * Handles the return from Zerodha (or any broker) OAuth via OpenAlgo platform callback.
 *
 * OpenAlgo redirects here with query params:
 *   ?broker=zerodha&broker_token=<api_key:access_token>&status=success
 *
 * We save the token to Supabase (and let sync-broker-session also push it to OpenAlgo),
 * then redirect the user to the trading dashboard. User never sees OpenAlgo at any point.
 */
export default function BrokerCallbackPage() {
  const navigate = useNavigate();
  const [status,  setStatus]  = useState<"saving" | "done" | "error">("saving");
  const [message, setMessage] = useState("Connecting your broker…");

  useEffect(() => {
    // Support both query string (?key=val) and URL hash (#key=val)
    const params = new URLSearchParams(
      window.location.search.slice(1) || window.location.hash.slice(1)
    );
    const statusParam  = params.get("status");
    const brokerToken  = params.get("broker_token");
    const broker       = (params.get("broker") || "zerodha").toLowerCase();
    const errorParam   = params.get("error");

    if (statusParam === "error" || !brokerToken?.trim()) {
      setStatus("error");
      setMessage(
        errorParam
          ? decodeURIComponent(errorParam)
          : "Missing token. Please try connecting again from ChartMate."
      );
      return;
    }

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setStatus("error");
          setMessage("Session expired. Please log in and try again.");
          return;
        }

        // Save token to Supabase + sync to OpenAlgo via edge function
        const res = await supabase.functions.invoke("sync-broker-session", {
          body:    { broker, auth_token: brokerToken.trim() },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        const d = res.data as { success?: boolean; openalgo_synced?: boolean } | null;
        if (res.error || !d?.success) {
          setStatus("error");
          setMessage(
            "Failed to save broker session: " +
            (res.error?.message ?? "Unknown error. Please try again.")
          );
          return;
        }

        setStatus("done");
        setMessage("Broker connected! Taking you to your trading dashboard…");
        dispatchBrokerSessionUpdated();
        setTimeout(() => navigate("/trading-dashboard", { replace: true }), 1200);
      } catch (e: any) {
        setStatus("error");
        setMessage("Unexpected error: " + (e?.message ?? "unknown"));
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background">
      <div className="text-muted-foreground text-center max-w-sm">
        {status === "saving" && (
          <>
            <div className="animate-pulse h-10 w-10 rounded-full bg-primary/20 mx-auto mb-4" />
            <p className="text-sm">{message}</p>
          </>
        )}
        {status === "done" && (
          <>
            <div className="h-10 w-10 rounded-full bg-teal-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-teal-400 text-lg">✓</span>
            </div>
            <p className="text-sm text-teal-400 font-medium">{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-destructive font-medium text-sm mb-3">{message}</p>
            <button
              type="button"
              onClick={() => navigate("/trading-dashboard", { replace: true })}
              className="text-sm text-primary hover:underline"
            >
              Go to Trading Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
