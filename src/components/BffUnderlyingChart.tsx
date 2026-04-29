/**
 * Broker-backed INR chart for MCX/NCDEX underliers (OpenAlgo history + live LTP).
 * Prefer this over Yahoo (CL=F USD) when trading Indian commodities.
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
import { bffConfigured, bffFetch } from "@/lib/api";
import { fetchLtp } from "@/lib/optionsApi";

const CHART_BG = "#0a0a0f";
const GRID_COLOR = "rgba(255,255,255,0.04)";
const TEXT_COLOR = "#8c8c9c";
const UP_COLOR = "#00b09b";
const DOWN_COLOR = "#e03a3e";
const VOLUME_UP = "rgba(0,176,155,0.35)";
const VOLUME_DOWN = "rgba(224,58,62,0.35)";
const CROSSHAIR_CLR = "rgba(255,255,255,0.3)";

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
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const open = Number(r.open ?? r.o);
    const high = Number(r.high ?? r.h);
    const low = Number(r.low ?? r.l);
    const close = Number(r.close ?? r.c);
    if (![open, high, low, close].every((n) => Number.isFinite(n))) continue;

    let tsec = 0;
    const ts = r.timestamp ?? r.time ?? r.date ?? r.ts;
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
      volume: r.volume != null ? Number(r.volume) : r.v != null ? Number(r.v) : undefined,
    });
  }
  out.sort((a, b) => a.time - b.time);
  // De-dupe by time (keep last)
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSerRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSerRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastCandleRef = useRef<CandlestickData | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const [loading, setLoading] = useState(true);
  const [silentRefresh, setSilentRefresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  /** First candle open after load — for day change % vs LTP close. */
  const [sessionRefOpen, setSessionRefOpen] = useState<number | null>(null);
  const [lastLtpPoll, setLastLtpPoll] = useState<number>(0);
  const [, setClockTick] = useState(0);

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
        scaleMargins: { top: 0.06, bottom: 0.2 },
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
    const volSer = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

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
  }, []);

  const applyBars = useCallback((bars: CandleRow[]) => {
    const priceSer = priceSerRef.current;
    const volSer = volumeSerRef.current;
    if (!priceSer || !volSer || bars.length === 0) return;

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
      volData.push({
        time: t,
        value: Math.max(0, vol),
        color: c.close >= c.open ? VOLUME_UP : VOLUME_DOWN,
      });
    }
    try {
      priceSer.setData(priceData);
      volSer.setData(volData);
      chartRef.current?.timeScale().fitContent();
    } catch {
      /* noop */
    }
    const last = bars[bars.length - 1]?.close ?? null;
    if (last != null && Number.isFinite(last)) setLivePrice(last);
    const first = bars[0]?.open ?? null;
    if (first != null && Number.isFinite(first)) setSessionRefOpen(first);
  }, []);

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
        const startDt = new Date(Date.now() - 7 * 86400000);
        const start = istCalendarDate(startDt);

        const raw = await bffFetch<unknown>("/api/options/history", {
          method: "POST",
          body: JSON.stringify({
            symbol,
            exchange,
            interval: "5m",
            start_date: start,
            end_date: end,
          }),
        });

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
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setSilentRefresh(false);
      }
    },
    [symbol, exchange, applyBars],
  );

  useEffect(() => {
    void loadHistory(false);
  }, [loadHistory]);

  useEffect(() => {
    const id = window.setInterval(() => void loadHistory(true), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [loadHistory]);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick((x) => x + 1), 4000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!symbol || !exchange) return;
    let cancelled = false;

    const tick = async () => {
      const ltp = await fetchLtp(symbol, exchange);
      if (cancelled) return;
      setLastLtpPoll(Date.now());
      if (ltp != null && Number.isFinite(ltp)) {
        setLivePrice(ltp);
        const lp = priceSerRef.current;
        const last = lastCandleRef.current;
        if (lp && last && typeof last.time !== "undefined") {
          try {
            const next: CandlestickData = {
              time: last.time,
              open: last.open,
              high: Math.max(last.high, ltp),
              low: Math.min(last.low, ltp),
              close: ltp,
            };
            lp.update(next);
            lastCandleRef.current = next;
          } catch {
            /* noop */
          }
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [symbol, exchange]);

  const pct =
    livePrice != null && sessionRefOpen != null && sessionRefOpen > 0
      ? ((livePrice - sessionRefOpen) / sessionRefOpen) * 100
      : null;

  const display = props.displayName?.trim() || symbol;
  const feedFresh = lastLtpPoll > 0 && Date.now() - lastLtpPoll <= 35_000;

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
            {feedFresh ? "Live (polling)" : "Stale"}
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
        Data: broker / OpenAlgo (5m candles, INR).
      </p>
    </div>
  );
}
