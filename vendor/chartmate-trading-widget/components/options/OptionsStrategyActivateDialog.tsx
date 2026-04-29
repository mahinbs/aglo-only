/**
 * Shown when a user clicks "Paper Trade" or "Activate Live" on a strategy card.
 * Lets them pick an expiry (pre-fetched from broker on page load) and a specific
 * option symbol from the live chain, plus set the lot size for today's session.
 *
 * mode="paper"  → simulated trades only (is_paper_only = true)
 * mode="live"   → real orders via OpenAlgo (is_paper_only = false)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlaskConical, Loader2, AlertCircle, Link2Off, Zap, TrendingUp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getTradingIntegration,
  isBrokerSessionLive,
  BROKER_SESSION_UPDATED_EVENT,
  dispatchOpenBrokerSync,
} from "@/services/openalgoIntegrationService";
import type { OptionsStrategy } from "@/pages/OptionsStrategyPage";
import {
  fetchExpiryDates,
  fetchLtp,
  fetchOptionSymbolLotSize,
  fetchOptionChain,
  getIstDateKey,
  instrumentTypeForUnderlying,
  lotUnitsForUnderlying,
  pickExpiryForStrategyType,
  tradableRowsFromChain,
  type NormalizedExpiryItem,
  type TradableOptionRow,
} from "@/lib/optionsApi";
import { bffConfigured, bffFetch } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategy: OptionsStrategy | null;
  onActivated: () => void;
  /** "paper" = simulated trades; "live" = real orders. Defaults to "paper". */
  mode?: "paper" | "live";
  /** Expiries pre-fetched by the page; if provided the dialog skips the network call. */
  prefetchedExpiries?: NormalizedExpiryItem[];
}
type FiatCurrency = "INR" | "USD";
const EMPTY_EXPIRIES: NormalizedExpiryItem[] = [];

function convertBetweenInrUsd(
  amount: number,
  from: FiatCurrency,
  to: FiatCurrency,
): number {
  if (!Number.isFinite(amount) || from === to) return amount;
  // INR-only mode in algo-only.
  return amount;
}

export function OptionsStrategyActivateDialog({
  open,
  onOpenChange,
  strategy,
  onActivated,
  mode = "paper",
  prefetchedExpiries,
}: Props) {
  const [expiries, setExpiries] = useState<NormalizedExpiryItem[]>([]);
  const [expiryIso, setExpiryIso] = useState<string>("");
  const [rows, setRows] = useState<TradableOptionRow[]>([]);
  const [symbol, setSymbol] = useState<string>("");
  const [lots, setLots] = useState<number>(1);
  const [loadingExpiries, setLoadingExpiries] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [brokerChecking, setBrokerChecking] = useState(true);
  // Live LTP for selected symbol
  const [ltp, setLtp] = useState<number | null>(null);
  const [ltpLoading, setLtpLoading] = useState(false);
  const ltpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [investmentCurrency, setInvestmentCurrency] = useState<FiatCurrency>("INR");
  const [investmentAmount, setInvestmentAmount] = useState("");

  const isPaper = mode === "paper";
  const stablePrefetchedExpiries = Array.isArray(prefetchedExpiries)
    ? prefetchedExpiries
    : EMPTY_EXPIRIES;

  const lotUnitsDefault = useMemo(
    () => (strategy ? lotUnitsForUnderlying(strategy.underlying) : 75),
    [strategy],
  );
  const [lotUnits, setLotUnits] = useState<number>(lotUnitsDefault);
  const assetCurrency = useMemo<FiatCurrency>(() => "INR", []);

  const reset = useCallback(() => {
    setExpiries([]);
    setExpiryIso("");
    setRows([]);
    setSymbol("");
    setLots(1);
    setError(null);
    setLoadingExpiries(false);
    setLoadingChain(false);
    setLtp(null);
    setLtpLoading(false);
    setInvestmentAmount("");
    setInvestmentCurrency("INR");
    setLotUnits(strategy ? lotUnitsForUnderlying(strategy.underlying) : 75);
    if (ltpTimerRef.current) { clearInterval(ltpTimerRef.current); ltpTimerRef.current = null; }
  }, [strategy]);

  useEffect(() => {
    setLotUnits(lotUnitsDefault);
  }, [lotUnitsDefault]);

  // ── Live LTP polling (every 5 s while dialog open and symbol selected) ──
  useEffect(() => {
    if (ltpTimerRef.current) { clearInterval(ltpTimerRef.current); ltpTimerRef.current = null; }
    if (!open || !symbol || !strategy) { setLtp(null); return; }
    let cancelled = false;
    const poll = async () => {
      if (!cancelled) setLtpLoading(true);
      const price = await fetchLtp(symbol, strategy.exchange);
      if (!cancelled) { setLtp(price); setLtpLoading(false); }
    };
    void poll();
    ltpTimerRef.current = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      if (ltpTimerRef.current) { clearInterval(ltpTimerRef.current); ltpTimerRef.current = null; }
    };
  }, [open, symbol, strategy]);

  const refreshBrokerGate = useCallback(async () => {
    setBrokerChecking(true);
    const { data } = await getTradingIntegration();
    setBrokerConnected(isBrokerSessionLive(data));
    setBrokerChecking(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refreshBrokerGate();
  }, [open, refreshBrokerGate]);

  useEffect(() => {
    if (!open) return;
    const onUpd = () => void refreshBrokerGate();
    window.addEventListener(BROKER_SESSION_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(BROKER_SESSION_UPDATED_EVENT, onUpd);
  }, [open, refreshBrokerGate]);

  // ── Load expiries (use pre-fetched if available) ────────────────────────
  useEffect(() => {
    if (!open || !strategy) {
      reset();
      setLoadingExpiries(false);
      return;
    }

    const rc = strategy.risk_config as Record<string, unknown>;
    setLots(Math.max(1, Number(rc.lot_size ?? 1)));
    setInvestmentCurrency(assetCurrency);

    if (!brokerConnected || brokerChecking) {
      setExpiries([]);
      setExpiryIso("");
      setError(null);
      setLoadingExpiries(false);
      return;
    }

    // Use pre-fetched data immediately — no spinner needed
    if (stablePrefetchedExpiries.length > 0) {
      setExpiries(stablePrefetchedExpiries);
      const pick = pickExpiryForStrategyType(stablePrefetchedExpiries, strategy.expiry_type);
      const initial = pick?.date ?? stablePrefetchedExpiries[0]?.date ?? "";
      setExpiryIso(initial);
      setLoadingExpiries(false);
      return;
    }

    // Fall back to live fetch (happens if pre-fetch wasn't ready yet)
    let cancelled = false;
    (async () => {
      setLoadingExpiries(true);
      setError(null);
      try {
        const data = await fetchExpiryDates({
          symbol: strategy.underlying,
          exchange: strategy.exchange,
          instrument: instrumentTypeForUnderlying(strategy.underlying),
        });
        if (cancelled) return;
        setExpiries(data.expiries);
        const pick = pickExpiryForStrategyType(data.expiries, strategy.expiry_type);
        setExpiryIso(pick?.date ?? data.expiries[0]?.date ?? "");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setExpiries([]);
        }
      } finally {
        if (!cancelled) setLoadingExpiries(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, strategy, reset, brokerConnected, brokerChecking, stablePrefetchedExpiries]);

  useEffect(() => {
    if (ltp == null || !Number.isFinite(ltp) || ltp <= 0) return;
    const amountInAsset = ltp * lots * lotUnits;
    const amountDisplay = convertBetweenInrUsd(
      amountInAsset,
      assetCurrency,
      investmentCurrency,
    );
    setInvestmentAmount(amountDisplay.toFixed(2));
  }, [ltp, lots, lotUnits, investmentCurrency, assetCurrency]);

  const handleInvestmentAmountChange = (raw: string) => {
    setInvestmentAmount(raw);
    const amountDisplay = Number(raw);
    if (!Number.isFinite(amountDisplay) || amountDisplay <= 0 || ltp == null || ltp <= 0) return;
    const amountInAsset = convertBetweenInrUsd(
      amountDisplay,
      investmentCurrency,
      assetCurrency,
    );
    const perLotNotional = ltp * lotUnits;
    if (!Number.isFinite(perLotNotional) || perLotNotional <= 0) return;
    const nextLots = Math.max(1, Math.floor(amountInAsset / perLotNotional));
    setLots(nextLots);
  };

  // ── Load option chain when expiry is chosen ─────────────────────────────
  useEffect(() => {
    if (!open || !strategy || !expiryIso) { setRows([]); setSymbol(""); return; }
    let cancelled = false;
    (async () => {
      setLoadingChain(true);
      setError(null);
      try {
        const chain = await fetchOptionChain({
          underlying: strategy.underlying,
          exchange: strategy.exchange,
          expiry_date: expiryIso,
        });
        if (cancelled) return;
        // Show all CE + PE strikes — user explicitly picks the symbol at activation time
        const list = tradableRowsFromChain(chain);
        setRows(list);
        const rc = strategy.risk_config as Record<string, unknown>;
        const pinned = typeof rc.explicit_options_symbol === "string" ? rc.explicit_options_symbol.trim() : "";
        if (pinned && list.some((r) => r.symbol === pinned)) setSymbol(pinned);
        else setSymbol(list[0]?.symbol ?? "");
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setSymbol("");
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingChain(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, strategy, expiryIso]);

  // Resolve contract lot size from selected symbol metadata.
  useEffect(() => {
    if (!open || !strategy) return;
    if (!symbol) {
      setLotUnits(lotUnitsDefault);
      return;
    }
    let cancelled = false;
    (async () => {
      const resolved = await fetchOptionSymbolLotSize(symbol, strategy.exchange);
      if (!cancelled && resolved && resolved > 0) {
        setLotUnits(resolved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, symbol, strategy, lotUnitsDefault]);

  useEffect(() => {
    if (!rows.length) { setSymbol(""); return; }
    setSymbol((prev) => (prev && rows.some((r) => r.symbol === prev) ? prev : rows[0].symbol));
  }, [rows]);

  const validSymbol = Boolean(symbol && rows.some((r) => r.symbol === symbol));

  const handleConfirm = async () => {
    if (!strategy?.id || !validSymbol) return;
    setSaving(true);
    try {
      if (!isPaper) {
        if (!bffConfigured()) {
          toast.error(
            "Cannot verify balance for live options activation (BFF not configured).",
          );
          return;
        }
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          toast.error("Not signed in. Please sign in again.");
          return;
        }
        const qtyUnits = Math.max(1, Math.floor(Number(lots) * Number(lotUnits)));
        const ex = String(strategy.exchange || "NFO").trim().toUpperCase() || "NFO";
        const pf = await bffFetch<{
          can_execute: boolean;
          reason?: string | null;
          available_cash?: number | null;
          required_notional?: number | null;
        }>(
          `/api/account/preflight?strategy_id=${encodeURIComponent(String(strategy.id))}&symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(ex)}&quantity=${encodeURIComponent(String(qtyUnits))}&product=MIS`,
          token,
        );
        if (!pf.can_execute) {
          toast.error(
            pf.reason ?? "Preflight blocked options activation.",
          );
          return;
        }
        if (
          Number.isFinite(Number(pf.available_cash)) &&
          Number.isFinite(Number(pf.required_notional)) &&
          Number(pf.available_cash) < Number(pf.required_notional)
        ) {
          toast.error(
            `Insufficient funds: ₹${Number(pf.available_cash).toLocaleString("en-IN", { maximumFractionDigits: 2 })} available, but ~₹${Number(pf.required_notional).toLocaleString("en-IN", { maximumFractionDigits: 2 })} required for ${symbol}.`,
          );
          return;
        }
      }
      const sessionDate = getIstDateKey();
      const prev = (strategy.strategy_state || {}) as Record<string, unknown>;
      const rc = { ...(strategy.risk_config as Record<string, unknown>), lot_size: lots };
      const { error: upErr } = await (supabase as any)
        .from("options_strategies")
        .update({
          is_active: true,
          is_paper_only: isPaper,
          lifecycle_state: "ACTIVE",
          lifecycle_updated_at: new Date().toISOString(),
          risk_config: rc,
          strategy_state: {
            ...prev,
            deployment: {
              session_date: sessionDate,
              mode: isPaper ? "paper" : "live",
              options_symbol: symbol,
              lots,
              exchange: strategy.exchange,
              expiry_iso: expiryIso,
              lot_units: lotUnits,
            },
          },
        })
        .eq("id", strategy.id);
      if (upErr) throw upErr;
      toast.success(
        isPaper
          ? `Paper trade started for ${strategy.underlying} — ${symbol}.`
          : `Strategy activated for live trading — ${symbol}.`,
      );
      onOpenChange(false);
      onActivated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!strategy) return null;

  const isApiKeyErr = !!error && (
    error.toLowerCase().includes("api key") ||
    error.toLowerCase().includes("no active broker") ||
    error.toLowerCase().includes("403") ||
    error.toLowerCase().includes("422")
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPaper ? (
              <><FlaskConical className="h-4 w-4 text-blue-400" />Paper trade — {strategy.underlying}</>
            ) : (
              <><Zap className="h-4 w-4 text-sky-400" />Activate live — {strategy.underlying}</>
            )}
          </DialogTitle>
          <DialogDescription className="flex flex-col gap-1 mt-1">
            <span>
              {isPaper
                ? "Choose an option symbol for today's paper (simulated) trade."
                : "Choose an option symbol for live trading today via your broker."}
            </span>
            <span className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={isPaper ? "border-blue-500/40 text-blue-400 text-[10px]" : "border-sky-500/40 text-sky-400 text-[10px]"}
              >
                {isPaper ? "Paper · Simulated" : "Live · Real orders"}
              </Badge>
              <span className="text-[11px]">{strategy.exchange} · expiry: {strategy.expiry_type}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Broker check */}
          {brokerChecking && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Checking broker connection…
            </div>
          )}

          {!brokerChecking && !brokerConnected && (
            <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100">
              <Link2Off className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle>Broker connection required</AlertTitle>
              <AlertDescription className="text-xs space-y-2 mt-1">
                <p>Connect your broker to load today&apos;s option chain.</p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2 bg-orange-500 hover:bg-orange-400 text-white font-semibold"
                  onClick={() => dispatchOpenBrokerSync()}
                >
                  Connect broker
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Error display */}
          {error && (
            <Alert className={isApiKeyErr ? "border-amber-500/50 bg-amber-500/10" : "border-destructive/50 bg-destructive/10"}>
              <AlertCircle className={`h-4 w-4 ${isApiKeyErr ? "text-amber-400" : "text-destructive"}`} />
              <AlertTitle className={`text-xs font-semibold ${isApiKeyErr ? "text-amber-300" : "text-destructive"}`}>
                {isApiKeyErr ? "OpenAlgo API key missing" : "Failed to load options"}
              </AlertTitle>
              <AlertDescription className="text-xs mt-0.5 space-y-1.5">
                {isApiKeyErr ? (
                  <>
                    <p className="text-amber-200/80">
                      Your OpenAlgo API key is not set. Go to <strong>Trading Dashboard → Broker Sync</strong> and paste your OpenAlgo API key (one-time setup).
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                      onClick={() => dispatchOpenBrokerSync()}
                    >
                      Go to Broker Sync
                    </Button>
                  </>
                ) : (
                  <p className="text-muted-foreground">{error}</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Expiry selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Expiry</Label>
              {loadingExpiries && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Fetching expiries from broker…
                </span>
              )}
            </div>
            {loadingExpiries ? (
              <div className="h-9 rounded-md border border-input bg-muted/30 flex items-center px-3 text-sm text-muted-foreground">
                Loading available expiry dates…
              </div>
            ) : (
              <Select
                value={expiryIso}
                onValueChange={setExpiryIso}
                disabled={!brokerConnected || brokerChecking || !expiries.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={expiries.length ? "Select expiry" : "No expiries available"} />
                </SelectTrigger>
                <SelectContent>
                  {expiries.map((e) => (
                    <SelectItem key={e.date} value={e.date}>
                      {e.display} · {e.tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Symbol selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Option symbol</Label>
              {loadingChain && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading chain…
                </span>
              )}
            </div>
            <Select
              value={symbol}
              onValueChange={setSymbol}
              disabled={!brokerConnected || brokerChecking || loadingChain || !expiryIso}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  !expiryIso ? "Select expiry first" :
                  loadingChain ? "Loading option chain…" :
                  rows.length === 0 ? "No symbols available" :
                  "Select symbol"
                } />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {rows.map((r) => (
                  <SelectItem key={r.symbol} value={r.symbol}>
                    {r.symbol} · {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Live price + lot breakdown — shown once a symbol is picked */}
          {symbol && (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  Current premium
                </span>
                {ltpLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex items-end gap-3">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-sky-400" />
                  <span className="text-xl font-bold tabular-nums">
                    {ltp != null ? `${assetCurrency === "USD" ? "$" : "₹"}${ltp.toFixed(2)}` : "—"}
                  </span>
                  {ltp == null && !ltpLoading && (
                    <span className="text-[10px] text-muted-foreground">(LTP unavailable)</span>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground pb-0.5">per unit</span>
              </div>
              <div className="h-px bg-border/50 my-1" />
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">
                  {lots} lot{lots !== 1 ? "s" : ""} × {lotUnits} units
                </span>
                <span className="font-semibold">= {lots * lotUnits} units total</span>
              </div>
              {ltp != null && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Est. premium cost</span>
                  <span className="font-semibold text-sky-400">
                    ≈ {investmentCurrency === "USD" ? "$" : "₹"}
                    {Number(investmentAmount || "0").toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">Investment amount</Label>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-white/10 bg-black/20 p-0.5 shrink-0">
                <span className="px-2 py-1 text-xs rounded bg-sky-500/20 text-sky-300">₹ INR</span>
              </div>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={investmentAmount}
                disabled={!brokerConnected || brokerChecking}
                onChange={(e) => handleInvestmentAmountChange(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              INR only.
            </p>
          </div>

          {/* Lots */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Lots</Label>
              <span className="text-[11px] text-muted-foreground">
                1 lot = {lotUnits} units ({strategy.underlying})
              </span>
            </div>
            <Input
              type="number"
              min={1}
              max={50}
              value={lots}
              disabled={!brokerConnected || brokerChecking}
              onChange={(e) => setLots(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={saving || !brokerConnected || brokerChecking || !validSymbol || loadingChain || loadingExpiries}
            className={isPaper ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-sky-600 hover:bg-sky-500 text-white"}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {isPaper ? (
              <><FlaskConical className="h-3.5 w-3.5 mr-1" />Start Paper Trade</>
            ) : (
              <><Zap className="h-3.5 w-3.5 mr-1" />Activate Live</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
