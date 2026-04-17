import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const LOGO_SVG = (
  <svg viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="lg2" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
    <g>
      <path
        d="M20 55 C20 30,35 15,50 15 C55 15,58 18,55 25 C52 32,48 30,45 35 C42 40,46 45,50 45 C54 45,52 40,55 38 C58 36,62 38,60 42 C58 46,54 48,52 52 C50 56,48 60,45 62 C42 64,38 62,35 58 C32 54,28 56,25 58 C22 60,20 58,20 55Z"
        stroke="url(#lg2)"
        strokeWidth="2"
        fill="none"
      />
      <circle cx="30" cy="35" r="2" fill="#38bdf8" />
      <circle cx="40" cy="28" r="2" fill="#38bdf8" />
      <circle cx="35" cy="45" r="1.5" fill="#06b6d4" />
      <line x1="30" y1="35" x2="40" y2="28" stroke="#38bdf8" strokeWidth="1" />
      <line x1="40" y1="28" x2="45" y2="38" stroke="#38bdf8" strokeWidth="1" />
      <rect x="55" y="50" width="4" height="20" rx="1" fill="#38bdf8" opacity="0.7" />
      <rect x="62" y="42" width="4" height="25" rx="1" fill="#38bdf8" opacity="0.8" />
      <rect x="69" y="35" width="4" height="30" rx="1" fill="#06b6d4" opacity="0.9" />
      <rect x="76" y="28" width="4" height="35" rx="1" fill="#06b6d4" />
      <path d="M52 68 Q65 40,82 22" stroke="url(#lg2)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <polygon points="82,22 85,28 78,26" fill="#38bdf8" />
    </g>
  </svg>
);

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showErr, setShowErr] = useState(false);
  const [errText, setErrText] = useState("");
  const [busy, setBusy] = useState(false);
  const particlesRef = useRef<HTMLDivElement>(null);
  const emailPrefilled = useRef(false);

  useEffect(() => {
    const pre = searchParams.get("email")?.trim();
    if (pre && !emailPrefilled.current) {
      setEmail(pre);
      emailPrefilled.current = true;
    }
  }, [searchParams]);

  useEffect(() => {
    const container = particlesRef.current;
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < 30; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${8 + Math.random() * 12}s`;
      p.style.animationDelay = `${Math.random() * 10}s`;
      const s = 1 + Math.random() * 2;
      p.style.width = `${s}px`;
      p.style.height = `${s}px`;
      if (Math.random() > 0.5) p.style.background = "var(--accent-purple)";
      container.appendChild(p);
    }
  }, []);

  if (!loading && user) {
    const r = searchParams.get("redirect");
    return <Navigate to={r && r.startsWith("/") ? r : "/"} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErr(false);
    if (!email.trim() || !password) {
      setErrText("Please enter both email and password.");
      setShowErr(true);
      return;
    }
    setBusy(true);
    try {
      const { error } = await signIn(email.trim().toLowerCase(), password);
      if (error) {
        setErrText(error.message);
        setShowErr(true);
        return;
      }
      const r = searchParams.get("redirect");
      navigate(r && r.startsWith("/") ? r : "/", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const noopSocial = () => {
    setErrText("Use your ChartMate email and password above (same as chartmate-trading-widget).");
    setShowErr(true);
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
      <div className="login-particles" ref={particlesRef} />
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-ring">
              <div className="login-logo-inner">{LOGO_SVG}</div>
            </div>
            <div className="login-brand">TRADINGSMART.AI</div>
            <div className="login-subtitle">Algo Trading Command Center</div>
          </div>
          <form className="login-form" onSubmit={onSubmit} autoComplete="on">
            <div className={`login-error${showErr ? " show" : ""}`} id="loginError">
              {errText || "Invalid credentials. Please try again."}
            </div>
            <div className="login-field">
              <label className="login-field-label" htmlFor="loginEmail">
                Email Address
              </label>
              <span className="login-field-icon">&#x1F4E7;</span>
              <input
                id="loginEmail"
                className="login-input"
                type="email"
                name="email"
                placeholder="trader@example.com"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="login-field">
              <label className="login-field-label" htmlFor="loginPassword">
                Password
              </label>
              <span className="login-field-icon">&#x1F512;</span>
              <input
                id="loginPassword"
                className="login-input"
                type="password"
                name="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="login-remember">
              <label>
                <input type="checkbox" defaultChecked /> Remember me
              </label>
              <a href="#">Forgot password?</a>
            </div>
            <button type="submit" className="login-btn" id="loginBtn" disabled={busy}>
              {busy ? "AUTHENTICATING…" : "ACCESS DASHBOARD →"}
            </button>
            <div className="login-divider">
              <span>or continue with</span>
            </div>
            <div className="login-options">
              <button type="button" className="login-option-btn" onClick={noopSocial}>
                &#x1F310; Google
              </button>
              <button type="button" className="login-option-btn" onClick={noopSocial}>
                &#x1F4BB; GitHub
              </button>
              <button type="button" className="login-option-btn" onClick={noopSocial}>
                &#x1F511; API Key
              </button>
            </div>
            <div className="login-footer">
              Don&apos;t have an account? <Link to="/request-access">Request Access</Link>
            </div>
            <div
              style={{
                marginTop: 16,
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(251,191,36,0.05)",
                border: "1px solid rgba(251,191,36,0.15)",
                fontSize: 10,
                color: "var(--text-muted)",
                lineHeight: 1.6,
                textAlign: "left",
              }}
            >
              ⚠️ <strong style={{ color: "var(--accent-yellow)" }}>Risk Disclaimer:</strong> Trading in financial markets
              involves substantial risk of loss. All trading strategies are provided by registered traders and SEBI/SEC-registered
              financial advisors. TradingSmart.AI is a technology platform only — we do not provide financial advice. Past
              performance does not guarantee future results.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
