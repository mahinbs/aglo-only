/**
 * Map any Yahoo Finance full_symbol (or user-typed symbol) to a valid
 * TradingView chart symbol.  TradingView format: EXCHANGE:SYMBOL
 *
 * Covers: US stocks, Indian (NSE/BSE), Crypto, Forex, Futures/Commodities,
 * UK (LSE), Canada (TSX), Australia (ASX), HK, Germany (XETRA), France/NL/BE
 * (Euronext), Italy (MIL), Spain (BME), Switzerland (SWX), Singapore (SGX),
 * Japan (TSE), Korea (KRX), Brazil (BMFBOVESPA), and major global indices.
 */

/* ─────────────────── Exact-match lookup tables ─────────────────── */

/** Yahoo futures symbols → TradingView continuous-contract notation */
const FUTURES_MAP: Record<string, string> = {
  "BTC=F": "CME:BTC1!",
  "GC=F": "COMEX:GC1!",
  "SI=F": "COMEX:SI1!",
  "HG=F": "COMEX:HG1!",
  "PA=F": "COMEX:PA1!",
  "PL=F": "COMEX:PL1!",
  "CL=F": "NYMEX:CL1!",
  "NG=F": "NYMEX:NG1!",
  "HO=F": "NYMEX:HO1!",
  "RB=F": "NYMEX:RB1!",
  "BZ=F": "NYMEX:BB1!",
  "ES=F": "CME:ES1!",
  "NQ=F": "CME:NQ1!",
  "YM=F": "CBOT:YM1!",
  "RTY=F": "CME:RTY1!",
  "ZC=F": "CBOT:ZC1!",
  "ZS=F": "CBOT:ZS1!",
  "ZW=F": "CBOT:ZW1!",
  "ZO=F": "CBOT:ZO1!",
  "ZR=F": "CBOT:ZR1!",
  "KC=F": "ICEUS:KC1!",
  "SB=F": "ICEUS:SB1!",
  "CT=F": "ICEUS:CT1!",
  "CC=F": "ICEUS:CC1!",
  "OJ=F": "ICEUS:OJ1!",
  "LBS=F": "CME:LBS1!",
  "LE=F": "CME:LE1!",
  "HE=F": "CME:HE1!",
  "GF=F": "CME:GF1!",
  "ZB=F": "CBOT:ZB1!",
  "ZN=F": "CBOT:ZN1!",
  "ZF=F": "CBOT:ZF1!",
  "ZT=F": "CBOT:ZT1!",
  "6E=F": "CME:EUR1!",
  "6J=F": "CME:JPY1!",
  "6B=F": "CME:GBP1!",
  "6A=F": "CME:AUD1!",
  "6C=F": "CME:CAD1!",
  "6S=F": "CME:CHF1!",
};

/** Yahoo index symbols (^ prefix) → TradingView */
const INDEX_MAP: Record<string, string> = {
  "^GSPC": "SP:SPX",
  "^DJI": "DJ:DJI",
  "^IXIC": "NASDAQ:IXIC",
  "^RUT": "CME:RTY1!",
  "^VIX": "CBOE:VIX",
  "^FTSE": "LSE:UKX",
  "^GDAXI": "XETR:DAX",
  "^FCHI": "EURONEXT:PX1",
  "^AEX": "EURONEXT:AEX",
  "^BFX": "EURONEXT:BEL20",
  "^STOXX50E": "EURONEXT:SX5E",
  "^IBEX": "BME:IBC",
  "^MIB": "MIL:FTSEMIB",
  "^OMXS30": "OMXSTO:OMXS30",
  "^SMI": "SWX:SMI",
  "^ATX": "WBAG:ATX",
  "^N225": "TSE:NI225",
  "^HSI": "HKEX:HSI",
  "^STI": "SGX:STI",
  "^KS11": "KRX:KOSPI",
  "^KOSDAQ": "KRX:KOSDAQ",
  "^TWII": "TWSE:TAIEX",
  "^AXJO": "ASX:XJO",
  "^AORD": "ASX:XAO",
  "^NZ50": "NZX:NZ50",
  "^NZSE50FG": "NZX:NZ50",
  "^BSESN": "BSE:SENSEX",
  "^NSEI": "NSE:NIFTY",
  "^NIFTYBANK": "NSE:BANKNIFTY",
  "^BVSP": "BMFBOVESPA:IBOV",
  "^MXX": "BMV:IPC",
  "^IPSA": "BOLSA:IPSA",
  "^MERV": "BCBA:IMV",
  "^TA125.TA": "TASE:TA125",
  "^TNX": "TVC:TNX",
  "^TYX": "TVC:TYX",
  "^FVX": "TVC:FVX",
  "^IRX": "TVC:IRX",
  "^CASE30": "EGX:EGX30",
  "^JKSE": "IDX:COMPOSITE",
  "^KLSE": "MYX:FBMKLCI",
  "^PSI": "EURONEXT:PSI",
  "^XU100": "BIST:XU100",
  "^JSE": "JSE:J203",
};

/* Crypto base → best TradingView exchange for USD pair */
const CRYPTO_EXCHANGE_USD: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  BNB: "BINANCE:BNBUSDT",
  SOL: "BINANCE:SOLUSDT",
  XRP: "BINANCE:XRPUSDT",
  ADA: "BINANCE:ADAUSDT",
  DOGE: "BINANCE:DOGEUSDT",
  DOT: "BINANCE:DOTUSDT",
  MATIC: "BINANCE:MATICUSDT",
  LINK: "BINANCE:LINKUSDT",
  AVAX: "BINANCE:AVAXUSDT",
  LTC: "BINANCE:LTCUSDT",
  UNI: "BINANCE:UNIUSDT",
  ATOM: "BINANCE:ATOMUSDT",
  XLM: "BINANCE:XLMUSDT",
  TRX: "BINANCE:TRXUSDT",
  ALGO: "BINANCE:ALGOUSDT",
  FIL: "BINANCE:FILUSDT",
  AAVE: "BINANCE:AAVEUSDT",
  MKR: "BINANCE:MKRUSDT",
  COMP: "BINANCE:COMPUSDT",
  SUI: "BINANCE:SUIUSDT",
  APT: "BINANCE:APTUSDT",
  OP: "BINANCE:OPUSDT",
  ARB: "BINANCE:ARBUSDT",
  SEI: "BINANCE:SEIUSDT",
  INJ: "BINANCE:INJUSDT",
};

/* ──────────────────── Exchange suffix → TradingView prefix ──────── */

/** Yahoo Finance suffix → TradingView exchange prefix */
function suffixToTV(suffix: string, ticker: string): string {
  switch (suffix) {
    // Indian
    case "NS": return `NSE:${ticker}`;
    case "BO": return `BSE:${ticker}`;
    // UK
    case "L": return `LSE:${ticker}`;
    // Canada
    case "TO": return `TSX:${ticker}`;
    case "V":  return `TSXV:${ticker}`;
    case "CN": return `CSE:${ticker}`;
    // Australia
    case "AX": return `ASX:${ticker}`;
    // New Zealand
    case "NZ": return `NZX:${ticker}`;
    // Hong Kong
    case "HK": return `HKEX:${ticker}`;
    // Japan
    case "T":  return `TSE:${ticker}`;
    // Korea
    case "KS": return `KRX:${ticker}`;
    case "KQ": return `KRX:${ticker}`;
    // China
    case "SS": return `SSE:${ticker}`;
    case "SZ": return `SZSE:${ticker}`;
    // Taiwan
    case "TW": return `TWSE:${ticker}`;
    // Singapore
    case "SI": return `SGX:${ticker}`;
    // Germany (XETRA)
    case "DE": return `XETR:${ticker}`;
    // France, NL, Belgium, Portugal (Euronext)
    case "PA": return `EURONEXT:${ticker}`;
    case "AS": return `EURONEXT:${ticker}`;
    case "BR": return `EURONEXT:${ticker}`;
    case "LS": return `EURONEXT:${ticker}`;
    // Spain
    case "MC": return `BME:${ticker}`;
    // Italy
    case "MI": return `MIL:${ticker}`;
    case "MF": return `MIL:${ticker}`;
    // Switzerland
    case "SW": return `SWX:${ticker}`;
    // Sweden
    case "ST": return `OMXSTO:${ticker}`;
    // Norway
    case "OL": return `OSEBX:${ticker}`;
    // Denmark
    case "CO": return `OMXCOP:${ticker}`;
    // Finland
    case "HE": return `OMXHEX:${ticker}`;
    // Vienna
    case "VI": return `WBAG:${ticker}`;
    // Warsaw
    case "WA": return `GPW:${ticker}`;
    // Johannesburg
    case "JO": return `JSE:${ticker}`;
    // Brazil
    case "SA": return `BMFBOVESPA:${ticker}`;
    // Mexico
    case "MX": return `BMV:${ticker}`;
    // Israel
    case "TA": return `TASE:${ticker}`;
    // Saudi Arabia
    case "SR": return `TADAWUL:${ticker}`;
    // UAE
    case "AE": return `DFM:${ticker}`;
    // Turkey
    case "IS": return `BIST:${ticker}`;
    // Indonesia
    case "JK": return `IDX:${ticker}`;
    // Malaysia
    case "KL": return `MYX:${ticker}`;
    // Thailand
    case "BK": return `SET:${ticker}`;
    // Philippines
    case "PS": return `PSE:${ticker}`;
    // Czech Republic
    case "PR": return `PSE:${ticker}`;
    // Hungary
    case "BD": return `BET:${ticker}`;
    // Romania
    case "RO": return `BVB:${ticker}`;
    // Egypt
    case "CA": return `EGX:${ticker}`;
    default:   return `${ticker}`;
  }
}

/* ─────────────────────── Main exported function ─────────────────── */

export function getTradingViewSymbol(symbol: string): string {
  if (!symbol || typeof symbol !== "string") return "BINANCE:BTCUSDT";
  const s = symbol.trim().toUpperCase();

  // 1. Exact futures lookup
  if (FUTURES_MAP[s]) return FUTURES_MAP[s];

  // 2. Exact index lookup
  if (INDEX_MAP[s]) return INDEX_MAP[s];

  // 3. Generic futures suffix (anything ending =F not in the map above)
  if (s.endsWith("=F")) {
    const base = s.slice(0, -2);
    return `CME:${base}1!`;
  }

  // 4. Indian exchanges
  if (s.endsWith(".NS")) return `NSE:${s.slice(0, -3)}`;
  if (s.endsWith(".BO")) return `BSE:${s.slice(0, -3)}`;

  // 5. Crypto — Yahoo format "BASE-QUOTE" (e.g. BTC-USD, ETH-EUR, SOL-GBP)
  if (s.includes("-")) {
    const [base, quote] = s.split("-");
    // USD/USDT pairs → prefer Binance
    if (quote === "USD" || quote === "USDT") {
      if (CRYPTO_EXCHANGE_USD[base]) return CRYPTO_EXCHANGE_USD[base];
      return `BINANCE:${base}USDT`;
    }
    // EUR, GBP, BTC, ETH cross pairs
    if (quote === "EUR") return `COINBASE:${base}EUR`;
    if (quote === "GBP") return `COINBASE:${base}GBP`;
    if (quote === "BTC") return `BINANCE:${base}BTC`;
    if (quote === "ETH") return `BINANCE:${base}ETH`;
    if (quote === "CAD") return `BITFINEX:${base}CAD`;
    if (quote === "AUD") return `BITFINEX:${base}AUD`;
    if (quote === "CHF") return `KRAKEN:${base}CHF`;
    // generic: try Binance
    return `BINANCE:${base}${quote}`;
  }

  // 6. Forex: 6-letter XXXXXXYYYY=X  or raw XXXXXXYYYY
  if (s.endsWith("=X")) {
    const pair = s.slice(0, -2);
    return `FX:${pair}`;
  }
  if (/^[A-Z]{6}$/.test(s)) return `FX:${s}`;

  // 7. Index with ^ prefix
  if (s.startsWith("^")) {
    return INDEX_MAP[s] || `TVC:${s.slice(1)}`;
  }

  // 8. Dot-suffix exchanges (e.g. JPNU.L, SHOP.TO, CBA.AX)
  const dotIdx = s.lastIndexOf(".");
  if (dotIdx > 0) {
    const ticker = s.slice(0, dotIdx);
    const suffix = s.slice(dotIdx + 1);
    return suffixToTV(suffix, ticker);
  }

  // 9. Known crypto base alone (no dash, no suffix)
  if (CRYPTO_EXCHANGE_USD[s]) return CRYPTO_EXCHANGE_USD[s];

  // 10. Pure alphabetic 1–5 chars → assume NASDAQ (US stock)
  if (/^[A-Z]{1,5}$/.test(s)) return `NASDAQ:${s}`;

  // 11. Already has exchange prefix
  if (s.includes(":")) return s;

  // 12. Fallback — pass as-is, TradingView widget will show "symbol doesn't exist" if wrong
  return s;
}

/** Whether the asset is typically quoted in USD (US stocks, forex, crypto). */
export function isUsdDenominatedSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== "string") return false;
  const s = symbol.trim().toUpperCase();
  if (s.endsWith(".NS") || s.endsWith(".BO")) return false;
  if (s.endsWith("=X") || /^[A-Z]{6}$/.test(s)) return true;
  if (s.endsWith("=F")) return true;
  if (s.startsWith("^")) return false;
  if (s.includes("-USD") || s.includes("-USDT")) return true;
  if (CRYPTO_EXCHANGE_USD[s]) return true;
  if (/^[A-Z]{1,5}$/.test(s)) return true;
  const dotIdx = s.lastIndexOf(".");
  if (dotIdx > 0) {
    const suffix = s.slice(dotIdx + 1);
    if (["NS", "BO", "L", "TO", "AX", "HK", "T", "DE", "PA", "AS", "MI", "MC", "SW"].includes(suffix)) return false;
  }
  return false;
}
