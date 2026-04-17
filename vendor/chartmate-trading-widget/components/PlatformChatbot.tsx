import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X, Send, Phone, ChevronDown, Bot, User, MessageSquare,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const WHATSAPP_NUMBER = "919632953355";
const PHONE_NUMBER    = "+91 96329 53355";

function ChatbotLogo({ className, size = 24 }: { className?: string; size?: number }) {
  const s   = size;
  const uid = `chatbot-logo-${s}`;
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id={`${uid}-bubble`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="white" stopOpacity="0.98" />
          <stop offset="100%" stopColor="white" stopOpacity="0.88" />
        </linearGradient>
      </defs>
      <path d="M4 8a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-8l-4 3v-3H8a4 4 0 0 1-4-4V8z"
        fill={`url(#${uid}-bubble)`} stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="11" cy="16" r="1.8" fill="hsl(var(--primary))" />
      <circle cx="16" cy="16" r="1.8" fill="hsl(var(--primary))" />
      <circle cx="21" cy="16" r="1.8" fill="hsl(var(--primary))" />
      <path d="M26 6l.8 1.5 1.6.2-1.2 1.1.3 1.5-1.5-.7-1.5.7.3-1.5-1.2-1.1 1.6-.2L26 6z"
        fill="white" stroke="hsl(var(--primary))" strokeWidth="0.6" strokeLinejoin="round" />
    </svg>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "bot" | "user";
  text: string;
  isContact?: boolean;
}

// ── Platform FAQ knowledge base ───────────────────────────────────────────────
interface FAQ { keywords: string[]; question: string; answer: string; }

const FAQS: FAQ[] = [
  {
    keywords: ["what is", "about", "platform", "chartmate", "this app", "this tool", "what does", "explain platform", "tell me about", "overview", "intro"],
    question: "What is this platform?",
    answer: `**TradingSmart** is an AI-powered trading intelligence platform that helps you make smarter trading decisions.

Here's what it does:
• **AI Predictions** — our AI engine analyses live price, RSI, MACD, news & global macro to predict BUY / SELL / HOLD signals with probability scores.
• **Strategy Selection** — AI ranks 11 real trading strategies (Trend Following, Swing Trading, Scalping etc.) for current market conditions.
• **Backtesting** — Before any order, the platform backtests the chosen strategy on 100+ days of real OHLCV data.
• **Paper Trading** — Simulate trades risk-free with virtual money to test strategies without real capital.
• **Daily Analysis** — Admins publish expert market predictions visible to all users.
• **Trade Tracking** — Monitor open positions with live P&L, stop-loss and target tracking.`,
  },
  {
    keywords: ["ai", "prediction", "predict", "how does ai", "signal", "buy sell hold", "forecast"],
    question: "How does AI prediction work?",
    answer: `The AI prediction pipeline runs in **7 steps** every time you analyse a stock or crypto:

1. **Fetch Market Data** — Live price, volume, change from real-time feeds.
2. **Historical Analysis** — Full-year OHLCV candles, fundamentals & earnings data.
3. **Technical Indicators** — RSI, MACD, Bollinger Bands, SMA, ATR, regime detection.
4. **News & Sentiment** — Market news, macro events, sector correlation.
5. **AI Processing** — the underlying model generates multi-horizon forecasts (15m to 1W) with positioning guidance.
6. **Risk Assessment** — Risk grade (A–D), stop-loss, take-profit targets.
7. **Full Report** — Expected ROI scenarios (Best / Likely / Worst), key support/resistance levels, and insights.

The result is a **BUY / SELL / HOLD signal** with a confidence probability score (0–100%).`,
  },
  {
    keywords: ["strategy", "strategies", "trend following", "swing trading", "scalping", "momentum", "which strategy"],
    question: "What strategies are available?",
    answer: `The platform supports **11 professional trading strategies** used by real traders:

| Strategy | Best For |
|---|---|
| **Trend Following** | Bull/bear trending markets |
| **Breakout & Breakdown** | Key support/resistance levels |
| **Mean Reversion** | Oversold/overbought extremes |
| **Momentum** | Short-term momentum bursts |
| **Scalping** | Intraday, tight spreads |
| **Swing Trading** | 2–10 day swings |
| **Range Trading** | Sideways/ranging markets |
| **News / Event Based** | Earnings, macro events |
| **Options Buying** | Leveraged directional bets |
| **Options Selling** | Premium collection, range markets |
| **Pairs Trading** | Market-neutral correlation plays |

**AI ranks all strategies** for the current market regime and picks the best one automatically.`,
  },
  {
    keywords: ["backtest", "backtesting", "historical", "validate", "conditions met"],
    question: "What is Backtesting?",
    answer: `**Backtesting** validates whether a strategy's conditions are *currently met* in the market using real historical data.

**How it works:**
• The platform runs 100+ days of real OHLCV data through the strategy rules.
• It simulates entries and exits based on technical signals.
• It checks whether those same conditions exist in the **current market** right now.

**You see:**
• "Strategy Conditions Met" or "Conditions NOT Met"
• Win rate, avg return per trade, max drawdown, profit factor

**Important:** If conditions are NOT met, the platform **blocks the real order** to protect your capital. You can still Paper Trade.`,
  },
  {
    keywords: ["paper trade", "paper trading", "simulate", "virtual", "no money", "risk free", "test strategy"],
    question: "What is Paper Trading?",
    answer: `**Paper Trading** is a risk-free simulation mode where you trade with **virtual money** — no real capital at stake.

**How it works:**
• Click "Paper Trade" on the prediction page.
• All AI gates and backtest conditions are **bypassed** — you can pick any strategy freely.
• The trade is tracked just like a real trade so you can monitor P&L, strategy performance and outcomes.
• Paper trades are marked with a badge in your Active Trades list.

**Why use it?**
• Test strategies in live market conditions without risking money.
• Build confidence before committing real capital.
• Great for beginners learning how the platform works.`,
  },
  {
    keywords: ["daily analysis", "market picks", "daily board"],
    question: "What is Daily Analysis?",
    answer: `**Daily Analysis** (also called Market Picks) is a page where **expert AI-driven predictions are published daily** and visible to all users.

**What each card shows:**
• Symbol & current price with % change
• Action signal: BUY / SELL / HOLD
• Probability of prediction being achieved (%)
• Expected ROI: Best case / Likely / Worst case
• AI rationale and reasoning
• Current market conditions
• Expiry time (auto-refreshes when expired)`,
  },
  {
    keywords: ["probability", "confidence", "score", "percentage", "accuracy", "how accurate"],
    question: "What is the probability score?",
    answer: `The **Probability Score** (0–100%) tells you how likely the AI's prediction is to be correct.

**How to interpret it:**
• **70–100%** — High confidence. Strong signal with multiple confirming indicators.
• **50–69%** — Moderate confidence. Some indicators align, but market is mixed.
• **0–49%** — Low confidence. Conflicting signals; consider Paper Trading first.

**What it's based on:**
• Technical indicator alignment (RSI, MACD, trend strength)
• News sentiment score
• Global macro alignment
• Historical backtest win rate
• AI model's multi-horizon forecast consensus

A higher score doesn't guarantee profit — always manage risk with stop-losses.`,
  },
  {
    keywords: ["get started", "how to start", "new user", "sign up", "login", "begin"],
    question: "How do I get started?",
    answer: `Getting started with TradingSmart is simple!

**Step 1:** Sign up or log in at **/auth**
**Step 2:** Go to the **Home page** — your dashboard overview
**Step 3:** Click **"Predict & Trade"** or go to **/predict**
• Search for any stock or crypto (e.g. RELIANCE, BTC-USD, AAPL)
• Set your investment amount and timeframe
• Click **"Run AI Analysis"**
**Step 4:** Review the full AI analysis — action signal, capital scenarios, AI rationale
**Step 5:** Pick a strategy, backtest validates conditions, place a **Paper Trade** to test risk-free
**Step 6:** Monitor your trades in **Active Trades** (/active-trades)

Start with Paper Trades to learn the platform before using real money!`,
  },
  {
    keywords: ["real", "actual", "live", "genuine", "is it real", "accurate", "reliable", "trust"],
    question: "Is the platform real?",
    answer: `Yes — **TradingSmart is as real as it gets**.

• **Live market data** — Real-time price, volume, and change from connected data feeds.
• **Real AI** — A production-grade large language model runs the full analysis. No fake or placeholder logic.
• **Real backtesting** — 100+ days of real OHLCV history run through strategy rules.
• **Real strategies** — The 11 strategies are the same concepts used by professional traders.
• **Real tracking** — Trades you place (or paper-trade) are stored and tracked with live P&L.`,
  },
  {
    keywords: ["contact", "support", "help", "whatsapp", "call", "phone", "reach", "talk to someone", "human", "speak to", "number"],
    question: "Contact Support",
    answer: `If you have more questions or need help in person, our team is here for you.

**Call or WhatsApp:** ${PHONE_NUMBER}

Reach out for:
• Platform setup & onboarding
• Technical issues or bugs
• Questions about strategies & AI signals
• Billing or account queries`,
  },
];

const QUICK_REPLIES = [
  { label: "What is TradingSmart?", keywords: ["what is this platform"] },
  { label: "Is it real?", keywords: ["is it real"] },
  { label: "How AI works", keywords: ["ai", "prediction"] },
  { label: "Strategies", keywords: ["strategy"] },
  { label: "Paper Trade", keywords: ["paper trade"] },
  { label: "Backtesting", keywords: ["backtest"] },
  { label: "Daily Analysis", keywords: ["daily analysis"] },
  { label: "Get Started", keywords: ["how to start"] },
  { label: "Contact", keywords: ["contact"] },
];

const HUMAN_INTROS = [
  "Great question! ",
  "Sure thing — here's the full picture: ",
  "Good one! ",
  "Here's how it works: ",
  "Happy to explain: ",
  "In short: ",
  "Here's the deal: ",
  "Let me break that down for you: ",
];
function pickIntro(): string {
  return HUMAN_INTROS[Math.floor(Math.random() * HUMAN_INTROS.length)];
}

function matchFAQ(input: string): FAQ | null {
  const lower = input.toLowerCase().trim();
  if (!lower) return null;
  let best: FAQ | null = null, bestScore = 0;
  for (const faq of FAQS) {
    let score = 0;
    for (const kw of faq.keywords) {
      if (lower.includes(kw)) score += kw.split(" ").length + 1;
    }
    if (score > bestScore) { bestScore = score; best = faq; }
  }
  return bestScore > 0 ? best : null;
}

function cleanAnswerText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/^\s*\*\s+/gm, "• ")
    .replace(/\n\s*\*\s+/g, "\n• ")
    .replace(/([.!?])\s*•\s+/g, "$1\n• ")
    .replace(/[—–]/g, " ")
    .replace(/\s*--\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function MarkdownText({ text }: { text: string }) {
  const cleaned = cleanAnswerText(text);
  const lines   = cleaned.split("\n");
  const renderInline = (line: string, keyPrefix: string) =>
    line.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g).map((p, j) => {
      if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
        return <strong key={`${keyPrefix}-${j}`}>{p.slice(2, -2)}</strong>;
      }
      if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
        return <em key={`${keyPrefix}-${j}`} className="italic">{p.slice(1, -1)}</em>;
      }
      return <span key={`${keyPrefix}-${j}`}>{p}</span>;
    });
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        const parts = renderInline(trimmed, `line-${i}`);
        if (trimmed.startsWith("•") || trimmed.startsWith("*")) {
          const rest = trimmed.replace(/^[•*]\s*/, "");
          const bulletParts = renderInline(rest, `bullet-${i}`);
          return (
            <div key={i} className="flex gap-1.5">
              <span className="shrink-0 mt-0.5">•</span>
              <span>{bulletParts}</span>
            </div>
          );
        }
        if (trimmed.startsWith("|")) {
          const cells = line.split("|").filter(c => c.trim() && c.trim() !== "---");
          if (!cells.length) return null;
          return (
            <div key={i} className="flex gap-2 text-xs">
              {cells.map((c, j) => <span key={j} className={j === 0 ? "font-medium w-40 shrink-0" : "text-muted-foreground"}>{c.trim()}</span>)}
            </div>
          );
        }
        return <p key={i}>{parts}</p>;
      })}
    </div>
  );
}

/** Visibility is controlled by the parent (e.g. App): mount only on public marketing routes for guests. */
export function PlatformChatbot() {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [typing, setTyping]     = useState(false);
  const [hasNotif, setHasNotif] = useState(true);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);

  const WELCOME: Message = {
    id: "welcome",
    role: "bot",
    text: `Hi there! 👋 I'm **TradingSmart Bot** — your support assistant. I can help with anything about the platform: AI predictions, strategies, paper trading, daily analysis, backtesting, and more. Ask me in your own words and I'll answer properly!`,
  };

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([WELCOME]);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setHasNotif(false);
    const userMsg: Message = { id: Date.now().toString(), role: "user", text: text.trim() };
    const historyPayload = [...messages, userMsg].slice(-8).map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    const addBotReply = (answer: string, isContact: boolean) => {
      setTyping(false);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "bot", text: answer, isContact }]);
    };

    const minDelay = new Promise<void>(r => setTimeout(r, 400));

    try {
      const [_, result] = await Promise.all([
        minDelay,
        supabase.functions.invoke("chatbot-answer", {
          body: { message: text.trim(), history: historyPayload, mode: "platform" },
        }),
      ]);
      const { data, error } = result;
      if (!error && data?.answer) {
        addBotReply(data.answer, !!data.suggestContact);
        return;
      }
    } catch {
      // fall through to local fallback
    }

    await new Promise(r => setTimeout(r, 300));
    const faq = matchFAQ(text);
    const isContactTopic = faq?.keywords.includes("contact");
    if (faq) {
      addBotReply((isContactTopic ? "" : pickIntro()) + faq.answer, !!isContactTopic);
    } else {
      addBotReply(
        `I only answer questions about the TradingSmart platform. For anything else, please reach out — we'll help you properly.\n\n**Call or WhatsApp:** ${PHONE_NUMBER}`,
        true
      );
    }
  }, [messages]);

  return (
    <>
      <div className="fixed max-md:bottom-[90px] bottom-5 right-5 z-[100] flex flex-col items-end gap-1.5 transition-all duration-300">
        {!open && hasNotif && (
          <div className="animate-bounce bg-background/95 border border-border shadow-md rounded-xl px-2.5 py-1.5 text-xs font-medium max-w-[180px] text-center backdrop-blur-sm">
            Ask me anything about the platform
          </div>
        )}
        <button
          onClick={() => { setOpen(v => !v); setHasNotif(false); }}
          className={cn(
            "relative h-11 w-11 rounded-xl shadow-lg flex items-center justify-center transition-all duration-300 overflow-hidden",
            "bg-gradient-to-br from-primary via-primary to-primary/80 hover:scale-105 hover:shadow-xl text-primary-foreground",
            open && "rotate-90"
          )}
          aria-label="Open platform chatbot"
        >
          {open ? <X className="h-5 w-5 shrink-0" /> : <ChatbotLogo size={22} className="shrink-0 drop-shadow-sm" />}
          {hasNotif && !open && (
            <span className="absolute top-0.5 right-0.5 h-2 w-2 bg-amber-400 rounded-full border border-background animate-pulse" />
          )}
        </button>
      </div>

      <div className={cn(
        "fixed right-5 z-[100] w-[380px] max-w-[calc(100vw-24px)] flex flex-col rounded-2xl shadow-2xl border bg-background transition-all duration-300 origin-bottom-right",
        "bottom-20 max-md:bottom-[150px]",
        open ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
      )} style={{ maxHeight: "calc(100vh - 130px)" }}>

        <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-2xl shrink-0">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center ring-1 ring-primary/20">
            <ChatbotLogo size={22} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">TradingSmart Bot</p>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-xs text-muted-foreground">Your trading support assistant</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
          {messages.map(msg => (
            <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
              <div className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                "bg-primary/15"
              )}>
                {msg.role === "bot" ? <Bot className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
              </div>
              <div className={cn(
                "max-w-[82%] rounded-2xl px-3 py-2.5 shadow-sm",
                msg.role === "bot" ? "bg-muted/60 rounded-tl-sm text-foreground" : "bg-primary text-primary-foreground rounded-tr-sm"
              )}>
                {msg.role === "bot" ? <MarkdownText text={msg.text} /> : <p className="text-sm">{msg.text}</p>}
                {msg.isContact && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hi%2C%20I%20need%20help%20with%20TradingSmart`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2 px-3 transition-colors">
                      <MessageSquare className="h-3.5 w-3.5" /> Chat on WhatsApp
                    </a>
                    <a href={`tel:${PHONE_NUMBER.replace(/\s/g, "")}`}
                      className="flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-muted text-xs font-medium py-2 px-3 transition-colors">
                      <Phone className="h-3.5 w-3.5" /> Call {PHONE_NUMBER}
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex gap-2 items-end">
              <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted/60 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                <div className="flex gap-1 items-center h-5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length <= 2 && !typing && (
          <div className="px-3 pb-2 shrink-0">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">Quick topics:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map(qr => (
                <button key={qr.label} onClick={() => sendMessage(qr.keywords[0])}
                  className="text-xs rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/15 text-primary font-medium px-2.5 py-1 transition-colors">
                  {qr.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-3 pb-3 shrink-0 border-t pt-2.5">
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about the platform…"
              className="flex-1 text-sm bg-muted/50 border border-border rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-muted-foreground"
            />
            <button onClick={() => sendMessage(input)} disabled={!input.trim() || typing}
              className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-all hover:scale-105 disabled:hover:scale-100 shrink-0">
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-1.5">
            Platform questions only • For urgent help: {PHONE_NUMBER}
          </p>
        </div>
      </div>
    </>
  );
}
