export interface FaqItem {
  question: string;
  answer: string;
}

export interface SourceItem {
  title: string;
  url: string;
}

export interface BlogSeoData {
  title: string;
  primary_keyword: string | null;
  meta_description: string | null;
  key_takeaways: string[];
  faq_items: FaqItem[];
  external_sources: SourceItem[];
  content_html: string | null;
}

export interface ComplianceCheck {
  key: string;
  label: string;
  passed: boolean;
  details?: string;
}

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

export const stripHtml = (html: string) =>
  html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const cleanBlogContentHtml = (html: string) => {
  if (!html) return "";

  let cleaned = html;

  // Remove JSON-LD script blocks accidentally pasted into article body.
  cleaned = cleaned
    .replace(/&lt;script[^>]*application\/ld\+json[^]*?&lt;\/script&gt;/gi, "")
    .replace(/<script[^>]*application\/ld\+json[^]*?<\/script>/gi, "")
    .replace(/&lt;meta[^&]*&gt;/gi, "")
    .replace(/<meta[^>]*>/gi, "");

  // Remove common conversion noise from DOCX imports.
  cleaned = cleaned.replace(/<p>\s*xml\s*<\/p>/gi, "");

  // Remove embedded/screenshot images from imported docs (often logos/screenshots).
  cleaned = cleaned
    .replace(/<img[^>]*src=["']data:image\/[^"']+["'][^>]*>/gi, "")
    .replace(/<img[^>]*(?:logo|screenshot|perplexity)[^>]*>/gi, "");

  // Remove citation markers like [1], [2][3] for cleaner reading flow.
  cleaned = cleaned.replace(/(?:\[\d+\]){1,}/g, "");

  // Remove empty footnote anchors/superscripts left by docs conversion.
  cleaned = cleaned
    .replace(/<a[^>]*href=["']#fn\d+["'][^>]*>\s*<sup>\s*<\/sup>\s*<\/a>/gi, "")
    .replace(/<a[^>]*id=["']fnref[^"']*["'][^>]*>\s*<\/a>/gi, "");

  // Remove lines that are only raw URLs or bullets/stars; sources are rendered in a dedicated section.
  cleaned = cleaned
    .replace(/<p>\s*[*]+\s*<\/p>/gi, "")
    .replace(/<p>\s*(?:[-*]\s*)?https?:\/\/[^<\s]+\/?\s*<\/p>/gi, "")
    .replace(/<li>\s*(?:[-*]\s*)?https?:\/\/[^<\s]+\/?\s*<\/li>/gi, "");

  // Convert paragraph-level strong titles into semantic headings for better spacing and readability.
  cleaned = cleaned.replace(
    /<p>\s*(?:<a[^>]*><\/a>\s*)?<strong>([^<]{3,120})<\/strong>\s*<\/p>/gi,
    (_match, headingText: string) => {
      const text = (headingText || "").trim();
      if (!text) return "";
      if (text.endsWith("?")) return `<h3>${text}</h3>`;
      if (/^(key takeaways|sources|faq|manual trading vs|what is|algo trading india)/i.test(text)) return `<h2>${text}</h2>`;
      return `<h3>${text}</h3>`;
    },
  );

  // Make tables visibly tabular with explicit classes.
  cleaned = cleaned
    .replace(/<table>/gi, '<table class="ts-blog-table">')
    .replace(/<tr>/gi, '<tr class="ts-blog-tr">')
    .replace(/<th>/gi, '<th class="ts-blog-th">')
    .replace(/<td>/gi, '<td class="ts-blog-td">');

  // Linkify remaining bare URLs in paragraphs.
  cleaned = cleaned.replace(
    /(^|[\s>])(https?:\/\/[^\s<]+)/g,
    '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>',
  );

  // Collapse empty paragraph/list artifacts after cleanup.
  cleaned = cleaned
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/<li>\s*<\/li>/gi, "")
    .replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
};

export const truncateToExactLength = (text: string, target = 155) => {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (normalized.length === target) return normalized;
  if (normalized.length > target) return normalized.slice(0, target).trimEnd();
  return `${normalized}${" ".repeat(target - normalized.length)}`;
};

export const ensureArrayStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

export const ensureFaqItems = (value: unknown): FaqItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const question = typeof record.question === "string" ? record.question.trim() : "";
      const answer = typeof record.answer === "string" ? record.answer.trim() : "";
      return question || answer ? { question, answer } : null;
    })
    .filter(Boolean) as FaqItem[];
};

export const ensureSourceItems = (value: unknown): SourceItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const url = typeof record.url === "string" ? record.url.trim() : "";
      return title || url ? { title, url } : null;
    })
    .filter(Boolean) as SourceItem[];
};

const hasNumberedProcess = (html: string, text: string) => {
  const orderedLists = Array.from(html.matchAll(/<ol[^>]*>([\s\S]*?)<\/ol>/gi)).map((m) => m[1] || "");
  const hasLongOrderedList = orderedLists.some((ol) => {
    const liCount = (ol.match(/<li[\s>]/gi) || []).length;
    return liCount >= 4;
  });
  if (hasLongOrderedList) return true;
  return /(1\.\s.+\n2\.\s.+\n3\.\s.+\n4\.\s+)/is.test(text);
};

const hasDefinitionSentences = (text: string) => {
  const sentences = text.split(/[.!?]/).map((s) => s.trim()).filter(Boolean);
  const definitions = sentences.filter((s) => /\bis\b/i.test(s) && s.split(/\s+/).length >= 6);
  return definitions.length >= 3;
};

export function evaluateCompliance(input: BlogSeoData): ComplianceCheck[] {
  const html = input.content_html || "";
  const contentText = stripHtml(html);
  const words = contentText.split(/\s+/).filter(Boolean);
  const first100 = words.slice(0, 100).join(" ").toLowerCase();
  const keyword = (input.primary_keyword || "").trim().toLowerCase();
  const faqComplete = input.faq_items.filter((f) => f.question.trim() && f.answer.trim());
  const sourceComplete = input.external_sources.filter((s) => s.title.trim() && s.url.trim());
  const hasFaqKeyword = /<h2[^>]*>\s*faq\s*<\/h2>/i.test(html) || /faq/i.test(contentText);
  const hasTable = /<table[\s>]/i.test(html);
  const hasNamedSourceCitation =
    /\b(sebi|nse|moneycontrol|angelone|icicidirect|groww|quantinsti|screener)\b/i.test(contentText);

  const checks: ComplianceCheck[] = [
    {
      key: "keyword-first-100",
      label: "Primary keyword appears in first 100 words",
      passed: !!keyword && first100.includes(keyword),
      details: keyword ? `Keyword: ${input.primary_keyword}` : "Primary keyword is missing",
    },
    {
      key: "meta-155",
      label: "Meta description is exactly 155 characters",
      passed: (input.meta_description || "").length === 155,
      details: `Current length: ${(input.meta_description || "").length}`,
    },
    {
      key: "faq-min-5",
      label: "FAQ has minimum 5 matching question/answer pairs",
      passed: faqComplete.length >= 5,
      details: `Found ${faqComplete.length} valid FAQ items`,
    },
    {
      key: "faq-visible",
      label: "FAQ section exists in visible content",
      passed: hasFaqKeyword,
    },
    {
      key: "key-takeaways",
      label: "Key Takeaways box has 5 points",
      passed: input.key_takeaways.filter((k) => k.trim()).length >= 5,
    },
    {
      key: "definitions",
      label: "Contains one-sentence definitions for key concepts",
      passed: hasDefinitionSentences(contentText),
    },
    {
      key: "numbered-process",
      label: "Contains numbered list for process (4+ steps)",
      passed: hasNumberedProcess(html, contentText),
    },
    {
      key: "comparison-table",
      label: "Contains at least one comparison table",
      passed: hasTable,
    },
    {
      key: "sources",
      label: "Includes external authoritative sources",
      passed: sourceComplete.length >= 1 || hasNamedSourceCitation,
      details: `Structured sources: ${sourceComplete.length}`,
    },
  ];

  return checks;
}

export const getFailedCompliance = (checks: ComplianceCheck[]) => checks.filter((c) => !c.passed);

export const buildFaqSchema = (faqItems: FaqItem[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems
    .filter((item) => item.question.trim() && item.answer.trim())
    .map((item) => ({
      "@type": "Question",
      name: item.question.trim(),
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer.trim(),
      },
    })),
});
