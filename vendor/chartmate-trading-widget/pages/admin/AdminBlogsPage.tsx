import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mammoth from "mammoth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Loader2,
  PlusCircle,
  Trash2,
  Save,
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Upload,
  ChevronDown,
} from "lucide-react";
import {
  buildFaqSchema,
  cleanBlogContentHtml,
  ensureArrayStrings,
  ensureFaqItems,
  ensureSourceItems,
  evaluateCompliance,
  getFailedCompliance,
  type ComplianceCheck,
  type FaqItem,
  type SourceItem,
} from "@/lib/blogSeo";

const BLOCK_OPTIONS = [
  { label: "Normal", tag: "p" },
  { label: "Heading 1", tag: "h1" },
  { label: "Heading 2", tag: "h2" },
  { label: "Heading 3", tag: "h3" },
  { label: "Heading 4", tag: "h4" },
  { label: "Quote", tag: "blockquote" },
];

interface BlogRow {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  author_image_url: string | null;
  content_html: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  category: string | null;
  read_time: string | null;
  primary_keyword: string | null;
  meta_description: string | null;
  key_takeaways: string[];
  faq_items: FaqItem[];
  external_sources: SourceItem[];
}

const slugify = (v: string) =>
  v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const EMPTY_BLOG: BlogRow = {
  id: "",
  slug: "",
  title: "",
  subtitle: "",
  cover_image_url: "",
  author_name: "Trading Smart",
  author_image_url: "",
  content_html: "",
  is_published: false,
  published_at: null,
  created_at: "",
  category: "Trading",
  read_time: "5 min read",
  primary_keyword: "",
  meta_description: "",
  key_takeaways: ["", "", "", "", ""],
  faq_items: Array.from({ length: 5 }, () => ({ question: "", answer: "" })),
  external_sources: [{ title: "", url: "" }],
};

function formatDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableRows: string[][] = [];

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  const flushTable = () => {
    if (!inTable || tableRows.length < 2) return;
    const [header, ...rows] = tableRows;
    out.push("<table><thead><tr>");
    header.forEach((h) => out.push(`<th>${h}</th>`));
    out.push("</tr></thead><tbody>");
    rows.forEach((row) => {
      out.push("<tr>");
      row.forEach((cell) => out.push(`<td>${cell}</td>`));
      out.push("</tr>");
    });
    out.push("</tbody></table>");
    tableRows = [];
    inTable = false;
  };

  const inline = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeLists();
      flushTable();
      continue;
    }

    if (line.includes("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length >= 2 && !/^[-:]+$/.test(cells.join(""))) {
        closeLists();
        inTable = true;
        tableRows.push(cells.map(inline));
        continue;
      }
    }

    if (inTable) flushTable();

    if (line.startsWith("#### ")) {
      closeLists();
      out.push(`<h4>${inline(line.slice(5))}</h4>`);
      continue;
    }
    if (line.startsWith("### ")) {
      closeLists();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeLists();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      closeLists();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists();
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inUl) {
        closeLists();
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  flushTable();
  return out.join("");
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

function normalizeBlogRow(raw: Record<string, unknown>): BlogRow {
  return {
    ...EMPTY_BLOG,
    ...raw,
    key_takeaways: ensureArrayStrings(raw?.key_takeaways),
    faq_items: ensureFaqItems(raw?.faq_items),
    external_sources: ensureSourceItems(raw?.external_sources),
  };
}

function parseStructuredText(rawText: string) {
  const normalized = rawText.replace(/\r/g, "");
  const lines = normalized.split("\n").map((line) => line.trim());

  const extractFaqFromJsonLd = (text: string): FaqItem[] => {
    const questionRegex = /"name"\s*:\s*"([^"]+)"/g;
    const answerRegex = /"text"\s*:\s*"([^"]+)"/g;
    const questions = Array.from(text.matchAll(questionRegex)).map((m) => (m[1] || "").trim());
    const answers = Array.from(text.matchAll(answerRegex)).map((m) => (m[1] || "").trim());
    const faqFromJson: FaqItem[] = [];
    const size = Math.min(questions.length, answers.length);
    for (let i = 0; i < size; i += 1) {
      if (!questions[i] || !answers[i]) continue;
      faqFromJson.push({ question: questions[i], answer: answers[i] });
    }
    return faqFromJson;
  };

  let metaDescription = "";
  let primaryKeyword = "";
  let skipNextForMeta = false;

  lines.forEach((line, index) => {
    if (!line) return;
    if (skipNextForMeta) {
      skipNextForMeta = false;
      return;
    }

    if (!primaryKeyword) {
      const keywordMatch = line.match(/^primary keyword(?:\s*\(.*?\))?\s*[:-]\s*(.*)$/i);
      if (keywordMatch) {
        primaryKeyword = (keywordMatch[1] || "").trim();
      }
    }

    if (!metaDescription) {
      const metaInline = line.match(/^meta description(?:\s*\(.*?\))?\s*[:-]\s*(.*)$/i);
      if (metaInline) {
        const inlineValue = (metaInline[1] || "").trim();
        if (inlineValue) {
          metaDescription = inlineValue;
        } else {
          const nextLine = lines[index + 1] || "";
          if (nextLine && !/^#/.test(nextLine)) {
            metaDescription = nextLine.trim();
            skipNextForMeta = true;
          }
        }
      }
    }
  });

  const sanitizedLines = lines.filter(
    (line) =>
      line &&
      !/^xml$/i.test(line) &&
      !/^<script/i.test(line) &&
      !/^<\/script>/i.test(line) &&
      !/^"@context"/i.test(line) &&
      !/^"@type"/i.test(line) &&
      !/^meta description(?:\s*\(.*?\))?\s*[:-]?/i.test(line) &&
      !/^primary keyword(?:\s*\(.*?\))?\s*[:-]?/i.test(line),
  );

  const markdownHeadingTitle = sanitizedLines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() || "";
  const plainHeadingTitle =
    sanitizedLines.find(
      (line) =>
        !/^(key takeaways|faq|sources|references)$/i.test(line) &&
        !/^\d+\.\s+/.test(line) &&
        !/^[-*]\s+/.test(line) &&
        line.length >= 20,
    ) || "";
  const title = markdownHeadingTitle || plainHeadingTitle || sanitizedLines[0] || "";

  const keyTakeaways: string[] = [];
  const faqItems: FaqItem[] = [];
  const sources: SourceItem[] = [];
  const seenUrls = new Set<string>();

  let inTakeaways = false;
  let inFaq = false;
  let inSources = false;
  let pendingQuestion = "";

  sanitizedLines.forEach((line) => {
    const isSectionHeader = /^#{1,4}\s*/.test(line);
    const cleanLine = line.replace(/^#{1,4}\s*/, "").trim();

    if (/^key takeaways$/i.test(cleanLine)) {
      inTakeaways = true;
      inFaq = false;
      inSources = false;
      return;
    }
    if (/^(faq|frequently asked questions)(\b|:)/i.test(cleanLine)) {
      inFaq = true;
      inTakeaways = false;
      inSources = false;
      return;
    }
    if (/^(sources|references)(\b|:)/i.test(cleanLine)) {
      inSources = true;
      inTakeaways = false;
      inFaq = false;
      return;
    }
    if (isSectionHeader) {
      inTakeaways = false;
      inFaq = false;
      inSources = false;
    }

    if (inTakeaways) {
      const takeaway = cleanLine.replace(/^\d+\.\s+/, "").replace(/^[-*]\s+/, "").trim();
      if (takeaway) keyTakeaways.push(takeaway);
      return;
    }

    if (inFaq) {
      if (/^(q:|question:)/i.test(cleanLine)) {
        pendingQuestion = cleanLine.replace(/^(q:|question:)\s*/i, "").trim();
        return;
      }
      if (/^(a:|answer:)/i.test(cleanLine) && pendingQuestion) {
        faqItems.push({
          question: pendingQuestion,
          answer: cleanLine.replace(/^(a:|answer:)\s*/i, "").trim(),
        });
        pendingQuestion = "";
        return;
      }
      if (cleanLine.endsWith("?")) {
        pendingQuestion = cleanLine;
      } else if (pendingQuestion && cleanLine) {
        faqItems.push({ question: pendingQuestion, answer: cleanLine });
        pendingQuestion = "";
      }
      return;
    }

    if (inSources) {
      const mdMatch = cleanLine.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i);
      if (mdMatch) {
        const url = mdMatch[2].trim();
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          sources.push({ title: mdMatch[1].trim(), url });
        }
        return;
      }
      const urlMatch = cleanLine.match(/(https?:\/\/\S+)/i);
      if (urlMatch) {
        const url = urlMatch[1].trim();
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          const titlePart = cleanLine.replace(urlMatch[1], "").replace(/^[-*]\s+/, "").replace(/[-:]\s*$/, "").trim();
          sources.push({ title: titlePart || "Source", url });
        }
      }
    }
  });

  if (faqItems.length === 0) {
    faqItems.push(...extractFaqFromJsonLd(normalized));
  }

  if (!primaryKeyword) {
    const faqQuestionText = faqItems.map((item) => item.question).join(" ").toLowerCase();
    if (faqQuestionText.includes("algo trading india")) {
      primaryKeyword = "algo trading india";
    }
  }

  // Also gather any URLs from the full raw text for cases where references are plain URL lists.
  const globalUrlMatches = Array.from(normalized.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)).map((match) => match[0].trim());
  globalUrlMatches.forEach((url) => {
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      sources.push({ title: host, url });
    } catch {
      sources.push({ title: "Source", url });
    }
  });

  return {
    title: title || "",
    primary_keyword: primaryKeyword || "",
    meta_description: metaDescription || "",
    key_takeaways: keyTakeaways.slice(0, 5),
    faq_items: faqItems,
    external_sources: sources,
  };
}

function fallbackAutoFill(parsed: ReturnType<typeof parseStructuredText>, rawText: string) {
  const content = rawText.replace(/\s+/g, " ").trim();
  const sentences = content.split(/[.!?]/).map((s) => s.trim()).filter(Boolean);
  const firstParagraph = sentences.slice(0, 3).join(". ").trim();
  const fallbackMeta = `${firstParagraph}${firstParagraph ? "." : ""}`.slice(0, 155).padEnd(155, " ");

  const takeaways = parsed.key_takeaways.length
    ? parsed.key_takeaways
    : sentences.slice(0, 5).map((s) => (s.endsWith(".") ? s : `${s}.`));

  const keyword = parsed.primary_keyword || parsed.title.split(" ").slice(0, 4).join(" ").trim();

  return {
    ...parsed,
    primary_keyword: keyword,
    meta_description: parsed.meta_description ? parsed.meta_description.slice(0, 155).padEnd(155, " ") : fallbackMeta,
    key_takeaways: takeaways.slice(0, 5),
  };
}

interface RichEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
}

function RichEditor({ initialHtml, onChange }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [blockTag, setBlockTag] = useState("p");
  const [hasSelection, setHasSelection] = useState(false);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [showImageForm, setShowImageForm] = useState(false);
  const [imageUrl, setImageUrl] = useState("https://");

  useEffect(() => {
    if (!initialized.current && editorRef.current) {
      editorRef.current.innerHTML = initialHtml || "";
      initialized.current = true;
    }
  }, [initialHtml]);

  const refreshState = useCallback(() => {
    const next = new Set<string>();
    try {
      if (document.queryCommandState("bold")) next.add("bold");
      if (document.queryCommandState("italic")) next.add("italic");
      if (document.queryCommandState("underline")) next.add("underline");
      if (document.queryCommandState("strikeThrough")) next.add("strike");
      if (document.queryCommandState("insertUnorderedList")) next.add("ul");
      if (document.queryCommandState("insertOrderedList")) next.add("ol");
    } catch {
      // ignore
    }
    setActive(next);

    try {
      const val = (document.queryCommandValue("formatBlock") || "p").toLowerCase().replace(/[<>]/g, "");
      setBlockTag(val || "p");
    } catch {
      setBlockTag("p");
    }

    const sel = window.getSelection();
    const root = editorRef.current;
    setHasSelection(!!(root && sel && !sel.isCollapsed && root.contains(sel.anchorNode)));
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshState);
    return () => document.removeEventListener("selectionchange", refreshState);
  }, [refreshState]);

  const exec = useCallback(
    (cmd: string, val?: string) => {
      editorRef.current?.focus();
      document.execCommand(cmd, false, val ?? undefined);
      if (editorRef.current) onChange(editorRef.current.innerHTML);
      refreshState();
    },
    [onChange, refreshState],
  );

  const setBlock = useCallback(
    (tag: string) => {
      setShowBlockMenu(false);
      exec("formatBlock", tag);
    },
    [exec],
  );

  const rememberSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !savedRangeRef.current) return;
    sel.removeAllRanges();
    sel.addRange(savedRangeRef.current);
  }, []);

  const buttons = [
    { cmd: "bold", icon: <Bold className="h-3.5 w-3.5" />, title: "Bold", activeKey: "bold" },
    { cmd: "italic", icon: <Italic className="h-3.5 w-3.5" />, title: "Italic", activeKey: "italic" },
    { cmd: "underline", icon: <Underline className="h-3.5 w-3.5" />, title: "Underline", activeKey: "underline" },
    { cmd: "strikeThrough", icon: <Strikethrough className="h-3.5 w-3.5" />, title: "Strikethrough", activeKey: "strike" },
    { cmd: "insertUnorderedList", icon: <List className="h-3.5 w-3.5" />, title: "Bullet list", activeKey: "ul" },
    { cmd: "insertOrderedList", icon: <ListOrdered className="h-3.5 w-3.5" />, title: "Numbered list", activeKey: "ol" },
  ];

  const currentBlockLabel = BLOCK_OPTIONS.find((option) => option.tag === blockTag)?.label ?? "Normal";

  return (
    <div className="border border-input rounded-md overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 p-1.5 bg-muted/60 border-b border-input select-none">
        <div className="relative">
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              setShowBlockMenu((current) => !current);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-background border border-input min-w-[90px] justify-between"
          >
            <span>{currentBlockLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          {showBlockMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[130px]">
              {BLOCK_OPTIONS.map((option) => (
                <button
                  key={option.tag}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setBlock(option.tag);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted ${blockTag === option.tag ? "text-primary font-semibold bg-muted" : ""}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {buttons.map((button) => (
          <button
            key={button.cmd}
            type="button"
            title={button.title}
            onMouseDown={(event) => {
              event.preventDefault();
              exec(button.cmd);
            }}
            className={`p-1.5 rounded ${button.activeKey && active.has(button.activeKey) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
          >
            {button.icon}
          </button>
        ))}
        <button
          type="button"
          title="Insert link"
          disabled={!hasSelection}
          onMouseDown={(event) => {
            event.preventDefault();
            rememberSelection();
            setShowImageForm(false);
            setShowLinkForm(true);
          }}
          className={`p-1.5 rounded ${!hasSelection ? "text-muted-foreground/40" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Insert image"
          onMouseDown={(event) => {
            event.preventDefault();
            setShowLinkForm(false);
            setShowImageForm(true);
          }}
          className="p-1.5 rounded text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </button>

        {(showLinkForm || showImageForm) && (
          <div className="w-full mt-2 flex flex-wrap items-center gap-2 text-xs">
            {showLinkForm && (
              <>
                <span className="text-muted-foreground">Link URL</span>
                <input
                  className="flex-1 min-w-[160px] rounded border border-input bg-background px-2 py-1 text-xs"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || !linkUrl.trim()) return;
                    event.preventDefault();
                    restoreSelection();
                    exec("createLink", linkUrl.trim());
                    setShowLinkForm(false);
                  }}
                />
              </>
            )}
            {showImageForm && (
              <>
                <span className="text-muted-foreground">Image URL</span>
                <input
                  className="flex-1 min-w-[160px] rounded border border-input bg-background px-2 py-1 text-xs"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || !imageUrl.trim()) return;
                    event.preventDefault();
                    exec("insertImage", imageUrl.trim());
                    setShowImageForm(false);
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .rich-editor ul { list-style: disc; padding-left: 1.5em; margin: 0.5em 0; }
        .rich-editor ol { list-style: decimal; padding-left: 1.5em; margin: 0.5em 0; }
        .rich-editor li { margin: 0.2em 0; }
        .rich-editor blockquote { border-left: 3px solid #6366f1; padding-left: 1em; color: #9ca3af; margin: 0.5em 0; }
        .rich-editor h1 { font-size: 2em; font-weight: 700; margin: 0.4em 0; }
        .rich-editor h2 { font-size: 1.5em; font-weight: 700; margin: 0.4em 0; }
        .rich-editor h3 { font-size: 1.25em; font-weight: 700; margin: 0.3em 0; }
        .rich-editor h4 { font-size: 1.1em; font-weight: 600; margin: 0.3em 0; }
        .rich-editor p  { margin: 0.25em 0; }
        .rich-editor a  { color: #6366f1; text-decoration: underline; }
        .rich-editor img { max-width: 100%; border-radius: 6px; margin: 0.5em 0; }
        .rich-editor hr { border: none; border-top: 1px solid #374151; margin: 1em 0; }
      `}</style>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="rich-editor min-h-[360px] p-4 outline-none text-sm leading-relaxed overflow-y-auto"
        style={{ wordBreak: "break-word" }}
        onInput={() => {
          if (editorRef.current) onChange(editorRef.current.innerHTML);
        }}
        onKeyUp={refreshState}
        onMouseUp={refreshState}
        onFocus={refreshState}
        onClick={() => setShowBlockMenu(false)}
      />
    </div>
  );
}

async function uploadToStorage(file: File, folder: string): Promise<string> {
  const path = `${folder}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const { error } = await supabase.storage.from("blog-images").upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("blog-images").getPublicUrl(path);
  return data.publicUrl;
}

export default function AdminBlogsPage() {
  const [blogs, setBlogs] = useState<BlogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftImporting, setDraftImporting] = useState(false);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<BlogRow>(EMPTY_BLOG);
  const [uploading, setUploading] = useState<"cover" | "avatar" | null>(null);
  const [contentHtml, setContentHtml] = useState("");
  const [lastUploadIssues, setLastUploadIssues] = useState<string[]>([]);

  const checks = useMemo<ComplianceCheck[]>(
    () =>
      evaluateCompliance({
        title: editing.title,
        primary_keyword: editing.primary_keyword,
        meta_description: editing.meta_description,
        key_takeaways: editing.key_takeaways,
        faq_items: editing.faq_items,
        external_sources: editing.external_sources,
        content_html: contentHtml,
      }),
    [editing, contentHtml],
  );

  const failedChecks = useMemo(() => getFailedCompliance(checks), [checks]);

  const loadBlogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from("blogs").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown[];
      setBlogs(rows.map((row) => normalizeBlogRow((row || {}) as Record<string, unknown>)));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to load blogs"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlogs();
  }, []);

  const openNew = () => {
    const fresh = { ...EMPTY_BLOG, created_at: new Date().toISOString() };
    setContentHtml("");
    setEditing(fresh);
    setLastUploadIssues([]);
    setView("edit");
  };

  const openEdit = (blog: BlogRow) => {
    const normalized = normalizeBlogRow(blog as unknown as Record<string, unknown>);
    setContentHtml(normalized.content_html || "");
    setEditing(normalized);
    setLastUploadIssues([]);
    setView("edit");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this blog post?")) return;
    try {
      const { error } = await supabase.from("blogs").delete().eq("id", id);
      if (error) throw error;
      toast.success("Deleted");
      setBlogs((prev) => prev.filter((blog) => blog.id !== id));
      if (editing.id === id) setView("list");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to delete"));
    }
  };

  const handleFileUpload = async (file: File | undefined, kind: "cover" | "avatar") => {
    if (!file) return;
    setUploading(kind);
    try {
      const folder = kind === "cover" ? "cover" : "avatar";
      const url = await uploadToStorage(file, folder);
      setEditing((prev) => ({
        ...prev,
        ...(kind === "cover" ? { cover_image_url: url } : { author_image_url: url }),
      }));
      toast.success(`${kind === "cover" ? "Cover image" : "Author photo"} uploaded`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Upload failed"));
    } finally {
      setUploading(null);
    }
  };

  const applyImportedDraft = (mapped: ReturnType<typeof fallbackAutoFill>, contentHtml: string) => {
    const nextEditing: BlogRow = {
      ...editing,
      title: mapped.title || editing.title,
      primary_keyword: mapped.primary_keyword || editing.primary_keyword,
      meta_description: mapped.meta_description || editing.meta_description,
      key_takeaways: [...mapped.key_takeaways, "", "", "", "", ""].slice(0, 5),
      faq_items: mapped.faq_items.length ? mapped.faq_items : editing.faq_items,
      external_sources: mapped.external_sources.length ? mapped.external_sources : editing.external_sources,
      content_html: contentHtml,
    };
    const uploadChecks = evaluateCompliance({
      title: nextEditing.title,
      primary_keyword: nextEditing.primary_keyword,
      meta_description: nextEditing.meta_description,
      key_takeaways: nextEditing.key_takeaways,
      faq_items: nextEditing.faq_items,
      external_sources: nextEditing.external_sources,
      content_html: contentHtml,
    });
    const uploadFailures = getFailedCompliance(uploadChecks);
    if (uploadFailures.length > 0) {
      const issues = uploadFailures.map((check) => check.label);
      setLastUploadIssues(issues);
      toast.error("Upload rejected: document is missing required Universal Rule sections.");
      return;
    }
    setLastUploadIssues([]);
    setContentHtml(contentHtml);
    setEditing(nextEditing);
    toast.success("Draft uploaded and mapped.");
  };

  const handleDraftUpload = async (file: File | undefined) => {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["docx", "md", "markdown", "txt"].includes(extension)) {
      toast.error("Only DOCX and Markdown files are supported.");
      return;
    }
    setDraftImporting(true);
    try {
      let rawText = "";
      let html = "";
      if (extension === "docx") {
        const buffer = await file.arrayBuffer();
        const extract = await mammoth.extractRawText({ arrayBuffer: buffer });
        const converted = await mammoth.convertToHtml({ arrayBuffer: buffer });
        rawText = extract.value || "";
        html = converted.value || "";
      } else {
        rawText = await file.text();
        html = markdownToHtml(rawText);
      }
      const parsed = parseStructuredText(rawText);
      const mapped = fallbackAutoFill(parsed, rawText);
      applyImportedDraft(mapped, cleanBlogContentHtml(html));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to parse the draft"));
    } finally {
      setDraftImporting(false);
    }
  };

  const handleSave = async () => {
    if (!editing.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const normalizedContent = cleanBlogContentHtml(contentHtml);
    const failures = getFailedCompliance(
      evaluateCompliance({
        title: editing.title,
        primary_keyword: editing.primary_keyword,
        meta_description: editing.meta_description,
        key_takeaways: editing.key_takeaways,
        faq_items: editing.faq_items,
        external_sources: editing.external_sources,
        content_html: normalizedContent,
      }),
    );
    if (failures.length > 0) {
      toast.error(`Cannot save: ${failures[0].label}`);
      return;
    }

    const slug = editing.slug?.trim() || slugify(editing.title);
    try {
      setSaving(true);
      const isNew = !editing.id;
      const { id: _omitId, ...withoutId } = editing;
      const payload = {
        ...withoutId,
        slug,
        content_html: normalizedContent,
        meta_description: (editing.meta_description || "").slice(0, 155).padEnd(155, " "),
        faq_items: editing.faq_items.filter((item) => item.question.trim() && item.answer.trim()),
        key_takeaways: editing.key_takeaways.filter((item) => item.trim()),
        external_sources: editing.external_sources.filter((item) => item.title.trim() && item.url.trim()),
        published_at: editing.is_published ? editing.published_at || new Date().toISOString() : null,
      };
      const { data, error } = isNew
        ? await supabase.from("blogs").insert(payload).select("*").single()
        : await supabase.from("blogs").update(payload).eq("id", editing.id).select("*").single();
      if (error) throw error;

      const saved = normalizeBlogRow((data || {}) as Record<string, unknown>);
      toast.success("Blog saved");
      setEditing(saved);
      setBlogs((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
      setView("list");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  if (view === "list") {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Blog Manager</h2>
            <p className="text-sm text-muted-foreground">Create and manage public blog posts.</p>
          </div>
          <Button size="sm" onClick={openNew}>
            <PlusCircle className="h-4 w-4 mr-1" /> New Blog Post
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : blogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No blogs yet. Click "New Blog Post" to create one.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blogs.map((blog) => (
                <TableRow key={blog.id}>
                  <TableCell className="font-medium max-w-xs truncate">{blog.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{blog.category || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={blog.is_published ? "default" : "secondary"}>
                      {blog.is_published ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {blog.published_at ? formatDate(blog.published_at) : "—"}
                  </TableCell>
                  <TableCell className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(blog)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => handleDelete(blog.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    );
  }

  const postDateValue = editing.published_at
    ? new Date(editing.published_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-0 -m-6">
      <div className="border-b bg-card/80 px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="sm" onClick={() => setView("list")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back to list
        </Button>
        <div className="ml-2">
          <h2 className="text-base font-semibold">{editing.id ? "Edit Blog Post" : "New Blog Post"}</h2>
          {editing.id && <p className="text-xs text-muted-foreground">ID: {editing.slug || editing.id}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="cursor-pointer">
            <Button asChild variant="outline" size="sm" className="pointer-events-none">
              <span>
                {draftImporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                Upload Draft (DOCX/MD)
              </span>
            </Button>
            <input
              type="file"
              accept=".docx,.md,.markdown,.txt"
              className="hidden"
              onChange={(event) => handleDraftUpload(event.target.files?.[0])}
            />
          </label>
          <Button variant="outline" size="sm" onClick={() => setView("list")}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-4xl mx-auto">
        {lastUploadIssues.length > 0 && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-700">Upload blocked due to missing Universal Rules:</p>
            <ul className="list-disc pl-5 text-sm text-red-700">
              {lastUploadIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border px-4 py-3 bg-muted/20">
          <h3 className="text-sm font-semibold mb-2">Rule Compliance</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {checks.map((check) => (
              <div key={check.key} className={`text-xs rounded-md px-2.5 py-2 border ${check.passed ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                <div className="font-medium">{check.label}</div>
                {check.details && <div className="opacity-80 mt-0.5">{check.details}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Post Title <span className="text-red-500">*</span></Label>
          <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Primary Keyword <span className="text-red-500">*</span></Label>
            <Input value={editing.primary_keyword || ""} onChange={(e) => setEditing({ ...editing, primary_keyword: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Meta Description (exactly 155 chars) <span className="text-red-500">*</span></Label>
            <Input
              value={editing.meta_description || ""}
              onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })}
              maxLength={155}
            />
            <p className={`text-[11px] ${(editing.meta_description || "").length === 155 ? "text-emerald-600" : "text-amber-600"}`}>
              {(editing.meta_description || "").length}/155
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Category <span className="text-red-500">*</span></Label>
            <Input value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Read Time</Label>
            <Input value={editing.read_time || ""} onChange={(e) => setEditing({ ...editing, read_time: e.target.value })} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Key Takeaways (minimum 5) <span className="text-red-500">*</span></Label>
          {editing.key_takeaways.map((item, index) => (
            <Input
              key={index}
              value={item}
              onChange={(e) => {
                const copy = [...editing.key_takeaways];
                copy[index] = e.target.value;
                setEditing({ ...editing, key_takeaways: copy });
              }}
              placeholder={`Takeaway ${index + 1}`}
            />
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Short Excerpt <span className="text-red-500">*</span></Label>
          <Textarea
            rows={3}
            value={editing.subtitle || ""}
            onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
            placeholder="A short summary shown on the blog listing..."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Author Name <span className="text-red-500">*</span></Label>
            <Input value={editing.author_name || ""} onChange={(e) => setEditing({ ...editing, author_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Post Date <span className="text-red-500">*</span></Label>
            <Input
              type="date"
              value={postDateValue}
              onChange={(e) => setEditing({ ...editing, published_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Author Profile Picture</Label>
          <div className="flex items-center gap-2">
            <Input
              value={editing.author_image_url || ""}
              onChange={(e) => setEditing({ ...editing, author_image_url: e.target.value })}
              className="flex-1"
            />
            <label className="cursor-pointer shrink-0">
              <Button asChild variant="outline" size="sm" className="gap-1.5 pointer-events-none" disabled={uploading === "avatar"}>
                <span>
                  {uploading === "avatar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload photo
                </span>
              </Button>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], "avatar")} />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Featured Image <span className="text-red-500">*</span></Label>
          <div className="flex items-center gap-2">
            <Input
              value={editing.cover_image_url || ""}
              onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })}
              className="flex-1"
            />
            <label className="cursor-pointer shrink-0">
              <Button asChild variant="outline" size="sm" className="gap-1.5 pointer-events-none" disabled={uploading === "cover"}>
                <span>
                  {uploading === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                  Upload image
                </span>
              </Button>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0], "cover")} />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">URL Slug</Label>
          <Input value={editing.slug || ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">FAQ Items (minimum 5) <span className="text-red-500">*</span></Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing({ ...editing, faq_items: [...editing.faq_items, { question: "", answer: "" }] })}
            >
              Add FAQ
            </Button>
          </div>
          {editing.faq_items.map((item, index) => (
            <div key={index} className="border rounded-lg p-3 space-y-2">
              <Input
                placeholder={`Question ${index + 1}`}
                value={item.question}
                onChange={(e) => {
                  const next = [...editing.faq_items];
                  next[index] = { ...next[index], question: e.target.value };
                  setEditing({ ...editing, faq_items: next });
                }}
              />
              <Textarea
                rows={2}
                placeholder="Answer"
                value={item.answer}
                onChange={(e) => {
                  const next = [...editing.faq_items];
                  next[index] = { ...next[index], answer: e.target.value };
                  setEditing({ ...editing, faq_items: next });
                }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">External Sources (authoritative links) <span className="text-red-500">*</span></Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing({ ...editing, external_sources: [...editing.external_sources, { title: "", url: "" }] })}
            >
              Add Source
            </Button>
          </div>
          {editing.external_sources.map((item, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-2">
              <Input
                placeholder="Source title"
                value={item.title}
                onChange={(e) => {
                  const next = [...editing.external_sources];
                  next[index] = { ...next[index], title: e.target.value };
                  setEditing({ ...editing, external_sources: next });
                }}
              />
              <Input
                placeholder="https://..."
                value={item.url}
                onChange={(e) => {
                  const next = [...editing.external_sources];
                  next[index] = { ...next[index], url: e.target.value };
                  setEditing({ ...editing, external_sources: next });
                }}
              />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Main Content <span className="text-red-500">*</span></Label>
          <RichEditor
            initialHtml={contentHtml}
            onChange={(html) => {
              setContentHtml(html);
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Include matching FAQ section and links in body. Structured fields above are validated before upload/save.
          </p>
        </div>

        <div className="space-y-2 rounded-xl border p-4 bg-muted/20">
          <Label className="text-sm font-medium">FAQ JSON-LD Preview</Label>
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap bg-black/80 text-emerald-100 p-3 rounded-md">
            {JSON.stringify(buildFaqSchema(editing.faq_items), null, 2)}
          </pre>
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <input
            id="published"
            type="checkbox"
            checked={editing.is_published}
            onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
            className="h-4 w-4"
          />
          <Label htmlFor="published" className="text-sm cursor-pointer">
            Publish immediately
          </Label>
        </div>

        <div className="flex items-center justify-between gap-4 pt-4 border-t">
          <Button variant="outline" onClick={() => setView("list")}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || failedChecks.length > 0} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
