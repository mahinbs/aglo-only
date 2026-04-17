import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isAnalysisExceptionEmail } from "@/lib/manualSubscriptionBypass";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  BarChart2,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useSubscription } from "@/hooks/useSubscription";
import {
  getAlgoStrategyLimits,
  isAtCustomStrategyCap,
  strategyCapToastMessage,
  UNLIMITED_CUSTOM_STRATEGIES,
} from "@/lib/algoStrategyLimits";
import { PaperTradeSetupDialog } from "@/components/trading/PaperTradeSetupDialog";

interface StrategySymbol {
  symbol:       string;
  exchange:     string;
  quantity:     number;
  product_type: string;
}

interface AiAnalysis {
  risk_score:                  number;
  expected_monthly_return_pct: number;
  win_rate_estimate_pct:       number;
  recommendation:              string;
  strengths:                   string[];
  weaknesses:                  string[];
  suggested_improvements:      string[];
  optimal_market_conditions:   string;
  avoid_when:                  string;
  risk_reward_ratio:           number;
  notes:                       string;
}

interface BacktestSummary {
  trades_tested:        number;
  win_count:            number;
  loss_count:           number;
  win_rate_pct:         number;
  avg_return_per_trade: number;
  total_return_pct:     number;
  max_drawdown_pct:     number;
  profit_factor:        number;
  period:               string;
  note:                 string;
}

interface UserStrategy {
  id:                   string;
  name:                 string;
  description:          string | null;
  trading_mode:         string;
  is_intraday:          boolean;
  start_time:           string;
  end_time:             string;
  squareoff_time:       string;
  risk_per_trade_pct:   number;
  stop_loss_pct:        number;
  take_profit_pct:      number;
  symbols:              StrategySymbol[];
  openalgo_webhook_id:  string | null;
  ai_analysis:          AiAnalysis | null;
  backtest_summary:     BacktestSummary | null;
  is_active:            boolean;
  created_at:           string;
}

const TRADING_MODES = [
  { value: "LONG",  label: "Long Only (Buy)" },
  { value: "SHORT", label: "Short Only (Sell)" },
  { value: "BOTH",  label: "Both (Long & Short)" },
];

const EXCHANGES = ["NSE", "BSE", "NFO", "BFO", "MCX"];
const PRODUCT_TYPES = ["CNC", "MIS", "NRML"];

const RECOMMENDATION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  strong_buy:       { label: "Strong Buy",       color: "text-green-400 bg-green-500/10 border-green-500/30",  icon: <TrendingUp className="h-3 w-3" /> },
  buy:              { label: "Buy",              color: "text-teal-400 bg-teal-500/10 border-teal-500/30",    icon: <TrendingUp className="h-3 w-3" /> },
  neutral:          { label: "Neutral",          color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",    icon: <BarChart2 className="h-3 w-3" /> },
  risky:            { label: "Risky",            color: "text-amber-400 bg-amber-500/10 border-amber-500/30", icon: <AlertTriangle className="h-3 w-3" /> },
  not_recommended:  { label: "Not Recommended",  color: "text-red-400 bg-red-500/10 border-red-500/30",       icon: <TrendingDown className="h-3 w-3" /> },
};

const EMPTY_SYMBOL: StrategySymbol = { symbol: "", exchange: "NSE", quantity: 1, product_type: "CNC" };

const EMPTY_FORM = {
  name:               "",
  description:        "",
  trading_mode:       "LONG",
  is_intraday:        true,
  start_time:         "09:15",
  end_time:           "15:15",
  squareoff_time:     "15:15",
  risk_per_trade_pct: "1",
  stop_loss_pct:      "2",
  take_profit_pct:    "4",
  symbols:            [{ ...EMPTY_SYMBOL }] as StrategySymbol[],
};

export default function StrategiesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const canOpenPredictFlow = isAnalysisExceptionEmail(user?.email);
  const [strategies, setStrategies]     = useState<UserStrategy[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expanded, setExpanded]         = useState<Record<string, boolean>>({});
  const [analyzing, setAnalyzing]       = useState<Record<string, boolean>>({});
  const [toggling, setToggling]         = useState<Record<string, boolean>>({});
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [creating, setCreating]         = useState(false);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });
  const [paperTradeStrategyId, setPaperTradeStrategyId] = useState<string | null>(null);
  const [seedingPresets, setSeedingPresets] = useState(false);

  const stratLimits = getAlgoStrategyLimits(subscription?.plan_id);
  const canDeleteStrategies = stratLimits?.allowDeleteStrategies ?? false;
  const atStrategyCap = isAtCustomStrategyCap(strategies.length, stratLimits);

  const openCreateDialog = () => {
    if (atStrategyCap && stratLimits) {
      toast.error(strategyCapToastMessage(stratLimits));
      return;
    }
    setShowCreate(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "list" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = (res.data as { strategies?: UserStrategy[] } | null)?.strategies ?? [];
      setStrategies(data);
    } catch (e: any) {
      toast.error("Failed to load strategies: " + (e.message ?? "unknown"));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const handleSeedPresets = useCallback(async () => {
    setSeedingPresets(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "seed_guide_presets" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = res.data as { seeded?: number; strategies?: UserStrategy[]; error?: string } | null;
      if (res.error || result?.error) {
        toast.error(result?.error ?? res.error?.message ?? "Failed to load presets");
        return;
      }
      const seeded = Number(result?.seeded ?? 0);
      if (seeded > 0) {
        toast.success(`Loaded ${seeded} Algo Guide preset${seeded === 1 ? "" : "s"} — connect a broker, then activate to start trading.`);
      } else {
        toast.info("Algo Guide presets already loaded");
      }
      if (Array.isArray(result?.strategies)) {
        setStrategies(result.strategies);
      } else {
        await load();
      }
    } catch (e: any) {
      toast.error("Error loading presets: " + (e.message ?? "unknown"));
    } finally {
      setSeedingPresets(false);
    }
  }, [load, navigate]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Strategy name is required"); return; }
    if (atStrategyCap) {
      toast.error("Strategy limit reached for your plan.");
      return;
    }

    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: {
          action:             "create",
          name:               form.name.trim(),
          description:        form.description.trim(),
          trading_mode:       form.trading_mode,
          is_intraday:        form.is_intraday,
          start_time:         form.start_time,
          end_time:           form.end_time,
          squareoff_time:     form.squareoff_time,
          risk_per_trade_pct: parseFloat(form.risk_per_trade_pct) || 1,
          stop_loss_pct:      parseFloat(form.stop_loss_pct) || 2,
          take_profit_pct:    parseFloat(form.take_profit_pct) || 4,
          symbols:            form.symbols.filter((s) => s.symbol.trim()),
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      const result = res.data as { strategy?: UserStrategy; error?: string } | null;
      if (res.error || result?.error) {
        toast.error(result?.error ?? res.error?.message ?? "Failed to create strategy");
        return;
      }

      toast.success(`Strategy "${form.name}" created!`);
      setShowCreate(false);
      setForm({ ...EMPTY_FORM, symbols: [{ ...EMPTY_SYMBOL }] });
      await load();

      // Trigger AI analysis immediately
      if (result?.strategy?.id) {
        setTimeout(() => handleAnalyze(result!.strategy!.id), 500);
      }
    } catch (e: any) {
      toast.error("Error: " + (e.message ?? "unknown"));
    } finally {
      setCreating(false);
    }
  };

  const handleAnalyze = async (strategyId: string) => {
    setAnalyzing((prev) => ({ ...prev, [strategyId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("analyze-strategy", {
        body: { strategy_id: strategyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (res.error) {
        toast.error("Analysis failed: " + res.error.message);
        return;
      }

      toast.success("AI analysis complete!");
      await load();
      setExpanded((prev) => ({ ...prev, [strategyId]: true }));
    } catch (e: any) {
      toast.error("Analysis error: " + (e.message ?? "unknown"));
    } finally {
      setAnalyzing((prev) => ({ ...prev, [strategyId]: false }));
    }
  };

  const handleToggle = async (strategyId: string) => {
    setToggling((prev) => ({ ...prev, [strategyId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke("manage-strategy", {
        body: { action: "toggle", strategy_id: strategyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      await load();
    } finally {
      setToggling((prev) => ({ ...prev, [strategyId]: false }));
    }
  };

  const handleDelete = async (strategyId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("manage-strategy", {
        body: { action: "delete", strategy_id: strategyId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) { toast.error("Delete failed"); return; }
      toast.success("Strategy deleted");
      setDeleting(null);
      await load();
    } catch (e: any) {
      toast.error("Delete error: " + (e.message ?? "unknown"));
    }
  };

  const addSymbolRow = () => setForm((f) => ({ ...f, symbols: [...f.symbols, { ...EMPTY_SYMBOL }] }));
  const removeSymbolRow = (i: number) =>
    setForm((f) => ({ ...f, symbols: f.symbols.filter((_, idx) => idx !== i) }));
  const updateSymbol = (i: number, field: keyof StrategySymbol, val: string | number) =>
    setForm((f) => {
      const symbols = [...f.symbols];
      symbols[i] = { ...symbols[i], [field]: val };
      return { ...f, symbols };
    });

  const getRiskColor = (score: number) =>
    score <= 3 ? "text-green-400" : score <= 6 ? "text-amber-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-16">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Zap className="h-6 w-6 text-teal-400" />
              My Strategies
            </h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              Create trading strategies — our AI analyzes and backtests each one.
              {stratLimits ? (
                <span className="block text-zinc-500 text-xs mt-1">
                  Your plan:{" "}
                  {stratLimits.maxCustomStrategies === UNLIMITED_CUSTOM_STRATEGIES
                    ? "Unlimited custom strategies"
                    : `up to ${stratLimits.maxCustomStrategies} custom strateg${
                        stratLimits.maxCustomStrategies === 1 ? "y" : "ies"
                      }`}
                  {stratLimits.allowDeleteStrategies
                    ? " (create, edit, delete)."
                    : " (edit only; upgrade to Pro to delete and add freely)."}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="border-zinc-700 hover:bg-zinc-800"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={openCreateDialog}
              disabled={atStrategyCap}
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Strategy
            </Button>
          </div>
        </div>

        {/* Strategy list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
          </div>
        ) : strategies.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="flex flex-col items-center py-16 gap-4">
              <BarChart2 className="h-12 w-12 text-zinc-700" />
              <div className="text-center">
                <p className="text-white font-semibold">No strategies yet</p>
                <p className="text-zinc-400 text-sm mt-1 max-w-md">
                  Same strategies workspace as on the marketing site—create rules here, then run analysis and backtests from the Algo Tools sidebar.
                </p>
              </div>
              <Button
                onClick={openCreateDialog}
                disabled={atStrategyCap}
                className="bg-teal-500 hover:bg-teal-400 text-black font-bold"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Create Strategy
              </Button>
              <div className="flex flex-col items-center gap-2 mt-2">
                <Button
                  onClick={handleSeedPresets}
                  disabled={seedingPresets}
                  variant="outline"
                  className="border-teal-700/50 text-teal-300 hover:bg-teal-500/10"
                >
                  {seedingPresets ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-1.5" />
                  )}
                  Load 7 Algo Guide Presets
                </Button>
                <p className="text-zinc-500 text-xs max-w-md text-center">
                  EMA 20/50, ORB, Supertrend, VWAP Bounce, RSI Divergence,
                  Liquidity Sweep + BOS, and SMC Multi-Timeframe — all from the
                  Algo Trading Guide. Loaded as paused; activate after connecting a broker.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {strategies.map((s) => {
              const isExpanded = !!expanded[s.id];
              const rec = RECOMMENDATION_CONFIG[s.ai_analysis?.recommendation ?? ""] ?? null;

              return (
                <Card key={s.id} className={`bg-zinc-900 border-zinc-800 transition-all ${!s.is_active ? "opacity-60" : ""}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-white font-bold text-base truncate">{s.name}</span>
                          <Badge className={`text-[10px] border ${s.is_active ? "bg-teal-500/10 text-teal-400 border-teal-500/30" : "bg-zinc-700 text-zinc-400 border-zinc-600"}`}>
                            {s.is_active ? "Active" : "Paused"}
                          </Badge>
                          <Badge className="text-[10px] bg-zinc-800 text-zinc-300 border-zinc-700">
                            {s.trading_mode}
                          </Badge>
                          <Badge className="text-[10px] bg-zinc-800 text-zinc-300 border-zinc-700">
                            {s.is_intraday ? "Intraday" : "Positional"}
                          </Badge>
                          {rec && (
                            <Badge className={`text-[10px] border flex items-center gap-1 ${rec.color}`}>
                              {rec.icon}
                              {rec.label}
                            </Badge>
                          )}
                        </div>
                        {s.description && (
                          <p className="text-zinc-400 text-xs">{s.description}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-zinc-500">
                          <span>SL: <span className="text-zinc-300">{s.stop_loss_pct}%</span></span>
                          <span>TP: <span className="text-zinc-300">{s.take_profit_pct}%</span></span>
                          <span>Risk: <span className="text-zinc-300">{s.risk_per_trade_pct}%/trade</span></span>
                          <span>{s.start_time}–{s.end_time}</span>
                          {s.symbols.length > 0 && (
                            <span>{s.symbols.length} symbol{s.symbols.length !== 1 ? "s" : ""}</span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaperTradeStrategyId(s.id)}
                          className="border-teal-700/50 text-teal-400 hover:bg-teal-500/10 text-xs"
                          title="Paper trade when this strategy’s entry conditions are met (scheduled or now)"
                        >
                          <FlaskConical className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">Paper Trade</span>
                        </Button>
                        <Switch
                          checked={s.is_active}
                          onCheckedChange={() => handleToggle(s.id)}
                          disabled={!!toggling[s.id]}
                          className="data-[state=checked]:bg-teal-500"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAnalyze(s.id)}
                          disabled={!!analyzing[s.id]}
                          className="border-zinc-700 hover:bg-zinc-800 text-xs"
                        >
                          {analyzing[s.id] ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Bot className="h-3.5 w-3.5" />
                          )}
                          <span className="ml-1 hidden sm:inline">
                            {s.ai_analysis ? "Re-analyze" : "Analyze"}
                          </span>
                        </Button>
                        {canDeleteStrategies ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(s.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setExpanded((prev) => ({ ...prev, [s.id]: !isExpanded }))}
                          className="text-zinc-400 hover:text-white h-8 w-8"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  {/* Expanded: AI Analysis + Backtest */}
                  {isExpanded && (
                    <CardContent className="pt-0 space-y-4">
                      <Separator className="bg-zinc-800" />

                      {/* Symbols table */}
                      {s.symbols.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-400 font-semibold mb-2 uppercase tracking-wide">Symbols</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-zinc-500">
                                  <th className="text-left pb-1">Symbol</th>
                                  <th className="text-left pb-1">Exchange</th>
                                  <th className="text-left pb-1">Qty</th>
                                  <th className="text-left pb-1">Product</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.symbols.map((sym, i) => (
                                  <tr key={i} className="border-t border-zinc-800">
                                    <td className="py-1 text-white font-mono">{sym.symbol}</td>
                                    <td className="py-1 text-zinc-300">{sym.exchange}</td>
                                    <td className="py-1 text-zinc-300">{sym.quantity}</td>
                                    <td className="py-1 text-zinc-300">{sym.product_type}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* AI Analysis */}
                      {analyzing[s.id] ? (
                        <div className="flex items-center gap-3 py-4 text-teal-400">
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span className="text-sm">AI is analyzing your strategy…</span>
                        </div>
                      ) : s.ai_analysis ? (
                        <div className="space-y-4">
                          {/* Metrics row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-zinc-800 rounded-lg p-3 text-center">
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Risk Score</p>
                              <p className={`text-2xl font-black ${getRiskColor(s.ai_analysis.risk_score)}`}>
                                {s.ai_analysis.risk_score}/10
                              </p>
                            </div>
                            <div className="bg-zinc-800 rounded-lg p-3 text-center">
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Est. Monthly</p>
                              <p className="text-2xl font-black text-teal-400">
                                {s.ai_analysis.expected_monthly_return_pct}%
                              </p>
                            </div>
                            <div className="bg-zinc-800 rounded-lg p-3 text-center">
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Win Rate</p>
                              <p className="text-2xl font-black text-white">
                                {s.ai_analysis.win_rate_estimate_pct}%
                              </p>
                            </div>
                            <div className="bg-zinc-800 rounded-lg p-3 text-center">
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">R:R Ratio</p>
                              <p className={`text-2xl font-black ${s.ai_analysis.risk_reward_ratio >= 2 ? "text-green-400" : s.ai_analysis.risk_reward_ratio >= 1.5 ? "text-amber-400" : "text-red-400"}`}>
                                {s.ai_analysis.risk_reward_ratio.toFixed(1)}x
                              </p>
                            </div>
                          </div>

                          {/* Notes */}
                          <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg p-3">
                            <p className="text-teal-300 text-sm">{s.ai_analysis.notes}</p>
                          </div>

                          {/* Strengths + Weaknesses */}
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <p className="text-xs text-green-400 font-semibold uppercase tracking-wide">Strengths</p>
                              {s.ai_analysis.strengths.map((str, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-300">
                                  <CheckCircle2 className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />
                                  {str}
                                </div>
                              ))}
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs text-amber-400 font-semibold uppercase tracking-wide">Improvements</p>
                              {s.ai_analysis.suggested_improvements.map((imp, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-xs text-zinc-300">
                                  <Zap className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                                  {imp}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* When to use / avoid */}
                          <div className="grid sm:grid-cols-2 gap-3 text-xs">
                            <div className="bg-zinc-800 rounded-lg p-3">
                              <p className="text-teal-400 font-semibold mb-1">Best conditions</p>
                              <p className="text-zinc-300">{s.ai_analysis.optimal_market_conditions}</p>
                            </div>
                            <div className="bg-zinc-800 rounded-lg p-3">
                              <p className="text-red-400 font-semibold mb-1">Avoid when</p>
                              <p className="text-zinc-300">{s.ai_analysis.avoid_when}</p>
                            </div>
                          </div>

                          {/* Backtest Summary */}
                          {s.backtest_summary && (
                            <div>
                              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide mb-2">
                                Backtest — {s.backtest_summary.period}
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                {[
                                  { label: "Win Rate",     val: `${s.backtest_summary.win_rate_pct}%` },
                                  { label: "Profit Factor",val: `${s.backtest_summary.profit_factor}x` },
                                  { label: "Avg Return",   val: `${s.backtest_summary.avg_return_per_trade > 0 ? "+" : ""}${s.backtest_summary.avg_return_per_trade}%` },
                                  { label: "Max Drawdown", val: `-${s.backtest_summary.max_drawdown_pct}%` },
                                ].map((m) => (
                                  <div key={m.label} className="bg-zinc-800 rounded-lg p-2.5 text-center">
                                    <p className="text-zinc-500 text-[10px] mb-1">{m.label}</p>
                                    <p className="text-white font-bold">{m.val}</p>
                                  </div>
                                ))}
                              </div>
                              <p className="text-[10px] text-zinc-600 mt-1.5">{s.backtest_summary.note}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center py-6 gap-3 text-center">
                          <Bot className="h-8 w-8 text-zinc-600" />
                          <p className="text-zinc-400 text-sm">No AI analysis yet.</p>
                          <Button
                            size="sm"
                            onClick={() => handleAnalyze(s.id)}
                            className="bg-teal-500 hover:bg-teal-400 text-black font-bold"
                          >
                            <Bot className="h-3.5 w-3.5 mr-1.5" />
                            Run AI Analysis
                          </Button>
                        </div>
                      )}

                      {/* Use this strategy — predict flow only for exception accounts */}
                      {canOpenPredictFlow && (
                        <div className="flex justify-end pt-2">
                          <Button
                            size="sm"
                            onClick={() => navigate(`/predict?strategy=${s.id}`)}
                            className="bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs"
                          >
                            Use Strategy
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Strategy Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => !creating && setShowCreate(o)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-teal-400" />
              Create New Strategy
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Define your strategy. AI will analyze and backtest it automatically after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name + Description */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Strategy Name <span className="text-red-400">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Momentum Breakout"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-sm">Trading Mode</Label>
                <Select value={form.trading_mode} onValueChange={(v) => setForm((f) => ({ ...f, trading_mode: v }))}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                    {TRADING_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="focus:bg-zinc-700">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-sm">Description (optional)</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description of your strategy logic"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>

            {/* Type + Times */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_intraday}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_intraday: v }))}
                className="data-[state=checked]:bg-teal-500"
              />
              <span className="text-sm text-zinc-300">
                {form.is_intraday ? "Intraday (same-day square-off)" : "Positional (multi-day)"}
              </span>
            </div>

            {form.is_intraday && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Start Time</Label>
                  <Input
                    value={form.start_time}
                    onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                    placeholder="09:15"
                    className="bg-zinc-800 border-zinc-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">End Time</Label>
                  <Input
                    value={form.end_time}
                    onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                    placeholder="15:15"
                    className="bg-zinc-800 border-zinc-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">Square-off</Label>
                  <Input
                    value={form.squareoff_time}
                    onChange={(e) => setForm((f) => ({ ...f, squareoff_time: e.target.value }))}
                    placeholder="15:15"
                    className="bg-zinc-800 border-zinc-700 text-white text-sm"
                  />
                </div>
              </div>
            )}

            {/* Risk */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-xs">Risk/Trade (%)</Label>
                <Input
                  type="number"
                  value={form.risk_per_trade_pct}
                  onChange={(e) => setForm((f) => ({ ...f, risk_per_trade_pct: e.target.value }))}
                  min={0.1} max={10} step={0.1}
                  className="bg-zinc-800 border-zinc-700 text-white text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-xs">Stop Loss (%)</Label>
                <Input
                  type="number"
                  value={form.stop_loss_pct}
                  onChange={(e) => setForm((f) => ({ ...f, stop_loss_pct: e.target.value }))}
                  min={0.1} max={20} step={0.1}
                  className="bg-zinc-800 border-zinc-700 text-white text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300 text-xs">Take Profit (%)</Label>
                <Input
                  type="number"
                  value={form.take_profit_pct}
                  onChange={(e) => setForm((f) => ({ ...f, take_profit_pct: e.target.value }))}
                  min={0.1} max={50} step={0.1}
                  className="bg-zinc-800 border-zinc-700 text-white text-sm"
                />
              </div>
            </div>

            {/* R:R preview */}
            {parseFloat(form.stop_loss_pct) > 0 && (
              <div className="text-xs text-zinc-500">
                R:R ratio:{" "}
                <span className={`font-bold ${parseFloat(form.take_profit_pct) / parseFloat(form.stop_loss_pct) >= 2 ? "text-green-400" : "text-amber-400"}`}>
                  {(parseFloat(form.take_profit_pct) / parseFloat(form.stop_loss_pct)).toFixed(1)}:1
                </span>
                {parseFloat(form.take_profit_pct) / parseFloat(form.stop_loss_pct) < 2 && (
                  <span className="text-amber-400 ml-2">⚠ Aim for ≥2:1 for best results</span>
                )}
              </div>
            )}

            <Separator className="bg-zinc-800" />

            {/* Symbols */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-zinc-300 text-sm">Trading Symbols</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addSymbolRow}
                  className="text-teal-400 hover:text-teal-300 text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Symbol
                </Button>
              </div>
              <div className="space-y-2">
                {form.symbols.map((sym, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_70px_90px_32px] gap-2 items-center">
                    <Input
                      value={sym.symbol}
                      onChange={(e) => updateSymbol(i, "symbol", e.target.value.toUpperCase())}
                      placeholder="RELIANCE"
                      className="bg-zinc-800 border-zinc-700 text-white text-sm font-mono"
                    />
                    <Select
                      value={sym.exchange}
                      onValueChange={(v) => updateSymbol(i, "exchange", v)}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                        {EXCHANGES.map((ex) => (
                          <SelectItem key={ex} value={ex} className="focus:bg-zinc-700 text-xs">{ex}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={sym.quantity}
                      onChange={(e) => updateSymbol(i, "quantity", parseInt(e.target.value) || 1)}
                      min={1}
                      placeholder="Qty"
                      className="bg-zinc-800 border-zinc-700 text-white text-sm text-center"
                    />
                    <Select
                      value={sym.product_type}
                      onValueChange={(v) => updateSymbol(i, "product_type", v)}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700 text-white">
                        {PRODUCT_TYPES.map((pt) => (
                          <SelectItem key={pt} value={pt} className="focus:bg-zinc-700 text-xs">{pt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSymbolRow(i)}
                      disabled={form.symbols.length === 1}
                      className="text-zinc-500 hover:text-red-400 h-8 w-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreate(false)}
              disabled={creating}
              className="border-zinc-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-teal-500 hover:bg-teal-400 text-black font-bold"
            >
              {creating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />Create & Analyze</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Strategy?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This will permanently delete the strategy and its AI analysis. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 hover:bg-zinc-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && handleDelete(deleting)}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PaperTradeSetupDialog
        open={paperTradeStrategyId != null}
        onOpenChange={(o) => {
          if (!o) setPaperTradeStrategyId(null);
        }}
        preselectedStrategyId={paperTradeStrategyId}
        onCreated={() => {
          setPaperTradeStrategyId(null);
          toast.success("Paper strategy queued. View progress under Active Trades → Pending Paper Strategies.");
        }}
      />
    </div>
  );
}
