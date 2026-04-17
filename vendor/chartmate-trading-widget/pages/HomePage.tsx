import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { SymbolSearch, SymbolData } from "@/components/SymbolSearch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface NewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  image_url: string | null;
  published_at: string;
}
import {
  Activity,
  BarChart3,
  ShieldCheck,
  KeyRound,
  BrainCircuit,
  Newspaper,
  Bot,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTradingIntegration } from "@/hooks/useTradingIntegration";
import { TradingIntegrationModal } from "@/components/trading/TradingIntegrationModal";
import { useSubscription } from "@/hooks/useSubscription";
import { isAnalysisExceptionEmail } from "@/lib/manualSubscriptionBypass";
import YahooChartPanel from "@/components/YahooChartPanel";
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";

const DEFAULT_STOCKS = [
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "EURUSD=X", name: "EUR/USD" },
  { symbol: "GC=F", name: "Gold" },
  { symbol: "NVDA", name: "NVIDIA Corp." },
];

interface WatchlistItem {
  id: string;
  symbol: string;
  display_name: string;
  position: number;
}

export default function HomePage() {
  const { user } = useAuth();
  const { save, refresh } = useTradingIntegration();
  const { hasAlgoAccess, hasAnalysisAccess, manualFullAccessBypass } = useSubscription();
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [activeStock, setActiveStock] = useState<{
    symbol: string;
    name: string;
  } | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [symbolPickerValue, setSymbolPickerValue] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<SymbolData | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [algoStatus, setAlgoStatus] = useState<string | null>(null);
  const isAlgoProvisioned =
    manualFullAccessBypass ||
    (hasAlgoAccess && (algoStatus === "provisioned" || algoStatus === "active"));
  const algoEntryPath = !hasAlgoAccess
    ? "/pricing?feature=algo"
    : isAlgoProvisioned
      ? "/trading-dashboard"
      : "/algo-setup";

  const canSeePredictPast = isAnalysisExceptionEmail(user?.email);

  useEffect(() => {
    const fetchRecentNews = async () => {
      try {
        const { data, error } = await supabase
          .from("news" as any)
          .select("*")
          .order("published_at", { ascending: false })
          .limit(5);
        if (!error && data) {
          setNews((data as unknown as NewsArticle[]) || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setNewsLoading(false);
      }
    };
    fetchRecentNews();
  }, []);

  useEffect(() => {
    const loadWatchlist = async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from("watchlists")
        .select("id,symbol,display_name,position")
        .eq("user_id", user.id)
        .order("position", { ascending: true });

      let rows = (data as WatchlistItem[] | null) ?? [];
      if (rows.length === 0) {
        const seed = DEFAULT_STOCKS.map((s, i) => ({
          user_id: user.id,
          symbol: s.symbol,
          display_name: s.name,
          position: i,
        }));
        const { data: inserted } = await supabase
          .from("watchlists")
          .insert(seed)
          .select("id,symbol,display_name,position")
          .order("position", { ascending: true });
        rows = (inserted as WatchlistItem[] | null) ?? [];
      }

      setWatchlist(rows);
      if (rows.length > 0) {
        setActiveStock({ symbol: rows[0].symbol, name: rows[0].display_name });
      }
    };
    loadWatchlist();
  }, [user?.id]);

  useEffect(() => {
    const fetchAlgoStatus = async () => {
      if (!user?.id || !hasAlgoAccess) {
        setAlgoStatus(null);
        return;
      }
      const { data } = await (supabase as any)
        .from("algo_onboarding")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      setAlgoStatus(data?.status ?? null);
    };
    fetchAlgoStatus();
  }, [user?.id, hasAlgoAccess]);

  const addStock = async () => {
    if (!user?.id) return;
    if (watchlist.length >= 5) return;
    const symbol = (selectedSymbol?.full_symbol || selectedSymbol?.symbol || "")
      .trim()
      .toUpperCase();
    if (!symbol) return;
    if (watchlist.some((w) => w.symbol.toUpperCase() === symbol)) {
      setSymbolPickerValue("");
      setSelectedSymbol(null);
      setAddDialogOpen(false);
      return;
    }
    const display = (
      selectedSymbol?.description?.trim() ||
      selectedSymbol?.symbol ||
      symbol
    ).slice(0, 60);
    const { data } = await supabase
      .from("watchlists")
      .insert({
        user_id: user.id,
        symbol,
        display_name: display,
        position: watchlist.length,
      })
      .select("id,symbol,display_name,position")
      .single();
    if (data) {
      const next = [...watchlist, data as WatchlistItem];
      setWatchlist(next);
      setActiveStock({ symbol: symbol, name: display });
    }
    setSymbolPickerValue("");
    setSelectedSymbol(null);
    setAddDialogOpen(false);
  };

  const removeStock = async (item: WatchlistItem) => {
    if (watchlist.length <= 1) return;
    await supabase.from("watchlists").delete().eq("id", item.id);
    const next = watchlist.filter((w) => w.id !== item.id);
    setWatchlist(next);
    if (activeStock?.symbol === item.symbol) {
      const first = next[0];
      if (first)
        setActiveStock({ symbol: first.symbol, name: first.display_name });
    }
    // normalize positions
    next.forEach((w, i) => {
      if (w.position !== i)
        supabase.from("watchlists").update({ position: i }).eq("id", w.id);
    });
  };

  const newsPanel = (
    <>
      <div className="flex items-center gap-2 mb-8">
        <h3 className="font-bold text-foreground text-sm tracking-widest uppercase opacity-90">
          Market News
        </h3>
        <span className="w-2 h-2 rounded-full bg-trading-green animate-pulse shadow-[0_0_8px] shadow-trading-green relative top-[0.5px]" />
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 min-h-0">
        {newsLoading ? (
          [1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex gap-4 pb-5 border-b border-border/50 last:border-0 relative"
            >
              <div className="h-16 w-16 bg-muted/60 rounded-xl shrink-0 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-full bg-muted/60 rounded-[4px] animate-pulse" />
                <div className="h-3.5 w-[85%] bg-muted/60 rounded-[4px] animate-pulse" />
                <div className="h-3 w-1/2 bg-muted/40 rounded-[4px] mt-2 animate-pulse" />
              </div>
            </div>
          ))
        ) : (
          <>
            {news.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-4 pb-5 border-b border-primary/25 last:border-0 group hover:opacity-90 transition-opacity"
              >
                <div className="h-16 w-16 rounded-xl bg-muted/30 shrink-0 overflow-hidden border border-border/50">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground/30">
                      <Newspaper className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h4 className="text-[13px] font-semibold text-foreground leading-tight line-clamp-2 mb-1.5 group-hover:text-primary transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[11px] font-medium text-muted-foreground/80 truncate">
                    {item.source} <span className="mx-0.5 opacity-50">•</span>{" "}
                    {formatDistanceToNow(new Date(item.published_at), {
                      addSuffix: true,
                    }).replace("about ", "")}
                  </p>
                </div>
              </a>
            ))}
          </>
        )}
      </div>
      <Link
        to="/news"
        className="block w-full text-center py-2.5 mt-2 rounded-[10px] glass-button-premium border-white/10 text-[13px] font-semibold text-foreground/80 hover:bg-white/10 hover:text-foreground transition-all"
      >
        See more
      </Link>
    </>
  );

  return (
    <>
      <DashboardShellLayout>
        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[1fr_300px] xl:gap-8 xl:items-start">
          <div className="min-w-0 space-y-7 xl:min-h-0">
            <header className="flex pt-3 shrink-0 items-center border-b border-white/5 lg:border-transparent -mx-4 sm:-mx-6 lg:mx-0 pl-16 pr-2 sm:pr-4 lg:px-0 max-lg:hidden">
              <h1 className="text-xl lg:text-2xl font-bold text-foreground">
                Dashboard
              </h1>
            </header>
            {/* USER WATCHLIST (customizable) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap pb-1">
                {watchlist.map((stock) => (
                  <div
                    key={stock.id}
                    className={`group flex items-center rounded-xl border ${
                      activeStock?.symbol === stock.symbol
                        ? "bg-primary text-primary-foreground border-primary shadow-[0_0_15px] shadow-primary/20"
                        : "glass-button-premium text-muted-foreground border-white/10 hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    <button
                      onClick={() =>
                        setActiveStock({
                          symbol: stock.symbol,
                          name: stock.display_name,
                        })
                      }
                      className="px-3 py-2 text-xs font-bold whitespace-nowrap"
                    >
                      {stock.display_name} ({stock.symbol.split("-")[0]})
                    </button>
                    <button
                      onClick={() => removeStock(stock)}
                      className="px-2 py-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove from watchlist"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                {watchlist.length < 5 && (
                  <button
                    onClick={() => {
                      setSymbolPickerValue("");
                      setSelectedSymbol(null);
                      setAddDialogOpen(true);
                    }}
                    className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
                  >
                    Add
                  </button>
                )}
              </div>

              <div className="h-[400px] sm:h-[450px]">
                {activeStock && (
                  <YahooChartPanel
                    symbol={activeStock.symbol}
                    displayName={activeStock.name}
                  />
                )}
              </div>
            </div>

            {/* Add Stock Popup */}
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Add symbol to your watchlist</DialogTitle>
                  <DialogDescription>
                    Search legal symbols across stocks, crypto, forex,
                    commodities, and indices. Max 5 symbols.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <SymbolSearch
                    value={symbolPickerValue}
                    onValueChange={setSymbolPickerValue}
                    onSelectSymbol={(s) => setSelectedSymbol(s)}
                    placeholder="Search symbol (TSLA, BTC-USD, EURUSD, RELIANCE...)"
                  />
                  {selectedSymbol && (
                    <div className="text-xs text-muted-foreground rounded-lg border border-border p-2.5">
                      <span className="font-semibold text-foreground">
                        {selectedSymbol.symbol}
                      </span>
                      {" · "}
                      {selectedSymbol.description}
                      {" · "}
                      {selectedSymbol.exchange.toUpperCase()}
                      {" · "}
                      {selectedSymbol.type.toUpperCase()}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setAddDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={addStock}
                      disabled={!selectedSymbol || watchlist.length >= 5}
                    >
                      Add to Watchlist
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            
            {/* ALGO TRADE CTA */}
            <div className="bg-gradient-to-r from-card to-trading-dark border border-primary/20 hover:border-primary/40 rounded-2xl p-7 shadow-[0_0_40px] shadow-primary/5 relative overflow-hidden group transition-all duration-500 mt-2">
              <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-primary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex gap-5 w-full md:w-auto">
                  <div className="p-4 bg-card border border-border/80 rounded-2xl shrink-0 h-fit shadow-lg shadow-background/50 group-hover:border-primary/40 transition-colors">
                    <Bot className="h-7 w-7 text-primary" />
                  </div>
                  <div className="pt-0.5">
                    <h2 className="text-[22px] font-bold text-foreground tracking-tight">
                      Algo Trade
                    </h2>
                    <p className="text-[14px] text-muted-foreground mt-1.5 font-medium leading-relaxed max-w-xl">
                      Automate your strategy with AI-powered signals and dynamic
                      risk management rules designed for modern markets.
                    </p>
                  </div>
                </div>
                <Link
                  to={algoEntryPath}
                  className="shrink-0 w-full md:w-auto flex justify-center bg-primary text-primary-foreground px-8 h-[52px] items-center rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-[0_4px_16px_-4px_var(--primary)] group-hover:shadow-[0_8px_24px_-6px_var(--primary)] text-base glass-button-premium border-white/20"
                >
                  {!hasAlgoAccess
                    ? "Upgrade to Unlock →"
                    : isAlgoProvisioned
                      ? "Open Live Dashboard →"
                      : "Complete Algo Setup →"}
                </Link>
              </div>
            </div>

            {/* SECONDARY ROW — Past Analyses only for exception accounts; Paper Trade for analysis tier */}
            <div
              className={`grid grid-cols-1 gap-6 ${canSeePredictPast ? "md:grid-cols-2" : ""}`}
            >
              {canSeePredictPast && (
                <Link to="/predictions" className="block outline-none group">
                  <div className="glass-card-premium p-6 transition-all h-full flex flex-col justify-center shadow-md shadow-background/10 relative overflow-hidden hover:border-primary/30 group-hover:bg-white/10">
                    <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-secondary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2" />
                    <div className="relative z-[2] flex items-center gap-5">
                      <div className="p-3 bg-muted border border-border/50 rounded-xl shrink-0 group-hover:bg-muted/80 transition-colors shadow-sm">
                        <Activity className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="font-bold text-foreground text-[17px] tracking-tight">
                          Past Analyses
                        </p>
                        <p className="text-[13px] font-medium text-muted-foreground/80 mt-1">
                          Review your complete analysis history and AI performance.
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              )}
              <Link
                to={
                  hasAnalysisAccess
                    ? "/active-trades?tab=performance"
                    : "/pricing?feature=analysis"
                }
                className="block outline-none group"
              >
                <div
                  className={`glass-card-premium p-6 transition-all h-full flex flex-col justify-center shadow-md shadow-background/10 relative overflow-hidden ${
                    hasAnalysisAccess
                      ? "hover:border-primary/30 group-hover:bg-white/10"
                      : "opacity-80 border-dashed border-muted-foreground/25"
                  }`}
                >
                  <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-primary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
                  <div className="relative z-[2] flex items-center gap-5">
                    <div className="p-3 bg-muted border border-border/50 rounded-xl shrink-0 group-hover:bg-muted/80 transition-colors shadow-sm">
                      <BarChart3 className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-[17px] tracking-tight">
                        Paper Trade Performance
                        {!hasAnalysisAccess && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (Probability / Pro)
                          </span>
                        )}
                      </p>
                      <p className="text-[13px] font-medium text-muted-foreground/80 mt-1">
                        Analyze your trading performance, win rates, and P&L
                        stats.
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </div>

            {/* THIRD ROW (2 Col) */}
            <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
              <Link to="/news" className="block outline-none group">
                <div className="glass-card-premium p-6 hover:border-primary/30 transition-all h-full flex flex-col justify-center group-hover:bg-white/10 shadow-md shadow-background/10">
                  <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-primary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
                  <div className="relative z-[2] flex items-center gap-5">
                    <div className="p-3 bg-muted border border-border/50 rounded-xl shrink-0 group-hover:bg-muted/80 transition-colors shadow-sm">
                      <Newspaper className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-[17px] tracking-tight">
                        Latest News
                      </p>
                      <p className="text-[13px] font-medium text-muted-foreground/80 mt-1">
                        Get real-time market updates, IPO news, and global
                        signals.
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
              {/* <Link to="/tick-chart" className="block outline-none group">
                  <div className="glass-card-premium p-6 hover:border-primary/30 transition-all h-full flex flex-col justify-center group-hover:bg-white/10 shadow-md shadow-background/10">
                  <div className="absolute inset-0 w-[40%] h-[40%] blur-3xl bg-secondary opacity-50 transition-opacity duration-700 -translate-x-1/2 left-1/2 top-1/2"></div>
                     <div className="relative z-[2] flex items-center gap-5">
                        <div className="p-3 bg-muted border border-border/50 rounded-xl shrink-0 group-hover:bg-muted/80 transition-colors shadow-sm"><BarChart2 className="h-5 w-5 text-foreground/80 group-hover:text-primary transition-colors" /></div>
                        <div>
                           <p className="font-bold text-foreground text-[17px] tracking-tight">Live Tick Chart</p>
                           <p className="text-[13px] font-medium text-muted-foreground/80 mt-1">Monitor real-time order flow and footprint imbalances.</p>
                        </div>
                     </div>
                  </div>
               </Link> */}
            </div>


            {/* PLATFORM CAPABILITIES */}
            <div className="pt-2">
              <h3 className="text-xl font-bold text-foreground mb-5 tracking-tight px-1">
                Platform Capabilities
              </h3>
              <div className="glass-card-premium p-6 lg:p-8 shadow-md shadow-background/10 bg-gradient-to-tr from-transparent via-transparent to-primary/15">
                <div className="relative z-[2] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-8 xl:gap-6">
                  <div className="space-y-4">
                    <h4 className="font-bold text-primary flex items-center gap-2.5 text-[15px]">
                      <BrainCircuit className="h-[18px] w-[18px]" /> AI Analysis
                    </h4>
                    <ul className="space-y-2.5 text-muted-foreground/90 text-[13px] font-medium">
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Probability-based scoring
                      </li>
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Multi-timeframe forecasts
                      </li>
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Sentiment & news logic
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-bold text-primary flex items-center gap-2.5 text-[15px]">
                      <Activity className="h-[18px] w-[18px]" /> Trade Tracking
                    </h4>
                    <ul className="space-y-2.5 text-muted-foreground/90 text-[13px] font-medium">
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Real-time P&L calculations
                      </li>
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Automatic price updates
                      </li>
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Smart notifications
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-bold text-primary flex items-center gap-2.5 text-[15px]">
                      <ShieldCheck className="h-[18px] w-[18px]" /> Risk
                      Management
                    </h4>
                    <ul className="space-y-2.5 text-muted-foreground/90 text-[13px] font-medium">
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Auto stop-loss & take-profit
                      </li>
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Position sizing calculator
                      </li>
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Risk-adjusted alerts
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-bold text-primary flex items-center gap-2.5 text-[15px]">
                      <KeyRound className="h-[18px] w-[18px]" /> Personalization
                    </h4>
                    <ul className="space-y-2.5 text-muted-foreground/90 text-[13px] font-medium">
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Custom trading profiles
                      </li>
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Strategy-based logic
                      </li>
                      <li className="flex items-start gap-2.5">
                        <div className="w-[5px] h-[5px] rounded-full bg-primary/40 mt-[5px] shrink-0"></div>{" "}
                        Market hours detection
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="sticky top-4 z-10 w-full shrink-0 border-t xl:border-t-0 xl:border-l border-sidebar-border bg-sidebar xl:p-5 p-4 rounded-xl xl:rounded-none mt-0 xl:mt-0 max-h-full overflow-y-auto overflow-x-hidden flex flex-col min-h-0 self-start">
            {newsPanel}
          </aside>
        </div>
      </DashboardShellLayout>

      <TradingIntegrationModal
        open={showBrokerModal}
        onOpenChange={setShowBrokerModal}
        onSaved={() => refresh()}
        save={async (params) => save(params)}
      />
    </>
  );
}
