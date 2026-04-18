import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import { bffConfigured, bffFetch } from "@/lib/api";

function istYmd(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function toFinite(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rowTimeSec(row: Record<string, unknown>): number | null {
  const ts = row.timestamp ?? row.time ?? row.datetime;
  if (typeof ts === "number" && Number.isFinite(ts)) {
    return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  }
  if (typeof ts === "string" && ts.trim()) {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  return null;
}

function parseHistoryCandles(raw: unknown): CandlestickData[] {
  const root = raw as { data?: unknown[] };
  const rows = Array.isArray(root?.data) ? root.data : [];
  const out: CandlestickData[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const t = rowTimeSec(o);
    if (t == null) continue;
    const open = toFinite(o.open);
    const high = toFinite(o.high);
    const low = toFinite(o.low);
    const close = toFinite(o.close);
    if (open == null || high == null || low == null || close == null) continue;
    out.push({ time: t as Time, open, high, low, close });
  }
  out.sort((a, b) => (a.time as number) - (b.time as number));
  return out;
}

function bucketStart(interval: string, tsSec: number): number {
  const m = /^(\d+)m$/.exec(interval.trim());
  const sec = m ? Math.max(60, parseInt(m[1], 10) * 60) : 300;
  return Math.floor(tsSec / sec) * sec;
}

export type StrategyLiveChartProps = {
  accessToken: string;
  symbol: string;
  historyExchange: string;
  quoteExchange: string;
  interval?: string;
  height?: number;
  entryPrice?: number | null;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
};

export function StrategyLiveChart({
  accessToken,
  symbol,
  historyExchange,
  quoteExchange,
  interval = "5m",
  height = 220,
  entryPrice,
  stopLossPrice,
  takeProfitPrice,
}: StrategyLiveChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<CandlestickData | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const [seriesApi, setSeriesApi] = useState<ISeriesApi<"Candlestick"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [spot, setSpot] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(148, 163, 184, 0.95)",
      },
      grid: {
        vertLines: { color: "rgba(51, 65, 85, 0.35)" },
        horzLines: { color: "rgba(51, 65, 85, 0.35)" },
      },
      crosshair: { mode: CrosshairMode.Magnet },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#4ade80",
      downColor: "#f87171",
      borderVisible: false,
      wickUpColor: "#4ade80",
      wickDownColor: "#f87171",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    setSeriesApi(series);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);
    chart.applyOptions({ width: el.clientWidth });

    return () => {
      ro.disconnect();
      for (const pl of priceLinesRef.current) {
        try {
          series.removePriceLine(pl);
        } catch {
          /* ignore */
        }
      }
      priceLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      lastCandleRef.current = null;
      setSeriesApi(null);
    };
  }, [height]);

  const clearPriceLines = useCallback(() => {
    const s = seriesRef.current;
    if (!s) return;
    for (const pl of priceLinesRef.current) {
      try {
        s.removePriceLine(pl);
      } catch {
        /* ignore */
      }
    }
    priceLinesRef.current = [];
  }, []);

  const applyPriceLines = useCallback(() => {
    const s = seriesRef.current;
    if (!s) return;
    clearPriceLines();
    const add = (price: number | null | undefined, color: string, title: string) => {
      if (price == null || !Number.isFinite(price)) return;
      priceLinesRef.current.push(
        s.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        }),
      );
    };
    add(entryPrice ?? undefined, "rgba(148, 163, 184, 0.9)", "Entry");
    add(stopLossPrice ?? undefined, "rgba(248, 113, 113, 0.95)", "SL");
    add(takeProfitPrice ?? undefined, "rgba(74, 222, 128, 0.95)", "TP");
  }, [entryPrice, stopLossPrice, takeProfitPrice, clearPriceLines]);

  useEffect(() => {
    if (!seriesApi) return;
    let cancelled = false;
    (async () => {
      if (!bffConfigured() || !accessToken || !symbol.trim()) {
        setErr("BFF not configured");
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr(null);
      const day = istYmd();
      try {
        const res = await bffFetch<unknown>("/api/options/history", accessToken, {
          method: "POST",
          body: JSON.stringify({
            symbol: symbol.trim().toUpperCase(),
            exchange: historyExchange.trim().toUpperCase(),
            interval,
            start_date: day,
            end_date: day,
          }),
        });
        if (cancelled) return;
        const candles = parseHistoryCandles(res);
        seriesApi.setData(candles);
        lastCandleRef.current = candles.length ? candles[candles.length - 1] : null;
        chartRef.current?.timeScale().fitContent();
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "History failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesApi, accessToken, symbol, historyExchange, interval]);

  useEffect(() => {
    if (!seriesApi) return;
    applyPriceLines();
  }, [seriesApi, applyPriceLines]);

  useEffect(() => {
    if (!seriesApi || !bffConfigured() || !accessToken || !symbol.trim()) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const q = await bffFetch<{ ltp?: number; data?: { ltp?: unknown } }>(
          "/api/options/quotes",
          accessToken,
          {
            method: "POST",
            body: JSON.stringify({
              symbol: symbol.trim().toUpperCase(),
              exchange: quoteExchange.trim().toUpperCase(),
            }),
          },
        );
        if (cancelled) return;
        const raw = (q as { ltp?: unknown }).ltp ?? (q as { data?: { ltp?: unknown } }).data?.ltp;
        const n = toFinite(raw);
        setSpot(n);
        const s = seriesRef.current;
        if (!s || n == null) return;
        const now = Math.floor(Date.now() / 1000);
        const b = bucketStart(interval, now);
        const lc = lastCandleRef.current;
        if (lc && b === (lc.time as number)) {
          const next: CandlestickData = {
            time: lc.time,
            open: lc.open,
            high: Math.max(lc.high, n),
            low: Math.min(lc.low, n),
            close: n,
          };
          s.update(next);
          lastCandleRef.current = next;
        } else if (lc && b > (lc.time as number)) {
          const next: CandlestickData = {
            time: b as Time,
            open: n,
            high: n,
            low: n,
            close: n,
          };
          s.update(next);
          lastCandleRef.current = next;
        } else if (!lc) {
          const next: CandlestickData = {
            time: b as Time,
            open: n,
            high: n,
            low: n,
            close: n,
          };
          s.update(next);
          lastCandleRef.current = next;
        }
      } catch {
        /* ignore quote errors */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [seriesApi, accessToken, symbol, quoteExchange, interval]);

  return (
    <div className="rounded-md border border-border/50 bg-muted/10 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border/40 text-[10px] text-muted-foreground">
        <span className="font-mono truncate">
          {symbol.toUpperCase()} · {interval} · {historyExchange}
          {spot != null ? <span className="text-foreground ml-2">LTP {spot.toFixed(2)}</span> : null}
        </span>
        {loading ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> : null}
      </div>
      {err ? <div className="text-[11px] text-destructive px-2 py-2">{err}</div> : null}
      <div ref={wrapRef} style={{ width: "100%", height }} />
    </div>
  );
}
