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
  const [rememberMe, setRememberMe] = useState(true);
  const emailPrefilled = useRef(false);

  useEffect(() => {
    const pre = searchParams.get("email")?.trim();
    if (pre && !emailPrefilled.current) {
      setEmail(pre);
      emailPrefilled.current = true;
    }
  }, [searchParams]);

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
    <div className="relative min-h-screen overflow-hidden bg-[#020817] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.08),transparent_35%),radial-gradient(circle_at_85%_25%,rgba(45,212,191,0.08),transparent_30%),radial-gradient(circle_at_55%_90%,rgba(99,102,241,0.08),transparent_35%)]" />
        <div className="absolute -left-20 top-14 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -right-20 top-1/4 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute inset-0 backdrop-blur-[2px]" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-[440px] rounded-2xl border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(17,27,48,0.96),rgba(10,15,28,0.96))] shadow-[0_30px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          {/* <div className="flex items-start justify-end px-4 pt-4">
            <button
              type="button"
              aria-label="Close login"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] text-slate-400 transition hover:border-cyan-300/30 hover:text-slate-200"
            >
              <FaXmark />
            </button>
          </div> */}

          <div className="px-6 pb-7 pt-4">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 text-sm text-white shadow-[0_8px_24px_rgba(34,211,238,0.35)]">
                <FaArrowUpRightFromSquare />
              </div>
              <h1 className="text-[33px] font-semibold tracking-[-0.01em] text-slate-100">
                Welcome back
              </h1>
              <p className="mt-1.5 text-xs text-slate-400">
                Sign in to your TradingSmart.AI command center
              </p>
            </div>

            <form onSubmit={onSubmit} autoComplete="on" className="space-y-4">
              {showErr ? (
                <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {errText || "Invalid credentials. Please try again."}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="loginEmail"
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400"
                >
                  Email Address
                </label>
                <input
                  id="loginEmail"
                  type="email"
                  name="email"
                  placeholder="you@yourcompany.com"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border border-cyan-200/10 bg-[#040c1f] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="loginPassword"
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[2.5px] text-slate-400"
                >
                  Password
                </label>
                <input
                  id="loginPassword"
                  type="password"
                  name="password"
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-xl border border-cyan-200/10 bg-[#040c1f] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-cyan-300/30 bg-[#041025] text-cyan-400 focus:ring-cyan-400/40"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-[11px] text-cyan-300/90 transition hover:text-cyan-200"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-blue-500 text-[11px] font-semibold uppercase tracking-[2.2px] text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {busy ? "Authenticating..." : "Access Dashboard"}
                <FaArrowRight className="text-[10px]" />
              </button>
            </form>

            <div className="my-4 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

            <div className="text-center">
              <p className="text-[10px] uppercase tracking-[2.5px] text-slate-500">
                New to TradingSmart
              </p>
              <p className="mt-2 text-[13px] text-slate-300">
                Don&apos;t have an account?{" "}
                <Link
                  to="/request-access"
                  className="font-semibold text-cyan-300 transition hover:text-cyan-200"
                >
                  Request access
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
