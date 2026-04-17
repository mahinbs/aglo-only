import React, { useEffect, useState, useRef, useMemo } from 'react';
import { BarChart2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SymbolSearch, type SymbolData } from '@/components/SymbolSearch';
import { TICK_SYMBOLS, formatVolume, ChartSimState } from '../utils/tickSimulator';

// Ask side (right) - green spectrum
const ASK_STRONG = '#00C853';   // bright green
const ASK_MILD   = '#2E7D32';   // deeper green for better contrast

// Bid side (left) - red spectrum  
const BID_STRONG = '#FF1744';   // bright red
const BID_MILD   = '#FF8A80';   // light pink/rose

// Special
const VOLUME_SPIKE = '#FF6D00'; // orange - for outlier large volumes
const NEUTRAL = '#000000'; // empty cells stay black

const getBidColor = (bid: number, ask: number, isHighVolume: boolean) => {
  if (isHighVolume) return VOLUME_SPIKE;
  const ratio = bid / (ask || 1);
  if (ratio >= 3) return BID_STRONG;
  if (ratio >= 1.5) return BID_MILD;
  return '#1e1e2e'; // dark neutral — visible but not colored
};

const getAskColor = (bid: number, ask: number, isHighVolume: boolean) => {
  if (isHighVolume) return VOLUME_SPIKE;
  const ratio = ask / (bid || 1);
  if (ratio >= 3) return ASK_STRONG;
  if (ratio >= 1.5) return ASK_MILD;
  return '#1e1e2e'; // dark neutral — visible but not colored
};

const getTextColor = (bgColor: string) => {
  if (bgColor === '#000000') return '#000000'; // invisible on empty
  if (bgColor === '#1e1e2e') return '#888888'; // dim text on neutral
  if (bgColor === ASK_MILD || bgColor === ASK_STRONG) return '#0b0b0b'; // dark text on green
  return '#ffffff'; // white on colored
};

const TIMEFRAMES = ['1m', '5m', '30m', '1h', '1d', '1w', '1M'];

const refreshRateMap: Record<string, number> = {
  '1m':  3000,
  '5m':  3000,
  '30m': 8000,
  '1h':  15000,
  '1d':  30000,
  '1w':  60000,
  '1M':  120000,
};

const timeframeToMs: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
  '1M': 30 * 24 * 60 * 60_000,
};


type LevelRow = { price: number; bid: number; ask: number };
type AssetClass = 'crypto' | 'forex' | 'stocks';
type Snapshot = {
  source: string;
  symbol: string;
  timestamp: number;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  levels: LevelRow[];
};

const EMPTY_STATS = {
  O: 0, H: 0, L: 0, C: 0, V: 0, OI: 165.0,
  buyVol: 0, sellVol: 0, buyTrades: 0, sellTrades: 0, imbBlock: 0,
};

function inferAssetType(symbol: string): 'crypto' | 'forex' | 'indian' | 'us' {
  if (symbol.includes('/')) return 'crypto';
  if (symbol.includes('-USD') || symbol.includes('-USDT')) return 'crypto';
  if (symbol.endsWith('=X')) return 'forex';
  if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) return 'indian';
  return 'us';
}

function normalizeSymbol(symbol: string): string {
  if (symbol.includes('/')) return symbol.replace('/', '-');
  return symbol;
}

function mapToBinancePair(symbol: string): string {
  const s = normalizeSymbol(symbol).toUpperCase();
  if (s === 'BTC-USD' || s === 'BTC/ USD' || s === 'BTC/USD') return 'btcusdt';
  if (s === 'ETH-USD' || s === 'ETH/USD') return 'ethusdt';
  if (s.endsWith('-USD')) return `${s.replace('-USD', '').toLowerCase()}usdt`;
  if (s.endsWith('-USDT')) return `${s.replace('-USDT', '').toLowerCase()}usdt`;
  return 'btcusdt';
}

function decodeYfProto(bytes: Uint8Array): { price?: number; ts?: number } {
  const out: Record<number, unknown> = {};
  let pos = 0;
  while (pos < bytes.length) {
    const tagByte = bytes[pos++];
    const field = tagByte >> 3;
    const wire = tagByte & 0x7;
    if (wire === 0) {
      let val = 0, shift = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        val |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      out[field] = (val >>> 1) ^ -(val & 1);
    } else if (wire === 2) {
      let len = 0, shift = 0;
      while (pos < bytes.length) {
        const b = bytes[pos++];
        len |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
      }
      pos += len;
    } else if (wire === 5) {
      const dv = new DataView(bytes.buffer, bytes.byteOffset + pos, 4);
      out[field] = dv.getFloat32(0, true);
      pos += 4;
    } else if (wire === 1) {
      pos += 8;
    } else {
      break;
    }
  }
  return {
    price: typeof out[2] === 'number' ? Number(out[2]) : undefined,
    ts: typeof out[3] === 'number' ? Number(out[3]) : undefined,
  };
}

function parseYahooWsTick(raw: unknown): { price: number; ts: number } | null {
  try {
    if (typeof raw !== 'string') return null;
    const decoded = atob(raw);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    const msg = decodeYfProto(bytes);
    const p = Number(msg.price);
    if (!Number.isFinite(p) || p <= 0) return null;
    const ts = Number(msg.ts);
    const tsMs = Number.isFinite(ts) ? (ts < 1e11 ? ts * 1000 : ts) : Date.now();
    return { price: p, ts: tsMs };
  } catch {
    return null;
  }
}

function buildSideLevelsFromMid(mid: number, asset: 'stock' | 'forex' | 'crypto'): LevelRow[] {
  const inc = getIncrementForPrice(mid, asset);
  const out: LevelRow[] = [];
  const base = Math.max(12000, mid * 1200);
  for (let i = -12; i <= 12; i++) {
    const price = Number((mid + i * inc).toFixed(6));
    const dist = Math.abs(i) + 1;
    const w = 1 / dist;
    const bid = i <= 0 ? base * w : base * w * 0.08;
    const ask = i >= 0 ? base * w : base * w * 0.08;
    out.push({ price, bid, ask });
  }
  return out.sort((a, b) => b.price - a.price);
}


function getIncrementForPrice(price: number, asset: string): number {
  if (asset === 'forex') return 0.0005;
  if (price >= 50000) return 20;
  if (price >= 5000) return 5;
  if (price >= 500) return 1;
  if (price >= 100) return 0.5;
  if (price >= 10) return 0.05;
  return 0.01;
}

function getPriceDecimals(asset: AssetClass, price: number): number {
  if (asset === 'forex') return 5;
  if (asset === 'crypto') {
    if (price >= 1000) return 2;
    if (price >= 1) return 4;
    return 6;
  }
  return price >= 100 ? 2 : 4;
}

function buildPriceLevels(center: number, increment: number, rows = 25): number[] {
  const middle = Math.floor(rows / 2);
  const levels: number[] = [];
  for (let i = 0; i < rows; i++) {
    const offset = middle - i;
    levels.push(Number((center + offset * increment).toFixed(6)));
  }
  return levels;
}

function timeLabelFromTs(tsMs: number, timeframe: string, tz: string): string {
  const dt = new Date(tsMs);
  if (timeframe === '1d' || timeframe === '1w' || timeframe === '1M') {
    return dt.toLocaleDateString([], { day: '2-digit', month: '2-digit', timeZone: tz });
  }
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
}

function snapshotToColumn(snapshot: Snapshot, priceLevels: number[], timeframe: string, tz: string) {
  const prices: Record<number, { bid: number; ask: number; isHighVolume: boolean }> = {};
  const inc = priceLevels.length > 1 ? Math.abs(priceLevels[0] - priceLevels[1]) : 1;
  for (const p of priceLevels) prices[p] = { bid: 0, ask: 0, isHighVolume: false };
  let maxVol = 0;
  for (const lv of snapshot.levels) maxVol = Math.max(maxVol, lv.bid + lv.ask);
  for (const lv of snapshot.levels) {
    const nearest = priceLevels.reduce((best, p) => (Math.abs(p - lv.price) < Math.abs(best - lv.price) ? p : best), priceLevels[0]);
    if (Math.abs(nearest - lv.price) <= inc * 0.75) {
      const sum = lv.bid + lv.ask;
      prices[nearest] = {
        bid: Math.round(lv.bid),
        ask: Math.round(lv.ask),
        isHighVolume: maxVol > 0 && sum >= maxVol * 0.85,
      };
    }
  }
  return {
    timeLabel: timeLabelFromTs(snapshot.timestamp, timeframe, tz),
    prices,
  };
}

function emptyColumn(priceLevels: number[], tsMs: number, timeframe: string, tz: string) {
  const prices: Record<number, { bid: number; ask: number; isHighVolume: boolean }> = {};
  for (const p of priceLevels) prices[p] = { bid: 0, ask: 0, isHighVolume: false };
  return {
    timeLabel: timeLabelFromTs(tsMs, timeframe, tz),
    prices,
  };
}

function buildOrderBookFromLevels(levels: number[], currentPrice: number, snapshotLevels: LevelRow[]) {
  const nearestMap = new Map<number, LevelRow>();
  for (const p of levels) {
    const nearest = snapshotLevels.reduce((best, lv) => (
      Math.abs(lv.price - p) < Math.abs(best.price - p) ? lv : best
    ), snapshotLevels[0] ?? { price: p, bid: 0, ask: 0 });
    nearestMap.set(p, nearest);
  }
  return levels.map((p) => {
    const row = nearestMap.get(p) ?? { bid: 0, ask: 0 };
    return {
      price: p,
      bidOrders: p < currentPrice ? Math.max(1, Math.round((row.bid || 0) / 2000)) : 0,
      bidVol: p < currentPrice ? Math.round(row.bid || 0) : 0,
      askVol: p > currentPrice ? Math.round(row.ask || 0) : 0,
      askOrders: p > currentPrice ? Math.max(1, Math.round((row.ask || 0) / 2000)) : 0,
    };
  });
}

const TickChart: React.FC = () => {
  const navigate = useNavigate();
  const [assetClass, setAssetClass] = useState<AssetClass>('crypto');
  const [symbol, setSymbol] = useState('BTC-USD');
  const [symbolSearchValue, setSymbolSearchValue] = useState('BTC-USD');
  const [selectedLabel, setSelectedLabel] = useState('Bitcoin');
  const [timeframe, setTimeframe] = useState('5m');
  const [chartState, setChartState] = useState<ChartSimState | null>(null);
  const [userTimezone, setUserTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [dataSource, setDataSource] = useState<string>('Live');
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastBucketRef = useRef<number | null>(null);

  const allowedTypes = useMemo(() => {
    if (assetClass === 'crypto') return ['crypto'];
    if (assetClass === 'forex') return ['forex'];
    return ['stock'];
  }, [assetClass]);

  useEffect(() => {
    if (assetClass === 'crypto') {
      setSymbol('BTC-USD');
      setSymbolSearchValue('BTC-USD');
      setSelectedLabel('Bitcoin');
      return;
    }
    if (assetClass === 'forex') {
      setSymbol('EURUSD=X');
      setSymbolSearchValue('EURUSD=X');
      setSelectedLabel('EUR/USD');
      return;
    }
    setSymbol('AAPL');
    setSymbolSearchValue('AAPL');
    setSelectedLabel('Apple Inc.');
  }, [assetClass]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        if (!cancelled && data?.timezone) setUserTimezone(String(data.timezone));
      } catch {
        // fallback already set from browser timezone
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const upsertFromSnapshot = (snapshot: Snapshot) => {
    setChartState((prev) => {
      const asset = inferAssetType(symbol);
      const increment = getIncrementForPrice(snapshot.price, asset);
      const tfMs = timeframeToMs[timeframe] ?? 300_000;
      const bucketTs = Math.floor(snapshot.timestamp / tfMs) * tfMs;
      const levels = prev?.priceLevels?.length
        ? (() => {
            const min = Math.min(...prev.priceLevels);
            const max = Math.max(...prev.priceLevels);
            if (snapshot.price < min || snapshot.price > max) return buildPriceLevels(snapshot.price, increment, 25);
            return prev.priceLevels;
          })()
        : buildPriceLevels(snapshot.price, increment, 25);

      const nextColumn = snapshotToColumn({ ...snapshot, timestamp: bucketTs }, levels, timeframe, userTimezone);
      const prevCols = prev?.columns ?? [];
      const sameBucket = lastBucketRef.current === bucketTs && prevCols.length > 0;
      let nextColumns = sameBucket
        ? [...prevCols.slice(0, -1), nextColumn]
        : [...prevCols, nextColumn].slice(-32); // Increased from 18 to 32

      lastBucketRef.current = bucketTs;
      const orderBook = buildOrderBookFromLevels(levels, snapshot.price, snapshot.levels);

      const prevStats = prev?.stats;
      const buyVol = snapshot.levels.reduce((s, r) => s + r.ask, 0) / 1_000_000;
      const sellVol = snapshot.levels.reduce((s, r) => s + r.bid, 0) / 1_000_000;
      const buyTrades = Math.max(1, Math.round(buyVol * 120));
      const sellTrades = Math.max(1, Math.round(sellVol * 120));
      const imb = Math.max(1, Math.round((Math.abs(buyVol - sellVol) * 100)));

      return {
        symbol,
        timeframe,
        currentPrice: snapshot.price,
        priceLevels: levels,
        columns: nextColumns,
        orderBook,
        stats: {
          O: snapshot.open,
          H: snapshot.high,
          L: snapshot.low,
          C: snapshot.close,
          V: snapshot.volume / 1_000_000,
          OI: prevStats?.OI ?? 165.0,
          buyVol,
          sellVol,
          buyTrades: prevStats ? prevStats.buyTrades + buyTrades : buyTrades,
          sellTrades: prevStats ? prevStats.sellTrades + sellTrades : sellTrades,
          imbBlock: imb,
        },
      };
    });
  };

  const fetchMarketSnapshot = async (): Promise<Snapshot | null> => {
    const asset = inferAssetType(symbol);
    if (asset === 'crypto') return null; // crypto handled by websocket
    const { data, error } = await supabase.functions.invoke('tick-market-data', {
      body: { symbol, timeframe, timezone: userTimezone },
    });
    if (error || !data) return null;
    setDataSource(String((data as any)?.source ?? 'Live'));
    return data as Snapshot;
  };

  const fetchMarketHistory = async (): Promise<Snapshot[]> => {
    const { data, error } = await supabase.functions.invoke('tick-market-data', {
      body: { mode: 'history', symbol, timeframe, timezone: userTimezone, count: 32 },
    });
    if (error || !data) return [];
    setDataSource(String((data as any)?.source ?? 'Live'));
    return Array.isArray((data as any)?.snapshots) ? (data as any).snapshots as Snapshot[] : [];
  };

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    setChartState(null);
    lastBucketRef.current = null;

    const asset = inferAssetType(symbol);
    (async () => {
      const history = await fetchMarketHistory();
      if (cancelled || !history.length) return;
      const last = history[history.length - 1];
      const inc = getIncrementForPrice(last.price, asset);
      const levels = buildPriceLevels(last.price, inc, 25);
      const cols = history.map((snap) => snapshotToColumn(snap, levels, timeframe, userTimezone));
      const orderBook = buildOrderBookFromLevels(levels, last.price, last.levels);
      const buyVol = last.levels.reduce((s, r) => s + r.ask, 0) / 1_000_000;
      const sellVol = last.levels.reduce((s, r) => s + r.bid, 0) / 1_000_000;
      setChartState({
        symbol,
        timeframe,
        currentPrice: last.price,
        priceLevels: levels,
        columns: cols.slice(-32),
        orderBook,
        stats: {
          ...EMPTY_STATS,
          O: last.open,
          H: last.high,
          L: last.low,
          C: last.close,
          V: last.volume / 1_000_000,
          buyVol,
          sellVol,
          buyTrades: Math.max(1, Math.round(buyVol * 120)),
          sellTrades: Math.max(1, Math.round(sellVol * 120)),
          imbBlock: Math.max(1, Math.round(Math.abs(buyVol - sellVol) * 100)),
        },
      });
    })();

    if (asset === 'crypto') {
      const pair = mapToBinancePair(symbol);
      setDataSource('Binance WS');
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@depth20@1000ms`);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        if (cancelled) return;
        try {
          const d = JSON.parse(ev.data);
          const bids = (d?.bids ?? []).map((x: [string, string]) => ({ price: Number(x[0]), bid: Number(x[1]) * Number(x[0]), ask: 0 }));
          const asks = (d?.asks ?? []).map((x: [string, string]) => ({ price: Number(x[0]), bid: 0, ask: Number(x[1]) * Number(x[0]) }));
          const levelsMap = new Map<number, LevelRow>();
          const topBid = bids[0]?.price ?? 0;
          const topAsk = asks[0]?.price ?? 0;
          const px = topBid && topAsk ? (topBid + topAsk) / 2 : (topBid || topAsk || 0);
          const inc = getIncrementForPrice(px, 'crypto');
          [...bids, ...asks].forEach((r) => {
            const bucket = Number((Math.round(r.price / inc) * inc).toFixed(6));
            const old = levelsMap.get(bucket) ?? { price: bucket, bid: 0, ask: 0 };
            levelsMap.set(bucket, { price: bucket, bid: old.bid + r.bid, ask: old.ask + r.ask });
          });
          const levels = Array.from(levelsMap.values()).sort((a, b) => b.price - a.price).slice(0, 25);
          const ts = Number(d?.E) || Date.now();
          const snapshot: Snapshot = {
            source: 'Binance WS',
            symbol,
            timestamp: ts,
            price: px,
            open: px,
            high: px,
            low: px,
            close: px,
            volume: levels.reduce((s, r) => s + r.bid + r.ask, 0),
            levels,
          };
          upsertFromSnapshot(snapshot);
        } catch {
          // ignore parse errors
        }
      };
      return () => {
        cancelled = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        ws.close(1000);
      };
    }

    if (asset === 'us' || asset === 'indian') {
      setDataSource('Yahoo WS');
      const ws = new WebSocket('wss://streamer.finance.yahoo.com');
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ subscribe: [symbol] }));
      };
      ws.onmessage = (ev) => {
        if (cancelled) return;
        const tick = parseYahooWsTick(ev.data);
        if (!tick) return;
        const levels = buildSideLevelsFromMid(tick.price, 'stock');
        const snapshot: Snapshot = {
          source: 'Yahoo WS',
          symbol,
          timestamp: tick.ts,
          price: tick.price,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: levels.reduce((s, r) => s + r.bid + r.ask, 0),
          levels,
        };
        upsertFromSnapshot(snapshot);
      };
      ws.onclose = () => {
        if (cancelled) return;
        setDataSource('Yahoo WS (reconnecting)');
        reconnectTimer = setTimeout(() => {
          if (cancelled) return;
          const retry = new WebSocket('wss://streamer.finance.yahoo.com');
          wsRef.current = retry;
          retry.onopen = () => retry.send(JSON.stringify({ subscribe: [symbol] }));
          retry.onmessage = ws.onmessage;
          retry.onclose = ws.onclose;
        }, 1000);
      };
      return () => {
        cancelled = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        ws.close(1000);
      };
    }

    const pull = async () => {
      const snap = await fetchMarketSnapshot();
      if (!cancelled && snap) upsertFromSnapshot(snap);
    };
    pull();
    const rate = refreshRateMap[timeframe] ?? 3000;
    const intervalId = setInterval(pull, rate);
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(intervalId);
    };
  }, [symbol, timeframe, userTimezone, assetClass]);

  const handleSymbolSelect = (s: SymbolData) => {
    const type = String(s.type || '').toLowerCase();
    if (!allowedTypes.includes(type)) return;
    const fs = (s.full_symbol || s.symbol || '').toUpperCase().trim();
    if (!fs) return;
    setSymbol(fs);
    setSymbolSearchValue(fs);
    setSelectedLabel((s.description || s.symbol || fs).trim());
  };

  // Auto-scroll to latest column
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [chartState?.columns.length, chartState?.columns]); // Runs every tick

  const renderedGrid = useMemo(() => {
    if (!chartState) return null;
    const { columns, priceLevels } = chartState;
    return columns.map((col, cIdx) => (
      <div key={`col-${cIdx}`} className="flex flex-col border-r border-gray-800/50 w-[70px] shrink-0">
        {priceLevels.map((price, pIdx) => {
          const cellData = col.prices[price];
          if (!cellData || (cellData.bid === 0 && cellData.ask === 0)) {
            return (
              <div 
                key={`cell-${cIdx}-${pIdx}`} 
                className={`flex-1 flex items-center justify-center p-0.5 border-b border-gray-800/20`}
                style={{ background: '#000000' }}
              ></div>
            );
          }
          const { bid, ask, isHighVolume } = cellData;
          
          const bidBg = getBidColor(bid, ask, isHighVolume);
          const askBg = getAskColor(bid, ask, isHighVolume);

          return (
            <div 
              key={`cell-${cIdx}-${pIdx}`} 
              className={`flex-1 flex w-full text-[10px] border-b border-gray-800/50 bg-[#1a1a1a] ${isHighVolume ? 'font-bold outline outline-1 outline-white/30 z-10 brightness-110' : ''}`}
            >
              <span 
                className="flex-1 flex items-center justify-start pl-1" 
                style={{ 
                  background: bidBg, 
                  color: getTextColor(bidBg) 
                }}
              >
                {bid === 0 ? '' : formatVolume(bid)}
              </span>
              <span 
                className="flex-1 flex items-center justify-end pr-1" 
                style={{ 
                  background: askBg, 
                  color: getTextColor(askBg) 
                }}
              >
                {ask === 0 ? '' : formatVolume(ask)}
              </span>
            </div>
          );
        })}
        <div className="h-[24px] shrink-0 flex items-center justify-center text-[10px] border-t border-gray-700 text-gray-400 bg-[#141414]">
          {col.timeLabel}
        </div>
      </div>
    ));
  }, [chartState]);

  if (!chartState) return <div className="min-h-screen bg-[#0a0a0a] text-white p-4 flex items-center justify-center">Loading Tick Engine...</div>;

  const { priceLevels, columns, orderBook, currentPrice, stats } = chartState;
  const priceDecimals = getPriceDecimals(assetClass, currentPrice);
  const activeRowThreshold = Math.max(getIncrementForPrice(currentPrice, assetClass), 0.00001) / 2;

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-gray-200 overflow-hidden font-mono select-none">
      {/* Top Header */}
      <div className="flex flex-col border-b border-gray-800 bg-[#111] p-2 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2 sm:mb-1">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center justify-center p-1.5 rounded bg-[#1e1e1e] border border-gray-700 hover:bg-[#252525] text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-[300px] max-w-[75vw]">
            <SymbolSearch
              value={symbolSearchValue}
              onValueChange={setSymbolSearchValue}
              onSelectSymbol={handleSymbolSelect}
              placeholder={assetClass === 'crypto' ? 'Search crypto' : assetClass === 'forex' ? 'Search forex' : 'Search stocks'}
              allowedTypes={allowedTypes}
            />
          </div>
          <div className="min-w-[200px] max-w-[340px] px-2.5 py-1 rounded bg-[#1a1a1a] border border-gray-700 text-[11px] text-gray-300 truncate">
            <span className="text-gray-500 mr-1.5">Now Showing:</span>
            <span className="text-white font-semibold">{selectedLabel}</span>
            <span className="text-cyan-300 ml-1">({symbol})</span>
          </div>
          <div className="flex items-center gap-1">
            {(['crypto', 'forex', 'stocks'] as AssetClass[]).map((cls) => (
              <button
                key={cls}
                onClick={() => setAssetClass(cls)}
                className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                  assetClass === cls
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'bg-[#1e1e1e] text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                }`}
              >
                {cls === 'stocks' ? 'Stocks' : cls === 'forex' ? 'Forex' : 'Crypto'}
              </button>
            ))}
          </div>
          
          <div className="flex items-center space-x-1">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-[11px] rounded transition-colors ${
                  timeframe === tf
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'bg-[#1e1e1e] text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-400">
            <span>O: <span className="text-white">{stats.O.toFixed(priceDecimals)}</span></span>
            <span>H: <span className="text-white">{stats.H.toFixed(priceDecimals)}</span></span>
            <span>L: <span className="text-white">{stats.L.toFixed(priceDecimals)}</span></span>
            <span>C: <span className="text-white">{stats.C.toFixed(priceDecimals)}</span></span>
            <span>V: <span className="text-white">{stats.V.toFixed(2)}M</span></span>
            <span>OI: <span className="text-white">{stats.OI.toFixed(1)}</span></span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2 text-[11px] text-gray-400">
          <div className="flex items-center space-x-2 shrink-0">
            <BarChart2 className="w-3 h-3 text-emerald-500" />
            <span>IMBALANCE Block: <span className="text-white">{stats.imbBlock}</span></span>
          </div>
          <span>VOLUME: <span className="text-white">{(stats.buyVol + stats.sellVol).toFixed(2)}M</span></span>
          <span>Buy Vol: <span className="text-green-500">{stats.buyVol.toFixed(2)}M</span></span>
          <span>Sell Vol: <span className="text-red-500">{stats.sellVol.toFixed(2)}M</span></span>
          <span>Buy Trades: <span className="text-white">{stats.buyTrades}</span></span>
          <span>Sell Trades: <span className="text-white">{stats.sellTrades}</span></span>
          <span>Source: <span className="text-cyan-300">{dataSource}</span></span>
          <span>TZ: <span className="text-cyan-300">{userTimezone}</span></span>
        </div>
      </div>

      {/* Main Grid Area */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Horizontal Scrollable Area */}
        <div 
          ref={scrollRef}
          className="flex justify-start overflow-x-auto overflow-y-hidden flex-1 pb-4 scroll-smooth w-full"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {renderedGrid}
        </div>

        {/* Static Order Book & Prices Panel */}
        <div className="flex flex-col w-[80px] bg-[#111] border-l border-gray-800 shrink-0 shadow-[-10px_0_20px_rgba(0,0,0,0.5)] z-10">
          <div className="flex-1 flex flex-col pb-4">
            {orderBook.map((row, i) => {
              const isActive = Math.abs(row.price - currentPrice) < activeRowThreshold;
              
              // In the reference image, the right Y-axis is just a single thin column
              // showing the price, often highlighted. The order book depth is actually 
              // integrated into the main chart or just isn't split into two bid/ask columns on the Y-axis.
              // Let's make it a single, clean price column to match the time X-axis style.
              return (
                <div key={`ob-row-${i}`} className={`flex flex-1 group relative border-b border-gray-800/50
                  ${isActive ? 'bg-cyan-900 border-cyan-400 z-10' : 'bg-[#181818]'}`}>
                  
                  {/* Cyan Highlight overlay for the active row */}
                  {isActive && (
                    <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-cyan-400 z-20"></div>
                  )}

                  <div className={`flex-1 flex items-center justify-center text-[11px] font-medium
                    ${isActive ? 'text-white' : 'text-gray-400'}`}>
                    {row.price.toLocaleString(undefined, {
                      minimumFractionDigits: priceDecimals,
                      maximumFractionDigits: priceDecimals,
                    })}
                  </div>
                </div>
              );
            })}
            
            <div className="h-[24px] shrink-0 bg-[#141414] border-t border-gray-700 flex items-center justify-center text-[10px] text-gray-500">
              Price
            </div>
          </div>
        </div>

      </div>
      
    </div>
  );
};

export default TickChart;
