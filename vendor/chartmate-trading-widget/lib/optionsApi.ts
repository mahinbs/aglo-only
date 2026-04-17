/**
 * ChartMate Options API client (E2E path).
 *
 * When `VITE_OPTIONS_API_URL` is set: Browser → FastAPI (JWT) → OpenAlgo.
 * Chain + expiry also fall back to Supabase Edge (`fetch-expiry-dates`, `fetch-option-chain`)
 * when FastAPI is not configured, so the options UI can still load live lists.
 *
 * Orders / positions / WS still require FastAPI where noted.
 */
import { supabase } from "@/integrations/supabase/client";
import { friendlyBrokerMarketDataError } from "@/lib/brokerMarketDataErrors";

const API_BASE = (import.meta.env.VITE_OPTIONS_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const EXPIRY_CACHE_TTL_MS = 90_000;

type ExpiryResponse = {
  symbol: string;
  exchange: string;
  expiries: NormalizedExpiryItem[];
};

const expiryCache = new Map<string, { expiresAt: number; data: ExpiryResponse }>();
const expiryInFlight = new Map<string, Promise<ExpiryResponse>>();

/** True when the app should call the hosted FastAPI service for options (full E2E). */
export function isOptionsApiConfigured(): boolean {
  return API_BASE.length > 0;
}

export function getOptionsApiBaseUrl(): string {
  return API_BASE;
}

/** Get the current Supabase session JWT for authenticating FastAPI requests. */
async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** Safely convert any value to a human-readable string for error messages. */
function toErrString(v: unknown, fallback = "Unknown error"): string {
  if (!v) return fallback;
  if (typeof v === "string") return v.trim() || fallback;
  if (Array.isArray(v)) {
    // FastAPI Pydantic validation errors: [{loc, msg, type}]
    return v.map((d) => (typeof d === "object" && d !== null && "msg" in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d))).join("; ");
  }
  if (typeof v === "object") {
    // OpenAlgo nested error objects: {message: "Validation error", errors: {field: ["msg"]}}
    const o = v as Record<string, unknown>;
    const base = typeof o.message === "string" ? o.message
      : typeof o.description === "string" ? o.description
      : typeof o.detail === "string" ? o.detail
      : null;
    // Append field-level errors if present
    if (o.errors && typeof o.errors === "object") {
      const fieldMsgs = Object.entries(o.errors as Record<string, unknown>)
        .map(([k, msgs]) => `${k}: ${Array.isArray(msgs) ? msgs.join(", ") : msgs}`)
        .join("; ");
      return base ? `${base} — ${fieldMsgs}` : fieldMsgs;
    }
    return base ?? JSON.stringify(v).slice(0, 200);
  }
  return String(v);
}

/** Low-level fetch wrapper for the FastAPI service. */
async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_BASE) throw new Error("Options API URL not configured (VITE_OPTIONS_API_URL)");
  const token = await getToken();
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  const res = await fetch(url, {
    ...options,
    signal: options.signal ?? controller.signal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  }).finally(() => window.clearTimeout(timeoutId));
  if (!res.ok) {
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    const msg = body
      ? toErrString(body.detail ?? body.message ?? body.error ?? body, `HTTP ${res.status}`)
      : `HTTP ${res.status} ${res.statusText}`;
    throw new Error(friendlyBrokerMarketDataError(msg));
  }
  return res.json() as Promise<T>;
}

// ── Option chain shape (matches Supabase edge + OptionChainViewer) ───────────

type ChainLeg = {
  ltp: number;
  oi: number;
  oi_change: number;
  iv: number;
  delta: number;
  theta: number;
  symbol: string;
};

function mapChainLeg(o: Record<string, unknown> | null | undefined): ChainLeg | null {
  if (!o || typeof o !== "object") return null;
  return {
    ltp: Number(o.ltp ?? o.lastPrice ?? 0),
    oi: Number(o.oi ?? o.openInterest ?? 0),
    oi_change: Number(o.oi_change ?? o.changeinOpenInterest ?? 0),
    iv: Number(o.iv ?? o.impliedVolatility ?? 0),
    delta: Number(o.delta ?? 0),
    theta: Number(o.theta ?? 0),
    symbol: String(o.symbol ?? o.tradingSymbol ?? ""),
  };
}

/** Normalize OpenAlgo /optionchain JSON into the shape OptionChainViewer expects. */
export function normalizeOptionChainPayload(
  data: unknown,
  symbol: string,
  exchange: string,
  expiryFallback: string
): {
  atm_strike: number;
  underlying_ltp: number;
  expiry_date: string;
  symbol: string;
  exchange: string;
  strikes: { strike: number; ce: ChainLeg | null; pe: ChainLeg | null }[];
} {
  const root = (data as Record<string, unknown>)?.data ?? data;
  const r = root as Record<string, unknown>;

  if (Array.isArray(r.strikes)) {
    return {
      atm_strike: Number(r.atm_strike ?? 0),
      underlying_ltp: Number(r.underlying_ltp ?? r.ltp ?? 0),
      expiry_date: String(r.expiry_date ?? r.expiry ?? expiryFallback),
      symbol,
      exchange,
      strikes: r.strikes.map((row: unknown) => {
        const x = row as Record<string, unknown>;
        return {
          strike: Number(x.strike ?? 0),
          ce: mapChainLeg(x.ce as Record<string, unknown>),
          pe: mapChainLeg(x.pe as Record<string, unknown>),
        };
      }),
    };
  }

  const strikeMap = new Map<number, { ce: ChainLeg | null; pe: ChainLeg | null }>();
  const calls: unknown[] = Array.isArray(r.calls) ? r.calls : Array.isArray(r.CE) ? (r.CE as unknown[]) : [];
  const puts: unknown[] = Array.isArray(r.puts) ? r.puts : Array.isArray(r.PE) ? (r.PE as unknown[]) : [];

  for (const c of calls) {
    const item = c as Record<string, unknown>;
    const strike = Number(item.strike ?? item.strikePrice ?? 0);
    if (!strike) continue;
    const existing = strikeMap.get(strike) ?? { ce: null, pe: null };
    existing.ce = mapChainLeg(item);
    strikeMap.set(strike, existing);
  }
  for (const p of puts) {
    const item = p as Record<string, unknown>;
    const strike = Number(item.strike ?? item.strikePrice ?? 0);
    if (!strike) continue;
    const existing = strikeMap.get(strike) ?? { ce: null, pe: null };
    existing.pe = mapChainLeg(item);
    strikeMap.set(strike, existing);
  }

  const chainArr = Array.isArray(r.chain) ? r.chain : [];
  for (const row of chainArr) {
    const x = row as Record<string, unknown>;
    const strike = Number(x.strike ?? 0);
    if (!strike) continue;
    strikeMap.set(strike, {
      ce: mapChainLeg(x.ce as Record<string, unknown>),
      pe: mapChainLeg(x.pe as Record<string, unknown>),
    });
  }

  const strikes = Array.from(strikeMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([strike, legs]) => ({ strike, ce: legs.ce, pe: legs.pe }));

  return {
    atm_strike: Number(r.atm_strike ?? r.atmstrike ?? 0),
    underlying_ltp: Number(r.underlying_ltp ?? r.ltp ?? 0),
    expiry_date: String(r.expiry_date ?? r.expiry ?? expiryFallback),
    symbol,
    exchange,
    strikes,
  };
}

/** IST calendar date as YYYY-MM-DD (for session keys and comparisons). */
export function getIstDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function calendarDaysBetweenIST(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00+05:30`);
  const b = new Date(`${toYmd}T12:00:00+05:30`);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function toISTDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** OpenAlgo option chain expects expiry like 09APR26 (DDMMMYY). */
export function isoDateToOpenAlgoExpiry(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso.trim();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${String(day).padStart(2, "0")}${months[mo - 1]}${String(y).slice(-2)}`;
}

function brokerExpiryParam(expiry_date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry_date.trim())) return isoDateToOpenAlgoExpiry(expiry_date.trim());
  return expiry_date.trim();
}

// Known NSE/BSE index underlyings — used to auto-pick OPTIDX vs OPTSTK
const OPTION_INDEX_UNDERLYINGS = new Set([
  "NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX",
  "NIFTYIT", "NIFTYPSE", "NIFTYAUTO", "NIFTYMETAL", "NIFTYPHARMA",
  "NIFTYBANK", "NIFTY100", "NIFTYMICROCAP250",
]);

/**
 * Auto-detect instrument type from underlying symbol.
 * Index underlyings → OPTIDX; everything else → OPTSTK.
 */
export function instrumentTypeForUnderlying(underlying: string): "OPTIDX" | "OPTSTK" {
  return OPTION_INDEX_UNDERLYINGS.has((underlying ?? "").trim().toUpperCase())
    ? "OPTIDX"
    : "OPTSTK";
}

/** Approximate F&O lot sizes (units per lot) for quantity = lots × units. */
export const UNDERLYING_OPTIONS_LOT_UNITS: Record<string, number> = {
  NIFTY: 75,
  BANKNIFTY: 30,
  FINNIFTY: 65,
  MIDCPNIFTY: 120,
  SENSEX: 20,
};

export function lotUnitsForUnderlying(underlying: string): number {
  return UNDERLYING_OPTIONS_LOT_UNITS[underlying.trim().toUpperCase()] ?? 75;
}

export interface NormalizedExpiryItem {
  date: string;
  display: string;
  tag: "weekly" | "monthly" | "next_weekly" | "far";
  days_to_expiry: number;
}

/** Match fetch-expiry-dates edge function output for OptionChainViewer. */
export function normalizeExpiryPayload(
  data: unknown,
  symbol: string,
  exchange: string
): { symbol: string; exchange: string; expiries: NormalizedExpiryItem[] } {
  const raw = data as Record<string, unknown>;
  const rawDates: string[] = Array.isArray(raw?.data)
    ? (raw.data as string[])
    : Array.isArray(data)
      ? (data as string[])
      : [];
  const todayKey = getIstDateKey();
  const parsed = rawDates
    .map((ds) => {
      let d: Date | null = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) d = new Date(`${ds}T12:00:00+05:30`);
      else if (/^\d{2}-[A-Za-z]+-\d{4}$/.test(ds)) d = new Date(ds.replace(/-/g, " ") + " 12:00:00 GMT+0530");
      else d = new Date(ds);
      if (isNaN(d.getTime())) return null;
      return d;
    })
    .filter((d): d is Date => d !== null && toISTDateKey(d) >= todayKey)
    .sort((a, b) => a.getTime() - b.getTime());

  const expiries: NormalizedExpiryItem[] = parsed.map((d, idx) => {
    const expKey = toISTDateKey(d);
    const dayN = calendarDaysBetweenIST(todayKey, expKey);
    let tag: NormalizedExpiryItem["tag"];
    if (idx === 0) tag = "weekly";
    else if (idx === 1) tag = dayN <= 14 ? "next_weekly" : "monthly";
    else if (dayN <= 35) tag = "monthly";
    else tag = "far";
    return {
      date: expKey,
      display: formatDisplay(d),
      tag,
      days_to_expiry: dayN,
    };
  });

  return { symbol, exchange, expiries };
}

/** Map saved expiry_type to a concrete row from normalized broker expiries. */
export function pickExpiryForStrategyType(
  items: NormalizedExpiryItem[],
  expiry_type: string
): NormalizedExpiryItem | null {
  if (!items.length) return null;
  if (expiry_type === "weekly") return items.find((i) => i.tag === "weekly") ?? items[0];
  if (expiry_type === "next_weekly")
    return items.find((i) => i.tag === "next_weekly") ?? items[1] ?? items[0];
  if (expiry_type === "monthly")
    return items.find((i) => i.tag === "monthly") ?? items[Math.min(2, items.length - 1)] ?? items[0];
  return items[0];
}

export type TradableOptionRow = {
  strike: number;
  side: "CE" | "PE";
  symbol: string;
  label: string;
};

export function tradableRowsFromChain(chain: {
  strikes: { strike: number; ce: { symbol: string } | null; pe: { symbol: string } | null }[];
}): TradableOptionRow[] {
  const rows: TradableOptionRow[] = [];
  for (const s of chain.strikes) {
    const ce = s.ce?.symbol?.trim();
    const pe = s.pe?.symbol?.trim();
    if (ce) rows.push({ strike: s.strike, side: "CE", symbol: ce, label: `${s.strike} CE` });
    if (pe) rows.push({ strike: s.strike, side: "PE", symbol: pe, label: `${s.strike} PE` });
  }
  return rows.sort((a, b) => a.strike - b.strike || a.side.localeCompare(b.side));
}

// ── Option Chain ──────────────────────────────────────────────────────────────

export async function fetchOptionChain(params: {
  underlying: string;
  exchange?: string;
  expiry_date: string;
  strike_count?: number;
}) {
  const ex = params.exchange ?? "NFO";
  const sym = params.underlying;
  const expiryBroker = brokerExpiryParam(params.expiry_date);

  if (API_BASE) {
    const raw = await apiFetch<Record<string, unknown>>("/api/options/chain", {
      method: "POST",
      body: JSON.stringify({
        underlying: sym,
        exchange: ex,
        expiry_date: expiryBroker,
        strike_count: params.strike_count,
      }),
    });
    // OpenAlgo may return {status:"error", message:"..."} with HTTP 200
    if (raw?.status === "error" || raw?.status === "failed") {
      const hint = toErrString(
        raw.message ?? raw.error_msg ?? raw.error,
        "OpenAlgo option chain error — check your broker session"
      );
      throw new Error(friendlyBrokerMarketDataError(hint));
    }
    return normalizeOptionChainPayload(raw, sym, ex, params.expiry_date);
  }

  const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("fetch-option-chain", {
    body: {
      symbol: sym,
      exchange: ex,
      expiry_date: params.expiry_date,
    },
  });
  if (error) throw new Error(friendlyBrokerMarketDataError(error.message ?? "fetch-option-chain failed"));
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(friendlyBrokerMarketDataError(String((data as { error: unknown }).error)));
  }
  return normalizeOptionChainPayload(data ?? {}, sym, ex, params.expiry_date);
}

export async function fetchExpiryDates(params: {
  symbol: string;
  exchange?: string;
  instrument?: string;
}) {
  const ex = params.exchange ?? "NFO";
  const sym = params.symbol;
  // Auto-detect instrument type from underlying if not provided
  const instrument = params.instrument ?? instrumentTypeForUnderlying(sym);
  const cacheKey = `${sym.toUpperCase()}|${ex.toUpperCase()}|${instrument.toUpperCase()}`;

  const cached = expiryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inFlight = expiryInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const resolver = (async (): Promise<ExpiryResponse> => {
    if (API_BASE) {
      try {
        const raw = await apiFetch<Record<string, unknown>>("/api/options/expiry", {
          method: "POST",
          body: JSON.stringify({
            symbol: sym,
            exchange: ex,
            instrument,
          }),
        });
        // OpenAlgo may return {status:"error", message:"..."} with HTTP 200
        if (raw?.status === "error" || raw?.status === "failed") {
          const hint = toErrString(
            raw.message ?? raw.error_msg ?? raw.error,
            "OpenAlgo returned an error — check your broker session and OpenAlgo API key"
          );
          throw new Error(friendlyBrokerMarketDataError(hint));
        }
        const result = normalizeExpiryPayload(raw, sym, ex);
        // If OpenAlgo returned no dates, surface it as an explicit error
        if (result.expiries.length === 0) {
          throw new Error(
            friendlyBrokerMarketDataError(
              "No expiry dates returned from broker. Market may be closed or your OpenAlgo API key / broker session needs refreshing.",
            ),
          );
        }
        expiryCache.set(cacheKey, {
          expiresAt: Date.now() + EXPIRY_CACHE_TTL_MS,
          data: result,
        });
        return result;
      } catch {
        // FastAPI path failed or timed out — fall back to Supabase Edge route.
      }
    }

    const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("fetch-expiry-dates", {
      body: { symbol: sym, exchange: ex, instrumenttype: instrument },
    });
    if (error) throw new Error(friendlyBrokerMarketDataError(error.message ?? "fetch-expiry-dates failed"));
    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new Error(friendlyBrokerMarketDataError(String((data as { error: unknown }).error)));
    }
    const normalized = data && Array.isArray((data as { expiries?: unknown }).expiries)
      ? {
          symbol: (data as { symbol?: string }).symbol ?? sym,
          exchange: (data as { exchange?: string }).exchange ?? ex,
          expiries: (data as { expiries: NormalizedExpiryItem[] }).expiries,
        }
      : normalizeExpiryPayload(data ?? {}, sym, ex);
    expiryCache.set(cacheKey, {
      expiresAt: Date.now() + EXPIRY_CACHE_TTL_MS,
      data: normalized,
    });
    return normalized;
  })();

  expiryInFlight.set(cacheKey, resolver);
  try {
    return await resolver;
  } finally {
    expiryInFlight.delete(cacheKey);
  }
}

/**
 * Fetch the live LTP (Last Traded Price) for a single options symbol.
 * Returns null when the market is closed or the symbol is invalid.
 */
export async function fetchLtp(
  symbol: string,
  exchange: string
): Promise<number | null> {
  if (!API_BASE) return null;
  try {
    const raw = await apiFetch<Record<string, unknown>>("/api/options/quotes", {
      method: "POST",
      body: JSON.stringify({ symbol, exchange }),
    });
    if (raw?.status === "error" || raw?.status === "failed") return null;
    // OpenAlgo quotes: {status:"success", data:{ltp:123.45,...}}
    const data = (raw?.data ?? raw) as Record<string, unknown>;
    const ltp = Number(data?.ltp ?? data?.last_price ?? data?.close ?? 0);
    return ltp > 0 ? ltp : null;
  } catch {
    return null;
  }
}

export async function fetchVix(): Promise<number> {
  const res = await apiFetch<{ vix: number }>("/api/options/vix");
  return res.vix;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function placeOptionsOrder(params: {
  underlying: string;
  exchange?: string;
  expiry_date: string;
  offset?: string;
  option_type: "CE" | "PE";
  action: "BUY" | "SELL";
  quantity: number;
  is_paper?: boolean;
  strategy_id?: string;
}) {
  return apiFetch("/api/options/orders/place", {
    method: "POST",
    body: JSON.stringify({
      underlying:  params.underlying,
      exchange:    params.exchange ?? "NSE_INDEX",
      expiry_date: params.expiry_date,
      offset:      params.offset ?? "ATM",
      option_type: params.option_type,
      action:      params.action,
      quantity:    params.quantity,
      is_paper:    params.is_paper ?? true,
      strategy_id: params.strategy_id,
    }),
  });
}

export async function closeOptionsPosition(tradeId: string, reason = "manual") {
  return apiFetch("/api/options/orders/close", {
    method: "POST",
    body: JSON.stringify({ trade_id: tradeId, reason }),
  });
}

// ── Strategy Signals ──────────────────────────────────────────────────────────

export type StrategyType =
  | "iron_condor"
  | "strangle"
  | "bull_put_spread"
  | "jade_lizard"
  | "orb_buying";

export async function generateStrategySignal(
  strategy_type: StrategyType,
  params: Record<string, unknown>
) {
  if (!API_BASE) throw new Error("Options API URL not configured (VITE_OPTIONS_API_URL)");
  return apiFetch("/api/options/strategies/signal", {
    method: "POST",
    body: JSON.stringify({ strategy_type, params }),
  });
}

export async function executeStrategy(
  strategy_type: StrategyType,
  params: Record<string, unknown>,
  is_paper = true,
  strategy_id?: string
) {
  if (!API_BASE) throw new Error("Options API URL not configured");
  const qs = new URLSearchParams({
    is_paper: String(is_paper),
    ...(strategy_id ? { strategy_id } : {}),
  });
  return apiFetch(`/api/options/strategies/execute?${qs}`, {
    method: "POST",
    body: JSON.stringify({ strategy_type, params }),
  });
}

// ── Live Positions ────────────────────────────────────────────────────────────

/** Shape returned by GET /api/options/positions/ (normalized for React). */
export interface OptionsPositionRow {
  id: string;
  symbol: string;
  action: string;
  status: string;
  is_paper_trade: boolean;
  options_strategy_id: string | null;
  underlying: string | null;
  option_type: string | null;
  expiry_date: string | null;
  strike_offset: string | null;
  entry_premium: number | null;
  reference_entry_price: number | null;
  peak_premium: number | null;
  current_price: number | null;
  shares: number;
  entry_time: string;
  options_symbol: string | null;
  strategy_name?: string;
}

function mapApiPositionToRow(p: Record<string, unknown>): OptionsPositionRow {
  const entry = Number(p.entry_price ?? 0);
  const ref =
    p.reference_entry_price != null && p.reference_entry_price !== ""
      ? Number(p.reference_entry_price)
      : entry;
  const current = Number(p.current_ltp ?? entry);
  return {
    id: String(p.trade_id ?? ""),
    symbol: String(p.symbol ?? ""),
    action: String(p.action ?? "BUY"),
    status: String(p.status ?? "active"),
    is_paper_trade: Boolean(p.is_paper_trade ?? true),
    options_strategy_id: p.options_strategy_id != null ? String(p.options_strategy_id) : null,
    underlying: p.underlying != null ? String(p.underlying) : null,
    option_type: p.option_type != null ? String(p.option_type) : null,
    expiry_date: p.expiry_date != null ? String(p.expiry_date) : null,
    strike_offset: p.strike_offset != null ? String(p.strike_offset) : null,
    entry_premium: entry,
    reference_entry_price: Number.isFinite(ref) && ref > 0 ? ref : entry,
    peak_premium: p.peak_premium != null ? Number(p.peak_premium) : entry,
    current_price: current,
    shares: Math.max(1, Number(p.shares ?? 1)),
    entry_time: "",
    options_symbol: p.options_symbol != null ? String(p.options_symbol) : String(p.symbol ?? ""),
    strategy_name: p.strategy_name != null ? String(p.strategy_name) : undefined,
  };
}

export async function fetchLivePositions(): Promise<{
  positions: OptionsPositionRow[];
  total_pnl: number;
}> {
  const raw = await apiFetch<{ positions: Record<string, unknown>[]; total_pnl: number }>(
    "/api/options/positions/"
  );
  return {
    positions: (raw.positions ?? []).map(mapApiPositionToRow),
    total_pnl: raw.total_pnl ?? 0,
  };
}

// ── WebSocket for real-time P&L ───────────────────────────────────────────────

export function createPositionsWebSocket(
  userId: string,
  token: string,
  onMessage: (positions: unknown[]) => void,
  onError?: (e: Event) => void
): WebSocket | null {
  if (!API_BASE) return null;

  const wsBase = API_BASE.replace(/^http/, "ws");
  const ws     = new WebSocket(`${wsBase}/ws/options/positions/${userId}?token=${token}`);

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "positions") onMessage(msg.data);
    } catch { /* ignore parse errors */ }
  };
  ws.onerror = onError ?? null;
  return ws;
}

export function createOptionChainWebSocket(
  token: string,
  params: { underlying: string; exchange: string; expiry_date: string },
  onMessage: (data: unknown) => void,
  onError?: (e: Event) => void
): WebSocket {
  if (!API_BASE) throw new Error("Options API URL not configured (VITE_OPTIONS_API_URL)");
  const wsBase = API_BASE.replace(/^http/, "ws");
  const q = new URLSearchParams({
    token,
    underlying: params.underlying,
    exchange: params.exchange,
    expiry_date: params.expiry_date,
  });
  const ws = new WebSocket(`${wsBase}/ws/options/chain?${q.toString()}`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "chain") onMessage(msg.data);
    } catch {
      // ignore parse errors
    }
  };
  ws.onerror = onError ?? null;
  return ws;
}
