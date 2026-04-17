import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X, Send, ChevronDown, Bot, User,
  Newspaper, Loader2, Plus, History, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSubscription } from "@/hooks/useSubscription";

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "bot" | "user";
  text: string;
  component?: React.ReactNode;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface PredictionChatbotProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Supabase generated types in this repo don't include these new tables yet.
// Use `as any` to avoid type-inference explosions until types are regenerated.
const convTable = () => supabase.from("chatbot_conversations" as any);
const msgTable = () => supabase.from("chatbot_messages" as any);

// Premium chatbot logo for logged-in assistant
function AssistantLogo({ size = 22, className }: { size?: number; className?: string }) {
  const uid = `assistant-logo-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="24" height="24" rx="8" fill={`url(#${uid}-bg)`} />
      <path d="M10 13.5c0-2.5 1.9-4.5 4.3-4.5h3.4c2.4 0 4.3 2 4.3 4.5v4.2c0 2.4-1.9 4.3-4.3 4.3h-1.6l-2.8 2v-2h-1c-2.4 0-4.3-1.9-4.3-4.3v-4.2z" fill="white" fillOpacity="0.95" />
      <circle cx="14" cy="16" r="1.2" fill="hsl(var(--primary))" />
      <circle cx="18" cy="16" r="1.2" fill="hsl(var(--primary))" />
      <path d="M24.7 8.2l.5 1 .9.1-.7.7.2.9-.9-.4-.9.4.2-.9-.7-.7.9-.1.5-1z" fill="white" />
    </svg>
  );
}

// ── Markdown renderer ────────────────────────────────────────────────────────
function MarkdownText({ text }: { text: string }) {
  const cleaned = text
    .replace(/\r/g, "")
    .replace(/^\s*\*\s+/gm, "• ")
    .replace(/\n\s*\*\s+/g, "\n• ")
    .replace(/([.!?])\s*•\s+/g, "$1\n• ")
    .replace(/[—–]/g, " ")
    .replace(/\s*--\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const lines = cleaned.split("\n");

  function renderInline(line: string) {
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
        return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
      if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
        return <em key={i} className="italic">{p.slice(1, -1)}</em>;
      return <span key={i}>{p}</span>;
    });
  }

  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith("•") || trimmed.startsWith("- ")) {
          const rest = trimmed.replace(/^[•\-]\s*/, "");
          return (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 mt-0.5 text-primary">•</span>
              <span>{renderInline(rest)}</span>
            </div>
          );
        }
        if (trimmed.startsWith("⚠️"))
          return <p key={i} className="text-xs text-red-500 dark:text-red-400 font-semibold mt-3 pt-2 border-t border-red-500/25">{renderInline(trimmed)}</p>;
        return <p key={i}>{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

// ── Quick action chips ──────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: "📈 Apple price",    msg: "What is the current price of Apple stock?" },
  { label: "₿ Bitcoin price",   msg: "What is Bitcoin's current price?" },
  { label: "🛢️ Oil & markets",  msg: "How is crude oil impacting the markets right now?" },
  { label: "📰 Market news",    msg: "What's the latest market news and sentiment?" },
  { label: "🤔 Buy Tesla?",     msg: "Should I buy Tesla right now? Give me analysis based on news and current trends." },
  { label: "🟡 NIFTY analysis", msg: "Analyse NIFTY 50, should I buy or sell based on current sentiment?" },
  { label: "📊 Reliance news",  msg: "What's the latest news and sentiment on Reliance?" },
  { label: "🪙 ETH analysis",   msg: "Should I buy Ethereum right now? What does news sentiment say?" },
];

function isAnalysisQuery(msg: string): boolean {
  return /\b(should i buy|should i sell|buy or sell|good time to|right time to|worth buying|worth investing|analysis|analyse|analyze|recommend|hold or|invest in)\b/i.test(msg);
}

const WELCOME_TEXT_ANALYSIS = `Hey! 👋 I'm your **TradingSmart Bot** powered by real-time market data, news and sentiment analysis.

Ask me anything:
• **Live prices** "What's Tesla trading at?"
• **News & sentiment** "What's happening with Reliance?"
• **Buy/Sell/Hold advice** "Should I buy Bitcoin now?"
• **Market impact** "How is crude oil affecting markets?"
• **Strategies** "What strategies are available?" or "What custom strategies do I have?"

I'll give you real answers based on current news, sentiment, and market trends.`;

const WELCOME_TEXT_FREE = `Hey! 👋 I'm your **TradingSmart Bot** powered by real-time market data, news and sentiment analysis.

Ask me anything:
• **Live prices** "What's Tesla trading at?"
• **News & sentiment** "What's happening with Reliance?"
• **Buy/Sell/Hold advice** "Should I buy Bitcoin now?"
• **Market impact** "How is crude oil affecting markets?"

I'll give you a real answer based on current news, sentiment, and market trends.`;

// ── Helpers: DB persistence ─────────────────────────────────────────────────
async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

function titleFromMessage(text: string): string {
  const clean = text.replace(/[*#_`]/g, "").trim();
  return clean.length > 40 ? clean.slice(0, 40) + "…" : clean;
}

// ── Component ────────────────────────────────────────────────────────────────
export function PredictionChatbot({ open, setOpen }: PredictionChatbotProps) {
  const { hasAnalysisAccess } = useSubscription();
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState("");
  const [typing, setTyping]             = useState(false);
  const [convId, setConvId]             = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory]   = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [userStrategies, setUserStrategies] = useState<Array<{ name: string; is_intraday?: boolean; trading_mode?: string }>>([]);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const [modalActive, setModalActive] = useState(false);

  // Load user's custom strategies once
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      (supabase.from("user_strategies" as any) as any)
        .select("name, is_intraday, trading_mode")
        .eq("user_id", data.user.id)
        .then(({ data: rows }: { data: any[] | null }) => {
          if (rows?.length) setUserStrategies(rows.map(r => ({ name: r.name, is_intraday: r.is_intraday, trading_mode: r.trading_mode })));
        });
    });
  }, []);

  // Monitor DOM for open dialogs to hide chatbot
  useEffect(() => {
    const checkModal = () => {
      const hasModal = !!document.querySelector('[role="dialog"]');
      setModalActive(hasModal);
    };
    checkModal();
    const observer = new MutationObserver(checkModal);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, typing, scrollToBottom]);

  // ── Load conversation list on open ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    loadConversations();
  }, [open]);

  const loadConversations = async () => {
    const userId = await getUserId();
    if (!userId) return;
    const { data } = await convTable()
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (data) setConversations(data as unknown as Conversation[]);
  };

  // ── Start new chat ────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    setConvId(null);
    setMessages([]);
    setShowHistory(false);
    setTyping(false);
    setInput("");
    const t = setTimeout(() => {
      const welcome = hasAnalysisAccess ? WELCOME_TEXT_ANALYSIS : WELCOME_TEXT_FREE;
      setMessages([{
        id: uid("welcome"),
        role: "bot",
        text: welcome,
        component: (
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="outline" size="sm"
              className="bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 text-xs gap-1.5"
              onClick={() => sendMessage("What's the latest market news and sentiment?")}>
              <Newspaper className="h-3 w-3" /> Market News
          </Button>
          <Button variant="outline" size="sm"
              className="bg-teal-500/10 border-teal-500/20 hover:bg-teal-500/20 text-xs gap-1.5"
              onClick={() => sendMessage("What strategies are available on this platform?")}>
              📊 View Strategies
          </Button>
        </div>
        ),
      }]);
      setTimeout(() => inputRef.current?.focus(), 200);
    }, 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnalysisAccess]);

  // Auto-start new chat on first open if no history panel
  useEffect(() => {
    if (open && !showHistory && messages.length === 0 && !convId) {
      startNewChat();
    }
  }, [open]);

  // ── Load existing conversation ────────────────────────────────────────────
  const loadConversation = async (id: string) => {
    setLoadingHistory(true);
    setShowHistory(false);
    setConvId(id);
    const { data } = await msgTable()
      .select("id, role, text, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    if (data && data.length > 0) {
      setMessages((data as any[]).map(m => ({ id: String(m.id), role: m.role as "bot" | "user", text: String(m.text) })));
    } else {
      startNewChat();
    }
    setLoadingHistory(false);
  };

  // ── Delete conversation ───────────────────────────────────────────────────
  const deleteConversation = async (id: string) => {
    await convTable().delete().eq("id", id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (convId === id) startNewChat();
  };

  // ── Persist message to DB ─────────────────────────────────────────────────
  const persistMessage = async (conversationId: string, role: "bot" | "user", text: string) => {
    await msgTable().insert({ conversation_id: conversationId, role, text });
  };

  const ensureConversation = async (firstMsg: string): Promise<string> => {
    if (convId) {
      await convTable().update({ updated_at: new Date().toISOString() }).eq("id", convId);
      return convId;
    }
    const userId = await getUserId();
    if (!userId) return "";
    const { data } = await convTable()
      .insert({ user_id: userId, title: titleFromMessage(firstMsg) })
      .select("id")
      .single();
    const newId = (data as any)?.id ?? "";
    setConvId(newId);
    loadConversations();
    return newId;
  };

  // ── Message helpers ────────────────────────────────────────────────────────
  const addBotMsg = (text: string, component?: React.ReactNode) => {
    setMessages(prev => [...prev, { id: uid("bot"), role: "bot", text, component }]);
  };
  const addUserMsg = (text: string) => {
    setMessages(prev => [...prev, { id: uid("usr"), role: "user", text }]);
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    addUserMsg(trimmed);
    setInput("");
    setTyping(true);

    const cId = await ensureConversation(trimmed);
    if (cId) persistMessage(cId, "user", trimmed);

    const historyPayload = [...messages, { role: "user" as const, text: trimmed }]
      .slice(-15)
      .map(m => ({ role: m.role, text: m.text }));
    const minDelay = new Promise<void>(r => setTimeout(r, 500));

    try {
      const [, res] = await Promise.all([
        minDelay,
        supabase.functions.invoke("chatbot-answer", {
          body: { message: trimmed, history: historyPayload, strategies: userStrategies },
        }),
      ]);
      const { data, error } = res;
      if (!error && data?.answer) {
        const answer = data.answer;
        if (cId) persistMessage(cId, "bot", answer);
        addBotMsg(answer);
      } else {
        addBotMsg("I'm having trouble fetching market data right now. Please try again in a moment.");
      }
    } catch {
      addBotMsg("Something went wrong connecting to the market data service. Please try again.");
    } finally {
      setTyping(false);
    }
  }, [messages, convId, userStrategies]);

  const handleSend = () => {
    if (input.trim()) sendMessage(input);
  };

  // ── Time ago helper ───────────────────────────────────────────────────────
  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (modalActive) return null;

  return (
    <>
      {/* Floating trigger */}
      <div className="fixed max-md:bottom-[90px] bottom-5 right-5 z-[100] flex flex-col items-end gap-2 transition-all duration-300">
        {!open && (
          <div className="absolute -top-8 right-0 bg-background/80 backdrop-blur-md border border-primary/20 px-3 py-1.5 rounded-xl shadow-xl shadow-primary/10 animate-bounce">
            <p className="text-[10px] font-medium whitespace-nowrap text-primary">Ask about stocks, prices & markets</p>
            <div className="absolute -bottom-1 right-5 w-2 h-2 bg-background/80 border-r border-b border-primary/20 rotate-45" />
          </div>
        )}
        <div className="relative">
          {!open && (
            <>
              <span className="absolute inset-0 rounded-full border border-primary/30 animate-[spin_4s_linear_infinite]" style={{ margin: "-6px" }} />
              <span className="absolute inset-0 rounded-full border border-primary/20 animate-ping" style={{ margin: "-4px", animationDuration: "2s" }} />
              <span className="absolute inset-0 rounded-full bg-primary/10 blur-lg animate-pulse" style={{ margin: "-8px" }} />
            </>
          )}
          <button onClick={() => setOpen(!open)}
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center relative overflow-hidden transition-all duration-500",
              "bg-gradient-to-br from-teal-400 via-primary to-teal-600",
              "shadow-[0_0_24px_rgba(20,184,166,0.5),0_0_48px_rgba(20,184,166,0.2)]",
              "hover:shadow-[0_0_32px_rgba(20,184,166,0.7),0_0_64px_rgba(20,184,166,0.3)]",
              "hover:scale-110 active:scale-95",
              open && "rotate-[135deg] shadow-[0_0_16px_rgba(20,184,166,0.3)]"
            )}>
            {!open && <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-[shimmer_2.5s_ease-in-out_infinite]" />}
            <span className="absolute inset-0 rounded-full bg-gradient-to-t from-black/20 to-white/10" />
            {open
              ? <X className="h-6 w-6 text-white relative z-10 transition-transform duration-300" />
              : <AssistantLogo size={35} className="relative z-10" />
            }
          </button>
        </div>
      </div>

      {/* Chat window */}
      <div className={cn(
        "fixed right-5 z-[100] w-[420px] max-w-[calc(100vw-2rem)] bg-background/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col transition-all duration-500 origin-bottom-right",
        "bottom-24 max-md:bottom-[160px]",
        open ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-10 pointer-events-none"
      )} style={{ height: "620px", maxHeight: "calc(100vh - 10rem)" }}>

        {/* Header */}
        <div className="p-3 px-4 border-b bg-primary/5 flex items-center justify-between rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/15 rounded-lg shadow-inner ring-1 ring-primary/20">
              <AssistantLogo size={20} />
            </div>
            <div>
              <p className="font-bold text-sm tracking-tight">TradingSmart Bot</p>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Live prices · News · Analysis</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => { startNewChat(); }}
              className="hover:bg-white/5 rounded-full h-8 w-8" title="New chat">
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { setShowHistory(v => !v); loadConversations(); }}
              className="hover:bg-white/5 rounded-full h-8 w-8" title="Chat history">
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}
              className="hover:bg-white/5 rounded-full h-8 w-8">
            <ChevronDown className="h-5 w-5" />
          </Button>
          </div>
        </div>

        {/* History panel */}
        {showHistory && (
          <div className="border-b bg-muted/20 max-h-[260px] overflow-y-auto shrink-0">
            <div className="px-4 py-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Past Conversations</p>
              <button onClick={() => setShowHistory(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
            </div>
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 pb-3">No past conversations yet. Start chatting!</p>
            ) : (
              <div className="space-y-0.5 pb-2">
                {conversations.map(conv => (
                  <div key={conv.id}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 hover:bg-primary/5 cursor-pointer transition-colors group",
                      convId === conv.id && "bg-primary/10"
                    )}>
                    <button className="flex-1 text-left min-w-0" onClick={() => loadConversation(conv.id)}>
                      <p className="text-xs font-medium truncate">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground">{timeAgo(conv.updated_at)}</p>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all shrink-0"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading history state */}
        {loadingHistory && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
          </div>
        )}

        {/* Messages */}
        {!loadingHistory && !showHistory && (
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-5">
              {messages.map(msg => (
              <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                  msg.role === "bot" ? "bg-primary/10 border border-primary/20" : "bg-muted border border-white/5"
                )}>
                  {msg.role === "bot" ? <Bot className="h-4 w-4 text-primary" /> : <User className="h-4 w-4" />}
                </div>
                <div className="flex flex-col gap-2 max-w-[85%]">
                  <div className={cn(
                    "rounded-2xl px-4 py-3 text-sm shadow-md",
                    msg.role === "bot"
                      ? "bg-muted/40 backdrop-blur-sm rounded-tl-sm border border-white/5"
                      : "bg-primary text-primary-foreground rounded-tr-sm shadow-primary/20"
                  )}>
                      {msg.role === "bot"
                        ? <MarkdownText text={msg.text} />
                        : <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
                      }
                  </div>
                  {msg.component && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">{msg.component}</div>
                  )}
                </div>
              </div>
            ))}

              {typing && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce" />
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        )}

        {/* Quick actions at start only */}
        {!showHistory && messages.length <= 2 && !typing && (
          <div className="px-4 pb-2 shrink-0 border-t pt-2">
            <p className="text-[10px] text-muted-foreground mb-1.5 font-semibold uppercase tracking-wider">Try asking:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map(qa => (
                <button key={qa.label} onClick={() => sendMessage(qa.msg)}
                  className="text-[11px] rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/15 text-primary font-medium px-2.5 py-1 transition-colors">
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="p-4 border-t shrink-0">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSend(); }}
              placeholder="Ask about any stock, price, news, market…"
              className="flex-1 bg-muted/30 border border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40"
            />
            <Button size="icon" onClick={handleSend} disabled={!input.trim() || typing}>
              {typing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-center text-[9px] text-muted-foreground mt-1.5">
            Live market data · Not financial advice
          </p>
        </div>
      </div>
    </>
  );
}
