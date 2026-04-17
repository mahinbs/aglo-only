import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, BrainCircuit, Loader2, Upload, BarChart3, Search, TrendingUp, Shield, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SymbolSearch } from "@/components/SymbolSearch";
import type { SymbolData } from "@/components/SymbolSearch";

// Same result components as PredictPage — full in-depth display
import { AIReasoningDisplay } from "@/components/prediction/AIReasoningDisplay";
import { DecisionScreen } from "@/components/prediction/DecisionScreen";
import { ForecastTable } from "@/components/prediction/ForecastTable";
import { KeyLevels } from "@/components/prediction/KeyLevels";
import { Insights } from "@/components/prediction/Insights";
import { CapitalScenarios } from "@/components/prediction/CapitalScenarios";

interface BoardRow {
  id: string;
  symbol: string;
  display_name: string | null;
  probability_score: number | null;
  action_signal: "BUY" | "SELL" | "HOLD" | null;
  expires_at: string;
  generated_for_date: string;
  refresh_reason: string;
  timeframe: string;
  investment: number;
}

const TIMEFRAMES = ["15m", "30m", "1h", "4h", "1d", "1w"];

const PIPELINE_STEPS = [
  { icon: Search,     label: "Fetching Market Data",       desc: "Real-time price, volume, change data" },
  { icon: BarChart3,  label: "Historical Analysis",         desc: "Full-year candles, fundamentals, earnings" },
  { icon: TrendingUp, label: "Technical Indicators",        desc: "RSI, MACD, Bollinger Bands, regime detection" },
  { icon: TrendingUp, label: "News & Sentiment",            desc: "Market news, macro events, sector correlation" },
  { icon: BrainCircuit, label: "AI Model Processing",       desc: "Multi-horizon forecasts, positioning guidance" },
  { icon: Shield,     label: "Risk Assessment",             desc: "Risk grade, stop-loss, take-profit targets" },
  { icon: Sparkles,   label: "Compiling Full Report",       desc: "ROI scenarios, key levels, insights" },
];

// Default profile matching a normal user analysis — ensures same AI prompt and pipeline
const DEFAULT_PROFILE = {
  riskTolerance: "medium" as const,
  tradingStyle: "swing_trading" as const,
  investmentGoal: "growth" as const,
  stopLossPercentage: 5,
  targetProfitPercentage: 15,
  leverage: 1,
  marginType: "cash" as const,
};

export default function AdminPredictionsPage() {
  const [boardRows, setBoardRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [symbol, setSymbol] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolData | null>(null);
  const [investment, setInvestment] = useState("10000");
  const [timeframe, setTimeframe] = useState("1d");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analysedAt, setAnalysedAt] = useState<Date | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [repredictingId, setRepredictingId] = useState<string | null>(null);

  const loadBoard = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const { data, error } = await supabase.functions.invoke("admin-daily-board", { method: "GET" });
      if (error) throw error;
      setBoardRows(data?.rows || []);
    } catch (error: any) {
      if (!silent) toast.error(error?.message || "Failed to load board");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this prediction from the daily board?")) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.functions.invoke("admin-daily-board", {
        body: { action: "delete", id },
      });
      if (error) throw error;
      toast.success("Prediction deleted");
      setBoardRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      toast.error(err?.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const repredictRow = async (row: BoardRow) => {
    setRepredictingId(row.id);
    try {
      const tf = row.timeframe || "1d";
      const inv = row.investment || 10000;

      // Step 1: call predict-movement from the browser (avoids edge→edge chain)
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

      // Step 2: slim and store via publish
      const gf = predData?.geminiForecast;
      const slimPayload = {
        symbol: predData?.symbol,
        currentPrice: predData?.currentPrice,
        change: predData?.change,
        changePercent: predData?.changePercent,
        rationale: predData?.rationale,
        patterns: predData?.patterns,
        opportunities: predData?.opportunities,
        geminiForecast: gf ? {
          action_signal: gf.action_signal,
          forecasts: gf.forecasts?.slice(0, 4),
          support_resistance: gf.support_resistance,
          positioning_guidance: gf.positioning_guidance,
          expected_roi: gf.expected_roi,
          risk_grade: gf.risk_grade,
          deep_analysis: gf.deep_analysis,
          market_context: gf.market_context,
        } : undefined,
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

      toast.success(`Re-prediction for ${row.display_name || row.symbol} complete`);
      await loadBoard(true);
    } catch (err: any) {
      toast.error(err?.message || "Re-predict failed");
    } finally {
      setRepredictingId(null);
    }
  };

  useEffect(() => {
    loadBoard();
    // Poll every 30s and auto-refresh expired rows
    const interval = setInterval(async () => {
      await loadBoard(true);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh expired rows when admin is on this page
  useEffect(() => {
    const expiredRows = boardRows.filter((r) => new Date(r.expires_at).getTime() < Date.now());
    if (!expiredRows.length || repredictingId) return;
    const timeout = setTimeout(() => {
      expiredRows.forEach((r) => repredictRow(r));
    }, 2_000);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardRows.map((r) => r.id + r.expires_at).join(",")]);

  const runAnalysis = async () => {
    const rawSymbol = selectedSymbol?.full_symbol || symbol;
    if (!rawSymbol?.trim()) { toast.error("Pick a symbol first"); return; }
    if (!investment || Number(investment) <= 0) { toast.error("Enter a valid investment amount"); return; }

    setAnalyzing(true);
    setAnalyzeStep(0);
    setAnalysisResult(null);
    setAnalysedAt(null);

    // Animate through pipeline steps to match user experience
    const stepInterval = setInterval(() => {
      setAnalyzeStep(prev => (prev < PIPELINE_STEPS.length - 1 ? prev + 1 : prev));
    }, 3500);

    try {
      const apiSymbol = rawSymbol.includes(":") ? rawSymbol.split(":")[1] : rawSymbol;
      // Identical request to PredictPage.handlePredict — same pipeline, same prompt, same user context
      const { data, error } = await supabase.functions.invoke("predict-movement", {
        body: {
          symbol: apiSymbol,
          investment: Number(investment),
          timeframe,
          focusTimeframe: timeframe,
          horizons: [60, 240, 1440, 10080],
          ...DEFAULT_PROFILE,
        },
      });
      if (error) throw error;
      setAnalysisResult(data);
      setAnalysedAt(new Date());
      setAnalyzeStep(PIPELINE_STEPS.length - 1);
      toast.success("Full AI analysis complete — review then publish to Daily Board");
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast.error(error?.message || "Analysis failed");
    } finally {
      clearInterval(stepInterval);
      setAnalyzing(false);
    }
  };

  const publishToBoard = async () => {
    if (!analysisResult) return;
    const rawSymbol = selectedSymbol?.full_symbol || symbol;
    const apiSymbol = rawSymbol?.includes(":") ? rawSymbol.split(":")[1] : rawSymbol;
    const displayName = selectedSymbol?.symbol || selectedSymbol?.description || apiSymbol || symbol;
    setPublishing(true);
    try {
      // Send only what the daily board needs — strip historical candles & large arrays
      // to stay well within the edge function request body size limit.
      const gf = analysisResult?.geminiForecast;
      const slimPayload = {
        symbol: analysisResult?.symbol,
        currentPrice: analysisResult?.currentPrice,
        change: analysisResult?.change,
        changePercent: analysisResult?.changePercent,
        rationale: analysisResult?.rationale,
        patterns: analysisResult?.patterns,
        opportunities: analysisResult?.opportunities,
        geminiForecast: gf ? {
          action_signal: gf.action_signal,
          forecasts: gf.forecasts?.slice(0, 4),          // primary horizons only
          support_resistance: gf.support_resistance,
          positioning_guidance: gf.positioning_guidance,
          expected_roi: gf.expected_roi,
          risk_grade: gf.risk_grade,
          deep_analysis: gf.deep_analysis,
          market_context: gf.market_context,
        } : undefined,
      };
      const { error } = await supabase.functions.invoke("admin-daily-board", {
        method: "POST",
        body: {
          action: "publish",
          symbol: apiSymbol,
          display_name: displayName,
          timeframe,
          investment: Number(investment),
          prediction_payload: slimPayload,
        },
      });
      if (error) throw error;
      toast.success("Published to Daily Board — visible to all users on Daily Analysis page");
      setAnalysisResult(null);
      setAnalysedAt(null);
      await loadBoard();
    } catch (error: any) {
      toast.error(error?.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  const gf = analysisResult?.geminiForecast;
  const action: "BUY" | "SELL" | "HOLD" = gf?.action_signal?.action || "HOLD";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => loadBoard()} disabled={loading} className="w-full md:w-auto border-white/10 hover:bg-white/5">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Reload board
        </Button>
      </div>

      {/* ── Run analysis form ─────────────────────────────────────── */}
      <Card className="glass-panel border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <BrainCircuit className="h-5 w-5 text-primary" />
            Run real market analysis (same as users)
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Same AI pipeline and prompt that normal users get. Review the full analysis below, then publish to the Daily Board so all users see it on the Daily Analysis page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>Symbol</Label>
              <SymbolSearch
                value={symbol}
                onValueChange={setSymbol}
                onSelectSymbol={setSelectedSymbol}
                placeholder="Search stocks, crypto, forex (e.g. AAPL, RELIANCE.NS, BTC-USD)"
              />
            </div>
            <div>
              <Label>Investment (USD)</Label>
              <Input
                type="number"
                placeholder="10000"
                value={investment}
                onChange={(e) => setInvestment(e.target.value)}
                className="bg-zinc-950/50 border-white/10"
              />
            </div>
            <div>
              <Label>Timeframe</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {TIMEFRAMES.map((tf) => (
                  <Button
                    key={tf}
                    variant={timeframe === tf ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTimeframe(tf)}
                    className={timeframe !== tf ? "border-white/10 hover:bg-white/5" : ""}
                  >
                    {tf}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Button
            onClick={runAnalysis}
            disabled={analyzing || !(selectedSymbol?.full_symbol || symbol?.trim())}
            size="lg"
            className="w-full md:w-auto shadow-[0_0_20px_rgba(20,184,166,0.2)]"
          >
            {analyzing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Running full AI analysis…</>
            ) : (
              <><BrainCircuit className="mr-2 h-4 w-4" />Run AI analysis</>
            )}
          </Button>

          {/* Pipeline progress — same steps as the user's AdvancedPredictLoader */}
          {analyzing && (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2 text-white">
                <BrainCircuit className="h-4 w-4 animate-pulse text-primary" />
                Running full in-depth AI analysis for <span className="text-primary">{selectedSymbol?.symbol || symbol}</span>…
              </p>
              <div className="space-y-2">
                {PIPELINE_STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const done = i < analyzeStep;
                  const active = i === analyzeStep;
                  return (
                    <div key={i} className={`flex items-center gap-3 text-sm transition-opacity ${i > analyzeStep + 1 ? "opacity-30" : "opacity-100"}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-green-500" : active ? "bg-primary animate-pulse" : "bg-muted border border-white/10"}`}>
                        {done ? <span className="text-white text-xs">✓</span> : <Icon className={`h-3 w-3 ${active ? "text-white" : "text-muted-foreground"}`} />}
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${active ? "text-primary" : done ? "text-green-500" : "text-muted-foreground"}`}>{step.label}</p>
                        {active && <p className="text-xs text-muted-foreground animate-pulse">{step.desc}</p>}
                      </div>
                      {active && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Full in-depth result — same components as PredictPage ─── */}
      {analysisResult && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Sticky publish bar */}
          <Alert className="border-green-500/50 bg-green-500/10 flex items-center justify-between gap-4 backdrop-blur-md sticky top-32 z-40 shadow-lg">
            <AlertDescription className="text-green-400 font-medium">
              ✅ Full in-depth analysis ready for <strong>{selectedSymbol?.symbol || symbol}</strong>. Review all sections below, then publish to the Daily Board so all users can see it.
            </AlertDescription>
            <Button
              onClick={publishToBoard}
              disabled={publishing}
              className="shrink-0 bg-green-600 hover:bg-green-700 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)]"
            >
              {publishing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" />Publish to Daily Board</>
              )}
            </Button>
          </Alert>

          {/* AI Reasoning — same as PredictPage (why this signal, deep analysis, market context) */}
          {gf && (
            <AIReasoningDisplay
              symbol={analysisResult.symbol}
              action={action}
              confidence={gf.action_signal?.confidence || analysisResult.confidence || 50}
              technicalFactors={analysisResult.patterns}
              keyDrivers={gf.forecasts?.[0]?.key_drivers}
              riskFlags={gf.forecasts?.[0]?.risk_flags}
              oneLineSummary={analysisResult.rationale}
              deepAnalysis={gf.deep_analysis}
              marketContext={gf.market_context}
              positioningNotes={gf.positioning_guidance?.notes}
              volumeProfile={analysisResult.volumeData?.volumeProfile ?? undefined}
              analysedAt={analysedAt}
            />
          )}

          {/* Decision Screen — action, confidence, ROI scenarios, risk management */}
          {gf && (
            <DecisionScreen
              symbol={analysisResult.symbol}
              currentPrice={analysisResult.currentPrice}
              investment={Number(investment)}
              action={action}
              confidence={gf.action_signal?.confidence || analysisResult.confidence || 50}
              riskLevel={gf.risk_grade || "MEDIUM"}
              expectedROI={{
                best: gf.expected_roi?.best_case || 10,
                likely: gf.expected_roi?.likely_case || 5,
                worst: gf.expected_roi?.worst_case || -5,
              }}
              positionSize={{
                shares: analysisResult.positionSize?.shares || 0,
                costPerShare: analysisResult.positionSize?.costPerShare || analysisResult.currentPrice,
                totalCost: analysisResult.positionSize?.totalCost || 0,
              }}
              recommendedHoldPeriod={gf.positioning_guidance?.recommended_hold_period}
              stopLoss={DEFAULT_PROFILE.stopLossPercentage}
              takeProfit={DEFAULT_PROFILE.targetProfitPercentage}
              leverage={DEFAULT_PROFILE.leverage}
              currency="USD"
            />
          )}

          {/* Capital Scenarios */}
          {gf?.expected_roi && (
            <CapitalScenarios
              currentPrice={analysisResult.currentPrice}
              expectedROI={{
                best: gf.expected_roi.best_case,
                likely: gf.expected_roi.likely_case,
                worst: gf.expected_roi.worst_case,
              }}
              stopLossPercentage={DEFAULT_PROFILE.stopLossPercentage}
              leverage={DEFAULT_PROFILE.leverage}
              allowFractionalShares={true}
            />
          )}

          {/* Multi-Horizon Forecasts */}
          {gf?.forecasts && (
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <BarChart3 className="h-5 w-5" />
                  Multi-Horizon Forecasts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ForecastTable
                  forecasts={gf.forecasts}
                  predictedAt={analysedAt ?? new Date()}
                  marketTimeZone={undefined}
                  marketStatus={undefined}
                />
              </CardContent>
            </Card>
          )}

          {/* Key Price Levels */}
          {gf?.support_resistance && (
            <Card className="glass-panel">
              <CardHeader><CardTitle className="text-white">Key Price Levels</CardTitle></CardHeader>
              <CardContent>
                <KeyLevels
                  supportLevels={gf.support_resistance.supports}
                  resistanceLevels={gf.support_resistance.resistances}
                  currentPrice={analysisResult.currentPrice}
                />
              </CardContent>
            </Card>
          )}

          {/* AI Insights */}
          <Card className="glass-panel">
            <CardHeader><CardTitle className="text-white">AI Insights & Analysis</CardTitle></CardHeader>
            <CardContent>
              <Insights
                keyDrivers={gf?.forecasts?.[0]?.key_drivers}
                riskFlags={gf?.forecasts?.[0]?.risk_flags}
                opportunities={analysisResult.opportunities}
                rationale={analysisResult.rationale}
                patterns={analysisResult.patterns}
              />
            </CardContent>
          </Card>

          {/* Bottom publish button */}
          <Button
            onClick={publishToBoard}
            disabled={publishing}
            size="lg"
            className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-6 shadow-lg"
          >
            {publishing ? (
              <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Publishing to Daily Board…</>
            ) : (
              <><Upload className="mr-2 h-5 w-5" />Publish to Daily Board</>
            )}
          </Button>
        </div>
      )}

      {/* ── Current daily board ──────────────────────────────────── */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white">Current daily board ({boardRows.length})</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Analyses you published appear here and on the Daily Analysis page for all users.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Symbol</TableHead>
                <TableHead className="text-muted-foreground">Action</TableHead>
                <TableHead className="text-muted-foreground">Probability</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
                <TableHead className="text-muted-foreground">Expires</TableHead>
                <TableHead className="text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boardRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No analyses published yet. Run an analysis above and publish it.
                  </TableCell>
                </TableRow>
              ) : boardRows.map((row) => {
                const isExpired = new Date(row.expires_at).getTime() < Date.now();
                return (
                  <TableRow key={row.id} className={`border-white/5 hover:bg-white/5 ${isExpired ? "opacity-60" : ""}`}>
                    <TableCell className="font-medium text-zinc-300">
                      {row.display_name || row.symbol}
                      {isExpired && <Badge variant="outline" className="ml-2 text-xs border-amber-500 text-amber-500">Expired</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.action_signal === "BUY" ? "default" : row.action_signal === "SELL" ? "destructive" : "secondary"} className="border-white/10">
                        {row.action_signal || "HOLD"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-300">{row.probability_score != null ? `${row.probability_score}%` : "-"}</TableCell>
                    <TableCell className="text-zinc-400">{row.generated_for_date}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{new Date(row.expires_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-blue-400 border-primary/40 hover:bg-primary/10"
                          onClick={() => repredictRow(row)}
                          disabled={repredictingId === row.id}
                          title="Re-run AI analysis and update this row"
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${repredictingId === row.id ? "animate-spin" : ""}`} />
                          {repredictingId === row.id ? "…" : "Re-predict"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs text-red-400 border-red-500/40 hover:bg-red-500/10"
                          onClick={() => deleteRow(row.id)}
                          disabled={deletingId === row.id}
                          title="Remove from daily board"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          {deletingId === row.id ? "…" : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
