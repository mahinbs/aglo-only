/**
 * OptionsPaperDashboard — Shows all open options positions (paper + live).
 * Displays: Entry Premium, Current Premium (LTP), P&L %, Delta, Time to Expiry.
 * Allows manual close of any position.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { closeOptionsPosition, createPositionsWebSocket, fetchLivePositions } from "@/lib/optionsApi";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FlaskConical,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
  Clock,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSlippageLine } from "@/lib/tradeSlippage";

// ── Types ─────────────────────────────────────────────────────────────────

interface OptionsPosition {
  id: string;
  symbol: string;
  action: string;
  status: string;
  is_paper_trade: boolean;
  options_strategy_id: string;
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

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function pnlColor(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 0) return "text-green-400";
  return "text-red-400";
}

function daysToExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate + "T00:00:00+05:30");
  const now = new Date();
  const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatDte(dte: number | null): string {
  if (dte == null) return "—";
  if (dte < 0) return "Expired";
  if (dte === 0) return "Today";
  return `${dte}d`;
}

function isMarketHours(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hhmm = ist.getHours() * 100 + ist.getMinutes();
  return hhmm >= 915 && hhmm <= 1530 && ist.getDay() >= 1 && ist.getDay() <= 5;
}

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  onRefreshStrategies?: () => void;
  /** When true, renders a placeholder card even when no positions exist. */
  showWhenEmpty?: boolean;
}

export function OptionsPaperDashboard({ onRefreshStrategies, showWhenEmpty }: Props) {
  const { user } = useAuth();
  const [positions, setPositions] = useState<OptionsPosition[]>([]);
  const [totalPnl, setTotalPnl] = useState(0);
  const [loading, setLoading] = useState(true);
  const [closeTarget, setCloseTarget] = useState<OptionsPosition | null>(null);
  const [closing, setClosing] = useState(false);
  const wsRef    = useRef<WebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fetch positions — uses FastAPI if available, else Supabase direct. */
  const fetchPositions = useCallback(async () => {
    if (!user?.id) return;
    try {
      const result = await fetchLivePositions() as { positions: OptionsPosition[]; total_pnl: number };
      setPositions(result.positions ?? []);
      setTotalPnl(result.total_pnl ?? 0);
    } catch {
      // Fallback to direct Supabase query
      const { data, error } = await (supabase as any)
        .from("active_trades")
        .select(`
          id, symbol, action, status, is_paper_trade, options_strategy_id,
          underlying, option_type, expiry_date, strike_offset,
          entry_premium, reference_entry_price, peak_premium, current_price, shares, entry_time, options_symbol,
          options_strategies:options_strategy_id(name)
        `)
        .eq("user_id", user.id)
        .not("options_strategy_id", "is", null)
        .in("status", ["active", "monitoring", "exit_zone"])
        .order("entry_time", { ascending: false });
      if (!error) {
        const mapped = (data ?? []).map((t: Record<string, unknown>) => ({
          ...t,
          reference_entry_price:
            t.reference_entry_price != null && t.reference_entry_price !== ""
              ? Number(t.reference_entry_price)
              : (t.entry_premium != null ? Number(t.entry_premium) : null),
          strategy_name: (t.options_strategies as { name?: string } | null)?.name ?? "—",
        }));
        setPositions(mapped);
      }
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchPositions(); }, [fetchPositions]);

  // Try to connect via WebSocket for real-time P&L; fall back to 30s polling.
  useEffect(() => {
    if (!user?.id) return;
    let ws: WebSocket | null = null;

    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (!token) return;

      ws = createPositionsWebSocket(
        user.id,
        token,
        (incoming) => {
          type WsRow = {
            trade_id?: string;
            id?: string;
            ltp?: number;
            peak?: number;
            entry?: number;
            reference_entry_price?: number;
          };
          const rows = incoming as WsRow[];
          const map = new Map(
            rows.map((p) => [String(p.trade_id ?? p.id ?? ""), p])
          );
          setPositions((prev) =>
            prev.map((p) => {
              const u = map.get(p.id);
              if (!u) return p;
              return {
                ...p,
                current_price: u.ltp ?? p.current_price,
                peak_premium: u.peak ?? p.peak_premium,
                reference_entry_price:
                  u.reference_entry_price ?? p.reference_entry_price,
              };
            })
          );
        },
      );
      wsRef.current = ws;
    });

    // Polling fallback for when WS is not available
    intervalRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        if (isMarketHours()) fetchPositions();
      }
    }, 30000);

    return () => {
      wsRef.current?.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id, fetchPositions]);

  const handleManualClose = async () => {
    if (!closeTarget) return;
    setClosing(true);
    try {
      await closeOptionsPosition(closeTarget.id, "manual");
      toast.success("Position closed successfully.");
      setPositions((prev) => prev.filter((p) => p.id !== closeTarget.id));
      onRefreshStrategies?.();
    } catch (err) {
      toast.error(`Failed to close: ${(err as Error).message}`);
    } finally {
      setClosing(false);
      setCloseTarget(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    if (!showWhenEmpty) return null;
    return (
      <Card className="border-primary/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Open Options Positions
          </CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center space-y-1">
          <FlaskConical className="h-6 w-6 text-zinc-700 mx-auto" />
          <p className="text-sm text-zinc-500 font-medium">No open options positions yet</p>
          <p className="text-xs text-zinc-600 max-w-xs mx-auto">
            Options paper trades from your strategies appear here once the ORB signal fires and a position is opened.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Open Options Positions ({positions.length}) {totalPnl !== 0 && <span className={totalPnl >= 0 ? "text-green-400 text-xs font-normal" : "text-red-400 text-xs font-normal"}>{totalPnl >= 0 ? "+" : ""}₹{fmt(totalPnl)}</span>}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchPositions}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-2.5">
          {positions.map((pos) => {
            const entryPrem = pos.entry_premium ?? 0;
            const currentPrem = pos.current_price ?? entryPrem;
            const pnlPct = entryPrem > 0 ? ((currentPrem - entryPrem) / entryPrem) * 100 : null;
            const pnlInr = entryPrem > 0 ? (currentPrem - entryPrem) * pos.shares : null;
            const dte = daysToExpiry(pos.expiry_date);
            const peakPrem = pos.peak_premium ?? entryPrem;

            return (
              <div
                key={pos.id}
                className="rounded-lg border border-border/50 p-3 space-y-2"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {pos.option_type === "CE" ? (
                        <TrendingUp className="h-4 w-4 text-green-400" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-400" />
                      )}
                      <span className="font-semibold text-sm">
                        {pos.underlying ?? pos.symbol} {pos.strike_offset} {pos.option_type}
                      </span>
                      {pos.is_paper_trade && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-500/40 text-blue-400">
                          <FlaskConical className="h-2.5 w-2.5 mr-0.5" /> Paper
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Strategy: {pos.strategy_name} · {pos.options_symbol ?? pos.symbol}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setCloseTarget(pos)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <p className="text-[10px] text-muted-foreground leading-snug">
                  Ref ₹{fmt(pos.reference_entry_price ?? entryPrem)} ·{" "}
                  {formatSlippageLine(
                    (pos.action === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
                    pos.reference_entry_price ?? entryPrem,
                    entryPrem,
                    (n) => `₹${fmt(n)}`,
                  )}
                </p>

                {/* Metrics grid */}
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div className="rounded bg-muted/30 px-1.5 py-1.5">
                    <p className="text-[10px] text-muted-foreground/70">Entry</p>
                    <p className="text-xs font-semibold">₹{fmt(entryPrem)}</p>
                  </div>
                  <div className="rounded bg-muted/30 px-1.5 py-1.5">
                    <p className="text-[10px] text-muted-foreground/70">Current</p>
                    <p className="text-xs font-semibold">₹{fmt(currentPrem)}</p>
                  </div>
                  <div className={cn("rounded px-1.5 py-1.5", (pnlPct ?? 0) >= 0 ? "bg-green-500/10" : "bg-red-500/10")}>
                    <p className="text-[10px] text-muted-foreground/70">P&L %</p>
                    <p className={cn("text-xs font-bold", pnlColor(pnlPct))}>
                      {pnlPct != null ? `${pnlPct >= 0 ? "+" : ""}${fmt(pnlPct, 1)}%` : "—"}
                    </p>
                  </div>
                  <div className="rounded bg-muted/30 px-1.5 py-1.5">
                    <p className="text-[10px] text-muted-foreground/70">P&L ₹</p>
                    <p className={cn("text-xs font-semibold", pnlColor(pnlInr))}>
                      {pnlInr != null ? `${pnlInr >= 0 ? "+" : ""}₹${fmt(Math.abs(pnlInr), 0)}` : "—"}
                    </p>
                  </div>
                  <div className={cn("rounded px-1.5 py-1.5", dte != null && dte <= 1 ? "bg-red-500/10" : "bg-muted/30")}>
                    <p className="text-[10px] text-muted-foreground/70 flex items-center justify-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" /> DTE
                    </p>
                    <p className={cn("text-xs font-semibold", dte != null && dte <= 1 ? "text-red-400" : "")}>
                      {formatDte(dte)}
                    </p>
                  </div>
                </div>

                {/* Trailing info */}
                {peakPrem > entryPrem && (
                  <div className="text-[10px] text-muted-foreground flex items-center gap-3 border-t border-border/30 pt-1.5">
                    <span>Peak: ₹{fmt(peakPrem)}</span>
                    <span>
                      Trail SL ≈ ₹{fmt(peakPrem * 0.85, 0)}
                      <span className="text-muted-foreground/60 ml-0.5">(15% from peak)</span>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Manual close confirmation */}
      <AlertDialog open={!!closeTarget} onOpenChange={(o) => { if (!o && !closing) setCloseTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Position</AlertDialogTitle>
            <AlertDialogDescription>
              {closeTarget?.is_paper_trade
                ? "This will mark the paper trade as closed at the current market price."
                : "This will place a MARKET SELL order via your broker to close this position."}
              <br /><br />
              <strong>
                {closeTarget?.underlying} {closeTarget?.strike_offset} {closeTarget?.option_type}
              </strong>
              {" — "}
              Current P&L: {
                closeTarget && closeTarget.entry_premium
                  ? `${(((closeTarget.current_price ?? closeTarget.entry_premium) - closeTarget.entry_premium) / closeTarget.entry_premium * 100).toFixed(1)}%`
                  : "—"
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleManualClose}
              disabled={closing}
              className={!closeTarget?.is_paper_trade ? "bg-destructive hover:bg-destructive/90" : ""}
            >
              {closing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {closeTarget?.is_paper_trade ? "Close Paper Trade" : "Place Exit Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
