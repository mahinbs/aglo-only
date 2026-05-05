import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { bffConfigured, bffLogout, bffMe } from "@/lib/api";
import { supabase } from "@/lib/supabase";

/** Session guard: idle timeout + backend session invalidation. */
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

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle));
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [idleMs, navigate]);

  useEffect(() => {
    if (!bffConfigured()) return;
    const t = setInterval(() => {
      void bffMe()
        .then((me) => {
          if (!me) {
            void supabase.auth.signOut();
            navigate("/login?reason=session", { replace: true });
          }
        })
        .catch(() => {
          void supabase.auth.signOut();
          navigate("/login?reason=session", { replace: true });
        });
    }, 120_000);
    return () => clearInterval(t);
  }, [navigate]);
}
