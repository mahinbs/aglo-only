import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { toast } from "sonner";
import { Toaster } from "sonner";
import {
  FaBan,
  FaBolt,
  FaBrain,
  FaBullseye,
  FaChartLine,
  FaCircleCheck,
  FaClipboardList,
  FaFlag,
  FaHourglassHalf,
  FaLaptopCode,
  FaPaperclip,
  FaRobot,
  FaRocket,
  FaScaleBalanced,
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6";
import { ModalShell } from "./ModalShell.jsx";
import AlgoStrategyBuilder from "@/components/trading/AlgoStrategyBuilder";
import { OptionsStrategyBuilderDialog } from "@/components/options/OptionsStrategyBuilderDialog";
import { OptionsStrategyActivateDialog } from "@/components/options/OptionsStrategyActivateDialog";
import YahooChartPanel from "@/components/YahooChartPanel";
import BffUnderlyingChart from "./BffUnderlyingChart";
import { fetchLtp } from "@/lib/optionsApi";
import { supabase } from "@/integrations/supabase/client";
import { StrategyConditionPanel } from "./StrategyConditionPanel";
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
  let symbol = "";
  let exchange = "NSE";
  let quantity = "1";
  let product = s.is_intraday !== false ? "MIS" : "CNC";
  const pc = s.position_config;
  if (pc && typeof pc === "object") {
    const pq = Number(pc.quantity ?? 0);
    if (Number.isFinite(pq) && pq >= 1) quantity = String(Math.floor(pq));
    const ex = String(pc.exchange ?? "").trim();
    if (ex) exchange = ex.toUpperCase();
    const op = String(pc.orderProduct ?? "").trim();
    if (op) product = op.toUpperCase();
    const ad = pc.activation_defaults;
    if (ad && typeof ad === "object") {
      const savedSymbol = String(ad.symbol ?? "")
        .trim()
        .toUpperCase();
      const savedExchange = String(ad.exchange ?? "")
        .trim()
        .toUpperCase();
      const savedQty = Number(ad.quantity ?? 0);
      const savedProduct = String(ad.product ?? "")
        .trim()
        .toUpperCase();
      if (savedSymbol) symbol = savedSymbol;
      if (savedExchange) exchange = savedExchange;
      if (Number.isFinite(savedQty) && savedQty >= 1)
        quantity = String(Math.floor(savedQty));
      if (savedProduct) product = savedProduct;
    }
  }
  return { symbol, exchange, quantity, product: product || "MIS" };
}

/** Symbol + exchange for BFF chart quote/history (same defaults as go-live). */
function chartRoutingFromStrategyCard(s) {
  const inferUnderlying = () => {
    const raw =
      s?.underlying ??
      s?._raw?.underlying ??
      s?.pairs ??
      s?._raw?.pairs ??
      "";
    const direct = String(raw || "")
      .trim()
      .toUpperCase()
      .split(",")[0]
      ?.trim();
    if (direct) return direct;
    const nm = String(s?.name || "").toUpperCase();
    if (nm.includes("CRUDE")) return "CRUDEOIL";
    if (nm.includes("BANKNIFTY")) return "BANKNIFTY";
    if (nm.includes("FINNIFTY")) return "FINNIFTY";
    if (nm.includes("NIFTY")) return "NIFTY";
    return "NIFTY";
  };
  const isOptions =
    Boolean(s?.is_options) || strategyKindTag(s) === "options";
  if (isOptions) {
    const und = inferUnderlying();
    const ex = String(s?.exchange || "NFO")
      .trim()
      .toUpperCase();
    // For options live-view + condition rows, always route by underlying.
    return { symbol: und, exchange: ex };
  }
  const d = defaultsGoLiveFromCard(s);
  const symbol = String(d.symbol || firstSymbolFromPairs(s.pairs) || "RELIANCE")
    .trim()
    .toUpperCase();
  const exchange = String(d.exchange || "NSE")
    .trim()
    .toUpperCase();
  return { symbol, exchange };
}

function yahooSymbolFromStrategyCard(s) {
  const { symbol, exchange } = chartRoutingFromStrategyCard(s);
  const clean = String(symbol || "")
    .trim()
    .toUpperCase();
  if (!clean) return "RELIANCE.NS";
  if (
    clean.includes(".") ||
    clean.includes("^") ||
    clean.includes("=") ||
    clean.includes("-")
  ) {
    return clean;
  }
  if (clean === "NIFTY") return "^NSEI";
  if (clean === "BANKNIFTY") return "^NSEBANK";
  if (clean === "FINNIFTY") return "NIFTY_FIN_SERVICE.NS";
  if (clean === "SENSEX") return "^BSESN";
  if (clean.startsWith("CRUDEOIL")) return "CL=F";
  const ex = String(exchange || "")
    .trim()
    .toUpperCase();
  if (ex === "MCX" || ex === "NCDEX") return "CL=F";
  if (ex === "BSE" || ex === "BFO") return `${clean}.BO`;
  return `${clean}.NS`;
}

function optionDeploymentInfoFromCard(s) {
  const raw =
    s && typeof s === "object" && s._raw && typeof s._raw === "object"
      ? s._raw
      : s;
  const state =
    raw && typeof raw.strategy_state === "object" ? raw.strategy_state : {};
  const dep = state && typeof state.deployment === "object" ? state.deployment : {};
  const optionSymbol = String(dep.options_symbol ?? "").trim().toUpperCase();
  const expiry = String(dep.expiry_iso ?? "").trim();
  const lotUnitsNum = Number(dep.lot_units ?? 0);
  const lotsNum = Number(dep.lots ?? 0);
  const lotUnits =
    Number.isFinite(lotUnitsNum) && lotUnitsNum > 0
      ? String(Math.floor(lotUnitsNum))
      : "";
  const lots = Number.isFinite(lotsNum) && lotsNum > 0 ? String(Math.floor(lotsNum)) : "";
  const qtyNum =
    Number.isFinite(lotsNum) &&
    lotsNum > 0 &&
    Number.isFinite(lotUnitsNum) &&
    lotUnitsNum > 0
      ? Math.floor(lotsNum) * Math.floor(lotUnitsNum)
      : 0;
  const quantity = qtyNum > 0 ? String(qtyNum) : "";
  const exchange = String(dep.exchange ?? raw?.exchange ?? "").trim().toUpperCase();
  return { optionSymbol, expiry, lotUnits, lots, quantity, exchange };
}

function brokerAllowedExchanges(brokerRaw) {
  const broker = String(brokerRaw || "")
    .trim()
    .toLowerCase();
  const india = ["NSE", "BSE", "NFO", "BFO", "CDS", "MCX", "NCDEX"];
  const map = {
    zerodha: india,
    upstox: india,
    fyers: india,
    dhan: india,
    angelone: india,
    angel: india,
    shoonya: india,
    kotak: india,
    iifl: india,
    groww: ["NSE", "BSE"],
  };
  return map[broker] ?? india;
}

function inferExchangeFromSearchRow(item) {
  const full = String(item?.full_symbol || "").toUpperCase();
  const hint = String(item?.exchange || "").toUpperCase();
  const type = String(item?.type || "").toLowerCase();
  // Restrict this search surface to Indian cash symbols only.
  // Prevents global/forex/crypto rows (e.g. BTC, EURUSD) from being mislabeled as NSE.
  if (type && !["stock", "etf"].includes(type)) return "";
  if (full.endsWith(".BO") || hint.includes("BSE")) return "BSE";
  if (full.endsWith(".NS") || hint.includes("NSE")) return "NSE";
  return "";
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
.hero { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-bottom:20px; }
.hero-card {
  background:linear-gradient(180deg, rgba(8,12,22,0.95), rgba(6,10,18,0.9));
  border:1px solid rgba(56,189,248,0.1);
  border-radius:12px;
  padding:18px 20px;
  min-height:108px;
  display:flex;
  flex-direction:column;
  gap:8px;
  position:relative;
  overflow:hidden;
  box-shadow:inset 0 1px 0 rgba(148,163,184,0.05);
}
.hero-card::before {
  content:'';
  position:absolute;
  left:0;
  right:0;
  top:0;
  height:1px;
  background:linear-gradient(90deg, rgba(56,189,248,0), rgba(56,189,248,0.4), rgba(56,189,248,0));
}
.hero-top-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.hero-label {
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:2px;
  color:rgba(148,163,184,0.85);
  font-weight:600;
}
.hero-currency-pill {
  border:1px solid rgba(56,189,248,0.24);
  border-radius:999px;
  padding:2px 8px;
  font-size:10px;
  color:var(--accent-cyan);
  font-family:'JetBrains Mono',monospace;
  background:rgba(56,189,248,0.08);
}
.hero-value { font-family:'Orbitron',sans-serif; font-size:40px; font-weight:700; line-height:1.05; letter-spacing:0.2px; }
.hero-value.positive { color:var(--accent-green); }
.hero-value.negative { color:var(--accent-red); }
.hero-value.neutral { color:var(--text-primary); }
.hero-change {
  font-size:12px;
  font-family:'JetBrains Mono',monospace;
  color:var(--text-muted);
  display:flex;
  align-items:center;
  gap:6px;
}
.hero-change.up { color:var(--accent-green); }
.hero-change.down { color:var(--accent-red); }
.hero-meta-line {
  font-size:11px;
  font-family:'JetBrains Mono',monospace;
  color:var(--text-muted);
}
.hero-meta-line .strong { color:var(--text-secondary); }
.hero-broker-strip {
  margin-top:auto;
  padding-top:4px;
  font-size:11px;
  font-family:'JetBrains Mono',monospace;
  color:var(--text-muted);
}

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
.dashboard { display:grid; grid-template-columns:1fr; gap:20px; }

/* ROBOT PANEL */
.robot-grid { display:grid; grid-template-columns:1fr; gap:24px; align-items:center; }
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
.order-item { display:grid; grid-template-columns:1fr auto; gap:12px; align-items:center; padding:12px;
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
.timeline-switch { display:flex; align-items:center; gap:6px; }
.timeline-btn {
  border:1px solid var(--border-color);
  background:rgba(15,23,42,0.45);
  color:var(--text-muted);
  border-radius:999px;
  padding:4px 10px;
  font-size:10px;
  font-family:'JetBrains Mono',monospace;
  cursor:pointer;
  transition:all 0.25s ease;
}
.timeline-btn:hover { border-color:var(--border-glow); color:var(--text-secondary); }
.timeline-btn.active {
  color:var(--accent-cyan);
  border-color:rgba(56,189,248,0.35);
  background:rgba(56,189,248,0.12);
}

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

/* MY STRATEGY PANEL */
.my-strategy-panel { grid-column:1/-1; }
.strategy-builder { display:grid; grid-template-columns:1fr; gap:20px; }
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
.my-strategy-list-shell {
  border:1px solid rgba(56,189,248,0.07);
  background:linear-gradient(180deg, rgba(6,11,21,0.86), rgba(4,8,17,0.82));
  border-radius:12px;
  padding:8px;
}
.my-strat-card { padding:16px; border-radius:12px; background:rgba(15,23,42,0.5);
  border:1px solid var(--border-color); transition:all 0.3s; position:relative; }
.my-strat-card:hover { border-color:var(--border-glow); }
.my-strat-card-flat {
  padding:10px 12px;
  border-radius:10px;
  border:1px solid rgba(56,189,248,0.08);
  background:linear-gradient(120deg, rgba(8,14,28,0.64), rgba(6,11,24,0.6));
  box-shadow:inset 0 1px 0 rgba(148,163,184,0.04);
}
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
.my-strat-flat-top {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
.my-strat-flat-title {
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
}
.my-strat-flat-meta {
  display:flex;
  align-items:center;
  gap:12px;
  margin-top:6px;
  margin-bottom:9px;
  font-size:10px;
  font-family:'JetBrains Mono',monospace;
  color:var(--text-muted);
}
.my-strat-flat-meta-item { white-space:nowrap; }
.strat-action-btn { padding:4px 10px; border-radius:999px; border:1px solid; font-size:10px;
  font-weight:600; cursor:pointer; transition:all 0.3s; background:transparent; font-family:'Inter',sans-serif; }
.strat-btn-deploy { border-color:rgba(52,211,153,0.3); color:var(--accent-green); }
.strat-btn-deploy:hover { background:rgba(52,211,153,0.15); }
.strat-btn-stop { border-color:rgba(251,191,36,0.3); color:var(--accent-yellow); }
.strat-btn-stop:hover { background:rgba(251,191,36,0.15); }
.strat-btn-edit { border-color:rgba(56,189,248,0.3); color:var(--accent-cyan); }
.strat-btn-edit:hover { background:rgba(56,189,248,0.15); }
.strat-btn-delete { border-color:rgba(244,63,94,0.3); color:var(--accent-red); }
.strat-btn-delete:hover { background:rgba(244,63,94,0.15); }
.my-strat-quickstats {
  padding:12px 14px;
  border-radius:12px;
  background:linear-gradient(120deg, rgba(8,14,28,0.68), rgba(6,11,24,0.62));
  border:1px solid rgba(56,189,248,0.1);
}
.my-strat-quickstats-grid {
  display:grid;
  grid-template-columns:1fr 1fr;
  border:1px solid rgba(56,189,248,0.06);
  border-radius:10px;
  overflow:hidden;
}
.my-strat-quickstats-cell {
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:8px 10px;
  font-size:11px;
  background:rgba(9,15,31,0.46);
  border-right:1px solid rgba(56,189,248,0.04);
  border-bottom:1px solid rgba(56,189,248,0.04);
}
.my-strat-quickstats-cell:nth-child(2n) { border-right:none; }
.my-strat-quickstats-cell:nth-last-child(-n+2) { border-bottom:none; }
@media (min-width: 1280px) {
  .strategy-builder.my-strategy-two-col {
    grid-template-columns:minmax(0,1.35fr) minmax(320px,0.65fr);
    align-items:start;
    gap:16px;
  }
}
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

/* ─── Strategy Builder Modal theme overrides ─── */
.ts-theme-modal {
  --background: 222 45% 7%;
  --foreground: 210 40% 96%;
  --card: 221 39% 10%;
  --card-foreground: 210 40% 96%;
  --popover: 221 39% 10%;
  --popover-foreground: 210 40% 96%;
  --primary: 199 89% 60%;
  --primary-foreground: 222 47% 11%;
  --secondary: 221 28% 16%;
  --secondary-foreground: 210 40% 96%;
  --muted: 221 30% 15%;
  --muted-foreground: 215 20% 68%;
  --accent: 221 31% 17%;
  --accent-foreground: 210 40% 96%;
  --border: 199 45% 28%;
  --input: 221 28% 16%;
  --ring: 199 62% 46%;
  background: linear-gradient(180deg, rgba(8, 12, 22, 0.98), rgba(5, 9, 18, 0.98)) !important;
  border-color: rgba(56, 189, 248, 0.22) !important;
  color: var(--text-primary) !important;
}
.ts-theme-modal [class*="text-muted-foreground"] { color: var(--text-secondary) !important; }
.ts-theme-modal [class*="bg-muted"] { background: rgba(15, 23, 42, 0.55) !important; }
.ts-theme-modal [class*="border-border"] { border-color: rgba(56, 189, 248, 0.18) !important; }
.ts-theme-modal [data-slot="input"],
.ts-theme-modal [data-slot="textarea"],
.ts-theme-modal [data-slot="select-trigger"] {
  background: rgba(15, 23, 42, 0.7) !important;
  border-color: rgba(56, 189, 248, 0.18) !important;
  color: var(--text-primary) !important;
}
.ts-theme-modal [data-slot="input"]:focus-visible,
.ts-theme-modal [data-slot="textarea"]:focus-visible,
.ts-theme-modal [data-slot="select-trigger"]:focus-visible {
  outline: none !important;
  border-color: rgba(56, 189, 248, 0.36) !important;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2) !important;
}
.ts-theme-modal [data-slot="button"][data-variant="default"] {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(99, 102, 241, 0.18)) !important;
  border-color: rgba(56, 189, 248, 0.35) !important;
  color: var(--accent-cyan) !important;
}
.ts-theme-modal [data-slot="button"][data-variant="outline"] {
  background: rgba(15, 23, 42, 0.45) !important;
  border-color: rgba(56, 189, 248, 0.2) !important;
  color: var(--text-secondary) !important;
}

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
  .card{padding:16px}
  .card-header{flex-wrap:wrap;gap:10px}
  .timeline-switch{width:100%;justify-content:flex-start;flex-wrap:wrap}
  .strategy-table{display:block;overflow-x:auto}
  .strategy-table thead,.strategy-table tbody,.strategy-table tr{white-space:nowrap}
  .log-entry{flex-wrap:wrap;gap:4px 10px}
  .log-time{min-width:unset}
}
`;

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
    userName = null,
    currencyMode = "INR",
    setCurrencyMode = null,
    sessionAccessToken = null,
    onCancelPendingForStrategy = null,
    strategyDevRequests = null,
    onSubmitStrategyDevRequest = null,
    onPauseAllStrategies = null,
    onEmergencyKill = null,
  } = props;

  const [time, setTime] = useState("");
  const [uptimeSec, setUptimeSec] = useState(0);
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [myStrategies, setMyStrategies] = useState([]);
  const [liveMonitorPage, setLiveMonitorPage] = useState(1);
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

  const [equityTimeline, setEquityTimeline] = useState("1M");
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
  const [goLiveRememberSymbol, setGoLiveRememberSymbol] = useState(false);
  const [goLiveBusy, setGoLiveBusy] = useState(false);
  const [goLiveSearchResults, setGoLiveSearchResults] = useState([]);
  const [goLiveSearchOpen, setGoLiveSearchOpen] = useState(false);
  const [goLiveSearchBusy, setGoLiveSearchBusy] = useState(false);
  const [goLiveSearchError, setGoLiveSearchError] = useState("");
  const [liveViewTarget, setLiveViewTarget] = useState(null);
  /** Live option LTP while Live View modal open (deployment contract). */
  const [liveOptionQuote, setLiveOptionQuote] = useState({ ltp: null, fetchedAt: null });
  const [liveViewQuoteAgeTick, setLiveViewQuoteAgeTick] = useState(0);
  const [cancelPendingBusyId, setCancelPendingBusyId] = useState(null);
  const [liveModalStopBusy, setLiveModalStopBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [stratStep, setStratStep] = useState(0);
  const [optionsStep, setOptionsStep] = useState(0);
  const [showExactAlgoBuilder, setShowExactAlgoBuilder] = useState(false);
  const [editAlgoTarget, setEditAlgoTarget] = useState(null); // strategy being edited
  const [showExactOptionsBuilder, setShowExactOptionsBuilder] = useState(false);
  const [editOptionsTarget, setEditOptionsTarget] = useState(null);
  const [activateOptionsTarget, setActivateOptionsTarget] = useState(null);
  const [killActive, setKillActive] = useState(false);
  const [killBusy, setKillBusy] = useState(false);
  const [pauseAllBusy, setPauseAllBusy] = useState(false);
  const [showDevRequest, setShowDevRequest] = useState(false);
  const [devSubmitBusy, setDevSubmitBusy] = useState(false);
  const [strategyCreateMenuOpen, setStrategyCreateMenuOpen] = useState(false);

  const [devForm, setDevForm] = useState({
    strategyName: "",
    description: "",
    market: "crypto",
    urgency: "normal",
    email: "",
    pdfName: "",
  });
  const devList = Array.isArray(strategyDevRequests) ? strategyDevRequests : [];
  const fileInputRef = useRef(null);
  const devPdfFileRef = useRef(null);
  const goLiveSearchTimerRef = useRef(null);
  const goLiveSearchBoxRef = useRef(null);

  const allowedBrokerExchanges = useMemo(
    () => brokerAllowedExchanges(summary?.broker),
    [summary?.broker],
  );

  const chartSeriesValues = useMemo(() => {
    const raw = summary?.equity_curve;
    const now = Date.now();
    const windowsMs =
      equityTimeline === "1D"
        ? 86400000
        : equityTimeline === "1W"
          ? 7 * 86400000
          : equityTimeline === "1M"
            ? 30 * 86400000
            : Number.MAX_SAFE_INTEGER;
    let pts =
      Array.isArray(raw) && raw.length > 0
        ? raw.filter(
            (p) =>
              p &&
              typeof p.t === "number" &&
              typeof p.v === "number" &&
              now - p.t <= windowsMs,
          )
        : [];
    if (pts.length < 2) {
      const end = Number(summary?.cumulative_pnl);
      const endV = Number.isFinite(end) ? end : 0;
      const startT =
        windowsMs === Number.MAX_SAFE_INTEGER
          ? now - 90 * 86400000
          : now - windowsMs;
      pts = [
        { t: startT, v: 0 },
        { t: now, v: endV },
      ];
    }
    return pts.map((p) => p.v);
  }, [summary?.equity_curve, summary?.cumulative_pnl, equityTimeline]);

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
      return next.slice(-500);
    });
  }, []);

  // sessionStorage (tab-scoped) — not localStorage, to avoid long-lived data readable under XSS
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("algo-only-system-logs-v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setLogs(parsed.slice(-500));
    } catch {
      // ignore storage parse issues
    }
  }, []);

  useEffect(() => {
    if (!useChartmate || !strategyCards) return;
    setMyStrategies(strategyCards);
  }, [useChartmate, strategyCards]);

  useEffect(() => {
    if (!useChartmate || !orderFeed) return;
    setOrders(orderFeed.length ? orderFeed : []);
  }, [useChartmate, orderFeed]);

  // Boost options-strategy-entry whenever the dashboard has running options strategies,
  // independent of the Live View modal (cron still runs; this helps lagging snapshots).
  useEffect(() => {
    const hasActiveOptions = myStrategies.some((s) => {
      const isOpts =
        Boolean(s?.is_options) ||
        String(s?.market_type ?? s?.marketType ?? s?.type ?? "")
          .toLowerCase()
          .includes("option");
      const lc = normalizeLifecycleState(s.lifecycle_state, Boolean(s.deployed));
      return (
        isOpts &&
        (lc === "ACTIVE" || lc === "TRIGGERED" || lc === "WAITING_MARKET_OPEN")
      );
    });
    if (!hasActiveOptions) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        await supabase.functions.invoke("options-strategy-entry", { body: {} });
      } catch {
        /* silent */
      }
    };
    void tick();
    const id = window.setInterval(() => {
      if (!cancelled) void tick();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [myStrategies]);

  // Live option premium (LTP) for deployed contract — BFF `/api/options/quotes` via optionsApi.fetchLtp.
  useEffect(() => {
    const t = liveViewTarget;
    if (!t) {
      setLiveOptionQuote({ ltp: null, fetchedAt: null });
      return;
    }
    const isOptions =
      Boolean(t?.is_options) ||
      String(t?.market_type ?? t?.marketType ?? t?.type ?? "")
        .toLowerCase()
        .includes("option");
    if (!isOptions) return;
    const dep = optionDeploymentInfoFromCard(t);
    const sym = dep.optionSymbol;
    const ex = (dep.exchange || "NFO").trim().toUpperCase() || "NFO";
    if (!sym) {
      setLiveOptionQuote({ ltp: null, fetchedAt: null });
      return undefined;
    }
    let cancelled = false;
    const tick = async () => {
      const ltp = await fetchLtp(sym, ex);
      if (!cancelled) {
        setLiveOptionQuote({ ltp: ltp != null && Number.isFinite(ltp) ? ltp : null, fetchedAt: Date.now() });
      }
    };
    void tick();
    const id = window.setInterval(() => {
      if (!cancelled) void tick();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [liveViewTarget]);

  // Tick every second while Live View open so "Updated Ns ago" refreshes without full rerender storm.
  useEffect(() => {
    if (!liveViewTarget) return undefined;
    const id = window.setInterval(() => setLiveViewQuoteAgeTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveViewTarget]);

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

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "algo-only-system-logs-v1",
        JSON.stringify(logs.slice(-500)),
      );
    } catch {
      // ignore storage write issues
    }
  }, [logs]);

  // Development request modal behaviors
  useEffect(() => {
    if (!showDevRequest) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowDevRequest(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showDevRequest]);

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
    if (chartSeriesValues.length < 2) return;
    const min = Math.min(...chartSeriesValues) * 0.998;
    const max = Math.max(...chartSeriesValues) * 1.002;
    const range = max - min;
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
    const toX = (i) => pad.left + (i / (chartSeriesValues.length - 1)) * cw;
    const toY = (v) => pad.top + ch - ((v - min) / range) * ch;

    ctx.beginPath();
    ctx.moveTo(toX(0), h);
    chartSeriesValues.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(chartSeriesValues.length - 1), h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    chartSeriesValues.forEach((v, i) => {
      if (i === 0) ctx.moveTo(toX(i), toY(v));
      else ctx.lineTo(toX(i), toY(v));
    });
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    chartSeriesValues.forEach((v, i) => {
      if (i === 0) ctx.moveTo(toX(i), toY(v));
      else ctx.lineTo(toX(i), toY(v));
    });
    ctx.strokeStyle = "rgba(56,189,248,0.3)";
    ctx.lineWidth = 6;
    ctx.stroke();

    const lx = toX(chartSeriesValues.length - 1),
      ly = toY(chartSeriesValues[chartSeriesValues.length - 1]);
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
      ctx.fillText("₹" + (val / 1000).toFixed(0) + "k", w - 4, y + 4);
    }
  }, [chartSeriesValues]);

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
      : (summary?.recent_orders_count ?? orders.length ?? 0);
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

  const runGoLiveSymbolSearch = useCallback(
    async (rawQuery) => {
      const q = String(rawQuery || "").trim();
      if (!q || q.length < 1) {
        setGoLiveSearchResults([]);
        setGoLiveSearchOpen(false);
        setGoLiveSearchError("");
        return;
      }
      setGoLiveSearchBusy(true);
      setGoLiveSearchError("");
      try {
        const res = await supabase.functions.invoke("search-symbols", {
          body: { q },
        });
        const rows = Array.isArray(res.data) ? res.data : [];
        const filtered = rows
          .map((item) => ({
            ...item,
            _exchange: inferExchangeFromSearchRow(item),
          }))
          .filter(
            (item) =>
              Boolean(item._exchange) &&
              allowedBrokerExchanges.includes(item._exchange) &&
              [".NS", ".BO"].some((suf) =>
                String(item.full_symbol || "")
                  .toUpperCase()
                  .endsWith(suf),
              ),
          )
          .slice(0, 16);
        setGoLiveSearchResults(filtered);
        setGoLiveSearchOpen(filtered.length > 0);
      } catch {
        setGoLiveSearchError("Symbol search unavailable right now.");
        setGoLiveSearchResults([]);
        setGoLiveSearchOpen(false);
      } finally {
        setGoLiveSearchBusy(false);
      }
    },
    [allowedBrokerExchanges],
  );

  useEffect(() => {
    if (!goLiveTarget) return;
    const q = String(goLiveForm.symbol || "").trim();
    if (goLiveSearchTimerRef.current) {
      window.clearTimeout(goLiveSearchTimerRef.current);
    }
    if (q.length < 1) {
      setGoLiveSearchResults([]);
      setGoLiveSearchOpen(false);
      setGoLiveSearchError("");
      return;
    }
    goLiveSearchTimerRef.current = window.setTimeout(() => {
      void runGoLiveSymbolSearch(q);
    }, 300);
    return () => {
      if (goLiveSearchTimerRef.current) {
        window.clearTimeout(goLiveSearchTimerRef.current);
      }
    };
  }, [goLiveForm.symbol, goLiveTarget, runGoLiveSymbolSearch]);

  useEffect(() => {
    if (!goLiveTarget) return undefined;
    const onDown = (ev) => {
      if (!goLiveSearchBoxRef.current) return;
      if (!goLiveSearchBoxRef.current.contains(ev.target)) {
        setGoLiveSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [goLiveTarget]);

  useEffect(() => {
    if (goLiveTarget) return;
    setGoLiveSearchResults([]);
    setGoLiveSearchOpen(false);
    setGoLiveSearchBusy(false);
    setGoLiveSearchError("");
    setGoLiveRememberSymbol(false);
  }, [goLiveTarget]);
  // Only show real numbers when broker session is live — avoid showing paper/stale data as real values.
  const fallbackTodayPnl =
    Array.isArray(orders) && orders.length
      ? orders.reduce((acc, o) => acc + Number(o?.pnl || 0), 0)
      : 0;
  const displayPortfolio = sessLive
    ? liveCashAvailable != null
      ? liveCashAvailable
      : typeof summary?.portfolio_value === "number"
        ? summary.portfolio_value
        : 0
    : 0;
  const displayCumulative =
    sessLive && typeof summary?.cumulative_pnl === "number"
      ? summary.cumulative_pnl
      : 0;
  const displayToday = sessLive
    ? typeof summary?.today_pnl === "number"
      ? summary.today_pnl
      : fallbackTodayPnl
    : 0;
  const heroPortfolioValue = formatUnsignedDisplay(displayPortfolio, "INR");
  const heroTodayPnl = formatSignedDisplay(displayToday, "INR");
  const heroTodayIsPositive = displayToday >= 0;
  const heroMarketOpenRaw = Number(
    summary?.market_open_count ??
      summary?.open_markets_count ??
      summary?.markets_open ??
      summary?.market_status?.open,
  );
  const heroMarketTotalRaw = Number(
    summary?.market_total_count ??
      summary?.total_markets_count ??
      summary?.markets_total ??
      summary?.market_status?.total,
  );
  const heroOpenMarkets = Number.isFinite(heroMarketOpenRaw)
    ? Math.max(0, Math.round(heroMarketOpenRaw))
    : 0;
  const heroTotalMarkets = Number.isFinite(heroMarketTotalRaw)
    ? Math.max(1, Math.round(heroMarketTotalRaw))
    : 0;
  const heroBrokerLabel = String(summary?.broker || "Zerodha").trim();
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
      deployed: false,
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
    const st = normalizeLifecycleState(s.status, Boolean(s.deployed));
    return (
      st === "ACTIVE" || st === "WAITING_MARKET_OPEN" || st === "TRIGGERED"
    );
  }).length;
  const activeStrategiesRows = strategiesData.filter((s) => {
    const st = normalizeLifecycleState(s.status, Boolean(s.deployed));
    return (
      st === "ACTIVE" || st === "WAITING_MARKET_OPEN" || st === "TRIGGERED"
    );
  });
  const strategyTagClass = (rawLifecycle, deployed) => {
    const st = normalizeLifecycleState(rawLifecycle, Boolean(deployed));
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
  const liveMonitorPages = Math.max(
    1,
    Math.ceil(liveMonitorStrategies.length / 10),
  );
  const liveMonitorPageSafe = Math.min(
    liveMonitorPages,
    Math.max(1, liveMonitorPage),
  );
  const liveMonitorSlice = liveMonitorStrategies.slice(
    (liveMonitorPageSafe - 1) * 10,
    liveMonitorPageSafe * 10,
  );

  useEffect(() => {
    if (liveMonitorPage > liveMonitorPages) {
      setLiveMonitorPage(liveMonitorPages);
    }
  }, [liveMonitorPage, liveMonitorPages]);

  const strategyKindTag = (strategy) => {
    const mt = String(
      strategy?.market_type ?? strategy?.marketType ?? strategy?.type ?? "",
    )
      .trim()
      .toLowerCase();
    return mt.includes("option") ? "options" : "equity";
  };

  const handleKillSwitch = () => {
    if (killBusy) return;
    if (killActive) {
      setKillActive(false);
      addLog(
        "info",
        "Kill switch cleared (UI). Strategies stay paused until you activate them again.",
      );
      return;
    }
    if (
      !window.confirm(
        "Activate kill switch? This pauses every strategy and sends cancel-all to your broker for open orders.",
      )
    ) {
      return;
    }
    if (!useChartmate || !onEmergencyKill) {
      toast.error("Connect to ChartMate to use the kill switch.");
      return;
    }
    void (async () => {
      setKillBusy(true);
      try {
        const err = await onEmergencyKill();
        if (err) {
          toast.error("Kill switch could not complete", { description: err });
          addLog("error", err);
          return;
        }
        setKillActive(true);
        setMyStrategies((prev) =>
          prev.map((s) => ({
            ...s,
            deployed: false,
            lifecycle_state: "PAUSED",
          })),
        );
        setLiveViewTarget(null);
        addLog(
          "error",
          "KILL SWITCH — All strategies paused; broker cancel-all requested.",
        );
        toast.success("Kill switch executed", {
          description: "Strategies paused and open orders cancellation sent.",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unexpected error";
        toast.error("Kill switch failed", { description: msg });
        addLog("error", msg);
      } finally {
        setKillBusy(false);
      }
    })();
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
                  ? "1/1 Broker Connected"
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
              <div className={`status-dot ${useChartmate ? "live" : "live"}`} />
              {String(summary?.broker || "Broker")
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())}{" "}
              {summary?.broker_credentials_configured ? "Configured" : "Not configured"}
              {/* {useChartmate ? "ChartMate data" : "WebSocket Active"} */}
            </div>
            {positionsStreamStale && (
              <div
                className="status-item"
                style={{ color: "var(--accent-orange)", fontSize: 11 }}
              >
                Options stream: stale
              </div>
            )}
            {/* <div className="status-item">
              <div
                className={`status-dot ${(liveTradesCount ?? orders.length) > 0 ? "live" : "warn"}`}
              />
              {useChartmate
                ? `Trades ${liveTradesCount ?? 0} · Open ${liveOpenPositionsCount ?? 0}`
                : "Live feed"}
            </div> */}
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
                {sessLive
                  ? `Reconnect ${String(summary?.broker || "broker")
                      .replace(/_/g, " ")
                      .toLowerCase()}`
                  : `Connect ${String(summary?.broker || "broker")
                      .replace(/_/g, " ")
                      .toLowerCase()}`}
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
          <div
            style={{
              background:
                "linear-gradient(135deg,rgba(56,189,248,0.08),rgba(99,102,241,0.08))",
              border: "1px solid rgba(56,189,248,0.15)",
              borderRadius: 16,
              padding: "20px 28px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              transition: "all 0.5s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  fontSize: 40,
                  animation: "pulse 2s ease-in-out infinite",
                }}
              >
                <FaRobot />
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Orbitron',sans-serif",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--accent-cyan)",
                    letterSpacing: 2,
                    transition: "color 0.5s",
                  }}
                >
                  {userName ? `${userName.toUpperCase()}'S TRADING ENGINE` : "TRADING ENGINE"}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: killActive
                      ? "var(--accent-orange)"
                      : "var(--accent-green)",
                    fontFamily: "'JetBrains Mono',monospace",
                    marginTop: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "color 0.5s",
                  }}
                >
                  <span
                    className={`status-dot ${killActive ? "warn" : "live"}`}
                  />
                  {killActive
                    ? "Emergency Stop Active"
                    : sessLive
                      ? "Engine Running"
                      : "Engine Idle (Reconnect broker)"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 2,
                  }}
                >
                  Uptime
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {formatUptime(uptimeSec)}
                </div>
              </div>
              <button
                type="button"
                className={`kill-switch ${killActive ? "active" : ""}`}
                onClick={handleKillSwitch}
                disabled={killBusy || pauseAllBusy}
                style={{
                  width: 64,
                  height: 64,
                  fontSize: 10,
                  transition: "all 0.4s",
                }}
              >
                <span className="kill-icon" style={{ fontSize: 22 }}>
                  {killActive ? <FaBan /> : <FaTriangleExclamation />}
                </span>
                <span className="kill-text">
                  {killBusy ? "WORKING…" : killActive ? "LOCKED" : "STOP"}
                </span>
              </button>
            </div>
          </div>
          <div
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              background: "rgba(251,191,36,0.04)",
              border: "1px solid rgba(251,191,36,0.1)",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 10,
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontSize: 14 }}>
              <FaScaleBalanced />
            </span>
            <span>
              <strong style={{ color: "var(--accent-yellow)" }}>
                Platform Disclosure:
              </strong>{" "}
              TradingSmart.AI is a technology platform that executes strategies
              created by traders and registered financial advisors. We are not a
              financial advisor, broker, or dealer. All strategies carry risk —
              trade responsibly.
            </span>
          </div>
          {/* HERO */}
          <div className="hero">
            <div className="hero-card">
              <div className="hero-top-row">
                <div className="hero-label">Total Portfolio (INR IST)</div>
                <span className="hero-currency-pill">INR (₹)</span>
              </div>
              <div className="hero-value neutral">
                {heroPortfolioValue}
              </div>
              <div
                className={`hero-change ${pctMtm != null && pctMtm < 0 ? "down" : "up"}`}
              >
                {pctMtm != null ? (
                  <>
                    ▲ Today's Algo P&L {pctMtm >= 0 ? "+" : ""}
                    {pctMtm.toFixed(2)}% vs exposure
                  </>
                ) : (
                  <>▲ Computed from connected account balance</>
                )}
              </div>
            </div>
            <div className="hero-card">
              <div className="hero-top-row">
                <div className="hero-label">Today's Robot P&L</div>
              </div>
              <div
                className={`hero-value ${heroTodayIsPositive ? "positive" : "negative"}`}
              >
                {heroTodayPnl}
              </div>
              <div className={`hero-change ${heroTodayIsPositive ? "up" : "down"}`}>
                ▲ Sum of all active strategy profits
              </div>
              <div className="hero-broker-strip">
                <span className="strong capitalize text-orange-400">{heroBrokerLabel}</span>{" "}
                <span style={{ color: heroTodayIsPositive ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {heroTodayPnl}
                </span>
              </div>
            </div>
            <div className="hero-card">
              <div className="hero-top-row">
                <div className="hero-label">Market Status</div>
              </div>
              <div className="hero-value positive" style={{ fontSize: 34 }}>
                {heroOpenMarkets}/{heroTotalMarkets} markets open |{" "}
                {sessLive ? Number(liveTradesCount ?? 0) : 0} trades today
              </div>
              <div className="hero-meta-line">
                ▲ Robot auto-trades only on open markets
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 mb-[24px]">
            {/* LIVE MONITORING */}
            <div
              className="card"
              style={{
                padding: 0,
                overflow: "hidden",
                background:
                  "linear-gradient(120deg, rgba(5,10,22,0.95), rgba(4,15,34,0.92) 52%, rgba(9,14,33,0.95))",
                border: "1px solid rgba(56,189,248,0.16)",
                boxShadow: "0 0 0 1px rgba(56,189,248,0.08) inset",
              }}
            >
              <div style={{ padding: "18px 18px 12px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      minWidth: 0,
                    }}
                  >
                    {/* <span
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(250,204,21,0.12)",
                        border: "1px solid rgba(250,204,21,0.25)",
                        fontSize: 16,
                      }}
                    >
                      <FaFlag />
                    </span> */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* <span
                        style={{
                          fontSize: 16,
                          color: "rgba(148,163,184,0.45)",
                          lineHeight: 1,
                        }}
                      >
                        |
                      </span> */}
                      <div
                        style={{
                          fontSize: 14,
                          textTransform: "uppercase",
                          letterSpacing: 1.5,
                          fontWeight: 700,
                          color: "var(--text-secondary)",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {String(summary?.broker || "ZERODHA")} (INDIA - NSE/BSE)
                      </div>
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        borderRadius: 999,
                        padding: "6px 12px",
                        border: "1px solid rgba(52,211,153,0.35)",
                        background: "rgba(16,185,129,0.12)",
                        color: "var(--accent-green)",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontWeight: 700,
                      }}
                    >
                      ● {sessLive ? "LIVE" : "OFFLINE"}
                    </span>
                    <button
                      type="button"
                      className="action-btn"
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        borderRadius: 10,
                        borderColor: "rgba(244,63,94,0.3)",
                        color: "var(--accent-red)",
                        background: "rgba(244,63,94,0.09)",
                      }}
                      onClick={handleKillSwitch}
                      disabled={killBusy || pauseAllBusy}
                    >
                      {killBusy
                        ? "Working..."
                        : killActive
                          ? "Kill Active"
                          : "Disconnect"}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 10,
                    border: "1px solid rgba(56,189,248,0.12)",
                    background: "rgba(6,13,28,0.7)",
                    padding: "8px 12px",
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {time || "00:00:00"} IST
                  </span>
                  <span
                    style={{
                      color: sessLive
                        ? "var(--accent-green)"
                        : "var(--accent-orange)",
                      justifySelf: "center",
                      fontWeight: 700,
                      letterSpacing: 0.6,
                    }}
                  >
                    {sessLive ? "MARKET OPEN" : "BROKER OFFLINE"}
                  </span>
                  <span
                    style={{
                      justifySelf: "end",
                      color: "var(--text-secondary)",
                      fontSize: 12,
                    }}
                  >
                    {liveMonitorStrategies.length}/{myStrategies.length || 0}{" "}
                    strategies
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      borderRadius: 10,
                      padding: "9px 12px",
                      border: "1px solid rgba(56,189,248,0.12)",
                      background: "rgba(7,20,43,0.55)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 1.8,
                        color: "var(--text-muted)",
                      }}
                    >
                      Balance
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono',monospace",
                        color: "var(--text-primary)",
                      }}
                    >
                      {formatUnsignedDisplay(displayPortfolio, currencyMode)}
                    </div>
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      padding: "9px 12px",
                      border: "1px solid rgba(56,189,248,0.12)",
                      background: "rgba(7,20,43,0.55)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 1.8,
                        color: "var(--text-muted)",
                      }}
                    >
                      Today P&L
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono',monospace",
                        color:
                          displayToday >= 0
                            ? "var(--accent-green)"
                            : "var(--accent-red)",
                      }}
                    >
                      {formatSignedDisplay(displayToday, currencyMode)}
                    </div>
                  </div>
                  <div
                    style={{
                      borderRadius: 10,
                      padding: "9px 12px",
                      border: "1px solid rgba(56,189,248,0.12)",
                      background: "rgba(7,20,43,0.55)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 1.8,
                        color: "var(--text-muted)",
                      }}
                    >
                      Trades
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono',monospace",
                        color: "var(--accent-cyan)",
                      }}
                    >
                      {sessLive ? String(liveTradesCount ?? 0) : "--"}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      letterSpacing: 2.8,
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    Assigned Strategies
                  </div>
                </div>

                {liveMonitorStrategies.length === 0 ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: "var(--text-muted)",
                      lineHeight: 1.6,
                      border: "1px dashed rgba(56,189,248,0.18)",
                      borderRadius: 12,
                      padding: "12px 14px",
                      background: "rgba(10,14,23,0.45)",
                    }}
                  >
                    No active strategy monitors yet. Activate a strategy to list
                    it here, then use Live view for charts and conditions.
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    {liveMonitorSlice.map((s) => {
                      const lcState = normalizeLifecycleState(
                        s.lifecycle_state,
                        Boolean(s.deployed),
                      );
                      const lifecycleText = lifecycleLabel(lcState);
                      const statusPill =
                        lcState === "ACTIVE" || lcState === "TRIGGERED"
                          ? "LIVE"
                          : lifecycleText.toUpperCase();
                      const statusColor =
                        lcState === "ACTIVE" || lcState === "TRIGGERED"
                          ? "var(--accent-green)"
                          : lcState === "FAILED" || lcState === "CANCELLED"
                            ? "var(--accent-red)"
                            : "var(--accent-yellow)";
                      const monitorPerf = strategiesData.find(
                        (row) =>
                          String(row?.name || "")
                            .trim()
                            .toLowerCase() ===
                          String(s?.name || "")
                            .trim()
                            .toLowerCase(),
                      );
                      const { symbol: symHint } =
                        chartRoutingFromStrategyCard(s);
                      return (
                        <div
                          key={`live-${s.id}`}
                          style={{
                            border: "1px solid rgba(56,189,248,0.13)",
                            borderRadius: 12,
                            padding: "12px 14px",
                            background: "rgba(5,12,27,0.72)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              minWidth: 0,
                              flex: "1 1 420px",
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
                              <span style={{ fontSize: 14, fontWeight: 700 }}>
                                {s.name}
                              </span>
                              <span className="my-strat-card-type type-momentum">
                                {strategyKindTag(s).toUpperCase()}
                              </span>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: 11,
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  border: "1px solid rgba(56,189,248,0.14)",
                                  color: "var(--text-secondary)",
                                  background: "rgba(15,23,42,0.55)",
                                }}
                              >
                                {String(
                                  s.pairs || symHint || "—",
                                ).toUpperCase()}
                              </span>
                              {(() => {
                                const isOptions =
                                  Boolean(s?.is_options) ||
                                  strategyKindTag(s) === "options";
                                if (!isOptions) return null;
                                const dep = optionDeploymentInfoFromCard(s);
                                const detail = [dep.optionSymbol, dep.expiry]
                                  .filter(Boolean)
                                  .join(" • ");
                                if (!detail) return null;
                                return (
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono',monospace",
                                      fontSize: 10,
                                      padding: "2px 8px",
                                      borderRadius: 6,
                                      border: "1px solid rgba(56,189,248,0.14)",
                                      color: "var(--accent-cyan)",
                                      background: "rgba(8,16,34,0.65)",
                                    }}
                                    title="Selected broker option symbol and expiry"
                                  >
                                    {detail}
                                  </span>
                                );
                              })()}
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: 11,
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: "rgba(16,185,129,0.1)",
                                  color: sessLive
                                    ? monitorPerf?.pnlColor ||
                                      (displayToday >= 0
                                        ? "var(--accent-green)"
                                        : "var(--accent-red)")
                                    : "var(--text-muted)",
                                }}
                              >
                                {sessLive
                                  ? monitorPerf?.pnl ||
                                    formatSignedDisplay(
                                      displayToday,
                                      currencyMode,
                                    )
                                  : "--"}
                              </span>
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: 11,
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: "rgba(15,23,42,0.55)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {sessLive
                                  ? `${Number(monitorPerf?.trades || 0).toLocaleString()} trades`
                                  : "-- trades"}
                              </span>
                              <span
                                style={{
                                  fontFamily: "'JetBrains Mono',monospace",
                                  fontSize: 11,
                                  padding: "2px 8px",
                                  borderRadius: 6,
                                  background: "rgba(56,189,248,0.1)",
                                  color: sessLive
                                    ? monitorPerf?.winColor ||
                                      "var(--accent-cyan)"
                                    : "var(--text-muted)",
                                }}
                              >
                                {sessLive
                                  ? `${String(monitorPerf?.win || "0%")} win`
                                  : "--"}
                              </span>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                borderRadius: 6,
                                padding: "3px 8px",
                                border: `1px solid ${statusColor}33`,
                                background:
                                  statusPill === "LIVE"
                                    ? "rgba(16,185,129,0.12)"
                                    : "rgba(251,191,36,0.1)",
                                color: statusColor,
                                fontWeight: 700,
                                letterSpacing: 1,
                                fontFamily: "'JetBrains Mono',monospace",
                              }}
                            >
                              {statusPill}
                            </span>
                            <button
                              type="button"
                              className="strat-action-btn strat-btn-deploy"
                              title={
                                !sessLive
                                  ? "Connect broker for live chart quotes"
                                  : "Open chart + conditions"
                              }
                              disabled={!sessLive}
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
                              Live View
                            </button>
                            <button
                              type="button"
                              className="strat-action-btn strat-btn-edit"
                              title="Pause strategy scan"
                              onClick={async () => {
                                const isOptions =
                                  Boolean(s?.is_options) ||
                                  strategyKindTag(s) === "options";
                                const err = isOptions
                                  ? await chartmateActions?.onPauseOptionsStrategy?.(
                                      s.id,
                                    )
                                  : await chartmateActions?.onToggleDeploy?.(
                                      s.id,
                                      false,
                                    );
                                if (err) {
                                  toast.error("Could not pause strategy", {
                                    description: String(err),
                                  });
                                  return;
                                }
                                addLog("warn", `Strategy "${s.name}" paused`);
                                chartmateActions.onRefresh?.();
                              }}
                            >
                              Pause
                            </button>
                            <button
                              type="button"
                              className="strat-action-btn strat-btn-delete"
                              title="Stop strategy and cancel queued entries"
                              onClick={async () => {
                                const isOptions =
                                  Boolean(s?.is_options) ||
                                  strategyKindTag(s) === "options";
                                const err = isOptions
                                  ? await chartmateActions?.onPauseOptionsStrategy?.(
                                      s.id,
                                    )
                                  : await chartmateActions?.onToggleDeploy?.(
                                      s.id,
                                      false,
                                    );
                                if (err) {
                                  toast.error("Could not stop strategy", {
                                    description: String(err),
                                  });
                                  return;
                                }
                                if (
                                  !isOptions &&
                                  typeof onCancelPendingForStrategy ===
                                    "function"
                                ) {
                                  await onCancelPendingForStrategy(s.id);
                                }
                                addLog("warn", `Strategy "${s.name}" stopped`);
                                chartmateActions.onRefresh?.();
                              }}
                            >
                              Stop
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {liveMonitorPages > 1 ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 8,
                          marginTop: 4,
                        }}
                      >
                        <button
                          type="button"
                          className="action-btn btn-primary"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                          disabled={liveMonitorPageSafe <= 1}
                          onClick={() =>
                            setLiveMonitorPage((p) => Math.max(1, p - 1))
                          }
                        >
                          Prev
                        </button>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            alignSelf: "center",
                          }}
                        >
                          Page {liveMonitorPageSafe} / {liveMonitorPages}
                        </span>
                        <button
                          type="button"
                          className="action-btn btn-primary"
                          style={{ padding: "4px 10px", fontSize: 11 }}
                          disabled={liveMonitorPageSafe >= liveMonitorPages}
                          onClick={() =>
                            setLiveMonitorPage((p) =>
                              Math.min(liveMonitorPages, p + 1),
                            )
                          }
                        >
                          Next
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

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
                    <FaHourglassHalf />
                  </span>
                  Live Order Feed
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
            <div className="grid lg:grid-cols-2 gap-7">
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
                      <FaRobot />
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
                        <span className="metric-label">
                          Strategies deployed
                        </span>
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
                </div>
              </div>

              {/* Equity curve */}
              <div
                className="card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                }}
              >
                <div className="card-header">
                  <div className="card-title">
                    <span
                      className="card-title-icon"
                      style={{
                        background: "rgba(99,102,241,0.1)",
                        color: "var(--accent-blue)",
                      }}
                    >
                      <FaChartLine />
                    </span>
                    Equity Curve
                  </div>
                  <div className="timeline-switch">
                    {["1D", "1W", "1M", "ALL"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`timeline-btn${equityTimeline === r ? " active" : ""}`}
                        onClick={() => setEquityTimeline(r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    padding: "0 4px 12px",
                  }}
                >
                  Cumulative live P&L (closed trades in scope; aligns with hero
                  totals when connected). Range filters the same series; data
                  comes from your ChartMate trade history when the broker
                  session is live.
                </div>
                <div
                  className="chart-area"
                  style={{
                    flex: 1,
                    minHeight: 260,
                  }}
                >
                  <canvas ref={canvasRef} className="chart-canvas" />
                </div>
              </div>
            </div>

            {/* STRATEGIES */}
            {false ? (
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
                      <FaBrain />
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
                    {activeStrategiesRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ color: "var(--text-muted)" }}>
                          No active strategies right now.
                        </td>
                      </tr>
                    ) : (
                      activeStrategiesRows.map((s, idx) => (
                        <tr key={`${s.name}-${idx}`}>
                          <td>
                            <span className="strategy-name">{s.name}</span>{" "}
                            <span className="my-strat-card-type type-momentum">
                              {strategyKindTag(s).toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`strategy-tag ${strategyTagClass(s.status, s.deployed)}`}
                              title={
                                s.lifecycle_reason || s.lifecycle_updated_at
                                  ? `${s.lifecycle_reason ?? "No reason"}${s.lifecycle_updated_at ? `\nUpdated: ${s.lifecycle_updated_at}` : ""}`
                                  : undefined
                              }
                            >
                              {lifecycleLabel(
                                normalizeLifecycleState(
                                  s.status,
                                  Boolean(s.deployed),
                                ),
                              )}
                            </span>
                          </td>
                          <td>{sessLive ? s.trades.toLocaleString() : "—"}</td>
                          <td
                            style={{
                              color: sessLive
                                ? s.pnlColor
                                : "var(--text-muted)",
                            }}
                          >
                            {sessLive ? s.pnl : "—"}
                          </td>
                          <td
                            style={{
                              color: sessLive
                                ? s.winColor
                                : "var(--text-muted)",
                            }}
                          >
                            {sessLive ? s.win : "—"}
                          </td>
                        </tr>
                      ))
                    )}
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
                  <code style={{ fontSize: 10 }}>
                    active_trades.strategy_id
                  </code>{" "}
                  equals this row’s strategy id. ChartMate “Algo Guide” presets
                  often have <strong>no</strong>{" "}
                  <code style={{ fontSize: 10 }}>strategy_id</code> on
                  historical rows — those stay 0 here until live runs attach the
                  id (same as attributing orders in the main app).
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
            ) : null}

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
                    <FaBolt />
                  </span>
                  Strategies Status
                </div>
                <span className="card-badge badge-green">Real-time</span>
              </div>
              <div className="order-feed">
                {myStrategies.length === 0 ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-muted)",
                      padding: "12px 8px",
                    }}
                  >
                    No strategies available yet. Create a strategy to track its
                    status here.
                  </div>
                ) : null}
                {myStrategies.map((s, idx) => {
                  const lifecycle = normalizeLifecycleState(
                    s.lifecycle_state ?? s.status,
                    Boolean(s.deployed),
                  );
                  const isActive =
                    lifecycle === "ACTIVE" ||
                    lifecycle === "WAITING_MARKET_OPEN" ||
                    lifecycle === "TRIGGERED";
                  return (
                    <div
                      className="order-item"
                      key={s.id ?? `${s.name}-${idx}`}
                    >
                      {/* <div
                        className={`order-icon ${isActive ? "buy" : "sell"}`}
                      >
                        {isActive ? "\u25B2" : "\u25BC"}
                      </div> */}
                      <div>
                        <div className="order-pair">
                          {s.name || "Unnamed Strategy"}
                        </div>
                        <div className="order-meta">
                          {strategyKindTag(s).toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div
                          className="order-pnl"
                          style={{
                            color: isActive
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                          }}
                        >
                          {isActive ? "Active" : "Not Active"}
                        </div>
                        <div className="order-time">
                          {isActive ? "Running" : "Inactive"}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                    <FaBullseye />
                  </span>
                  My Strategies
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    position: "relative",
                  }}
                >
                  <span className="card-badge badge-blue">
                    {myStrategies.length} Saved
                  </span>
                  <button
                    type="button"
                    className="action-btn btn-primary"
                    style={{ padding: "6px 14px", fontSize: 11 }}
                    onClick={() => setStrategyCreateMenuOpen((prev) => !prev)}
                  >
                    + Create Strategy
                  </button>
                  {strategyCreateMenuOpen ? (
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        minWidth: 210,
                        borderRadius: 10,
                        border: "1px solid var(--border-color)",
                        background: "rgba(6,8,13,0.96)",
                        boxShadow: "0 18px 36px rgba(0,0,0,0.45)",
                        padding: 8,
                        zIndex: 30,
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        className="action-btn btn-primary"
                        style={{
                          justifyContent: "flex-start",
                          padding: "8px 10px",
                          fontSize: 11,
                          borderRadius: 8,
                        }}
                        onClick={() => {
                          setStratStep(0);
                          setStrategyCreateMenuOpen(false);
                          setShowExactAlgoBuilder(true);
                        }}
                      >
                        New Algo Strategy
                      </button>
                      <button
                        type="button"
                        className="action-btn btn-primary"
                        style={{
                          justifyContent: "flex-start",
                          padding: "8px 10px",
                          fontSize: 11,
                          borderRadius: 8,
                        }}
                        onClick={() => {
                          setStrategyCreateMenuOpen(false);
                          setShowExactOptionsBuilder(true);
                        }}
                      >
                        Options Strategy
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="strategy-builder my-strategy-two-col">
                <div className="my-strategy-list-shell">
                  <div className="strategy-cards">
                    {myStrategies.map((s) => {
                      const lifecycle = normalizeLifecycleState(
                        s.lifecycle_state,
                        Boolean(s.deployed),
                      );
                      const isLive =
                        lifecycle === "ACTIVE" ||
                        lifecycle === "WAITING_MARKET_OPEN" ||
                        lifecycle === "TRIGGERED";
                      const strategyType = strategyKindTag(s);
                      const isOptions =
                        Boolean(s?.is_options) || strategyType === "options";
                      const strategyTypeClass =
                        strategyType === "options"
                          ? "type-meanrev"
                          : "type-momentum";
                      return (
                        <div className="my-strat-card my-strat-card-flat" key={s.id}>
                          <div className="my-strat-flat-top">
                            <div className="my-strat-flat-title">
                              <span
                                className="my-strat-card-name"
                                style={{ fontSize: 14, whiteSpace: "nowrap" }}
                              >
                                {s.name}
                              </span>
                              <span
                                className={`my-strat-card-type ${strategyTypeClass}`}
                                style={{
                                  fontSize: 9,
                                  letterSpacing: 1.2,
                                  textTransform: "uppercase",
                                }}
                              >
                                {strategyType}
                              </span>
                            </div>
                            <span
                              className={`strategy-tag ${isLive ? "tag-active" : "tag-paused"}`}
                              style={{ fontSize: 10 }}
                            >
                              {isLive ? "LIVE" : "STOPPED"}
                            </span>
                          </div>

                          <div className="my-strat-flat-meta">
                            {isOptions ? (
                              <div className="my-strat-flat-meta-item">
                                <span style={{ opacity: 0.8 }}>Contract </span>
                                <span style={{ color: "var(--accent-cyan)" }}>
                                  {(() => {
                                    const dep = optionDeploymentInfoFromCard(s);
                                    const txt = [dep.optionSymbol, dep.expiry]
                                      .filter(Boolean)
                                      .join(" • ");
                                    return txt || "Not selected";
                                  })()}
                                </span>
                              </div>
                            ) : null}
                            <div className="my-strat-flat-meta-item">
                              <span style={{ opacity: 0.8 }}>Broker </span>
                              <span style={{ color: "var(--accent-cyan)" }}>
                                {String(
                                  s.broker || summary?.broker || "Zerodha",
                                )}
                              </span>
                            </div>
                            <div className="my-strat-flat-meta-item">
                              <span style={{ opacity: 0.8 }}>SL </span>
                              <span style={{ color: "var(--accent-red)" }}>
                                {s.stopLoss || "1.7%"}
                              </span>
                            </div>
                            <div className="my-strat-flat-meta-item">
                              <span style={{ opacity: 0.8 }}>TP </span>
                              <span style={{ color: "var(--accent-green)" }}>
                                {s.takeProfit || "2.4%"}
                              </span>
                            </div>
                          </div>

                          <div className="my-strat-actions">
                            {pendingDelete?.id === s.id ? (
                              <>
                                <button
                                  type="button"
                                  className="strat-action-btn strat-btn-delete"
                                  onClick={async () => {
                                    const isOptions =
                                      Boolean(s?.is_options) ||
                                      strategyKindTag(s) === "options";
                                    if (
                                      useChartmate &&
                                      (isOptions
                                        ? chartmateActions?.onDeleteOptionsStrategy
                                        : chartmateActions?.onDeleteStrategy)
                                    ) {
                                      const err = isOptions
                                        ? await chartmateActions.onDeleteOptionsStrategy(
                                            s.id,
                                          )
                                        : await chartmateActions.onDeleteStrategy(
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
                                    addLog("warn", `Strategy "${s.name}" deleted`);
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
                                <button
                                  type="button"
                                  className={`strat-action-btn ${
                                    isOptions ? "strat-btn-deploy" : isLive ? "strat-btn-stop" : "strat-btn-deploy"
                                  }`}
                                  style={{
                                    borderRadius: 999,
                                    padding: "4px 10px",
                                    ...(!sessLive && !isLive
                                      ? { opacity: 0.6, cursor: "pointer" }
                                      : {}),
                                  }}
                                  title={
                                    isOptions && isLive
                                      ? "Already active"
                                      : isLive
                                      ? "Stop this live strategy"
                                      : !sessLive
                                        ? "Connect broker (live session) to activate"
                                        : "Deploy this strategy live"
                                  }
                                  onClick={() => {
                                    if (isOptions && isLive) {
                                      toast.info(
                                        "This options strategy is already active. Use Assigned Strategies > Stop to deactivate.",
                                      );
                                      return;
                                    }
                                    if (isLive) {
                                      void (async () => {
                                        const err = isOptions
                                          ? await chartmateActions?.onPauseOptionsStrategy?.(
                                              s.id,
                                            )
                                          : await chartmateActions?.onToggleDeploy?.(
                                              s.id,
                                              false,
                                            );
                                        if (err) {
                                          toast.error("Could not stop strategy", {
                                            description: String(err),
                                          });
                                          addLog("error", String(err));
                                          return;
                                        }
                                        addLog("warn", `Strategy "${s.name}" stopped`);
                                        chartmateActions?.onRefresh?.();
                                      })();
                                      return;
                                    }

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
                                    if (isOptions) {
                                      setActivateOptionsTarget(s._raw ?? s);
                                      return;
                                    }
                                    setGoLiveTarget(s);
                                    setGoLiveForm(defaultsGoLiveFromCard(s));
                                    setGoLiveRememberSymbol(
                                      Boolean(
                                        s?.position_config &&
                                          typeof s.position_config === "object" &&
                                          s.position_config.activation_defaults &&
                                          typeof s.position_config
                                            .activation_defaults === "object" &&
                                          String(
                                            s.position_config.activation_defaults
                                              .symbol || "",
                                          ).trim(),
                                      ),
                                    );
                                  }}
                                >
                                  {isOptions ? "Deploy" : isLive ? "Stop" : "Deploy"}
                                </button>
                                <button
                                  type="button"
                                  className="strat-action-btn strat-btn-delete"
                                  style={{ borderRadius: 999, padding: "4px 10px" }}
                                  onClick={() =>
                                    setPendingDelete({ id: s.id, name: s.name })
                                  }
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="my-strat-quickstats">
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
                      fontSize: 10,
                      color: "var(--text-muted)",
                      marginBottom: 10,
                    }}
                  >
                    Your strategy portfolio
                  </div>
                  <div className="my-strat-quickstats-grid">
                    <div className="my-strat-quickstats-cell">
                      <span style={{ color: "var(--text-muted)" }}>Total</span>
                      <span style={{ color: "var(--accent-cyan)" }}>
                        {myStrategies.length}
                      </span>
                    </div>
                    <div className="my-strat-quickstats-cell">
                      <span style={{ color: "var(--text-muted)" }}>Live</span>
                      <span style={{ color: "var(--accent-green)" }}>
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
                    <div className="my-strat-quickstats-cell">
                      <span style={{ color: "var(--text-muted)" }}>Stopped</span>
                      <span style={{ color: "var(--accent-yellow)" }}>
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
                    <div className="my-strat-quickstats-cell">
                      <span style={{ color: "var(--text-muted)" }}>Brokers</span>
                      <span style={{ color: "var(--accent-purple)" }}>1</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ REQUEST DEVELOPER TO CODE STRATEGY ═══ */}
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
                    <FaLaptopCode />
                  </span>
                  Request Strategy Development
                </div>
                <button
                  className="action-btn btn-primary"
                  style={{ padding: "6px 16px", fontSize: 12 }}
                  onClick={() => setShowDevRequest(true)}
                >
                  + New Request
                </button>
              </div>

              {/* Previous Requests */}
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: 2,
                    marginBottom: 12,
                  }}
                >
                  Development Requests
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 12,
                  }}
                >
                  {devList.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        background: "rgba(15,23,42,0.4)",
                        border: "1px solid var(--border-color)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            marginBottom: 4,
                          }}
                        >
                          {r.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          Submitted: {r.submitted} &bull; ETA: {r.eta}
                        </div>
                      </div>
                      <span
                        className={`strategy-tag ${
                          r.status === "completed" || r.status === "delivered"
                            ? "tag-active"
                            : r.status === "in_progress"
                              ? "tag-paused"
                              : ""
                        }`}
                        style={
                          r.status === "submitted"
                            ? {
                                background: "rgba(56,189,248,0.12)",
                                color: "var(--accent-cyan)",
                              }
                            : {}
                        }
                      >
                        {r.status === "completed" || r.status === "delivered"
                          ? "DELIVERED"
                          : r.status === "in_progress"
                            ? "IN PROGRESS"
                            : String(r.status || "submitted").toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
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
                    <FaClipboardList />
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

            <div className="card activity-log">
              <div
                style={{
                  marginTop: 4,
                  padding: "20px 24px",
                  borderRadius: 12,
                  background: "rgba(15,23,42,0.5)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    lineHeight: 1.8,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      color: "var(--accent-yellow)",
                      marginBottom: 6,
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <FaTriangleExclamation />
                      IMPORTANT RISK DISCLOSURE
                    </span>
                  </div>
                  <p>
                    Trading in stocks, options, futures, forex, and
                    cryptocurrencies involves substantial risk of loss and is
                    not suitable for every investor. The valuation of financial
                    instruments may fluctuate, and as a result, investors may
                    lose more than their original investment.
                  </p>
                  <p style={{ marginTop: 6 }}>
                    <strong>
                      TradingSmart.AI is a technology platform only.
                    </strong>{" "}
                    We provide software infrastructure to execute trading
                    strategies. All strategies deployed on this platform are
                    created, configured, and managed by the trader or their
                    SEBI/SEC-registered financial advisor. TradingSmart.AI does
                    not provide investment advice, portfolio management, or
                    strategy recommendations.
                  </p>
                  <p style={{ marginTop: 6 }}>
                    Past performance is not indicative of future results. You
                    should consult with a qualified financial advisor before
                    making any investment decisions. By using this platform, you
                    acknowledge that you understand the risks involved and
                    accept full responsibility for your trading decisions.
                  </p>
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 9,
                      color: "var(--text-muted)",
                      opacity: 0.7,
                    }}
                  >
                    {"\u00A9"} {new Date().getFullYear()} TradingSmart — Technology Platform | Not
                    a Financial Advisor | Not SEBI/SEC Registered
                  </div>
                </div>
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
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
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
          <div className="form-group" ref={goLiveSearchBoxRef}>
            <label className="form-label">Symbol *</label>
            <input
              className="form-input"
              value={goLiveForm.symbol}
              placeholder="Search broker symbols (e.g. RELIANCE, TCS)"
              onFocus={() => {
                if (goLiveSearchResults.length > 0) setGoLiveSearchOpen(true);
              }}
              onChange={(e) =>
                setGoLiveForm({
                  ...goLiveForm,
                  symbol: e.target.value.toUpperCase(),
                })
              }
              disabled={goLiveBusy}
            />
            <p
              style={{ marginTop: 6, fontSize: 10, color: "var(--text-muted)" }}
            >
              Showing symbols supported for your broker (
              {String(summary?.broker || "connected broker").toUpperCase()}):{" "}
              {allowedBrokerExchanges.join(", ")}
            </p>
            {goLiveSearchBusy ? (
              <p
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                Searching symbols…
              </p>
            ) : null}
            {goLiveSearchError ? (
              <p
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--accent-orange)",
                }}
              >
                {goLiveSearchError}
              </p>
            ) : null}
            {goLiveSearchOpen && goLiveSearchResults.length > 0 ? (
              <div
                style={{
                  marginTop: 8,
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "rgba(10,14,23,0.98)",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {goLiveSearchResults.map((item) => (
                  <button
                    key={String(item.full_symbol || item.symbol)}
                    type="button"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      borderBottom: "1px solid rgba(56,189,248,0.06)",
                      background: "transparent",
                      color: "var(--text-primary)",
                      padding: "9px 10px",
                      cursor: "pointer",
                    }}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      setGoLiveForm((prev) => ({
                        ...prev,
                        symbol: String(item.symbol || "").toUpperCase(),
                        exchange: String(
                          item._exchange || prev.exchange || "NSE",
                        ).toUpperCase(),
                      }));
                      setGoLiveSearchOpen(false);
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "JetBrains Mono, monospace",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {String(item.symbol || "").toUpperCase()}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--accent-cyan)",
                          border: "1px solid rgba(56,189,248,0.22)",
                          borderRadius: 5,
                          padding: "2px 6px",
                        }}
                      >
                        {String(item._exchange || "").toUpperCase()}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 10,
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {String(
                        item.description || item.full_symbol || "",
                      ).trim()}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
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
                {GO_LIVE_EXCHANGES.filter((e) =>
                  allowedBrokerExchanges.includes(e),
                ).map((e) => (
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
              marginTop: 10,
              marginBottom: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
            >
              <input
                type="checkbox"
                checked={goLiveRememberSymbol}
                disabled={goLiveBusy}
                onChange={(e) => setGoLiveRememberSymbol(e.target.checked)}
              />
              Remember this symbol for next activation
            </label>
            {Boolean(
              goLiveTarget?.position_config &&
              typeof goLiveTarget.position_config === "object" &&
              goLiveTarget.position_config.activation_defaults &&
              typeof goLiveTarget.position_config.activation_defaults ===
                "object" &&
              String(
                goLiveTarget.position_config.activation_defaults.symbol || "",
              ).trim(),
            ) ? (
              <button
                type="button"
                className="action-btn btn-warning"
                style={{ padding: "7px 10px", fontSize: 11 }}
                disabled={
                  goLiveBusy ||
                  !chartmateActions?.onClearActivationDefaults ||
                  !goLiveTarget
                }
                onClick={() => {
                  void (async () => {
                    if (
                      !goLiveTarget ||
                      !chartmateActions?.onClearActivationDefaults
                    )
                      return;
                    setGoLiveBusy(true);
                    try {
                      const err =
                        await chartmateActions.onClearActivationDefaults(
                          goLiveTarget.id,
                          goLiveTarget.position_config,
                        );
                      if (err) {
                        toast.error("Could not remove saved defaults", {
                          description: String(err),
                        });
                        return;
                      }
                      setGoLiveRememberSymbol(false);
                      setGoLiveForm((prev) => ({ ...prev, symbol: "" }));
                      toast.success("Saved activation defaults removed");
                      chartmateActions.onRefresh?.();
                    } finally {
                      setGoLiveBusy(false);
                    }
                  })();
                }}
              >
                Remove saved default
              </button>
            ) : null}
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
                        remember_symbol: goLiveRememberSymbol,
                      },
                      {
                        deployed: Boolean(goLiveTarget.deployed),
                        is_options:
                          Boolean(goLiveTarget?.is_options) ||
                          strategyKindTag(goLiveTarget) === "options",
                        raw:
                          goLiveTarget && typeof goLiveTarget._raw === "object"
                            ? goLiveTarget._raw
                            : null,
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
        panelClassName="w-[min(98vw,1700px)] sm:w-[min(98vw,1700px)] max-h-[94vh]"
        bodyClassName="px-3 sm:px-4"
      >
        {liveViewTarget ? (
          <div className="strategy-form w-full max-w-none">
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
              normal during scanning). Condition rows are not every quote tick.
              Intraday algos auto-pause after the cash session unless you still
              have an open live position — then use{" "}
              <strong>Stop strategy</strong> when you are done.
            </p>
            {(() => {
              const ch = chartRoutingFromStrategyCard(liveViewTarget);
              const isMcxUnderlying =
                ch.exchange === "MCX" || ch.exchange === "NCDEX";
              const lvLc = normalizeLifecycleState(
                liveViewTarget.lifecycle_state,
                Boolean(liveViewTarget.deployed),
              );
              return (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ height: 320 }}>
                      {isMcxUnderlying ? (
                        <BffUnderlyingChart
                          symbol={ch.symbol}
                          exchange={ch.exchange}
                          displayName={ch.symbol}
                        />
                      ) : (
                        <YahooChartPanel
                          symbol={yahooSymbolFromStrategyCard(liveViewTarget)}
                          displayName={ch.symbol}
                        />
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 6,
                        lineHeight: 1.45,
                      }}
                    >
                      {isMcxUnderlying ? (
                        <>
                          Chart data from your broker via OpenAlgo (MCX/NCDEX) in
                          INR — same feed used when orders execute. Condition &quot;
                          Live&quot; column is last engine pass for{" "}
                          <strong>{ch.symbol}</strong>.
                        </>
                      ) : (
                        <>
                          Yahoo Finance chart streams live ticks; Condition
                          &quot;Live&quot; column is last engine pass for this
                          strategy symbol.
                        </>
                      )}
                    </p>
                    {(() => {
                      const isOptions =
                        Boolean(liveViewTarget?.is_options) ||
                        strategyKindTag(liveViewTarget) === "options";
                      if (!isOptions) return null;
                      const dep = optionDeploymentInfoFromCard(liveViewTarget);
                      if (!dep.optionSymbol && !dep.quantity) return null;

                      const qtyNum = Number(String(dep.quantity).replace(/,/g, "")) || 0;
                      const { ltp, fetchedAt } = liveOptionQuote;
                      const costNum =
                        qtyNum > 0 && ltp != null && Number.isFinite(ltp)
                          ? qtyNum * ltp
                          : null;
                      const updatedSec =
                        fetchedAt != null && Number.isFinite(fetchedAt)
                          ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000))
                          : null;
                      // Re-render anchor for relative "Ns ago" while modal is open (1s ticker).
                      void liveViewQuoteAgeTick;

                      return (
                        <div style={{ marginTop: 10 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "flex-end",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 6,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              className="action-btn"
                              style={{
                                fontSize: 11,
                                padding: "4px 10px",
                                minWidth: 0,
                              }}
                              title="Trigger an immediate options scanner pass (engine snapshots)"
                              onClick={async () => {
                                try {
                                  await supabase.functions.invoke(
                                    "options-strategy-entry",
                                    { body: {} },
                                  );
                                } catch {
                                  /* noop */
                                }
                              }}
                            >
                              Refresh now
                            </button>
                          </div>
                          <p
                            style={{
                              fontSize: 10,
                              color: "var(--accent-cyan)",
                              marginTop: 0,
                              lineHeight: 1.45,
                            }}
                          >
                            <strong>Contract:</strong>{" "}
                            {dep.optionSymbol || "selected option"}
                            {dep.expiry ? (
                              <>
                                {" "}
                                · <strong>Expiry:</strong> {dep.expiry}
                              </>
                            ) : null}
                            {" "}
                            · <strong>Qty:</strong> {dep.quantity || "—"} (
                            {dep.lots || "—"} × {dep.lotUnits || "—"})
                          </p>
                          <p
                            style={{
                              fontSize: 10,
                              color: "var(--text-secondary)",
                              marginTop: 4,
                              lineHeight: 1.45,
                            }}
                          >
                            <strong>Premium (LTP):</strong>{" "}
                            {ltp != null && Number.isFinite(ltp)
                              ? `₹${Number(ltp).toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : "—"}{" "}
                            · <strong>Indicative cost:</strong>{" "}
                            {costNum != null && Number.isFinite(costNum)
                              ? `₹${Number(costNum).toLocaleString("en-IN", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`
                              : qtyNum > 0
                                ? "(need LTP)"
                                : "—"}{" "}
                            · <strong>Updated:</strong>{" "}
                            {updatedSec != null ? `${updatedSec}s ago` : "—"}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  <StrategyConditionPanel
                    strategyId={liveViewTarget.id}
                    strategyName={liveViewTarget.name}
                    symbol={ch.symbol}
                    brokerLive={sessLive}
                    streamStale={positionsStreamStale}
                    lifecycleState={lvLc}
                    lifecycleReason={liveViewTarget.lifecycle_reason ?? null}
                    lifecycleUpdatedAt={liveViewTarget.lifecycle_updated_at ?? null}
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
              {useChartmate &&
              liveViewTarget.deployed &&
              (chartmateActions?.onToggleDeploy ||
                chartmateActions?.onPauseOptionsStrategy) ? (
                <button
                  type="button"
                  className="action-btn btn-warning"
                  style={{
                    minWidth: 130,
                    borderColor: "rgba(248,113,113,0.45)",
                    color: "var(--accent-red)",
                  }}
                  disabled={liveModalStopBusy}
                  title="Turn off scanning for this strategy (same as Stop on the card)"
                  onClick={() => {
                    void (async () => {
                      if (!liveViewTarget)
                        return;
                      const isOptions =
                        Boolean(liveViewTarget?.is_options) ||
                        strategyKindTag(liveViewTarget) === "options";
                      setLiveModalStopBusy(true);
                      try {
                        const err = isOptions
                          ? await chartmateActions?.onPauseOptionsStrategy?.(
                              liveViewTarget.id,
                            )
                          : await chartmateActions?.onToggleDeploy?.(
                              liveViewTarget.id,
                              false,
                            );
                        if (err) {
                          const msg =
                            typeof err === "string" ? err : String(err);
                          toast.error("Could not stop strategy", {
                            description: msg,
                            duration: 10_000,
                          });
                          addLog("error", msg);
                          return;
                        }
                        toast.success("Strategy stopped", {
                          description: liveViewTarget.name,
                        });
                        addLog(
                          "warn",
                          `Strategy "${liveViewTarget.name}" stopped from Live view`,
                        );
                        chartmateActions.onRefresh?.();
                        setLiveViewTarget(null);
                      } catch (e) {
                        const msg =
                          e instanceof Error ? e.message : "Unexpected error.";
                        toast.error("Stop failed", { description: msg });
                        addLog("error", msg);
                      } finally {
                        setLiveModalStopBusy(false);
                      }
                    })();
                  }}
                >
                  {liveModalStopBusy ? "Stopping…" : "Stop strategy"}
                </button>
              ) : null}
              {/* {useChartmate && sessLive ? (
                <button
                  type="button"
                  className="action-btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={goLiveBusy}
                  title="Merge another symbol into this strategy (same manage-strategy flow as portfolio)"
                  onClick={() => {
                    const t = liveViewTarget;
                    setLiveViewTarget(null);
                    setGoLiveTarget(t);
                    setGoLiveForm(defaultsGoLiveFromCard(t));
                    setGoLiveRememberSymbol(
                      Boolean(
                        t?.position_config &&
                        typeof t.position_config === "object" &&
                        t.position_config.activation_defaults &&
                        typeof t.position_config.activation_defaults ===
                          "object" &&
                        String(
                          t.position_config.activation_defaults.symbol || "",
                        ).trim(),
                      ),
                    );
                  }}
                >
                  + Add instrument…
                </button>
              ) : null} */}
              {/* <button
                type="button"
                className="action-btn btn-warning"
                style={{ minWidth: 120, flex: "1 1 auto" }}
                onClick={() => {
                  setEditAlgoTarget(liveViewTarget._raw ?? liveViewTarget);
                  setShowExactAlgoBuilder(true);
                  setLiveViewTarget(null);
                }}
              >
                Edit strategy
              </button> */}
              {useChartmate &&
              typeof onCancelPendingForStrategy === "function" ? (
                <button
                  type="button"
                  className="action-btn btn-warning"
                  style={{
                    borderColor: "rgba(251,146,60,0.45)",
                    color: "var(--accent-orange)",
                    minWidth: 120,
                    flex: "1 1 auto",
                  }}
                  disabled={cancelPendingBusyId === liveViewTarget.id}
                  onClick={() => {
                    const id = liveViewTarget.id;
                    void (async () => {
                      setCancelPendingBusyId(id);
                      try {
                        const err = await onCancelPendingForStrategy(id);
                        if (err) {
                          const msg = typeof err === "string" ? err : String(err);
                          if (/no pending conditional orders/i.test(msg)) {
                            toast.info(msg);
                            addLog("info", msg);
                          } else {
                            toast.error("Could not cancel pending orders", {
                              description: msg,
                              duration: 10_000,
                            });
                            addLog("error", msg);
                          }
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
                style={{ minWidth: 100, flex: "1 1 auto" }}
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
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
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
        onOpenChange={(open) => {
          setShowExactOptionsBuilder(open);
          if (!open) setEditOptionsTarget(null);
        }}
        editStrategy={editOptionsTarget}
        onSaved={() => {
          setEditOptionsTarget(null);
          chartmateActions?.onRefresh?.();
          addLog("info", "Options strategy saved via ChartMate builder");
        }}
        showButton={false}
      />
      <OptionsStrategyActivateDialog
        open={Boolean(activateOptionsTarget)}
        onOpenChange={(open) => {
          if (!open) setActivateOptionsTarget(null);
        }}
        strategy={activateOptionsTarget}
        onActivated={() => {
          setActivateOptionsTarget(null);
          chartmateActions?.onRefresh?.();
          addLog(
            "exec",
            "Options strategy activated with broker option symbol",
          );
        }}
        mode="live"
      />
      {/* Toaster for broker-gate notifications and strategy feedback */}
      <Toaster richColors position="top-right" />

      {showDevRequest && (
        <div
          className="fixed inset-0 z-[4000] flex items-center justify-center bg-[rgba(2,6,23,0.72)] p-5 backdrop-blur-[6px]"
          onClick={() => setShowDevRequest(false)}
        >
          <div
            className="max-h-[90vh] w-[min(1100px,96vw)] overflow-auto rounded-[14px] border border-[var(--border-color)] bg-[linear-gradient(180deg,rgba(6,12,24,0.96),rgba(5,9,18,0.96))] p-[14px] shadow-[0_30px_80px_rgba(0,0,0,0.6)] md:p-[18px]"
            role="dialog"
            aria-modal="true"
            aria-label="Strategy development request form"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-[14px] flex items-center justify-between gap-3">
              <div className="text-[13px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary)]">
                Submit Strategy Development Request
              </div>
              <button
                type="button"
                className="h-[34px] w-[34px] cursor-pointer rounded-[9px] border border-[var(--border-color)] bg-[rgba(15,23,42,0.5)] text-base text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-primary)]"
                aria-label="Close strategy development request form"
                onClick={() => setShowDevRequest(false)}
              >
                <FaXmark />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="strategy-form">
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "rgba(167,139,250,0.05)",
                    border: "1px solid rgba(167,139,250,0.1)",
                    marginBottom: 4,
                  }}
                >
                  Submit your trading strategy idea to our development team.
                  Upload a PDF document with your strategy rules, entry/exit
                  conditions, indicators used, and risk parameters. Our
                  developers will code it into a production-ready algorithm.
                </div>
                <div className="form-group">
                  <label className="form-label">Strategy Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Fibonacci Retracement Scalper"
                    value={devForm.strategyName}
                    onChange={(e) =>
                      setDevForm({
                        ...devForm,
                        strategyName: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Strategy Description</label>
                  <textarea
                    className="form-input form-textarea"
                    placeholder="Describe your strategy logic, entry/exit rules, indicators, timeframes, and any special conditions..."
                    value={devForm.description}
                    onChange={(e) =>
                      setDevForm({
                        ...devForm,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Market</label>
                    <select
                      className="form-select"
                      value={devForm.market}
                      onChange={(e) =>
                        setDevForm({ ...devForm, market: e.target.value })
                      }
                    >
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
                    <select
                      className="form-select"
                      value={devForm.urgency}
                      onChange={(e) =>
                        setDevForm({ ...devForm, urgency: e.target.value })
                      }
                    >
                      <option value="normal">Normal (7-10 days)</option>
                      <option value="priority">Priority (3-5 days)</option>
                      <option value="rush">Rush (1-2 days)</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Contact Email</label>
                  <input
                    className="form-input"
                    type="email"
                    placeholder="you@example.com"
                    value={devForm.email}
                    onChange={(e) =>
                      setDevForm({ ...devForm, email: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Upload Strategy Document (PDF)
                  </label>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        devPdfFileRef.current = file ?? null;
                        if (file)
                          setDevForm({ ...devForm, pdfName: file.name });
                        else setDevForm({ ...devForm, pdfName: "" });
                      }}
                    />
                    <button
                      className="action-btn btn-primary"
                      style={{ padding: "10px 20px", fontSize: 12 }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <FaPaperclip /> Choose PDF File
                      </span>
                    </button>
                    {devForm.pdfName ? (
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--accent-green)",
                          fontFamily: "'JetBrains Mono',monospace",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <FaCircleCheck /> {devForm.pdfName}
                      </span>
                    ) : (
                      <span
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                      >
                        No file selected
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="action-btn btn-primary"
                  style={{
                    padding: 14,
                    fontSize: 14,
                    marginTop: 4,
                    background:
                      "linear-gradient(135deg,rgba(167,139,250,0.2),rgba(99,102,241,0.2))",
                    borderColor: "rgba(167,139,250,0.4)",
                    color: "var(--accent-purple)",
                  }}
                  disabled={devSubmitBusy || !onSubmitStrategyDevRequest}
                  onClick={() => {
                    void (async () => {
                      if (!devForm.strategyName.trim()) {
                        toast.error("Enter a strategy name");
                        return;
                      }
                      if (!onSubmitStrategyDevRequest) {
                        toast.error("Submit is not available");
                        return;
                      }
                      setDevSubmitBusy(true);
                      try {
                        const err = await onSubmitStrategyDevRequest({
                          strategy_name: devForm.strategyName.trim(),
                          description: devForm.description.trim(),
                          market: devForm.market,
                          priority: devForm.urgency,
                          contact_email: devForm.email.trim(),
                          file: devPdfFileRef.current,
                        });
                        if (err) {
                          toast.error("Request failed", { description: err });
                          addLog("error", err);
                          return;
                        }
                        addLog(
                          "info",
                          `Strategy development request submitted: "${devForm.strategyName}"`,
                        );
                        toast.success("Request saved", {
                          description:
                            "Our team has been notified when email is configured.",
                        });
                        setDevForm({
                          strategyName: "",
                          description: "",
                          market: "crypto",
                          urgency: "normal",
                          email: "",
                          pdfName: "",
                        });
                        devPdfFileRef.current = null;
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                        setShowDevRequest(false);
                      } catch (e) {
                        const msg =
                          e instanceof Error ? e.message : "Unexpected error";
                        toast.error("Submit failed", { description: msg });
                      } finally {
                        setDevSubmitBusy(false);
                      }
                    })();
                  }}
                >
                  {devSubmitBusy
                    ? "Submitting…"
                    : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <FaRocket />
                          Submit Development Request
                        </span>
                      )}
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: "rgba(15,23,42,0.5)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: 12,
                    }}
                  >
                    What to Include in Your PDF
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      lineHeight: 1.6,
                    }}
                  >
                    {[
                      "Entry & exit conditions with specific indicators",
                      "Timeframe and trading pairs/assets",
                      "Position sizing and risk management rules",
                      "Stop loss & take profit logic",
                      "Any special conditions or filters",
                      "Backtesting results (if available)",
                    ].map((item, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "flex-start",
                        }}
                      >
                        <span
                          style={{
                            color: "var(--accent-cyan)",
                            fontWeight: 700,
                            fontSize: 14,
                            lineHeight: 1.2,
                          }}
                        >
                          &#x2022;
                        </span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    background: "rgba(15,23,42,0.5)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: 6,
                    }}
                  >
                    Pricing
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    {[
                      { label: "Normal", price: "$499", time: "7-10 days" },
                      {
                        label: "Priority",
                        price: "$899",
                        time: "3-5 days",
                      },
                      { label: "Rush", price: "$1,499", time: "1-2 days" },
                    ].map((p) => (
                      <div
                        key={p.label}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: "rgba(0,0,0,0.2)",
                        }}
                      >
                        <span style={{ color: "var(--text-muted)" }}>
                          {p.label} ({p.time})
                        </span>
                        <span
                          style={{
                            color: "var(--accent-cyan)",
                            fontFamily: "'JetBrains Mono',monospace",
                            fontWeight: 600,
                          }}
                        >
                          {p.price}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
