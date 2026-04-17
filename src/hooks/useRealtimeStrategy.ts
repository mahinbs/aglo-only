import { useCallback, useEffect, useRef, useState } from "react";

function httpBaseToWs(base: string): string {
  const b = base.replace(/\/$/, "");
  if (b.startsWith("https://")) return `wss://${b.slice(8)}`;
  if (b.startsWith("http://")) return `ws://${b.slice(7)}`;
  return b;
}

function optionsServiceBase(): string {
  const direct = (import.meta.env.VITE_OPTIONS_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const bff = (import.meta.env.VITE_ALGO_ONLY_BFF_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  return direct || bff;
}

export type OptionsPositionsFrame = {
  type?: string;
  stale?: boolean;
  data?: unknown[];
};

/**
 * WebSocket stream for `/ws/options/positions/{userId}` with exponential backoff reconnect.
 * Requires a reachable options API (VITE_OPTIONS_API_URL or BFF); WS is not proxied through BFF-only HTTP.
 */
export function useOptionsPositionsStream(opts: {
  enabled: boolean;
  userId?: string | null;
  token?: string | null;
}): { lastFrame: OptionsPositionsFrame | null; connected: boolean; reconnectAttempt: number } {
  const [lastFrame, setLastFrame] = useState<OptionsPositionsFrame | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const attemptRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const connect = useCallback(() => {
    clearTimer();
    const base = optionsServiceBase();
    if (!opts.enabled || !base || !opts.userId || !opts.token) {
      setConnected(false);
      return;
    }
    const wsUrl = `${httpBaseToWs(base)}/ws/options/positions/${opts.userId}?token=${encodeURIComponent(opts.token)}`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        attemptRef.current = 0;
        setReconnectAttempt(0);
      };
      ws.onmessage = (ev) => {
        try {
          setLastFrame(JSON.parse(String(ev.data)) as OptionsPositionsFrame);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        attemptRef.current += 1;
        setReconnectAttempt(attemptRef.current);
        if (!opts.enabled || attemptRef.current > 80) return;
        const exp = Math.min(30_000, 1000 * 2 ** Math.min(attemptRef.current - 1, 5));
        const jitter = Math.floor(Math.random() * 400);
        timerRef.current = window.setTimeout(() => connect(), exp + jitter);
      };
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    } catch {
      setConnected(false);
      attemptRef.current += 1;
      timerRef.current = window.setTimeout(() => connect(), 3000);
    }
  }, [opts.enabled, opts.userId, opts.token]);

  useEffect(() => {
    connect();
    return () => {
      clearTimer();
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, [connect]);

  return { lastFrame, connected, reconnectAttempt };
}
