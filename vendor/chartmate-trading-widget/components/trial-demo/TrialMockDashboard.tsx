import { useState, useEffect, useRef, useCallback } from "react";
import "./trial-mock-dashboard.css";
import { ActivationOverlay } from "@/components/trial-demo/ActivationOverlay";
import { SystemHealthStrip } from "@/components/trial-demo/SystemHealthStrip";
import { RecentExecutionsPanel } from "@/components/trial-demo/RecentExecutionsPanel";
import { ControlReassuranceBar } from "@/components/trial-demo/ControlReassuranceBar";
import { ExecutionClimaxOverlay } from "@/components/trial-demo/ExecutionClimaxOverlay";
import { StrategyIntelCell } from "@/components/trial-demo/StrategyIntelCell";
import { TrialDemoShell } from "@/components/trial-demo/TrialDemoShell";
import { OptionsDemoPane } from "@/components/trial-demo/OptionsDemoPane";
import { ParityMatrixPanel } from "@/components/trial-demo/ParityMatrixPanel";
import {
  TRIAL_ACTIVATION_STEPS,
  TRIAL_INTEL_LINES,
} from "@/lib/trialDemoConstants";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useTrialPhaseMachine } from "@/lib/trialPhaseMachine";

// ─── SVG Logo Component (matches your TradingSmart.ai brain+chart logo) ───
const TradingSmartLogo = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="logoGrad" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
      <filter id="logoGlow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    <g filter="url(#logoGlow)">
      {/* Brain outline */}
      <path d="M20 55 C20 30, 35 15, 50 15 C55 15, 58 18, 55 25 C52 32, 48 30, 45 35 C42 40, 46 45, 50 45 C54 45, 52 40, 55 38 C58 36, 62 38, 60 42 C58 46, 54 48, 52 52 C50 56, 48 60, 45 62 C42 64, 38 62, 35 58 C32 54, 28 56, 25 58 C22 60, 20 58, 20 55Z"
        stroke="url(#logoGrad)" strokeWidth="2" fill="none" />
      {/* Circuit lines */}
      <circle cx="30" cy="35" r="2" fill="#38bdf8" />
      <circle cx="40" cy="28" r="2" fill="#38bdf8" />
      <circle cx="35" cy="45" r="1.5" fill="#06b6d4" />
      <circle cx="45" cy="38" r="1.5" fill="#06b6d4" />
      <line x1="30" y1="35" x2="40" y2="28" stroke="#38bdf8" strokeWidth="1" />
      <line x1="40" y1="28" x2="45" y2="38" stroke="#38bdf8" strokeWidth="1" />
      <line x1="35" y1="45" x2="30" y2="35" stroke="#06b6d4" strokeWidth="1" />
      {/* Candlesticks */}
      <rect x="55" y="50" width="4" height="20" rx="1" fill="#38bdf8" opacity="0.7" />
      <rect x="62" y="42" width="4" height="25" rx="1" fill="#38bdf8" opacity="0.8" />
      <rect x="69" y="35" width="4" height="30" rx="1" fill="#06b6d4" opacity="0.9" />
      <rect x="76" y="28" width="4" height="35" rx="1" fill="#06b6d4" />
      <line x1="57" y1="48" x2="57" y2="72" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
      <line x1="64" y1="40" x2="64" y2="69" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
      <line x1="71" y1="33" x2="71" y2="67" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />
      <line x1="78" y1="25" x2="78" y2="65" stroke="#06b6d4" strokeWidth="1" opacity="0.5" />
      {/* Trend arrow */}
      <path d="M52 68 Q65 40, 82 22" stroke="url(#logoGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <polygon points="82,22 85,28 78,26" fill="#38bdf8" />
    </g>
  </svg>
);

// ─── Styles ───
const BASE_STRATEGY_ROWS = [
  { name: "Momentum Alpha", status: "active", trades: 142, pnl: "+$48,291", win: "81.2%", pnlColor: "var(--accent-green)", winColor: "var(--accent-green)" },
  { name: "Mean Reversion X", status: "active", trades: 89, pnl: "+$31,847", win: "74.5%", pnlColor: "var(--accent-green)", winColor: "var(--accent-green)" },
  { name: "Grid Scalper Pro", status: "active", trades: 1247, pnl: "+$22,140", win: "68.9%", pnlColor: "var(--accent-green)", winColor: "var(--accent-cyan)" },
  { name: "Arbitrage Hunter", status: "active", trades: 56, pnl: "+$18,500", win: "92.1%", pnlColor: "var(--accent-green)", winColor: "var(--accent-green)" },
  { name: "Volatility Surfer", status: "active", trades: 203, pnl: "-$4,320", win: "52.3%", pnlColor: "var(--accent-red)", winColor: "var(--accent-orange)" },
  { name: "Breakout Ninja", status: "paused", trades: 0, pnl: "$0", win: "--", pnlColor: "var(--text-muted)", winColor: "var(--text-muted)" },
];

const makeStrategyBrain = () =>
  BASE_STRATEGY_ROWS.map((s, i) => ({ ...s, stage: 1, subLine: i % 2 }));

// ─── Utility: generate sparkline data ───
const genSparkData = (n, base, vol, trend) => {
  const d = [base];
  for (let i = 1; i < n; i++) d.push(d[i - 1] + (Math.random() - 0.45) * vol + trend);
  return d;
};

// ─── Sparkline SVG Component ───
const Sparkline = ({ data, color = "#38bdf8" }) => {
  if (!data || data.length < 2) return null;
  const w = 300, h = 40;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h * 0.9 - h * 0.05}`
  ).join(" ");
  const gradId = `sg_${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg className="sparkline-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Order data generators ───
const SYMBOLS = ["BTC/USDT","ETH/USDT","SOL/USDT","AAPL","TSLA","NVDA","AMZN","META","GOOG","MSFT","BNB/USDT","XRP/USDT","DOGE/USDT","AVAX/USDT"];
const STRATEGIES = ["Momentum Alpha","Mean Reversion X","Grid Scalper Pro","Arbitrage Hunter","Volatility Surfer"];

const genOrder = () => {
  const isBuy = Math.random() > 0.45;
  const sym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  const strat = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
  const now = new Date();
  return {
    id: Math.random().toString(36).slice(2, 10),
    type: isBuy ? "buy" : "sell", symbol: sym, strategy: strat,
    price: (Math.random() * 50000 + 10).toFixed(2),
    qty: (Math.random() * 10 + 0.01).toFixed(4),
    pnl: (Math.random() - 0.35) * 500,
    time: now.toLocaleTimeString("en-US", { hour12: false }),
  };
};

// ─── Main Dashboard Component ───
export default function TrialMockDashboard() {
  const [time, setTime] = useState("");
  const [uptimeSec, setUptimeSec] = useState(72 * 3600 + 14 * 60 + 38);
  const [killActive, setKillActive] = useState(false);
  const [orders, setOrders] = useState(() => Array.from({ length: 8 }, genOrder));
  const [logs, setLogs] = useState([
    { type: "info", msg: "System initialized — All modules loaded" },
    { type: "exec", msg: "Broker websocket connected — Latency: 12ms" },
    { type: "info", msg: 'Strategy "Momentum Alpha" armed on BTC/USDT, ETH/USDT (your rules)' },
    { type: "exec", msg: "Condition match detected — execution event on BTC/USDT via Momentum Alpha" },
    { type: "info", msg: "Risk validation passed — Portfolio exposure within limits" },
    { type: "exec", msg: "Strategy trigger identified — execution event on ETH/USDT via Mean Reversion X" },
    { type: "warn", msg: "High volatility on SOL/USDT — System adjusted position size" },
    { type: "exec", msg: "Grid Scalper placed 12 limit orders on BNB/USDT" },
    { type: "info", msg: "Portfolio rebalance complete — 3 positions adjusted" },
    { type: "exec", msg: "Condition match detected — execution event on AAPL via Momentum Alpha" },
  ]);
  const [portfolioVal, setPortfolioVal] = useState(2847392.58);
  const [todayPnl, setTodayPnl] = useState(12847.90);
  const [riskScore, setRiskScore] = useState(28);

  const prefersReducedMotion = usePrefersReducedMotion();
  const { phase: demoPhase, setPhase: setDemoPhase, isAtLeast } = useTrialPhaseMachine({
    active: true,
    initialPhase: "activation",
  });
  const [activeTab, setActiveTab] = useState<"algo" | "options">("algo");
  const [activationStep, setActivationStep] = useState(0);
  const [strategyBrain, setStrategyBrain] = useState(makeStrategyBrain);
  const [climaxOpen, setClimaxOpen] = useState(false);
  const [orderFeedFlash, setOrderFeedFlash] = useState(false);
  const [healthLatency, setHealthLatency] = useState(32);
  const [introNumbersDone, setIntroNumbersDone] = useState(false);
  const [heroPortDisplay, setHeroPortDisplay] = useState(2840000);
  const [heroTodayDisplay, setHeroTodayDisplay] = useState(11800);
  const climaxFiredRef = useRef(false);
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);
  const [highlightLogTime, setHighlightLogTime] = useState<string | null>(null);
  const [brokerConnected, setBrokerConnected] = useState(true);
  const demoRunning = demoPhase !== "activation";
  const marketOpen = isAtLeast("market_scan");
  const marketLabel = marketOpen
    ? "Market Open (simulated) · NSE/BSE live feed"
    : "Pre-open checks (simulated)";
  const brokerLabel = brokerConnected ? "OpenAlgo · session active" : "OpenAlgo · reconnecting";

  useEffect(() => {
    if (demoPhase !== "activation") return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setActivationStep(i);
      if (i >= TRIAL_ACTIVATION_STEPS.length) {
        window.clearInterval(id);
        window.setTimeout(() => setDemoPhase("system_boot"), 450);
      }
    }, 720);
    return () => window.clearInterval(id);
  }, [demoPhase]);

  useEffect(() => {
    if (demoPhase === "system_boot") {
      setBrokerConnected(false);
      const id = window.setTimeout(() => setBrokerConnected(true), 900);
      return () => window.clearTimeout(id);
    }
  }, [demoPhase]);

  useEffect(() => {
    if (!demoRunning) return;
    const id = window.setInterval(() => {
      setHealthLatency(22 + Math.floor(Math.random() * 18));
    }, 2200);
    return () => window.clearInterval(id);
  }, [demoRunning]);

  useEffect(() => {
    if (!demoRunning || !isAtLeast("strategy_analysis")) return;
    const id = window.setInterval(() => {
      setStrategyBrain((prev) => {
        const next = [...prev];
        const activeIdx = next
          .map((r, idx) => ({ r, idx }))
          .filter(({ r }) => r.status === "active");
        if (!activeIdx.length) return prev;
        const pick = activeIdx[Math.floor(Math.random() * activeIdx.length)];
        const { r, idx } = pick;
        const lines = TRIAL_INTEL_LINES[r.stage] ?? TRIAL_INTEL_LINES[1];
        if (r.subLine < lines.length - 1) {
          next[idx] = { ...r, subLine: r.subLine + 1 };
          return next;
        }
        if (r.stage < 4) {
          next[idx] = { ...r, stage: r.stage + 1, subLine: 0 };
          return next;
        }
        next[idx] = { ...r, subLine: 0 };
        if (isAtLeast("market_scan") && demoPhase !== "execution_trigger") {
          setDemoPhase("execution_trigger");
        }
        return next;
      });
    }, 2600);
    return () => window.clearInterval(id);
  }, [demoRunning, demoPhase, isAtLeast, setDemoPhase]);

  // My Strategies state
  const [myStrategies, setMyStrategies] = useState([
    { id: "ms1", name: "Golden Cross Scalper", type: "momentum", pairs: "BTC/USDT, ETH/USDT", timeframe: "5m", riskPerTrade: "1.5%", stopLoss: "0.8%", takeProfit: "2.4%", maxPositions: "3", deployed: true },
    { id: "ms2", name: "RSI Mean Revert", type: "meanrev", pairs: "SOL/USDT, AVAX/USDT", timeframe: "15m", riskPerTrade: "2%", stopLoss: "1.2%", takeProfit: "3%", maxPositions: "2", deployed: false },
    { id: "ms3", name: "Grid Bot ETH", type: "grid", pairs: "ETH/USDT", timeframe: "1m", riskPerTrade: "0.5%", stopLoss: "N/A", takeProfit: "N/A", maxPositions: "20", deployed: true },
  ]);
  const [showStratForm, setShowStratForm] = useState(false);
  const [stratForm, setStratForm] = useState({ name: "", type: "momentum", pairs: "", timeframe: "5m", riskPerTrade: "1", stopLoss: "1", takeProfit: "2", maxPositions: "3" });

  // Developer Request state
  const [showDevRequest, setShowDevRequest] = useState(false);
  const [devForm, setDevForm] = useState({ strategyName: "", description: "", market: "crypto", urgency: "normal", email: "", pdfName: "" });
  const [devRequests, setDevRequests] = useState([
    { id: "dr1", name: "Ichimoku Cloud Breakout", status: "in_progress", submitted: "2026-04-10", eta: "2026-04-18" },
    { id: "dr2", name: "Volume Profile Reversal", status: "completed", submitted: "2026-03-28", eta: "2026-04-05" },
  ]);
  const fileInputRef = useRef(null);
  const [chartData, setChartData] = useState(() => {
    const d = [2400000];
    for (let i = 1; i < 90; i++) d.push(d[i - 1] + (Math.random() - 0.42) * 8000);
    return d;
  });
  const [sparkData] = useState({
    s1: genSparkData(40, 100, 3, 0.3),
    s2: genSparkData(40, 50, 4, 0.5),
    s3: genSparkData(40, 80, 5, 0.2),
  });

  const canvasRef = useRef(null);
  const logRef = useRef(null);

  const addLog = useCallback((type, msg) => {
    const now = new Date();
    setLogs((prev) => {
      const next = [...prev, { type, msg, time: now.toLocaleTimeString("en-US", { hour12: false }) }];
      return next.slice(-50);
    });
  }, []);

  useEffect(() => {
    if (!demoRunning) return;
    if (prefersReducedMotion) {
      setHeroPortDisplay(2847392.58);
      setHeroTodayDisplay(12847.9);
      setIntroNumbersDone(true);
      return;
    }
    setIntroNumbersDone(false);
    setHeroPortDisplay(2840000);
    setHeroTodayDisplay(11800);
    const fromP = 2840000;
    const toP = 2847392.58;
    const fromT = 11800;
    const toT = 12847.9;
    const duration = 1500;
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setHeroPortDisplay(fromP + (toP - fromP) * eased);
      setHeroTodayDisplay(fromT + (toT - fromT) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setIntroNumbersDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demoRunning, prefersReducedMotion]);

  const handleClimaxComplete = useCallback(() => {
    setClimaxOpen(false);
    setOrderFeedFlash(true);
    const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
    setHighlightLogTime(ts);
    addLog("exec", "Condition match detected — position is now live (simulated execution)");
    setDemoPhase("trade_live");
    window.setTimeout(() => setOrderFeedFlash(false), 1600);
    window.setTimeout(() => setHighlightLogTime(null), 2200);
  }, [addLog, setDemoPhase]);

  useEffect(() => {
    if (demoPhase !== "execution_trigger" || climaxFiredRef.current) return;
    const t = window.setTimeout(() => {
      climaxFiredRef.current = true;
      setClimaxOpen(true);
    }, prefersReducedMotion ? 80 : 420);
    return () => window.clearTimeout(t);
  }, [demoPhase, prefersReducedMotion]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setTime(n.toLocaleTimeString("en-US", { hour12: false }) + "." + String(n.getMilliseconds()).padStart(3, "0"));
    }, 50);
    return () => clearInterval(id);
  }, []);

  // Uptime
  useEffect(() => {
    const id = setInterval(() => setUptimeSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Live orders
  useEffect(() => {
    const id = setInterval(() => {
      if (killActive || !demoRunning) return;
      const o = genOrder();
      setOrders((prev) => [o, ...prev].slice(0, 30));
      setHighlightOrderId(o.id);
      addLog(
        "exec",
        `Execution event — ${o.symbol} ${o.qty} @ $${o.price} via ${o.strategy} (your rules → system execution)`
      );
    }, 3000);
    return () => clearInterval(id);
  }, [killActive, addLog, demoRunning]);

  useEffect(() => {
    if (!highlightOrderId) return;
    const id = window.setTimeout(() => setHighlightOrderId(null), 1800);
    return () => window.clearTimeout(id);
  }, [highlightOrderId]);

  // Portfolio animation
  useEffect(() => {
    const id = setInterval(() => {
      if (killActive || !demoRunning || !introNumbersDone) return;
      setPortfolioVal((v) => v + (Math.random() - 0.45) * 2000);
      setTodayPnl((v) => v + (Math.random() - 0.4) * 300);
    }, 5000);
    return () => clearInterval(id);
  }, [killActive, demoRunning, introNumbersDone]);

  // Chart data
  useEffect(() => {
    const id = setInterval(() => {
      if (killActive || !demoRunning) return;
      setChartData((prev) => {
        const n = [...prev, prev[prev.length - 1] + (Math.random() - 0.42) * 5000];
        return n.length > 150 ? n.slice(1) : n;
      });
    }, 2000);
    return () => clearInterval(id);
  }, [killActive, demoRunning]);

  // Risk gauge
  useEffect(() => {
    const id = setInterval(() => setRiskScore(15 + Math.floor(Math.random() * 40)), 10000);
    return () => clearInterval(id);
  }, []);

  // Periodic system logs
  useEffect(() => {
    const id = setInterval(() => {
      if (killActive || !demoRunning) return;
      const msgs = [
        { type: "info", msg: "Heartbeat — All systems nominal" },
        { type: "info", msg: `WebSocket latency: ${Math.floor(Math.random() * 20 + 5)}ms` },
        { type: "exec", msg: `Risk scan complete — Score: ${Math.floor(Math.random() * 30 + 15)}` },
        { type: "info", msg: `Memory usage: ${(Math.random() * 0.5 + 0.9).toFixed(1)} GB` },
      ];
      const m = msgs[Math.floor(Math.random() * msgs.length)];
      addLog(m.type, m.msg);
    }, 8000);
    return () => clearInterval(id);
  }, [killActive, addLog, demoRunning]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Draw chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    if (chartData.length < 2) return;
    const min = Math.min(...chartData) * 0.998;
    const max = Math.max(...chartData) * 1.002;
    const range = max - min;
    const pad = { top: 20, bottom: 30, left: 0, right: 0 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    ctx.strokeStyle = "rgba(56,189,248,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (ch / 5) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const gradient = ctx.createLinearGradient(0, pad.top, 0, h);
    gradient.addColorStop(0, "rgba(56,189,248,0.15)");
    gradient.addColorStop(0.5, "rgba(99,102,241,0.05)");
    gradient.addColorStop(1, "rgba(56,189,248,0)");
    const toX = (i) => pad.left + (i / (chartData.length - 1)) * cw;
    const toY = (v) => pad.top + ch - ((v - min) / range) * ch;

    ctx.beginPath();
    ctx.moveTo(toX(0), h);
    chartData.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(chartData.length - 1), h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    chartData.forEach((v, i) => { if (i === 0) ctx.moveTo(toX(i), toY(v)); else ctx.lineTo(toX(i), toY(v)); });
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    chartData.forEach((v, i) => { if (i === 0) ctx.moveTo(toX(i), toY(v)); else ctx.lineTo(toX(i), toY(v)); });
    ctx.strokeStyle = "rgba(56,189,248,0.3)";
    ctx.lineWidth = 6;
    ctx.stroke();

    const lx = toX(chartData.length - 1), ly = toY(chartData[chartData.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2); ctx.fillStyle = "#38bdf8"; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 10, 0, Math.PI * 2); ctx.fillStyle = "rgba(56,189,248,0.2)"; ctx.fill();

    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "11px Google Sans, sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const val = min + (range / 5) * (5 - i);
      const y = pad.top + (ch / 5) * i;
      ctx.fillText("$" + (val / 1000).toFixed(0) + "k", w - 4, y + 4);
    }
  }, [chartData]);

  const formatUptime = (s) => {
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  };

  const handleKillSwitch = () => {
    setKillActive((prev) => {
      if (!prev) addLog("error", "KILL SWITCH ACTIVATED — All strategies halted, open orders cancelled");
      else addLog("info", "Kill switch deactivated — Systems resuming");
      return !prev;
    });
  };

  const riskColor = riskScore < 30 ? "var(--accent-green)" : riskScore < 60 ? "var(--accent-yellow)" : "var(--accent-red)";
  const riskLabel = riskScore < 30 ? "Low" : riskScore < 60 ? "Medium" : "High";

  const activationMilestone =
    activationStep <= 0
      ? { pct: 0, label: "Your strategy is being converted into a live, executable system…" }
      : TRIAL_ACTIVATION_STEPS[Math.min(activationStep - 1, TRIAL_ACTIVATION_STEPS.length - 1)];

  const pulseClass = prefersReducedMotion ? "" : " trial-card-pulse";

  return (
    <div className="trial-mock-dashboard">
      <div className="bg-grid" />
      <div className="bg-orbs">
        <div className="orb orb-1" /><div className="orb orb-2" /><div className="orb orb-3" />
      </div>
      <div className="scanlines" />

      {demoPhase === "activation" ? (
        <ActivationOverlay progress={activationMilestone.pct} statusLine={activationMilestone.label} />
      ) : null}
      <ExecutionClimaxOverlay
        open={climaxOpen}
        reducedMotion={prefersReducedMotion}
        onComplete={handleClimaxComplete}
      />

      <div className={`app trial-app-shell${demoRunning ? " trial-app-shell--visible" : ""}`}>
        {/* NAV */}
        <nav className="topnav">
          <div className="logo">
            <div className="logo-icon"><TradingSmartLogo size={32} /></div>
            <div className="logo-text">
              <span className="logo-text-main">TRADINGSMART.AI</span>
              <span className="logo-text-sub">ALGO TRADING ENGINE</span>
            </div>
          </div>
          <div className="nav-status">
            <div className="status-item"><div className="status-dot live" /> Exchange Connected</div>
            <div className="status-item"><div className="status-dot live" /> WebSocket Active</div>
            <div className="status-item"><div className="status-dot warn" /> 2 Alerts</div>
            <div className="nav-time">{time}</div>
          </div>
        </nav>
        <SystemHealthStrip
          latencyMs={healthLatency}
          executionActive={demoRunning && !killActive}
          brokerConnected={brokerConnected}
          riskFiltersEnabled={!killActive}
        />

        <div className="main">
          <TrialDemoShell
            activeTab={activeTab}
            onTabChange={setActiveTab}
            marketLabel={marketLabel}
            brokerLabel={brokerLabel}
            marketOpen={marketOpen}
          >
          {activeTab === "algo" ? (
            <>
          {/* HERO */}
          <div className="hero">
            <div className={`hero-card${pulseClass}`}>
              <div className="hero-label">Total Portfolio Value</div>
              <div className="hero-value neutral">
                $
                {(introNumbersDone ? portfolioVal : heroPortDisplay).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="hero-change up">&#9650; +$23,841.20 (0.84%) today</div>
              <Sparkline data={sparkData.s1} color="#38bdf8" />
            </div>
            <div className={`hero-card${pulseClass}`}>
              <div className="hero-label">Algo Cumulative P&L</div>
              <div className="hero-value positive">+$384,291.43</div>
              <div className="hero-change up">&#9650; +$8,412.30 (2.24%) this week</div>
              <Sparkline data={sparkData.s2} color="#34d399" />
            </div>
            <div className={`hero-card${pulseClass}`}>
              <div className="hero-label">Today's Algo P&L</div>
              <div className="hero-value positive">
                {(introNumbersDone ? todayPnl : heroTodayDisplay) >= 0 ? "+" : ""}$
                {Math.abs(introNumbersDone ? todayPnl : heroTodayDisplay).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="hero-change up">&#9650; 47 trades executed | 76% win rate</div>
              <Sparkline data={sparkData.s3} color="#34d399" />
            </div>
          </div>

          {/* STATS */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Win Rate</div>
              <div className="stat-value" style={{ color: "var(--accent-green)" }}>76.4%</div>
              <div className="progress-container">
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "76.4%", background: "linear-gradient(90deg,var(--accent-green),var(--accent-cyan))" }} /></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Sharpe Ratio</div>
              <div className="stat-value" style={{ color: "var(--accent-cyan)" }}>2.41</div>
              <div className="progress-container">
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "80%", background: "linear-gradient(90deg,var(--accent-cyan),var(--accent-blue))" }} /></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Max Drawdown</div>
              <div className="stat-value" style={{ color: "var(--accent-orange)" }}>-4.2%</div>
              <div className="progress-container">
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "42%", background: "linear-gradient(90deg,var(--accent-yellow),var(--accent-orange))" }} /></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active Positions</div>
              <div className="stat-value" style={{ color: "var(--accent-purple)" }}>14</div>
              <div className="progress-container">
                <div className="progress-label"><span>Exposure</span><span>68%</span></div>
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "68%", background: "linear-gradient(90deg,var(--accent-purple),var(--accent-blue))" }} /></div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Trade Duration</div>
              <div className="stat-value" style={{ color: "var(--text-primary)" }}>4m 32s</div>
              <div className="progress-container">
                <div className="progress-label"><span>Latency</span><span>12ms</span></div>
                <div className="progress-bar-bg"><div className="progress-bar-fill" style={{ width: "12%", background: "linear-gradient(90deg,var(--accent-green),var(--accent-cyan))" }} /></div>
              </div>
            </div>
          </div>

          {/* DASHBOARD */}
          <div className="dashboard">
            {/* ROBOT COMMAND CENTER */}
            <div className={`card robot-panel${pulseClass}`}>
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(56,189,248,0.1)", color: "var(--accent-cyan)" }}>&#x1F916;</span>
                  Robot Command Center
                </div>
                <span className="card-badge badge-green">{killActive ? "&#x25CF; OFFLINE" : "&#x25CF; ONLINE"}</span>
              </div>
              <div className="robot-grid">
                <div className="robot-avatar">
                  <div className="robot-ring"><div className="robot-face">&#x1F916;</div></div>
                  <div className="robot-name">TSA-7</div>
                  <div className="robot-status-text">
                    <div className={`status-dot ${killActive ? "warn" : "live"}`} />
                    {killActive ? "All Systems Halted" : "Actively Trading"}
                  </div>
                </div>
                <div className="robot-metrics">
                  <div className="metric-row"><span className="metric-label">CPU Load</span><span className="metric-value" style={{ color: "var(--accent-green)" }}>23%</span></div>
                  <div className="metric-row"><span className="metric-label">Memory Usage</span><span className="metric-value" style={{ color: "var(--accent-cyan)" }}>1.2 GB / 8 GB</span></div>
                  <div className="metric-row"><span className="metric-label">Orders/Sec</span><span className="metric-value" style={{ color: "var(--accent-purple)" }}>847</span></div>
                  <div className="metric-row"><span className="metric-label">Strategies Running</span><span className="metric-value" style={{ color: "var(--accent-yellow)" }}>{killActive ? "0 / 8" : "5 / 8"}</span></div>
                  <div className="metric-row"><span className="metric-label">Uptime</span><span className="metric-value" style={{ color: "var(--text-primary)" }}>{formatUptime(uptimeSec)}</span></div>
                  <div className="metric-row"><span className="metric-label">API Rate Limit</span><span className="metric-value" style={{ color: "var(--accent-green)" }}>32% used</span></div>
                </div>
                <div className="robot-actions">
                  <div className="kill-switch-container">
                    <button className={`kill-switch ${killActive ? "active" : ""}`} onClick={handleKillSwitch}>
                      <span className="kill-icon">{killActive ? "\u26D4" : "\u26A0"}</span>
                      <span className="kill-text">{killActive ? "ACTIVATED" : "KILL SWITCH"}</span>
                    </button>
                    <div className="kill-label"><span>Emergency Stop</span><br />Halts all strategies & cancels orders</div>
                  </div>
                  <button className="action-btn btn-warning" onClick={() => addLog("warn", "Pause command issued — Pausing all strategies...")}>&#x23F8; Pause All Strategies</button>
                  <button className="action-btn btn-primary" onClick={() => addLog("info", "Portfolio rebalance initiated — Analyzing allocations...")}>&#x21BB; Rebalance Portfolio</button>
                </div>
              </div>
            </div>

            {/* STRATEGIES */}
            <div className={`card${pulseClass}`}>
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(167,139,250,0.1)", color: "var(--accent-purple)" }}>&#x1F9E0;</span>
                  Active Strategies
                </div>
                <span className="card-badge badge-blue">5 Running</span>
              </div>
              <table className="strategy-table">
                <thead><tr><th>Strategy & system read</th><th>Status</th><th>Trades</th><th>P&L</th><th>Win %</th></tr></thead>
                <tbody>
                  {strategyBrain.map((s) => (
                    <tr key={s.name}>
                      <td>
                        <StrategyIntelCell row={s} />
                      </td>
                      <td><span className={`strategy-tag ${s.status === "active" ? "tag-active" : "tag-paused"}`}>{s.status.toUpperCase()}</span></td>
                      <td>{s.trades.toLocaleString()}</td>
                      <td style={{ color: s.pnlColor }}>{s.pnl}</td>
                      <td style={{ color: s.winColor }}>{s.win}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="risk-gauge">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="gauge-score" style={{ color: riskColor }}>{riskScore}</div>
                  <div className="gauge-label-text">Risk Score — {riskLabel}</div>
                </div>
              </div>
            </div>

            {/* LIVE ORDERS */}
            <div className={`card${orderFeedFlash ? " trial-order-feed--flash" : ""}${pulseClass}`}>
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(52,211,153,0.1)", color: "var(--accent-green)" }}>&#x26A1;</span>
                  Live Order Feed
                </div>
                <span className="card-badge badge-green">Real-time</span>
              </div>
              <div className="order-feed">
                {orders.map((o) => (
                  <div className={`order-item ${highlightOrderId === o.id ? "trial-order-item-new" : ""}`} key={o.id}>
                    <div className={`order-icon ${o.type}`}>{o.type === "buy" ? "\u25B2" : "\u25BC"}</div>
                    <div>
                      <div className="order-pair">{o.symbol} <span style={{ color: o.type === "buy" ? "var(--accent-green)" : "var(--accent-red)", fontSize: 11, textTransform: "uppercase" }}>{o.type}</span></div>
                      <div className="order-meta">{o.strategy} &bull; {o.qty} @ ${o.price}</div>
                    </div>
                    <div>
                      <div className="order-pnl" style={{ color: o.pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{o.pnl >= 0 ? "+" : ""}${Math.abs(o.pnl).toFixed(2)}</div>
                      <div className="order-time">{o.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ═══ MY STRATEGY PANEL ═══ */}
            <div className="card my-strategy-panel">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(56,189,248,0.1)", color: "var(--accent-cyan)" }}>&#x1F3AF;</span>
                  My Strategies
                </div>
                <span className="card-badge badge-blue">{myStrategies.length} Saved</span>
              </div>
              <div className="strategy-builder">
                {/* Left: Strategy Cards */}
                <div className="strategy-cards">
                  {myStrategies.map((s) => (
                    <div className="my-strat-card" key={s.id}>
                      <div className="my-strat-card-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="my-strat-card-name">{s.name}</span>
                          <span className={`my-strat-card-type type-${s.type}`}>{s.type.toUpperCase()}</span>
                        </div>
                        {s.deployed && <span className="strat-deployed-badge"><span className="status-dot live" style={{ width: 6, height: 6 }} /> LIVE</span>}
                      </div>
                      <div className="my-strat-params">
                        <div className="my-strat-param"><span className="my-strat-param-label">Pairs</span><span className="my-strat-param-value">{s.pairs}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Timeframe</span><span className="my-strat-param-value">{s.timeframe}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Risk/Trade</span><span className="my-strat-param-value">{s.riskPerTrade}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Stop Loss</span><span className="my-strat-param-value">{s.stopLoss}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Take Profit</span><span className="my-strat-param-value">{s.takeProfit}</span></div>
                        <div className="my-strat-param"><span className="my-strat-param-label">Max Pos</span><span className="my-strat-param-value">{s.maxPositions}</span></div>
                      </div>
                      <div className="my-strat-actions">
                        {!s.deployed ? (
                          <button className="strat-action-btn strat-btn-deploy" onClick={() => {
                            setMyStrategies((prev) => prev.map((x) => x.id === s.id ? { ...x, deployed: true } : x));
                            addLog("exec", `Strategy "${s.name}" deployed to live trading`);
                          }}>&#x25B6; Deploy</button>
                        ) : (
                          <button className="strat-action-btn strat-btn-edit" onClick={() => {
                            setMyStrategies((prev) => prev.map((x) => x.id === s.id ? { ...x, deployed: false } : x));
                            addLog("warn", `Strategy "${s.name}" stopped`);
                          }}>&#x23F9; Stop</button>
                        )}
                        <button className="strat-action-btn strat-btn-edit">&#x270E; Edit</button>
                        <button className="strat-action-btn strat-btn-delete" onClick={() => {
                          setMyStrategies((prev) => prev.filter((x) => x.id !== s.id));
                          addLog("warn", `Strategy "${s.name}" deleted`);
                        }}>&#x2715; Delete</button>
                      </div>
                    </div>
                  ))}
                  <button className="btn-add-strategy" onClick={() => setShowStratForm(true)}>+ Create New Strategy</button>
                </div>

                {/* Right: Create Strategy Form OR Dev Request */}
                <div>
                  {showStratForm && (
                    <div style={{ padding: 20, borderRadius: 12, background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span>&#x2699;</span> New Strategy Configuration
                      </div>
                      <div className="strategy-form">
                        <div className="form-group">
                          <label className="form-label">Strategy Name</label>
                          <input className="form-input" placeholder="e.g. MACD Crossover Pro" value={stratForm.name}
                            onChange={(e) => setStratForm({ ...stratForm, name: e.target.value })} />
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Type</label>
                            <select className="form-select" value={stratForm.type}
                              onChange={(e) => setStratForm({ ...stratForm, type: e.target.value })}>
                              <option value="momentum">Momentum</option>
                              <option value="meanrev">Mean Reversion</option>
                              <option value="grid">Grid</option>
                              <option value="scalp">Scalping</option>
                              <option value="arb">Arbitrage</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Timeframe</label>
                            <select className="form-select" value={stratForm.timeframe}
                              onChange={(e) => setStratForm({ ...stratForm, timeframe: e.target.value })}>
                              <option value="1m">1 Minute</option>
                              <option value="5m">5 Minutes</option>
                              <option value="15m">15 Minutes</option>
                              <option value="1h">1 Hour</option>
                              <option value="4h">4 Hours</option>
                              <option value="1d">1 Day</option>
                            </select>
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Trading Pairs</label>
                          <input className="form-input" placeholder="BTC/USDT, ETH/USDT" value={stratForm.pairs}
                            onChange={(e) => setStratForm({ ...stratForm, pairs: e.target.value })} />
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Risk Per Trade (%)</label>
                            <input className="form-input" type="number" step="0.1" value={stratForm.riskPerTrade}
                              onChange={(e) => setStratForm({ ...stratForm, riskPerTrade: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Max Positions</label>
                            <input className="form-input" type="number" value={stratForm.maxPositions}
                              onChange={(e) => setStratForm({ ...stratForm, maxPositions: e.target.value })} />
                          </div>
                        </div>
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Stop Loss (%)</label>
                            <input className="form-input" type="number" step="0.1" value={stratForm.stopLoss}
                              onChange={(e) => setStratForm({ ...stratForm, stopLoss: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Take Profit (%)</label>
                            <input className="form-input" type="number" step="0.1" value={stratForm.takeProfit}
                              onChange={(e) => setStratForm({ ...stratForm, takeProfit: e.target.value })} />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                          <button className="action-btn btn-primary" style={{ flex: 1 }} onClick={() => {
                            if (!stratForm.name) return;
                            const ns = { id: "ms" + Date.now(), ...stratForm, riskPerTrade: stratForm.riskPerTrade + "%", stopLoss: stratForm.stopLoss + "%", takeProfit: stratForm.takeProfit + "%", deployed: false };
                            setMyStrategies((prev) => [...prev, ns]);
                            setStratForm({ name: "", type: "momentum", pairs: "", timeframe: "5m", riskPerTrade: "1", stopLoss: "1", takeProfit: "2", maxPositions: "3" });
                            setShowStratForm(false);
                            addLog("info", `New strategy "${ns.name}" created`);
                          }}>&#x2714; Save Strategy</button>
                          <button className="action-btn btn-warning" style={{ flex: 0.5 }} onClick={() => setShowStratForm(false)}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {!showStratForm && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ padding: 20, borderRadius: 12, background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: "var(--text-primary)" }}>Quick Stats</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>Your strategy portfolio at a glance</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div className="my-strat-param"><span className="my-strat-param-label">Total</span><span className="my-strat-param-value">{myStrategies.length}</span></div>
                          <div className="my-strat-param"><span className="my-strat-param-label">Live</span><span className="my-strat-param-value" style={{ color: "var(--accent-green)" }}>{myStrategies.filter((s) => s.deployed).length}</span></div>
                          <div className="my-strat-param"><span className="my-strat-param-label">Stopped</span><span className="my-strat-param-value" style={{ color: "var(--accent-yellow)" }}>{myStrategies.filter((s) => !s.deployed).length}</span></div>
                          <div className="my-strat-param"><span className="my-strat-param-label">In Dev</span><span className="my-strat-param-value" style={{ color: "var(--accent-purple)" }}>{devRequests.filter((d) => d.status === "in_progress").length}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ═══ REQUEST DEVELOPER TO CODE STRATEGY ═══ */}
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(167,139,250,0.1)", color: "var(--accent-purple)" }}>&#x1F4BB;</span>
                  Request Strategy Development
                </div>
                <button className="action-btn btn-primary" style={{ padding: "6px 16px", fontSize: 12 }}
                  onClick={() => setShowDevRequest(!showDevRequest)}>
                  {showDevRequest ? "Close" : "+ New Request"}
                </button>
              </div>

              {showDevRequest && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
                  <div className="strategy-form">
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, padding: "10px 14px", borderRadius: 10,
                      background: "rgba(167,139,250,0.05)", border: "1px solid rgba(167,139,250,0.1)", marginBottom: 4 }}>
                      Submit your trading strategy idea to our development team. Upload a PDF document with your strategy rules, entry/exit conditions, indicators used, and risk parameters. Our developers will code it into a production-ready algorithm.
                    </div>
                    <div className="form-group">
                      <label className="form-label">Strategy Name</label>
                      <input className="form-input" placeholder="e.g. Fibonacci Retracement Scalper" value={devForm.strategyName}
                        onChange={(e) => setDevForm({ ...devForm, strategyName: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Strategy Description</label>
                      <textarea className="form-input form-textarea" placeholder="Describe your strategy logic, entry/exit rules, indicators, timeframes, and any special conditions..."
                        value={devForm.description} onChange={(e) => setDevForm({ ...devForm, description: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Market</label>
                        <select className="form-select" value={devForm.market}
                          onChange={(e) => setDevForm({ ...devForm, market: e.target.value })}>
                          <option value="crypto">Crypto</option>
                          <option value="forex">Forex</option>
                          <option value="stocks">Stocks</option>
                          <option value="options">Options</option>
                          <option value="futures">Futures</option>
                          <option value="commodities">Commodities</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Priority</label>
                        <select className="form-select" value={devForm.urgency}
                          onChange={(e) => setDevForm({ ...devForm, urgency: e.target.value })}>
                          <option value="normal">Normal (7-10 days)</option>
                          <option value="priority">Priority (3-5 days)</option>
                          <option value="rush">Rush (1-2 days)</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Contact Email</label>
                      <input className="form-input" type="email" placeholder="you@example.com" value={devForm.email}
                        onChange={(e) => setDevForm({ ...devForm, email: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Upload Strategy Document (PDF)</label>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setDevForm({ ...devForm, pdfName: file.name });
                          }} />
                        <button className="action-btn btn-primary" style={{ padding: "10px 20px", fontSize: 12 }}
                          onClick={() => fileInputRef.current?.click()}>
                          &#x1F4CE; Choose PDF File
                        </button>
                        {devForm.pdfName ? (
                          <span style={{ fontSize: 12, color: "var(--accent-green)", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 6 }}>
                            &#x2714; {devForm.pdfName}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>No file selected</span>
                        )}
                      </div>
                    </div>
                    <button className="action-btn btn-primary" style={{ padding: 14, fontSize: 14, marginTop: 4,
                      background: "linear-gradient(135deg,rgba(167,139,250,0.2),rgba(99,102,241,0.2))",
                      borderColor: "rgba(167,139,250,0.4)", color: "var(--accent-purple)" }}
                      onClick={() => {
                        if (!devForm.strategyName) return;
                        setDevRequests((prev) => [...prev, {
                          id: "dr" + Date.now(), name: devForm.strategyName, status: "submitted",
                          submitted: new Date().toISOString().slice(0, 10),
                          eta: new Date(Date.now() + (devForm.urgency === "rush" ? 2 : devForm.urgency === "priority" ? 5 : 10) * 86400000).toISOString().slice(0, 10),
                        }]);
                        addLog("info", `Strategy development request submitted: "${devForm.strategyName}"`);
                        setDevForm({ strategyName: "", description: "", market: "crypto", urgency: "normal", email: "", pdfName: "" });
                        setShowDevRequest(false);
                      }}>
                      &#x1F680; Submit Development Request
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ padding: 16, borderRadius: 12, background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>What to Include in Your PDF</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {["Entry & exit conditions with specific indicators", "Timeframe and trading pairs/assets", "Position sizing and risk management rules",
                          "Stop loss & take profit logic", "Any special conditions or filters", "Backtesting results (if available)"].map((item, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <span style={{ color: "var(--accent-cyan)", fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>&#x2022;</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ padding: 16, borderRadius: 12, background: "rgba(15,23,42,0.5)", border: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>Pricing</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {[{ label: "Normal", price: "$499", time: "7-10 days" }, { label: "Priority", price: "$899", time: "3-5 days" }, { label: "Rush", price: "$1,499", time: "1-2 days" }].map((p) => (
                          <div key={p.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 8px",
                            borderRadius: 6, background: "rgba(0,0,0,0.2)" }}>
                            <span style={{ color: "var(--text-muted)" }}>{p.label} ({p.time})</span>
                            <span style={{ color: "var(--accent-cyan)", fontFamily: "inherit", fontWeight: 600 }}>{p.price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Previous Requests */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
                  Development Requests
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                  {devRequests.map((r) => (
                    <div key={r.id} style={{ padding: 14, borderRadius: 10, background: "rgba(15,23,42,0.4)",
                      border: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "inherit" }}>
                          Submitted: {r.submitted} &bull; ETA: {r.eta}
                        </div>
                      </div>
                      <span className={`strategy-tag ${r.status === "completed" ? "tag-active" : r.status === "in_progress" ? "tag-paused" : ""}`}
                        style={r.status === "submitted" ? { background: "rgba(56,189,248,0.12)", color: "var(--accent-cyan)" } : {}}>
                        {r.status === "completed" ? "DELIVERED" : r.status === "in_progress" ? "IN PROGRESS" : "SUBMITTED"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <RecentExecutionsPanel />
            <ControlReassuranceBar />

            {/* P&L CHART */}
            <div className={`card${pulseClass}`} style={{ gridColumn: "1 / -1" }}>
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(99,102,241,0.1)", color: "var(--accent-blue)" }}>&#x1F4C8;</span>
                  Equity Curve & Drawdown
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["1D", "1W", "1M", "ALL"].map((r) => (
                    <button key={r} className="action-btn btn-primary" style={{ padding: "6px 14px", fontSize: 11 }}
                      onClick={() => { const d = [2400000]; const n = { "1D": 24, "1W": 50, "1M": 90, ALL: 200 }[r]; for (let i = 1; i < n; i++) d.push(d[i - 1] + (Math.random() - 0.42) * 8000); setChartData(d); }}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-area">
                <canvas ref={canvasRef} className="chart-canvas" />
              </div>
            </div>

            {/* ACTIVITY LOG */}
            <div className="card activity-log">
              <div className="card-header">
                <div className="card-title">
                  <span className="card-title-icon" style={{ background: "rgba(251,191,36,0.1)", color: "var(--accent-yellow)" }}>&#x1F4CB;</span>
                  System Activity Log
                </div>
                <span className="card-badge badge-yellow">Live</span>
              </div>
              <div className="log-entries" ref={logRef}>
                {logs.map((l, i) => (
                  <div className={`log-entry ${highlightLogTime === l.time ? "trial-log-entry-new" : ""}`} key={i}>
                    <span className="log-time">{l.time || new Date().toLocaleTimeString("en-US", { hour12: false })}</span>
                    <span className={`log-type ${l.type}`}>[{l.type.toUpperCase()}]</span>
                    <span className="log-msg">{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </>
          ) : (
            <OptionsDemoPane />
          )}
          <ParityMatrixPanel />
          </TrialDemoShell>
        </div>
      </div>
    </div>
  );
}
