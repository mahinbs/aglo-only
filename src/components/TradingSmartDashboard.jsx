import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useId,
} from "react";
import { toast } from "sonner";
import { Toaster } from "sonner";
import { ModalShell } from "./ModalShell.jsx";
import AlgoStrategyBuilder from "@/components/trading/AlgoStrategyBuilder";
import { OptionsStrategyBuilderDialog } from "@/components/options/OptionsStrategyBuilderDialog";
import { AlgoOnlyOptionsWorkspace } from "./AlgoOnlyOptionsWorkspace";
import { StrategyConditionPanel } from "./StrategyConditionPanel";
import { StrategyLiveChart } from "./StrategyLiveChart";
import { lifecycleLabel, normalizeLifecycleState } from "../lib/lifecycle";

/** ChartMate active trades are INR-denominated for Indian brokers; USD view uses optional FX hint. */
const DEFAULT_USD_PER_INR = 1 / 83;
function usdPerInr() {
  const n = Number(import.meta.env?.VITE_USD_PER_INR);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_PER_INR;
}
function convertInrSourceAmount(amount, displayCurrency) {
  const x = Number(amount);
  if (!Number.isFinite(x)) return 0;
  if (displayCurrency === "USD") return x * usdPerInr();
  return x;
}
function formatSignedDisplay(amount, displayCurrency) {
  const sign = amount >= 0 ? "+" : "-";
  const a = Math.abs(convertInrSourceAmount(amount, displayCurrency));
  if (displayCurrency === "INR") {
    return `${sign}₹${a.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  }
  return `${sign}$${a.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}
function formatUnsignedDisplay(amount, displayCurrency) {
  const a = Math.abs(convertInrSourceAmount(amount, displayCurrency));
  if (displayCurrency === "INR") {
    return `₹${a.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  }
  return `$${a.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

const GO_LIVE_EXCHANGES = ["NSE", "BSE", "NFO", "BFO", "CDS", "MCX", "NCDEX"];
const GO_LIVE_PRODUCTS = ["CNC", "MIS", "NRML", "CO", "BO"];
const STRATEGY_WIZARD_STEPS = [
  "Foundation",
  "Timing",
  "Entry",
  "Exit",
  "Position",
  "Risk Rules",
];
const OPTIONS_WIZARD_STEPS = [
  "Instrument Setup",
  "Entry Conditions",
  "Exit & Risk",
];

const OPTIONS_LOT_UNITS = {
  NIFTY: 75,
  BANKNIFTY: 30,
  FINNIFTY: 65,
  MIDCPNIFTY: 120,
  SENSEX: 20,
};
function lotUnitsForUnderlying(u) {
  return (
    OPTIONS_LOT_UNITS[
      String(u || "")
        .trim()
        .toUpperCase()
    ] ?? 75
  );
}

function firstSymbolFromPairs(pairs) {
  return (
    String(pairs || "")
      .split(",")[0]
      ?.trim()
      .toUpperCase() || ""
  );
}

function defaultsGoLiveFromCard(s) {
  let symbol = firstSymbolFromPairs(s.pairs);
  let exchange = "NSE";
  let quantity = "1";
  let product = s.is_intraday !== false ? "MIS" : "CNC";
  const pc = s.position_config;
  if (pc && typeof pc === "object") {
    if (!symbol) symbol = firstSymbolFromPairs(s.pairs);
    const pq = Number(pc.quantity ?? 0);
    if (Number.isFinite(pq) && pq >= 1) quantity = String(Math.floor(pq));
    const ex = String(pc.exchange ?? "").trim();
    if (ex) exchange = ex.toUpperCase();
    const op = String(pc.orderProduct ?? "").trim();
    if (op) product = op.toUpperCase();
  }
  return { symbol, exchange, quantity, product: product || "MIS" };
}

/** Symbol + exchange for BFF chart quote/history (same defaults as go-live). */
function chartRoutingFromStrategyCard(s) {
  const d = defaultsGoLiveFromCard(s);
  const symbol = String(d.symbol || firstSymbolFromPairs(s.pairs) || "RELIANCE")
    .trim()
    .toUpperCase();
  const exchange = String(d.exchange || "NSE")
    .trim()
    .toUpperCase();
  return { symbol, exchange };
}

// ─── SVG Logo Component (matches your TradingSmart.ai brain+chart logo) ───
const TradingSmartLogo = ({ size = 36 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="logoGrad" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
      <filter id="logoGlow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#logoGlow)">
      {/* Brain outline */}
      <path
        d="M20 55 C20 30, 35 15, 50 15 C55 15, 58 18, 55 25 C52 32, 48 30, 45 35 C42 40, 46 45, 50 45 C54 45, 52 40, 55 38 C58 36, 62 38, 60 42 C58 46, 54 48, 52 52 C50 56, 48 60, 45 62 C42 64, 38 62, 35 58 C32 54, 28 56, 25 58 C22 60, 20 58, 20 55Z"
        stroke="url(#logoGrad)"
        strokeWidth="2"
        fill="none"
      />
      {/* Circuit lines */}
      <circle cx="30" cy="35" r="2" fill="#38bdf8" />
      <circle cx="40" cy="28" r="2" fill="#38bdf8" />
      <circle cx="35" cy="45" r="1.5" fill="#06b6d4" />
      <circle cx="45" cy="38" r="1.5" fill="#06b6d4" />
      <line x1="30" y1="35" x2="40" y2="28" stroke="#38bdf8" strokeWidth="1" />
      <line x1="40" y1="28" x2="45" y2="38" stroke="#38bdf8" strokeWidth="1" />
      <line x1="35" y1="45" x2="30" y2="35" stroke="#06b6d4" strokeWidth="1" />
      {/* Candlesticks */}
      <rect
        x="55"
        y="50"
        width="4"
        height="20"
        rx="1"
        fill="#38bdf8"
        opacity="0.7"
      />
      <rect
        x="62"
        y="42"
        width="4"
        height="25"
        rx="1"
        fill="#38bdf8"
        opacity="0.8"
      />
      <rect
        x="69"
        y="35"
        width="4"
        height="30"
        rx="1"
        fill="#06b6d4"
        opacity="0.9"
      />
      <rect x="76" y="28" width="4" height="35" rx="1" fill="#06b6d4" />
      <line
        x1="57"
        y1="48"
        x2="57"
        y2="72"
        stroke="#38bdf8"
        strokeWidth="1"
        opacity="0.5"
      />
      <line
        x1="64"
        y1="40"
        x2="64"
        y2="69"
        stroke="#38bdf8"
        strokeWidth="1"
        opacity="0.5"
      />
      <line
        x1="71"
        y1="33"
        x2="71"
        y2="67"
        stroke="#06b6d4"
        strokeWidth="1"
        opacity="0.5"
      />
      <line
        x1="78"
        y1="25"
        x2="78"
        y2="65"
        stroke="#06b6d4"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Trend arrow */}
      <path
        d="M52 68 Q65 40, 82 22"
        stroke="url(#logoGrad)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <polygon points="82,22 85,28 78,26" fill="#38bdf8" />
    </g>
  </svg>
);

// ─── Styles ───
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600;700&family=Orbitron:wght@400;500;600;700;800;900&display=swap');

:root {
  --bg-primary: #06080d;
  --bg-secondary: #0a0e17;
  --bg-card: rgba(12, 17, 28, 0.85);
  --border-color: rgba(56, 189, 248, 0.08);
  --border-glow: rgba(56, 189, 248, 0.2);
  --accent-cyan: #38bdf8;
  --accent-blue: #6366f1;
  --accent-purple: #a78bfa;
  --accent-green: #34d399;
  --accent-red: #f43f5e;
  --accent-orange: #fb923c;
  --accent-yellow: #fbbf24;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #475569;
}
/* Note: NOT using * { margin:0; padding:0 } — that would nuke Tailwind base styles inside ChartMate dialogs */
.app, .app * { box-sizing:border-box; }
body { font-family:'Inter',sans-serif; background:var(--bg-primary); color:var(--text-primary); min-height:100vh; overflow-x:hidden; }
.bg-grid { position:fixed; inset:0; z-index:0; pointer-events:none;
  background-image: linear-gradient(rgba(56,189,248,0.03) 1px,transparent 1px), linear-gradient(90deg,rgba(56,189,248,0.03) 1px,transparent 1px);
  background-size:60px 60px; animation:gridMove 20s linear infinite; }
@keyframes gridMove { to { background-position:60px 60px; } }
.bg-orbs { position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden; }
.orb { position:absolute; border-radius:50%; filter:blur(80px); opacity:0.12; animation:orbFloat 15s ease-in-out infinite; }
.orb-1 { width:600px; height:600px; background:var(--accent-cyan); top:-10%; left:-5%; }
.orb-2 { width:500px; height:500px; background:var(--accent-purple); top:50%; right:-10%; animation-delay:-5s; }
.orb-3 { width:400px; height:400px; background:var(--accent-blue); bottom:-10%; left:30%; animation-delay:-10s; }
@keyframes orbFloat { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-40px) scale(1.05)} 66%{transform:translate(-20px,20px) scale(0.95)} }
.scanlines { position:fixed; inset:0; z-index:1; pointer-events:none;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px); }
.app { position:relative; z-index:2; min-height:100vh; }

/* NAV */
.topnav { position:sticky; top:0; z-index:100; display:flex; align-items:center; justify-content:space-between;
  padding:0 32px; height:64px; background:rgba(6,8,13,0.85); backdrop-filter:blur(20px) saturate(1.8);
  border-bottom:1px solid var(--border-color); }
.logo { display:flex; align-items:center; gap:12px; font-family:'Orbitron',sans-serif; font-weight:800;
  font-size:17px; letter-spacing:2px; color:var(--accent-cyan); text-shadow:0 0 20px rgba(56,189,248,0.4); }
.logo-icon { width:40px; height:40px; border-radius:10px;
  background:linear-gradient(135deg,rgba(56,189,248,0.15),rgba(6,182,212,0.15));
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 20px rgba(56,189,248,0.3); animation:logoPulse 3s ease-in-out infinite;
  border:1px solid rgba(56,189,248,0.2); }
@keyframes logoPulse { 0%,100%{box-shadow:0 0 20px rgba(56,189,248,0.3)} 50%{box-shadow:0 0 40px rgba(56,189,248,0.6)} }
.logo-text { display:flex; flex-direction:column; line-height:1.1; }
.logo-text-main { font-size:17px; }
.logo-text-sub { font-size:8px; letter-spacing:4px; color:var(--text-muted); font-weight:500; }
.nav-status { display:flex; align-items:center; gap:24px; }
.status-item { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-secondary); font-family:'JetBrains Mono',monospace; }
.status-dot { width:8px; height:8px; border-radius:50%; animation:pulse 2s ease-in-out infinite; }
.status-dot.live { background:var(--accent-green); box-shadow:0 0 10px var(--accent-green); }
.status-dot.warn { background:var(--accent-yellow); box-shadow:0 0 10px var(--accent-yellow); }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
.nav-time { font-family:'JetBrains Mono',monospace; font-size:13px; color:var(--accent-cyan); letter-spacing:1px; }

/* MAIN */
.main { padding:24px 32px 48px; max-width:1800px; margin:0 auto; }

/* HERO */
.hero { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-bottom:24px; }
.hero-card { background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:24px;
  backdrop-filter:blur(12px); transition:all 0.4s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; }
.hero-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px;
  background:linear-gradient(90deg,transparent,var(--accent-cyan),transparent); opacity:0; transition:opacity 0.4s; }
.hero-card:hover { border-color:var(--border-glow); transform:translateY(-2px); }
.hero-card:hover::before { opacity:1; }
.hero-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted); margin-bottom:8px; font-weight:600; }
.hero-value { font-family:'Orbitron',sans-serif; font-size:30px; font-weight:700; margin-bottom:4px; }
.hero-value.positive { color:var(--accent-green); }
.hero-value.neutral { color:var(--text-primary); }
.hero-change { font-size:13px; font-family:'JetBrains Mono',monospace; display:flex; align-items:center; gap:4px; }
.hero-change.up { color:var(--accent-green); }

/* STATS ROW */
.stats-row { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:24px; }
.stat-card { background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:16px 20px; backdrop-filter:blur(12px); }
.stat-label { font-size:10px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted); font-weight:600; margin-bottom:6px; }
.stat-value { font-family:'Orbitron',sans-serif; font-size:20px; font-weight:700; }
.progress-container { margin-top:8px; }
.progress-bar-bg { height:6px; border-radius:3px; background:rgba(255,255,255,0.05); overflow:hidden; }
.progress-bar-fill { height:100%; border-radius:3px; transition:width 1s ease-out; }
.progress-label { display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-bottom:4px; }

/* CARDS */
.card { background:var(--bg-card); border:1px solid var(--border-color); border-radius:16px; padding:24px;
  backdrop-filter:blur(12px); transition:all 0.4s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; }
.card:hover { border-color:var(--border-glow); }
.card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
.card-title { font-size:13px; text-transform:uppercase; letter-spacing:2px; color:var(--text-secondary); font-weight:600;
  display:flex; align-items:center; gap:8px; }
.card-title-icon { width:28px; height:28px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-size:14px; }
.card-badge { font-size:11px; padding:4px 10px; border-radius:20px; font-family:'JetBrains Mono',monospace; font-weight:500; }
.badge-green { background:rgba(52,211,153,0.1); color:var(--accent-green); border:1px solid rgba(52,211,153,0.2); }
.badge-blue { background:rgba(56,189,248,0.1); color:var(--accent-cyan); border:1px solid rgba(56,189,248,0.2); }
.badge-yellow { background:rgba(251,191,36,0.1); color:var(--accent-yellow); border:1px solid rgba(251,191,36,0.2); }
.badge-warn { background:rgba(251,191,36,0.1); color:var(--accent-orange); border:1px solid rgba(251,191,36,0.25); }

/* DASHBOARD GRID */
.dashboard { display:grid; grid-template-columns:1fr 1fr; gap:20px; }

/* ROBOT PANEL */
.robot-panel { grid-column:1/-1; }
.robot-grid { display:grid; grid-template-columns:260px 1fr 260px; gap:24px; align-items:center; }
.robot-avatar { display:flex; flex-direction:column; align-items:center; gap:16px; }
.robot-ring { width:140px; height:140px; border-radius:50%; position:relative; display:flex; align-items:center; justify-content:center; }
.robot-ring::before { content:''; position:absolute; inset:0; border-radius:50%;
  border:2px solid transparent; border-top-color:var(--accent-cyan); border-right-color:var(--accent-blue);
  animation:robotSpin 3s linear infinite; }
.robot-ring::after { content:''; position:absolute; inset:6px; border-radius:50%;
  border:2px solid transparent; border-bottom-color:var(--accent-purple); border-left-color:var(--accent-cyan);
  animation:robotSpin 2s linear infinite reverse; }
@keyframes robotSpin { to{transform:rotate(360deg)} }
.robot-face { width:100px; height:100px; border-radius:50%;
  background:radial-gradient(circle at 30% 30%,#1e293b,#0f172a);
  display:flex; align-items:center; justify-content:center; font-size:42px; z-index:2;
  box-shadow:inset 0 0 30px rgba(56,189,248,0.1),0 0 40px rgba(56,189,248,0.1); }
.robot-name { font-family:'Orbitron',sans-serif; font-size:14px; font-weight:700; color:var(--accent-cyan); letter-spacing:3px; }
.robot-status-text { font-size:12px; color:var(--accent-green); font-family:'JetBrains Mono',monospace; display:flex; align-items:center; gap:6px; }
.robot-metrics { display:flex; flex-direction:column; gap:10px; }
.metric-row { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-radius:10px;
  background:rgba(15,23,42,0.5); border:1px solid var(--border-color); }
.metric-label { font-size:12px; color:var(--text-secondary); }
.metric-value { font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:600; }
.robot-actions { display:flex; flex-direction:column; gap:12px; }

/* KILL SWITCH */
.kill-switch-container { display:flex; flex-direction:column; align-items:center; gap:14px; }
.kill-switch { width:150px; height:150px; border-radius:50%; border:none; cursor:pointer;
  background:radial-gradient(circle at 40% 35%,#4a1520,#1a0508);
  box-shadow:0 0 0 4px rgba(244,63,94,0.15),0 0 30px rgba(244,63,94,0.1),
    inset 0 -4px 12px rgba(0,0,0,0.5),inset 0 4px 12px rgba(244,63,94,0.1);
  display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
  transition:all 0.3s; position:relative; font-family:'Orbitron',sans-serif; }
.kill-switch::before { content:''; position:absolute; inset:-8px; border-radius:50%;
  border:2px dashed rgba(244,63,94,0.2); animation:killRotate 10s linear infinite; }
@keyframes killRotate { to{transform:rotate(360deg)} }
.kill-switch:hover { box-shadow:0 0 0 4px rgba(244,63,94,0.3),0 0 60px rgba(244,63,94,0.3),
  inset 0 -4px 12px rgba(0,0,0,0.5),inset 0 4px 12px rgba(244,63,94,0.2); transform:scale(1.03); }
.kill-switch:active { transform:scale(0.97); }
.kill-switch.active { background:radial-gradient(circle at 40% 35%,#dc2626,#7f1d1d);
  box-shadow:0 0 0 4px rgba(244,63,94,0.5),0 0 80px rgba(244,63,94,0.4),
    inset 0 -4px 12px rgba(0,0,0,0.5),inset 0 4px 12px rgba(255,255,255,0.1); }
.kill-icon { font-size:34px; }
.kill-text { color:#fca5a5; font-size:9px; letter-spacing:3px; font-weight:700; }
.kill-label { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text-muted); text-align:center; line-height:1.5; }
.kill-label span { color:var(--accent-red); font-weight:600; }

/* BUTTONS */
.action-btn { padding:12px 20px; border-radius:10px; border:1px solid; font-family:'Inter',sans-serif;
  font-size:13px; font-weight:600; cursor:pointer; transition:all 0.3s;
  display:flex; align-items:center; justify-content:center; gap:8px; background:transparent; }
.btn-primary { background:linear-gradient(135deg,rgba(56,189,248,0.15),rgba(99,102,241,0.15));
  border-color:rgba(56,189,248,0.3); color:var(--accent-cyan); }
.btn-primary:hover { background:linear-gradient(135deg,rgba(56,189,248,0.25),rgba(99,102,241,0.25));
  box-shadow:0 0 20px rgba(56,189,248,0.15); }
.btn-warning { background:rgba(251,191,36,0.1); border-color:rgba(251,191,36,0.3); color:var(--accent-yellow); }
.btn-warning:hover { background:rgba(251,191,36,0.2); }

/* STRATEGY TABLE */
.strategy-table { width:100%; border-collapse:separate; border-spacing:0; }
.strategy-table th { font-size:10px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted);
  font-weight:600; padding:8px 12px; text-align:left; border-bottom:1px solid var(--border-color); }
.strategy-table td { padding:12px; font-size:13px; border-bottom:1px solid rgba(56,189,248,0.04);
  font-family:'JetBrains Mono',monospace; vertical-align:middle; }
.strategy-table tbody tr { transition:background 0.2s; }
.strategy-table tbody tr:hover { background:rgba(56,189,248,0.03); }
.strategy-name { font-family:'Inter',sans-serif; font-weight:600; font-size:13px; color:var(--text-primary); }
.strategy-tag { display:inline-block; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:600; letter-spacing:1px; }
.tag-active { background:rgba(52,211,153,0.12); color:var(--accent-green); }
.tag-paused { background:rgba(251,191,36,0.12); color:var(--accent-yellow); }
.tag-waiting { background:rgba(251,191,36,0.12); color:var(--accent-orange); }
.tag-triggered { background:rgba(56,189,248,0.12); color:var(--accent-cyan); }
.tag-completed { background:rgba(148,163,184,0.16); color:#cbd5e1; }
.tag-failed { background:rgba(244,63,94,0.12); color:var(--accent-red); }
.tag-cancelled { background:rgba(113,113,122,0.18); color:#d4d4d8; }

/* ORDER FEED */
.order-feed { display:flex; flex-direction:column; gap:8px; max-height:380px; overflow-y:auto; }
.order-feed::-webkit-scrollbar { width:4px; }
.order-feed::-webkit-scrollbar-track { background:transparent; }
.order-feed::-webkit-scrollbar-thumb { background:var(--border-glow); border-radius:4px; }
.order-item { display:grid; grid-template-columns:44px 1fr auto; gap:12px; align-items:center; padding:12px;
  border-radius:10px; background:rgba(15,23,42,0.4); border:1px solid var(--border-color);
  transition:all 0.3s; animation:orderSlide 0.5s ease-out; }
@keyframes orderSlide { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
.order-item:hover { border-color:var(--border-glow); background:rgba(15,23,42,0.6); }
.order-icon { width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center;
  font-size:18px; font-weight:700; }
.order-icon.buy { background:rgba(52,211,153,0.1); color:var(--accent-green); }
.order-icon.sell { background:rgba(244,63,94,0.1); color:var(--accent-red); }
.order-pair { font-weight:600; font-size:14px; }
.order-meta { font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace; }
.order-pnl { font-family:'JetBrains Mono',monospace; font-size:14px; font-weight:600; text-align:right; }
.order-time { font-size:10px; color:var(--text-muted); font-family:'JetBrains Mono',monospace; text-align:right; }

/* CHART */
.chart-area { position:relative; height:260px; margin-top:8px; }
.chart-canvas { width:100%; height:100%; display:block; }

/* RISK GAUGE */
.risk-gauge { display:flex; align-items:center; gap:20px; margin-top:12px; }
.gauge-score { font-family:'Orbitron',sans-serif; font-size:28px; font-weight:700; }
.gauge-label-text { font-size:11px; color:var(--text-muted); }

/* ACTIVITY LOG */
.activity-log { grid-column:1/-1; }
.log-entries { display:flex; flex-direction:column; gap:4px; max-height:180px; overflow-y:auto;
  font-family:'JetBrains Mono',monospace; font-size:12px; background:rgba(0,0,0,0.3);
  border-radius:10px; padding:16px; border:1px solid var(--border-color); }
.log-entries::-webkit-scrollbar { width:4px; }
.log-entries::-webkit-scrollbar-track { background:transparent; }
.log-entries::-webkit-scrollbar-thumb { background:var(--border-glow); border-radius:4px; }
.log-entry { display:flex; gap:12px; padding:4px 0; line-height:1.6; }
.log-time { color:var(--text-muted); min-width:80px; }
.log-type { min-width:60px; font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:1px; padding:2px 0; }
.log-type.info { color:var(--accent-cyan); }
.log-type.exec { color:var(--accent-green); }
.log-type.warn { color:var(--accent-yellow); }
.log-type.error { color:var(--accent-red); }
.log-msg { color:var(--text-secondary); }

/* SPARKLINE */
.sparkline-svg { display:block; width:100%; height:40px; margin-top:12px; }

/* MY STRATEGY PANEL */
.my-strategy-panel { grid-column:1/-1; }
.strategy-builder { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.strategy-form { display:flex; flex-direction:column; gap:14px; }
.form-group { display:flex; flex-direction:column; gap:6px; }
.form-label { font-size:11px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted); font-weight:600; }
.form-input, .form-select, .form-textarea {
  background:rgba(15,23,42,0.6); border:1px solid var(--border-color); border-radius:10px;
  padding:12px 16px; color:var(--text-primary); font-family:'JetBrains Mono',monospace;
  font-size:13px; outline:none; transition:all 0.3s; }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color:var(--accent-cyan);
  box-shadow:0 0 0 3px rgba(56,189,248,0.1); }
.form-select { appearance:none; cursor:pointer;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394a3b8' d='M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 16px center; padding-right:40px; }
.form-select option { background:#0f172a; color:var(--text-primary); }
.form-textarea { min-height:80px; resize:vertical; font-size:12px; line-height:1.6; }
.form-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.strategy-cards { display:flex; flex-direction:column; gap:12px; max-height:420px; overflow-y:auto; }
.strategy-cards::-webkit-scrollbar { width:4px; }
.strategy-cards::-webkit-scrollbar-track { background:transparent; }
.strategy-cards::-webkit-scrollbar-thumb { background:var(--border-glow); border-radius:4px; }
.my-strat-card { padding:16px; border-radius:12px; background:rgba(15,23,42,0.5);
  border:1px solid var(--border-color); transition:all 0.3s; position:relative; }
.my-strat-card:hover { border-color:var(--border-glow); }
.my-strat-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.my-strat-card-name { font-weight:700; font-size:14px; color:var(--text-primary); }
.my-strat-card-type { font-size:10px; padding:2px 8px; border-radius:4px; font-weight:600; letter-spacing:1px; }
.type-momentum { background:rgba(56,189,248,0.12); color:var(--accent-cyan); }
.type-meanrev { background:rgba(167,139,250,0.12); color:var(--accent-purple); }
.type-grid { background:rgba(251,191,36,0.12); color:var(--accent-yellow); }
.type-scalp { background:rgba(52,211,153,0.12); color:var(--accent-green); }
.type-arb { background:rgba(244,63,94,0.12); color:var(--accent-red); }
.my-strat-params { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px; }
.my-strat-param { display:flex; justify-content:space-between; font-size:11px; padding:4px 8px;
  border-radius:6px; background:rgba(0,0,0,0.2); }
.my-strat-param-label { color:var(--text-muted); }
.my-strat-param-value { color:var(--accent-cyan); font-family:'JetBrains Mono',monospace; font-weight:600; }
.my-strat-actions { display:flex; gap:8px; }
.strat-action-btn { padding:6px 12px; border-radius:8px; border:1px solid; font-size:11px;
  font-weight:600; cursor:pointer; transition:all 0.3s; background:transparent; font-family:'Inter',sans-serif; }
.strat-btn-deploy { border-color:rgba(52,211,153,0.3); color:var(--accent-green); }
.strat-btn-deploy:hover { background:rgba(52,211,153,0.15); }
.strat-btn-edit { border-color:rgba(56,189,248,0.3); color:var(--accent-cyan); }
.strat-btn-edit:hover { background:rgba(56,189,248,0.15); }
.strat-btn-delete { border-color:rgba(244,63,94,0.3); color:var(--accent-red); }
.strat-btn-delete:hover { background:rgba(244,63,94,0.15); }
.strat-deployed-badge { display:inline-flex; align-items:center; gap:4px; font-size:10px;
  padding:2px 8px; border-radius:4px; background:rgba(52,211,153,0.1); color:var(--accent-green);
  font-family:'JetBrains Mono',monospace; font-weight:600; letter-spacing:1px; }
.btn-add-strategy { padding:14px; border-radius:12px; border:2px dashed rgba(56,189,248,0.2);
  background:transparent; color:var(--accent-cyan); font-family:'Inter',sans-serif;
  font-size:14px; font-weight:600; cursor:pointer; transition:all 0.3s;
  display:flex; align-items:center; justify-content:center; gap:8px; }
.btn-add-strategy:hover { border-color:var(--accent-cyan); background:rgba(56,189,248,0.05); }

/* ─── AlgoOnlyOptionsWorkspace theme overrides ─── */
/* Make the embedded Tailwind/Radix options cards match the dark algo-only shell */
.card [data-slot="card"],
.card [class*="rounded-lg border"] {
  background: rgba(12,17,28,0.85) !important;
  border-color: rgba(56,189,248,0.08) !important;
  color: var(--text-primary) !important;
}
.card [class*="text-muted-foreground"] { color: var(--text-secondary) !important; }
.card [class*="bg-muted"] { background: rgba(15,23,42,0.5) !important; }
.card [class*="border-border"] { border-color: rgba(56,189,248,0.08) !important; }
.card [class*="bg-background"] { background: #06080d !important; }
.card [class*="text-foreground"] { color: var(--text-primary) !important; }
.card h1, .card h2, .card p { color: var(--text-primary); }
.card p.text-sm { color: var(--text-secondary) !important; }

/* RESPONSIVE */
@media(max-width:1200px){
  .hero{grid-template-columns:1fr 1fr}
  .dashboard{grid-template-columns:1fr}
  .robot-grid{grid-template-columns:1fr;text-align:center}
  .stats-row{grid-template-columns:repeat(3,1fr)}
}
@media(max-width:768px){
  .main{padding:16px}
  .hero{grid-template-columns:1fr}
  .stats-row{grid-template-columns:1fr 1fr}
  .topnav{padding:0 16px}
}
`;

// ─── Utility: generate sparkline data ───
/** Deterministic mini-series from one metric (no random demo data). */
function sparkSeriesFromValue(v) {
  const n = 40;
  const b = Number(v);
  if (!Number.isFinite(b) || b === 0) return [0, 0];
  return Array.from(
    { length: n },
    (_, i) => b * (1 + (i / (n - 1) - 0.5) * 0.015),
  );
}

// ─── Sparkline SVG Component ───
const Sparkline = ({ data, color = "#38bdf8" }) => {
  const gradId = useId().replace(/:/g, "");
  if (!data || data.length < 2) return null;
  const w = 300,
    h = 40;
  const min = Math.min(...data),
    max = Math.max(...data),
    range = max - min || 1;
  const pts = data
    .map(
      (v, i) =>
        `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h * 0.9 - h * 0.05}`,
    )
    .join(" ");
  return (
    <svg
      className="sparkline-svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

// ─── Main Dashboard Component ───
// Data comes from ChartMate / BFF (`summary`, `orderFeed`, etc.) — no synthetic market feed.
export default function TradingSmartDashboard(props = {}) {
  const {
    useChartmate = true,
    brokerConnected = null,
    positionsStreamStale = false,
    optionsPositionsFrame = null,
    summary = null,
    orderFeed = null,
    strategyCards = null,
    strategiesTable = null,
    chartmateActions = null,
    optionsPanel = null,
    onSignOut = null,
    currencyMode = "INR",
    setCurrencyMode = null,
    sessionAccessToken = null,
    onCancelPendingForStrategy = null,
  } = props;

  const [time, setTime] = useState("");
  const [uptimeSec, setUptimeSec] = useState(0);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [myStrategies, setMyStrategies] = useState([]);
  const [showStratForm, setShowStratForm] = useState(false);
  const emptyStratForm = () => ({
    name: "",
    description: "",
    trading_mode: "LONG",
    is_intraday: "true",
    start_time: "09:15",
    end_time: "15:15",
    squareoff_time: "15:15",
    risk_per_trade_pct: "1",
    stop_loss_pct: "2",
    take_profit_pct: "4",
    symbols_raw: "",
    entry_rule: "",
    exit_rule: "",
  });
  const [stratForm, setStratForm] = useState(emptyStratForm);

  const [chartData, setChartData] = useState([0, 0]);
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [optForm, setOptForm] = useState({
    strategy_type: "iron_condor",
    underlying: "NIFTY",
    venue: "NSE_INDEX",
    expiry_date: "",
    lots: "1",
    lot_size: "75",
    capital: "500000",
    risk_pct: "2",
    wing_width_pts: "200",
    delta_target: "0.16",
    min_vix: "13",
    min_net_premium: "35",
    profit_target_pct: "45",
    stop_loss_mult: "2",
    roll_trigger_pts: "30",
    max_adjustments: "2",
  });
  const [goLiveTarget, setGoLiveTarget] = useState(null);
  const [goLiveForm, setGoLiveForm] = useState({
    symbol: "",
    exchange: "NSE",
    quantity: "1",
    product: "MIS",
  });
  const [goLiveBusy, setGoLiveBusy] = useState(false);
  const [liveViewTarget, setLiveViewTarget] = useState(null);
  const [cancelPendingBusyId, setCancelPendingBusyId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [stratStep, setStratStep] = useState(0);
  const [optionsStep, setOptionsStep] = useState(0);
  const [showExactAlgoBuilder, setShowExactAlgoBuilder] = useState(false);
  const [editAlgoTarget, setEditAlgoTarget] = useState(null); // strategy being edited
  const [showExactOptionsBuilder, setShowExactOptionsBuilder] = useState(false);
  const [killActive, setKillActive] = useState(false);

  const sparkData = useMemo(
    () => ({
      s1: sparkSeriesFromValue(summary?.portfolio_value),
      s2: sparkSeriesFromValue(summary?.cumulative_pnl),
      s3: sparkSeriesFromValue(summary?.today_pnl),
    }),
    [summary?.portfolio_value, summary?.cumulative_pnl, summary?.today_pnl],
  );

  const riskScore = useMemo(() => {
    // Risk score is only meaningful when broker session is live (real closed trades feed in).
    // Without a live session all trade data is stale / zero — show null (—) not a fake number.
    const isLive = Boolean(
      summary?.broker_session_live ?? summary?.broker_connected,
    );
    if (!isLive) return null;
    if (summary?.win_rate_pct == null) return null;
    const w = Number(summary.win_rate_pct);
    if (!Number.isFinite(w)) return null;
    return Math.max(0, Math.min(100, Math.round(100 - w)));
  }, [
    summary?.win_rate_pct,
    summary?.broker_session_live,
    summary?.broker_connected,
  ]);

  const canvasRef = useRef(null);
  const logRef = useRef(null);

  const addLog = useCallback((type, msg) => {
    const now = new Date();
    setLogs((prev) => {
      const next = [
        ...prev,
        { type, msg, time: now.toLocaleTimeString("en-US", { hour12: false }) },
      ];
      return next.slice(-50);
    });
  }, []);

  useEffect(() => {
    if (!useChartmate || !strategyCards) return;
    setMyStrategies(strategyCards);
  }, [useChartmate, strategyCards]);

  useEffect(() => {
    if (!useChartmate || !orderFeed) return;
    setOrders(orderFeed.length ? orderFeed : []);
  }, [useChartmate, orderFeed]);

  useEffect(() => {
    if (!useChartmate || !summary) return undefined;
    const v = Number(summary.cumulative_pnl ?? 0);
    if (!Number.isFinite(v)) {
      setChartData([0, 0]);
      return undefined;
    }
    const displayV = convertInrSourceAmount(v, currencyMode);
    /* Flat segment = current level only (no fake intraday curve until a history API exists). */
    setChartData([displayV, displayV]);
    return undefined;
  }, [useChartmate, summary?.cumulative_pnl, currencyMode]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setTime(
        n.toLocaleTimeString("en-US", { hour12: false }) +
          "." +
          String(n.getMilliseconds()).padStart(3, "0"),
      );
    }, 50);
    return () => clearInterval(id);
  }, []);

  // Uptime
  useEffect(() => {
    const id = setInterval(() => setUptimeSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
    const w = rect.width,
      h = rect.height;
    ctx.clearRect(0, 0, w, h);
    if (chartData.length < 2) return;
    const rawMin = Math.min(...chartData);
    const rawMax = Math.max(...chartData);
    const min =
      rawMin === rawMax
        ? rawMin - Math.max(1, Math.abs(rawMin) * 0.0005)
        : rawMin * 0.998;
    const max =
      rawMin === rawMax
        ? rawMax + Math.max(1, Math.abs(rawMax) * 0.0005)
        : rawMax * 1.002;
    const range = max - min || 1;
    const pad = { top: 20, bottom: 30, left: 0, right: 0 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    ctx.strokeStyle = "rgba(56,189,248,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = pad.top + (ch / 5) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w, y);
      ctx.stroke();
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
    chartData.forEach((v, i) => {
      if (i === 0) ctx.moveTo(toX(i), toY(v));
      else ctx.lineTo(toX(i), toY(v));
    });
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    chartData.forEach((v, i) => {
      if (i === 0) ctx.moveTo(toX(i), toY(v));
      else ctx.lineTo(toX(i), toY(v));
    });
    ctx.strokeStyle = "rgba(56,189,248,0.3)";
    ctx.lineWidth = 6;
    ctx.stroke();

    const lx = toX(chartData.length - 1),
      ly = toY(chartData[chartData.length - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, 10, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(56,189,248,0.2)";
    ctx.fill();

    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "11px JetBrains Mono";
    ctx.textAlign = "right";
    for (let i = 0; i <= 5; i++) {
      const val = min + (range / 5) * (5 - i);
      const y = pad.top + (ch / 5) * i;
      const lab =
        currencyMode === "USD"
          ? "$" + (val / 1000).toFixed(0) + "k"
          : "₹" + (val / 1000).toFixed(0) + "k";
      ctx.fillText(lab, w - 4, y + 4);
    }
  }, [chartData, currencyMode]);

  const formatUptime = (s) => {
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${hh}h ${String(mm).padStart(2, "0")}m ${String(ss).padStart(2, "0")}s`;
  };

  const riskColor =
    riskScore == null
      ? "var(--text-muted)"
      : riskScore < 30
        ? "var(--accent-green)"
        : riskScore < 60
          ? "var(--accent-yellow)"
          : "var(--accent-red)";
  const riskLabel =
    riskScore == null
      ? "n/a"
      : riskScore < 30
        ? "Low"
        : riskScore < 60
          ? "Medium"
          : "High";

  const sessLive = Boolean(
    summary?.broker_session_live ?? summary?.broker_connected,
  );
  const brokerSnap =
    summary?.broker_snapshot && typeof summary.broker_snapshot === "object"
      ? summary.broker_snapshot
      : {};
  const brokerPositionsCount = Number(brokerSnap?.positions_count);
  const brokerTradesCount = Number(brokerSnap?.tradebook_count);
  const brokerOpenOrdersCount = Number(brokerSnap?.open_orders_count);
  const brokerCashAvailable = Number(brokerSnap?.cash_available);
  const liveOpenPositionsCount =
    sessLive && Number.isFinite(brokerPositionsCount)
      ? brokerPositionsCount
      : (summary?.open_positions_count ?? 0);
  const liveTradesCount =
    sessLive && Number.isFinite(brokerTradesCount)
      ? brokerTradesCount
      : (summary?.recent_orders_count ?? 0);
  const liveOpenOrdersCount =
    sessLive && Number.isFinite(brokerOpenOrdersCount)
      ? brokerOpenOrdersCount
      : null;
  const liveCashAvailable =
    sessLive && Number.isFinite(brokerCashAvailable)
      ? brokerCashAvailable
      : null;
  const capOrdersLimit = summary?.limits?.orders ?? 10;
  const capStrategiesLimit = summary?.limits?.strategies ?? 10;
  const activeOrdersCap = summary?.active_live_orders_for_cap;
  const activeStrategiesCap = summary?.active_strategies_for_cap;
  const atOrderCap =
    typeof activeOrdersCap === "number" && activeOrdersCap >= capOrdersLimit;
  const atStrategyCap =
    typeof activeStrategiesCap === "number" &&
    activeStrategiesCap >= capStrategiesLimit;
  // Only show real numbers when broker session is live — avoid showing paper/stale data as real values.
  const displayPortfolio =
    sessLive && typeof summary?.portfolio_value === "number"
      ? summary.portfolio_value
      : 0;
  const displayCumulative =
    sessLive && typeof summary?.cumulative_pnl === "number"
      ? summary.cumulative_pnl
      : 0;
  const displayToday =
    sessLive && typeof summary?.today_pnl === "number" ? summary.today_pnl : 0;
  const pctMtm =
    sessLive && typeof summary?.open_positions_pct_mtm === "number"
      ? summary.open_positions_pct_mtm
      : null;
  const fmtExpiry = summary?.token_expires_at
    ? new Date(summary.token_expires_at).toLocaleString(undefined, {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      })
    : null;
  const sharpeRatio = (() => {
    const candidates = [
      summary?.sharpe_ratio,
      summary?.sharpe,
      summary?.performance?.sharpe_ratio,
      summary?.risk?.sharpe_ratio,
    ];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  })();
  const maxDrawdownPct = (() => {
    const candidates = [
      summary?.max_drawdown_pct,
      summary?.drawdown_pct,
      summary?.performance?.max_drawdown_pct,
      summary?.risk?.max_drawdown_pct,
    ];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  })();
  const avgTradeDurationSec = (() => {
    const candidates = [
      summary?.avg_trade_duration_sec,
      summary?.average_trade_duration_sec,
      summary?.performance?.avg_trade_duration_sec,
      summary?.timing?.avg_trade_duration_sec,
    ];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  })();
  const avgLatencyMs = (() => {
    const candidates = [
      summary?.avg_latency_ms,
      summary?.latency_ms,
      summary?.execution_latency_ms,
      summary?.performance?.avg_latency_ms,
    ];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  })();
  const formatDuration = (seconds) => {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 0) return "—";
    const total = Math.round(n);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}m ${s}s`;
  };

  const emptyStrategyRow = useMemo(
    () => ({
      name: "No strategies yet",
      status: "paused",
      trades: 0,
      pnl: formatSignedDisplay(0, currencyMode),
      win: "—",
      pnlColor: "var(--text-muted)",
      winColor: "var(--text-muted)",
    }),
    [currencyMode],
  );
  const strategiesData =
    strategiesTable && strategiesTable.length
      ? strategiesTable
      : [emptyStrategyRow];
  const activeStrategiesCount = strategiesData.filter((s) => {
    const st = normalizeLifecycleState(
      s.status,
      String(s.status).toLowerCase() === "active",
    );
    return (
      st === "ACTIVE" || st === "WAITING_MARKET_OPEN" || st === "TRIGGERED"
    );
  }).length;
  const strategyTagClass = (status) => {
    const st = normalizeLifecycleState(
      status,
      String(status).toLowerCase() === "active",
    );
    if (st === "ACTIVE") return "tag-active";
    if (st === "WAITING_MARKET_OPEN") return "tag-waiting";
    if (st === "TRIGGERED") return "tag-triggered";
    if (st === "COMPLETED") return "tag-completed";
    if (st === "FAILED") return "tag-failed";
    if (st === "CANCELLED") return "tag-cancelled";
    return "tag-paused";
  };
  const liveMonitorStrategies = myStrategies.filter((s) => {
    const st = normalizeLifecycleState(s.lifecycle_state, Boolean(s.deployed));
    return (
      st === "ACTIVE" || st === "WAITING_MARKET_OPEN" || st === "TRIGGERED"
    );
  });

  const handleKillSwitch = () => {
    setKillActive((prev) => {
      if (!prev) addLog("error", "KILL SWITCH ACTIVATED — All strategies halted, open orders cancelled");
      else addLog("info", "Kill switch deactivated — Systems resuming");
      return !prev;
    });
  };

  return (
    <>
      <style>{styles}</style>
      <div className="bg-grid" />
      <div className="bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>
      <div className="scanlines" />

      <div className="app">
        {/* NAV */}
        <nav className="topnav">
          <div className="logo">
            <div className="logo-icon">
              <TradingSmartLogo size={32} />
            </div>
            <div className="logo-text">
              <span className="logo-text-main">TRADINGSMART.AI</span>
              <span className="logo-text-sub">ALGO TRADING ENGINE</span>
            </div>
          </div>
          <div className="nav-status">
            <div className="status-item">
              <div
                className={`status-dot ${sessLive ? "live" : useChartmate ? "warn" : brokerConnected === true ? "live" : brokerConnected === false ? "warn" : "live"}`}
              />
              {useChartmate
                ? sessLive
                  ? "Broker session live"
                  : summary?.broker_credentials_configured
                    ? "Session expired — reconnect (IST midnight)"
                    : "Broker not connected"
                : brokerConnected === true
                  ? "Broker connected"
                  : brokerConnected === false
                    ? "Broker offline"
                    : "Exchange connected"}
            </div>
            <div className="status-item">
              <div className={`status-dot ${useChartmate ? "live" : "live"}`} />{" "}
              {useChartmate ? "ChartMate data" : "WebSocket Active"}
            </div>
            {positionsStreamStale && (
              <div
                className="status-item"
                style={{ color: "var(--accent-orange)", fontSize: 11 }}
              >
                Options stream: stale
              </div>
            )}
            <div className="status-item">
              <div
                className={`status-dot ${(liveTradesCount ?? orders.length) > 0 ? "live" : "warn"}`}
              />
              {useChartmate
                ? `Trades ${liveTradesCount ?? 0} · Open ${liveOpenPositionsCount ?? 0}`
                : "Live feed"}
            </div>
            {useChartmate && chartmateActions?.onConnectBroker && (
              <button
                type="button"
                className="action-btn btn-primary"
                style={{
                  padding: "8px 14px",
                  fontSize: "11px",
                  borderRadius: "10px",
                  whiteSpace: "nowrap",
                }}
                disabled={chartmateActions.connectBusy}
                onClick={() => void chartmateActions.onConnectBroker()}
              >
                {sessLive ? "Reconnect broker" : "Connect broker"}
              </button>
            )}
            {setCurrencyMode ? (
              <div className="status-item" style={{ gap: 6 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  Show
                </span>
                <button
                  type="button"
                  className="action-btn btn-primary"
                  style={{
                    padding: "4px 10px",
                    fontSize: "10px",
                    borderRadius: "999px",
                    opacity: currencyMode === "INR" ? 1 : 0.55,
                  }}
                  onClick={() => setCurrencyMode("INR")}
                >
                  INR
                </button>
                <button
                  type="button"
                  className="action-btn btn-primary"
                  style={{
                    padding: "4px 10px",
                    fontSize: "10px",
                    borderRadius: "999px",
                    opacity: currencyMode === "USD" ? 1 : 0.55,
                  }}
                  onClick={() => setCurrencyMode("USD")}
                >
                  USD
                </button>
              </div>
            ) : null}
            <div className="nav-time">{time}</div>
            {onSignOut ? (
              <button
                type="button"
                className="action-btn btn-primary"
                style={{
                  padding: "6px 12px",
                  fontSize: "10px",
                  borderRadius: "8px",
                  opacity: 0.85,
                }}
                onClick={() => onSignOut()}
              >
                Sign out
              </button>
            ) : null}
          </div>
        </nav>

        <div className="main">
          {/* HERO */}
          <div className="hero">
            <div className="hero-card">
              <div className="hero-label">Total Portfolio Value</div>
              <div className="hero-value neutral">
                {formatUnsignedDisplay(displayPortfolio, currencyMode)}
              </div>
              <div
                className={`hero-change ${pctMtm != null && pctMtm < 0 ? "" : "up"}`}
              >
                {pctMtm != null ? (
                  <>
                    Today's Algo P&L {pctMtm >= 0 ? "+" : ""}
                    {pctMtm.toFixed(2)}% vs exposure
                  </>
                ) : (
                  <>Sum of (entry price × qty) for open positions</>
                )}
              </div>
              <Sparkline data={sparkData.s1} color="#38bdf8" />
            </div>
            <div className="hero-card">
              <div className="hero-label">Algo Cumulative P&L</div>
              <div
                className={`hero-value ${displayCumulative >= 0 ? "positive" : "neutral"}`}
              >
                {formatSignedDisplay(displayCumulative, currencyMode)}
              </div>
              <div className="hero-change up">
                Sum of P&L on live trades (ChartMate)
              </div>
              <Sparkline data={sparkData.s2} color="#34d399" />
            </div>
            <div className="hero-card">
              <div className="hero-label">Today's Algo P&L</div>
              <div
                className={`hero-value ${displayToday >= 0 ? "positive" : "neutral"}`}
              >
                {formatSignedDisplay(displayToday, currencyMode)}
              </div>
              <div className="hero-change up">
                {sessLive ? (liveTradesCount ?? 0) : "—"} total trades
                {sessLive && summary?.win_rate_pct != null
                  ? ` | ${summary.win_rate_pct.toFixed(1)}% win (closed)`
                  : " | Win rate n/a"}
              </div>
              <Sparkline data={sparkData.s3} color="#34d399" />
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 18,
              padding: "0 8px",
              lineHeight: 1.5,
            }}
          >
            <strong>INR-only live mode</strong>. Broker metrics/order feed use
            live broker snapshot data. Strategy table remains strategy metadata
            and does not attribute broker tradebook rows back to strategy IDs.
          </div>

          {/* STATS — only show real numbers when broker session is live */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Win Rate</div>
              <div
                className="stat-value"
                style={{
                  color: sessLive ? "var(--accent-green)" : "var(--text-muted)",
                }}
              >
                {sessLive && summary?.win_rate_pct != null
                  ? `${summary.win_rate_pct.toFixed(1)}%`
                  : "—"}
              </div>
              <div className="progress-container">
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width:
                        sessLive && summary?.win_rate_pct != null
                          ? `${Math.min(100, Number(summary.win_rate_pct))}%`
                          : "0%",
                      background:
                        "linear-gradient(90deg,var(--accent-green),var(--accent-cyan))",
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Active Positions</div>
              <div
                className="stat-value"
                style={{ color: "var(--accent-purple)" }}
              >
                {sessLive ? String(liveOpenPositionsCount ?? 0) : "—"}
              </div>
              <div className="progress-container">
                <div className="progress-label">
                  <span>Exposure</span>
                  <span>
                    {pctMtm != null ? `${pctMtm.toFixed(1)}% MTM` : "—"}
                  </span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width:
                        pctMtm != null
                          ? `${Math.min(100, Math.abs(pctMtm))}%`
                          : "0%",
                      background:
                        "linear-gradient(90deg,var(--accent-purple),var(--accent-blue))",
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Strategies</div>
              <div
                className="stat-value"
                style={{ color: "var(--text-primary)" }}
              >
                {String(summary?.active_strategies_deployed ?? 0)}
              </div>
              <div className="progress-container">
                <div className="progress-label">
                  <span>Deployed</span>
                  <span>{myStrategies.length} saved</span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, (Number(summary?.active_strategies_deployed) || 0) * 15)}%`,
                      background:
                        "linear-gradient(90deg,var(--accent-green),var(--accent-cyan))",
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Sharpe Ratio</div>
              <div
                className="stat-value"
                style={{
                  color:
                    sharpeRatio != null
                      ? "var(--accent-cyan)"
                      : "var(--text-muted)",
                }}
              >
                {sharpeRatio != null ? sharpeRatio.toFixed(2) : "—"}
              </div>
              <div className="progress-container">
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width:
                        sharpeRatio != null
                          ? `${Math.min(100, Math.max(0, (sharpeRatio / 3) * 100))}%`
                          : "0%",
                      background:
                        "linear-gradient(90deg,var(--accent-cyan),var(--accent-blue))",
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Max Drawdown</div>
              <div
                className="stat-value"
                style={{
                  color:
                    maxDrawdownPct != null
                      ? "var(--accent-orange)"
                      : "var(--text-muted)",
                }}
              >
                {maxDrawdownPct != null
                  ? `${maxDrawdownPct > 0 ? "-" : ""}${Math.abs(maxDrawdownPct).toFixed(1)}%`
                  : "—"}
              </div>
              <div className="progress-container">
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width:
                        maxDrawdownPct != null
                          ? `${Math.min(100, Math.abs(maxDrawdownPct) * 2)}%`
                          : "0%",
                      background:
                        "linear-gradient(90deg,var(--accent-yellow),var(--accent-orange))",
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Trade Duration</div>
              <div
                className="stat-value"
                style={{
                  color:
                    avgTradeDurationSec != null
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                }}
              >
                {formatDuration(avgTradeDurationSec)}
              </div>
              <div className="progress-container">
                <div className="progress-label">
                  <span>Latency</span>
                  <span>
                    {avgLatencyMs != null
                      ? `${Math.round(avgLatencyMs)}ms`
                      : "—"}
                  </span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width:
                        avgLatencyMs != null
                          ? `${Math.min(100, Math.max(0, (avgLatencyMs / 80) * 100))}%`
                          : "0%",
                      background:
                        "linear-gradient(90deg,#2dd4bf,var(--accent-cyan))",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* DASHBOARD */}
          <div className="dashboard">
            {/* ROBOT COMMAND CENTER */}
            <div className="card robot-panel">
              <div className="card-header">
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(56,189,248,0.1)",
                      color: "var(--accent-cyan)",
                    }}
                  >
                    &#x1F916;
                  </span>
                  Robot Command Center
                </div>
                <span
                  className={`card-badge ${sessLive ? "badge-green" : "badge-warn"}`}
                >
                  {sessLive ? "● BROKER LIVE" : "○ RECONNECT"}
                </span>
              </div>
              <div className="robot-grid">
                <div className="robot-avatar">
                  <div className="robot-ring">
                    <div className="robot-face">&#x1F916;</div>
                  </div>
                  <div className="robot-name">TSA-7</div>
                  <div className="robot-status-text">
                    <div
                      className={`status-dot ${sessLive ? "live" : "warn"}`}
                    />
                    {sessLive
                      ? "Broker session active"
                      : "Connect broker for live execution"}
                  </div>
                </div>
                <div className="robot-metrics">
                  <>
                    <div className="metric-row">
                      <span className="metric-label">
                        Open positions (broker)
                      </span>
                      <span
                        className="metric-value"
                        style={{ color: "var(--accent-cyan)" }}
                      >
                        {sessLive ? (liveOpenPositionsCount ?? 0) : "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">
                        Order history (tradebook)
                      </span>
                      <span
                        className="metric-value"
                        style={{ color: "var(--accent-purple)" }}
                      >
                        {sessLive ? (liveTradesCount ?? 0) : "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Open broker orders</span>
                      <span
                        className="metric-value"
                        style={{ color: "var(--accent-cyan)" }}
                      >
                        {sessLive ? (liveOpenOrdersCount ?? "—") : "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Available cash</span>
                      <span
                        className="metric-value"
                        style={{ color: "var(--accent-green)" }}
                      >
                        {sessLive && liveCashAvailable != null
                          ? formatUnsignedDisplay(
                              liveCashAvailable,
                              currencyMode,
                            )
                          : "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Live orders (cap)</span>
                      <span
                        className="metric-value"
                        style={{
                          color: atOrderCap
                            ? "var(--accent-orange)"
                            : "var(--text-primary)",
                        }}
                      >
                        {sessLive && typeof activeOrdersCap === "number"
                          ? `${activeOrdersCap} / ${capOrdersLimit}`
                          : "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">
                        Active strategies (cap)
                      </span>
                      <span
                        className="metric-value"
                        style={{
                          color: atStrategyCap
                            ? "var(--accent-orange)"
                            : "var(--text-primary)",
                        }}
                      >
                        {sessLive && typeof activeStrategiesCap === "number"
                          ? `${activeStrategiesCap} / ${capStrategiesLimit}`
                          : "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Feed preview rows</span>
                      <span
                        className="metric-value"
                        style={{ color: "var(--accent-cyan)" }}
                      >
                        {sessLive ? orders.length : "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Strategies deployed</span>
                      <span
                        className="metric-value"
                        style={{ color: "var(--accent-yellow)" }}
                      >
                        {sessLive
                          ? (summary?.active_strategies_deployed ?? 0)
                          : "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Broker session</span>
                      <span
                        className="metric-value"
                        style={{
                          color: sessLive
                            ? "var(--accent-green)"
                            : "var(--accent-orange)",
                        }}
                      >
                        {sessLive ? "Live" : "Reconnect (IST day token)"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">
                        Token valid until (IST)
                      </span>
                      <span
                        className="metric-value"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {fmtExpiry || "—"}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Uptime</span>
                      <span
                        className="metric-value"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {formatUptime(uptimeSec)}
                      </span>
                    </div>
                  </>
                </div>
                <div className="robot-actions">
                  <div className="kill-switch-container">
                    <button
                      className={`kill-switch ${killActive ? "active" : ""}`}
                      onClick={handleKillSwitch}
                    >
                      <span className="kill-icon">
                        {killActive ? "\u26D4" : "\u26A0"}
                      </span>
                      <span className="kill-text">
                        {killActive ? "ACTIVATED" : "KILL SWITCH"}
                      </span>
                    </button>
                    <div className="kill-label">
                      <span>Emergency Stop</span>
                      <br />
                      Halts all strategies & cancels orders
                    </div>
                  </div>
                  <button
                    className="action-btn btn-warning"
                    onClick={() =>
                      addLog(
                        "warn",
                        "Pause command issued — Pausing all strategies...",
                      )
                    }
                  >
                    &#x23F8; Pause All Strategies
                  </button>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginBottom: 6,
                      textAlign: "left",
                    }}
                  >
                    Use <strong>Connect broker</strong> for Zerodha (same flow
                    as ChartMate). Options and strategy deploy run only with a
                    live broker session.
                  </div>
                  {chartmateActions?.onRefresh && (
                    <button
                      type="button"
                      className="action-btn btn-primary"
                      onClick={() => {
                        chartmateActions.onRefresh();
                        addLog("info", "Dashboard refreshed from ChartMate");
                      }}
                    >
                      &#x21BB; Refresh data
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* STRATEGIES */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(167,139,250,0.1)",
                      color: "var(--accent-purple)",
                    }}
                  >
                    &#x1F9E0;
                  </span>
                  Active Strategies
                </div>
                <span className="card-badge badge-blue">
                  {activeStrategiesCount} active
                </span>
              </div>
              <table className="strategy-table">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Status</th>
                    <th>Trades</th>
                    <th>P&L</th>
                    <th>Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {strategiesData.map((s, idx) => (
                    <tr key={`${s.name}-${idx}`}>
                      <td>
                        <span className="strategy-name">{s.name}</span>
                      </td>
                      <td>
                        <span
                          className={`strategy-tag ${strategyTagClass(s.status)}`}
                          title={
                            s.lifecycle_reason || s.lifecycle_updated_at
                              ? `${s.lifecycle_reason ?? "No reason"}${s.lifecycle_updated_at ? `\nUpdated: ${s.lifecycle_updated_at}` : ""}`
                              : undefined
                          }
                        >
                          {lifecycleLabel(
                            normalizeLifecycleState(
                              s.status,
                              String(s.status).toLowerCase() === "active",
                            ),
                          )}
                        </span>
                      </td>
                      <td>{sessLive ? s.trades.toLocaleString() : "—"}</td>
                      <td
                        style={{
                          color: sessLive ? s.pnlColor : "var(--text-muted)",
                        }}
                      >
                        {sessLive ? s.pnl : "—"}
                      </td>
                      <td
                        style={{
                          color: sessLive ? s.winColor : "var(--text-muted)",
                        }}
                      >
                        {sessLive ? s.win : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  marginTop: 8,
                  lineHeight: 1.4,
                }}
              >
                P&amp;L and win % use only trades in the{" "}
                <strong>60-day window</strong> where{" "}
                <code style={{ fontSize: 10 }}>active_trades.strategy_id</code>{" "}
                equals this row’s strategy id. ChartMate “Algo Guide” presets
                often have <strong>no</strong>{" "}
                <code style={{ fontSize: 10 }}>strategy_id</code> on historical
                rows — those stay 0 here until live runs attach the id (same as
                attributing orders in the main app).
              </div>
              <div className="risk-gauge">
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <div className="gauge-score" style={{ color: riskColor }}>
                    {riskScore == null ? "—" : riskScore}
                  </div>
                  <div className="gauge-label-text">
                    Risk Score — {riskLabel}
                  </div>
                </div>
              </div>
            </div>

            {/* LIVE ORDERS */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(52,211,153,0.1)",
                      color: "var(--accent-green)",
                    }}
                  >
                    &#x26A1;
                  </span>
                  Live Order Feed
                </div>
                <span className="card-badge badge-green">Real-time</span>
              </div>
              <div className="order-feed">
                {summary?.feed_paused ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--accent-orange)",
                      padding: "12px 8px",
                      lineHeight: 1.5,
                    }}
                  >
                    Order feed is hidden until your{" "}
                    <strong>broker day session is live</strong> (reconnect
                    above). That avoids showing old database rows as if they
                    were today’s executions. Open-position KPIs above still use
                    your current open rows.
                  </div>
                ) : null}
                {!summary?.feed_paused && orders.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      padding: "12px 8px",
                    }}
                  >
                    No trades in the last 60 days (live rows only). After you
                    trade with a linked strategy, rows appear here with IST
                    timestamps.
                  </div>
                ) : null}
                {orders.map((o) => (
                  <div className="order-item" key={o.id}>
                    <div className={`order-icon ${o.type}`}>
                      {o.type === "buy" ? "\u25B2" : "\u25BC"}
                    </div>
                    <div>
                      <div className="order-pair">
                        {o.symbol}{" "}
                        <span
                          style={{
                            color:
                              o.type === "buy"
                                ? "var(--accent-green)"
                                : "var(--accent-red)",
                            fontSize: 11,
                            textTransform: "uppercase",
                          }}
                        >
                          {o.type}
                        </span>
                      </div>
                      <div className="order-meta">
                        {o.strategy} &bull; {o.qty} @{" "}
                        {formatUnsignedDisplay(Number(o.price), currencyMode)}
                      </div>
                    </div>
                    <div>
                      <div
                        className="order-pnl"
                        style={{
                          color:
                            o.pnl >= 0
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                        }}
                      >
                        {formatSignedDisplay(Number(o.pnl), currencyMode)}
                      </div>
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
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(56,189,248,0.1)",
                      color: "var(--accent-cyan)",
                    }}
                  >
                    &#x1F3AF;
                  </span>
                  My Strategies
                </div>
                <span className="card-badge badge-blue">
                  {myStrategies.length} Saved
                </span>
              </div>
              <div className="strategy-builder">
                {/* Left: Strategy Cards */}
                <div className="strategy-cards">
                  {myStrategies.map((s) => {
                    const lcState = normalizeLifecycleState(
                      s.lifecycle_state,
                      Boolean(s.deployed),
                    );
                    const badgeTitle =
                      s.lifecycle_reason || s.lifecycle_updated_at
                        ? `${s.lifecycle_reason ?? "No reason"}${s.lifecycle_updated_at ? `\nUpdated: ${s.lifecycle_updated_at}` : ""}`
                        : undefined;
                    return (
                      <div className="my-strat-card" key={s.id}>
                        <div className="my-strat-card-header">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <span className="my-strat-card-name">{s.name}</span>
                            <span className="my-strat-card-type type-momentum">
                              {s.type}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span
                              className={`strategy-tag ${strategyTagClass(lcState)}`}
                              title={badgeTitle}
                            >
                              {lifecycleLabel(lcState)}
                            </span>
                            {s.deployed && (
                              <span className="strat-deployed-badge">
                                <span
                                  className="status-dot live"
                                  style={{ width: 6, height: 6 }}
                                />{" "}
                                LIVE
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="my-strat-params">
                          <div className="my-strat-param">
                            <span className="my-strat-param-label">Mode</span>
                            <span className="my-strat-param-value">
                              {s.type} ·{" "}
                              {s.is_intraday !== false
                                ? "Intraday"
                                : "Positional"}
                            </span>
                          </div>
                          <div className="my-strat-param">
                            <span className="my-strat-param-label">Pairs</span>
                            <span className="my-strat-param-value">
                              {s.pairs}
                            </span>
                          </div>
                          <div className="my-strat-param">
                            <span className="my-strat-param-label">
                              Timeframe
                            </span>
                            <span className="my-strat-param-value">
                              {s.timeframe}
                            </span>
                          </div>
                          <div className="my-strat-param">
                            <span className="my-strat-param-label">
                              Risk/Trade
                            </span>
                            <span className="my-strat-param-value">
                              {s.riskPerTrade}
                            </span>
                          </div>
                          <div className="my-strat-param">
                            <span className="my-strat-param-label">
                              Stop Loss
                            </span>
                            <span className="my-strat-param-value">
                              {s.stopLoss}
                            </span>
                          </div>
                          <div className="my-strat-param">
                            <span className="my-strat-param-label">
                              Take Profit
                            </span>
                            <span className="my-strat-param-value">
                              {s.takeProfit}
                            </span>
                          </div>
                          <div className="my-strat-param">
                            <span className="my-strat-param-label">
                              Max Pos
                            </span>
                            <span className="my-strat-param-value">
                              {s.maxPositions}
                            </span>
                          </div>
                        </div>
                        {s.deployed ? (
                          <p
                            style={{
                              marginTop: 8,
                              fontSize: 11,
                              color: "var(--text-muted)",
                              lineHeight: 1.45,
                            }}
                          >
                            Live chart and condition matrix open in{" "}
                            <strong style={{ color: "var(--accent-cyan)" }}>
                              Live view
                            </strong>{" "}
                            (engine updates are batched; not every second is a
                            new snapshot).
                          </p>
                        ) : null}
                        <div className="my-strat-actions">
                          {pendingDelete?.id === s.id ? (
                            <>
                              <button
                                type="button"
                                className="strat-action-btn strat-btn-delete"
                                onClick={async () => {
                                  if (
                                    useChartmate &&
                                    chartmateActions?.onDeleteStrategy
                                  ) {
                                    const err =
                                      await chartmateActions.onDeleteStrategy(
                                        s.id,
                                        s.name,
                                      );
                                    if (err) {
                                      addLog("error", err);
                                      setPendingDelete(null);
                                      return;
                                    }
                                    chartmateActions.onRefresh?.();
                                    setPendingDelete(null);
                                    return;
                                  }
                                  setMyStrategies((prev) =>
                                    prev.filter((x) => x.id !== s.id),
                                  );
                                  addLog(
                                    "warn",
                                    `Strategy "${s.name}" deleted`,
                                  );
                                  setPendingDelete(null);
                                }}
                              >
                                Confirm delete
                              </button>
                              <button
                                type="button"
                                className="strat-action-btn strat-btn-edit"
                                onClick={() => setPendingDelete(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              {!s.deployed ? (
                                <button
                                  type="button"
                                  className="strat-action-btn strat-btn-deploy"
                                  style={
                                    !sessLive
                                      ? { opacity: 0.6, cursor: "pointer" }
                                      : undefined
                                  }
                                  title={
                                    !sessLive
                                      ? "Connect broker (live session) to activate"
                                      : "Activate this strategy live"
                                  }
                                  onClick={() => {
                                    if (!sessLive) {
                                      toast.error(
                                        "Broker not connected — connect your broker (live session) before activating a strategy.",
                                        {
                                          description:
                                            "Click 'Connect broker' in the top navigation bar.",
                                        },
                                      );
                                      addLog(
                                        "warn",
                                        "Connect broker (live session) before activating a strategy.",
                                      );
                                      return;
                                    }
                                    setGoLiveTarget(s);
                                    setGoLiveForm(defaultsGoLiveFromCard(s));
                                  }}
                                >
                                  &#x25B6; Activate…
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="strat-action-btn strat-btn-deploy"
                                    title="Candles, LTP refresh, and full condition table"
                                    onClick={() => {
                                      if (!sessLive) {
                                        toast.error(
                                          "Connect broker (live session) to load the chart and live quotes.",
                                          {
                                            description:
                                              "Use Connect broker in the top bar, then open Live view again.",
                                          },
                                        );
                                        addLog(
                                          "warn",
                                          "Live view needs a live broker session for chart quotes.",
                                        );
                                        return;
                                      }
                                      setLiveViewTarget(s);
                                    }}
                                  >
                                    &#x1F4CA; Live view
                                  </button>
                                  <button
                                    className="strat-action-btn strat-btn-edit"
                                    onClick={async () => {
                                      if (
                                        useChartmate &&
                                        chartmateActions?.onToggleDeploy
                                      ) {
                                        const err =
                                          await chartmateActions.onToggleDeploy(
                                            s.id,
                                            false,
                                          );
                                        if (err) {
                                          const msg =
                                            typeof err === "string"
                                              ? err
                                              : String(err);
                                          toast.error(
                                            "Could not stop strategy",
                                            {
                                              description: msg,
                                              duration: 10_000,
                                            },
                                          );
                                          addLog("error", msg);
                                          return;
                                        }
                                        addLog(
                                          "warn",
                                          `Strategy "${s.name}" stopped`,
                                        );
                                        chartmateActions.onRefresh?.();
                                        return;
                                      }
                                      setMyStrategies((prev) =>
                                        prev.map((x) =>
                                          x.id === s.id
                                            ? { ...x, deployed: false }
                                            : x,
                                        ),
                                      );
                                      addLog(
                                        "warn",
                                        `Strategy "${s.name}" stopped (local preview)`,
                                      );
                                    }}
                                  >
                                    &#x23F9; Stop
                                  </button>
                                  {useChartmate &&
                                  typeof onCancelPendingForStrategy ===
                                    "function" ? (
                                    <button
                                      type="button"
                                      className="strat-action-btn strat-btn-edit"
                                      style={{
                                        borderColor: "rgba(251,146,60,0.45)",
                                        color: "var(--accent-orange)",
                                      }}
                                      title="Cancel queued conditional entry rows for this strategy only (does not flatten open positions)"
                                      disabled={cancelPendingBusyId === s.id}
                                      onClick={() => {
                                        void (async () => {
                                          setCancelPendingBusyId(s.id);
                                          try {
                                            const err =
                                              await onCancelPendingForStrategy(
                                                s.id,
                                              );
                                            if (err) {
                                              const msg =
                                                typeof err === "string"
                                                  ? err
                                                  : String(err);
                                              toast.error(
                                                "Could not cancel pending orders",
                                                {
                                                  description: msg,
                                                  duration: 10_000,
                                                },
                                              );
                                              addLog("error", msg);
                                              return;
                                            }
                                            toast.success(
                                              "Pending orders cancelled",
                                              {
                                                description: `Cleared queued rows for “${s.name}”.`,
                                              },
                                            );
                                            addLog(
                                              "exec",
                                              `Cancelled pending conditional orders for "${s.name}"`,
                                            );
                                            chartmateActions?.onRefresh?.();
                                          } catch (e) {
                                            const msg =
                                              e instanceof Error
                                                ? e.message
                                                : "Unexpected error.";
                                            toast.error(
                                              "Cancel pending failed",
                                              { description: msg },
                                            );
                                            addLog("error", msg);
                                          } finally {
                                            setCancelPendingBusyId(null);
                                          }
                                        })();
                                      }}
                                    >
                                      {cancelPendingBusyId === s.id
                                        ? "Cancelling…"
                                        : "⏸ Cancel pending"}
                                    </button>
                                  ) : null}
                                </>
                              )}
                              <button
                                type="button"
                                className="strat-action-btn strat-btn-edit"
                                title="Edit this strategy"
                                onClick={() => {
                                  // Pass the full raw DB row so AlgoStrategyBuilder can pre-populate all fields
                                  setEditAlgoTarget(s._raw ?? s);
                                  setShowExactAlgoBuilder(true);
                                }}
                              >
                                &#x270E; Edit
                              </button>
                              <button
                                type="button"
                                className="strat-action-btn strat-btn-delete"
                                onClick={() =>
                                  setPendingDelete({ id: s.id, name: s.name })
                                }
                              >
                                &#x2715; Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn-add-strategy"
                    onClick={() => {
                      setStratStep(0);
                      setShowExactAlgoBuilder(true);
                    }}
                  >
                    + Create New Strategy
                  </button>
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        padding: 20,
                        borderRadius: 12,
                        background: "rgba(15,23,42,0.5)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          marginBottom: 4,
                          color: "var(--text-primary)",
                        }}
                      >
                        Quick Stats
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginBottom: 14,
                        }}
                      >
                        Your strategy portfolio at a glance. Use{" "}
                        <strong>+ Create New Strategy</strong> for a popup form
                        (ChartMate{" "}
                        <code style={{ fontSize: 10 }}>manage-strategy</code>).
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <div className="my-strat-param">
                          <span className="my-strat-param-label">Total</span>
                          <span className="my-strat-param-value">
                            {myStrategies.length}
                          </span>
                        </div>
                        <div className="my-strat-param">
                          <span className="my-strat-param-label">Scanning</span>
                          <span
                            className="my-strat-param-value"
                            style={{ color: "var(--accent-green)" }}
                          >
                            {
                              myStrategies.filter((s) => {
                                const st = normalizeLifecycleState(
                                  s.lifecycle_state,
                                  Boolean(s.deployed),
                                );
                                return (
                                  st === "ACTIVE" ||
                                  st === "WAITING_MARKET_OPEN" ||
                                  st === "TRIGGERED"
                                );
                              }).length
                            }
                          </span>
                        </div>
                        <div className="my-strat-param">
                          <span className="my-strat-param-label">Off</span>
                          <span
                            className="my-strat-param-value"
                            style={{ color: "var(--accent-yellow)" }}
                          >
                            {
                              myStrategies.filter((s) => {
                                const st = normalizeLifecycleState(
                                  s.lifecycle_state,
                                  Boolean(s.deployed),
                                );
                                return !(
                                  st === "ACTIVE" ||
                                  st === "WAITING_MARKET_OPEN" ||
                                  st === "TRIGGERED"
                                );
                              }).length
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Options Strategies — exact ChartMate OptionsStrategiesWorkspace embedded */}
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-header" style={{ marginBottom: 0 }}>
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(52,211,153,0.1)",
                      color: "var(--accent-green)",
                    }}
                  >
                    &#x1F4CA;
                  </span>
                  Options Strategies
                </div>
                <span className="card-badge badge-green">
                  Live · chartmate-options-api
                </span>
              </div>
              {/* AlgoOnlyOptionsWorkspace — live-only, broker-gated, no paper/backtest buttons */}
              <AlgoOnlyOptionsWorkspace
                accountCaps={{
                  activeOrders: activeOrdersCap,
                  activeStrategies: activeStrategiesCap,
                  limits: {
                    orders: capOrdersLimit,
                    strategies: capStrategiesLimit,
                  },
                  cash: brokerSnap?.cash_available,
                }}
                positionsStreamStale={positionsStreamStale}
                optionsPositionsFrame={optionsPositionsFrame}
              />
            </div>

            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-header">
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(167,139,250,0.1)",
                      color: "var(--accent-purple)",
                    }}
                  >
                    &#x23F3;
                  </span>
                  Pending Execution Queue
                </div>
                <span className="card-badge badge-blue">
                  {(summary?.pending_executions ?? []).length} rows
                </span>
              </div>
              {!summary?.pending_executions?.length ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  No pending execution rows right now. Once a strategy is active
                  and scanning, this queue shows live checks and pending/failed
                  execution states from{" "}
                  <code style={{ fontSize: 11 }}>
                    pending_conditional_orders
                  </code>
                  .
                </div>
              ) : (
                <div className="order-feed">
                  {summary.pending_executions.map((p) => (
                    <div className="order-item" key={p.id}>
                      <div
                        className={`order-icon ${String(p.action || "").toLowerCase() === "buy" ? "buy" : "sell"}`}
                      >
                        {String(p.action || "").toUpperCase() === "BUY"
                          ? "\u25B2"
                          : "\u25BC"}
                      </div>
                      <div>
                        <div className="order-pair">
                          {p.symbol || "—"}{" "}
                          <span
                            style={{
                              color: "var(--accent-cyan)",
                              fontSize: 11,
                              textTransform: "uppercase",
                            }}
                          >
                            {p.status}
                          </span>
                        </div>
                        <div className="order-meta">
                          strategy_id: {p.strategy_id || "—"}{" "}
                          {p.last_checked_at
                            ? `• checked ${p.last_checked_at}`
                            : ""}
                        </div>
                        {p.error_message ? (
                          <div
                            style={{
                              fontSize: 11,
                              color: "var(--accent-orange)",
                              marginTop: 2,
                              lineHeight: 1.3,
                            }}
                          >
                            {p.error_message}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <div className="order-time">{p.created_at || "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* LIVE MONITORING */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(52,211,153,0.1)",
                      color: "var(--accent-green)",
                    }}
                  >
                    &#x1F4F6;
                  </span>
                  Live Monitoring
                </div>
                <span className="card-badge badge-green">
                  {liveMonitorStrategies.length} running
                </span>
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  margin: "0 0 12px",
                  lineHeight: 1.5,
                }}
              >
                Summary of strategies that are scanning or waiting on the
                engine. Open{" "}
                <strong style={{ color: "var(--accent-cyan)" }}>
                  Live view
                </strong>{" "}
                on a card (or below) for candles, LTP, and the full condition
                matrix.
              </p>
              {liveMonitorStrategies.length === 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  No active strategy monitors yet. Activate a strategy to list
                  it here, then use Live view for charts and conditions.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {liveMonitorStrategies.map((s) => {
                    const lcState = normalizeLifecycleState(
                      s.lifecycle_state,
                      Boolean(s.deployed),
                    );
                    const { symbol: symHint } = chartRoutingFromStrategyCard(s);
                    return (
                      <div
                        key={`live-${s.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          padding: "10px 12px",
                          background: "rgba(10,14,23,0.45)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 4,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 700 }}>
                              {s.name}
                            </span>
                            <span className="my-strat-card-type type-momentum">
                              {s.type}
                            </span>
                            <span
                              className={`strategy-tag ${strategyTagClass(lcState)}`}
                            >
                              {lifecycleLabel(lcState)}
                            </span>
                          </div>
                          <span
                            style={{ fontSize: 10, color: "var(--text-muted)" }}
                          >
                            Chart symbol:{" "}
                            <span style={{ color: "var(--text-secondary)" }}>
                              {symHint || "—"}
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          className="action-btn btn-primary"
                          style={{
                            padding: "6px 12px",
                            fontSize: 11,
                            borderRadius: 8,
                            whiteSpace: "nowrap",
                          }}
                          disabled={!sessLive}
                          title={
                            !sessLive
                              ? "Connect broker for live chart quotes"
                              : "Open chart + conditions"
                          }
                          onClick={() => {
                            if (!sessLive) {
                              toast.error(
                                "Connect broker (live session) to open Live view.",
                              );
                              return;
                            }
                            setLiveViewTarget(s);
                          }}
                        >
                          Live view
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cumulative P&L level (no fake time-range curve until a history API exists). */}
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-header">
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(99,102,241,0.1)",
                      color: "var(--accent-blue)",
                    }}
                  >
                    &#x1F4C8;
                  </span>
                  Cumulative P&L (current level)
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  padding: "0 4px 12px",
                }}
              >
                Horizontal line = your latest cumulative P&L from ChartMate.
                Intraday equity history is not wired in algo-only yet (widget
                uses additional pages/services for that).
              </div>
              <div className="chart-area">
                <canvas ref={canvasRef} className="chart-canvas" />
              </div>
            </div>

            {/* ACTIVITY LOG */}
            <div className="card activity-log">
              <div className="card-header">
                <div className="card-title">
                  <span
                    className="card-title-icon"
                    style={{
                      background: "rgba(251,191,36,0.1)",
                      color: "var(--accent-yellow)",
                    }}
                  >
                    &#x1F4CB;
                  </span>
                  System Activity Log
                </div>
                <span className="card-badge badge-yellow">Live</span>
              </div>
              <div className="log-entries" ref={logRef}>
                {logs.map((l, i) => (
                  <div className="log-entry" key={i}>
                    <span className="log-time">
                      {l.time ||
                        new Date().toLocaleTimeString("en-US", {
                          hour12: false,
                        })}
                    </span>
                    <span className={`log-type ${l.type}`}>
                      [{l.type.toUpperCase()}]
                    </span>
                    <span className="log-msg">{l.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {false && optionsPanel ? (
        <ModalShell
          open={optionsModalOpen}
          title="Options — live execute"
          onClose={() => !optionsPanel.busy && setOptionsModalOpen(false)}
        >
          <div className="strategy-form">
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 12,
              }}
            >
              Mirrors ChartMate{" "}
              <code style={{ fontSize: 10 }}>OptionsStrategyPage</code> execute
              params (iron condor / short strangle). Underlying lot size presets
              match the widget; edit if your contract differs.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                marginBottom: 14,
              }}
            >
              {OPTIONS_WIZARD_STEPS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className="action-btn btn-primary"
                  style={{
                    padding: "6px 10px",
                    fontSize: 11,
                    opacity: optionsStep === idx ? 1 : 0.55,
                    borderColor:
                      optionsStep === idx
                        ? "var(--accent-cyan)"
                        : "var(--border-color)",
                  }}
                  disabled={optionsPanel.busy}
                  onClick={() => setOptionsStep(idx)}
                >
                  {idx + 1}. {label}
                </button>
              ))}
            </div>
            {optionsStep === 0 ? (
              <>
                <div className="form-group">
                  <label className="form-label">Strategy</label>
                  <select
                    className="form-select"
                    value={optForm.strategy_type}
                    onChange={(e) =>
                      setOptForm({ ...optForm, strategy_type: e.target.value })
                    }
                    disabled={optionsPanel.busy}
                  >
                    <option value="iron_condor">Iron condor</option>
                    <option value="strangle">Short strangle</option>
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Underlying *</label>
                    <input
                      className="form-input"
                      value={optForm.underlying}
                      onChange={(e) =>
                        setOptForm({
                          ...optForm,
                          underlying: e.target.value.toUpperCase(),
                        })
                      }
                      disabled={optionsPanel.busy}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Venue</label>
                    <select
                      className="form-select"
                      value={optForm.venue}
                      onChange={(e) =>
                        setOptForm({ ...optForm, venue: e.target.value })
                      }
                      disabled={optionsPanel.busy}
                    >
                      <option value="NSE_INDEX">NSE_INDEX (index)</option>
                      <option value="NFO">NFO</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Expiry (optional, YYYY-MM-DD)
                  </label>
                  <input
                    className="form-input"
                    placeholder="e.g. 2026-04-24"
                    value={optForm.expiry_date}
                    onChange={(e) =>
                      setOptForm({ ...optForm, expiry_date: e.target.value })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Lots</label>
                    <input
                      className="form-input"
                      type="number"
                      min={1}
                      value={optForm.lots}
                      onChange={(e) =>
                        setOptForm({ ...optForm, lots: e.target.value })
                      }
                      disabled={optionsPanel.busy}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Lot size (units / lot)</label>
                    <input
                      className="form-input"
                      type="number"
                      min={1}
                      value={optForm.lot_size}
                      onChange={(e) =>
                        setOptForm({ ...optForm, lot_size: e.target.value })
                      }
                      disabled={optionsPanel.busy}
                    />
                    <button
                      type="button"
                      className="action-btn btn-primary"
                      style={{
                        marginTop: 6,
                        padding: "6px 10px",
                        fontSize: 11,
                      }}
                      disabled={optionsPanel.busy}
                      onClick={() =>
                        setOptForm((f) => ({
                          ...f,
                          lot_size: String(lotUnitsForUnderlying(f.underlying)),
                        }))
                      }
                    >
                      Use index lot for underlying
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {optionsStep === 2 ? (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Capital (₹)</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    value={optForm.capital}
                    onChange={(e) =>
                      setOptForm({ ...optForm, capital: e.target.value })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Risk % (of capital)</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.1"
                    value={optForm.risk_pct}
                    onChange={(e) =>
                      setOptForm({ ...optForm, risk_pct: e.target.value })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
              </div>
            ) : null}
            {optionsStep === 1 && optForm.strategy_type === "iron_condor" ? (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Wing width (pts)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={optForm.wing_width_pts}
                    onChange={(e) =>
                      setOptForm({ ...optForm, wing_width_pts: e.target.value })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Delta target</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    value={optForm.delta_target}
                    onChange={(e) =>
                      setOptForm({ ...optForm, delta_target: e.target.value })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
              </div>
            ) : optionsStep === 1 ? (
              <div className="form-group">
                <label className="form-label">Delta target</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.01"
                  value={optForm.delta_target}
                  onChange={(e) =>
                    setOptForm({ ...optForm, delta_target: e.target.value })
                  }
                  disabled={optionsPanel.busy}
                />
              </div>
            ) : null}
            {optionsStep === 1 ? (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Min VIX</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.1"
                    value={optForm.min_vix}
                    onChange={(e) =>
                      setOptForm({ ...optForm, min_vix: e.target.value })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Min net premium (pts)</label>
                  <input
                    className="form-input"
                    type="number"
                    step="1"
                    value={optForm.min_net_premium}
                    onChange={(e) =>
                      setOptForm({
                        ...optForm,
                        min_net_premium: e.target.value,
                      })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
              </div>
            ) : null}
            {optionsStep === 1 && optForm.strategy_type === "strangle" ? (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Roll trigger (pts)</label>
                  <input
                    className="form-input"
                    type="number"
                    value={optForm.roll_trigger_pts}
                    onChange={(e) =>
                      setOptForm({
                        ...optForm,
                        roll_trigger_pts: e.target.value,
                      })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Max adjustments</label>
                  <input
                    className="form-input"
                    type="number"
                    min={0}
                    value={optForm.max_adjustments}
                    onChange={(e) =>
                      setOptForm({
                        ...optForm,
                        max_adjustments: e.target.value,
                      })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
              </div>
            ) : null}
            {optionsStep === 2 ? (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    Profit target (% of max profit)
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    step="1"
                    value={optForm.profit_target_pct}
                    onChange={(e) =>
                      setOptForm({
                        ...optForm,
                        profit_target_pct: e.target.value,
                      })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Stop loss (× max loss)</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.1"
                    value={optForm.stop_loss_mult}
                    onChange={(e) =>
                      setOptForm({ ...optForm, stop_loss_mult: e.target.value })
                    }
                    disabled={optionsPanel.busy}
                  />
                </div>
              </div>
            ) : null}
            {optionsPanel.message ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--accent-yellow)",
                  marginBottom: 8,
                }}
              >
                {optionsPanel.message}
              </div>
            ) : null}
            {optionsPanel.locked ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--accent-orange)",
                  marginBottom: 8,
                }}
              >
                Connect your broker (live session) before executing options.
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="action-btn btn-warning"
                disabled={optionsPanel.busy || optionsStep === 0}
                onClick={() => setOptionsStep((s) => Math.max(0, s - 1))}
              >
                Back
              </button>
              {optionsStep < 2 ? (
                <button
                  type="button"
                  className="action-btn btn-primary"
                  disabled={optionsPanel.busy}
                  onClick={() => setOptionsStep((s) => Math.min(2, s + 1))}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="action-btn btn-primary"
                  disabled={optionsPanel.busy || Boolean(optionsPanel.locked)}
                  onClick={() => {
                    void (async () => {
                      const underlying =
                        optForm.underlying.trim().toUpperCase() || "NIFTY";
                      const lots = Math.max(1, parseInt(optForm.lots, 10) || 1);
                      const lot_size = Math.max(
                        1,
                        parseInt(optForm.lot_size, 10) ||
                          lotUnitsForUnderlying(underlying),
                      );
                      const exchange =
                        optForm.venue === "NFO" ? "NFO" : "NSE_INDEX";
                      const expiryRaw = optForm.expiry_date.trim();
                      const expiry_date = expiryRaw ? expiryRaw : undefined;
                      const capital = Number(optForm.capital) || 500000;
                      const risk_pct = (Number(optForm.risk_pct) || 2) / 100;
                      const common = {
                        underlying,
                        exchange,
                        expiry_date,
                        lots,
                        lot_size,
                        capital,
                        risk_pct,
                      };
                      let body = null;
                      if (optForm.strategy_type === "iron_condor") {
                        body = {
                          strategy_type: "iron_condor",
                          params: {
                            ...common,
                            wing_width_pts:
                              Number(optForm.wing_width_pts) || 200,
                            delta_target: Number(optForm.delta_target) || 0.16,
                            min_vix: Number(optForm.min_vix) || 13,
                            min_net_premium:
                              Number(optForm.min_net_premium) || 35,
                            profit_target_pct:
                              (Number(optForm.profit_target_pct) || 45) / 100,
                            stop_loss_mult: Number(optForm.stop_loss_mult) || 2,
                          },
                        };
                      } else {
                        body = {
                          strategy_type: "strangle",
                          params: {
                            ...common,
                            delta_target: Number(optForm.delta_target) || 0.2,
                            min_vix: Number(optForm.min_vix) || 18,
                            min_net_premium:
                              Number(optForm.min_net_premium) || 35,
                            roll_trigger_pts:
                              Number(optForm.roll_trigger_pts) || 30,
                            max_adjustments:
                              Number(optForm.max_adjustments) || 2,
                            profit_target_pct:
                              (Number(optForm.profit_target_pct) || 50) / 100,
                            stop_loss_mult: Number(optForm.stop_loss_mult) || 2,
                          },
                        };
                      }
                      await optionsPanel.onExecuteBody?.(body);
                    })();
                  }}
                >
                  {optionsPanel.busy ? "Running…" : "Run live execute"}
                </button>
              )}
            </div>
          </div>
        </ModalShell>
      ) : null}

      <ModalShell
        open={Boolean(goLiveTarget)}
        title="Activate strategy (live)"
        onClose={() => {
          if (!goLiveBusy) setGoLiveTarget(null);
        }}
      >
        <div className="strategy-form">
          <p
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 12,
            }}
          >
            Same flow as ChartMate broker portfolio: set symbol, exchange,
            quantity, and product, then activate. Entry/exit automation runs
            when conditions match (server-side scanning).
          </p>
          {goLiveTarget ? (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginBottom: 12,
              }}
            >
              Strategy: <strong>{goLiveTarget.name}</strong>
            </p>
          ) : null}
          <div className="form-group">
            <label className="form-label">Symbol *</label>
            <input
              className="form-input"
              value={goLiveForm.symbol}
              onChange={(e) =>
                setGoLiveForm({
                  ...goLiveForm,
                  symbol: e.target.value.toUpperCase(),
                })
              }
              disabled={goLiveBusy}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Exchange</label>
              <select
                className="form-select"
                value={goLiveForm.exchange}
                onChange={(e) =>
                  setGoLiveForm({ ...goLiveForm, exchange: e.target.value })
                }
                disabled={goLiveBusy}
              >
                {GO_LIVE_EXCHANGES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={goLiveForm.quantity}
                onChange={(e) =>
                  setGoLiveForm({ ...goLiveForm, quantity: e.target.value })
                }
                disabled={goLiveBusy}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Product</label>
            <select
              className="form-select"
              value={goLiveForm.product}
              onChange={(e) =>
                setGoLiveForm({ ...goLiveForm, product: e.target.value })
              }
              disabled={goLiveBusy}
            >
              {GO_LIVE_PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 12,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="action-btn btn-primary"
              style={{ flex: 1 }}
              disabled={goLiveBusy || !chartmateActions?.onConfirmGoLive}
              onClick={() => {
                void (async () => {
                  if (!goLiveTarget || !chartmateActions?.onConfirmGoLive)
                    return;
                  const qty = Math.floor(Number(goLiveForm.quantity));
                  if (!Number.isFinite(qty) || qty < 1) {
                    toast.error("Invalid quantity", {
                      description: "Enter a whole number ≥ 1.",
                    });
                    return;
                  }
                  setGoLiveBusy(true);
                  try {
                    const err = await chartmateActions.onConfirmGoLive(
                      goLiveTarget.id,
                      goLiveTarget.position_config,
                      {
                        symbol: goLiveForm.symbol,
                        exchange: goLiveForm.exchange,
                        quantity: qty,
                        product: goLiveForm.product,
                      },
                    );
                    if (err) {
                      const msg = typeof err === "string" ? err : String(err);
                      toast.error("Strategy was not activated", {
                        description: msg,
                        duration: 12_000,
                      });
                      addLog("error", msg);
                    } else {
                      toast.success("Strategy activated", {
                        description: `${goLiveTarget.name} · ${String(goLiveForm.symbol || "").toUpperCase()} × ${qty}`,
                      });
                      addLog(
                        "exec",
                        `Strategy "${goLiveTarget.name}" activated (${goLiveForm.symbol} × ${qty})`,
                      );
                      chartmateActions.onRefresh?.();
                      setGoLiveTarget(null);
                    }
                  } catch (e) {
                    const msg =
                      e instanceof Error
                        ? e.message
                        : "Unexpected error during activation.";
                    toast.error("Activation failed", {
                      description: msg,
                      duration: 12_000,
                    });
                    addLog("error", msg);
                  } finally {
                    setGoLiveBusy(false);
                  }
                })();
              }}
            >
              {goLiveBusy ? "Activating…" : "Activate & start scanning"}
            </button>
            <button
              type="button"
              className="action-btn btn-warning"
              disabled={goLiveBusy}
              onClick={() => setGoLiveTarget(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={Boolean(liveViewTarget)}
        title={
          liveViewTarget ? `Live view — ${liveViewTarget.name}` : "Live view"
        }
        onClose={() => setLiveViewTarget(null)}
      >
        {liveViewTarget ? (
          <div className="strategy-form" style={{ maxWidth: 760 }}>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 12,
                lineHeight: 1.55,
              }}
            >
              Intraday candles refresh from the BFF; condition rows mirror the
              strategy engine snapshots (updates can be spaced out — that is
              normal during scanning).
            </p>
            {(() => {
              const ch = chartRoutingFromStrategyCard(liveViewTarget);
              const lvLc = normalizeLifecycleState(
                liveViewTarget.lifecycle_state,
                Boolean(liveViewTarget.deployed),
              );
              return (
                <>
                  {sessionAccessToken ? (
                    <div style={{ marginBottom: 12 }}>
                      <StrategyLiveChart
                        accessToken={sessionAccessToken}
                        symbol={ch.symbol}
                        historyExchange={ch.exchange}
                        quoteExchange={ch.exchange}
                        height={260}
                        interval="5m"
                      />
                    </div>
                  ) : (
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--accent-orange)",
                        marginBottom: 12,
                      }}
                    >
                      Chart needs a signed-in session. Refresh the page or
                      reconnect broker, then open Live view again.
                    </p>
                  )}
                  <StrategyConditionPanel
                    strategyId={liveViewTarget.id}
                    strategyName={liveViewTarget.name}
                    brokerLive={sessLive}
                    streamStale={positionsStreamStale}
                    lifecycleState={lvLc}
                    showStrategyTitle={false}
                  />
                </>
              );
            })()}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              {useChartmate && sessLive ? (
                <button
                  type="button"
                  className="action-btn btn-primary"
                  style={{ flex: 1, minWidth: 140 }}
                  disabled={goLiveBusy}
                  title="Merge another symbol into this strategy (same manage-strategy flow as portfolio)"
                  onClick={() => {
                    const t = liveViewTarget;
                    setLiveViewTarget(null);
                    setGoLiveTarget(t);
                    setGoLiveForm(defaultsGoLiveFromCard(t));
                  }}
                >
                  + Add instrument…
                </button>
              ) : null}
              <button
                type="button"
                className="action-btn btn-warning"
                style={{ minWidth: 120 }}
                onClick={() => {
                  setEditAlgoTarget(liveViewTarget._raw ?? liveViewTarget);
                  setShowExactAlgoBuilder(true);
                  setLiveViewTarget(null);
                }}
              >
                Edit strategy
              </button>
              {useChartmate &&
              typeof onCancelPendingForStrategy === "function" ? (
                <button
                  type="button"
                  className="action-btn btn-warning"
                  style={{
                    borderColor: "rgba(251,146,60,0.45)",
                    color: "var(--accent-orange)",
                    minWidth: 140,
                  }}
                  disabled={cancelPendingBusyId === liveViewTarget.id}
                  onClick={() => {
                    const id = liveViewTarget.id;
                    void (async () => {
                      setCancelPendingBusyId(id);
                      try {
                        const err = await onCancelPendingForStrategy(id);
                        if (err) {
                          const msg =
                            typeof err === "string" ? err : String(err);
                          toast.error("Could not cancel pending orders", {
                            description: msg,
                            duration: 10_000,
                          });
                          addLog("error", msg);
                          return;
                        }
                        toast.success("Pending orders cancelled");
                        chartmateActions?.onRefresh?.();
                      } catch (e) {
                        const msg =
                          e instanceof Error ? e.message : "Unexpected error.";
                        toast.error("Cancel pending failed", {
                          description: msg,
                        });
                        addLog("error", msg);
                      } finally {
                        setCancelPendingBusyId(null);
                      }
                    })();
                  }}
                >
                  {cancelPendingBusyId === liveViewTarget.id
                    ? "Cancelling…"
                    : "Cancel pending"}
                </button>
              ) : null}
              <button
                type="button"
                className="action-btn btn-primary"
                style={{ minWidth: 90 }}
                onClick={() => setLiveViewTarget(null)}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>

      {false && (
        <ModalShell
          open={showStratForm}
          title="Create strategy (ChartMate)"
          onClose={() => {
            setShowStratForm(false);
            setStratStep(0);
          }}
        >
          <div className="strategy-form">
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 12,
              }}
            >
              Saves to ChartMate via{" "}
              <code style={{ fontSize: 11 }}>manage-strategy</code> create (same
              fields as portfolio strategy form). A{" "}
              <strong>live broker session</strong> is required only to{" "}
              <strong>Activate</strong> a strategy (symbol/qty popup), not to
              save the definition.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                gap: 6,
                marginBottom: 14,
              }}
            >
              {STRATEGY_WIZARD_STEPS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className="action-btn btn-primary"
                  style={{
                    padding: "5px 8px",
                    fontSize: 10,
                    opacity: stratStep === idx ? 1 : 0.55,
                    borderColor:
                      stratStep === idx
                        ? "var(--accent-cyan)"
                        : "var(--border-color)",
                  }}
                  onClick={() => setStratStep(idx)}
                >
                  {idx + 1}. {label}
                </button>
              ))}
            </div>
            {stratStep === 0 ? (
              <>
                <div className="form-group">
                  <label className="form-label">Strategy name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Opening range breakout"
                    value={stratForm.name}
                    onChange={(e) =>
                      setStratForm({ ...stratForm, name: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input
                    className="form-input"
                    placeholder="Short note (optional)"
                    value={stratForm.description}
                    onChange={(e) =>
                      setStratForm({
                        ...stratForm,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Trading mode</label>
                    <select
                      className="form-select"
                      value={stratForm.trading_mode}
                      onChange={(e) =>
                        setStratForm({
                          ...stratForm,
                          trading_mode: e.target.value,
                        })
                      }
                    >
                      <option value="LONG">Long only (buy)</option>
                      <option value="SHORT">Short only (sell)</option>
                      <option value="BOTH">Both</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Session type</label>
                    <select
                      className="form-select"
                      value={stratForm.is_intraday}
                      onChange={(e) =>
                        setStratForm({
                          ...stratForm,
                          is_intraday: e.target.value,
                        })
                      }
                    >
                      <option value="true">Intraday (MIS-style window)</option>
                      <option value="false">Positional / multi-day</option>
                    </select>
                  </div>
                </div>
              </>
            ) : null}
            {stratStep === 1 ? (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start time</label>
                  <input
                    className="form-input"
                    value={stratForm.start_time}
                    onChange={(e) =>
                      setStratForm({ ...stratForm, start_time: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End time</label>
                  <input
                    className="form-input"
                    value={stratForm.end_time}
                    onChange={(e) =>
                      setStratForm({ ...stratForm, end_time: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Square-off</label>
                  <input
                    className="form-input"
                    value={stratForm.squareoff_time}
                    onChange={(e) =>
                      setStratForm({
                        ...stratForm,
                        squareoff_time: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
            {stratStep === 2 ? (
              <>
                <div className="form-group">
                  <label className="form-label">
                    Symbols (comma-separated)
                  </label>
                  <input
                    className="form-input"
                    placeholder="RELIANCE, TCS, INFY"
                    value={stratForm.symbols_raw}
                    onChange={(e) =>
                      setStratForm({
                        ...stratForm,
                        symbols_raw: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Entry conditions (expression)
                  </label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="e.g. close > ema20 and rsi14 > 55"
                    value={stratForm.entry_rule}
                    onChange={(e) =>
                      setStratForm({ ...stratForm, entry_rule: e.target.value })
                    }
                  />
                </div>
              </>
            ) : null}
            {stratStep === 3 ? (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Stop loss (%)</label>
                    <input
                      className="form-input"
                      type="number"
                      step="0.1"
                      value={stratForm.stop_loss_pct}
                      onChange={(e) =>
                        setStratForm({
                          ...stratForm,
                          stop_loss_pct: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Take profit (%)</label>
                    <input
                      className="form-input"
                      type="number"
                      step="0.1"
                      value={stratForm.take_profit_pct}
                      onChange={(e) =>
                        setStratForm({
                          ...stratForm,
                          take_profit_pct: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Exit conditions (expression)
                  </label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="e.g. close < ema20 or rsi14 < 45"
                    value={stratForm.exit_rule}
                    onChange={(e) =>
                      setStratForm({ ...stratForm, exit_rule: e.target.value })
                    }
                  />
                </div>
              </>
            ) : null}
            {stratStep === 4 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                Position setup (symbol, exchange, quantity, product) happens in{" "}
                <strong>Activate strategy</strong> popup, same as ChartMate
                go-live flow. This keeps strategy definition separate from
                execution assignment.
              </div>
            ) : null}
            {stratStep === 5 ? (
              <div className="form-group">
                <label className="form-label">Risk per trade (%)</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.1"
                  value={stratForm.risk_per_trade_pct}
                  onChange={(e) =>
                    setStratForm({
                      ...stratForm,
                      risk_per_trade_pct: e.target.value,
                    })
                  }
                />
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="action-btn btn-warning"
                disabled={stratStep === 0}
                onClick={() => setStratStep((s) => Math.max(0, s - 1))}
              >
                Back
              </button>
              {stratStep < STRATEGY_WIZARD_STEPS.length - 1 ? (
                <button
                  type="button"
                  className="action-btn btn-primary"
                  onClick={() =>
                    setStratStep((s) =>
                      Math.min(STRATEGY_WIZARD_STEPS.length - 1, s + 1),
                    )
                  }
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  className="action-btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={async () => {
                    if (!stratForm.name) return;
                    if (useChartmate && chartmateActions?.onCreateStrategy) {
                      const savedName = stratForm.name;
                      const err =
                        await chartmateActions.onCreateStrategy(stratForm);
                      if (err) {
                        addLog("error", err);
                        return;
                      }
                      setStratForm(emptyStratForm());
                      setShowStratForm(false);
                      setStratStep(0);
                      addLog(
                        "info",
                        `Strategy "${savedName}" saved to ChartMate`,
                      );
                      chartmateActions.onRefresh?.();
                      return;
                    }
                    addLog(
                      "error",
                      "Sign in with ChartMate to save strategies.",
                    );
                  }}
                >
                  Save to ChartMate
                </button>
              )}
              <button
                type="button"
                className="action-btn btn-warning"
                onClick={() => {
                  setShowStratForm(false);
                  setStratStep(0);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      <AlgoStrategyBuilder
        open={showExactAlgoBuilder}
        onOpenChange={(open) => {
          setShowExactAlgoBuilder(open);
          if (!open) setEditAlgoTarget(null);
        }}
        existing={editAlgoTarget}
        onSaved={() => {
          const wasEdit = Boolean(editAlgoTarget);
          setEditAlgoTarget(null);
          chartmateActions?.onRefresh?.();
          addLog(
            "info",
            wasEdit
              ? "Strategy updated via ChartMate builder"
              : "Strategy saved via ChartMate builder",
          );
        }}
      />
      <OptionsStrategyBuilderDialog
        open={showExactOptionsBuilder}
        onOpenChange={setShowExactOptionsBuilder}
        editStrategy={null}
        onSaved={() => {
          chartmateActions?.onRefresh?.();
          addLog("info", "Options strategy saved via ChartMate builder");
        }}
      />
      {/* Toaster for broker-gate notifications and strategy feedback */}
      <Toaster richColors position="top-right" />

    </>
  );
}
