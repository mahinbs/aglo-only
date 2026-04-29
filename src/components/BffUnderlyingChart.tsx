/**
 * Broker-backed INR chart for MCX/NCDEX underliers (OpenAlgo history + WS LTP stream).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
  CrosshairMode,
  LineStyle,
  ColorType,
} from "lightweight-charts";
import { Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { bffConfigured, bffFetch } from "@/lib/api";
import { fetchLtp } from "@/lib/optionsApi";
import { buildOptionsWebSocketUrl } from "@/hooks/useRealtimeStrategy";

const CHART_BG = "#0a0a0f";
const GRID_COLOR = "rgba(255,255,255,0.04)";
const TEXT_COLOR = "#8c8c9c";
const UP_COLOR = "#00b09b";
const DOWN_COLOR = "#e03a3e";
const VOLUME_UP = "rgba(0,176,155,0.35)";
const VOLUME_DOWN = "rgba(224,58,62,0.35)";
const CROSSHAIR_CLR = "rgba(255,255,255,0.3)";

/** 5-minute bars (must match REST history interval). */
const BAR_SEC = 300;

interface CandleRow {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
}

function istCalendarDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function isOptionContractSymbol(sym: string): boolean {
  const s = String(sym || "").trim().toUpperCase();
  if (!s) return false;
  if (!/(CE|PE)$/.test(s)) return false;
  return /\d/.test(s);
}

function timeToUnixSec(t: Time): number {
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    try {
      return Math.floor(new Date(t).getTime() / 1000);
    } catch {
      return 0;
    }
  }
  return 0;
}

function normalizeHistoryPayload(raw: unknown): CandleRow[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw != null && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const d = o.data;
    if (Array.isArray(d)) list = d;
    else if (Array.isArray(o.candles)) list = o.candles as unknown[];
    else if (Array.isArray(o.result)) list = o.result as unknown[];
  }
  const out: CandleRow[] = [];
  for (const row of list) {
    let open = NaN;
    let high = NaN;
    let low = NaN;
    let close = NaN;
    let ts: unknown = null;
    let volume: unknown = undefined;

    if (Array.isArray(row)) {
      // Common OpenAlgo/broker format: [timestamp, open, high, low, close, volume]
      ts = row[0];
      open = Number(row[1]);
      high = Number(row[2]);
      low = Number(row[3]);
      close = Number(row[4]);
      volume = row[5];
    } else if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      open = Number(r.open ?? r.o);
      high = Number(r.high ?? r.h);
      low = Number(r.low ?? r.l);
      close = Number(r.close ?? r.c);
      ts = r.timestamp ?? r.time ?? r.date ?? r.ts;
      volume = r.volume != null ? r.volume : r.v;
    } else {
      continue;
    }

    if (![open, high, low, close].every((n) => Number.isFinite(n))) continue;

    let tsec = 0;
    if (typeof ts === "number") {
      tsec = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
    } else if (typeof ts === "string" && ts.length >= 10) {
      try {
        tsec = Math.floor(new Date(ts.replace(/\s+/g, "T")).getTime() / 1000);
      } catch {
        continue;
      }
    }
    if (tsec <= 0) continue;

    out.push({
      time: tsec,
      open,
      high,
      low,
      close,
      volume: volume != null ? Number(volume) : undefined,
    });
  }
  out.sort((a, b) => a.time - b.time);
  const merged: CandleRow[] = [];
  let prevT = -1;
  for (const c of out) {
    if (c.time === prevT && merged.length) merged[merged.length - 1] = c;
    else merged.push(c);
    prevT = c.time;
  }
  return merged;
}

export default function BffUnderlyingChart(props: {
  symbol: string;
  exchange: string;
  displayName?: string | null;
}) {
  const { symbol: rawSym, exchange: rawEx } = props;
  const symbol = String(rawSym || "").trim().toUpperCase();
  const exchange = String(rawEx || "").trim().toUpperCase();
  const isOptionContract = isOptionContractSymbol(symbol);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSerRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSerRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastCandleRef = useRef<CandlestickData | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const [loading, setLoading] = useState(true);
  const [silentRefresh, setSilentRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRealHistory, setHasRealHistory] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [sessionRefOpen, setSessionRefOpen] = useState<number | null>(null);
  const [lastTickAt, setLastTickAt] = useState<number>(0);
  /** Bumped on an interval so "Stale" updates when ticks stop without a redraw. */
  const [clockTick, setClockTick] = useState(0);
  const [transport, setTransport] = useState<"ws" | "poll" | "none">("none");

  const buildChart = useCallback(() => {
    if (!containerRef.current) return;
    roRef.current?.disconnect();
    roRef.current = null;
    chartRef.current?.remove();
    chartRef.current = null;
    priceSerRef.current = null;
    volumeSerRef.current = null;
    lastCandleRef.current = null;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: TEXT_COLOR,
        fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID_COLOR, style: LineStyle.Solid },
        horzLines: { color: GRID_COLOR, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CROSSHAIR_CLR, width: 1, labelBackgroundColor: "#1e1e2e" },
        horzLine: { color: CROSSHAIR_CLR, width: 1, labelBackgroundColor: "#1e1e2e" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        textColor: TEXT_COLOR,
        scaleMargins: { top: 0.06, bottom: isOptionContract ? 0.06 : 0.2 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
      },
      handleScroll: true,
      handleScale: true,
    });

    const priceSer = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });
    const volSer = isOptionContract
      ? null
      : chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
        });
    if (volSer) {
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    }

    chartRef.current = chart;
    priceSerRef.current = priceSer;
    volumeSerRef.current = volSer;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || chartRef.current !== chart) return;
      try {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      } catch {
        /* noop */
      }
    });
    ro.observe(containerRef.current);
    roRef.current = ro;
    chart.applyOptions({
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });
  }, [isOptionContract]);

  const applyIncomingLtp = useCallback((ltp: number, source: "ws" | "poll") => {
    if (!Number.isFinite(ltp) || ltp <= 0) return;
    setLivePrice(ltp);
    setLastTickAt(Date.now());
    setTransport(source);
    // If history request is slow/stuck, unblock the chart as soon as live ticks arrive.
    setLoading(false);
    setSilentRefresh(false);
    setError(null);

    const lp = priceSerRef.current;
    const volSer = volumeSerRef.current;
    const last = lastCandleRef.current;
    if (!lp) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowSec / BAR_SEC) * BAR_SEC;
    if (!last) {
      try {
        const seedBars: CandlestickData[] = [];
        const seedVol: HistogramData[] = [];
        for (let i = 23; i >= 0; i -= 1) {
          const t = (bucket - i * BAR_SEC) as unknown as Time;
          seedBars.push({
            time: t,
            open: ltp,
            high: ltp,
            low: ltp,
            close: ltp,
          });
          seedVol.push({
            time: t,
            value: Math.max(1, Math.round(ltp / 80)),
            color: VOLUME_UP,
          } as HistogramData);
        }
        lp.setData(seedBars);
        volSer?.setData(seedVol);
        lastCandleRef.current = seedBars[seedBars.length - 1] ?? null;
        chartRef.current?.timeScale().fitContent();
      } catch {
        /* noop */
      }
      return;
    }
    const prevSec = timeToUnixSec(last.time);

    try {
      if (bucket > prevSec) {
        const nw: CandlestickData = {
          time: bucket as unknown as Time,
          open: ltp,
          high: ltp,
          low: ltp,
          close: ltp,
        };
        lp.update(nw);
        lastCandleRef.current = nw;
        volSer?.update({
          time: bucket as unknown as Time,
          value: Math.max(1, Math.round(ltp / 80)),
          color: VOLUME_UP,
        } as HistogramData);
      } else {
        const nw: CandlestickData = {
          time: last.time,
          open: last.open,
          high: Math.max(last.high, ltp),
          low: Math.min(last.low, ltp),
          close: ltp,
        };
        lp.update(nw);
        lastCandleRef.current = nw;
      }
    } catch {
      /* noop */
    }
  }, []);

  const applyBars = useCallback(
    (bars: CandleRow[]) => {
      const priceSer = priceSerRef.current;
      const volSer = volumeSerRef.current;
      if (!priceSer || bars.length === 0) return;

      const priceData: CandlestickData[] = [];
      const volData: HistogramData[] = [];

      for (const c of bars) {
        const t = c.time as unknown as Time;
        const cd: CandlestickData = {
          time: t,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        };
        priceData.push(cd);
        lastCandleRef.current = cd;
        const vol =
          c.volume != null && Number.isFinite(c.volume)
            ? c.volume
            : Math.round((c.high + c.low + c.close) / 30);
        if (volSer) {
          volData.push({
            time: t,
            value: Math.max(0, vol),
            color: c.close >= c.open ? VOLUME_UP : VOLUME_DOWN,
          });
        }
      }
      try {
        priceSer.setData(priceData);
        if (volSer) volSer.setData(volData);
        chartRef.current?.timeScale().fitContent();
      } catch {
        /* noop */
      }
      setHasRealHistory(true);
      setError(null);
      const last = bars[bars.length - 1]?.close ?? null;
      if (last != null && Number.isFinite(last)) setLivePrice(last);
      const lastBar = bars[bars.length - 1] ?? null;
      const targetDate = lastBar ? istCalendarDate(new Date(lastBar.time * 1000)) : "";
      const firstSessionBar =
        bars.find((b) => istCalendarDate(new Date(b.time * 1000)) === targetDate) ?? bars[0];
      const first = firstSessionBar?.open ?? null;
      if (first != null && Number.isFinite(first)) setSessionRefOpen(first);
    },
    [],
  );

  useEffect(() => {
    buildChart();
    return () => {
      roRef.current?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [buildChart]);

  const loadHistory = useCallback(
    async (silent: boolean) => {
      if (!symbol || !exchange) return;
      if (!bffConfigured()) {
        setError("BFF not configured (session required for INR chart).");
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const end = istCalendarDate(new Date());
        const lookbackDays = isOptionContract ? 1 : 7;
        const startDt = new Date(Date.now() - lookbackDays * 86400000);
        const start = istCalendarDate(startDt);

        const historyReq = bffFetch<unknown>("/api/options/history", {
          method: "POST",
          body: JSON.stringify({
            symbol,
            exchange,
            interval: "5m",
            start_date: start,
            end_date: end,
          }),
        });
        const timeoutReq = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("History timeout (using live ticks).")), 12000);
        });
        const raw = await Promise.race([historyReq, timeoutReq]);

        let bars = normalizeHistoryPayload(raw);
        if (
          bars.length === 0 &&
          raw !== null &&
          typeof raw === "object" &&
          "data" in (raw as object)
        ) {
          bars = normalizeHistoryPayload((raw as { data?: unknown }).data);
        }
        if (!bars.length) {
          throw new Error("No candles returned — check broker session and symbol.");
        }
        applyBars(bars);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setSilentRefresh(false);
      }
    },
    [symbol, exchange, applyBars, isOptionContract],
  );

  useEffect(() => {
    void loadHistory(false);
  }, [loadHistory]);

  useEffect(() => {
    setHasRealHistory(false);
  }, [symbol, exchange]);

  useEffect(() => {
    const id = window.setInterval(() => void loadHistory(true), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [loadHistory]);

  useEffect(() => {
    if (hasRealHistory || !symbol || !exchange) return undefined;
    const id = window.setInterval(() => void loadHistory(true), 15_000);
    return () => window.clearInterval(id);
  }, [hasRealHistory, symbol, exchange, loadHistory]);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick((x) => x + 1), 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!symbol || !exchange) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let pollId: number | null = null;
    let reconnectTimer: number | null = null;
    let wsConnectSlowTimer: number | null = null;

    const clearPoll = () => {
      if (pollId != null) {
        window.clearInterval(pollId);
        pollId = null;
      }
    };

    const startPolling = () => {
      clearPoll();
      pollId = window.setInterval(async () => {
        if (cancelled) return;
        const ltp = await fetchLtp(symbol, exchange);
        if (cancelled || ltp == null || !Number.isFinite(ltp)) return;
        applyIncomingLtp(ltp, "poll");
      }, 5000);
    };

    const connectWs = async () => {
      if (cancelled) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const path =
        `/ws/options/ltp?token=${encodeURIComponent(token ?? "")}` +
        `&symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`;
      const url = buildOptionsWebSocketUrl(path);
      if (!token || !url) {
        setTransport("poll");
        startPolling();
        return;
      }

      try {
        ws = new WebSocket(url);
      } catch {
        setTransport("poll");
        startPolling();
        return;
      }

      wsConnectSlowTimer = window.setTimeout(() => {
        if (cancelled || !ws || ws.readyState === WebSocket.OPEN) return;
        startPolling();
      }, 10_000);

      ws.onopen = () => {
        if (wsConnectSlowTimer != null) window.clearTimeout(wsConnectSlowTimer);
        wsConnectSlowTimer = null;
        clearPoll();
        setTransport("ws");
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type?: string;
            ltp?: number | null;
          };
          if (msg.type === "ltp" && msg.ltp != null && Number.isFinite(Number(msg.ltp))) {
            applyIncomingLtp(Number(msg.ltp), "ws");
          }
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* noop */
        }
      };
      ws.onclose = (ev) => {
        if (cancelled) return;
        setTransport("poll");
        startPolling();
        if (ev.code === 4003 || ev.code === 4001) return;
        reconnectTimer = window.setTimeout(() => void connectWs(), 4000);
      };
    };

    void connectWs();

    return () => {
      cancelled = true;
      clearPoll();
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      if (wsConnectSlowTimer != null) window.clearTimeout(wsConnectSlowTimer);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      setTransport("none");
    };
  }, [symbol, exchange, applyIncomingLtp]);

  const pct =
    livePrice != null && sessionRefOpen != null && sessionRefOpen > 0
      ? ((livePrice - sessionRefOpen) / sessionRefOpen) * 100
      : null;

  const display = props.displayName?.trim() || symbol;
  const feedFresh =
    clockTick >= 0 && lastTickAt > 0 && Date.now() - lastTickAt <= 35_000;

  const feedLabel = (() => {
    if (!feedFresh) return "Stale";
    if (transport === "ws") return "Live (WS)";
    if (transport === "poll") return "Live (polling)";
    return "—";
  })();

  return (
    <div className="rounded-lg border border-white/10 bg-[#07070d] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-2 py-1.5 text-[11px]">
        <div className="min-w-0 flex items-center gap-2">
          <span className="truncate font-semibold text-foreground/95">{display}</span>
          <span className="shrink-0 rounded px-1.5 py-0.5 bg-white/10 text-[10px] text-muted-foreground">
            {exchange}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {exchange === "NCDEX" ? "Agri / IN" : "INR"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 tabular-nums">
          <span className="text-foreground font-medium">
            {livePrice != null
              ? `₹${livePrice.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "—"}
          </span>
          {pct != null ? (
            <span className={`flex items-center gap-0.5 ${pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {pct >= 0 ? (
                <TrendingUp className="h-3 w-3" aria-hidden />
              ) : (
                <TrendingDown className="h-3 w-3" aria-hidden />
              )}
              {pct >= 0 ? "+" : ""}
              {pct.toFixed(2)}%
            </span>
          ) : null}
          <span
            className={
              feedFresh
                ? "inline-flex items-center gap-1 text-[10px] text-emerald-400"
                : "inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            }
          >
            <span className={`h-1.5 w-1.5 rounded-full ${feedFresh ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            {feedLabel}
          </span>
          <button
            type="button"
            title="Reload candles"
            disabled={silentRefresh || loading}
            className="inline-flex rounded p-1 hover:bg-white/10 disabled:opacity-40"
            onClick={() => {
              setSilentRefresh(true);
              void loadHistory(false);
            }}
          >
            {loading && !silentRefresh ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      <div className="relative h-[284px]" ref={containerRef}>
        {(loading || silentRefresh) && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/30">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500/70" aria-label="Loading" />
          </div>
        )}
        {error ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-amber-300/95">
            {error}
          </div>
        ) : null}
      </div>
      <p className="px-2 py-1 text-[10px] text-muted-foreground border-t border-white/[0.05]">
        Historical: broker / OpenAlgo (5m INR). Live: WS LTP from options API — falls back to broker quotes poll if unavailable.
      </p>
    </div>
  );
}
