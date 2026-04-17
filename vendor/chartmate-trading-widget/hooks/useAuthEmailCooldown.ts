import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "chartmate_auth_email_cooldown_until";

export function formatCooldownMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function readUntilMs(): number {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return 0;
  const t = parseInt(raw, 10);
  return Number.isFinite(t) ? t : 0;
}

export function useAuthEmailCooldown() {
  const [untilMs, setUntilMs] = useState(() => readUntilMs());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (untilMs <= 0) return;
    if (Date.now() >= untilMs) {
      sessionStorage.removeItem(STORAGE_KEY);
      setUntilMs(0);
    }
  }, [tick, untilMs]);

  const now = Date.now();
  const active = untilMs > now;
  const remainingSec = active ? Math.ceil((untilMs - now) / 1000) : 0;

  /** Duration from Supabase/GoTrue error parsing (seconds until retry is allowed). */
  const startCooldownSeconds = useCallback((seconds: number) => {
    const s = Math.floor(seconds);
    if (!Number.isFinite(s) || s < 1) return;
    const capped = Math.min(s, 24 * 60 * 60);
    const u = Date.now() + capped * 1000;
    sessionStorage.setItem(STORAGE_KEY, String(u));
    setUntilMs(u);
  }, []);

  const clearCooldown = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setUntilMs(0);
  }, []);

  return {
    active,
    remainingSec,
    mmss: formatCooldownMmSs(remainingSec),
    startCooldownSeconds,
    clearCooldown,
  };
}
