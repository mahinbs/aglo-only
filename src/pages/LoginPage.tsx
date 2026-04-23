import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { FaArrowRight, FaArrowUpRightFromSquare, FaXmark } from "react-icons/fa6";
import { useAuth } from "@/hooks/useAuth";

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
    return <Navigate to={r && r.startsWith("/") ? r : "/dashboard"} replace />;
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
      navigate(r && r.startsWith("/") ? r : "/dashboard", { replace: true });
    } finally {
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
      <div className="login-particles" ref={particlesRef} />
      <div className="login-container flex min-h-screen items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-[420px] rounded-2xl border border-[rgba(56,189,248,0.14)] bg-[linear-gradient(180deg,rgba(11,17,33,0.96),rgba(6,10,22,0.96))] shadow-[0_24px_90px_rgba(2,6,23,0.72)] backdrop-blur-md"
          style={{ boxShadow: "0 24px 90px rgba(2,6,23,0.72), inset 0 1px 0 rgba(148,163,184,0.12)" }}
        >
          <div className="flex items-center justify-end p-3 pb-0">
            <button
              type="button"
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-full border border-[rgba(148,163,184,0.2)] text-[rgba(148,163,184,0.85)] transition-colors hover:text-white"
              onClick={() => navigate("/")}
            >
              <FaXmark size={11} />
            </button>
          </div>

          <div className="px-7 pb-7 pt-2">
            <div className="mb-7 flex flex-col items-center border-b border-[rgba(56,189,248,0.08)] pb-5 text-center">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,#21c7be,#4f89ff)] text-white shadow-[0_0_20px_rgba(56,189,248,0.35)]">
                <FaArrowUpRightFromSquare size={15} />
              </div>
              <div className="text-[34px] leading-[1.1] font-semibold text-white">Welcome back</div>
              <div className="mt-2 text-[12px] text-[var(--text-muted)]">
                Sign in to your TradingSmart.AI command center
              </div>
            </div>

            <form className="login-form" onSubmit={onSubmit} autoComplete="on">
              {showErr ? (
                <div
                  id="loginError"
                  className="mb-4 rounded-lg border border-[rgba(248,113,113,0.25)] bg-[rgba(127,29,29,0.28)] px-3 py-2 text-[12px] text-[rgb(254,202,202)]"
                >
                  {errText || "Invalid credentials. Please try again."}
                </div>
              ) : null}

              <div className="mb-3.5">
                <label
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]"
                  htmlFor="loginEmail"
                >
                  Email Address
                </label>
                <input
                  id="loginEmail"
                  className="h-11 w-full rounded-[10px] border border-[rgba(56,189,248,0.12)] bg-[rgba(2,8,22,0.9)] px-3.5 text-[14px] text-white outline-none transition focus:border-[rgba(56,189,248,0.45)]"
                  type="email"
                  name="email"
                  placeholder="you@yourcompany.com"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="mb-3.5">
                <label
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]"
                  htmlFor="loginPassword"
                >
                  Password
                </label>
                <input
                  id="loginPassword"
                  className="h-11 w-full rounded-[10px] border border-[rgba(56,189,248,0.12)] bg-[rgba(2,8,22,0.9)] px-3.5 text-[14px] text-white outline-none transition focus:border-[rgba(56,189,248,0.45)]"
                  type="password"
                  name="password"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="mb-5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-3.5 w-3.5 accent-cyan-400"
                  />
                  Remember me
                </label>
                <a href="#" className="text-[rgba(56,189,248,0.85)] hover:text-cyan-300">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[rgba(56,189,248,0.35)] bg-[linear-gradient(90deg,#20c7bc,#4489ff)] text-[12px] font-semibold uppercase tracking-[2px] text-white shadow-[0_8px_24px_rgba(59,130,246,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                id="loginBtn"
                disabled={busy}
              >
                {busy ? "AUTHENTICATING..." : "ACCESS DASHBOARD"}
                {!busy ? <FaArrowRight size={11} /> : null}
              </button>

              <div className="mt-5 border-t border-[rgba(56,189,248,0.08)] pt-4 text-center">
                <div className="text-[10px] uppercase tracking-[2px] text-[var(--text-muted)]">New to TradingSmart</div>
                <div className="mt-2 text-[13px] text-[var(--text-secondary)]">
                  Don&apos;t have an account?{" "}
                  <Link
                    to="/request-access"
                    className="font-medium text-[rgba(56,189,248,0.9)] hover:text-cyan-300"
                  >
                    Request access
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
