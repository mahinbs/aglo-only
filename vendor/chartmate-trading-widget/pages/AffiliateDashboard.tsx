import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Link2, Users, FileText, DollarSign, Percent, Copy, Check, LogOut, UserPlus, Bell, User, CreditCard, FileCheck, CheckCircle2, AlertCircle, ChevronRight, Phone, Activity, Zap, TrendingUp, LineChart, Clock, Video, Globe, MapPin, Shield } from "lucide-react";
import { toast } from "sonner";
import { describeReferredUserSubscription, planIdToDisplayName } from "@/lib/referredUserPlanDisplay";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { format, subDays, startOfDay, isSameDay } from "date-fns";

interface VisitorRow {
  visitor_ip: string;
  visited_at: string;
  device_type?: string;
  browser?: string;
  city?: string;
  region?: string;
  country?: string;
  country_name?: string;
  country_code?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
}

interface MarketingResource {
  id: string;
  type: 'video' | 'script';
  title: string;
  content_url?: string;
  content_text?: string;
  created_at: string;
}

interface AffiliateStats {
  id: string;
  code: string;
  name: string;
  email: string;
  commission_percent: number;
  is_active: boolean;
  unique_visitors: number;
  visitor_rows: VisitorRow[];
  referred_signups: SignupRow[];
  form_submissions: ContactRow[];
  payments: PaymentRow[];
  total_commission_earned: number;
  paid_commission_earned: number;
  pending_commission_earned: number;
  payout_records: any[];
  active_referrals: number;
  clicks: number;
  conversions: number;
  conversion_rate: number;
  daily_stats: { date: string; clicks: number; conversions: number }[];
  phone?: string;
  pan?: string;
  gst?: string;
  payment_details?: any;
  agreement_accepted?: boolean;
  resources: MarketingResource[];
}

interface NotificationRow {
  id: string;
  type: "referral" | "conversion" | "payout" | "system";
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface SignupRow {
  user_id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  referral_code_at_signup: string | null;
  created_at: string;
  subscription?: { plan_id: string; status: string; current_period_end: string | null } | null;
}

interface ContactRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  telegram_id?: string | null;
  description?: string | null;
  referral_code?: string | null;
  created_at: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  commission_amount: number;
  status: string;
  payout_status?: "pending" | "paid";
  created_at: string;
  plan_id?: string | null;
}

function toTitle(input?: string | null): string {
  if (!input) return "Unknown";
  return input
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => (w ? `${w[0].toUpperCase()}${w.slice(1).toLowerCase()}` : w))
    .join(" ");
}

function countryCodeToFlag(countryCode?: string | null): string {
  const cc = (countryCode || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0)));
}

function getSourceLabel(row: VisitorRow): string {
  const raw = (row.utm_source || "").trim().toLowerCase();
  const ref = (row.referrer || "").trim().toLowerCase();
  const ua = (row.browser || "").trim().toLowerCase();
  if (raw) return toTitle(raw);
  if (ua.includes("whatsapp")) return "WhatsApp";
  if (ua.includes("telegram")) return "Telegram";
  if (ua.includes("instagram")) return "Instagram";
  if (!ref) return "Direct";
  try {
    const host = new URL(row.referrer || "").hostname.replace(/^www\./, "");
    return host ? toTitle(host) : "Direct";
  } catch {
    return "Direct";
  }
}

export default function AffiliateDashboard() {
  const { user, signOut, loading: loadingAuth } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  
  // Use URL params for tab state persistence
  const activeTab = (searchParams.get("tab") as "overview" | "profile" | "notifications") || "overview";
  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
  };

  const [activeTabSecondary, setActiveTabSecondary] = useState<"visitors" | "signups" | "forms" | "payments" | "resources" | "analytics" | "attribution">("visitors");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [visitorsPage, setVisitorsPage] = useState(1);
  const [signupsPage, setSignupsPage] = useState(1);
  const [formsPage, setFormsPage] = useState(1);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const pageSize = 10;
  const [selectedForm, setSelectedForm] = useState<ContactRow | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: aff, error: affErr } = await (supabase as any)
        .from("affiliates")
        .select("id, code, name, email, phone, commission_percent, commission_type, is_active, pan, gst, payment_details, agreement_accepted, profile_completed")
        .eq("user_id", user.id)
        .maybeSingle();

      if (affErr) throw affErr;
      if (!aff) throw new Error("No affiliate record found for this account.");

      const { data: notifies } = await (supabase as any)
        .from("affiliate_notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setNotifications((notifies as NotificationRow[]) ?? []);

      const [{ data: visitors }, { data: signupsRaw }, { data: submissions }, { data: paymentsRaw }, { data: resources }, { data: payouts }] = await Promise.all([
        (supabase as any).from("affiliate_visitors").select("*").eq("affiliate_id", aff.id).order("visited_at", { ascending: false }),
        (supabase as any).from("user_signup_profiles").select("*").eq("affiliate_id", aff.id).order("created_at", { ascending: false }),
        (supabase as any).from("contact_submissions").select("*").eq("affiliate_id", aff.id).order("created_at", { ascending: false }),
        (supabase as any).from("user_payments").select("*").eq("affiliate_id", aff.id).order("created_at", { ascending: false }),
        (supabase as any).from("affiliate_marketing_resources").select("*").eq("affiliate_id", aff.id).order("created_at", { ascending: false }),
        (supabase as any).from("affiliate_payouts").select("*").eq("affiliate_id", aff.id).order("created_at", { ascending: false }),
      ]);

      const signupList = (signupsRaw ?? []) as SignupRow[];
      const userIds = signupList.map((s) => s.user_id).filter(Boolean);
      let subByUser: Record<string, { plan_id: string; status: string; current_period_end: string | null }> = {};
      if (userIds.length) {
        const { data: subs } = await (supabase as any)
          .from("user_subscriptions")
          .select("user_id, plan_id, status, current_period_end")
          .in("user_id", userIds);
        (subs ?? []).forEach((row: any) => {
          subByUser[row.user_id] = {
            plan_id: row.plan_id,
            status: row.status,
            current_period_end: row.current_period_end ?? null,
          };
        });
      }
      const signups = signupList.map((s) => ({
        ...s,
        subscription: subByUser[s.user_id] ?? null,
      }));

      const payments = (paymentsRaw ?? []) as PaymentRow[];

      const totalCommission = payments.reduce(
        (sum: number, p: PaymentRow) => sum + Number(p.commission_amount ?? 0),
        0
      );
      
      const paidCommission = payments
        .filter(p => p.payout_status === "paid")
        .reduce((sum: number, p: PaymentRow) => sum + Number(p.commission_amount ?? 0), 0);
        
      const pendingCommission = totalCommission - paidCommission;

      const activeReferralsCount = signups.filter(s => s.subscription?.status === 'active').length;
      const clicksCount = (visitors ?? []).length;
      const conversionsCount = payments.length;
      const conversionRate = clicksCount > 0 ? (conversionsCount / clicksCount) * 100 : 0;

      // Generate 30 days of daily stats for the graph
      const dailyStats = [];
      for (let i = 29; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, "MMM dd");
        
        const dayClicks = (visitors ?? []).filter(v => isSameDay(new Date(v.visited_at), date)).length;
        const dayConversions = payments.filter(p => isSameDay(new Date(p.created_at), date)).length;
        
        dailyStats.push({
          date: dateStr,
          clicks: dayClicks,
          conversions: dayConversions
        });
      }

      setStats({
        ...aff,
        unique_visitors: clicksCount,
        visitor_rows: (visitors ?? []) as VisitorRow[],
        referred_signups: signups,
        form_submissions: submissions ?? [],
        payments: payments,
        total_commission_earned: totalCommission,
        paid_commission_earned: paidCommission,
        pending_commission_earned: pendingCommission,
        payout_records: payouts ?? [],
        active_referrals: activeReferralsCount,
        clicks: clicksCount,
        conversions: conversionsCount,
        conversion_rate: conversionRate,
        daily_stats: dailyStats,
        resources: (resources as MarketingResource[]) ?? [],
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load your affiliate data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const affiliateLink = stats ? `${window.location.origin}/?ref=${encodeURIComponent(stats.code)}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(affiliateLink).then(() => {
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const clearAllNotifications = async () => {
    if (!user?.id) return;
    try {
      const { error } = await (supabase as any)
        .from("affiliate_notifications")
        .delete()
        .eq("user_id", user.id);
      
      if (error) throw error;
      toast.success("Notifications cleared");
      setNotifications([]);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.id) return;
    try {
      const { error } = await (supabase as any)
        .from("affiliate_notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      
      if (error) throw error;
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Affiliate record not found. Contact admin.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-1 sm:px-4 py-4 flex items-center justify-between gap-2 sm:gap-4 overflow-hidden">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-white truncate">Affiliate Dashboard</h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Welcome, {stats.name}</p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Temporarily hidden — affiliate "Explore Platform Features" CTA
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/home")}
              className="h-9 px-2 sm:px-3 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
            >
              <ChevronRight className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline text-xs">Explore Platform Features</span>
            </Button>
            */}
            <Button variant="ghost" size="icon" onClick={() => setActiveTab("notifications")} className="h-9 w-9 text-muted-foreground hover:text-white hover:bg-white/5 relative">
              <Bell className="h-5 w-5" />
              {notifications.filter(n => !n.is_read).length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setActiveTab("profile")} className="h-9 w-9 text-muted-foreground hover:text-white hover:bg-white/5">
              <User className="h-5 w-5" />
            </Button>
            <div className="h-6 w-[1px] bg-white/10 mx-0.5" />
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-9 px-2 sm:px-3 border-white/10 hover:bg-white/5">
              <RefreshCw className={`h-4 w-4 sm:mr-1.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline text-xs">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="h-9 px-2 sm:px-3 text-muted-foreground hover:text-white hover:bg-white/5">
              <LogOut className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline text-xs">Sign out</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-8">
          <TabsContent value="overview" className="space-y-8 mt-0">
            <Card className="glass-panel border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Link2 className="h-4 w-4 text-cyan-400" />
                  Your affiliate link
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 flex-wrap">
                  <code className="flex-1 text-sm text-cyan-300 bg-white/5 px-4 py-3 rounded-lg font-mono break-all">
                    {affiliateLink}
                  </code>
                  <Button
                    onClick={copyLink}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0"
                  >
                    {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                    {copied ? "Copied!" : "Copy link"}
                  </Button>
                </div>
                <div className="pt-6 mt-6 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">Money Received</p>
                    <p className="text-xl font-bold text-green-400">₹{stats.payout_records.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-1">Last Payout</p>
                    <p className="text-xs text-zinc-300">{stats.payout_records[0] ? format(new Date(stats.payout_records[0].created_at), 'dd MMM yyyy') : 'No payouts yet'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTabSecondary} onValueChange={(v) => setActiveTabSecondary(v as any)} className="space-y-4">
              <TabsList className="bg-white/5 border border-white/10 flex overflow-x-auto no-scrollbar whitespace-nowrap h-auto gap-1 p-1 justify-start">
                <TabsTrigger value="visitors" className="text-[10px] sm:text-xs flex items-center gap-2 px-2 sm:px-3">
                  <Users className="h-3.5 w-3.5 text-blue-400" />
                  Unique visitors ({stats.visitor_rows.length})
                </TabsTrigger>
                <TabsTrigger value="signups" className="text-[10px] sm:text-xs flex items-center gap-2 px-2 sm:px-3">
                  <UserPlus className="h-3.5 w-3.5 text-sky-400" />
                  Sign-ups ({stats.referred_signups.length})
                </TabsTrigger>
                <TabsTrigger value="resources" className="text-[10px] sm:text-xs gap-1.5 flex items-center px-2 sm:px-3">
                  <Video className="h-3.5 w-3.5 text-purple-400" />
                  <span>Marketing Resources</span>
                </TabsTrigger>
                <TabsTrigger value="analytics" className="text-[10px] sm:text-xs gap-1.5 flex items-center px-2 sm:px-3">
                  <Activity className="h-3.5 w-3.5 text-blue-400" />
                  <span>Reporting & Analytics</span>
                </TabsTrigger>
                <TabsTrigger value="attribution" className="text-[10px] sm:text-xs gap-1.5 flex items-center px-2 sm:px-3">
                  <Shield className="h-3.5 w-3.5 text-orange-400" />
                  <span>Traffic Attribution (UTM)</span>
                </TabsTrigger>
                <TabsTrigger value="forms" className="text-[10px] sm:text-xs flex items-center gap-2 px-2 sm:px-3">
                  <FileText className="h-3.5 w-3.5 text-amber-400" />
                  Forms ({stats.form_submissions.length})
                </TabsTrigger>
                <TabsTrigger value="payments" className="text-[10px] sm:text-xs gap-1.5 flex items-center px-2 sm:px-3">
                  <DollarSign className="h-3.5 w-3.5 text-green-400" />
                  <span>Money earned</span>
                </TabsTrigger>
                <TabsTrigger value="payout_records" className="text-[10px] sm:text-xs gap-1.5 flex items-center px-2 sm:px-3">
                  <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
                  <span>Money Received</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="attribution" className="mt-6 space-y-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-orange-400" />
                        Top Traffic Sources (UTM Source)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px] pt-4">
                      {(() => {
                        const counts: Record<string, number> = {};
                        stats.visitor_rows.forEach(v => {
                          const src = getSourceLabel(v);
                          counts[src] = (counts[src] || 0) + 1;
                        });
                        const data = Object.entries(counts)
                          .map(([name, value]) => ({ name, value }))
                          .sort((a,b) => b.value - a.value)
                          .slice(0, 5);
                        
                        if (data.length === 0) {
                           return <div className="h-full flex items-center justify-center text-zinc-500 text-xs italic">No UTM data recorded yet</div>;
                        }

                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} layout="vertical" margin={{ left: 30, right: 30 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={10} axisLine={false} tickLine={false} width={100} />
                              <RechartsTooltip 
                                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                itemStyle={{ color: '#f97316', fontSize: '12px' }}
                              />
                              <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-400" />
                        Active Campaigns (UTM Campaign)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px] pt-4">
                      {(() => {
                        const counts: Record<string, number> = {};
                        stats.visitor_rows.forEach(v => {
                          if (v.utm_campaign) {
                            counts[v.utm_campaign] = (counts[v.utm_campaign] || 0) + 1;
                          } else {
                            counts['No Campaign'] = (counts['No Campaign'] || 0) + 1;
                          }
                        });
                        const data = Object.entries(counts)
                          .map(([name, value]) => ({ name, value }))
                          .sort((a,b) => b.value - a.value)
                          .slice(0, 5);
                        
                        if (data.length === 0 || (data.length === 1 && data[0].name === 'No Campaign' && data[0].value === 0)) {
                           return <div className="h-full flex items-center justify-center text-zinc-500 text-xs italic">No active campaigns detected</div>;
                        }

                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} layout="vertical" margin={{ left: 30, right: 30 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={10} axisLine={false} tickLine={false} width={100} />
                              <RechartsTooltip 
                                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                itemStyle={{ color: '#eab308', fontSize: '12px' }}
                              />
                              <Bar dataKey="value" fill="#eab308" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </div>

                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Globe className="h-4 w-4 text-cyan-400" />
                      Referring Domains
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10 px-6">Domain</TableHead>
                          <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10 text-right px-6">Visits</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const domains: Record<string, number> = {};
                          stats.visitor_rows.forEach(v => {
                            if (v.referrer) {
                              try {
                                const url = new URL(v.referrer);
                                domains[url.hostname] = (domains[url.hostname] || 0) + 1;
                              } catch {
                                domains[v.referrer] = (domains[v.referrer] || 0) + 1;
                              }
                            } else {
                              domains['Direct / Bookmark'] = (domains['Direct / Bookmark'] || 0) + 1;
                            }
                          });
                          
                          return Object.entries(domains)
                            .sort((a,b) => b[1] - a[1])
                            .slice(0, 10)
                            .map(([domain, count], i) => (
                              <TableRow key={i} className="border-white/5 hover:bg-white/5 h-12 transition-colors">
                                <TableCell className="text-xs text-zinc-300 px-6">{domain}</TableCell>
                                <TableCell className="text-right font-mono text-zinc-400 px-6 font-bold">{count}</TableCell>
                              </TableRow>
                            ));
                        })()}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="visitors" className="space-y-4">
                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-400" />
                      Distinct IPs from your link ({stats.visitor_rows.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {stats.visitor_rows.length === 0 ? (
                      <p className="text-muted-foreground text-sm py-6 text-center">
                        No visitors recorded yet. Share your link to start tracking.
                      </p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableHead className="text-muted-foreground">IP address</TableHead>
                              <TableHead className="text-muted-foreground">Region</TableHead>
                              <TableHead className="text-muted-foreground">Country</TableHead>
                              <TableHead className="text-muted-foreground">Source</TableHead>
                              <TableHead className="text-muted-foreground">Campaign</TableHead>
                              <TableHead className="text-muted-foreground">First visited</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.visitor_rows
                              .slice((visitorsPage - 1) * pageSize, visitorsPage * pageSize)
                              .map((v, idx) => (
                                <TableRow key={`${v.visitor_ip}-${idx}`} className="border-white/5 hover:bg-white/5">
                                  <TableCell className="font-mono text-sm text-zinc-400">{v.visitor_ip}</TableCell>
                                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{v.region || "—"}</TableCell>
                                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">
                                    <span className="inline-flex items-center gap-2">
                                      <span>{countryCodeToFlag(v.country_code)}</span>
                                      <span>{v.country_code || v.country_name || v.country || "—"}</span>
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-zinc-500 text-xs">{getSourceLabel(v)}</TableCell>
                                  <TableCell className="text-zinc-500 text-xs">{v.utm_campaign || "—"}</TableCell>
                                  <TableCell className="text-zinc-500 text-xs">
                                    {new Date(v.visited_at).toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                        {stats.visitor_rows.length > pageSize && (
                          <div className="flex justify-end items-center gap-3 pt-4 text-xs text-muted-foreground">
                            <span>
                              Page {visitorsPage} of {Math.ceil(stats.visitor_rows.length / pageSize)}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={visitorsPage === 1}
                                onClick={() => setVisitorsPage((p) => Math.max(1, p - 1))}
                                className="h-7 px-3 border-white/10"
                              >
                                Prev
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={visitorsPage * pageSize >= stats.visitor_rows.length}
                                onClick={() =>
                                  setVisitorsPage((p) =>
                                    p * pageSize >= stats.visitor_rows.length ? p : p + 1,
                                  )
                                }
                                className="h-7 px-3 border-white/10"
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="signups" className="space-y-4">
                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-sky-400" />
                      Users who registered via your link ({stats.referred_signups.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {stats.referred_signups.length === 0 ? (
                      <p className="text-muted-foreground text-sm py-6 text-center">
                        No sign-ups yet. When someone creates an account after using your link, they appear here.
                      </p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableHead className="text-muted-foreground">Name</TableHead>
                              <TableHead className="text-muted-foreground">Email</TableHead>
                              <TableHead className="text-muted-foreground">Region</TableHead>
                              <TableHead className="text-muted-foreground">Country</TableHead>
                              <TableHead className="text-muted-foreground">Billing</TableHead>
                              <TableHead className="text-muted-foreground">Plan</TableHead>
                              <TableHead className="text-muted-foreground">Signed up</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.referred_signups
                              .slice((signupsPage - 1) * pageSize, signupsPage * pageSize)
                              .map((s) => {
                                const d = describeReferredUserSubscription(s.subscription ?? null);
                                return (
                                <TableRow key={s.user_id} className="border-white/5 hover:bg-white/5">
                                  <TableCell className="text-zinc-300">{s.full_name || "—"}</TableCell>
                                  <TableCell className="text-zinc-400 text-sm">{s.email || "—"}</TableCell>
                                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{s.region || "—"}</TableCell>
                                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{s.country || "—"}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={d.billing === "Paid" ? "default" : "secondary"}
                                      className="border-white/10 text-xs"
                                    >
                                      {d.billing}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-zinc-400 text-xs max-w-[180px]">{d.planLine}</TableCell>
                                  <TableCell className="text-zinc-500 text-xs">
                                    {new Date(s.created_at).toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              );})}
                          </TableBody>
                        </Table>
                        {stats.referred_signups.length > pageSize && (
                          <div className="flex justify-end items-center gap-3 pt-4 text-xs text-muted-foreground">
                            <span>
                              Page {signupsPage} of {Math.ceil(stats.referred_signups.length / pageSize)}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={signupsPage === 1}
                                onClick={() => setSignupsPage((p) => Math.max(1, p - 1))}
                                className="h-7 px-3 border-white/10"
                              >
                                Prev
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={signupsPage * pageSize >= stats.referred_signups.length}
                                onClick={() =>
                                  setSignupsPage((p) =>
                                    p * pageSize >= stats.referred_signups.length ? p : p + 1,
                                  )
                                }
                                className="h-7 px-3 border-white/10"
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="forms" className="space-y-4">
                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-400" />
                      People who filled the form via your link ({stats.form_submissions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {stats.form_submissions.length === 0 ? (
                      <p className="text-muted-foreground text-sm py-6 text-center">
                        No form submissions yet. Share your link to get started!
                      </p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableHead className="text-muted-foreground">Name</TableHead>
                              <TableHead className="text-muted-foreground">Email</TableHead>
                              <TableHead className="text-muted-foreground">Phone</TableHead>
                              <TableHead className="text-muted-foreground">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.form_submissions
                              .slice((formsPage - 1) * pageSize, formsPage * pageSize)
                              .map((s) => (
                                <TableRow
                                  key={s.id}
                                  className="border-white/5 hover:bg-white/5 cursor-pointer"
                                  onClick={() => setSelectedForm(s)}
                                >
                                  <TableCell className="text-zinc-300">{s.name}</TableCell>
                                  <TableCell className="text-zinc-400 text-sm">{s.email}</TableCell>
                                  <TableCell className="text-zinc-400 text-sm">{s.phone}</TableCell>
                                  <TableCell className="text-zinc-500 text-xs">
                                    {new Date(s.created_at).toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                        {stats.form_submissions.length > pageSize && (
                          <div className="flex justify-end items-center gap-3 pt-4 text-xs text-muted-foreground">
                            <span>
                              Page {formsPage} of {Math.ceil(stats.form_submissions.length / pageSize)}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={formsPage === 1}
                                onClick={() => setFormsPage((p) => Math.max(1, p - 1))}
                                className="h-7 px-3 border-white/10"
                              >
                                Prev
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={formsPage * pageSize >= stats.form_submissions.length}
                                onClick={() =>
                                  setFormsPage((p) =>
                                    p * pageSize >= stats.form_submissions.length ? p : p + 1,
                                  )
                                }
                                className="h-7 px-3 border-white/10"
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>


              <TabsContent value="payments" className="space-y-4">
                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-400" />
                      Payments & your commission ({stats.payments.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {stats.payments.length === 0 ? (
                      <p className="text-muted-foreground text-sm py-6 text-center">
                        No payments via your link yet.
                      </p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/10 hover:bg-transparent">
                              <TableHead className="text-muted-foreground">Amount</TableHead>
                              <TableHead className="text-muted-foreground">Plan</TableHead>
                              <TableHead className="text-muted-foreground">Status</TableHead>
                              <TableHead className="text-muted-foreground">Payout Status</TableHead>
                              <TableHead className="text-muted-foreground">Your commission</TableHead>
                              <TableHead className="text-muted-foreground">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.payments
                              .slice((paymentsPage - 1) * pageSize, paymentsPage * pageSize)
                              .map((p) => (
                                <TableRow key={p.id} className="border-white/5 hover:bg-white/5">
                                  <TableCell className="text-zinc-300">
                                    {p.currency} {Number(p.amount).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-zinc-400 text-xs">
                                    {planIdToDisplayName(p.plan_id)}
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={p.status === "completed" ? "default" : "secondary"}
                                      className="border-white/10 text-xs"
                                    >
                                      {p.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge 
                                      variant={p.payout_status === "paid" ? "default" : "outline"} 
                                      className={p.payout_status === "paid" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}
                                    >
                                      {p.payout_status || "pending"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-green-400 font-medium">
                                    ₹{Number(p.commission_amount ?? 0).toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-zinc-500 text-xs">
                                    {new Date(p.created_at).toLocaleDateString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                        {stats.payments.length > pageSize && (
                          <div className="flex justify-end items-center gap-3 pt-4 text-xs text-muted-foreground">
                            <span>
                              Page {paymentsPage} of {Math.ceil(stats.payments.length / pageSize)}
                            </span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={paymentsPage === 1}
                                onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                                className="h-7 px-3 border-white/10"
                              >
                                Prev
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={paymentsPage * pageSize >= stats.payments.length}
                                onClick={() =>
                                  setPaymentsPage((p) =>
                                    p * pageSize >= stats.payments.length ? p : p + 1,
                                  )
                                }
                                className="h-7 px-3 border-white/10"
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payout_records" className="space-y-6">
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="glass-panel border-white/10 bg-gradient-to-br from-green-500/10 to-transparent">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3 mb-1">
                        <DollarSign className="h-4 w-4 text-green-400" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total Received</span>
                      </div>
                      <p className="text-2xl font-bold text-white">
                        ₹{stats.payout_records.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-1">Confirmed payouts from admin</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-base flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-blue-400" />
                      Payout History ({stats.payout_records.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {stats.payout_records.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                        <Activity className="h-12 w-12 mb-4 opacity-10" />
                        <p className="text-sm italic">No payouts received yet.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-muted-foreground w-[150px]">Amount</TableHead>
                            <TableHead className="text-muted-foreground">Description / Notes</TableHead>
                            <TableHead className="text-muted-foreground">Invoice</TableHead>
                            <TableHead className="text-muted-foreground text-right">Transaction Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stats.payout_records.map((p) => (
                            <TableRow key={p.id} className="border-white/5 hover:bg-white/5">
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="text-green-400 font-bold">₹{Number(p.amount).toFixed(2)}</span>
                                  <span className="text-[10px] text-zinc-500">{p.currency}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-zinc-300 text-xs max-w-[300px]">
                                {p.notes || <span className="text-zinc-600 italic">No notes added</span>}
                              </TableCell>
                              <TableCell>
                                {p.invoice_url ? (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-8 gap-2 text-[10px] bg-white/5 border-white/10 hover:bg-white/10 transition-all hover:scale-105"
                                    onClick={() => window.open(p.invoice_url, '_blank')}
                                  >
                                    <FileText className="h-3 w-3" />
                                    Download Invoice
                                  </Button>
                                ) : (
                                  <span className="text-[10px] text-zinc-600 flex items-center gap-1.5">
                                    <AlertCircle className="h-3 w-3" />
                                    No receipt
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-zinc-300 text-xs">{format(new Date(p.created_at), 'dd MMM yyyy')}</span>
                                  <span className="text-[10px] text-zinc-500 font-mono">{format(new Date(p.created_at), 'hh:mm aa')}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="resources" className="mt-6 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="glass-panel border-white/10 overflow-hidden">
                    <CardHeader className="border-b border-white/5 bg-white/5">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Video className="h-4 w-4 text-purple-400" />
                        Training Videos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      {stats.resources.filter(r => r.type === 'video').length === 0 ? (
                        <div className="text-center py-12">
                          <Video className="h-12 w-12 text-zinc-700 mx-auto mb-4 opacity-20" />
                          <p className="text-sm text-zinc-500">No training videos assigned yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-8">
                          {stats.resources.filter(r => r.type === 'video').map(video => (
                            <div key={video.id} className="space-y-3 group">
                              <h3 className="text-sm font-medium text-white group-hover:text-purple-400 transition-colors">{video.title}</h3>
                              <div className="aspect-video rounded-xl overflow-hidden bg-zinc-950 border border-white/10 group-hover:border-purple-500/30 transition-all shadow-2xl">
                                {video.content_url?.includes('youtube.com') || video.content_url?.includes('youtu.be') ? (
                                  <iframe 
                                    className="w-full h-full"
                                    src={`https://www.youtube.com/embed/${video.content_url.split('v=')[1] || video.content_url.split('/').pop()}`}
                                    title={video.title}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  ></iframe>
                                ) : video.content_url?.includes('vimeo.com') ? (
                                  <iframe 
                                    className="w-full h-full"
                                    src={`https://player.vimeo.com/video/${video.content_url.split('/').pop()}`}
                                    title={video.title}
                                    frameBorder="0"
                                    allow="autoplay; fullscreen; picture-in-picture"
                                    allowFullScreen
                                  ></iframe>
                                ) : video.content_url?.match(/\.(mp4|webm|ogg|mov)$/i) || video.content_url?.includes('supabase.co/storage') ? (
                                  <video 
                                    className="w-full h-full object-contain" 
                                    controls 
                                    playsInline
                                  >
                                    <source src={video.content_url} />
                                    Your browser does not support the video tag.
                                  </video>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-zinc-900/50">
                                    <Button variant="link" className="text-purple-400" onClick={() => window.open(video.content_url, '_blank')}>
                                      Watch Video <ChevronRight className="ml-1 h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="glass-panel border-white/10">
                    <CardHeader className="border-b border-white/5 bg-white/5">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-400" />
                        Sales Scripts
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                      {stats.resources.filter(r => r.type === 'script').length === 0 ? (
                        <div className="text-center py-12">
                          <FileText className="h-12 w-12 text-zinc-700 mx-auto mb-4 opacity-20" />
                          <p className="text-sm text-zinc-500">No sales scripts assigned yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {stats.resources.filter(r => r.type === 'script').map(script => (
                            <div key={script.id} className="p-4 border border-white/10 rounded-xl bg-white/5 space-y-3">
                              <div className="flex items-center justify-between">
                                <h3 className="text-sm font-medium text-white">{script.title}</h3>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 text-[10px] text-zinc-400 hover:text-white"
                                  onClick={() => {
                                    navigator.clipboard.writeText(script.content_text || '');
                                    toast.success("Script copied!");
                                  }}
                                >
                                  <Copy className="h-3 w-3 mr-1.5" /> Copy
                                </Button>
                              </div>
                              <div className="text-xs text-zinc-400 leading-relaxed max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 pr-2">
                                {script.content_text}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="analytics" className="mt-6 space-y-6">
                <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                        Sales Funnel
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <div className="space-y-8">
                        <div className="flex items-center justify-between gap-4 max-w-2xl mx-auto">
                          <div className="flex-1 flex flex-col items-center gap-3">
                            <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30 text-blue-400">
                              <Activity className="h-7 w-7" />
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold text-white">{stats.clicks}</p>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Clicks</p>
                            </div>
                          </div>
                          <div className="h-px flex-1 bg-gradient-to-r from-blue-500/30 to-purple-500/30 relative">
                            <div className="absolute inset-0 flex items-center justify-center -top-6">
                              <span className="text-[10px] font-medium text-zinc-400 bg-black px-2">{((stats.referred_signups.length / (stats.clicks || 1)) * 100).toFixed(1)}%</span>
                            </div>
                            <ChevronRight className="absolute -right-2 -top-[9px] h-5 w-5 text-purple-500/30" />
                          </div>
                          <div className="flex-1 flex flex-col items-center gap-3">
                            <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30 text-purple-400">
                              <UserPlus className="h-7 w-7" />
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold text-white">{stats.referred_signups.length}</p>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Signups</p>
                            </div>
                          </div>
                          <div className="h-px flex-1 bg-gradient-to-r from-purple-500/30 to-green-500/30 relative">
                            <div className="absolute inset-0 flex items-center justify-center -top-6">
                              <span className="text-[10px] font-medium text-zinc-400 bg-black px-2">{((stats.conversions / (stats.referred_signups.length || 1)) * 100).toFixed(1)}%</span>
                            </div>
                            <ChevronRight className="absolute -right-2 -top-[9px] h-5 w-5 text-green-500/30" />
                          </div>
                          <div className="flex-1 flex flex-col items-center gap-3">
                            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30 text-green-400">
                              <DollarSign className="h-7 w-7" />
                            </div>
                            <div className="text-center">
                              <p className="text-xl font-bold text-white">{stats.conversions}</p>
                              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Purchases</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-8">
                          <div className="p-4 border border-white/5 rounded-xl bg-white/5">
                            <p className="text-xs text-zinc-500 mb-1">Click to Signup Rate</p>
                            <p className="text-lg font-bold text-white tracking-tight">{((stats.referred_signups.length / (stats.clicks || 1)) * 100).toFixed(2)}%</p>
                          </div>
                          <div className="p-4 border border-white/5 rounded-xl bg-white/5">
                            <p className="text-xs text-zinc-500 mb-1">Signup to Sale Rate</p>
                            <p className="text-lg font-bold text-white tracking-tight">{((stats.conversions / (stats.referred_signups.length || 1)) * 100).toFixed(2)}%</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                <div className="grid lg:grid-cols-3 gap-6">
                  <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Globe className="h-4 w-4 text-emerald-400" />
                        Visitors by Region
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px] pt-4">
                      {(() => {
                        const counts: Record<string, number> = {};
                        stats.visitor_rows.forEach(v => {
                          const key = v.region || v.country || 'Unknown';
                          counts[key] = (counts[key] || 0) + 1;
                        });
                        const data = Object.entries(counts)
                          .map(([name, value]) => ({ name, value }))
                          .sort((a,b) => b.value - a.value)
                          .slice(0, 8);
                        
                        if (data.length === 0) {
                          return <div className="h-full flex items-center justify-center text-zinc-500 text-xs italic">No region data available</div>;
                        }

                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
                              <XAxis type="number" hide />
                              <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={10} axisLine={false} tickLine={false} width={100} />
                              <RechartsTooltip 
                                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                itemStyle={{ color: '#10b981', fontSize: '12px' }}
                              />
                              <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                          </ResponsiveContainer>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Zap className="h-4 w-4 text-purple-400" />
                        Device Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px] pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const counts: Record<string, number> = {};
                          stats.visitor_rows.forEach((v) => {
                            const key = toTitle(v.device_type || "unknown");
                            counts[key] = (counts[key] || 0) + 1;
                          });
                          return Object.entries(counts).map(([name, value]) => ({ name, value }));
                        })()}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                          <YAxis stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                          <RechartsTooltip 
                            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                            itemStyle={{ color: '#a78bfa', fontSize: '12px' }}
                          />
                          <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Globe className="h-4 w-4 text-cyan-400" />
                        Browser Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px] pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const counts: Record<string, number> = {};
                          stats.visitor_rows.forEach((v) => {
                            const key = toTitle(v.browser || "unknown");
                            counts[key] = (counts[key] || 0) + 1;
                          });
                          return Object.entries(counts)
                            .map(([name, value]) => ({ name, value }))
                            .sort((a, b) => b.value - a.value)
                            .slice(0, 8);
                        })()}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                          <YAxis stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                          <RechartsTooltip
                            contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px" }}
                            itemStyle={{ color: "#22d3ee", fontSize: "12px" }}
                          />
                          <Bar dataKey="value" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                  <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-amber-400" />
                        Country Wise
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[260px] pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const counts: Record<string, number> = {};
                          stats.visitor_rows.forEach((v) => {
                            const key = `${countryCodeToFlag(v.country_code)} ${v.country_code || v.country_name || "Unknown"}`.trim();
                            counts[key] = (counts[key] || 0) + 1;
                          });
                          return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                        })()} layout="vertical" margin={{ left: 20, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={10} axisLine={false} tickLine={false} width={120} />
                          <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-orange-400" />
                        Source Wise
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[260px] pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const counts: Record<string, number> = {};
                          stats.visitor_rows.forEach((v) => {
                            const key = getSourceLabel(v);
                            counts[key] = (counts[key] || 0) + 1;
                          });
                          return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                        })()} layout="vertical" margin={{ left: 20, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={10} axisLine={false} tickLine={false} width={120} />
                          <Bar dataKey="value" fill="#f97316" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="glass-panel border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-blue-400" />
                        Link Wise (Referrer)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[260px] pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const counts: Record<string, number> = {};
                          stats.visitor_rows.forEach((v) => {
                            let key = "Direct";
                            if (v.referrer) {
                              try {
                                key = new URL(v.referrer).hostname.replace(/^www\./, "");
                              } catch {
                                key = v.referrer;
                              }
                            }
                            counts[key] = (counts[key] || 0) + 1;
                          });
                          return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
                        })()} layout="vertical" margin={{ left: 20, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.05)" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={10} axisLine={false} tickLine={false} width={120} />
                          <Bar dataKey="value" fill="#60a5fa" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  <Card className="glass-panel border-white/10">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-400" />
                        Recent Click History
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/5 hover:bg-transparent">
                              <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10">IP Address</TableHead>
                              <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10">Device</TableHead>
                              <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10">Location</TableHead>
                              <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10">Time</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.visitor_rows.slice(0, 10).map((row, i) => (
                              <TableRow key={i} className="border-white/5 hover:bg-white/5 h-12 transition-colors">
                                <TableCell className="font-mono text-[11px] text-zinc-300">{row.visitor_ip}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="text-xs text-white">{toTitle(row.device_type || 'unknown')}</span>
                                    <span className="text-[10px] text-zinc-500">{toTitle(row.browser || 'unknown')}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-zinc-300">
                                      {row.region ? `${row.region}, ` : ''}{row.city || row.country || '—'}
                                    </span>
                                    {row.country_code && (
                                      <Badge variant="secondary" className="bg-white/5 text-[9px] px-1 h-4 uppercase">
                                        {countryCodeToFlag(row.country_code)} {row.country_code}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-[11px] text-zinc-500">{format(new Date(row.visited_at), 'MMM dd, HH:mm')}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-panel border-white/10">
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        Conversion Attribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-white/5 hover:bg-transparent">
                              <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10">User</TableHead>
                              <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10">Event</TableHead>
                              <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10">Status</TableHead>
                              <TableHead className="text-zinc-500 font-medium text-[10px] uppercase h-10">Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.referred_signups.slice(0, 5).map((row, i) => (
                              <TableRow key={i} className="border-white/5 hover:bg-white/5 h-12">
                                <TableCell className="text-xs text-white">{row.full_name || row.email?.split('@')[0] || '—'}</TableCell>
                                <TableCell><Badge className="bg-blue-500/10 text-blue-400 border-none text-[10px]">Signup</Badge></TableCell>
                                <TableCell><span className="text-[11px] text-zinc-500">Completed</span></TableCell>
                                <TableCell className="text-[11px] text-zinc-500">{format(new Date(row.created_at), 'MMM dd')}</TableCell>
                              </TableRow>
                            ))}
                            {stats.payments.slice(0, 5).map((row, i) => (
                              <TableRow key={`pay-${i}`} className="border-white/5 hover:bg-white/5 h-12">
                                <TableCell className="text-xs text-white">Purchase #{row.id.slice(0, 4)}</TableCell>
                                <TableCell><Badge className="bg-emerald-500/10 text-emerald-400 border-none text-[10px]">Purchase</Badge></TableCell>
                                <TableCell><Badge variant="outline" className="text-[10px] border-emerald-500/20 text-emerald-500">₹{row.commission_amount}</Badge></TableCell>
                                <TableCell className="text-[11px] text-zinc-500">{format(new Date(row.created_at), 'MMM dd')}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-8">
              <Card className="glass-panel border-white/10 bg-gradient-to-br from-emerald-500/10 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Total Earned</p>
                    <p className="text-lg font-bold text-white font-mono">₹{stats.total_commission_earned.toFixed(0)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/10 bg-gradient-to-br from-cyan-500/10 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center border border-cyan-500/20 text-cyan-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Paid</p>
                    <p className="text-lg font-bold text-white font-mono">₹{stats.paid_commission_earned.toFixed(0)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/10 bg-gradient-to-br from-amber-500/10 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/20 text-amber-500">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Pending</p>
                    <p className="text-lg font-bold text-white font-mono">₹{stats.pending_commission_earned.toFixed(0)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/10 bg-gradient-to-br from-blue-500/10 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/20 text-blue-400">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Active Refs</p>
                    <p className="text-lg font-bold text-white">{stats.active_referrals}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/10 bg-gradient-to-br from-sky-500/10 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center border border-sky-500/20 text-sky-400">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Clicks</p>
                    <p className="text-lg font-bold text-white">{stats.clicks}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/10 bg-gradient-to-br from-purple-500/10 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center border border-purple-500/20 text-purple-400">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Conversions</p>
                    <p className="text-lg font-bold text-white">{stats.conversions}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/10 bg-gradient-to-br from-rose-500/10 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center border border-rose-500/20 text-rose-400">
                    <Percent className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Conv. Rate</p>
                    <p className="text-lg font-bold text-white">{stats.conversion_rate.toFixed(1)}%</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/10 bg-gradient-to-br from-indigo-500/10 to-transparent">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/20 text-indigo-400">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Total Payouts</p>
                    <p className="text-lg font-bold text-white font-mono">₹{stats.payout_records.reduce((sum, p) => sum + Number(p.amount), 0).toFixed(0)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 pt-6">
              <Card className="lg:col-span-2 glass-panel border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                    <LineChart className="h-4 w-4 text-cyan-400" />
                    Daily Performance (Last 30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stats.daily_stats}>
                        <defs>
                          <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="#ffffff30" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <YAxis 
                          stroke="#ffffff30" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#09090b', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '12px' }}
                          itemStyle={{ fontSize: '12px' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="clicks" 
                          name="Clicks"
                          stroke="#22d3ee" 
                          fillOpacity={1} 
                          fill="url(#colorClicks)" 
                          strokeWidth={2}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="conversions" 
                          name="Conversions"
                          stroke="#4ade80" 
                          fillOpacity={1} 
                          fill="url(#colorConversions)" 
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-white/10 overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-zinc-400">Referral Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-2xl font-bold text-white">{stats.active_referrals}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          Active Subscriptions
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-2xl font-bold text-zinc-400">{stats.referred_signups.length}</p>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Total Signups</p>
                      </div>
                    </div>
                    
                    <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden flex">
                      <div 
                        className="bg-green-500 h-full transition-all duration-500" 
                        style={{ width: `${stats.referred_signups.length > 0 ? (stats.active_referrals / stats.referred_signups.length) * 100 : 0}%` }}
                      />
                    </div>
                    
                    <div className="pt-4 border-t border-white/5">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-3">Top Referral Channels</p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-300">Direct Link</span>
                          <span className="text-xs font-mono text-zinc-500">{stats.referred_signups.length} users</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-1">
                          <div className="bg-cyan-500 h-full w-[100%] rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="profile" className="space-y-6 mt-0">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <User className="h-5 w-5 text-cyan-400" />
                      Basic Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Full Name</Label>
                        <Input value={stats.name} className="bg-white/5 border-white/10" readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Email Address</Label>
                        <Input value={stats.email} className="bg-white/5 border-white/10" readOnly />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input 
                        value={stats.phone || ""} 
                        placeholder="e.g. +91 98765 43210"
                        className="bg-white/5 border-white/10" 
                        onChange={(e) => setStats({...stats, phone: e.target.value})}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-purple-400" />
                      Payment & Tax Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>PAN (Permanent Account Number)</Label>
                        <Input 
                          value={stats.pan || ""} 
                          placeholder="ABCDE1234F"
                          className="bg-white/5 border-white/10 uppercase" 
                          onChange={(e) => setStats({...stats, pan: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>GST Number (Optional)</Label>
                        <Input 
                          value={stats.gst || ""} 
                          placeholder="22AAAAA0000A1Z5"
                          className="bg-white/5 border-white/10 uppercase" 
                          onChange={(e) => setStats({...stats, gst: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-white font-medium">Payout Method</Label>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">UPI ID</Label>
                          <Input 
                            value={stats.payment_details?.upi_id || ""} 
                            placeholder="username@bank"
                            className="bg-white/5 border-white/10" 
                            onChange={(e) => setStats({...stats, payment_details: {...(stats.payment_details || {}), upi_id: e.target.value}})}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Account Holder Name</Label>
                          <Input 
                            value={stats.payment_details?.account_name || ""} 
                            placeholder="John Doe"
                            className="bg-white/5 border-white/10" 
                            onChange={(e) => setStats({...stats, payment_details: {...(stats.payment_details || {}), account_name: e.target.value}})}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-panel border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <FileCheck className="h-5 w-5 text-green-400" />
                      Agreement
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4 h-32">
                      <ScrollArea className="h-full">
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          By accepting this agreement, you agree to promote Chartmate Trading Widget in a fair and ethical manner. 
                          Commissions are paid out based on the system defined by the administrator. 
                          Fraudulent activity will lead to immediate suspension and forfeiture of earned commissions. 
                          Payment cycles are monthly once the threshold of ₹1,000 is met.
                          We reserve the right to modify the terms of this agreement at any time.
                        </p>
                      </ScrollArea>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="agreement" 
                        checked={!!stats.agreement_accepted}
                        onCheckedChange={(checked) => setStats({...stats, agreement_accepted: !!checked})}
                      />
                      <label htmlFor="agreement" className="text-sm font-medium leading-none text-zinc-300">
                        I accept the affiliate terms and conditions
                      </label>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button 
                    onClick={async () => {
                      try {
                        setSavingProfile(true);
                        const isCompleted = !!(stats.phone && stats.pan && stats.payment_details && stats.agreement_accepted);
                        const { error } = await (supabase as any)
                          .from("affiliates")
                          .update({
                            phone: stats.phone,
                            pan: stats.pan,
                            gst: stats.gst,
                            payment_details: stats.payment_details,
                            agreement_accepted: stats.agreement_accepted,
                            profile_completed: isCompleted,
                          })
                          .eq("id", stats.id);
                        if (error) throw error;
                        toast.success("Profile updated successfully");
                        load();
                      } catch (e: any) {
                        toast.error(e?.message || "Failed to update profile");
                      } finally {
                        setSavingProfile(false);
                      }
                    }}
                    disabled={savingProfile}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white min-w-[120px]"
                  >
                    {savingProfile ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Save Changes
                  </Button>
                </div>
              </div>

              <div className="space-y-6">
                <Card className="glass-panel border-white/10 bg-gradient-to-br from-cyan-500/10 to-transparent">
                  <CardHeader>
                    <CardTitle className="text-white text-sm">Status Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Account status</span>
                      <Badge className={stats.is_active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}>
                        {stats.is_active ? "Active" : "Suspended"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-500 flex gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <p className="text-xs leading-relaxed">
                    Make sure your PAN and Payment details are accurate. Incorrect information may delay your payouts.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-0">
            <Card className="glass-panel border-white/10">
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-white flex items-center gap-2">
                  <Bell className="h-5 w-5 text-amber-400" />
                  Notifications
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-[10px] text-zinc-400 hover:text-white hover:bg-white/5"
                    onClick={markAllAsRead}
                  >
                    Mark all as read
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 text-[10px] text-red-400/60 hover:text-red-400 hover:bg-red-500/5 px-2"
                    onClick={clearAllNotifications}
                  >
                    Clear All
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                      <Bell className="h-10 w-10 mb-4 opacity-10" />
                      <p>You're all caught up!</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {notifications.map((n) => (
                        <div 
                          key={n.id} 
                          className={`p-4 transition-colors hover:bg-white/[0.02] flex gap-4 ${!n.is_read ? "bg-cyan-500/[0.03]" : ""}`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            n.type === 'referral' ? "bg-blue-500/10 text-blue-400" :
                            n.type === 'conversion' ? "bg-green-500/10 text-green-400" :
                            n.type === 'payout' ? "bg-amber-500/10 text-amber-400" :
                            "bg-zinc-500/10 text-zinc-400"
                          }`}>
                            {n.type === 'referral' ? <UserPlus className="h-5 w-5" /> :
                             n.type === 'conversion' ? <DollarSign className="h-5 w-5" /> :
                             n.type === 'payout' ? <RefreshCw className="h-5 w-5" /> :
                             <Bell className="h-5 w-5" />}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <h4 className={`text-sm font-medium ${!n.is_read ? "text-white" : "text-zinc-400"}`}>
                                {n.title}
                              </h4>
                              <span className="text-[10px] text-zinc-600">
                                {new Date(n.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                              {n.message}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>


        </Tabs>

        <Dialog open={!!selectedForm} onOpenChange={(o) => !o && setSelectedForm(null)}>
          <DialogContent className="max-w-lg bg-zinc-950 border border-zinc-800 text-white">
            {selectedForm && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Form details</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-sm mt-2">
                  <div>
                    <span className="text-zinc-500">Name</span>
                    <p className="text-zinc-100">{selectedForm.name}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Email</span>
                    <p className="text-zinc-100 break-all">{selectedForm.email}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Phone</span>
                    <p className="text-zinc-100">{selectedForm.phone}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Telegram ID</span>
                    <p className="text-zinc-100">{selectedForm.telegram_id || "—"}</p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Message / Description</span>
                    <p className="text-zinc-100 whitespace-pre-wrap">
                      {selectedForm.description || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Referral code (typed by user)</span>
                    <p className="text-zinc-100">
                      {selectedForm.referral_code || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500">Submitted at</span>
                    <p className="text-zinc-100">
                      {new Date(selectedForm.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
