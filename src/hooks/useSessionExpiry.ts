import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { bffConfigured, bffLogout } from "@/lib/api";
import { supabase } from "@/lib/supabase";

/** Daily session end ~15:30 IST + idle timeout (SEBI-oriented). */
export function useSessionExpiry(idleMs = 30 * 60 * 1000) {
  const navigate = useNavigate();

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(async () => {
        await bffLogout();
        await supabase.auth.signOut();
        navigate("/login?reason=idle", { replace: true });
      }, idleMs);
    };
    const events = ["mousemove", "keydown", "click", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();

    const istInterval = setInterval(() => {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const ist = new Date(utc + 5.5 * 60 * 60000);
      const mins = ist.getHours() * 60 + ist.getMinutes();
      if (mins >= 15 * 60 + 35) {
        void (async () => {
          await bffLogout();
          await supabase.auth.signOut();
          navigate("/login?reason=eod", { replace: true });
        })();
      }
    }, 60_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle));
      if (idleTimer) clearTimeout(idleTimer);
      clearInterval(istInterval);
    };
  }, [idleMs, navigate]);

  useEffect(() => {
    if (!bffConfigured()) return;
    const t = setInterval(() => {
      void fetch(`${import.meta.env.VITE_ALGO_ONLY_BFF_URL?.replace(/\/$/, "")}/api/auth/me`, {
        credentials: "include",
      }).then((r) => {
        if (r.status === 401) {
          void supabase.auth.signOut();
          navigate("/login?reason=session", { replace: true });
        }
      });
    }, 120_000);
    return () => clearInterval(t);
  }, [navigate]);
}
