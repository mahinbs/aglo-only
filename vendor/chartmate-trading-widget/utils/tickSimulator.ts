export const TICK_SYMBOLS = [
  "BTC-USD",
  "ETH-USD",
  "AAPL",
  "TSLA",
  "NVDA",
  "SPY",
  "EURUSD=X",
  "GBPUSD=X",
  "RELIANCE.NS",
  "TCS.NS",
];

export interface SymbolConfig {
  basePrice: number;
  increment: number;
  rows: number;
}

export const SYMBOL_CONFIGS: Record<string, SymbolConfig> = {
  "BTC-USD": { basePrice: 96000, increment: 20, rows: 25 },
  "ETH-USD": { basePrice: 3000, increment: 1, rows: 25 },
  "AAPL": { basePrice: 180, increment: 0.5, rows: 25 },
  "TSLA": { basePrice: 200, increment: 0.5, rows: 25 },
  "NVDA": { basePrice: 800, increment: 2, rows: 25 },
  "SPY": { basePrice: 510, increment: 1, rows: 25 },
  "EURUSD=X": { basePrice: 1.085, increment: 0.0005, rows: 25 },
  "GBPUSD=X": { basePrice: 1.265, increment: 0.0005, rows: 25 },
  "RELIANCE.NS": { basePrice: 2950, increment: 2, rows: 25 },
  "TCS.NS": { basePrice: 4100, increment: 2, rows: 25 },
};

export interface TickCellData {
  bid: number;
  ask: number;
  isHighVolume: boolean;
}

export interface TickColumnData {
  timeLabel: string;
  prices: Record<number, TickCellData>;
}

export interface OrderBookRowData {
  price: number;
  bidOrders: number;
  bidVol: number;
  askVol: number;
  askOrders: number;
}

export interface ChartSimState {
  symbol: string;
  timeframe: string;
  currentPrice: number;
  priceLevels: number[];
  columns: TickColumnData[];
  orderBook: OrderBookRowData[];
  stats: {
    O: number;
    H: number;
    L: number;
    C: number;
    V: number;
    OI: number;
    buyVol: number;
    sellVol: number;
    buyTrades: number;
    sellTrades: number;
    imbBlock: number;
  };
}

const intervalMap: Record<string, number> = {
  '1m':  60 * 1000,
  '5m':  5 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '1d':  24 * 60 * 60 * 1000,
  '1w':  7 * 24 * 60 * 60 * 1000,
  '1M':  30 * 24 * 60 * 60 * 1000,
};

export function generateInitialState(symbol: string, timeframe: string = '5m'): ChartSimState {
  const config = SYMBOL_CONFIGS[symbol];
  const { basePrice, increment, rows } = config;
  
  const middleIdx = Math.floor(rows / 2);
  const priceLevels = [];
  for (let i = 0; i < rows; i++) {
    const offset = middleIdx - i;
    priceLevels.push(basePrice + offset * increment);
  }

  const columns: TickColumnData[] = [];
  const now = new Date();
  
  for (let i = 0; i < 18; i++) {
    const colTime = new Date(now.getTime() - (18 - i) * intervalMap[timeframe]);
    columns.push(generateColumnData(priceLevels, colTime, timeframe));
  }

  const orderBook = generateOrderBook(priceLevels, basePrice);

  return {
    symbol,
    timeframe,
    currentPrice: basePrice,
    priceLevels,
    columns,
    orderBook,
    stats: generateStats(basePrice)
  };
}

export function generateColumnData(priceLevels: number[], time: Date, timeframe: string = '5m'): TickColumnData {
  const prices: Record<number, TickCellData> = {};
  const totalRows = priceLevels.length;

  // Pick a random "active zone" — only 4 to 8 consecutive price levels get data
  const activeCount = Math.floor(Math.random() * 5) + 4;
  const startIdx = Math.floor(Math.random() * (totalRows - activeCount));
  const activeSet = new Set(
    priceLevels.slice(startIdx, startIdx + activeCount)
  );

  priceLevels.forEach(p => {
    if (!activeSet.has(p)) {
      prices[p] = { bid: 0, ask: 0, isHighVolume: false };
      return;
    }

    const isSpike = Math.random() > 0.92;

    let bid = 0;
    let ask = 0;

    if (isSpike) {
      bid = Math.floor(Math.random() * 600000) + 100000;
      ask = Math.floor(Math.random() * 600000) + 100000;
    } else {
      bid = Math.floor(Math.random() * 49000) + 1000;
      ask = Math.floor(Math.random() * 49000) + 1000;
    }

    prices[p] = { bid, ask, isHighVolume: isSpike };
  });

  const h = time.getHours().toString().padStart(2, '0');
  const m = time.getMinutes().toString().padStart(2, '0');
  const day = time.getDate().toString().padStart(2, '0');
  const month = (time.getMonth() + 1).toString().padStart(2, '0');

  let timeLabel = '';
  if (timeframe === '1d' || timeframe === '1w' || timeframe === '1M') {
    timeLabel = `${day}/${month}`;
  } else {
    timeLabel = `${h}:${m}`;
  }

  return { timeLabel, prices };
}

export function generateOrderBook(priceLevels: number[], currentPrice: number): OrderBookRowData[] {
  return priceLevels.map(p => {
    const isAbove = p > currentPrice;
    const isBelow = p < currentPrice;
    
    return {
      price: p,
      bidOrders: isBelow ? Math.floor(Math.random() * 50) + 1 : 0,
      bidVol: isBelow ? Math.floor(Math.random() * 300000) + 5000 : 0,
      askVol: isAbove ? Math.floor(Math.random() * 300000) + 5000 : 0,
      askOrders: isAbove ? Math.floor(Math.random() * 50) + 1 : 0,
    };
  });
}

function generateStats(basePrice: number) {
  return {
    O: basePrice - Math.random() * 10,
    H: basePrice + Math.random() * 50,
    L: basePrice - Math.random() * 50,
    C: basePrice + (Math.random() * 10 - 5),
    V: Math.random() * 10 + 1,
    OI: 165.0,
    buyVol: Math.random() * 5 + 1,
    sellVol: Math.random() * 5 + 1,
    buyTrades: Math.floor(Math.random() * 1000) + 100,
    sellTrades: Math.floor(Math.random() * 1000) + 100,
    imbBlock: 10
  };
}

export function simulateNextTick(prevState: ChartSimState): ChartSimState {
  const { symbol, timeframe, priceLevels, columns } = prevState;
  const config = SYMBOL_CONFIGS[symbol];
  
  const newColumns = [...columns.slice(1)];
  const lastTime = new Date(
    columns[columns.length - 1].timeLabel
      ? Date.now()
      : Date.now()
  );
  const nextTime = new Date(Date.now() + intervalMap[timeframe]);
  newColumns.push(generateColumnData(priceLevels, nextTime, timeframe));
  
  const maxDelta = config.basePrice * 0.005;
  const newPrice = prevState.currentPrice + (Math.random() * maxDelta * 2 - maxDelta);
  const snappedPrice = Math.round(newPrice / config.increment) * config.increment;
  
  return {
    ...prevState,
    currentPrice: snappedPrice,
    columns: newColumns,
    orderBook: generateOrderBook(priceLevels, snappedPrice),
    stats: {
      ...prevState.stats,
      buyVol: prevState.stats.buyVol + Math.random() * 0.1,
      sellVol: prevState.stats.sellVol + Math.random() * 0.1,
      buyTrades: prevState.stats.buyTrades + Math.floor(Math.random() * 10),
      sellTrades: prevState.stats.sellTrades + Math.floor(Math.random() * 10),
    }
  };
}

export function formatVolume(num: number): string {
  if (num === 0) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

export function getCellColorClass(bid: number, ask: number): string {
  if (bid === 0 && ask === 0) return 'bg-[#1a1a1a] text-transparent';
  
  const total = bid + ask;
  if (total === 0) return 'bg-[#1a1a1a] text-transparent';
  
  const safeBid = bid || 0.1;
  const safeAsk = ask || 0.1;
  
  const askRatio = safeAsk / safeBid;
  const bidRatio = safeBid / safeAsk;

  if (askRatio >= 3) return 'bg-[#00e676] text-black font-semibold shadow-[inner_0_0_2px_rgba(0,0,0,0.5)]'; 
  if (askRatio >= 1.5) return 'bg-[#81c784] text-black'; 
  
  if (bidRatio >= 3) return 'bg-[#ff1744] text-white font-semibold shadow-[inner_0_0_2px_rgba(0,0,0,0.5)]'; 
  if (bidRatio >= 1.5) return 'bg-[#ff8a80] text-black'; 
  
  return 'bg-[#1e1e1e] text-gray-400'; 
}
