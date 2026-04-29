import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { bffConfigured, bffFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toUserFacingErrorMessage } from "@/lib/userFacingErrors";

/**
 * Saves broker session via BFF (Supabase Edge invoked server-side only).
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
      setMessage(
        toUserFacingErrorMessage(
          errorParam ? decodeURIComponent(errorParam) : "Missing token. Try connecting again.",
        ),
      );
      return;
    }

    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setStatus("error");
          setMessage("Session expired. Please log in and try again.");
          return;
        }
        if (!bffConfigured()) {
          setStatus("error");
          setMessage(
            "Algo backend URL missing (set VITE_ALGO_ONLY_BFF_URL). Broker session cannot be saved from this deployment.",
          );
          return;
        }
        await bffFetch("/api/broker/sync-session", {
          method: "POST",
          body: JSON.stringify({ broker, auth_token: brokerToken.trim() }),
        });
        setStatus("done");
        setMessage("Broker connected! Returning to dashboard…");
        setTimeout(() => navigate("/dashboard", { replace: true }), 1200);
      } catch (e: unknown) {
        setStatus("error");
        setMessage(toUserFacingErrorMessage(e instanceof Error ? e.message : "Unexpected error"));
      }
    })();
  }, [navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#06080d",
        color: "#e2e8f0",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420, width: "100%" }}>
        {status === "saving" && <p style={{ fontSize: 14 }}>{message}</p>}
        {status === "done" && <p style={{ fontSize: 14, color: "#34d399" }}>{message}</p>}
        {status === "error" && (
          <>
            <p style={{ fontSize: 14, color: "#f43f5e", marginBottom: 16 }}>{message}</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => navigate("/dashboard", { replace: true })}
                style={{
                  color: "#38bdf8",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Back to dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate("/connect-broker", { replace: true })}
                style={{
                  color: "#94a3b8",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Try broker connect again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
