import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { bffConfigured, bffFetch } from "@/lib/api";

export default function SessionTotpPage() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/dashboard";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!bffConfigured()) {
      setErr("BFF not configured");
      return;
    }
    setBusy(true);
    try {
      await bffFetch("/api/sessions/start", {
        method: "POST",
        body: JSON.stringify({ code: code.replace(/\s/g, "") }),
      });
      navigate(decodeURIComponent(redirect), { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

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
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360 }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Trading session 2FA</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
          Enter the code from Google Authenticator to start this session.
        </p>
        <input
          value={code}
          onChange={(ev) => setCode(ev.target.value)}
          placeholder="6-digit code"
          autoComplete="one-time-code"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#f8fafc",
            marginBottom: 12,
          }}
        />
        {err && <p style={{ color: "#f43f5e", fontSize: 13, marginBottom: 8 }}>{err}</p>}
        <button
          type="submit"
          disabled={busy || code.length < 6}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: 8,
            border: "none",
            background: "#38bdf8",
            color: "#0f172a",
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
    </div>
  );
}
