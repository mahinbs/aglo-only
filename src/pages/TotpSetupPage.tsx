import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { bffConfigured, bffFetch } from "@/lib/api";

export default function TotpSetupPage() {
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!bffConfigured()) return;
    void bffFetch<{ otpauth_uri?: string }>("/api/auth/totp/setup", { method: "GET" }).then((r) => {
      setUri(r.otpauth_uri ?? null);
    }).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Load failed"));
  }, []);

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await bffFetch("/api/auth/totp/activate", {
        method: "POST",
        body: JSON.stringify({ code: code.replace(/\s/g, "") }),
      });
      navigate("/session-totp", { replace: true });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Invalid code");
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
      <div style={{ maxWidth: 420, width: "100%" }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Enable Google Authenticator</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12 }}>
          Scan the otpauth URI in your authenticator app, then enter the 6-digit code.
        </p>
        {uri && (
          <pre
            style={{
              fontSize: 11,
              wordBreak: "break-all",
              background: "#0f172a",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #334155",
              marginBottom: 12,
            }}
          >
            {uri}
          </pre>
        )}
        <form onSubmit={activate}>
          <input
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
            placeholder="6-digit code"
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
          {err && <p style={{ color: "#f43f5e", fontSize: 13 }}>{err}</p>}
          <button
            type="submit"
            disabled={busy || code.length < 6}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "12px",
              borderRadius: 8,
              border: "none",
              background: "#38bdf8",
              color: "#0f172a",
              fontWeight: 600,
            }}
          >
            {busy ? "…" : "Activate 2FA"}
          </button>
        </form>
      </div>
    </div>
  );
}
