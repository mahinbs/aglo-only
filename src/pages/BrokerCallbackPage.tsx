import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/**
 * Same flow as chartmate-trading-widget BrokerCallbackPage — saves session via Edge then returns to algo dashboard.
 */
export default function BrokerCallbackPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"saving" | "done" | "error">("saving");
  const [message, setMessage] = useState("Connecting your broker…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search.slice(1) || window.location.hash.slice(1));
    const statusParam = params.get("status");
    const brokerToken = params.get("broker_token");
    const broker = (params.get("broker") || "zerodha").toLowerCase();
    const errorParam = params.get("error");

    if (statusParam === "error" || !brokerToken?.trim()) {
      setStatus("error");
      setMessage(errorParam ? decodeURIComponent(errorParam) : "Missing token. Try connecting again.");
      return;
    }

    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setStatus("error");
          setMessage("Session expired. Please log in and try again.");
          return;
        }
        const res = await supabase.functions.invoke("sync-broker-session", {
          body: { broker, auth_token: brokerToken.trim() },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const d = res.data as { success?: boolean } | null;
        if (res.error || !d?.success) {
          setStatus("error");
          setMessage(res.error?.message ?? "Failed to save broker session.");
          return;
        }
        setStatus("done");
        setMessage("Broker connected! Returning to dashboard…");
        setTimeout(() => navigate("/", { replace: true }), 1200);
      } catch (e: unknown) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Unexpected error");
      }
    })();
  }, [navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#06080d", color: "#e2e8f0", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        {status === "saving" && <p style={{ fontSize: 14 }}>{message}</p>}
        {status === "done" && <p style={{ fontSize: 14, color: "#34d399" }}>{message}</p>}
        {status === "error" && (
          <>
            <p style={{ fontSize: 14, color: "#f43f5e", marginBottom: 16 }}>{message}</p>
            <button type="button" onClick={() => navigate("/connect-broker", { replace: true })} style={{ color: "#38bdf8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Back to broker connect
            </button>
          </>
        )}
      </div>
    </div>
  );
}
