import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock } from "lucide-react";
import {
  buildFaqSchema,
  cleanBlogContentHtml,
  ensureArrayStrings,
  ensureFaqItems,
  ensureSourceItems,
  type FaqItem,
  type SourceItem,
} from "@/lib/blogSeo";

interface Blog {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  author_image_url: string | null;
  published_at: string | null;
  created_at: string;
  content_html: string | null;
  category: string | null;
  read_time: string | null;
  primary_keyword: string | null;
  meta_description: string | null;
  key_takeaways: string[];
  faq_items: FaqItem[];
  external_sources: SourceItem[];
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function sourceLabel(source: SourceItem) {
  if (source.title?.trim() && source.title.trim().toLowerCase() !== "source") return source.title.trim();
  try {
    const host = new URL(source.url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return source.url;
  }
}

export default function BlogDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [blog, setBlog] = useState<Blog | null>(null);
  const [loading, setLoading] = useState(true);
  const cleanedContentHtml = cleanBlogContentHtml(blog?.content_html || "");

  useEffect(() => {
    const load = async () => {
      if (!slug) {
        setBlog(null);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        // Try by slug first (what cards use), then fall back to id
        let { data, error } = await supabase
          .from("blogs")
          .select("*")
          .eq("slug", slug)
          .eq("is_published", true)
          .maybeSingle();

        if (!data && !error) {
          const byId = await supabase
            .from("blogs")
            .select("*")
            .eq("id", slug)
            .eq("is_published", true)
            .maybeSingle();
          data = byId.data;
          error = byId.error;
        }

        if (error) throw error;
        const raw = (data as Record<string, unknown> | null) ?? null;
        setBlog(
          raw
            ? {
                ...raw,
                key_takeaways: ensureArrayStrings(raw.key_takeaways),
                faq_items: ensureFaqItems(raw.faq_items),
                external_sources: ensureSourceItems(raw.external_sources),
              }
            : null,
        );
      } catch (e) {
        console.error("Failed to load blog", e);
        setBlog(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {blog && (
        <Helmet>
          <title>{blog.title} | TradingSmart.ai</title>
          <meta name="description" content={blog.meta_description || blog.subtitle || blog.title} />
          {blog.faq_items.filter((item) => item.question && item.answer).length > 0 && (
            <script type="application/ld+json">{JSON.stringify(buildFaqSchema(blog.faq_items))}</script>
          )}
        </Helmet>
      )}
      {/* Sticky nav */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/blogs">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-white hover:bg-white/5">
              <ArrowLeft className="h-4 w-4" />
              Back to Insights
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            {blog?.read_time && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-white/5 px-3 py-1 rounded-full border border-white/5">
                <Clock className="h-3 w-3" />
                {blog.read_time}
              </span>
            )}
            {blog?.category && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-widest border-primary/20 text-primary bg-primary/5">
                {blog.category}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="max-w-4xl mx-auto px-6 py-20 space-y-8 animate-pulse">
          <div className="h-12 bg-white/5 rounded-lg w-3/4" />
          <div className="h-6 bg-white/5 rounded-lg w-1/3" />
          <div className="h-[400px] bg-white/5 rounded-2xl border border-white/5" />
          <div className="space-y-4">
            <div className="h-4 bg-white/5 rounded w-full" />
            <div className="h-4 bg-white/5 rounded w-full" />
            <div className="h-4 bg-white/5 rounded w-5/6" />
          </div>
        </div>
      )}

      {!loading && !blog && (
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 mb-6">
            <ArrowLeft className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Article not found</h2>
          <p className="text-muted-foreground mb-8">This article could not be found or is no longer published.</p>
          <Link to="/blogs">
            <Button variant="outline" className="border-white/10 hover:bg-white/5 text-white">
              Return to Insights
            </Button>
          </Link>
        </div>
      )}

      {blog && (
        <article>
          {/* Header section */}
          <div className="max-w-4xl mx-auto px-6 pt-12 pb-8">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-8 text-white">
              {blog.title}
            </h1>

            {/* Author row */}
            <div className="flex items-center gap-4 pb-8 border-b border-white/10">
              {blog.author_image_url ? (
                <img
                  src={blog.author_image_url}
                  alt={blog.author_name || "Author"}
                  className="h-12 w-12 rounded-full object-cover border-2 border-background ring-2 ring-white/10"
                />
              ) : (
                <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-lg font-bold text-primary">
                  {(blog.author_name || "T").charAt(0)}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold leading-tight text-white">{blog.author_name || "Trading Smart Team"}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(blog.published_at || blog.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Full-bleed featured image */}
          {blog.cover_image_url && (
            <div className="w-full max-w-6xl mx-auto px-0 md:px-6 mb-12">
              <div className="relative aspect-video md:aspect-[21/9] overflow-hidden md:rounded-3xl bg-zinc-900 border border-white/5 shadow-2xl">
                <img
                  src={blog.cover_image_url}
                  alt={blog.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none" />
              </div>
            </div>
          )}

          {/* Content body */}
          <div className="max-w-3xl mx-auto px-6 pb-32">
            {blog.key_takeaways.length > 0 && (
              <section className="mb-10 rounded-2xl border border-primary/20 bg-primary/5 p-6">
                <h2 className="text-lg font-semibold text-white mb-3">Key Takeaways</h2>
                <ul className="list-disc pl-5 text-zinc-300 space-y-2">
                  {blog.key_takeaways.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
            {blog.subtitle && (
              <p className="text-xl md:text-2xl text-zinc-300 leading-relaxed mb-12 font-medium border-l-4 border-primary/50 pl-6 py-1">
                {blog.subtitle}
              </p>
            )}

            <div
              className="
                prose prose-invert max-w-none text-lg leading-relaxed
                prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-white
                prose-h1:text-3xl prose-h1:mt-12 prose-h1:mb-6
                prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4
                prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-zinc-300 prose-p:mt-0 prose-p:mb-8 prose-p:leading-8
                prose-li:text-zinc-300 prose-li:my-2
                prose-strong:text-white prose-strong:font-semibold
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline hover:prose-a:text-primary/80 transition-colors
                prose-blockquote:border-l-primary prose-blockquote:bg-white/5 prose-blockquote:py-2 prose-blockquote:px-6 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:text-zinc-400
                prose-img:rounded-2xl prose-img:border prose-img:border-white/10 prose-img:shadow-xl prose-img:my-10
                prose-hr:border-white/10 prose-hr:my-12
                prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
                prose-table:w-full prose-table:my-8 prose-table:border-collapse
                prose-th:border prose-th:border-white/30 prose-th:bg-white/10 prose-th:text-white prose-th:px-4 prose-th:py-2
                prose-td:border prose-td:border-white/20 prose-td:px-4 prose-td:py-2 prose-td:text-zinc-300
              "
              dangerouslySetInnerHTML={{ __html: cleanedContentHtml }}
            />
            <style>{`
              .ts-blog-table {
                width: 100%;
                border-collapse: collapse;
                margin: 2rem 0;
                border: 1px solid rgba(255,255,255,0.3);
              }
              .ts-blog-th, .ts-blog-td {
                border: 1px solid rgba(255,255,255,0.22);
                padding: 10px 12px;
                vertical-align: top;
              }
              .ts-blog-th {
                background: rgba(255,255,255,0.08);
                font-weight: 700;
              }
            `}</style>

            {blog.external_sources.length > 0 && (
              <section className="mt-14">
                <h2 className="text-2xl font-bold text-white mb-4">Sources</h2>
                <ul className="space-y-2 text-sm">
                  {blog.external_sources.map((source, index) => (
                    <li key={`${source.url}-${index}`} className="leading-relaxed break-all text-zinc-300">
                      <a href={source.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
                        {index + 1}. {sourceLabel(source)}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {blog.faq_items.length > 0 && (
              <section className="mt-14">
                <h2 className="text-2xl font-bold text-white mb-4">FAQ</h2>
                <div className="space-y-4">
                  {blog.faq_items.map((faq, index) => (
                    <div key={`${faq.question}-${index}`} className="rounded-xl border border-white/10 p-4 bg-white/5">
                      <h3 className="text-lg font-semibold text-white">{faq.question}</h3>
                      <p className="mt-2 text-zinc-300">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </article>
      )}
    </div>
  );
}
