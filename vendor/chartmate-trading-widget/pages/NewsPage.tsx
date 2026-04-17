import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  MapPin,
  TrendingUp,
  Clock,
  Newspaper,
  AlertCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import logo from '../assets/logo.png';
import { DashboardShellLayout } from "@/components/layout/DashboardShellLayout";

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  image_url: string | null;
  region: string;
  category: string;
  impact_score: number;
  is_trending: boolean;
  published_at: string;
}

export default function NewsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("regional");
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRegion, setUserRegion] = useState<string>(localStorage.getItem("user_region") || "IN");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  /** True when the DB has no rows for `userRegion` and we are showing global market news instead. */
  const [regionalShowsGlobalFallback, setRegionalShowsGlobalFallback] = useState(false);
  const regionalFallbackRef = useRef(false);
  const ITEMS_PER_PAGE = 15;
  const LOAD_MORE_COUNT = 12;

  useEffect(() => {
    const initRegion = async () => {
      const region = await detectRegion();
      setUserRegion(region);
      localStorage.setItem("user_region", region);
    };
    initRegion();
  }, []);

  useEffect(() => {
    setPage(0);
    setNews([]);
    regionalFallbackRef.current = false;
    setRegionalShowsGlobalFallback(false);
    fetchNews(0);
  }, [activeTab, userRegion]);

  const detectRegion = async () => {
    try {
      const res = await fetch("https://ipapi.co/json/");
      const data = await res.json();
      if (data.country_code) return data.country_code;
      throw new Error("No country code");
    } catch (e) {
      console.warn("IP-based region detection failed, falling back to browser locale:", e);
      return navigator.language.split("-")[1]?.toUpperCase() || "IN";
    }
  };

  const fetchNews = async (pageNum: number) => {
    setLoading(true);
    try {
      const from = pageNum === 0 ? 0 : ITEMS_PER_PAGE + (pageNum - 1) * LOAD_MORE_COUNT;
      const to = pageNum === 0 ? ITEMS_PER_PAGE - 1 : from + LOAD_MORE_COUNT - 1;

      const buildBaseQuery = () => supabase.from("news" as any).select("*", { count: "exact" });

      let query = buildBaseQuery();

      if (activeTab === "trending") {
        query = query.eq("is_trending", true);
      } else if (activeTab === "regional") {
        const regionKey = regionalFallbackRef.current ? "GLOBAL" : userRegion;
        query = query.eq("region", regionKey);
      } else {
        query = query.eq("region", "GLOBAL");
      }

      let { data, error, count } = await query
        .order("published_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      let newArticles = (data as unknown as NewsArticle[]) || [];

      if (
        activeTab === "regional" &&
        !regionalFallbackRef.current &&
        pageNum === 0 &&
        newArticles.length === 0
      ) {
        regionalFallbackRef.current = true;
        setRegionalShowsGlobalFallback(true);
        const fbQuery = buildBaseQuery().eq("region", "GLOBAL");
        const fb = await fbQuery
          .order("published_at", { ascending: false })
          .range(from, to);
        if (fb.error) throw fb.error;
        newArticles = (fb.data as unknown as NewsArticle[]) || [];
        count = fb.count;
      } else if (activeTab === "regional" && pageNum === 0 && newArticles.length > 0) {
        regionalFallbackRef.current = false;
        setRegionalShowsGlobalFallback(false);
      }

      if (pageNum === 0) {
        setNews(newArticles);
      } else {
        setNews((prev) => [...prev, ...newArticles]);
      }

      setHasMore(count ? from + newArticles.length < count : false);
    } catch (error) {
      console.error("Error fetching news:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNews(nextPage);
  };

  const getImpactColor = (score: number) => {
    if (score >= 8) return "text-red-500 bg-red-500/10 border-red-500/20";
    if (score >= 5) return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
    return "text-blue-500 bg-blue-500/10 border-blue-500/20";
  };

  return (
    <DashboardShellLayout>
      <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="pt-10 lg:pt-0 flex items-center gap-4">
            <div className="flex items-center gap-2 max-lg:hidden">
              <h1 className="text-xl font-bold tracking-tight">Market News</h1>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPage(0);
              regionalFallbackRef.current = false;
              setRegionalShowsGlobalFallback(false);
              fetchNews(0);
            }}
            className="border-white/10 hover:bg-white/5 hidden sm:flex items-center gap-2"
          >
            <Clock className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <Tabs defaultValue="regional" className="space-y-4 sm:space-y-8" onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between flex-wrap gap-3">
            <div className="overflow-x-auto w-full sm:w-auto pb-1">
              <TabsList className="bg-muted/50 p-1 border border-white/5 min-w-max">
                <TabsTrigger value="trending" className="gap-1.5 px-3 sm:px-6 text-xs sm:text-sm">
                  <TrendingUp className="h-3.5 w-3.5" /> Trending
                </TabsTrigger>
                <TabsTrigger value="regional" className="gap-1.5 px-3 sm:px-6 text-xs sm:text-sm">
                  <MapPin className="h-3.5 w-3.5" /> Regional ({userRegion})
                </TabsTrigger>
                <TabsTrigger value="global" className="gap-1.5 px-3 sm:px-6 text-xs sm:text-sm">
                  <Globe className="h-3.5 w-3.5" /> Global
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border border-white/5 self-start sm:self-auto">
              <TrendingUp className="h-3 w-3 text-primary" />
              AI Impact Scoring Active
            </div>
          </div>

          <TabsContent value="trending" className="mt-0">
            <NewsGrid articles={news} loading={loading && page === 0} />
          </TabsContent>
          <TabsContent value="regional" className="mt-0 space-y-3">
            {regionalShowsGlobalFallback ? (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
                No market articles are tagged for <span className="font-semibold">{userRegion}</span> yet.
                Showing <span className="font-semibold">global</span> headlines until the next news sync adds your region.
              </p>
            ) : null}
            <NewsGrid articles={news} loading={loading && page === 0} />
          </TabsContent>
          <TabsContent value="global" className="mt-0">
            <NewsGrid articles={news} loading={loading && page === 0} />
          </TabsContent>
        </Tabs>

        {hasMore && (
          <div className="mt-8 sm:mt-12 flex justify-center">
            <Button
              variant="outline"
              size="lg"
              onClick={handleLoadMore}
              disabled={loading}
              className="px-8 sm:px-12 border-white/10 hover:bg-white/5 transition-all"
            >
              {loading ? "Loading..." : "Load More Articles"}
            </Button>
          </div>
        )}
      </main>
    </div>
    </DashboardShellLayout>
  );
}

function NewsGrid({ articles, loading }: { articles: NewsArticle[], loading: boolean }) {
  const navigate = useNavigate();
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-[280px] sm:h-[300px] rounded-xl bg-muted/20 animate-pulse border border-white/5" />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <Card className="border-dashed border-white/10 bg-white/2 py-20 text-center">
        <CardContent className="space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">No news articles found</p>
            <p className="text-sm text-muted-foreground">We're currently aggregating latest market signals. Check back soon.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {articles.map((article) => (
        <Card
          key={article.id}
          className="minimal-panel group hover:bg-white/[0.03] transition-all duration-300 flex flex-col h-full border-white/5 overflow-hidden"
        >
          <CardHeader className="p-0 relative h-48 overflow-hidden">
            {article.image_url ? (
              <img
                src={article.image_url}
                alt=""
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div className="w-full h-full bg-muted/30 flex items-center justify-center group-hover:bg-muted/40 transition-colors">
                <Newspaper className="h-12 w-12 text-white/10" />
              </div>
            )}
            <div className="absolute top-3 left-3 flex flex-wrap gap-2">

              {article.is_trending && (
                <Badge className="bg-primary/90 text-primary-foreground text-[10px] gap-1 px-2">
                  <TrendingUp className="h-3 w-3" /> Trending
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-5 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className={`text-[10px] px-2 py-0 h-5 font-semibold ${article.impact_score >= 8 ? 'text-red-500 border-red-500/20' :
                  article.impact_score >= 5 ? 'text-yellow-500 border-yellow-500/20' :
                    'text-blue-500 border-blue-500/20'
                }`}>
                IMPACT {article.impact_score}/10
              </Badge>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(article.published_at))} ago
              </span>
            </div>

            <h3 className="font-bold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors leading-snug">
              {article.title}
            </h3>

            <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
              {article.summary}
            </p>

            {/* Affected Symbols & Sentiment */}
            {(article as any).affected_symbols?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(article as any).affected_symbols.map((symbol: string) => (
                  <Badge key={symbol} variant="outline" className="text-[9px] bg-primary/5 border-primary/10 text-primary uppercase">
                    ${symbol}
                  </Badge>
                ))}
                {(article as any).sentiment && (
                  <Badge variant="outline" className={`text-[9px] uppercase ${(article as any).sentiment === 'positive' ? 'text-green-500 border-green-500/20' : (article as any).sentiment === 'negative' ? 'text-red-500 border-red-500/20' : 'text-zinc-500 border-zinc-500/20'}`}>
                    {(article as any).sentiment}
                  </Badge>
                )}
              </div>
            )}

            <Button
              size="sm"
              className="w-full bg-white/5 hover:bg-white/10 border-white/5 text-xs gap-2 group/btn"
              onClick={() => navigate(`/news/${article.id}`)}
            >
              Read Full Article
              <ExternalLink className="h-3 w-3 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
