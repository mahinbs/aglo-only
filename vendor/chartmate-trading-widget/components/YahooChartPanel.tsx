import { useState, useEffect, useCallback, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
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
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, ExternalLink, TrendingUp, TrendingDown,
         BarChart2, LineChart, Activity, Wifi, WifiOff } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

/* ─── Types ────────────────────────────────────────────────────────────── */
interface Candle {
  time: number | string;   // Unix seconds (intraday) OR "YYYY-MM-DD" (daily+)
  open: number | null;
  high: number | null;
  low:  number | null;
  close: number | null;
  volume: number | null;
}
interface ChartMeta {
  symbol?: string;
  currency?: string;
  exchangeName?: string;
  regularMarketPrice?: number;
  previousClose?: number;
}

/* ─── Range config ─────────────────────────────────────────────────────── */
const RANGES = [
  { label: "1D",  range: "1d",  interval: "2m"  },
  { label: "5D",  range: "5d",  interval: "15m" },
  { label: "1M",  range: "1mo", interval: "1d"  },
  { label: "3M",  range: "3mo", interval: "1d"  },
  { label: "6M",  range: "6mo", interval: "1d"  },
  { label: "1Y",  range: "1y",  interval: "1wk" },
  { label: "5Y",  range: "5y",  interval: "1mo" },
  { label: "Max", range: "max", interval: "1mo" },
];
type ChartType = "candlestick" | "line" | "area";

/* ─── Helpers ──────────────────────────────────────────────────────────── */
function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)         return n.toLocaleString(undefined, { maximumFractionDigits: dec });
  return n.toFixed(dec);
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace("%", "").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Candles from the edge function are either:
//   • number  → Unix seconds for intraday intervals (preserve exact minute/hour)
//   • string  → "YYYY-MM-DD" for daily/weekly/monthly intervals
function toTime(v: number | string): Time {
  if (typeof v === "number") return v as unknown as Time;   // UTCTimestamp
  if (v.length === 10)       return v as Time;              // business-day "YYYY-MM-DD"
  return Math.floor(new Date(v).getTime() / 1000) as unknown as Time;
}

function formatLocalChartTime(t: Time): string {
  // Render in the user's browser timezone/locale.
  if (typeof t === "number") {
    return new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  // For business day points, show local date.
  if (typeof t === "string") {
    return new Date(`${t}T00:00:00`).toLocaleDateString();
  }
  // BusinessDay object fallback
  if (typeof t === "object" && t && "year" in t && "month" in t && "day" in t) {
    return new Date(t.year, t.month - 1, t.day).toLocaleDateString();
  }
  return String(t);
}

/* ─── Minimal Yahoo Finance protobuf decoder ───────────────────────────── */
// Yahoo Finance WebSocket frames are base64-encoded protobuf messages.
// Field map (reverse-engineered from yahoo-finance-websocket open projects):
//   field 1 = id (string) — symbol
//   field 2 = price (float32)
//   field 3 = time (sint64)
//   field 8 = changePercent (float32)
//   field 9 = dayVolume (sint64)
//   field 12 = change (float32)
function decodeYFProto(bytes: Uint8Array): {
  id?: string; price?: number; time?: number;
  changePercent?: number; change?: number; dayVolume?: number;
} {
  const out: Record<number, unknown> = {};
  let pos = 0;
  while (pos < bytes.length) {
    const tagByte = bytes[pos++];
    const field = tagByte >> 3;
    const wire  = tagByte & 0x7;

    if (wire === 0) {           // varint
      let val = 0, shift = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        val |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      // zigzag decode for sint64 fields
      out[field] = (val >>> 1) ^ -(val & 1);
    } else if (wire === 2) {    // length-delimited
      let len = 0, shift = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        len |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      out[field] = new TextDecoder().decode(bytes.slice(pos, pos + len));
      pos += len;
    } else if (wire === 5) {    // 32-bit fixed (float)
      const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, 4);
      out[field] = dv.getFloat32(0, true);
      pos += 4;
    } else if (wire === 1) {    // 64-bit fixed
      pos += 8;
    } else {
      break;                    // unknown wire type → stop
    }
  }
  return {
    id:            out[1] as string  | undefined,
    price:         out[2] as number  | undefined,
    time:          out[3] as number  | undefined,
    changePercent: out[8] as number  | undefined,
    dayVolume:     out[9] as number  | undefined,
    change:        out[12] as number | undefined,
  };
}

function decodeYahooMessage(rawData: unknown): { price?: number; changePercent?: number; change?: number; time?: number } | null {
  try {
    if (typeof rawData !== "string") return null;
    // Most frames are base64 protobuf
    const raw = atob(rawData);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return decodeYFProto(bytes);
  } catch {
    // Some environments can deliver JSON payloads
    try {
      if (typeof rawData !== "string") return null;
      const parsed = JSON.parse(rawData);
      const q = Array.isArray(parsed) ? parsed[0] : parsed;
      return {
        price: toFiniteNumber(q?.price) ?? undefined,
        changePercent: toFiniteNumber(q?.changePercent) ?? undefined,
        change: toFiniteNumber(q?.change) ?? undefined,
        time: toFiniteNumber(q?.time ?? q?.timestamp ?? q?.ts) ?? undefined,
      };
    } catch {
      return null;
    }
  }
}

function intervalToSeconds(interval: string): number {
  const v = interval.toLowerCase();
  if (v === "1m") return 60;
  if (v === "2m") return 120;
  if (v === "5m") return 300;
  if (v === "15m") return 900;
  if (v === "30m") return 1800;
  if (v === "60m" || v === "1h") return 3600;
  if (v === "1d") return 86400;
  if (v === "1wk") return 604800;
  return 2592000;
}

function isIntradayInterval(interval: string): boolean {
  const v = interval.toLowerCase();
  return v === "1m" || v === "2m" || v === "5m" || v === "15m" || v === "30m" || v === "60m" || v === "1h";
}

function normalizeYahooSymbol(rawSymbol: string): string {
  const clean = String(rawSymbol || "").trim().toUpperCase();
  if (!clean) return "RELIANCE.NS";
  if (clean.startsWith("CRUDEOIL")) return "CL=F";
  return clean;
}

/* ─── Chart colours ────────────────────────────────────────────────────── */
const CHART_BG      = "#0a0a0f";
const GRID_COLOR    = "rgba(255,255,255,0.04)";
const TEXT_COLOR    = "#8c8c9c";
const UP_COLOR      = "#00b09b";
const DOWN_COLOR    = "#e03a3e";
const VOLUME_UP     = "rgba(0,176,155,0.35)";
const VOLUME_DOWN   = "rgba(224,58,62,0.35)";
const CROSSHAIR_CLR = "rgba(255,255,255,0.3)";

/* ─── Component ────────────────────────────────────────────────────────── */
export default function YahooChartPanel({
  symbol,
  displayName,
  onLivePrice,
  onCandlesLoaded,
}: {
  symbol: string;
  displayName?: string;
  onLivePrice?: (price: number) => void;
  onCandlesLoaded?: (candles: Candle[]) => void;
}) {
  const containerRef   = useRef<HTMLDivElement | null>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const priceSerRef    = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | null>(null);
  const volumeSerRef   = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastCandleRef  = useRef<CandlestickData | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const wsReconRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roRef          = useRef<ResizeObserver | null>(null);

  const [activeRange, setActiveRange] = useState(RANGES[0]); // 1D default
  const [chartType, setChartType]     = useState<ChartType>("candlestick");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [meta, setMeta]               = useState<ChartMeta | null>(null);
  const [lastCandles, setLastCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice]     = useState<number | null>(null);
  const [liveChange, setLiveChange]   = useState<number | null>(null);
  const [livePct, setLivePct]         = useState<number | null>(null);
  const [wsStatus, setWsStatus]       = useState<"connecting" | "live" | "off">("off");
  const [crosshairVal, setCrosshairVal] = useState<{
    price?: number; open?: number; high?: number; low?: number; vol?: number;
  } | null>(null);
  const yahooSymbol = normalizeYahooSymbol(symbol);

  /* ── build / rebuild Lightweight Chart ─────────────────────────────── */
  const buildChart = useCallback(() => {
    if (!containerRef.current) return;
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* already disposed */ }
      chartRef.current   = null;
      priceSerRef.current  = null;
      volumeSerRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_BG },
        textColor: TEXT_COLOR,
        fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Inter',sans-serif",
        fontSize: 11,
        // Hide library attribution logo so the panel looks native.
        attributionLogo: false,
      },
      localization: {
        // Use browser locale/timezone automatically.
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        timeFormatter: (time: Time) => formatLocalChartTime(time),
      },
      grid: {
        vertLines: { color: GRID_COLOR, style: LineStyle.Solid },
        horzLines: { color: GRID_COLOR, style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CROSSHAIR_CLR, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1e1e2e" },
        horzLine: { color: CROSSHAIR_CLR, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#1e1e2e" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        textColor: TEXT_COLOR,
        scaleMargins: { top: 0.05, bottom: 0.22 },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        rightOffset: 5,
        tickMarkFormatter: (time: Time) => formatLocalChartTime(time),
      },
      handleScroll: true,
      handleScale: true,
    });

    let priceSer: typeof priceSerRef.current;
    if (chartType === "candlestick") {
      priceSer = chart.addSeries(CandlestickSeries, {
        upColor: UP_COLOR, downColor: DOWN_COLOR,
        borderUpColor: UP_COLOR, borderDownColor: DOWN_COLOR,
        wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR,
      });
    } else if (chartType === "line") {
      priceSer = chart.addSeries(LineSeries, { color: "#4f8ef7", lineWidth: 2 });
    } else {
      priceSer = chart.addSeries(AreaSeries, {
        topColor: "rgba(79,142,247,0.3)", bottomColor: "rgba(79,142,247,0)",
        lineColor: "#4f8ef7", lineWidth: 2,
      });
    }

    const volSer = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setCrosshairVal(null); return; }
      const cData = param.seriesData.get(priceSer as any) as any;
      const vData = param.seriesData.get(volSer) as any;
      if (!cData) return;
      setCrosshairVal({
        price: cData.close ?? cData.value,
        open: cData.open, high: cData.high, low: cData.low,
        vol: vData?.value,
      });
    });

    chartRef.current     = chart;
    priceSerRef.current  = priceSer as any;
    volumeSerRef.current = volSer;

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current === chart) {
        try {
          chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
        } catch { /* chart disposed between ticks */ }
      }
    });
    ro.observe(containerRef.current);
    roRef.current = ro;
    try {
      chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
    } catch { /* chart disposed */ }
  }, [chartType]);

  /* ── push candle batch into the chart ──────────────────────────────── */
  const applyCandles = useCallback((candles: Candle[]) => {
    if (!priceSerRef.current || !volumeSerRef.current || !candles.length) return;

    const priceData: (CandlestickData | { time: Time; value: number })[] = [];
    const volData: HistogramData[] = [];

    for (const c of candles) {
      if (c.close == null) continue;
      const t = toTime(c.time);
      if (chartType === "candlestick") {
        const cd: CandlestickData = {
          time: t, open: c.open ?? c.close, high: c.high ?? c.close,
          low: c.low ?? c.close, close: c.close,
        };
        priceData.push(cd);
        // keep latest candle so WS can update it in real-time
        lastCandleRef.current = cd;
      } else {
        priceData.push({ time: t, value: c.close });
      }
      if (c.volume != null) {
        volData.push({
          time: t, value: c.volume,
          color: (c.close ?? 0) >= (c.open ?? c.close ?? 0) ? VOLUME_UP : VOLUME_DOWN,
        } as HistogramData);
      }
    }

    try {
      (priceSerRef.current as any).setData(priceData);
      volumeSerRef.current.setData(volData);
      chartRef.current?.timeScale().fitContent();
    } catch { /* chart may have been recreated */ }
  }, [chartType]);

  /* ── fetch OHLCV from edge function ─────────────────────────────────── */
  const fetchData = useCallback(async (sym: string, rangeObj: typeof RANGES[0], silent = false) => {
    if (!sym) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("get-chart-data", {
        body: { symbol: sym, interval: rangeObj.interval, range: rangeObj.range },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error && !data?.candles?.length) throw new Error(data.error);
      const candles: Candle[] = data?.candles ?? [];
      setLastCandles(candles);
      onCandlesLoaded?.(candles);
      setMeta(data?.meta ?? null);
      applyCandles(candles);
      if (!livePrice && data?.meta?.regularMarketPrice) {
        setLivePrice(data.meta.regularMarketPrice);
        onLivePrice?.(data.meta.regularMarketPrice);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load chart data");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applyCandles, livePrice, onCandlesLoaded, onLivePrice]);

  /* ── Yahoo Finance WebSocket streaming ─────────────────────────────── */
  const connectWS = useCallback((sym: string) => {
    if (wsRef.current) wsRef.current.close();
    if (wsReconRef.current) clearTimeout(wsReconRef.current);

    setWsStatus("connecting");
    const ws = new WebSocket("wss://streamer.finance.yahoo.com");

    ws.onopen = () => {
      ws.send(JSON.stringify({ subscribe: [sym] }));
      setWsStatus("live");
    };

    ws.onmessage = (event) => {
      try {
        const msg = decodeYahooMessage(event.data);
        if (!msg) return;

        const pNum = toFiniteNumber(msg.price);
        if (pNum != null && pNum > 0) {
          const p = pNum;
          setLivePrice(p);
          onLivePrice?.(p);
          const ch = toFiniteNumber(msg.change);
          const pct = toFiniteNumber(msg.changePercent);
          if (ch != null) setLiveChange(ch);
          if (pct != null) setLivePct(pct);

          // Live-update stream candle and roll to a new bar on bucket change.
          if (priceSerRef.current && lastCandleRef.current) {
            const prev = lastCandleRef.current;
            const tickSec = Math.floor(toFiniteNumber(msg.time) ?? Date.now() / 1000);
            const secPerBar = intervalToSeconds(activeRange.interval);
            const bucket = Math.floor(tickSec / secPerBar) * secPerBar;

            if (chartType === "candlestick" && typeof prev.time === "number" && isIntradayInterval(activeRange.interval)) {
              if (bucket > prev.time) {
                const newCandle: CandlestickData = {
                  time: bucket as unknown as Time,
                  open: prev.close,
                  high: p,
                  low: p,
                  close: p,
                };
                try { (priceSerRef.current as any).update(newCandle); } catch { /* ignore */ }
                lastCandleRef.current = newCandle;
              } else {
                const updated: CandlestickData = {
                  time: prev.time,
                  open: prev.open,
                  high: Math.max(prev.high as number, p),
                  low: Math.min(prev.low as number, p),
                  close: p,
                };
                try { (priceSerRef.current as any).update(updated); } catch { /* ignore */ }
                lastCandleRef.current = updated;
              }
            } else {
              const updated: CandlestickData = {
                time: prev.time,
                open: prev.open,
                high: Math.max(prev.high as number, p),
                low: Math.min(prev.low as number, p),
                close: p,
              };
              try { (priceSerRef.current as any).update(updated); } catch { /* ignore */ }
              lastCandleRef.current = updated;
            }
          }
        }
      } catch { /* ignore malformed frame */ }
    };

    ws.onerror = () => {
      setWsStatus("off");
    };

    ws.onclose = (e) => {
      setWsStatus("off");
      // Auto-reconnect quickly unless we deliberately closed it
      if (e.code !== 1000) {
        wsReconRef.current = setTimeout(() => connectWS(sym), 1_000);
      }
    };

    wsRef.current = ws;
  }, [onLivePrice, activeRange.interval, chartType]);

  /* ── re-build chart when chart type changes ─────────────────────────── */
  useEffect(() => {
    buildChart();
    if (lastCandles.length) applyCandles(lastCandles);
  }, [chartType]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── symbol / range changes → reload OHLCV + reconnect WS ─────────── */
  useEffect(() => {
    if (!symbol) return;
    setLivePrice(null); setLiveChange(null); setLivePct(null);
    buildChart();
    fetchData(yahooSymbol, activeRange);
    // Connect WebSocket for truly real-time price streaming
    connectWS(yahooSymbol);

    return () => {
      if (wsRef.current)    { wsRef.current.close(1000, "symbol-change"); wsRef.current = null; }
      if (wsReconRef.current) clearTimeout(wsReconRef.current);
    };
  }, [symbol, activeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // No periodic polling here. Price movement is stream-driven by Yahoo WebSocket.

  /* ── cleanup on unmount ─────────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (roRef.current)      { roRef.current.disconnect(); roRef.current = null; }
      if (chartRef.current)   { try { chartRef.current.remove(); } catch { /* disposed */ } chartRef.current = null; }
      if (wsRef.current)      { wsRef.current.close(1000); wsRef.current = null; }
      if (wsReconRef.current) clearTimeout(wsReconRef.current);
    };
  }, []);

  /* ─── Derived display values ─────────────────────────────────────────── */
  const displayPrice = toFiniteNumber(livePrice) ?? toFiniteNumber(meta?.regularMarketPrice) ?? null;
  const prevClose    = toFiniteNumber(meta?.previousClose) ?? toFiniteNumber(lastCandles[0]?.close) ?? null;
  const displayChange = toFiniteNumber(liveChange) ?? (displayPrice != null && prevClose != null ? displayPrice - prevClose : null);
  const displayPct   = toFiniteNumber(livePct) ?? (displayChange != null && prevClose ? (displayChange / prevClose) * 100 : null);
  const isUp         = (displayPct ?? 0) >= 0;
  const currency     = meta?.currency ?? "";

  const ohlcBar = crosshairVal?.open != null ? (
    <div className="flex gap-3 text-[10px] font-mono ml-2 flex-wrap">
      <span className="text-zinc-400">O <span className="text-white">{fmt(crosshairVal.open)}</span></span>
      <span className="text-zinc-400">H <span className="text-emerald-400">{fmt(crosshairVal.high)}</span></span>
      <span className="text-zinc-400">L <span className="text-red-400">{fmt(crosshairVal.low)}</span></span>
      <span className="text-zinc-400">C <span className="text-white">{fmt(crosshairVal.price)}</span></span>
      {crosshairVal.vol != null && (
        <span className="text-zinc-400">Vol <span className="text-indigo-400">{fmt(crosshairVal.vol, 0)}</span></span>
      )}
    </div>
  ) : null;

  return (
    <Card className="glass-panel h-full w-full bg-[#0a0a0f] border border-white/5 flex flex-col overflow-hidden">

      {/* ── top bar ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-3 pt-2.5 pb-1 border-b border-white/5 flex-wrap gap-y-1">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-bold text-white text-sm truncate max-w-[180px]">
            {displayName || meta?.symbol || symbol}
          </span>
          {meta?.exchangeName && (
            <span className="text-[10px] text-zinc-500 border border-white/10 rounded px-1">
              {meta.exchangeName}
            </span>
          )}
          {displayPrice != null && (
            <span className="font-mono font-bold text-white text-sm tabular-nums transition-all">
              {currency && <span className="text-zinc-400 text-xs mr-0.5">{currency}</span>}
              {fmt(displayPrice)}
            </span>
          )}
          {typeof displayPct === "number" && Number.isFinite(displayPct) && typeof displayChange === "number" && Number.isFinite(displayChange) && (
            <span className={`text-xs font-semibold flex items-center gap-0.5 tabular-nums ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? "+" : ""}{displayChange.toFixed(2)} ({isUp ? "+" : ""}{displayPct.toFixed(2)}%)
            </span>
          )}
          {/* Live indicator */}
          <span className={`flex items-center gap-1 text-[10px] font-medium ${
            wsStatus === "live" ? "text-emerald-400" : wsStatus === "connecting" ? "text-yellow-400" : "text-zinc-600"
          }`}>
            {wsStatus === "live"
              ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Live</>
              : wsStatus === "connecting"
              ? <><span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />Connecting…</>
              : <><WifiOff className="h-3 w-3" />Offline</>
            }
          </span>
          {ohlcBar}
        </div>

        <div className="flex items-center gap-1">
          {(["candlestick", "line", "area"] as ChartType[]).map((t) => (
            <button key={t} onClick={() => setChartType(t)} title={t}
              className={`p-1 rounded transition-colors ${chartType === t ? "bg-white/10 text-white" : "text-zinc-600 hover:text-zinc-300"}`}>
              {t === "candlestick" && <BarChart2 className="h-3.5 w-3.5" />}
              {t === "line"        && <LineChart  className="h-3.5 w-3.5" />}
              {t === "area"        && <Activity   className="h-3.5 w-3.5" />}
            </button>
          ))}
          <div className="w-px h-4 bg-white/10 mx-0.5" />
          <button onClick={() => { fetchData(yahooSymbol, activeRange); connectWS(yahooSymbol); }}
            title="Refresh" className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <a href={`https://finance.yahoo.com/chart/${encodeURIComponent(yahooSymbol)}`}
            target="_blank" rel="noopener noreferrer" title="Open on Yahoo Finance"
            className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-colors">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* ── range selector ──────────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-white/5">
        {RANGES.map((r) => (
          <button key={r.label} onClick={() => setActiveRange(r)}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              activeRange.label === r.label ? "bg-primary/20 text-primary" : "text-zinc-500 hover:text-zinc-300"
            }`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* ── chart canvas ────────────────────────────────────────────── */}
      <CardContent className="p-0 flex-1 min-h-0 relative">
        <div ref={containerRef} className="absolute inset-0" style={{ background: CHART_BG }} />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]/80 z-10 gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-zinc-400">Loading {yahooSymbol}…</span>
          </div>
        )}

        {!loading && error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3 px-6 text-center">
            <p className="text-sm text-zinc-500">{error}</p>
            <a href={`https://finance.yahoo.com/chart/${encodeURIComponent(yahooSymbol)}`}
              target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
              Open {yahooSymbol} on Yahoo Finance ↗
            </a>
          </div>
        )}
      </CardContent>

      {/* ── footer ──────────────────────────────────────────────────── */}
      <div className="px-3 py-1 border-t border-white/5 text-[10px] text-zinc-600 flex items-center justify-between">
        <span>Data: Yahoo Finance</span>
        <span className="flex items-center gap-1">
          {wsStatus === "live"
            ? <><Wifi className="h-3 w-3 text-emerald-500" /> Streaming</>
            : "Scroll to zoom · Drag to pan"
          }
        </span>
      </div>
    </Card>
  );
}
