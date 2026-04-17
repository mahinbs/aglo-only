import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, TrendingDown, Users, BarChart3, Activity, Calendar, Globe, ChevronLeft, ChevronRight, DollarSign, Target, Zap, Clock, Link2, Layers } from "lucide-react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PublicDailyPerformanceChart } from "@/components/public-dashboard/PublicDailyPerformanceChart";
import {
  type PublicDashboardAffiliateSeed as DemoAffiliateSeed,
} from "@/lib/publicDashboardAffiliateStorage";

interface Subscriber {
  id: string;
  name: string;
  country: string;
  payment_id: string | null;
  subscribed_at: string;
}

/** Person names used in metric-detail dialogs — excluded from generated affiliate names */
const RESERVED_DEMO_PERSON_NAMES = new Set([
  "Carlos Mendes",
  "Ahmed Hassan",
  "Luca Romano",
  "Sarah Chen",
  "Ethan Walker",
  "Arjun Mehta",
  "Sofia Martinez",
]);

/**
 * One bar on the affiliate demo sales chart: x-axis shows {@link day} (e.g. `1 Mar` — day + short month);
 * {@link fullLabel} is the full calendar date. Sum of `sales` matches demo profit at $49/unit gross and profit share.
 */
type AffiliateSalesPoint = { day: string; sales: number; fullLabel?: string };

/** Demo affiliates for the public (dummy) dashboard — not loaded from the API */
interface DashboardAffiliate {
  id: string;
  name: string;
  trackingId: string;
  /** Used only for YTD payout dialog math */
  userCount: number;
  profitShare: string;
  payout: string;
  joiningDate: string;
  totalEarnings: string;
  lastPayoutDate: string;
  monthlySales: AffiliateSalesPoint[];
}

interface DashboardWhitelabel {
  id: string;
  name: string;
  userCount: number;
  profitShare: string;
  payout: string;
}

type PartnerPayoutDialogTarget =
  | { kind: "affiliate"; row: DashboardAffiliate }
  | { kind: "whitelabel"; row: DashboardWhitelabel };

const AFFILIATE_TABLE_PAGE_SIZE = 15;
/** Upper bound when sanitizing pasted JSON in DevTools (chart scales to data). */
const AFFILIATE_SALES_JSON_MAX = 1_000_000;
/** Demo “Total earnings” / profit column and graph popup profit line (USD). */
const DEMO_AFFILIATE_PROFIT_MIN_USD = 5000;
const DEMO_AFFILIATE_PROFIT_MAX_USD = 20000;
/**
 * End date for affiliate demo sales bars (local midnight). Set to `null` to use the visitor’s real calendar “today”.
 * Fixed here so the public dashboard matches campaign dates (e.g. 2 Apr 2026) regardless of device clock.
 */
const PUBLIC_DEMO_SALES_CHART_AS_OF: Date | null = new Date(2026, 3, 2);
const WHITELABEL_TABLE_PAGE_SIZE = 10;

/** Product price per referred user for demo payout math; payout ≈ users × this × profit share. */
const PAYOUT_BASE_PER_USER_USD = 49;
const AFFILIATE_PROFIT_SHARE = 0.3;
const WHITELABEL_PROFIT_SHARE = 0.7;

/** Parse table profit share label for YTD payout breakdown (affiliates only). */
function parseAffiliateProfitShareFraction(label: string): number {
  const n = parseInt(label.replace(/%/g, "").trim(), 10);
  if (n === 70) return 0.7;
  if (n === 50) return 0.5;
  return AFFILIATE_PROFIT_SHARE;
}

/**
 * Names for the public "Recent Members" table — kept separate from {@link DEMO_AFFILIATES_BASE} names
 * so rows do not collide with the 15 fixed affiliate demo names.
 */
const SUBSCRIBER_TABLE_FIRST = [
  "Aarav", "Diya", "Kabir", "Ishita", "Vivaan", "Anika", "Reyansh", "Myra", "Arjun", "Kiara",
  "Dhruv", "Saanvi", "Rudra", "Tara", "Vihaan", "Ahana", "Shaurya", "Mira", "Advik", "Zara",
  "Riya", "Vedant", "Navya", "Yuvraj", "Pari", "Ishan", "Avni", "Kian", "Laksh", "Darsh",
  "Aadhya", "Ritu", "Dev", "Siya", "Om", "Kyra", "Neil", "Mihir", "Tia", "Eshan",
  "Miraya", "Ayaan", "Vansh", "Jiya", "Naina", "Rishika", "Tejas", "Ivana", "Rehan", "Saanjh",
  "Vanya", "Krishiv", "Mahika", "Reeva", "Atharv", "Inaya", "Shaan", "Myesh", "Viha", "Aradhya",
  "Rian", "Samaira", "Yashvi", "Vedika", "Iraja", "Nirvaan", "Zoya", "Pranay", "Tisha", "Kairav",
  "Anvika", "Rudransh", "Siyaana", "Hridya", "Ojas", "Pihu", "Reyanshi", "Vedansh", "Aarvi", "Nysa",
  "Shivansh", "Trishaana", "Uvika", "Yuvaan", "Zaraan", "Eshani", "Kavyansh", "Lavanya", "Mishka", "Nirali",
  "Oorja", "Parthiv", "Ranya", "Sarisha", "Tanishq", "Ujjwal", "Vritika", "Yashika", "Ziva", "Ahaan",
];

const SUBSCRIBER_TABLE_LAST = [
  "Bhattacharya", "Banerjee", "Chatterjee", "Dutta", "Sen", "Ghoshal", "Mukhopadhyay", "Chakraborty",
  "Hegde", "Shetty", "Kamat", "Deshmukh", "Patwardhan", "Bhatia", "Chadha", "Grover",
  "Khanna", "Malik", "Sethi", "Talwar", "Wadhwa", "Ahluwalia", "Bajaj", "Dhingra",
  "Khurana", "Luthra", "Mehra", "Oberoi", "Suri", "Tandon", "Vohra", "Walia",
  "Kaul", "Bakshi", "Ranjan", "Bhonsle", "Karmarkar", "Laghate", "Modak", "Phadke", "Rane", "Sawant",
  "Talgeri", "Upadhyay", "Vyas", "Wagle", "Zaveri", "Apte", "Barve", "Chitnis", "Deodhar", "Fadnavis",
  "Gokhale", "Hegdekar", "Inamdar", "Joglekar", "Kale", "Lokhande", "Mujumdar", "Nadkarni", "Oak", "Pai",
  "Ranade", "Sabnis", "Thacker", "Ukidwe", "Vaidya", "Welingkar", "Yajnik", "Zope", "Athavale", "Bhave",
  "Chaudhari", "Dani", "Ekbote", "Fadke", "Gadgil", "Haldankar", "Indulkar", "Jaisinghani", "Kibe", "Lele",
];

const INTL_FIRST = [
  "Oliver", "Emma", "Noah", "Sophia", "Liam", "Mia", "Jack", "Charlotte", "Henry", "Amelia",
  "Mason", "Grace", "Logan", "Chloe", "Wyatt", "Ella", "Caleb", "Hannah",
];

const INTL_LAST = [
  "Bennett", "Foster", "Hayes", "Coleman", "Reid", "Palmer", "West", "Bryant", "Vaughn", "Stone",
  "Porter", "Mann", "Rowe", "Chase", "Blake", "Cross", "Ford", "Snow",
];

const INTL_COUNTRIES_FOR_SUBSCRIBER_VIEW = [
  "United States",
  "United Kingdom",
  "United Arab Emirates",
  "Singapore",
  "Australia",
  "Canada",
  "Germany",
  "Japan",
  "France",
  "Netherlands",
] as const;

const WL_A = [
  "Aurora", "Nimbus", "Cobalt", "Vertex", "Polaris", "Crescent", "Harbor", "Summit", "Granite", "Silverline",
  "Ironwood", "Bluewave", "Northstar", "Oakridge", "Redstone", "Clearwater", "Blackfin", "Goldcrest", "Skyward", "Falcon",
  "Ridge", "Pinnacle", "Horizon", "Meridian", "Titanium", "Zenith", "Cascade", "Echo", "Nova", "Quantum",
  "Vector", "Prism", "Lattice", "Cipher", "Orbital", "Stellar", "Apex", "Stride", "Beacon", "Vanguard",
  "Citadel", "Anchor", "Compass", "Keystone", "Latitude", "Argon", "Helix", "Matrix", "Flux", "Pulse",
];

const WL_B = [
  "Markets", "Trading", "Capital", "Securities", "Analytics", "Advisory", "Partners", "Group", "Solutions", "Ventures",
  "Holdings", "Desk", "Labs", "Digital", "Wealth", "Finance", "Global", "Connect", "Stream", "Works",
];

function formatUsd0(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** Deterministic unit float in [0, 1) — stable across runs for the same seed */
function det01(seed: number): number {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return x - Math.floor(x);
}

function payoutFromUserCountUsd(userCount: number, share: number): number {
  return Math.round(userCount * PAYOUT_BASE_PER_USER_USD * share);
}

type MonthlyPayoutBreakdown = { monthLabel: string; amount: number };

/** Jan → current month of this year; amounts are a split of YTD = annual payout × (months elapsed / 12), with deterministic jitter that preserves the total */
function buildYtdMonthlyPayoutBreakdown(
  userCount: number,
  share: number,
  stableSeed: number,
): MonthlyPayoutBreakdown[] {
  const now = new Date();
  const y = now.getFullYear();
  const endMonth = now.getMonth();
  const monthsElapsed = endMonth + 1;
  const annualPayout = userCount * PAYOUT_BASE_PER_USER_USD * share;
  const ytdTarget = Math.round(annualPayout * (monthsElapsed / 12));
  const weights: number[] = [];
  for (let m = 0; m <= endMonth; m++) {
    weights.push(0.88 + det01(stableSeed * 9973 + m * 31) * 0.24);
  }
  const wSum = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (w / wSum) * ytdTarget);
  const rounded = raw.map((x) => Math.floor(x));
  let drift = ytdTarget - rounded.reduce((s, x) => s + x, 0);
  for (let i = 0; drift > 0 && i < rounded.length; i++) {
    const idx = (i + stableSeed) % rounded.length;
    rounded[idx]! += 1;
    drift -= 1;
  }
  return rounded.map((amount, m) => ({
    monthLabel: new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    amount,
  }));
}

function parseRowSeed(id: string): number {
  const n = parseInt(id.replace(/\D/g, ""), 10);
  if (Number.isFinite(n) && n > 0) return n;
  return id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

/** 32-bit mix — spreads hashed subscriber ids for name-pair picking. */
function mixU32(n: number): number {
  let x = n >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x >>>= 0;
  x ^= x << 5;
  return x >>> 0;
}

/** Inclusive max synthetic joins on a single calendar day (min is 0). */
const MAX_JOINS_PER_PUBLIC_SUB_DAY = 10;

const JOIN_DATE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getYmdInTimeZone(ms: number, timeZone: string): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ms);
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  return { y, m, d };
}

function addCalendarDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {
  const x = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

type PublicSubscriberJoinMeta = {
  /** Calendar days before “today” in the viewer timezone. */
  daysBeforeToday: number;
};

const DEFAULT_PUBLIC_SUB_JOIN_META: PublicSubscriberJoinMeta = { daysBeforeToday: 0 };

/**
 * For each list index (0 = newest), walks calendar days. Each day independently picks how many joined:
 * a uniform random integer in [0, {@link MAX_JOINS_PER_PUBLIC_SUB_DAY}] (so today might be 3, yesterday 7, etc.).
 * Recomputed when the subscriber list passed from the page’s `useMemo` dependency changes.
 */
function buildPublicSubscriberJoinMeta(count: number): PublicSubscriberJoinMeta[] {
  const out: PublicSubscriberJoinMeta[] = new Array(count);
  let day = 0;
  let i = 0;
  const maxDayGuard = count * 25 + 800;

  while (i < count && day < maxDayGuard) {
    const k = Math.floor(Math.random() * (MAX_JOINS_PER_PUBLIC_SUB_DAY + 1));
    const place = Math.min(k, count - i);
    for (let j = 0; j < place; j += 1) {
      out[i] = { daysBeforeToday: day };
      i += 1;
    }
    day += 1;
  }

  if (i < count) {
    while (i < count) {
      out[i] = { daysBeforeToday: day };
      i += 1;
    }
  }

  return out;
}

/** Date only (no clock time, no per-day index). */
function formatPublicSubscriberJoinedDate(meta: PublicSubscriberJoinMeta, timeZone: string): string {
  const today = getYmdInTimeZone(Date.now(), timeZone);
  const t = addCalendarDays(today.y, today.m, today.d, -meta.daysBeforeToday);
  return `${JOIN_DATE_MONTHS[t.m - 1]} ${t.d}, ${t.y}`;
}

/**
 * Public dashboard subscriber rows: ~90% India via {@link SUBSCRIBER_TABLE_FIRST}/{@link SUBSCRIBER_TABLE_LAST};
 * rest intl. IDs/payment refs stay from the API.
 * Full names are unique within the list (probe + numeric suffix fallback).
 */
function buildPublicSubscriberView(raw: Subscriber[]): Subscriber[] {
  const used = new Set<string>();
  const fLen = SUBSCRIBER_TABLE_FIRST.length;
  const lLen = SUBSCRIBER_TABLE_LAST.length;
  const inPairs = fLen * lLen;
  const iFL = INTL_FIRST.length;
  const iLL = INTL_LAST.length;
  const intlPairs = iFL * iLL;

  return raw.map((s, i) => {
    const seed = parseRowSeed(s.id);
    const indian = det01(seed + 514229) < 0.9;

    if (indian) {
      let h = mixU32(seed ^ (i * 0x9e3779b1));
      for (let probe = 0; probe < inPairs; probe++) {
        const idx = ((h + probe * 48623) >>> 0) % inPairs;
        const li = idx % lLen;
        const fi = Math.floor(idx / lLen);
        const name = `${SUBSCRIBER_TABLE_FIRST[fi]} ${SUBSCRIBER_TABLE_LAST[li]}`;
        const low = name.toLowerCase();
        if (!used.has(low)) {
          used.add(low);
          return { ...s, name, country: "India" };
        }
      }
      let suffix = 1;
      let fb = `${SUBSCRIBER_TABLE_FIRST[seed % fLen]} ${SUBSCRIBER_TABLE_LAST[(seed + i) % lLen]} ${suffix}`;
      while (used.has(fb.toLowerCase())) {
        suffix += 1;
        fb = `${SUBSCRIBER_TABLE_FIRST[seed % fLen]} ${SUBSCRIBER_TABLE_LAST[(seed + i + suffix) % lLen]} ${suffix}`;
      }
      used.add(fb.toLowerCase());
      return { ...s, name: fb, country: "India" };
    }

    let h = mixU32(seed ^ 0xdeadbeef ^ (i * 2654435769));
    for (let probe = 0; probe < intlPairs; probe++) {
      const idx = ((h + probe * 7919) >>> 0) % intlPairs;
      const li = idx % iLL;
      const fi = Math.floor(idx / iLL);
      const name = `${INTL_FIRST[fi]} ${INTL_LAST[li]}`;
      const low = name.toLowerCase();
      if (!used.has(low)) {
        used.add(low);
        const ci = (mixU32(h + probe) + i) % INTL_COUNTRIES_FOR_SUBSCRIBER_VIEW.length;
        return { ...s, name, country: INTL_COUNTRIES_FOR_SUBSCRIBER_VIEW[ci] };
      }
    }
    let suffix = 1;
    let fbName = `${INTL_FIRST[seed % iFL]} ${INTL_LAST[(seed + i) % iLL]} ${suffix}`;
    while (used.has(fbName.toLowerCase())) {
      suffix += 1;
      fbName = `${INTL_FIRST[seed % iFL]} ${INTL_LAST[(seed + i + suffix) % iLL]} ${suffix}`;
    }
    used.add(fbName.toLowerCase());
    const ci = (seed + i) % INTL_COUNTRIES_FOR_SUBSCRIBER_VIEW.length;
    return { ...s, name: fbName, country: INTL_COUNTRIES_FOR_SUBSCRIBER_VIEW[ci] };
  });
}

/** Fisher–Yates shuffle of [i,j] index pairs so we don't exhaust one first name before using others */
function shuffleIndexPairs(pairs: [number, number][], seed: number): void {
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(det01(seed + i * 12582917) * (i + 1));
    const t = pairs[i]!;
    pairs[i] = pairs[j]!;
    pairs[j] = t;
  }
}

function allIndexPairs(lenA: number, lenB: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let a = 0; a < lenA; a++) {
    for (let b = 0; b < lenB; b++) pairs.push([a, b]);
  }
  return pairs;
}

/** Target profit before tying to whole units (still in [{@link DEMO_AFFILIATE_PROFIT_MIN_USD}, {@link DEMO_AFFILIATE_PROFIT_MAX_USD}]). */
function demoAffiliateProfitTargetUsd(affiliateId: string, shareFrac: number): number {
  const n = parseInt(affiliateId.replace(/\D/g, ""), 10) || 1;
  const width = DEMO_AFFILIATE_PROFIT_MAX_USD - DEMO_AFFILIATE_PROFIT_MIN_USD + 1;
  const mix = (n * 11003 + Math.round(shareFrac * 1000)) % width;
  return DEMO_AFFILIATE_PROFIT_MIN_USD + mix;
}

/**
 * Demo units + gross + profit so table, chart, and popup agree: profit = round(units × price × share),
 * units chosen from the target profit band.
 */
function demoAffiliateSalesModel(affiliateId: string, shareFrac: number): {
  profitUsd: number;
  totalUnits: number;
  grossUsd: number;
} {
  const share = Math.max(0.05, shareFrac);
  const targetProfit = demoAffiliateProfitTargetUsd(affiliateId, shareFrac);
  const totalUnits = Math.max(1, Math.round(targetProfit / (PAYOUT_BASE_PER_USER_USD * share)));
  const grossUsd = totalUnits * PAYOUT_BASE_PER_USER_USD;
  const profitUsd = Math.round(grossUsd * share);
  return { profitUsd, totalUnits, grossUsd };
}

function demoAffiliateTotalEarningsDisplay(affiliateId: string, shareFrac: number): string {
  return formatUsd0(demoAffiliateSalesModel(affiliateId, shareFrac).profitUsd);
}

const MS_PER_DAY = 86400000;

const AFF_SALE_MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function stripCalendarDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatAffiliateSaleFullLabel(d: Date): string {
  return `${d.getDate()} ${AFF_SALE_MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Parses affiliate table strings like `01 Mar 2026`. */
function parseDemoAffiliateJoinDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const monStr = m[2]![0]!.toUpperCase() + m[2]!.slice(1).toLowerCase();
  const mi = (AFF_SALE_MONTH_SHORT as readonly string[]).indexOf(monStr);
  if (mi < 0) return null;
  const day = parseInt(m[1]!, 10);
  const y = parseInt(m[3]!, 10);
  if (day < 1 || day > 31) return null;
  return stripCalendarDate(new Date(y, mi, day));
}

/** X-axis tick label: `1 Mar`, `2 Apr`, etc. */
function affiliateSaleXTick(d: Date): string {
  return `${d.getDate()} ${AFF_SALE_MONTH_SHORT[d.getMonth()]}`;
}

/**
 * Eight sample calendar days from {@link joiningDateStr} through `asOf` (never after `asOf`).
 * Bar `sales` are integer units whose sum matches gross implied by demo profit:
 * Bar heights sum to {@link totalUnits} from {@link demoAffiliateSalesModel}.
 */
function affiliateDemoDailySales(
  weights: number[],
  asOf: Date,
  joiningDateStr: string,
  totalUnits: number
): AffiliateSalesPoint[] {
  const today = stripCalendarDate(asOf);
  const parsedJoin = parseDemoAffiliateJoinDate(joiningDateStr);
  let start = parsedJoin ? stripCalendarDate(parsedJoin) : today;
  if (start > today) start = new Date(today);

  const totalCap = Math.max(1, totalUnits);

  let daySpan = Math.round((today.getTime() - start.getTime()) / MS_PER_DAY);
  if (daySpan < 0) daySpan = 0;

  const dates: Date[] = [];
  for (let i = 0; i < 8; i++) {
    const t = new Date(start);
    if (daySpan === 0) {
      t.setTime(today.getTime());
    } else {
      t.setDate(start.getDate() + Math.round((i * daySpan) / 7));
    }
    if (t > today) t.setTime(today.getTime());
    dates.push(stripCalendarDate(t));
  }
  for (let i = 1; i < dates.length; i++) {
    if (dates[i]!.getTime() <= dates[i - 1]!.getTime()) {
      const nudged = new Date(dates[i - 1]!);
      nudged.setDate(nudged.getDate() + 1);
      dates[i] = nudged > today ? new Date(today) : stripCalendarDate(nudged);
    }
  }

  const n = dates.length;
  const w = Array.from({ length: n }, (_, i) => Math.max(0, weights[i] ?? 0));
  const sumW = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => (totalCap * x) / sumW);
  const ints = raw.map((x) => Math.floor(x));
  let rem = totalCap - ints.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r);
  const out = [...ints];
  let guard = 0;
  while (rem > 0 && guard < 2000) {
    const j = order[guard % n]!.i;
    out[j]! += 1;
    rem -= 1;
    guard += 1;
  }

  return dates.map((dt, i) => ({
    day: affiliateSaleXTick(dt),
    fullLabel: formatAffiliateSaleFullLabel(dt),
    sales: out[i]!,
  }));
}

function parseAffiliateSalesJson(raw: string): AffiliateSalesPoint[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: AffiliateSalesPoint[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const sales = Math.min(AFFILIATE_SALES_JSON_MAX, Math.max(0, Number(o.sales) || 0));
      const day =
        typeof o.day === "string" ? o.day : typeof o.month === "string" ? o.month : String(i + 1);
      const fullLabel = typeof o.fullLabel === "string" ? o.fullLabel : undefined;
      out.push({ day, sales, fullLabel });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Exactly 15 demo affiliates: ~47% Indian (non-Malayali), ~27% Malayali (Kerala), ~27% foreign
 * (closest integer split to 50% / 25% / 25% on 15 rows).
 * Edit this array (or `data-*` on rendered rows) to change showcase values. Joining dates from 01 Mar 2026 onward; last payouts ≤ 02 Apr 2026 (demo “today”, see {@link PUBLIC_DEMO_SALES_CHART_AS_OF}).
 */
const DEMO_AFFILIATES_BASE: DemoAffiliateSeed[] = [
  /* ── 7 × Indian (pan-India; not Malayali) ── */
  {
    id: "af-001",
    name: "Vikram Sharma",
    trackingId: "AFF-IN-MH-01",
    userCount: 1840,
    profitShare: "70%",
    payout: formatUsd0(payoutFromUserCountUsd(1840, 0.7)),
    joiningDate: "01 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-001", 0.7),
    lastPayoutDate: "31 Mar 2026",
    salesWeights: [28, 34, 22, 41, 36, 19, 44, 38],
  },
  {
    id: "af-002",
    name: "Priya Reddy",
    trackingId: "AFF-IN-TG-02",
    userCount: 920,
    profitShare: "50%",
    payout: formatUsd0(payoutFromUserCountUsd(920, 0.5)),
    joiningDate: "03 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-002", 0.5),
    lastPayoutDate: "28 Mar 2026",
    salesWeights: [12, 19, 31, 27, 45, 33, 21, 40],
  },
  {
    id: "af-003",
    name: "Aditya Patel",
    trackingId: "AFF-IN-GJ-03",
    userCount: 2405,
    profitShare: "70%",
    payout: formatUsd0(payoutFromUserCountUsd(2405, 0.7)),
    joiningDate: "05 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-003", 0.7),
    lastPayoutDate: "02 Apr 2026",
    salesWeights: [35, 42, 38, 29, 48, 44, 31, 50],
  },
  {
    id: "af-004",
    name: "Kavya Joshi",
    trackingId: "AFF-IN-KA-04",
    userCount: 1105,
    profitShare: "50%",
    payout: formatUsd0(payoutFromUserCountUsd(1105, 0.5)),
    joiningDate: "07 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-004", 0.5),
    lastPayoutDate: "25 Mar 2026",
    salesWeights: [18, 24, 16, 33, 28, 37, 25, 30],
  },
  {
    id: "af-005",
    name: "Rohan Singh",
    trackingId: "AFF-IN-PB-05",
    userCount: 1560,
    profitShare: "70%",
    payout: formatUsd0(payoutFromUserCountUsd(1560, 0.7)),
    joiningDate: "10 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-005", 0.7),
    lastPayoutDate: "01 Apr 2026",
    salesWeights: [25, 30, 27, 39, 33, 41, 36, 29],
  },
  {
    id: "af-006",
    name: "Neha Gupta",
    trackingId: "AFF-IN-DL-06",
    userCount: 678,
    profitShare: "50%",
    payout: formatUsd0(payoutFromUserCountUsd(678, 0.5)),
    joiningDate: "12 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-006", 0.5),
    lastPayoutDate: "27 Mar 2026",
    salesWeights: [9, 14, 22, 18, 26, 21, 17, 24],
  },
  {
    id: "af-007",
    name: "Sanjay Verma",
    trackingId: "AFF-IN-RJ-07",
    userCount: 2110,
    profitShare: "70%",
    payout: formatUsd0(payoutFromUserCountUsd(2110, 0.7)),
    joiningDate: "14 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-007", 0.7),
    lastPayoutDate: "30 Mar 2026",
    salesWeights: [32, 29, 41, 35, 40, 38, 33, 45],
  },
  /* ── 4 × Malayali (Kerala) ── */
  {
    id: "af-008",
    name: "Anjali Nair",
    trackingId: "AFF-KL-01",
    userCount: 445,
    profitShare: "50%",
    payout: formatUsd0(payoutFromUserCountUsd(445, 0.5)),
    joiningDate: "18 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-008", 0.5),
    lastPayoutDate: "29 Mar 2026",
    salesWeights: [6, 11, 15, 12, 19, 14, 10, 16],
  },
  {
    id: "af-009",
    name: "Rajesh Menon",
    trackingId: "AFF-KL-02",
    userCount: 1320,
    profitShare: "70%",
    payout: formatUsd0(payoutFromUserCountUsd(1320, 0.7)),
    joiningDate: "20 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-009", 0.7),
    lastPayoutDate: "02 Apr 2026",
    salesWeights: [21, 26, 24, 31, 28, 35, 30, 27],
  },
  {
    id: "af-010",
    name: "Lakshmi Pillai",
    trackingId: "AFF-KL-03",
    userCount: 890,
    profitShare: "50%",
    payout: formatUsd0(payoutFromUserCountUsd(890, 0.5)),
    joiningDate: "22 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-010", 0.5),
    lastPayoutDate: "30 Mar 2026",
    salesWeights: [14, 17, 20, 23, 19, 25, 22, 28],
  },
  {
    id: "af-011",
    name: "Sreeja Unnikrishnan",
    trackingId: "AFF-KL-04",
    userCount: 1745,
    profitShare: "70%",
    payout: formatUsd0(payoutFromUserCountUsd(1745, 0.7)),
    joiningDate: "24 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-011", 0.7),
    lastPayoutDate: "02 Apr 2026",
    salesWeights: [30, 33, 29, 37, 34, 42, 39, 36],
  },
  /* ── 4 × Foreign ── */
  {
    id: "af-012",
    name: "Oliver Bennett",
    trackingId: "AFF-UK-01",
    userCount: 560,
    profitShare: "50%",
    payout: formatUsd0(payoutFromUserCountUsd(560, 0.5)),
    joiningDate: "26 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-012", 0.5),
    lastPayoutDate: "01 Apr 2026",
    salesWeights: [8, 10, 13, 16, 14, 18, 15, 20],
  },
  {
    id: "af-013",
    name: "Sophia Coleman",
    trackingId: "AFF-US-02",
    userCount: 1988,
    profitShare: "70%",
    payout: formatUsd0(payoutFromUserCountUsd(1988, 0.7)),
    joiningDate: "28 Mar 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-013", 0.7),
    lastPayoutDate: "02 Apr 2026",
    salesWeights: [27, 31, 36, 33, 41, 38, 35, 43],
  },
  {
    id: "af-014",
    name: "Liam Foster",
    trackingId: "AFF-CA-03",
    userCount: 725,
    profitShare: "50%",
    payout: formatUsd0(payoutFromUserCountUsd(725, 0.5)),
    joiningDate: "01 Apr 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-014", 0.5),
    lastPayoutDate: "02 Apr 2026",
    salesWeights: [11, 15, 18, 21, 19, 24, 22, 26],
  },
  {
    id: "af-015",
    name: "Emma Hayes",
    trackingId: "AFF-AU-04",
    userCount: 1412,
    profitShare: "70%",
    payout: formatUsd0(payoutFromUserCountUsd(1412, 0.7)),
    joiningDate: "02 Apr 2026",
    totalEarnings: demoAffiliateTotalEarningsDisplay("af-015", 0.7),
    lastPayoutDate: "02 Apr 2026",
    salesWeights: [23, 28, 25, 32, 30, 36, 34, 31],
  },
];

function buildDemoAffiliates(
  base: DemoAffiliateSeed[],
  excludeLower: Set<string>,
  salesChartAsOf: Date
): DashboardAffiliate[] {
  const blocked = new Set<string>(excludeLower);
  for (const n of RESERVED_DEMO_PERSON_NAMES) blocked.add(n.toLowerCase());
  return base.map((row) => {
    const { salesWeights, ...rest } = row;
    let name = row.name;
    if (blocked.has(name.toLowerCase())) {
      name = `${row.name} · Partner`;
    }
    const shareFrac = parseAffiliateProfitShareFraction(row.profitShare);
    const model = demoAffiliateSalesModel(row.id, shareFrac);
    return {
      ...rest,
      name,
      totalEarnings: formatUsd0(model.profitUsd),
      monthlySales: affiliateDemoDailySales(salesWeights, salesChartAsOf, row.joiningDate, model.totalUnits),
    };
  });
}

function buildDemoWhitelabels(excludeLower: Set<string>): DashboardWhitelabel[] {
  const usedLower = new Set<string>(excludeLower);
  for (const n of RESERVED_DEMO_PERSON_NAMES) usedLower.add(n.toLowerCase());
  const pairs = allIndexPairs(WL_A.length, WL_B.length);
  shuffleIndexPairs(pairs, 161803398);
  const names: string[] = [];
  for (const [a, b] of pairs) {
    if (names.length >= 100) break;
    const n = `${WL_A[a]} ${WL_B[b]}`;
    const low = n.toLowerCase();
    if (usedLower.has(low)) continue;
    usedLower.add(low);
    names.push(n);
  }
  let k = 0;
  const WL_FALLBACK_A = ["Velum", "Crystalline", "Obsidian", "Copperfield", "Slatebridge", "Ironbark", "Mistral", "Zephyrine"];
  const WL_FALLBACK_B = ["Systems", "Networks", "Exchange", "Clearing", "Outpost", "Interface", "Ledger", "Console"];
  while (names.length < 100) {
    k += 1;
    const fb = `${WL_FALLBACK_A[k % WL_FALLBACK_A.length]} ${WL_FALLBACK_B[(k * 5) % WL_FALLBACK_B.length]} ${k + 880}`;
    const low = fb.toLowerCase();
    if (usedLower.has(low)) continue;
    usedLower.add(low);
    names.push(fb);
  }
  return names.map((name, idx) => {
    const userCount = 180 + (idx * 97231 % 11500);
    const payoutN = payoutFromUserCountUsd(userCount, WHITELABEL_PROFIT_SHARE);
    return {
      id: `WL-${String(idx + 1).padStart(4, "0")}`,
      name,
      userCount,
      profitShare: "70%",
      payout: formatUsd0(payoutN),
    };
  });
}

function TablePaginationBar(props: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const { page, pageSize, total, onPageChange } = props;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-border/30">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? "No rows" : `Showing ${from}–${to} of ${total}`}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-xs px-2 tabular-nums">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

interface Metric {
  id: string;
  key: string;
  label: string;
  value: string;
  unit: string | null;
  description: string | null;
  sort_order: number | null;
  chart_type?: string | null;
  chart_data?: { date: string; value: number }[] | null;
}

type ChartPoint = { date: string; value: number };

function metricIcon(key: string) {
  if (key.includes("profit")) return <TrendingUp className="h-5 w-5 text-emerald-500" />;
  if (key.includes("loss")) return <TrendingDown className="h-5 w-5 text-red-500" />;
  if (key.includes("user")) return <Users className="h-5 w-5 text-sky-500" />;
  if (key.includes("revenue")) return <BarChart3 className="h-5 w-5 text-indigo-500" />;
  return <Activity className="h-5 w-5 text-primary" />;
}

function parseNumeric(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toFlag(code: string): string {
  const cc = code.toUpperCase();
  if (cc.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (cc.charCodeAt(0) - 65), A + (cc.charCodeAt(1) - 65));
}

function countryFlag(country: string): string {
  const c = country.trim();
  if (!c) return "";

  const map: Record<string, string> = {
    Thailand: "TH",
    USA: "US",
    "United States": "US",
    India: "IN",
    Netherlands: "NL",
    Brazil: "BR",
    "South Korea": "KR",
    Nigeria: "NG",
    Kazakhstan: "KZ",
    France: "FR",
    UAE: "AE",
    "United Arab Emirates": "AE",
    Poland: "PL",
    Sweden: "SE",
    Japan: "JP",
    Mexico: "MX",
    Ireland: "IE",
    Taiwan: "TW",
    Ghana: "GH",
    Bulgaria: "BG",
    Italy: "IT",
    Pakistan: "PK",
    "New Zealand": "NZ",
    Germany: "DE",
    Spain: "ES",
    Argentina: "AR",
    "South Africa": "ZA",
    Canada: "CA",
    Egypt: "EG",
    Serbia: "RS",
    Fiji: "FJ",
    Croatia: "HR",
    UK: "GB",
    "United Kingdom": "GB",
    Chile: "CL",
    Russia: "RU",
    Australia: "AU",
    Uzbekistan: "UZ",
    Austria: "AT",
    Oman: "OM",
    Colombia: "CO",
    Singapore: "SG",
    Switzerland: "CH",
    Ethiopia: "ET",
    Peru: "PE",
    "Cook Islands": "CK",
    Nepal: "NP",
    Belarus: "BY",
    Vietnam: "VN",
    Lebanon: "LB",
    Uruguay: "UY",
    Tonga: "TO",
    Samoa: "WS",
    Eswatini: "SZ",
    Ukraine: "UA",
    Jordan: "JO",
    Somalia: "SO",
    Morocco: "MA",
    Zimbabwe: "ZW",
    Montenegro: "ME",
    Tunisia: "TN",
    Iran: "IR",
    Israel: "IL",
    China: "CN",
    Norway: "NO",
  };

  const mapped = map[c] || map[c.toUpperCase()];
  if (mapped) return toFlag(mapped);

  const parts = c.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last.length === 2) return toFlag(last);

  return "";
}

function formatValue(m: Metric, n?: number): string {
  const numeric = n ?? parseNumeric(m.value);
  if (m.unit === "USD") {
    if (Math.abs(numeric) >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(2)}M`;
    if (Math.abs(numeric) >= 1_000) return `$${(numeric / 1_000).toFixed(1)}K`;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numeric);
  }
  if (m.unit === "%") return `${numeric.toFixed(1)}%`;
  if (m.unit) return `${numeric.toLocaleString()} ${m.unit}`;
  return numeric.toLocaleString();
}

/** Deterministic seeded random — returns a float in [-1, 1] */
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Generate last-7-days per-day data — always ignores saved cumulative chart_data.
 *  Previous 6 days are stable (seeded). Today changes each calendar day. */
function buildSevenDayData(m: Metric, tz: string): ChartPoint[] {
  const base = parseNumeric(m.value);
  const now = new Date();
  const keySeed = m.key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const dailyBase = base / 30;
  const todaySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
    const daySeed = i < 6 ? keySeed + i * 31 + 7777 : keySeed + todaySeed;
    const factor = 1 + seededRand(daySeed) * 0.45;
    const value = Math.max(0, Math.round(dailyBase * factor));
    return { date: label, value };
  });
}

function accentColors(key: string) {
  if (key.includes("profit")) return { stroke: "#10b981", fill: "#10b981", border: "border-emerald-500/40", bg: "bg-emerald-500/5" };
  if (key.includes("loss")) return { stroke: "#ef4444", fill: "#ef4444", border: "border-red-500/40", bg: "bg-red-500/5" };
  if (key.includes("user")) return { stroke: "#0ea5e9", fill: "#0ea5e9", border: "border-sky-500/40", bg: "bg-sky-500/5" };
  if (key.includes("accuracy")) return { stroke: "#f59e0b", fill: "#f59e0b", border: "border-amber-500/40", bg: "bg-amber-500/5" };
  if (key.includes("revenue")) return { stroke: "#6366f1", fill: "#6366f1", border: "border-indigo-500/40", bg: "bg-indigo-500/5" };
  return { stroke: "#8b5cf6", fill: "#8b5cf6", border: "border-violet-500/40", bg: "bg-violet-500/5" };
}

/** Pixel height for per-metric 7-day charts (bar / line / area). */
const METRIC_SEVEN_DAY_CHART_HEIGHT = 220;

function MetricSparkline({ m, data }: { m: Metric; data: ChartPoint[] }) {
  const colors = accentColors(m.key);
  const chartType = m.chart_type || "area";

  const tooltipFormatter = (val: number) => [formatValue(m, val), m.label];

  const commonProps = {
    data,
    margin: { top: 8, right: 8, left: 0, bottom: 4 },
  };

  const axisProps = {
    tick: { fontSize: 10, fill: "#6b7280" },
    tickLine: false,
    axisLine: false,
  };

  return (
    <ResponsiveContainer width="100%" height={METRIC_SEVEN_DAY_CHART_HEIGHT}>
      {chartType === "bar" ? (
        <BarChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} width={40} tickFormatter={(v) => formatValue(m, v)} />
          <Tooltip formatter={tooltipFormatter} contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }} />
          <Bar dataKey="value" fill={colors.fill} radius={[3, 3, 0, 0]} fillOpacity={0.85} />
        </BarChart>
      ) : chartType === "line" ? (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} width={40} tickFormatter={(v) => formatValue(m, v)} />
          <Tooltip formatter={tooltipFormatter} contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }} />
          <Line type="monotone" dataKey="value" stroke={colors.stroke} strokeWidth={2} dot={{ r: 3, fill: colors.stroke }} activeDot={{ r: 5 }} />
        </LineChart>
      ) : (
        <AreaChart {...commonProps}>
          <defs>
            <linearGradient id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.fill} stopOpacity={0.35} />
              <stop offset="95%" stopColor={colors.fill} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.4} />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} width={40} tickFormatter={(v) => formatValue(m, v)} />
          <Tooltip formatter={tooltipFormatter} contentStyle={{ background: "#1f2937", border: "none", borderRadius: "8px", color: "#f9fafb", fontSize: 12 }} />
          <Area type="monotone" dataKey="value" stroke={colors.stroke} strokeWidth={2} fill={`url(#grad-${m.key})`} />
        </AreaChart>
      )}
    </ResponsiveContainer>
  );
}

const SUB_PAGE_SIZE = 10;

type PublicDashboardPageProps = {
  /** Super-admin preview inside /admin — same UI as /dashboard, with a link to edit metrics instead of marketing home. */
  embedInAdmin?: boolean;
};

export default function PublicDashboardPage({ embedInAdmin = false }: PublicDashboardPageProps) {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subPage, setSubPage] = useState(1);
  const [affPage, setAffPage] = useState(1);
  const [wlPage, setWlPage] = useState(1);

  const displaySubscribers = useMemo(() => buildPublicSubscriberView(subscribers), [subscribers]);

  const subscriberJoinMeta = useMemo(() => {
    const n = subscribers.length;
    if (n === 0) return [];
    return buildPublicSubscriberJoinMeta(n);
  }, [subscribers]);

  const subscriberNamesLower = useMemo(
    () => new Set(displaySubscribers.map((s) => s.name.trim().toLowerCase()).filter(Boolean)),
    [displaySubscribers]
  );

  /** End of the affiliate demo sales window ({@link PUBLIC_DEMO_SALES_CHART_AS_OF} or local “today”). */
  const affiliateSalesChartAsOf = useMemo(() => {
    const d = new Date(PUBLIC_DEMO_SALES_CHART_AS_OF ?? new Date());
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [supabaseAffiliates, setSupabaseAffiliates] = useState<DemoAffiliateSeed[] | null>(null);

  const affiliateRows = useMemo(() => {
    const base = supabaseAffiliates !== null && supabaseAffiliates.length > 0
      ? supabaseAffiliates
      : DEMO_AFFILIATES_BASE;
    return buildDemoAffiliates(base, subscriberNamesLower, affiliateSalesChartAsOf);
  }, [supabaseAffiliates, subscriberNamesLower, affiliateSalesChartAsOf]);

  const whitelabelExcludeLower = useMemo(() => {
    const s = new Set(subscriberNamesLower);
    for (const a of affiliateRows) s.add(a.name.toLowerCase());
    return s;
  }, [subscriberNamesLower, affiliateRows]);

  const whitelabelRows = useMemo(
    () => buildDemoWhitelabels(whitelabelExcludeLower),
    [whitelabelExcludeLower]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [{ data: mData, error: mErr }, { data: sData }, { data: aData }] = await Promise.all([
          (supabase as any).from("public_dashboard_metrics").select("*").order("sort_order", { ascending: true }),
          (supabase as any).from("recent_subscribers").select("id, name, country, payment_id, subscribed_at").order("subscribed_at", { ascending: false }),
          (supabase as any).from("public_dashboard_affiliates").select("*").order("created_at", { ascending: true }),
        ]);
        if (mErr) throw mErr;
        setMetrics((mData as any[]) || []);
        setSubscribers((sData as any[]) || []);
        const mappedAffiliates: DemoAffiliateSeed[] = ((aData as any[]) ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          trackingId: r.tracking_id,
          userCount: r.user_count,
          profitShare: r.profit_share,
          payout: r.payout,
          joiningDate: r.joining_date,
          totalEarnings: r.total_earnings,
          lastPayoutDate: r.last_payout_date,
          salesWeights: Array.isArray(r.sales_weights) ? r.sales_weights : [20, 24, 18, 28, 26, 22, 30, 24],
        }));
        setSupabaseAffiliates(mappedAffiliates.length > 0 ? mappedAffiliates : null);
      } catch (e) {
        console.error("Failed to load public dashboard", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const numericMetrics = useMemo(
    () => metrics.filter((m) => parseNumeric(m.value) !== 0),
    [metrics]
  );

  const sevenDayDataMap = useMemo(
    () => Object.fromEntries(numericMetrics.map((m) => [m.id, buildSevenDayData(m, tz)])),
    [numericMetrics, tz]
  );

  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
  const [payoutDialog, setPayoutDialog] = useState<PartnerPayoutDialogTarget | null>(null);
  const [affiliateSalesRow, setAffiliateSalesRow] = useState<DashboardAffiliate | null>(null);

  const payoutDialogBreakdown = useMemo(() => {
    if (!payoutDialog) return null;
    const share =
      payoutDialog.kind === "affiliate"
        ? parseAffiliateProfitShareFraction(payoutDialog.row.profitShare)
        : WHITELABEL_PROFIT_SHARE;
    const seed = parseRowSeed(payoutDialog.row.id);
    const months = buildYtdMonthlyPayoutBreakdown(payoutDialog.row.userCount, share, seed);
    const total = months.reduce((s, r) => s + r.amount, 0);
    const chartData = months.map((row) => {
      const monthWord = row.monthLabel.replace(/\s+\d{4}$/, "").trim();
      const shortMonth =
        monthWord.length <= 4 ? monthWord : `${monthWord.slice(0, 3)}`;
      return {
        month: shortMonth,
        fullMonth: row.monthLabel,
        amount: row.amount,
      };
    });
    return { months, total, chartData };
  }, [payoutDialog]);

  return (
    <div className={embedInAdmin ? "min-h-0 bg-background -mx-4 px-4 sm:-mx-6 sm:px-6" : "min-h-screen bg-background"}>
      {/* Header */}
      <div className="border-b bg-card/50">
        <div className="container mx-auto px-4 py-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            {!embedInAdmin && (
              <Link to="/rsb-fintech-founder">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Home
                </Button>
              </Link>
            )}
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Platform Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                {embedInAdmin
                  ? "Read-only preview — same page visitors see at /dashboard"
                  : "Live performance metrics &amp; growth stats — curated by the admin"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Timezone: {tz}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-10">

        {loading && (
          <p className="text-sm text-muted-foreground animate-pulse">Loading dashboard…</p>
        )}

        {!loading && metrics.length === 0 && (
          <Card className="max-w-xl mx-auto">
            <CardHeader>
              <CardTitle>No public metrics yet</CardTitle>
              <p className="text-sm text-muted-foreground">
                The admin hasn&apos;t configured any public dashboard metrics yet.
              </p>
            </CardHeader>
          </Card>
        )}

        {!loading && metrics.length > 0 && (
          <>
            {/* ── Hero stat row ── */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
              {metrics.map((m) => {
                const colors = accentColors(m.key);
                return (
                  <Card 
                    key={m.id} 
                    className={`border ${colors.border} ${colors.bg} relative overflow-hidden cursor-pointer hover:bg-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98]`}
                    onClick={() => setSelectedMetric(m)}
                  >
                    <CardContent className="pt-5 pb-4 px-5">
                      <div className="flex items-center gap-2 mb-2">
                        {metricIcon(m.key)}
                        <span className="text-xs font-medium text-muted-foreground truncate">{m.label}</span>
                        {m.unit && <Badge variant="outline" className="text-[10px] ml-auto">{m.unit}</Badge>}
                      </div>
                      <p className="text-2xl font-bold tracking-tight">{formatValue(m)}</p>
                      {m.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">{m.description}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* ── 7-day per-metric charts ── */}
            {numericMetrics.length > 0 && (
              <div>
                <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Last 7 Days — per metric
                </h2>
                <div className="grid gap-5 md:grid-cols-2">
                  {numericMetrics.map((m) => {
                    const colors = accentColors(m.key);
                    const data = sevenDayDataMap[m.id] || [];
                    const prev = data[data.length - 2]?.value ?? 0;
                    const curr = data[data.length - 1]?.value ?? 0;
                    const growthPct = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;

                    return (
                      <Card key={m.id} className={`border ${colors.border}`}>
                        <CardHeader className="pb-1">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              {metricIcon(m.key)}
                              {m.label}
                            </CardTitle>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${growthPct >= 0 ? "border-emerald-500 text-emerald-600" : "border-red-500 text-red-500"}`}
                              >
                                {growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}% today
                              </Badge>
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {m.chart_type || "area"}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <MetricSparkline m={m} data={data} />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            <PublicDailyPerformanceChart metrics={metrics} timeZone={tz} />

            {/* ── Recent Subscribers ── */}
            {displaySubscribers.length > 0 && (() => {
              const totalPages = Math.ceil(displaySubscribers.length / SUB_PAGE_SIZE);
              const pageSlice = displaySubscribers.slice((subPage - 1) * SUB_PAGE_SIZE, subPage * SUB_PAGE_SIZE);
              return (
                <div>
                  <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    Recent Members
                    <Badge variant="outline" className="text-[10px] ml-1">{displaySubscribers.length} total</Badge>
                  </h2>
                  <Card className="border-border/50">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50 bg-muted/30">
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">#</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Name</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Country</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Payment Ref</th>
                              <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Joined</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageSlice.map((s, idx) => {
                              const globalIdx = (subPage - 1) * SUB_PAGE_SIZE + idx + 1;
                              const listIndex = (subPage - 1) * SUB_PAGE_SIZE + idx;
                              const joinedDate = formatPublicSubscriberJoinedDate(
                                subscriberJoinMeta[listIndex] ?? DEFAULT_PUBLIC_SUB_JOIN_META,
                                tz,
                              );
                              const maskedRef = s.payment_id
                                ? s.payment_id.length > 8
                                  ? `${s.payment_id.slice(0, 6)}••••`
                                  : s.payment_id
                                : "—";
                              return (
                                <tr key={s.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-3 text-muted-foreground text-xs">{globalIdx}</td>
                                  <td className="px-4 py-3 font-medium">{s.name}</td>
                                  <td className="px-4 py-3">
                                    {(() => {
                                      const flag = countryFlag(s.country);
                                      return (
                                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                          {flag ? (
                                            <span className="text-base leading-none">{flag}</span>
                                          ) : (
                                            <Globe className="h-3 w-3" />
                                          )}
                                          <span>{s.country}</span>
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-4 py-3">
                                    <code className="text-xs bg-muted/40 px-1.5 py-0.5 rounded font-mono">{maskedRef}</code>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground">{joinedDate}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
                          <p className="text-xs text-muted-foreground">
                            Showing {(subPage - 1) * SUB_PAGE_SIZE + 1}–{Math.min(subPage * SUB_PAGE_SIZE, displaySubscribers.length)} of {displaySubscribers.length}
                          </p>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={subPage === 1} onClick={() => setSubPage(p => p - 1)}>
                              <ChevronLeft className="h-3 w-3" />
                            </Button>
                            <span className="text-xs px-2">{subPage} / {totalPages}</span>
                            <Button variant="outline" size="icon" className="h-7 w-7" disabled={subPage === totalPages} onClick={() => setSubPage(p => p + 1)}>
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* ── Affiliates (dummy data for showcase dashboard) ── */}
            <div>
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                Affiliates
                <Badge variant="outline" className="text-[10px] ml-1">{affiliateRows.length} partners</Badge>
              </h2>
              <Card className="border-violet-500/25 bg-violet-500/[0.03]">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[920px]">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                          <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs w-10">#</th>
                          <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs">Name</th>
                          <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs">Id</th>
                          <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">
                            Joining date
                          </th>
                          <th className="text-right px-3 py-3 font-medium text-muted-foreground text-xs">Profit share</th>
                          <th className="text-right px-3 py-3 font-medium text-muted-foreground text-xs">Total earnings</th>
                          <th className="text-left px-3 py-3 font-medium text-muted-foreground text-xs whitespace-nowrap">
                            Last payout date
                          </th>
                          <th className="text-center px-3 py-3 font-medium text-muted-foreground text-xs w-[100px]">Sales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {affiliateRows
                          .slice(
                            (affPage - 1) * AFFILIATE_TABLE_PAGE_SIZE,
                            affPage * AFFILIATE_TABLE_PAGE_SIZE
                          )
                          .map((a, idx) => {
                            const globalIdx = (affPage - 1) * AFFILIATE_TABLE_PAGE_SIZE + idx + 1;
                            const salesJson = JSON.stringify(a.monthlySales);
                            return (
                              <tr
                                key={a.id}
                                className="border-b border-border/30 hover:bg-muted/15 transition-colors"
                                data-affiliate-id={a.id}
                                data-monthly-sales-json={salesJson}
                              >
                                <td
                                  className="px-3 py-3 text-muted-foreground text-xs tabular-nums"
                                  data-field="index"
                                  data-value={String(globalIdx)}
                                >
                                  {globalIdx}
                                </td>
                                <td
                                  className="px-3 py-3 font-medium"
                                  data-field="name"
                                  data-value={a.name}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setPayoutDialog({ kind: "affiliate", row: a })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setPayoutDialog({ kind: "affiliate", row: a });
                                    }
                                  }}
                                >
                                  {a.name}
                                </td>
                                <td
                                  className="px-3 py-3"
                                  data-field="trackingId"
                                  data-value={a.trackingId}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setPayoutDialog({ kind: "affiliate", row: a })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setPayoutDialog({ kind: "affiliate", row: a });
                                    }
                                  }}
                                >
                                  <code className="text-xs bg-muted/40 px-1.5 py-0.5 rounded font-mono">{a.trackingId}</code>
                                </td>
                                <td
                                  className="px-3 py-3 text-muted-foreground whitespace-nowrap"
                                  data-field="joiningDate"
                                  data-value={a.joiningDate}
                                >
                                  {a.joiningDate}
                                </td>
                                <td
                                  className="px-3 py-3 text-right font-medium text-violet-600 dark:text-violet-400 tabular-nums"
                                  data-field="profitShare"
                                  data-value={a.profitShare}
                                >
                                  {a.profitShare}
                                </td>
                                <td
                                  className="px-3 py-3 text-right tabular-nums font-medium"
                                  data-field="totalEarnings"
                                  data-value={a.totalEarnings}
                                >
                                  {a.totalEarnings}
                                </td>
                                <td
                                  className="px-3 py-3 text-muted-foreground whitespace-nowrap"
                                  data-field="lastPayoutDate"
                                  data-value={a.lastPayoutDate}
                                >
                                  {a.lastPayoutDate}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const tr = (e.currentTarget as HTMLButtonElement).closest("tr");
                                      const raw = tr?.getAttribute("data-monthly-sales-json");
                                      if (raw) {
                                        const parsed = parseAffiliateSalesJson(raw);
                                        if (parsed) {
                                          setAffiliateSalesRow({ ...a, monthlySales: parsed });
                                          return;
                                        }
                                      }
                                      setAffiliateSalesRow(a);
                                    }}
                                  >
                                    <BarChart3 className="h-3.5 w-3.5" />
                                    Graph
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  <TablePaginationBar
                    page={affPage}
                    pageSize={AFFILIATE_TABLE_PAGE_SIZE}
                    total={affiliateRows.length}
                    onPageChange={setAffPage}
                  />
                </CardContent>
              </Card>
            </div>

            {/* ── White label (dummy data) ── */}
            <div>
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                White label
                <Badge variant="outline" className="text-[10px] ml-1">{whitelabelRows.length} tenants</Badge>
              </h2>
              <Card className="border-sky-500/25 bg-sky-500/[0.03]">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/50 bg-muted/30">
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">ID</th>
                          <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Name</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Users</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Profit share</th>
                          <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs">Payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {whitelabelRows
                          .slice(
                            (wlPage - 1) * WHITELABEL_TABLE_PAGE_SIZE,
                            wlPage * WHITELABEL_TABLE_PAGE_SIZE
                          )
                          .map((w) => (
                            <tr
                              key={w.id}
                              role="button"
                              tabIndex={0}
                              className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
                              onClick={() => setPayoutDialog({ kind: "whitelabel", row: w })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setPayoutDialog({ kind: "whitelabel", row: w });
                                }
                              }}
                            >
                              <td className="px-4 py-3">
                                <code className="text-xs bg-muted/40 px-1.5 py-0.5 rounded font-mono">{w.id}</code>
                              </td>
                              <td className="px-4 py-3 font-medium">{w.name}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{w.userCount.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-medium text-sky-600 dark:text-sky-400 tabular-nums">
                                {w.profitShare}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-medium">{w.payout}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <TablePaginationBar
                    page={wlPage}
                    pageSize={WHITELABEL_TABLE_PAGE_SIZE}
                    total={whitelabelRows.length}
                    onPageChange={setWlPage}
                  />
                </CardContent>
              </Card>
            </div>

          </>
        )}
      </div>

      {/* ── Affiliate / white label YTD payout dialog ── */}
      <Dialog open={payoutDialog !== null} onOpenChange={(open) => !open && setPayoutDialog(null)}>
        <DialogContent className="max-w-lg sm:max-w-xl">
          {payoutDialog && payoutDialogBreakdown && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {payoutDialog.kind === "affiliate" ? "Affiliate payouts (YTD)" : "White label payouts (YTD)"}
                </DialogTitle>
                <DialogDescription>
                  <div className="space-y-2 text-left text-sm text-muted-foreground">
                    <p>
                      {payoutDialog.kind === "affiliate" ? (
                        <>
                          <span className="font-medium text-foreground">{payoutDialog.row.name}</span>
                          <span> · </span>
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">{payoutDialog.row.trackingId}</code>
                          {/* <span className="block mt-1 text-xs">
                            {payoutDialog.row.userCount.toLocaleString()} users · payout = users × $
                            {PAYOUT_BASE_PER_USER_USD} × 30% ={" "}
                            <span className="font-medium text-foreground">{payoutDialog.row.payout}</span>
                          </span> */}
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-foreground">{payoutDialog.row.name}</span>
                          <span> · </span>
                          <code className="rounded bg-muted px-1 py-0.5 text-xs">{payoutDialog.row.id}</code>
                          {/* <span className="block mt-1 text-xs">
                            {payoutDialog.row.userCount.toLocaleString()} users · payout = users × $
                            {PAYOUT_BASE_PER_USER_USD} × 70% ={" "}
                            <span className="font-medium text-foreground">{payoutDialog.row.payout}</span>
                          </span> */}
                        </>
                      )}
                    </p>
                    {/* <p className="text-xs">
                      Monthly payouts from January through the current month. YTD total matches users × $
                      {PAYOUT_BASE_PER_USER_USD} × {payoutDialog.kind === "affiliate" ? "30%" : "70%"} × (months
                      elapsed ÷ 12); the dashboard column is the full-year amount at this user count.
                    </p> */}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border bg-muted/20 px-2 pt-4 pb-2">
                <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Payout by month</p>
                <div className="h-[280px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    {(() => {
                      const lineColor =
                        payoutDialog.kind === "affiliate"
                          ? "hsl(var(--primary))"
                          : "hsl(199 89% 48%)";
                      return (
                        <LineChart
                          data={payoutDialogBreakdown.chartData}
                          margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="hsl(var(--border))"
                            strokeOpacity={0.6}
                            vertical={false}
                          />
                          <XAxis
                            dataKey="month"
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            className="text-muted-foreground"
                          />
                          <YAxis
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            className="text-muted-foreground"
                            tickFormatter={(v) =>
                              v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `$${v}`
                            }
                            width={48}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: 12,
                            }}
                            formatter={(value: number) => [formatUsd0(value), "Payout"]}
                            labelFormatter={(_, payload) =>
                              payload?.[0]?.payload?.fullMonth ?? ""
                            }
                          />
                          <Line
                            type="monotone"
                            dataKey="amount"
                            name="Payout"
                            stroke={lineColor}
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "hsl(var(--background))", stroke: lineColor, strokeWidth: 2 }}
                            activeDot={{ r: 6, fill: lineColor, stroke: "hsl(var(--background))", strokeWidth: 2 }}
                          />
                        </LineChart>
                      );
                    })()}
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-sm font-semibold flex justify-between gap-2 border-t pt-3">
                <span>Total (Jan → {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })})</span>
                <span className="tabular-nums">{formatUsd0(payoutDialogBreakdown.total)}</span>
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Affiliate total sales (demo chart; Y-axis from data) ── */}
      <Dialog open={affiliateSalesRow !== null} onOpenChange={(open) => !open && setAffiliateSalesRow(null)}>
        <DialogContent className="max-w-lg sm:max-w-xl">
          {affiliateSalesRow && (() => {
            const affiliateChartTotalUnits = affiliateSalesRow.monthlySales.reduce((s, p) => s + p.sales, 0);
            const affiliateChartRevenueUsd = affiliateChartTotalUnits * PAYOUT_BASE_PER_USER_USD;
            const affiliateChartMaxBar = affiliateSalesRow.monthlySales.reduce((m, p) => Math.max(m, p.sales), 0);
            const affiliateChartYMax = Math.max(8, Math.ceil(affiliateChartMaxBar * 1.12));
            const affiliateChartPeriodEnd =
              affiliateSalesRow.monthlySales[affiliateSalesRow.monthlySales.length - 1]?.fullLabel ?? "";
            return (
            <>
              <DialogHeader>
                <DialogTitle>Total sales</DialogTitle>
                <DialogDescription className="text-left space-y-1">
                  <span className="font-medium text-foreground">{affiliateSalesRow.name}</span>
                </DialogDescription>
              </DialogHeader>
              <div
                className="h-[300px] w-full min-w-0 rounded-lg border bg-muted/10 px-1 pt-2"
                data-chart="affiliate-sales"
                data-affiliate-id={affiliateSalesRow.id}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={affiliateSalesRow.monthlySales}
                    margin={{ top: 12, right: 12, left: 4, bottom: 28 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                      angle={-25}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis
                      domain={[0, affiliateChartYMax]}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      className="text-muted-foreground"
                      width={44}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const row = payload[0].payload as AffiliateSalesPoint;
                        const daySales = Number(payload[0].value);
                        const periodUnits = affiliateSalesRow.monthlySales.reduce((s, p) => s + p.sales, 0);
                        const periodGross = periodUnits * PAYOUT_BASE_PER_USER_USD;
                        return (
                          <div
                            className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md"
                            style={{ fontSize: 12 }}
                          >
                            <p className="font-medium text-foreground">{row.fullLabel ?? row.day}</p>
                            <p className="mt-0.5 text-muted-foreground">
                              This day: <span className="tabular-nums text-foreground">{daySales}</span> units
                            </p>
                            <p className="mt-1.5 border-t border-border/60 pt-1.5 text-muted-foreground">
                              Chart period:{" "}
                              <span className="tabular-nums text-foreground">{periodUnits}</span> units ·{" "}
                              <span className="tabular-nums text-foreground">{formatUsd0(periodGross)}</span>{" "}
                              gross
                            </p>
                            <p className="mt-1 font-semibold text-foreground">
                              Profit earned: {affiliateSalesRow.totalEarnings}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 space-y-2 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
                <p className="flex justify-between gap-3 font-medium">
                  <span className="text-muted-foreground">Total units</span>
                  <span className="tabular-nums text-foreground">{affiliateChartTotalUnits.toLocaleString()}</span>
                </p>
                <p className="flex justify-between gap-3 border-t border-border/50 pt-2">
                  <span className="text-muted-foreground">
                    Period gross ({PAYOUT_BASE_PER_USER_USD.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}/unit)
                  </span>
                  <span className="tabular-nums font-medium text-foreground">{formatUsd0(affiliateChartRevenueUsd)}</span>
                </p>
                <p className="flex justify-between gap-3 border-t border-border/50 pt-2 font-semibold">
                  <span className="text-muted-foreground">Profit earned</span>
                  <span className="tabular-nums text-foreground">{affiliateSalesRow.totalEarnings}</span>
                </p>
               
              </div>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Metric Details Dialog ── */}
      <Dialog open={!!selectedMetric} onOpenChange={(open) => !open && setSelectedMetric(null)}>
        <DialogContent className="!max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold !text-start flex gap-3">
              <div className="mt-1.5">
              {selectedMetric && metricIcon(selectedMetric.key)}
              </div>
              {selectedMetric?.label} Details
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-6 space-y-8">
            {selectedMetric && selectedMetric.key.includes("profit") && (
              <div className="space-y-8">
                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="md:col-span-2 bg-zinc-900/50 border-zinc-800">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        Profit Over Time
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={[
                            { month: 'Jan', value: 120000 },
                            { month: 'Feb', value: 210000 },
                            { month: 'Mar', value: 390000 },
                            { month: 'Apr', value: 650000 },
                            { month: 'May', value: 980000 },
                            { month: 'Current', value: 1250000 },
                          ]}>
                            <defs>
                              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.2} />
                            <XAxis dataKey="month" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Profit']}
                            />
                            <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} fill="url(#profitGradient)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col justify-between gap-5">
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="pt-6">
                        <div className="text-sm text-zinc-400 mb-1">Current Month</div>
                        <div className="text-2xl font-bold text-emerald-400">$270,000</div>
                        <div className="text-xs text-emerald-500 mt-1 flex items-center">
                          <TrendingUp className="h-3 w-3 mr-1" /> +12.5% vs last month
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="pt-6">
                        <div className="text-sm text-zinc-400 mb-1">Avg. Daily Profit</div>
                        <div className="text-2xl font-bold text-zinc-100">$8,920</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardContent className="pt-6">
                        <div className="text-sm text-zinc-400 mb-1">Profit Margin</div>
                        <div className="text-2xl font-bold text-zinc-100">68%</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {selectedMetric && selectedMetric.key.includes("revenue") && (
              <div className="space-y-8">
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader>
                      <CardTitle className="text-lg">Revenue Sources</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px] w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'License Sales', value: 1400000 },
                                { name: 'Subscriptions', value: 450000 },
                                { name: 'API Access', value: 180000 },
                                { name: 'Enterprise', value: 70000 },
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={100}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {[
                                '#6366f1', // Indigo
                                '#8b5cf6', // Violet
                                '#ec4899', // Pink
                                '#06b6d4', // Cyan
                              ].map((color, index) => (
                                <Cell key={`cell-${index}`} fill={color} stroke="none" />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                              formatter={(value: number) => `$${value.toLocaleString()}`}
                            />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader>
                      <CardTitle className="text-lg">Monthly Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                            { month: 'Jan', value: 120000 },
                            { month: 'Feb', value: 180000 },
                            { month: 'Mar', value: 240000 },
                            { month: 'Apr', value: 390000 },
                            { month: 'May', value: 520000 },
                            { month: 'Jun', value: 650000 },
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.2} vertical={false} />
                            <XAxis dataKey="month" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                            <Tooltip 
                              cursor={{ fill: '#27272a' }}
                              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                            />
                            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader><CardTitle className="text-sm">Top Regions</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { region: 'USA', val: '$780k', pct: 37 },
                        { region: 'India', val: '$420k', pct: 20 },
                        { region: 'UK', val: '$310k', pct: 15 },
                        { region: 'UAE', val: '$240k', pct: 11 },
                        { region: 'Singapore', val: '$180k', pct: 9 },
                      ].map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-400">{r.region}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-200">{r.val}</span>
                            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500" style={{ width: `${r.pct}%` }}></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader><CardTitle className="text-sm">Recent Purchases</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      {(() => {
                        const licenseTypes = ['Pro License', 'Basic License', 'Pro License', 'Institutional License'];
                        const actions = ['purchased', 'purchased', 'upgraded to', 'purchased'];
                        const realNames = displaySubscribers.slice(0, 2).map((s) => s.name);
                        const fallbacks = ['Carlos Mendes', 'Ahmed Hassan', 'Luca Romano', 'Sarah Chen'];
                        return Array.from({ length: 4 }, (_, i) => ({
                          name: realNames[i] ?? fallbacks[i],
                          action: `${actions[i]} ${licenseTypes[i]}`,
                          isReal: i < realNames.length,
                        }));
                      })().map((item, i) => {
                        const timeLabel = item.isReal && displaySubscribers[i]
                          ? formatPublicSubscriberJoinedDate(subscriberJoinMeta[i] ?? DEFAULT_PUBLIC_SUB_JOIN_META, tz)
                          : ['2m ago', '15m ago', '1h ago', '2h ago'][i];
                        return (
                          <div key={i} className="flex flex-col gap-0.5 text-sm border-b border-zinc-800/50 last:border-0 pb-3 last:pb-0">
                            <div className="font-medium text-zinc-200 flex items-center gap-1.5">
                              {item.isReal && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />}
                              {item.name}
                            </div>
                            <div className="text-xs text-zinc-500 flex justify-between">
                              <span>{item.action}</span>
                              <span>{timeLabel}</span>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader><CardTitle className="text-sm">License Distribution</CardTitle></CardHeader>
                    <CardContent className="space-y-4 pt-2">
                      {[
                        { type: 'Basic', count: 520, color: 'bg-zinc-500' },
                        { type: 'Pro', count: 410, color: 'bg-indigo-500' },
                        { type: 'Institutional', count: 270, color: 'bg-purple-500' },
                      ].map((l, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-xs text-zinc-400">
                            <span>{l.type}</span>
                            <span>{l.count} users</span>
                          </div>
                          <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full ${l.color}`} style={{ width: `${(l.count / 1200) * 100}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {selectedMetric && selectedMetric.key.includes("user") && (
              <div className="space-y-8">
                <Card className="bg-zinc-900/50 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-4 w-4 text-sky-500" />
                      User Growth
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[
                          { month: 'Jan', users: 120 },
                          { month: 'Feb', users: 250 },
                          { month: 'Mar', users: 430 },
                          { month: 'Apr', users: 710 },
                          { month: 'May', users: 980 },
                          { month: 'Current', users: 1200 },
                        ]}>
                          <defs>
                            <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.2} />
                          <XAxis dataKey="month" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                          />
                          <Area type="monotone" dataKey="users" stroke="#0ea5e9" strokeWidth={3} fill="url(#userGradient)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-3 gap-6">
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader><CardTitle className="text-sm">Users by Region</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { region: 'USA', count: 380 },
                        { region: 'India', count: 290 },
                        { region: 'Europe', count: 240 },
                        { region: 'Middle East', count: 160 },
                        { region: 'Asia Pacific', count: 130 },
                      ].map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-400">{r.region}</span>
                          <span className="font-medium text-zinc-200">{r.count}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader><CardTitle className="text-sm">User Activity</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                        <div className="flex items-center gap-3">
                          <Activity className="h-4 w-4 text-sky-500" />
                          <span className="text-sm text-zinc-400">Daily Active</span>
                        </div>
                        <span className="font-bold text-white">740</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                        <div className="flex items-center gap-3">
                          <Clock className="h-4 w-4 text-sky-500" />
                          <span className="text-sm text-zinc-400">Avg Session</span>
                        </div>
                        <span className="font-bold text-white">18 min</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                        <div className="flex items-center gap-3">
                          <Zap className="h-4 w-4 text-sky-500" />
                          <span className="text-sm text-zinc-400">Trades/User</span>
                        </div>
                        <span className="font-bold text-white">12/day</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader><CardTitle className="text-sm flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> Live Users</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      {(() => {
                        const liveActions = ['executing trade', 'viewing strategy', 'placing order', 'reviewing signals', 'analyzing charts', 'checking portfolio'];
                        const fallbacks = ['Ethan Walker', 'Arjun Mehta', 'Sofia Martinez', 'Luca Romano'];
                        const pool = displaySubscribers.length > 0
                          ? displaySubscribers.slice(0, Math.max(4, displaySubscribers.length)).map((s, i) => ({
                              name: s.name,
                              action: liveActions[i % liveActions.length],
                              isReal: true,
                            }))
                          : fallbacks.map((name, i) => ({ name, action: liveActions[i], isReal: false }));
                        return pool.slice(0, 6);
                      })().map((u, i) => (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
                            {u.name.split(' ').map((n: string) => n[0]).join('')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-zinc-200 flex items-center gap-1.5 truncate">
                              {u.name}
                              {u.isReal && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />}
                            </div>
                            <div className="text-xs text-zinc-500">{u.action}</div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {selectedMetric && (selectedMetric.key.includes("accuracy") || selectedMetric.key.includes("signal")) && (
              <div className="space-y-8">
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="bg-zinc-900/50 border-zinc-800">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Target className="h-4 w-4 text-amber-500" />
                        Win Rate Consistency
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                            { period: '1 week', rate: 92 },
                            { period: '1 month', rate: 93.5 },
                            { period: '3 months', rate: 94 },
                            { period: 'All time', rate: 94 },
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.2} vertical={false} />
                            <XAxis dataKey="period" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis domain={[80, 100]} stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                            <Tooltip 
                              cursor={{ fill: '#27272a' }}
                              contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
                              formatter={(value: number) => [`${value}%`, 'Win Rate']}
                            />
                            <Bar dataKey="rate" fill="#f59e0b" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#fbbf24', fontSize: 12, formatter: (v: number) => `${v}%` }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-6">
                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardHeader><CardTitle className="text-sm">Accuracy by Market</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        {[
                          { market: 'US Stocks', acc: 95 },
                          { market: 'Crypto', acc: 92 },
                          { market: 'Forex', acc: 93 },
                          { market: 'Options', acc: 94 },
                        ].map((m, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-zinc-300">{m.market}</span>
                              <span className="font-bold text-amber-400">{m.acc}%</span>
                            </div>
                            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500" style={{ width: `${m.acc}%` }}></div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-900/50 border-zinc-800">
                      <CardHeader><CardTitle className="text-sm">Strategy Accuracy</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {[
                          { strat: 'Momentum AI', acc: 95 },
                          { strat: 'Breakout AI', acc: 94 },
                          { strat: 'Scalping AI', acc: 93 },
                          { strat: 'Mean Reversion', acc: 92 },
                        ].map((s, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-zinc-900 rounded-lg border border-zinc-800/50">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                              <span className="text-sm text-zinc-300">{s.strat}</span>
                            </div>
                            <span className="text-sm font-bold text-white">{s.acc}%</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
