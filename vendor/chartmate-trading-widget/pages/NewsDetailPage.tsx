import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Clock,
  Share2,
  Bookmark,
  MessageSquare,
  ThumbsUp,
  ExternalLink,
  ChevronRight,
  Loader2,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ArticleMetadata {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  image_url: string | null;
  region: string;
  category: string;
  published_at: string;
  sentiment?: string;
  affected_symbols?: string[];
}

interface ArticleContent {
  title: string;
  content: string;
  author?: string;
  date?: string;
}

export default function NewsDetailPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();
  const [metadata, setMetadata] = useState<ArticleMetadata | null>(null);
  const [content, setContent] = useState<ArticleContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relatedNews, setRelatedNews] = useState<ArticleMetadata[]>([]);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      const currentScroll = window.scrollY;
      setScrollProgress((currentScroll / totalScroll) * 100);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (articleId) {
      fetchArticleData();
    }
  }, [articleId]);

  const fetchArticleData = async () => {
    setLoading(true);
    setContentLoading(true);
    setError(null);
    try {
      // 1. Fetch metadata from Supabase
      const { data: meta, error: metaError } = await (supabase as any)
        .from("news")
        .select("*")
        .eq("id", articleId)
        .single();

      if (metaError) throw metaError;
      const articleMeta = meta as ArticleMetadata;
      setMetadata(articleMeta);
      setLoading(false);

      // Check if content is already cached in metadata
      if ((meta as any).full_content) {
        setContent({
          title: articleMeta.title,
          content: (meta as any).full_content,
          author: (meta as any).author
        });
        setContentLoading(false);
      }

      // 2. Fetch related news
      const { data: related } = await (supabase as any)
        .from("news")
        .select("*")
        .eq("category", articleMeta.category)
        .neq("id", articleId)
        .limit(5);

      setRelatedNews((related as ArticleMetadata[]) || []);

      // 3. Fetch full content from Edge Function if not cached
      if (!(meta as any).full_content) {
        console.log(`Invoking get-article-content for URL: ${articleMeta.url}`);
        const { data: extraction, error: extractionError } = await supabase.functions.invoke('get-article-content', {
          body: {
            url: articleMeta.url,
            articleId: articleId
          }
        });

        if (extractionError) {
          console.error("Extraction error log:", extractionError);
          setError("Failed to generate content preview.");
          throw extractionError;
        }

        if (extraction?.error) {
          setError(extraction.error);
        } else {
          setContent(extraction as ArticleContent);
        }
      }

    } catch (e: any) {
      console.error("Failed to fetch article:", e);
      setError(e.message || "Failed to load article content.");
    } finally {
      setContentLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black p-4 text-center">
        <h1 className="text-2xl font-bold mb-4">Article Not Found</h1>
        <Button onClick={() => navigate("/news")}>Back to News Feed</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-slate-200 selection:bg-primary/30">
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 w-full h-1 z-50 bg-white/5">
        <div
          className="h-full bg-primary transition-all duration-100 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Header / Nav */}
      <nav className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white gap-2 transition-colors"
            onClick={() => navigate("/news")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

        <div className="hidden sm:flex items-center gap-4">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white transition-colors">
                <Share2 className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white transition-colors">
                <Bookmark className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </nav>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-12">
          {/* Main Content Area */}
          <div className="lg:col-span-8">
            <article>
              {/* Category & Tags */}
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 rounded-full px-4 py-1 text-xs font-semibold tracking-wide uppercase">
                  {metadata.category}
                </Badge>
                {metadata.sentiment && (
                  <Badge className={`${metadata.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                    metadata.sentiment === 'negative' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                      'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    } rounded-full px-4 py-1 text-xs font-medium`}>
                    {metadata.sentiment.toUpperCase()}
                  </Badge>
                )}
                <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium ml-auto">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDistanceToNow(new Date(metadata.published_at), { addSuffix: true })}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.15] sm:leading-[1.1] mb-5 sm:mb-8 tracking-tight">
                {metadata.title}
              </h1>

              {/* Author/Source Info */}
              <div className="flex items-center gap-3 mb-6 sm:mb-10 pb-5 sm:pb-8 border-b border-white/5">
                <div className="h-9 w-9 sm:h-12 sm:w-12 rounded-full bg-gradient-to-br from-primary to-primary-foreground flex items-center justify-center text-white font-bold text-sm sm:text-lg shadow-lg shadow-primary/20 shrink-0">
                  {metadata.source[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">{metadata.source}</p>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-medium">Verified Aggregator</p>
                </div>
                <div className="ml-auto flex gap-2 shrink-0">
                  <Badge variant="outline" className="border-white/10 text-slate-400 rounded-lg px-2 sm:px-3 py-1 bg-white/[0.02] text-[10px] sm:text-xs">
                    {metadata.region}
                  </Badge>
                </div>
              </div>

              {/* Cover Image */}
              {metadata.image_url && (
                <div className="relative aspect-[16/9] sm:aspect-[21/9] mb-6 sm:mb-12 rounded-2xl sm:rounded-3xl overflow-hidden group shadow-2xl shadow-black">
                  <img
                    src={metadata.image_url}
                    alt={metadata.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}

              {/* AI Extracted Content or Error */}
              <div className="prose prose-invert prose-base sm:prose-xl max-w-none prose-slate prose-headings:text-white prose-p:text-slate-300 prose-p:leading-relaxed prose-li:text-slate-300">
                {contentLoading ? (
                  <div className="space-y-6">
                    <div className="h-4 w-full bg-white/5 rounded-full animate-pulse" />
                    <div className="h-4 w-5/6 bg-white/5 rounded-full animate-pulse delay-75" />
                    <div className="h-4 w-4/6 bg-white/5 rounded-full animate-pulse delay-150" />
                    <div className="h-8 w-1/4 bg-white/5 rounded-2xl animate-pulse mt-12 mb-8" />
                    <div className="h-4 w-full bg-white/5 rounded-full animate-pulse delay-300" />
                    <div className="h-4 w-11/12 bg-white/5 rounded-full animate-pulse delay-500" />
                  </div>
                ) : error ? (
                  <Card className="bg-rose-500/5 border-rose-500/10 rounded-2xl p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
                      <AlertCircle className="h-6 w-6 text-rose-500" />
                    </div>
                    <h3 className="text-white font-bold text-lg mb-2">Content Unavailable</h3>
                    <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                      We were unable to extract the full content for this article. This can happen with some news sources that have high security or subscription walls.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button
                        variant="ghost"
                        className="text-slate-300 hover:text-white hover:bg-white/5 rounded-xl px-6"
                        onClick={() => window.open(metadata.url, '_blank')}
                      >
                        Open Original Site
                      </Button>
                      <Button
                        className="bg-primary hover:bg-primary/90 text-white font-bold rounded-xl px-8"
                        onClick={fetchArticleData}
                      >
                        Try Again
                      </Button>
                    </div>
                  </Card>
                ) : content ? (
                  <div dangerouslySetInnerHTML={{ __html: content.content }} className="article-body-content" />
                ) : (
                  <p className="text-slate-400 italic bg-white/5 p-6 rounded-2xl border border-white/5">
                    We're currently generating a high-quality summary and full analysis for this article. Please check back in a few seconds.
                  </p>
                )}
              </div>

              {/* Affected symbols if any */}
              {metadata.affected_symbols && metadata.affected_symbols.length > 0 && (
                <div className="mt-16 pt-10 border-t border-white/5">
                  <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Affected Assets
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {metadata.affected_symbols.map((symbol) => (
                      <Badge
                        key={symbol}
                        className="bg-primary/5 hover:bg-primary/10 text-primary border-primary/20 px-5 py-2.5 rounded-xl cursor-default transition-all hover:-translate-y-1"
                      >
                        ${symbol}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </div>

          {/* Sidebar - Related News */}
          <aside className="lg:col-span-4 space-y-10">
            <div className="lg:sticky lg:top-28">
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl sm:rounded-3xl p-5 sm:p-8 backdrop-blur-sm">
                <h3 className="text-base sm:text-lg font-black text-white mb-5 sm:mb-8 tracking-tight flex items-center justify-between">
                  Related Analysis
                  <ChevronRight className="h-5 w-5 text-primary" />
                </h3>
                <div className="space-y-5 sm:space-y-8">
                  {relatedNews.length > 0 ? relatedNews.map((article) => (
                    <div
                      key={article.id}
                      className="group cursor-pointer"
                      onClick={() => {
                        window.scrollTo(0, 0);
                        navigate(`/news/${article.id}`);
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {article.category}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {formatDistanceToNow(new Date(article.published_at))} ago
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white leading-relaxed group-hover:text-primary transition-colors line-clamp-2">
                        {article.title}
                      </h4>
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 group-hover:text-slate-300 transition-colors">
                        {article.source}
                        <ArrowLeft className="h-3 w-3 rotate-180 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-slate-500 italic">No related articles found.</p>
                  )}
                </div>
              </div>

            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-white/5 py-12 text-center">
        <div className="max-w-7xl mx-auto px-4">
          <p className="text-xs text-slate-600 font-medium tracking-widest uppercase">
            © 2026 Chartmate Trading AI • Advanced Financial Intelligence
          </p>
        </div>
      </footer>

      <style>{`
        .article-body-content p {
          margin-bottom: 1.5rem;
          line-height: 1.8;
          color: #cbd5e1;
          font-size: 1rem;
        }
        @media (min-width: 640px) {
          .article-body-content p {
            margin-bottom: 2.5rem;
            font-size: 1.25rem;
          }
        }
        .article-body-content h2, .article-body-content h3 {
          margin-top: 2rem;
          margin-bottom: 1rem;
          font-weight: 800;
          color: white;
          letter-spacing: -0.02em;
        }
        @media (min-width: 640px) {
          .article-body-content h2, .article-body-content h3 {
            margin-top: 3rem;
            margin-bottom: 1.5rem;
          }
        }
        .article-body-content ul {
          margin-bottom: 2rem;
          padding-left: 1.5rem;
        }
        .article-body-content li {
          margin-bottom: 1rem;
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
