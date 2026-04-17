import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FlaskConical,
  Loader2,
  Maximize2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
  Ban,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { runLiveEntryConditionScan, type LiveScanStrategyRow } from "@/lib/strategyLiveScan";
import YahooChartPanel from "@/components/YahooChartPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PendingPaperTradeRow = {
  id: string;
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL";
  quantity: number;
  status: "pending" | "scheduled" | "executed" | "cancelled" | "expired";
  is_paper_trade: boolean;
  scheduled_for: string | null;
  error_message: string | null;
  created_at: string;
  last_checked_at: string | null;
  strategy_id: string;
  strategy_name?: string | null;
};

interface Props {
  row: PendingPaperTradeRow;
  onCancelled?: () => void;
}
type FiatCurrency = "INR" | "USD";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STRATEGY_FOR_SCAN =
  "id,name,trading_mode,paper_strategy_type,stop_loss_pct,take_profit_pct,is_intraday,entry_conditions,exit_conditions,position_config,risk_config,chart_config,execution_days,market_type,start_time,end_time,squareoff_time,risk_per_trade_pct,description";

function toYahooChartSymbol(sym: string, exchange?: string | null): string {
  const s = String(sym ?? "").trim().toUpperCase();
  const ex = String(exchange ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s.includes("=") || s.includes("-") || s.endsWith(".NS") || s.endsWith(".BO")) return s;
  if (ex === "BSE") return `${s}.BO`;
  return `${s}.NS`;
}

function parseAuditLines(msg: string | null): { ok: boolean; label: string }[] {
  if (!msg || msg.startsWith("__QUEUED_FOR_MONITOR__") || msg.startsWith("Cooldown")) return [];
  return msg
    .split("\n")
    .filter((l) => l.startsWith("PASS ") || l.startsWith("FAIL "))
    .slice(0, 60)
    .map((l) => ({ ok: l.startsWith("PASS "), label: l.replace(/^(PASS|FAIL) /, "") }));
}

function parseServerStatusLines(msg: string | null): string[] {
  if (!msg || msg.startsWith("__QUEUED_FOR_MONITOR__") || msg.startsWith("Cooldown")) return [];
  return msg
    .split("\n")
    .map((l) => l.trim())
    .filter((t) => {
      if (!t) return false;
      if (t.startsWith("PASS ") || t.startsWith("FAIL ")) return false;
      return true;
    })
    .slice(0, 6);
}

function formatCountdown(target: string): string {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "Starting…";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Returns true if the strategy's end/squareoff time has already passed today.
 * Times are "HH:MM" or "HH:MM:SS" in IST (Asia/Calcutta).
 */
function isStrategyTimePastToday(strategy: LiveScanStrategyRow | null): boolean {
  if (!strategy) return false;
  const cutoff = strategy.squareoff_time ?? strategy.end_time;
  if (!cutoff) return false;
  try {
    const nowIST = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Calcutta" }),
    );
    const [hh, mm] = cutoff.split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
    const cutoffMs = hh * 3600000 + mm * 60000;
    const nowMs = nowIST.getHours() * 3600000 + nowIST.getMinutes() * 60000 + nowIST.getSeconds() * 1000;
    return nowMs > cutoffMs;
  } catch {
    return false;
  }
}

/** Build a human-readable conditions list from the strategy config for display before server scans. */
function buildConditionsFromConfig(strategy: LiveScanStrategyRow | null): { section: string; label: string }[] {
  if (!strategy) return [];
  const lines: { section: string; label: string }[] = [];

  // Session window
  if (strategy.start_time || strategy.end_time) {
    lines.push({
      section: "Session",
      label: `Trading window: ${strategy.start_time ?? "—"} → ${strategy.end_time ?? "—"} IST`,
    });
  }
  if (strategy.squareoff_time) {
    lines.push({ section: "Session", label: `Square-off by: ${strategy.squareoff_time} IST` });
  }

  // Entry conditions
  const ec = strategy.entry_conditions;
  if (ec && typeof ec === "object") {
    const arr = Array.isArray(ec) ? ec : Object.values(ec as Record<string, unknown>);
    for (const cond of arr) {
      if (!cond || typeof cond !== "object") continue;
      const c = cond as Record<string, unknown>;
      const name = String(c.indicator ?? c.name ?? c.type ?? "").trim();
      const op = String(c.operator ?? c.condition ?? "").trim();
      const val = c.value ?? c.threshold ?? c.level ?? "";
      if (name) {
        lines.push({
          section: "Entry",
          label: [name, op, val !== "" ? String(val) : ""].filter(Boolean).join(" "),
        });
      }
    }
  }

  // Exit conditions
  const xc = strategy.exit_conditions;
  if (xc && typeof xc === "object") {
    const arr = Array.isArray(xc) ? xc : Object.values(xc as Record<string, unknown>);
    for (const cond of arr) {
      if (!cond || typeof cond !== "object") continue;
      const c = cond as Record<string, unknown>;
      const name = String(c.indicator ?? c.name ?? c.type ?? "").trim();
      const op = String(c.operator ?? c.condition ?? "").trim();
      const val = c.value ?? c.threshold ?? c.level ?? "";
      if (name) {
        lines.push({
          section: "Exit",
          label: [name, op, val !== "" ? String(val) : ""].filter(Boolean).join(" "),
        });
      }
    }
  }

  // SL/TP
  const pc = strategy.position_config as Record<string, unknown> | null | undefined;
  const slPct = pc?.stop_loss_pct ?? (strategy as unknown as Record<string, unknown>).stop_loss_pct;
  const tpPct = pc?.take_profit_pct ?? (strategy as unknown as Record<string, unknown>).take_profit_pct;
  if (slPct != null) lines.push({ section: "Risk", label: `Stop loss: ${slPct}%` });
  if (tpPct != null) lines.push({ section: "Risk", label: `Take profit: ${tpPct}%` });

  return lines;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PendingPaperTradeCard({ row, onCancelled }: Props) {
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [countdown, setCountdown] = useState<string>("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [strategyRow, setStrategyRow] = useState<LiveScanStrategyRow | null>(null);
  const [strategyErr, setStrategyErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [liveHeadline, setLiveHeadline] = useState("");
  const [liveChecks, setLiveChecks] = useState<Array<{ ok: boolean; label: string }>>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [autoExpired, setAutoExpired] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editQuantity, setEditQuantity] = useState(String(row.quantity));
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState<FiatCurrency>(
    String(row.exchange).toUpperCase() === "NSE" || String(row.exchange).toUpperCase() === "BSE"
      ? "INR"
      : "USD",
  );
  const [editPrice, setEditPrice] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [usdPerInr, setUsdPerInr] = useState<number | null>(null);

  const isScheduled = row.status === "scheduled";
  const isPending = row.status === "pending";
  const watching = isPending || isScheduled;
  const yahooSymbol = toYahooChartSymbol(row.symbol, row.exchange);
  const isCrypto = String(row.exchange).toUpperCase() === "CRYPTO" || row.symbol.toUpperCase().includes("-USD");
  const assetCurrency: FiatCurrency =
    String(row.exchange).toUpperCase() === "NSE" || String(row.exchange).toUpperCase() === "BSE"
      ? "INR"
      : "USD";

  const convertBetweenInrUsd = useCallback(
    (amount: number, from: FiatCurrency, to: FiatCurrency) => {
      if (!Number.isFinite(amount) || from === to) return amount;
      if (!usdPerInr || usdPerInr <= 0) return amount;
      if (from === "INR" && to === "USD") return amount * usdPerInr;
      if (from === "USD" && to === "INR") return amount / usdPerInr;
      return amount;
    },
    [usdPerInr],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/INR");
        if (!res.ok) return;
        const json = await res.json();
        const rate = Number(json?.rates?.USD);
        if (!cancelled && Number.isFinite(rate) && rate > 0) setUsdPerInr(rate);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveLatestPrice = useCallback(async (symbol: string) => {
    const { data, error } = await supabase.functions.invoke("get-chart-data", {
      body: { symbol, interval: "1d", range: "1mo" },
    });
    if (error) throw new Error(error.message);
    const metaPrice = Number((data as any)?.meta?.regularMarketPrice);
    if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice;
    const candles = Array.isArray((data as any)?.candles) ? (data as any).candles : [];
    const lastClose = Number(candles[candles.length - 1]?.close);
    if (Number.isFinite(lastClose) && lastClose > 0) return lastClose;
    throw new Error("Could not fetch latest price.");
  }, []);

  useEffect(() => {
    if (!editOpen) return;
    setEditQuantity(String(row.quantity));
    setEditCurrency(assetCurrency);
    const quoteSymbol =
      row.exchange === "NSE"
        ? `${row.symbol}.NS`
        : row.exchange === "BSE"
          ? `${row.symbol}.BO`
          : row.symbol;
    let cancelled = false;
    (async () => {
      try {
        const px = await resolveLatestPrice(quoteSymbol);
        if (cancelled) return;
        setEditPrice(px);
        const qty = Number(row.quantity);
        if (Number.isFinite(qty) && qty > 0) {
          const amountAsset = qty * px;
          const amountDisplay = convertBetweenInrUsd(amountAsset, assetCurrency, assetCurrency);
          setEditAmount(amountDisplay.toFixed(2));
        }
      } catch {
        if (!cancelled) setEditPrice(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editOpen, row.quantity, row.symbol, row.exchange, resolveLatestPrice, convertBetweenInrUsd, assetCurrency]);

  const handleEditQuantityChange = (value: string) => {
    if (!isCrypto) {
      const wholePart = (value ?? "").split(/[.,]/)[0] ?? "";
      setEditQuantity(wholePart.replace(/[^\d]/g, ""));
      return;
    }
    setEditQuantity(value);
  };

  useEffect(() => {
    const qty = Number(editQuantity);
    if (!Number.isFinite(qty) || qty <= 0 || editPrice == null) return;
    const amountAsset = qty * editPrice;
    const amountDisplay = convertBetweenInrUsd(amountAsset, assetCurrency, editCurrency);
    setEditAmount(amountDisplay.toFixed(2));
  }, [editQuantity, editPrice, editCurrency, convertBetweenInrUsd, assetCurrency]);

  const handleEditAmountChange = (value: string) => {
    setEditAmount(value);
    const amountDisplay = Number(value);
    if (!Number.isFinite(amountDisplay) || amountDisplay <= 0 || editPrice == null || editPrice <= 0) return;
    const amountAsset = convertBetweenInrUsd(amountDisplay, editCurrency, assetCurrency);
    const rawQty = amountAsset / editPrice;
    const nextQty = isCrypto ? Number(rawQty.toFixed(6)) : Math.max(1, Math.floor(rawQty));
    setEditQuantity(String(nextQty));
  };

  const handleSaveEdit = useCallback(async () => {
    const qtyNum = Number(editQuantity);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast({ title: "Invalid quantity", description: "Enter a valid quantity.", variant: "destructive" });
      return;
    }
    setEditSaving(true);
    try {
      const finalQty = isCrypto ? Number(qtyNum.toFixed(8)) : Math.max(1, Math.floor(qtyNum));
      const { error } = await (supabase as any)
        .from("pending_conditional_orders")
        .update({ quantity: finalQty })
        .eq("id", row.id)
        .in("status", ["pending", "scheduled"]);
      if (error) throw error;
      toast({ title: "Updated", description: "Pending paper trade sizing updated." });
      setEditOpen(false);
      onCancelled?.();
    } catch (e: unknown) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Could not update pending sizing.",
        variant: "destructive",
      });
    } finally {
      setEditSaving(false);
    }
  }, [editQuantity, isCrypto, row.id, onCancelled, toast]);

  // Countdown ticker for scheduled orders
  useEffect(() => {
    if (!isScheduled || !row.scheduled_for) return;
    const update = () => setCountdown(formatCountdown(row.scheduled_for!));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isScheduled, row.scheduled_for]);

  // Load strategy config
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    setStrategyErr(null);
    (async () => {
      const { data, error } = await (supabase as any)
        .from("user_strategies")
        .select(STRATEGY_FOR_SCAN)
        .eq("id", row.strategy_id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setStrategyErr(error?.message ?? "Could not load strategy");
        setStrategyRow(null);
        return;
      }
      setStrategyRow(data as LiveScanStrategyRow);
    })();
    return () => { cancelled = true; };
  }, [row.strategy_id, watching]);

  // Auto-cancel if strategy time window has passed today
  useEffect(() => {
    if (!isPending || !strategyRow || autoExpired) return;
    if (!isStrategyTimePastToday(strategyRow)) return;

    setAutoExpired(true);
    (async () => {
      const { error } = await (supabase as any)
        .from("pending_conditional_orders")
        .update({
          status: "cancelled",
          error_message: `Auto-cancelled: strategy window (${strategyRow.squareoff_time ?? strategyRow.end_time}) has passed for today.`,
        })
        .eq("id", row.id);
      if (!error) {
        toast({
          title: "Strategy window closed",
          description: `${row.symbol} — ${row.strategy_name ?? "Strategy"} monitoring cancelled. The trading window has passed for today.`,
        });
        onCancelled?.();
      }
    })();
  }, [isPending, strategyRow, autoExpired, row.id, row.symbol, row.strategy_name, onCancelled, toast]);

  const runLiveScan = useCallback(async () => {
    if (!strategyRow) return;
    setScanning(true);
    setLiveError(null);
    try {
      const r = await runLiveEntryConditionScan(strategyRow, {
        symbol: row.symbol,
        exchange: row.exchange,
        action: row.action,
        deploy_overrides: null,
      });
      if (r.error) {
        setLiveError(r.error);
        setLiveHeadline("");
        setLiveChecks([]);
      } else {
        setLiveError(null);
        setLiveHeadline(r.headline);
        setLiveChecks(r.checks);
      }
      setLiveAt(new Date().toISOString());
    } catch (e: unknown) {
      setLiveError(e instanceof Error ? e.message : "Scan failed");
      setLiveChecks([]);
    } finally {
      setScanning(false);
    }
  }, [strategyRow, row.symbol, row.exchange, row.action]);

  // Auto-scan when detail opens
  useEffect(() => {
    if (!detailOpen || !strategyRow) return;
    void runLiveScan();
  }, [detailOpen, strategyRow?.id, runLiveScan]);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      const { error } = await (supabase as any)
        .from("pending_conditional_orders")
        .update({ status: "cancelled", error_message: "Cancelled by user" })
        .eq("id", row.id);
      if (error) throw error;
      toast({ title: "Paper strategy cancelled", description: `${row.symbol} pending entry was cancelled.` });
      onCancelled?.();
    } catch (e: unknown) {
      toast({
        title: "Cancel failed",
        description: e instanceof Error ? e.message : "Could not cancel.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  }, [row.id, row.symbol, onCancelled, toast]);

  const handleRefreshClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    void runLiveScan();
  };

  const serverChecks = parseAuditLines(row.error_message);
  const serverStatusLines = parseServerStatusLines(row.error_message);
  // Prefer server checks (live from monitor), fall back to on-demand scan
  const displayChecks = serverChecks.length > 0 ? serverChecks : liveChecks;
  const failing = displayChecks.filter((c) => !c.ok);
  const passing = displayChecks.filter((c) => c.ok);
  const passCount = passing.length;
  const failCount = failing.length;
  const dataSource = serverChecks.length > 0 ? "Monitor (live sync)" : liveChecks.length > 0 ? "On-demand scan" : null;

  // Config-level conditions for when no scan results yet
  const configConditions = buildConditionsFromConfig(strategyRow);
  const configSections = [...new Set(configConditions.map((c) => c.section))];

  const timePassed = isStrategyTimePastToday(strategyRow);

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-3 sm:p-4 space-y-2.5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="h-4 w-4 text-teal-400 shrink-0" />
          <span className="font-bold text-sm text-white truncate">{row.symbol}</span>
          <span
            className={cn(
              "shrink-0 text-[9px] px-1.5 py-0.5 rounded leading-none uppercase font-bold",
              row.action === "BUY"
                ? "bg-teal-500/10 text-teal-400"
                : "bg-red-500/10 text-red-400",
            )}
          >
            {row.action}
          </span>
          <span className="text-[10px] text-zinc-500 shrink-0">×{row.quantity}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {timePassed ? (
            <Badge className="text-[10px] border-orange-500/40 bg-orange-500/10 text-orange-300 border flex items-center gap-1">
              <Ban className="h-3 w-3" />
              Window closed
            </Badge>
          ) : isScheduled ? (
            <Badge className="text-[10px] border-violet-500/40 bg-violet-500/10 text-violet-300 border flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {countdown || "Scheduled"}
            </Badge>
          ) : isPending ? (
            <Badge className="text-[10px] border-teal-500/40 bg-teal-500/10 text-teal-300 border flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Watching
            </Badge>
          ) : null}

          {watching && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px] border-blue-500/40 text-blue-300"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
          )}
          {watching && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px] border-teal-500/40 text-teal-300"
              onClick={() => setDetailOpen(true)}
            >
              <Maximize2 className="h-3 w-3 mr-1" />
              Details
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            disabled={cancelling}
            className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
            title="Cancel pending entry"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {row.strategy_name && (
        <p className="text-[11px] text-zinc-400">
          Strategy: <span className="text-zinc-300 font-medium">{row.strategy_name}</span>
        </p>
      )}

      {isScheduled && row.scheduled_for && (
        <div className="flex items-center gap-1.5 text-[11px] text-violet-300">
          <Clock className="h-3 w-3 shrink-0" />
          <span>Monitoring starts {new Date(row.scheduled_for).toLocaleString()}</span>
        </div>
      )}

      {timePassed && strategyRow && (
        <p className="text-[11px] text-orange-300 flex items-center gap-1.5">
          <Ban className="h-3 w-3 shrink-0" />
          Trading window ({strategyRow.squareoff_time ?? strategyRow.end_time}) passed — cancelling for today.
        </p>
      )}

      {watching && displayChecks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="text-zinc-500">Quick:</span>
          <span className="text-emerald-400 font-medium">{passCount} pass</span>
          <span className="text-red-400 font-medium">{failCount} fail</span>
          {dataSource && <span className="text-zinc-600">· {dataSource}</span>}
        </div>
      )}

      {watching && isPending && !row.last_checked_at && displayChecks.length === 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
          <span>Waiting for first server evaluation… Open Details for live chart &amp; full checklist.</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded">
          {row.exchange}
        </span>
        <span className="text-[9px] bg-zinc-800 text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">
          Paper
        </span>
        {row.action === "BUY" ? (
          <TrendingUp className="h-3 w-3 text-teal-400" />
        ) : (
          <TrendingDown className="h-3 w-3 text-red-400" />
        )}
      </div>

      {/* ── Full-screen detail dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none border-0 bg-zinc-950 flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-zinc-800 shrink-0">
            <DialogTitle className="flex flex-col gap-1 text-left pr-10">
              <span className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-teal-400" />
                {row.symbol}
                <span className="text-zinc-500 font-normal text-sm">
                  · {row.strategy_name ?? "Strategy"}
                </span>
                {timePassed && (
                  <Badge className="text-[10px] border-orange-500/40 bg-orange-500/10 text-orange-300 border ml-1">
                    Window closed for today
                  </Badge>
                )}
              </span>
              <span className="text-xs font-normal text-zinc-500">
                Live chart + real-time condition pass/fail. Hit Scan now to force a fresh check.
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
            {/* ── Left: chart (fills available space) ── */}
            <div className="flex-1 min-h-0 border-b lg:border-b-0 lg:border-r border-zinc-800">
              {yahooSymbol ? (
                <YahooChartPanel symbol={yahooSymbol} displayName={row.symbol} />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-zinc-500">
                  Could not resolve chart symbol.
                </div>
              )}
            </div>

            {/* ── Right: conditions panel ── */}
            <div className="w-full lg:w-[380px] shrink-0 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <span>Conditions</span>
                  {displayChecks.length > 0 && (
                    <>
                      <span className="text-emerald-400">{passCount} ✓</span>
                      <span className="text-red-400">{failCount} ✗</span>
                    </>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] border-teal-500/30"
                  disabled={scanning || !strategyRow}
                  onClick={handleRefreshClick}
                >
                  {scanning
                    ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    : <RefreshCw className="h-3 w-3 mr-1" />}
                  Scan now
                </Button>
              </div>

              {/* Scrollable conditions list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
                {strategyErr && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {strategyErr}
                  </div>
                )}

                {timePassed && (
                  <div className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-orange-200">
                    <Ban className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Strategy trading window has passed ({strategyRow?.squareoff_time ?? strategyRow?.end_time}).
                      This pending order will be auto-cancelled for today.
                    </span>
                  </div>
                )}

                {liveError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {liveError}
                  </div>
                )}

                {serverStatusLines.length > 0 && (
                  <div className="space-y-1 text-[11px] text-zinc-400 border-l-2 border-zinc-600 pl-3">
                    {serverStatusLines.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                )}

                {liveHeadline && serverChecks.length === 0 && (
                  <p className="text-[11px] text-zinc-500 border-l-2 border-zinc-700 pl-3">{liveHeadline}</p>
                )}

                {/* ── Scan results: failing first, then passing ── */}
                {displayChecks.length > 0 ? (
                  <div className="space-y-3">
                    {dataSource && (
                      <p className="text-[10px] text-zinc-600">Source: {dataSource}</p>
                    )}

                    {failing.length > 0 && (
                      <div className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2.5 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/90">
                          ✗ Not matching ({failCount})
                        </p>
                        {failing.map((l, i) => (
                          <div key={`f-${i}`} className="flex items-start gap-2 text-[12px] leading-snug">
                            <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                            <span className="text-zinc-200">{l.label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {passing.length > 0 && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                          ✓ Matching ({passCount})
                        </p>
                        {passing.map((l, i) => (
                          <div key={`p-${i}`} className="flex items-start gap-2 text-[12px] leading-snug">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="text-zinc-200">{l.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── No scan yet: show strategy config conditions ── */
                  !scanning && strategyRow && configConditions.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-[10px] text-zinc-500 italic">
                        Hit Scan now for live pass/fail. Below are this strategy's defined conditions:
                      </p>
                      {configSections.map((section) => (
                        <div key={section} className="rounded-lg border border-zinc-700/40 bg-zinc-900/40 px-3 py-2.5 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            {section}
                          </p>
                          {configConditions
                            .filter((c) => c.section === section)
                            .map((c, i) => (
                              <div key={i} className="flex items-start gap-2 text-[12px] leading-snug">
                                <span className="h-3.5 w-3.5 shrink-0 mt-0.5 text-zinc-500">·</span>
                                <span className="text-zinc-300">{c.label}</span>
                              </div>
                            ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    !scanning && (
                      <p className="text-[11px] text-zinc-500 italic">
                        {strategyRow
                          ? "No conditions defined in strategy config. Hit Scan now to pull live engine results."
                          : "Loading strategy…"}
                      </p>
                    )
                  )
                )}

                {scanning && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Scanning live conditions…
                  </div>
                )}

                {/* Timestamps */}
                {(liveAt || row.last_checked_at) && (
                  <p className="text-[10px] text-zinc-600 pt-1">
                    {liveAt && <>Scan at {new Date(liveAt).toLocaleTimeString()}</>}
                    {liveAt && row.last_checked_at && " · "}
                    {row.last_checked_at && <>Monitor at {new Date(row.last_checked_at).toLocaleTimeString()}</>}
                  </p>
                )}
              </div>

              {/* Cancel footer */}
              <div className="px-4 py-3 border-t border-zinc-800 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={handleCancel}
                  disabled={cancelling}
                >
                  {cancelling
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    : <X className="h-3.5 w-3.5 mr-1.5" />}
                  Cancel this pending strategy entry
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit pending paper sizing</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-qty-${row.id}`}>Quantity</Label>
              <Input
                id={`edit-qty-${row.id}`}
                type="number"
                min={isCrypto ? 0.000001 : 1}
                step={isCrypto ? "0.000001" : 1}
                value={editQuantity}
                onChange={(e) => handleEditQuantityChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-amt-${row.id}`}>Investment amount</Label>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md border border-white/10 bg-black/20 p-0.5 shrink-0">
                  <button
                    type="button"
                    className={`px-2 py-1 text-xs rounded ${editCurrency === "INR" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setEditCurrency("INR")}
                  >
                    ₹ INR
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-1 text-xs rounded ${editCurrency === "USD" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setEditCurrency("USD")}
                  >
                    $ USD
                  </button>
                </div>
                <Input
                  id={`edit-amt-${row.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => handleEditAmountChange(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500">
              Market currency defaults to {assetCurrency}. Price used for estimate:{" "}
              {editPrice != null ? `${assetCurrency === "USD" ? "$" : "₹"}${editPrice.toFixed(4)}` : "unavailable"}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save sizing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
