import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock } from "lucide-react";

interface BlogSummary {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  author_image_url: string | null;
  published_at: string | null;
  created_at: string;
  category: string | null;
  read_time: string | null;
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function BlogCard({ b }: { b: BlogSummary }) {
  const href = `/blogs/${b.slug || b.id}`;
  return (
    <Link to={href} className="group block h-full">
      <div className="glass-panel rounded-2xl overflow-hidden hover:border-primary/40 transition-all duration-300 hover:shadow-[0_0_30px_rgba(20,184,166,0.1)] hover:-translate-y-1 h-full flex flex-col">
        {/* Image */}
        <div className="relative h-52 overflow-hidden bg-zinc-900/50 flex-shrink-0">
          {b.cover_image_url ? (
            <img
              src={b.cover_image_url}
              alt={b.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/10 to-transparent flex items-center justify-center">
              <span className="text-4xl font-bold text-primary/20">{b.title.charAt(0)}</span>
            </div>
          )}
          {/* Category badge overlay */}
          {b.category && (
            <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-md border border-white/10 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
              {b.category}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex flex-col flex-1 p-6 gap-4">
          <h2 className="text-xl font-bold leading-tight line-clamp-2 group-hover:text-primary transition-colors text-white">
            {b.title}
          </h2>
          {b.subtitle && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {b.subtitle}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-4 border-t border-white/5">
            <div className="flex items-center gap-2.5">
              {b.author_image_url ? (
                <img
                  src={b.author_image_url}
                  alt={b.author_name || "Author"}
                  className="h-8 w-8 rounded-full object-cover border border-white/10"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {(b.author_name || "T").charAt(0)}
                </div>
              )}
              <div>
                <p className="text-xs font-medium leading-tight text-zinc-300">{b.author_name || "Trading Smart"}</p>
                <p className="text-[10px] text-muted-foreground">{formatDate(b.published_at || b.created_at)}</p>
              </div>
            </div>
            {b.read_time && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-white/5 px-2 py-1 rounded-full">
                <Clock className="h-3 w-3" />
                {b.read_time}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<BlogSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("blogs")
          .select("id, slug, title, subtitle, cover_image_url, author_name, author_image_url, published_at, created_at, category, read_time")
          .eq("is_published", true)
          .order("published_at", { ascending: false });
        if (error) throw error;
        setBlogs((data as any[]) || []);
      } catch (e) {
        console.error("Failed to load blogs", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm" className="hover:bg-white/5 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Home
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="container mx-auto px-4 pt-12 pb-8 text-center max-w-3xl">
        <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium uppercase tracking-widest mb-6">
          Insights
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-gradient !pb-2">
          Market Insights &amp; Research
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Deep dives into AI prediction models, market sentiment, and quantitative trading strategies.
        </p>
      </div>

      <div className="container mx-auto px-4 pb-20">
        {loading && (
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white/5 border border-white/5 h-[420px] animate-pulse" />
            ))}
          </div>
        )}

        {!loading && blogs.length === 0 && (
          <div className="text-center py-24 border border-dashed border-white/10 rounded-2xl bg-white/5">
            <p className="text-muted-foreground">No articles published yet. Check back soon.</p>
          </div>
        )}

        {!loading && blogs.length > 0 && (
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {blogs.map((b) => (
              <BlogCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
