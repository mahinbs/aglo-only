import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, PlusCircle, Save, Trash2, Pencil, ChevronDown, ChevronUp, BarChart3, TrendingUp, Activity, LayoutDashboard, Users, Globe, ChevronLeft, ChevronRight, Search, Link2 } from "lucide-react";
import {
  isValidAffiliateJoinDate,
  type PublicDashboardAffiliateSeed,
} from "@/lib/publicDashboardAffiliateStorage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const CHART_TYPES = ["area", "line", "bar"] as const;
type ChartType = (typeof CHART_TYPES)[number];
const SUB_PAGE_SIZE = 10;

interface Subscriber {
  id: string;
  name: string;
  country: string;
  email: string | null;
  payment_id: string | null;
  subscribed_at: string;
}

interface ChartPoint { date: string; value: number }

interface Metric {
  id: string;
  key: string;
  label: string;
  value: string;
  unit: string | null;
  description: string | null;
  sort_order: number | null;
  chart_type: ChartType | null;
  chart_data: ChartPoint[] | null;
}

/** Deterministic seeded-random in [-1,1] */
function seededRand(seed: number) {
  const x = Math.sin(seed + 1) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Auto-generate 7 per-day data points (each bar = that day's activity, not cumulative).
 *  Previous 6 days are stable (seeded). Today's bar changes each calendar day. */
function autoGenPoints(key: string, currentValue: number): ChartPoint[] {
  const keySeed = key.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const today = new Date();
  const dailyBase = currentValue / 30;
  const todaySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const daySeed = i < 6 ? keySeed + i * 31 + 7777 : keySeed + todaySeed;
    const factor = 1 + seededRand(daySeed) * 0.45;
    const value = Math.max(0, Number((dailyBase * factor).toFixed(currentValue < 100 ? 1 : 0)));
    return { date: label, value };
  });
}

function parseNumeric(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const DEFAULT_SALES_WEIGHTS = [20, 24, 18, 28, 26, 22, 30, 24];

function parseSalesWeightsInput(s: string): number[] {
  const parts = s
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((x) => Math.max(0, Number(x) || 0));
  if (parts.length === 0) return [...DEFAULT_SALES_WEIGHTS];
  return Array.from({ length: 8 }, (_, i) => parts[i] ?? DEFAULT_SALES_WEIGHTS[i] ?? 1);
}

function formatAffiliatePayoutPreview(userCount: number, profitShare: string): string {
  const p = profitShare.trim();
  const share = p === "70%" ? 0.7 : p === "50%" ? 0.5 : 0.3;
  const n = Math.round(userCount * 49 * share);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const AFF_DATE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

function toAffiliateDisplayDateFromInput(inputDate: string): string {
  const m = inputDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${String(day).padStart(2, "0")} ${AFF_DATE_MONTHS[month - 1]} ${year}`;
}

function toDateInputValue(displayDate: string): string {
  const m = displayDate.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return "";
  const day = Number(m[1]);
  const mon = m[2][0].toUpperCase() + m[2].slice(1).toLowerCase();
  const year = Number(m[3]);
  const monthIdx = AFF_DATE_MONTHS.indexOf(mon as (typeof AFF_DATE_MONTHS)[number]);
  if (monthIdx < 0) return "";
  return `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

export default function AdminPublicDashboardPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newMetric, setNewMetric] = useState<Partial<Metric>>({
    key: "", label: "", value: "", unit: "", description: "", chart_type: "area",
  });

  // Subscribers state
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [subPage, setSubPage] = useState(1);
  const [subSearch, setSubSearch] = useState("");
  const [subSaving, setSubSaving] = useState(false);
  const [newSub, setNewSub] = useState({ name: "", country: "", email: "", payment_id: "", subscribed_at: "" });
  const [editingSub, setEditingSub] = useState<Subscriber | null>(null);
  const [editForm, setEditForm] = useState({ name: "", country: "", email: "", payment_id: "", subscribed_at: "" });

  const [customAffiliates, setCustomAffiliates] = useState<PublicDashboardAffiliateSeed[]>([]);
  const [affLoading, setAffLoading] = useState(true);
  const [affSaving, setAffSaving] = useState(false);
  const [newAffiliate, setNewAffiliate] = useState({
    name: "",
    trackingId: "",
    userCount: "",
    profitShare: "30%",
    joiningDate: "",
    lastPayoutDate: "",
    salesWeights: "",
  });

  const loadAffiliates = async () => {
    try {
      setAffLoading(true);
      const { data, error } = await (supabase as any)
        .from("public_dashboard_affiliates")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows: PublicDashboardAffiliateSeed[] = ((data as any[]) ?? []).map((r) => ({
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
      setCustomAffiliates(rows);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load affiliates");
    } finally {
      setAffLoading(false);
    }
  };

  useEffect(() => { loadAffiliates(); }, []);

  const addCustomAffiliate = async () => {
    const name = newAffiliate.name.trim();
    const trackingId = newAffiliate.trackingId.trim();
    const userCount = Math.max(0, Math.floor(parseNumeric(newAffiliate.userCount)));
    if (!name || !trackingId) {
      toast.error("Name and tracking ID are required");
      return;
    }
    if (userCount < 1) {
      toast.error("User count must be at least 1");
      return;
    }
    const joiningDate = newAffiliate.joiningDate.trim();
    const lastPayoutDate = newAffiliate.lastPayoutDate.trim();
    if (!isValidAffiliateJoinDate(joiningDate) || !isValidAffiliateJoinDate(lastPayoutDate)) {
      toast.error('Use joining and payout dates like "01 Mar 2026" (DD Mon YYYY)');
      return;
    }
    const salesWeights = parseSalesWeightsInput(newAffiliate.salesWeights);
    const profitShare = newAffiliate.profitShare.trim() || "30%";
    const payout = formatAffiliatePayoutPreview(userCount, profitShare);
    try {
      setAffSaving(true);
      const payload = {
        name,
        tracking_id: trackingId,
        user_count: userCount,
        profit_share: profitShare,
        payout,
        joining_date: joiningDate,
        total_earnings: "$0",
        last_payout_date: lastPayoutDate,
        sales_weights: salesWeights,
      };
      const { error } = await (supabase as any)
        .from("public_dashboard_affiliates")
        .insert(payload);
      if (error) throw error;
      setNewAffiliate({
        name: "",
        trackingId: "",
        userCount: "",
        profitShare: "30%",
        joiningDate: "",
        lastPayoutDate: "",
        salesWeights: "",
      });
      toast.success("Affiliate saved to db — public dashboard will use this list");
      loadAffiliates();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save affiliate");
    } finally {
      setAffSaving(false);
    }
  };

  const removeCustomAffiliate = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from("public_dashboard_affiliates")
        .delete()
        .eq("id", id);
      if (error) throw error;
      const next = customAffiliates.filter((a) => a.id !== id);
      setCustomAffiliates(next);
      toast.success(next.length === 0 ? "Restored default demo affiliates" : "Affiliate removed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove affiliate");
    }
  };

  const resetCustomAffiliates = async () => {
    if (customAffiliates.length === 0) return;
    if (!confirm("Remove all custom affiliates and restore the built-in demo list on the public dashboard?")) return;
    try {
      const { error } = await (supabase as any)
        .from("public_dashboard_affiliates")
        .delete()
        .neq("id", "");
      if (error) throw error;
      setCustomAffiliates([]);
      toast.success("Default demo affiliates restored");
    } catch (e: any) {
      toast.error(e?.message || "Failed to reset affiliates");
    }
  };

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("public_dashboard_metrics")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = ((data as any[]) || []).map((m) => ({
        ...m,
        chart_data: Array.isArray(m.chart_data) ? m.chart_data : null,
      }));
      setMetrics(rows);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMetrics(); }, []);

  const loadSubscribers = async () => {
    try {
      setSubLoading(true);
      const { data, error } = await (supabase as any)
        .from("recent_subscribers")
        .select("*")
        .order("subscribed_at", { ascending: false });
      if (error) throw error;
      setSubscribers((data as Subscriber[]) || []);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load subscribers");
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => { loadSubscribers(); }, []);

  const addSubscriber = async () => {
    if (!newSub.name.trim() || !newSub.country.trim()) {
      toast.error("Name and country are required");
      return;
    }
    try {
      setSubSaving(true);
      const payload = {
        name: newSub.name.trim(),
        country: newSub.country.trim(),
        email: newSub.email.trim() || null,
        payment_id: newSub.payment_id.trim() || null,
        subscribed_at: newSub.subscribed_at || new Date().toISOString(),
      };
      const { error } = await (supabase as any).from("recent_subscribers").insert(payload);
      if (error) throw error;
      toast.success("Subscriber added");
      setNewSub({ name: "", country: "", email: "", payment_id: "", subscribed_at: "" });
      loadSubscribers();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add subscriber");
    } finally {
      setSubSaving(false);
    }
  };

  const deleteSubscriber = async (id: string) => {
    if (!confirm("Remove this row from the members list?")) return;
    try {
      const { error } = await (supabase as any).from("recent_subscribers").delete().eq("id", id);
      if (error) throw error;
      setSubscribers(prev => prev.filter(s => s.id !== id));
      if (editingSub?.id === id) setEditingSub(null);
      toast.success("Subscriber removed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete subscriber");
    }
  };

  const openEditSubscriber = (s: Subscriber) => {
    setEditingSub(s);
    const d = new Date(s.subscribed_at);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setEditForm({ name: s.name, country: s.country, email: s.email || "", payment_id: s.payment_id || "", subscribed_at: local });
  };

  const updateSubscriber = async () => {
    if (!editingSub?.id || !editForm.name.trim() || !editForm.country.trim()) {
      toast.error("Name and country are required");
      return;
    }
    try {
      setSubSaving(true);
      const payload = {
        name: editForm.name.trim(),
        country: editForm.country.trim(),
        email: editForm.email.trim() || null,
        payment_id: editForm.payment_id.trim() || null,
        subscribed_at: editForm.subscribed_at || new Date().toISOString(),
      };
      const { error } = await (supabase as any).from("recent_subscribers").update(payload).eq("id", editingSub.id);
      if (error) throw error;
      setSubscribers(prev => prev.map(s => s.id === editingSub.id ? { ...s, ...payload } : s));
      setEditingSub(null);
      toast.success("Subscriber updated");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update subscriber");
    } finally {
      setSubSaving(false);
    }
  };

  const seedDefaults = async () => {
    try {
      const defaults = [
        { key: "profit", label: "Total Profit", value: "1250000", unit: "USD", description: "Cumulative strategy profit (simulated) since launch.", sort_order: 1, chart_type: "area" },
        { key: "revenue", label: "Total Revenue", value: "2100000", unit: "USD", description: "Total subscription & licensing revenue (simulated).", sort_order: 2, chart_type: "line" },
        { key: "users", label: "Active Users", value: "1200", unit: "", description: "Number of users currently using the platform.", sort_order: 3, chart_type: "bar" },
        { key: "accuracy", label: "Signal Accuracy", value: "94", unit: "%", description: "Backtested hit-rate on AI trading signals.", sort_order: 4, chart_type: "area" },
      ];
      const { error } = await supabase.from("public_dashboard_metrics").insert(defaults as any[]);
      if (error) throw error;
      toast.success("Default metrics created");
      loadMetrics();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create default metrics");
    }
  };

  const handleMetricChange = (id: string, field: keyof Metric, value: unknown) => {
    setMetrics((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));
  };

  const handlePointChange = (metricId: string, pointIdx: number, newValue: string) => {
    setMetrics((prev) =>
      prev.map((m) => {
        if (m.id !== metricId) return m;
        const pts = getPoints(m);
        const updated = pts.map((p, i) =>
          i === pointIdx ? { ...p, value: Number(newValue) || 0 } : p
        );
        return { ...m, chart_data: updated };
      })
    );
  };

  /** Returns existing chart_data if manually set; otherwise auto-generates per-day 7 points */
  const getPoints = (m: Metric): ChartPoint[] => {
    return autoGenPoints(m.key, parseNumeric(m.value));
  };

  const initPoints = (metricId: string) => {
    setMetrics((prev) =>
      prev.map((m) => {
        if (m.id !== metricId || Array.isArray(m.chart_data)) return m;
        return { ...m, chart_data: autoGenPoints(m.key, parseNumeric(m.value)) };
      })
    );
  };

  const saveMetrics = async () => {
    try {
      setSaving(true);
      const updates = metrics.map((m) => ({
        id: m.id,
        key: m.key,
        label: m.label,
        value: m.value,
        unit: m.unit,
        description: m.description,
        sort_order: m.sort_order,
        chart_type: m.chart_type || "area",
        chart_data: Array.isArray(m.chart_data) ? m.chart_data : null,
      }));
      const { error } = await supabase.from("public_dashboard_metrics").upsert(updates as any[], { onConflict: "id" });
      if (error) throw error;
      toast.success("Dashboard metrics saved");
      loadMetrics();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save metrics");
    } finally {
      setSaving(false);
    }
  };

  const addMetric = async () => {
    if (!newMetric.key?.trim() || !newMetric.label?.trim()) { toast.error("Key and label are required"); return; }
    try {
      const payload = {
        key: newMetric.key.trim(),
        label: newMetric.label.trim(),
        value: (newMetric.value ?? "").toString(),
        unit: (newMetric.unit ?? "").toString() || null,
        description: newMetric.description ?? null,
        sort_order: metrics.length + 1,
        chart_type: newMetric.chart_type || "area",
        chart_data: null,
      };
      const { data, error } = await supabase.from("public_dashboard_metrics").insert(payload as any).select("*").single();
      if (error) throw error;
      setMetrics((prev) => [...prev, { ...(data as any), chart_data: null }]);
      setNewMetric({ key: "", label: "", value: "", unit: "", description: "", chart_type: "area" });
      toast.success("Metric added");
    } catch (e: any) {
      toast.error(e?.message || "Failed to add metric");
    }
  };

  const deleteMetric = async (id: string) => {
    if (!confirm("Delete this metric?")) return;
    try {
      const { error } = await supabase.from("public_dashboard_metrics").delete().eq("id", id);
      if (error) throw error;
      setMetrics((prev) => prev.filter((m) => m.id !== id));
      toast.success("Metric deleted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete metric");
    }
  };

  return (
    <div className="space-y-8">
      {/* Metrics List Card */}
      <Card className="glass-panel border-white/10">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-white flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                Overview figures
              </CardTitle>
              <CardDescription className="text-zinc-400 mt-1">
                Edit headline values and chart types used on the live overview.
              </CardDescription>
            </div>
            {metrics.length === 0 && !loading && (
              <Button size="sm" onClick={seedDefaults} className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/20">
                <PlusCircle className="h-4 w-4 mr-1" /> Create default metrics
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" /> Loading metrics…
            </div>
          ) : metrics.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-white/10 rounded-xl bg-white/5">
              <p>No metrics found. Add your first metric below.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/30">
                <Table>
                  <TableHeader className="bg-white/5">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-zinc-400 font-medium">Key</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Label</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Value</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Unit</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Chart</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Description</TableHead>
                      <TableHead className="text-zinc-400 font-medium">Data</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.map((m) => {
                      const isExpanded = expandedId === m.id;
                      const pts = getPoints(m);
                      return (
                        <React.Fragment key={m.id}>
                          <TableRow className="border-white/5 hover:bg-white/5 transition-colors">
                            <TableCell className="text-xs font-mono text-zinc-500">{m.key}</TableCell>
                            <TableCell>
                              <Input
                                value={m.label}
                                onChange={(e) => handleMetricChange(m.id, "label", e.target.value)}
                                className="min-w-[120px] bg-zinc-950/50 border-white/10 h-8 text-sm focus-visible:ring-primary/50"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={m.value}
                                onChange={(e) => handleMetricChange(m.id, "value", e.target.value)}
                                className="min-w-[100px] bg-zinc-950/50 border-white/10 h-8 text-sm focus-visible:ring-primary/50"
                              />
                            </TableCell>
                            <TableCell className="w-[100px]">
                              <Input
                                value={m.unit || ""}
                                onChange={(e) => handleMetricChange(m.id, "unit", e.target.value)}
                                placeholder="Unit"
                                className="bg-zinc-950/50 border-white/10 h-8 text-sm focus-visible:ring-primary/50"
                              />
                            </TableCell>
                            <TableCell className="w-[130px]">
                              <Select
                                value={m.chart_type || "area"}
                                onValueChange={(val) => handleMetricChange(m.id, "chart_type", val)}
                              >
                                <SelectTrigger className="h-8 bg-zinc-950/50 border-white/10 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CHART_TYPES.map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">
                                      <div className="flex items-center gap-2">
                                        {t === 'area' && <Activity className="h-3 w-3 text-primary" />}
                                        {t === 'line' && <TrendingUp className="h-3 w-3 text-blue-400" />}
                                        {t === 'bar' && <BarChart3 className="h-3 w-3 text-green-400" />}
                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              <Input
                                value={m.description || ""}
                                onChange={(e) => handleMetricChange(m.id, "description", e.target.value)}
                                className="bg-zinc-950/50 border-white/10 h-8 text-sm focus-visible:ring-primary/50 truncate"
                                title={m.description || ""}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`text-xs h-8 px-2 border border-white/10 ${isExpanded ? 'bg-primary/10 text-primary border-primary/20' : 'text-zinc-400 hover:text-white'}`}
                                onClick={() => {
                                  if (!isExpanded) initPoints(m.id);
                                  setExpandedId(isExpanded ? null : m.id);
                                }}
                              >
                                {isExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                                7 days
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => deleteMetric(m.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${m.id}-points`} className="bg-white/[0.02] hover:bg-white/[0.02]">
                              <TableCell colSpan={8} className="p-0 border-b border-white/5">
                                <div className="p-4 bg-zinc-950/30 inner-shadow">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-semibold text-zinc-400 flex items-center gap-2">
                                      <Activity className="h-3 w-3 text-primary" />
                                      7-day trend data points
                                    </p>
                                    <span className="text-[10px] text-zinc-500">Auto-generated from current value if blank</span>
                                  </div>
                                  <div className="grid grid-cols-7 gap-3">
                                    {pts.map((pt, idx) => (
                                      <div key={idx} className="space-y-1.5">
                                        <p className="text-[10px] text-zinc-500 text-center uppercase tracking-wider">{pt.date}</p>
                                        <Input
                                          type="number"
                                          value={pt.value}
                                          onChange={(e) => handlePointChange(m.id, idx, e.target.value)}
                                          className="text-xs text-center px-1 h-8 bg-zinc-900 border-white/10 focus-visible:ring-primary/30"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={saveMetrics}
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                >
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving Changes…</> : <><Save className="h-4 w-4 mr-2" />Save All Changes</>}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom demo affiliates — override public dashboard affiliate table */}
      <Card className="glass-panel border-white/10">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-white flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                Public dashboard affiliates
              </CardTitle>
              <CardDescription className="text-zinc-400 mt-1">
                Add affiliates here to replace the built-in demo rows on the live dashboard. Stored in Supabase — changes are visible site-wide immediately. Open{" "}
                <code className="text-zinc-500">/admin/dashboard</code>
                {" "}or the public dashboard to see changes.
              </CardDescription>
            </div>
            {customAffiliates.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/20 text-zinc-300 hover:bg-white/10"
                onClick={resetCustomAffiliates}
              >
                Restore defaults
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {affLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> Loading affiliates…
            </div>
          ) : customAffiliates.length === 0 ? (
            <p className="text-sm text-zinc-500 border border-dashed border-white/10 rounded-xl px-4 py-6 text-center bg-white/[0.02]">
              No custom affiliates — the public dashboard shows the default 15 demo partners. Add at least one row below to override.
            </p>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/30">
              <Table>
                <TableHeader className="bg-white/5">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-zinc-400 font-medium text-xs">Name</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs">Tracking ID</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs">Users</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs">Share</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs">Payout</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs">Joined</TableHead>
                    <TableHead className="text-zinc-400 font-medium text-xs">Last payout</TableHead>
                    <TableHead className="w-[56px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customAffiliates.map((a) => (
                    <TableRow key={a.id} className="border-white/5 hover:bg-white/5 transition-colors">
                      <TableCell className="text-sm text-white font-medium">{a.name}</TableCell>
                      <TableCell>
                        <code className="text-xs font-mono text-zinc-300 bg-white/5 px-1.5 py-0.5 rounded">{a.trackingId}</code>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-zinc-400">{a.userCount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-zinc-400">{a.profitShare}</TableCell>
                      <TableCell className="text-xs tabular-nums text-zinc-300">{a.payout}</TableCell>
                      <TableCell className="text-xs text-zinc-400">{a.joiningDate}</TableCell>
                      <TableCell className="text-xs text-zinc-400">{a.lastPayoutDate}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => void removeCustomAffiliate(a.id)}
                          aria-label={`Remove ${a.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="border border-white/10 rounded-xl p-4 bg-white/[0.02] space-y-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <PlusCircle className="h-3.5 w-3.5 text-primary" /> Add affiliate
            </p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Name *</Label>
                <Input
                  value={newAffiliate.name}
                  onChange={(e) => setNewAffiliate((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Partner name"
                  className="h-8 text-sm bg-zinc-950/50 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Tracking ID *</Label>
                <Input
                  value={newAffiliate.trackingId}
                  onChange={(e) => setNewAffiliate((p) => ({ ...p, trackingId: e.target.value }))}
                  placeholder="e.g. AFF-US-01"
                  className="h-8 text-sm bg-zinc-950/50 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Referred users *</Label>
                <Input
                  type="number"
                  min={1}
                  value={newAffiliate.userCount}
                  onChange={(e) => setNewAffiliate((p) => ({ ...p, userCount: e.target.value }))}
                  placeholder="e.g. 1200"
                  className="h-8 text-sm bg-zinc-950/50 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Profit share *</Label>
                <Select
                  value={newAffiliate.profitShare}
                  onValueChange={(v) => setNewAffiliate((p) => ({ ...p, profitShare: v }))}
                >
                  <SelectTrigger className="h-8 bg-zinc-950/50 border-white/10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30%">30%</SelectItem>
                    <SelectItem value="50%">50%</SelectItem>
                    <SelectItem value="70%">70%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Joining date *</Label>
                <Input
                  type="date"
                  value={toDateInputValue(newAffiliate.joiningDate)}
                  onChange={(e) =>
                    setNewAffiliate((p) => ({
                      ...p,
                      joiningDate: toAffiliateDisplayDateFromInput(e.target.value),
                    }))
                  }
                  className="h-8 text-sm bg-zinc-950/50 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Last payout date *</Label>
                <Input
                  type="date"
                  value={toDateInputValue(newAffiliate.lastPayoutDate)}
                  onChange={(e) =>
                    setNewAffiliate((p) => ({
                      ...p,
                      lastPayoutDate: toAffiliateDisplayDateFromInput(e.target.value),
                    }))
                  }
                  className="h-8 text-sm bg-zinc-950/50 border-white/10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500">Sales chart weights (optional)</Label>
              <Input
                value={newAffiliate.salesWeights}
                onChange={(e) => setNewAffiliate((p) => ({ ...p, salesWeights: e.target.value }))}
                placeholder="Eight comma-separated numbers, e.g. 28, 34, 22, 41, 36, 19, 44, 38"
                className="h-8 text-sm bg-zinc-950/50 border-white/10 font-mono"
              />
              <p className="text-[10px] text-zinc-500">Shapes the demo bar chart; totals still follow $49/unit × share. Leave blank for defaults.</p>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void addCustomAffiliate()}
                disabled={affSaving}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
              >
                {affSaving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                ) : (
                  <><PlusCircle className="h-4 w-4 mr-2" /> Add affiliate</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Subscribers Management Card */}
      <Card className="glass-panel border-white/10">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Recent Subscribers
              </CardTitle>
              <CardDescription className="text-zinc-400 mt-1">
                Manage the recent members list on the live overview.
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Search name, country, email…"
                value={subSearch}
                onChange={(e) => { setSubSearch(e.target.value); setSubPage(1); }}
                className="pl-8 h-8 text-sm bg-zinc-950/50 border-white/10 w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {subLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-primary" /> Loading subscribers…
            </div>
          ) : (() => {
            const filtered = subscribers.filter(s => {
              const q = subSearch.toLowerCase();
              return !q || s.name.toLowerCase().includes(q) || s.country.toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
            });
            const totalPages = Math.ceil(filtered.length / SUB_PAGE_SIZE);
            const pageSlice = filtered.slice((subPage - 1) * SUB_PAGE_SIZE, subPage * SUB_PAGE_SIZE);
            return (
              <>
                <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/30">
                  <Table>
                    <TableHeader className="bg-white/5">
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="text-zinc-400 font-medium text-xs">#</TableHead>
                        <TableHead className="text-zinc-400 font-medium text-xs">Name</TableHead>
                        <TableHead className="text-zinc-400 font-medium text-xs">Country</TableHead>
                        <TableHead className="text-zinc-400 font-medium text-xs">Email</TableHead>
                        <TableHead className="text-zinc-400 font-medium text-xs">Payment ID</TableHead>
                        <TableHead className="text-zinc-400 font-medium text-xs">Joined</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageSlice.map((s, idx) => {
                        const globalIdx = (subPage - 1) * SUB_PAGE_SIZE + idx + 1;
                        return (
                          <TableRow key={s.id} className="border-white/5 hover:bg-white/5 transition-colors">
                            <TableCell className="text-xs text-zinc-500">{globalIdx}</TableCell>
                            <TableCell className="font-medium text-sm text-white">{s.name}</TableCell>
                            <TableCell>
                              {(() => {
                                const flag = countryFlag(s.country);
                                return (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                                    {flag ? (
                                      <span className="text-base leading-none">{flag}</span>
                                    ) : (
                                      <Globe className="h-3 w-3" />
                                    )}
                                    <span>{s.country}</span>
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-xs text-zinc-400">{s.email || "—"}</TableCell>
                            <TableCell>
                              <code className="text-xs font-mono text-zinc-300 bg-white/5 px-1.5 py-0.5 rounded">
                                {s.payment_id || "—"}
                              </code>
                            </TableCell>
                            <TableCell className="text-xs text-zinc-400">
                              {new Date(s.subscribed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-zinc-500 hover:text-primary hover:bg-primary/10"
                                  onClick={() => openEditSubscriber(s)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                                  onClick={() => deleteSubscriber(s.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {pageSlice.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-zinc-500 py-8 text-sm">
                            No subscribers found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-zinc-500">
                      {(subPage - 1) * SUB_PAGE_SIZE + 1}–{Math.min(subPage * SUB_PAGE_SIZE, filtered.length)} of {filtered.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 border border-white/10" disabled={subPage === 1} onClick={() => setSubPage(p => p - 1)}>
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <span className="text-xs px-2 text-zinc-400">{subPage} / {totalPages}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 border border-white/10" disabled={subPage === totalPages} onClick={() => setSubPage(p => p + 1)}>
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Add new subscriber form */}
          <div className="border border-white/10 rounded-xl p-4 bg-white/[0.02] space-y-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <PlusCircle className="h-3.5 w-3.5 text-primary" /> Add New Subscriber
            </p>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Name *</Label>
                <Input value={newSub.name} onChange={e => setNewSub(p => ({ ...p, name: e.target.value }))} placeholder="Full name" className="h-8 text-sm bg-zinc-950/50 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Country *</Label>
                <Input value={newSub.country} onChange={e => setNewSub(p => ({ ...p, country: e.target.value }))} placeholder="e.g. India" className="h-8 text-sm bg-zinc-950/50 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Email</Label>
                <Input value={newSub.email} onChange={e => setNewSub(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className="h-8 text-sm bg-zinc-950/50 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Payment ID</Label>
                <Input value={newSub.payment_id} onChange={e => setNewSub(p => ({ ...p, payment_id: e.target.value }))} placeholder="e.g. TXN-1234" className="h-8 text-sm bg-zinc-950/50 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Date (optional)</Label>
                <Input type="datetime-local" value={newSub.subscribed_at} onChange={e => setNewSub(p => ({ ...p, subscribed_at: e.target.value }))} className="h-8 text-sm bg-zinc-950/50 border-white/10" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={addSubscriber} disabled={subSaving} className="bg-white/10 hover:bg-white/20 text-white border border-white/10">
                {subSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Adding…</> : <><PlusCircle className="h-4 w-4 mr-2" />Add Subscriber</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Subscriber Dialog */}
      <Dialog open={!!editingSub} onOpenChange={(o) => !o && setEditingSub(null)}>
        <DialogContent className="max-w-lg bg-zinc-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Edit Subscriber</DialogTitle>
          </DialogHeader>
          {editingSub && (
            <div className="grid gap-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Name *</Label>
                <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" className="h-9 bg-zinc-900 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Country *</Label>
                <Input value={editForm.country} onChange={e => setEditForm(p => ({ ...p, country: e.target.value }))} placeholder="e.g. India" className="h-9 bg-zinc-900 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Email</Label>
                <Input value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" className="h-9 bg-zinc-900 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Payment ID</Label>
                <Input value={editForm.payment_id} onChange={e => setEditForm(p => ({ ...p, payment_id: e.target.value }))} placeholder="e.g. TXN-1234" className="h-9 bg-zinc-900 border-white/10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-zinc-500">Joined Date</Label>
                <Input type="datetime-local" value={editForm.subscribed_at} onChange={e => setEditForm(p => ({ ...p, subscribed_at: e.target.value }))} className="h-9 bg-zinc-900 border-white/10" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSub(null)} className="border-white/20">
              Cancel
            </Button>
            <Button onClick={updateSubscriber} disabled={subSaving} className="bg-primary text-primary-foreground">
              {subSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Metric Card */}
      <Card className="glass-panel border-white/10">
        <CardHeader>
          <CardTitle className="text-xl text-white flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            Add New Metric
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Create a new key performance indicator for the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Metric Key</Label>
              <Input
                value={newMetric.key || ""}
                onChange={(e) => setNewMetric((p) => ({ ...p, key: e.target.value }))}
                placeholder="e.g. total_profit"
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Display Label</Label>
              <Input
                value={newMetric.label || ""}
                onChange={(e) => setNewMetric((p) => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Total Profit"
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Current Value</Label>
              <Input
                value={newMetric.value || ""}
                onChange={(e) => setNewMetric((p) => ({ ...p, value: e.target.value }))}
                placeholder="e.g. 1250000"
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Unit</Label>
              <Input
                value={newMetric.unit || ""}
                onChange={(e) => setNewMetric((p) => ({ ...p, unit: e.target.value }))}
                placeholder="e.g. USD, %, Users"
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Chart Type</Label>
              <Select
                value={newMetric.chart_type || "area"}
                onValueChange={(val) => setNewMetric((p) => ({ ...p, chart_type: val as ChartType }))}
              >
                <SelectTrigger className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      <div className="flex items-center gap-2">
                        {t === 'area' && <Activity className="h-4 w-4 text-primary" />}
                        {t === 'line' && <TrendingUp className="h-4 w-4 text-blue-400" />}
                        {t === 'bar' && <BarChart3 className="h-4 w-4 text-green-400" />}
                        <span className="capitalize">{t} Chart</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Description</Label>
              <Input
                value={newMetric.description || ""}
                onChange={(e) => setNewMetric((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short description shown on hover"
                className="bg-zinc-950/50 border-white/10 focus-visible:ring-primary/50"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={addMetric}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/10"
            >
              <PlusCircle className="h-4 w-4 mr-2" /> Add Metric
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
