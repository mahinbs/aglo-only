/**
 * OptionChainViewer — Live option chain display with CE/PE LTP, OI, IV, Delta.
 * Streams option chain in real-time via WebSocket (VITE_OPTIONS_API_URL FastAPI).
 * Highlights the ATM strike and the user's selected strike offset.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createOptionChainWebSocket, fetchExpiryDates, normalizeOptionChainPayload } from "@/lib/optionsApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface LegData {
  ltp: number;
  oi: number;
  oi_change: number;
  iv: number;
  delta: number;
  theta: number;
  symbol: string;
}

interface StrikeRow {
  strike: number;
  ce: LegData | null;
  pe: LegData | null;
}

interface ChainData {
  atm_strike: number;
  underlying_ltp: number;
  expiry_date: string;
  symbol: string;
  exchange: string;
  strikes: StrikeRow[];
}

interface ExpiryItem {
  date: string;
  display: string;
  tag: string;
  days_to_expiry: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const STRIKE_OFFSETS: Record<string, number> = {
  ITM2: -2, ITM1: -1, ATM: 0, OTM1: 1, OTM2: 2, OTM3: 3,
};

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n) || n === 0) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtK(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return "—";
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function isMarketHours(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hhmm = ist.getHours() * 100 + ist.getMinutes();
  return hhmm >= 915 && hhmm <= 1530 && ist.getDay() >= 1 && ist.getDay() <= 5;
}

function toWsExchange(exchange: string): string {
  if (exchange === "NFO") return "NSE_INDEX";
  return exchange;
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol?: string;
  exchange?: string;
  selectedStrikeOffset?: string;
}

export function OptionChainViewer({
  open,
  onOpenChange,
  symbol: initSymbol = "NIFTY",
  exchange: initExchange = "NFO",
  selectedStrikeOffset = "ATM",
}: Props) {
  const [symbol, setSymbol] = useState(initSymbol);
  const [exchange] = useState(initExchange);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [expiries, setExpiries] = useState<ExpiryItem[]>([]);
  const [chain, setChain] = useState<ChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const chainWsRef = useRef<WebSocket | null>(null);

  const fetchExpiries = useCallback(async () => {
    try {
      const data = await fetchExpiryDates({ symbol, exchange, instrument: "OPTIDX" });
      const expiries = (data as { expiries?: ExpiryItem[] })?.expiries ?? [];
      if (!expiries.length) return;
      setExpiries(expiries);
      if (!selectedExpiry && expiries[0]) {
        setSelectedExpiry(expiries[0].date);
      }
    } catch { /* silent */ }
  }, [symbol, exchange, selectedExpiry]);

  const connectChainStream = useCallback(async (expiry?: string) => {
    const exp = expiry ?? selectedExpiry;
    if (!exp) return;
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      chainWsRef.current?.close();
      chainWsRef.current = createOptionChainWebSocket(
        token,
        { underlying: symbol, exchange: toWsExchange(exchange), expiry_date: exp },
        (incoming) => {
          const normalized = normalizeOptionChainPayload(
            incoming,
            symbol,
            exchange,
            exp,
          ) as ChainData;
          setChain(normalized);
          setLastUpdated(new Date());
          setLoading(false);
        },
        () => setLoading(false),
      );
    } catch (err) {
      setLoading(false);
      toast.error(`Chain stream failed: ${String(err)}`);
    }
  }, [symbol, exchange, selectedExpiry]);

  // Initial load
  useEffect(() => {
    if (open) {
      setSymbol(initSymbol);
      fetchExpiries();
    }
  }, [open, initSymbol]);

  // Fetch chain when expiry is set
  useEffect(() => {
    if (open && selectedExpiry) {
      connectChainStream(selectedExpiry);
    }
  }, [selectedExpiry, open, connectChainStream]);

  // Close stream when dialog closes/unmounts.
  useEffect(() => {
    if (!open) {
      chainWsRef.current?.close();
      chainWsRef.current = null;
    }
    return () => {
      chainWsRef.current?.close();
      chainWsRef.current = null;
    };
  }, [open]);

  // Compute which strikes to display (ATM ± 6)
  const displayStrikes = chain
    ? (() => {
        const atmIdx = chain.strikes.findIndex((s) => s.strike >= chain.atm_strike);
        const center = atmIdx >= 0 ? atmIdx : Math.floor(chain.strikes.length / 2);
        return chain.strikes.slice(Math.max(0, center - 6), center + 7);
      })()
    : [];

  // Resolve the "selected" strike based on offset
  const selectedStrike = chain
    ? (() => {
        const offset = STRIKE_OFFSETS[selectedStrikeOffset] ?? 0;
        const atmIdx = chain.strikes.findIndex((s) => s.strike >= chain.atm_strike);
        const targetIdx = atmIdx + offset;
        return chain.strikes[Math.max(0, Math.min(targetIdx, chain.strikes.length - 1))]?.strike ?? null;
      })()
    : null;

  const maxOi = displayStrikes.reduce((mx, s) => {
    return Math.max(mx, s.ce?.oi ?? 0, s.pe?.oi ?? 0);
  }, 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Option Chain — {symbol}
              {chain && (
                <Badge variant="outline" className="text-xs">
                  LTP: ₹{fmt(chain.underlying_ltp, 0)}
                </Badge>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Select value={symbol} onValueChange={(v) => { setSymbol(v); setSelectedExpiry(""); }}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"].map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {expiries.length > 0 && (
                <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Select expiry" /></SelectTrigger>
                  <SelectContent>
                    {expiries.map((e) => (
                      <SelectItem key={e.date} value={e.date}>
                        {e.display}
                        <span className="text-muted-foreground ml-2">
                          ({e.days_to_expiry}d)
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => connectChainStream()}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>
          </DialogTitle>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST
              {isMarketHours() ? " · real-time stream active" : ""}
            </p>
          )}
        </DialogHeader>

        {/* Chain table */}
        <div className="flex-1 overflow-auto">
          {loading && !chain ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !chain ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              Select an expiry to view the option chain.
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <tr className="border-b border-border/60">
                  {/* CE columns */}
                  <th className="text-right px-2 py-2 text-green-500/70 font-medium">OI</th>
                  <th className="text-right px-2 py-2 text-green-500/70 font-medium">Chg OI</th>
                  <th className="text-right px-2 py-2 text-green-500/70 font-medium">IV %</th>
                  <th className="text-right px-2 py-2 text-green-500/70 font-medium">Delta</th>
                  <th className="text-right px-3 py-2 text-green-400 font-semibold">CE LTP</th>
                  {/* Strike */}
                  <th className="text-center px-4 py-2 font-bold text-foreground/90">STRIKE</th>
                  {/* PE columns */}
                  <th className="text-left px-3 py-2 text-red-400 font-semibold">PE LTP</th>
                  <th className="text-left px-2 py-2 text-red-500/70 font-medium">Delta</th>
                  <th className="text-left px-2 py-2 text-red-500/70 font-medium">IV %</th>
                  <th className="text-left px-2 py-2 text-red-500/70 font-medium">Chg OI</th>
                  <th className="text-left px-2 py-2 text-red-500/70 font-medium">OI</th>
                </tr>
              </thead>
              <tbody>
                {displayStrikes.map((row) => {
                  const isAtm = row.strike === chain.atm_strike;
                  const isSelected = row.strike === selectedStrike;
                  const ceOiBar = row.ce?.oi ? (row.ce.oi / maxOi) * 100 : 0;
                  const peOiBar = row.pe?.oi ? (row.pe.oi / maxOi) * 100 : 0;

                  return (
                    <tr
                      key={row.strike}
                      className={cn(
                        "border-b border-border/30 hover:bg-muted/30 transition-colors",
                        isAtm && "bg-primary/5",
                        isSelected && "bg-emerald-500/10",
                      )}
                    >
                      {/* CE OI bar */}
                      <td className="text-right px-2 py-1.5 relative">
                        <div
                          className="absolute inset-y-0 right-0 bg-green-500/10"
                          style={{ width: `${ceOiBar}%` }}
                        />
                        <span className="relative">{fmtK(row.ce?.oi)}</span>
                      </td>
                      <td className={cn("text-right px-2 py-1.5", (row.ce?.oi_change ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                        {fmtK(row.ce?.oi_change)}
                      </td>
                      <td className="text-right px-2 py-1.5 text-muted-foreground">
                        {fmt(row.ce?.iv, 1)}
                      </td>
                      <td className="text-right px-2 py-1.5 text-muted-foreground">
                        {fmt(row.ce?.delta, 3)}
                      </td>
                      <td className={cn("text-right px-3 py-1.5 font-semibold", isSelected && "text-emerald-400")}>
                        {fmt(row.ce?.ltp)}
                      </td>

                      {/* Strike column */}
                      <td className={cn(
                        "text-center px-4 py-1.5 font-bold tabular-nums",
                        isAtm ? "text-primary" : "text-foreground",
                      )}>
                        {row.strike.toLocaleString("en-IN")}
                        {isAtm && (
                          <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1 border-primary/50 text-primary">ATM</Badge>
                        )}
                        {isSelected && !isAtm && (
                          <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1 border-emerald-500/50 text-emerald-400">
                            {selectedStrikeOffset}
                          </Badge>
                        )}
                      </td>

                      {/* PE columns */}
                      <td className={cn("text-left px-3 py-1.5 font-semibold", isSelected && "text-red-400")}>
                        {fmt(row.pe?.ltp)}
                      </td>
                      <td className="text-left px-2 py-1.5 text-muted-foreground">
                        {fmt(row.pe?.delta, 3)}
                      </td>
                      <td className="text-left px-2 py-1.5 text-muted-foreground">
                        {fmt(row.pe?.iv, 1)}
                      </td>
                      <td className={cn("text-left px-2 py-1.5", (row.pe?.oi_change ?? 0) >= 0 ? "text-green-400" : "text-red-400")}>
                        {fmtK(row.pe?.oi_change)}
                      </td>
                      <td className="text-left px-2 py-1.5 relative">
                        <div
                          className="absolute inset-y-0 left-0 bg-red-500/10"
                          style={{ width: `${peOiBar}%` }}
                        />
                        <span className="relative">{fmtK(row.pe?.oi)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer legend */}
        {chain && (
          <div className="shrink-0 border-t border-border/50 pt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-green-500" /> CE = Call (Bullish)
            </span>
            <span className="flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-red-400" /> PE = Put (Bearish)
            </span>
            <span className="ml-auto">
              Expiry: {chain.expiry_date} · {chain.strikes.length} strikes loaded
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
