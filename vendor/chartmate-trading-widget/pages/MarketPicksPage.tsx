import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus, Clock, BrainCircuit, AlertTriangle, Activity, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { tradeTrackingService, ActiveTrade } from "@/services/tradeTrackingService";
import { useAdmin } from "@/hooks/useAdmin";

interface BoardRow {
  id: string;
  symbol: string;
  display_name: string | null;
  probability_score: number | null;
  action_signal: "BUY" | "SELL" | "HOLD" | null;
  expires_at: string;
  generated_for_date: string;
  generated_at?: string;
  prediction_payload: any;
}

function ActionIcon({ action }: { action: string | null }) {
  if (action === "BUY") return <TrendingUp className="h-5 w-5 text-green-500" />;
  if (action === "SELL") return <TrendingDown className="h-5 w-5 text-red-500" />;
  return <Minus className="h-5 w-5 text-yellow-500" />;
}

function actionColor(action: string | null) {
  if (action === "BUY") return "bg-green-500/15 text-green-700 border-green-500/40";
  if (action === "SELL") return "bg-red-500/15 text-red-700 border-red-500/40";
  return "bg-yellow-500/15 text-yellow-700 border-yellow-500/40";
}

function probColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-500";
}

function actionLabel(action: string | null) {
  if (action === "BUY") return "BUY setup";
  if (action === "SELL") return "SELL setup";
  // For HOLD / null: clearly say this is a wait/no-trade zone
  return "NO TRADE zone";
}

function certaintyLabel(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 75) return "High conviction setup based on current data.";
  if (score >= 55) return "Balanced setup — conviction is moderate, manage risk carefully.";
  return "Speculative idea — conviction is low, treat as high-risk only.";
}

function humanizeToken(token: string): string {
  const map: Record<string, string> = {
    quantum_ensemble: "multi-model ensemble agreement",
    market_regime_awareness: "market regime analysis",
    rsi_signal: "RSI momentum signal",
    macd_signal: "MACD crossover",
    volume_confirmation: "volume confirmation",
    sma_crossover: "moving average crossover",
    bollinger_squeeze: "Bollinger Band squeeze",
    trend_following: "trend-following indicators",
    mean_reversion: "mean-reversion signal",
    market_volatility: "elevated market volatility",
    regime_change: "possible market regime change",
  };
  return map[token] ?? token.replace(/_/g, " ");
}

function expiryLabel(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { label: "Expired", stale: true };
  const h = Math.floor(diff / 3_600_000);
  const m = Math.ceil((diff % 3_600_000) / 60_000);
  return { label: h > 0 ? `${h}h ${m}m` : `${m}m`, stale: false };
}

function PredictionCard({
  row, liveStats, isAdmin, onDelete, onRepredict, deleting, repredicting,
}: {
  row: BoardRow;
  liveStats: Record<string, { active: number; pnl: number }>;
  isAdmin: boolean;
  onDelete: (id: string) => void;
  onRepredict: (row: BoardRow) => void;
  deleting: boolean;
  repredicting: boolean;
}) {
  const gf = row.prediction_payload?.geminiForecast;
  const action = row.action_signal;
  const prob = row.probability_score;
  const rationale = row.prediction_payload?.rationale || gf?.positioning_guidance?.notes;
  const keyDrivers: string[] = gf?.forecasts?.[0]?.key_drivers || [];
  const riskFlags: string[] = gf?.forecasts?.[0]?.risk_flags || [];
  const marketContext = gf?.market_context;
  const holdPeriod = gf?.positioning_guidance?.recommended_hold_period;
  const expectedRoi = gf?.expected_roi;
  const currentPrice = row.prediction_payload?.currentPrice;
  const changePercent = row.prediction_payload?.changePercent;
  const { label: expLabel, stale } = expiryLabel(row.expires_at);
  const live = liveStats[(row.symbol || "").toUpperCase()];

  return (
    <Card className={`border-2 transition-all ${action === "BUY" ? "border-green-500/30" : action === "SELL" ? "border-red-500/30" : "border-yellow-500/30"}`}>
      {/* Top bar */}
      <div className={`h-1 rounded-t-lg ${action === "BUY" ? "bg-green-500" : action === "SELL" ? "bg-red-500" : "bg-yellow-500"}`} />

      <CardHeader className="pb-3">
        <div className="flex items-start flex-col-reverse justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-bold">{row.display_name || row.symbol}</CardTitle>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {currentPrice != null && (
                <span className="text-sm font-mono text-muted-foreground">
                  ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </span>
              )}
              {changePercent != null && (
                <Badge variant="outline" className={`text-xs ${changePercent >= 0 ? "text-green-600 border-green-500/40" : "text-red-500 border-red-500/40"}`}>
                  {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* Action signal */}
            <Badge className={`text-base px-3 py-1 border font-bold ${actionColor(action)}`}>
              <ActionIcon action={action} />
              <span className="ml-1">{actionLabel(action)}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* Probability bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Probability of prediction being achieved</span>
            <span className={`font-bold text-base ${probColor(prob)}`}>{prob != null ? `${prob}%` : "-"}</span>
          </div>
          <Progress
            value={prob ?? 0}
            className={`h-2.5 ${(prob ?? 0) >= 70 ? "[&>div]:bg-green-500" : (prob ?? 0) >= 50 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"}`}
          />
          {certaintyLabel(prob) && (
            <p className="text-[11px] text-muted-foreground mt-1">
              {certaintyLabel(prob)}
            </p>
          )}
        </div>

        {/* Expected ROI */}
        {expectedRoi && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded bg-green-500/10 border border-green-500/20">
              <p className="text-muted-foreground">Best case</p>
              <p className="font-bold text-green-600">+{expectedRoi.best_case?.toFixed(1)}%</p>
            </div>
            <div className="p-2 rounded bg-primary/10 border border-primary/20">
              <p className="text-muted-foreground">Likely</p>
              <p className="font-bold text-blue-600">+{expectedRoi.likely_case?.toFixed(1)}%</p>
            </div>
            <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
              <p className="text-muted-foreground">Worst case</p>
              <p className="font-bold text-red-600">{expectedRoi.worst_case?.toFixed(1)}%</p>
            </div>
          </div>
        )}

        {/* What was predicted — rationale */}
        {rationale && (
          <div className="p-3 rounded-lg bg-muted/40 border">
            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <BrainCircuit className="h-3.5 w-3.5" /> AI Prediction Rationale
            </p>
            <p className="text-sm leading-relaxed">{rationale}</p>
          </div>
        )}

        {/* Current market conditions */}
        {marketContext && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Activity className="h-3.5 w-3.5" /> Current Market Conditions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {marketContext.regime && (
                <Badge variant="outline" className="text-xs capitalize">{marketContext.regime}</Badge>
              )}
              {marketContext.sentiment && (
                <Badge variant="outline" className={`text-xs capitalize ${marketContext.sentiment === "bullish" ? "border-green-500 text-green-700" : marketContext.sentiment === "bearish" ? "border-red-500 text-red-500" : ""}`}>
                  {marketContext.sentiment} sentiment
                </Badge>
              )}
              {marketContext.volatility && (
                <Badge variant="outline" className="text-xs capitalize">{marketContext.volatility} volatility</Badge>
              )}
            </div>
            {marketContext.summary && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{marketContext.summary}</p>
            )}
          </div>
        )}

        {/* Key drivers */}
        {keyDrivers.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Key Drivers</p>
            <ul className="space-y-0.5">
              {keyDrivers.slice(0, 3).map((d, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                  <span className="text-green-500 mt-0.5">•</span> {humanizeToken(d)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk flags */}
        {riskFlags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {riskFlags.slice(0, 3).map((f, i) => (
              <Badge key={i} variant="outline" className="text-xs border-orange-400 text-orange-600">
                ⚠ {humanizeToken(f)}
              </Badge>
            ))}
          </div>
        )}

        {/* Footer row */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {stale ? (
              <span className="text-amber-600 font-medium">Expired — refreshing…</span>
            ) : (
              <span>Expires in <strong>{expLabel}</strong></span>
            )}
          </div>
          {holdPeriod && <span>Hold: <strong>{holdPeriod}</strong></span>}
          {live && live.active > 0 && (
            <span className={live.pnl >= 0 ? "text-green-600" : "text-red-500"}>
              {live.active} live trade{live.active > 1 ? "s" : ""} ({live.pnl >= 0 ? "+" : ""}{live.pnl.toFixed(2)})
            </span>
          )}
        </div>

        {/* Admin controls */}
        {isAdmin && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs border-primary/40 text-blue-600 hover:bg-primary/10"
              onClick={() => onRepredict(row)}
              disabled={repredicting}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${repredicting ? "animate-spin" : ""}`} />
              {repredicting ? "Re-predicting…" : "Re-predict"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs border-red-500/40 text-red-600 hover:bg-red-500/10"
              onClick={() => onDelete(row.id)}
              disabled={deleting}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MarketPicksPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [liveStats, setLiveStats] = useState<Record<string, { active: number; pnl: number }>>({});
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [repredictingId, setRepredictingId] = useState<string | null>(null);

  const loadBoard = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase.functions.invoke("public-daily-board", {
        method: "GET",
      });
      if (error) throw error;
      const boardRows = data?.rows || [];
      setRows(boardRows);
      setDate(data?.date || "");
      const latest = boardRows.length
        ? boardRows.reduce((a: BoardRow, b: BoardRow) =>
            (b.generated_at && (!a.generated_at || b.generated_at > a.generated_at)) ? b : a
          )
        : null;
      setLastUpdated(latest?.generated_at ?? null);
    } catch (error: any) {
      console.error("Failed to load market picks:", error);
      if (!silent) toast.error(error?.message || "Failed to load market picks");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadLiveStats = useCallback(async () => {
    try {
      const { data } = await tradeTrackingService.getActiveTrades();
      if (!data) { setLiveStats({}); return; }
      const map: Record<string, { active: number; pnl: number }> = {};
      (data as ActiveTrade[]).forEach((t) => {
        const key = (t.symbol || "").toUpperCase();
        if (!key) return;
        if (!map[key]) map[key] = { active: 0, pnl: 0 };
        map[key].active += 1;
        map[key].pnl += t.currentPnl ?? 0;
      });
      setLiveStats(map);
    } catch (e) {
      console.error("Failed to load live stats:", e);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this prediction from the daily board?")) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.functions.invoke("admin-daily-board", {
        body: { action: "delete", id },
      });
      if (error) throw error;
      toast.success("Prediction deleted");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handleRepredict = useCallback(async (row: BoardRow) => {
    setRepredictingId(row.id);
    try {
      const tf = (row as any).timeframe || "1d";
      const inv = (row as any).investment || 10000;

      // Step 1: call predict-movement directly from the browser (avoids edge→edge timeout)
      const { data: predData, error: predError } = await supabase.functions.invoke("predict-movement", {
        body: {
          symbol: row.symbol,
          investment: inv,
          timeframe: tf,
          focusTimeframe: tf,
          horizons: [60, 240, 1440, 10080],
          riskTolerance: "medium",
          tradingStyle: "swing_trading",
          investmentGoal: "growth",
          stopLossPercentage: 5,
          targetProfitPercentage: 15,
          leverage: 1,
          marginType: "cash",
        },
      });
      if (predError) throw new Error(predError.message || "Prediction failed");

      // Step 2: slim the payload and publish via admin-daily-board
      const gf = predData?.geminiForecast;
      const slimPayload = {
        symbol: predData?.symbol,
        currentPrice: predData?.currentPrice,
        change: predData?.change,
        changePercent: predData?.changePercent,
        rationale: predData?.rationale,
        patterns: predData?.patterns,
        opportunities: predData?.opportunities,
        geminiForecast: gf
          ? {
              action_signal: gf.action_signal,
              forecasts: gf.forecasts?.slice(0, 4),
              support_resistance: gf.support_resistance,
              positioning_guidance: gf.positioning_guidance,
              expected_roi: gf.expected_roi,
              risk_grade: gf.risk_grade,
              deep_analysis: gf.deep_analysis,
              market_context: gf.market_context,
            }
          : undefined,
      };

      const { error: storeError } = await supabase.functions.invoke("admin-daily-board", {
        body: {
          action: "publish",
          symbol: row.symbol,
          display_name: row.display_name,
          timeframe: tf,
          investment: inv,
          date: row.generated_for_date,
          prediction_payload: slimPayload,
        },
      });
      if (storeError) throw new Error(storeError.message || "Failed to store re-prediction");

      toast.success(`Re-prediction for ${row.display_name || row.symbol} complete — refreshing…`);
      await loadBoard();
    } catch (err: any) {
      toast.error(err?.message || "Re-predict failed");
    } finally {
      setRepredictingId(null);
    }
  }, [loadBoard]);

  // Auto-refresh every 30s always; also trigger re-predict for expired rows when admin
  useEffect(() => {
    loadBoard();
    loadLiveStats();
    const boardInterval = setInterval(() => loadBoard(true), 30_000);
    const statsInterval = setInterval(loadLiveStats, 30_000);
    const subscription = tradeTrackingService.subscribeToTrades(() => loadLiveStats());
    return () => {
      clearInterval(boardInterval);
      clearInterval(statsInterval);
      subscription.unsubscribe();
    };
  }, [loadBoard, loadLiveStats]);

  // When admin and predictions expire, auto-trigger re-predict for each expired row
  useEffect(() => {
    if (!isAdmin || !rows.length) return;
    const expiredRows = rows.filter((r) => new Date(r.expires_at).getTime() < Date.now());
    if (!expiredRows.length) return;
    const timeout = setTimeout(() => {
      expiredRows.forEach((r) => handleRepredict(r));
    }, 3_000);
    return () => clearTimeout(timeout);
  // Only fire once when rows become stale; don't re-run while repredicting
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, rows.map((r) => r.id + r.expires_at).join(",")]);

  const { nextRefreshLabel, isStale } = useMemo(() => {
    if (!rows.length) return { nextRefreshLabel: "-", isStale: false };
    const soonest = rows.map((r) => new Date(r.expires_at).getTime()).sort((a, b) => a - b)[0];
    const diffMs = soonest - Date.now();
    return {
      nextRefreshLabel: diffMs <= 0 ? "Auto-refreshing…" : `${Math.ceil(diffMs / 60_000)} min`,
      isStale: diffMs <= 0,
    };
  }, [rows]);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Home
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Daily Analysis</h1>
              <p className="text-sm text-muted-foreground">Admin-run AI market predictions — visible to all users</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {isStale && (
              <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" /> Some predictions expired
              </Badge>
            )}
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => loadBoard()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">

        {/* Stale warning */}
        {isStale && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700">
              {isAdmin
                ? "Some predictions have expired — automatically re-running analysis now. This page refreshes every 30 seconds."
                : "Some predictions have expired and are being refreshed automatically. Check back in a moment."}
            </AlertDescription>
          </Alert>
        )}

        {/* Meta bar */}
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground">
              Date: <strong className="text-foreground">{date || "-"}</strong>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground">
              {rows.length} prediction{rows.length > 1 ? "s" : ""}
            </div>
            <div className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground">
              Next expiry: <strong className="text-foreground">{nextRefreshLabel}</strong>
            </div>
          </div>
        )}

        {/* Cards grid */}
        {loading && !rows.length ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading daily predictions…
          </div>
        ) : rows.length === 0 ? (
          <Card className="py-16">
            <CardContent className="text-center space-y-3">
              <BrainCircuit className="h-12 w-12 text-muted-foreground mx-auto" />
              <CardTitle className="text-muted-foreground">No daily predictions yet</CardTitle>
              <p className="text-sm text-muted-foreground">
                The admin hasn't published any predictions for today. Check back soon.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <PredictionCard
                key={row.id}
                row={row}
                liveStats={liveStats}
                isAdmin={isAdmin}
                onDelete={handleDelete}
                onRepredict={handleRepredict}
                deleting={deletingId === row.id}
                repredicting={repredictingId === row.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
