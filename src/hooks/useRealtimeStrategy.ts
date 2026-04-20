import { useCallback, useEffect, useRef, useState } from "react";

function httpBaseToWs(base: string): string {
  const b = base.replace(/\/$/, "");
  if (b.startsWith("https://")) return `wss://${b.slice(8)}`;
  if (b.startsWith("http://")) return `ws://${b.slice(7)}`;
  return b;
}

function normalizeBaseOrigin(raw: string): string {
  const v = String(raw || "").trim().replace(/\/$/, "");
  if (!v) return "";
  try {
    const url = new URL(v);
    return `${url.protocol}//${url.host}`;
  } catch {
    // Fallback for plain host values.
    return v.replace(/\/api\/?.*$/i, "").replace(/\/$/, "");
  }
}

function deriveOptionsWsFromBff(): string {
  const bff = (import.meta.env.VITE_ALGO_ONLY_BFF_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  if (!bff) return "";
  try {
    const u = new URL(bff);
    // trading setup convention: algoapi.<domain> serves BFF, options.<domain> serves options API/WS.
    if (u.hostname.startsWith("algoapi.")) {
      u.hostname = `options.${u.hostname.slice("algoapi.".length)}`;
      return httpBaseToWs(u.toString().replace(/\/$/, ""));
    }
  } catch {
    return "";
  }
  return "";
}

function optionsWsBase(): string {
  const explicit = (import.meta.env.VITE_OPTIONS_WS_URL as string | undefined)?.trim() ?? "";
  if (explicit) {
    return normalizeBaseOrigin(explicit);
  }
  const direct = (import.meta.env.VITE_OPTIONS_API_URL as string | undefined)?.trim() ?? "";
  if (direct) return normalizeBaseOrigin(direct);
  return deriveOptionsWsFromBff();
}

export type OptionsPositionsFrame = {
  type?: string;
  stale?: boolean;
  data?: unknown[];
};

/**
 * WebSocket stream for `/ws/options/positions/{userId}` with exponential backoff reconnect.
 * Requires a reachable options API websocket endpoint.
 * BFF HTTP proxy does not support websocket passthrough for this stream.
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
  const stopUntilRef = useRef<number>(0);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const connect = useCallback(() => {
    clearTimer();
    const base = optionsWsBase();
    if (!opts.enabled || !base || !opts.userId || !opts.token) {
      setConnected(false);
      return;
    }
    if (Date.now() < stopUntilRef.current) {
      return;
    }
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
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
        stopUntilRef.current = 0;
      };
      ws.onmessage = (ev) => {
        try {
          setLastFrame(JSON.parse(String(ev.data)) as OptionsPositionsFrame);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = (ev) => {
        setConnected(false);
        wsRef.current = null;
        attemptRef.current += 1;
        setReconnectAttempt(attemptRef.current);
        if (!opts.enabled) return;
        // Auth / policy / malformed URL style closes should pause reconnect
        // until auth state changes instead of spamming connect errors.
        if (ev.code === 1008 || ev.code === 4001 || ev.code === 4003 || attemptRef.current > 16) {
          stopUntilRef.current = Date.now() + 60_000;
          return;
        }
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
    stopUntilRef.current = 0;
    attemptRef.current = 0;
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
