import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { describeReferredUserSubscription, planIdToDisplayName } from "@/lib/referredUserPlanDisplay";
import { cn } from "@/lib/utils";
import { ArrowLeft, Users, UserPlus, FileText, DollarSign, Percent, Link2, CheckCircle2, Clock, Video, Trash2, Plus, Upload, Loader2, Bell, Send, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type AffiliateDetailSurface = "admin" | "wl";

type VisitorRow = { visitor_ip: string; visited_at: string };
type SignupRow = {
  user_id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  country: string | null;
  referral_code_at_signup: string | null;
  created_at: string;
  subscription?: { plan_id: string; status: string; current_period_end: string | null } | null;
};
type SubmissionRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  telegram_id?: string | null;
  referral_code?: string | null;
  created_at: string;
};
type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  commission_amount: number;
  status: string;
  payout_status?: "pending" | "paid";
  created_at: string;
  plan_id?: string | null;
};

type AffiliateHeader = {
  id: string;
  code: string;
  name: string;
  email: string;
  commission_percent: number;
  is_active: boolean;
  user_id: string;
};

type Props = {
  affiliateId: string;
  onBack: () => void;
  backLabel?: string;
  surface: AffiliateDetailSurface;
};

export function AffiliateDetailFullPage({ affiliateId, onBack, backLabel = "Back", surface }: Props) {
  const [loading, setLoading] = useState(true);
  const [affiliate, setAffiliate] = useState<AffiliateHeader | null>(null);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [signups, setSignups] = useState<SignupRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [tab, setTab] = useState<"visitors" | "signups" | "forms" | "payments" | "resources" | "announcements" | "payouts">("visitors");
  const pageSize = 15;
  const [vPage, setVPage] = useState(1);
  const [sPage, setSPage] = useState(1);
  const [fPage, setFPage] = useState(1);
  const [pPage, setPPage] = useState(1);
  const [resources, setResources] = useState<any[]>([]);
  const [newResource, setNewResource] = useState({ title: "", type: "video" as "video" | "script", content: "" });
  const [addingRes, setAddingRes] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [newNotification, setNewNotification] = useState({ title: "", message: "", type: "system" as "system" | "referral" | "conversion" | "payout" });
  const [sendingNotif, setSendingNotif] = useState(false);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [newPayout, setNewPayout] = useState({ amount: "", currency: "INR", notes: "" });
  const [uploadingPayoutInvoice, setUploadingPayoutInvoice] = useState(false);
  const [payoutInvoiceUrl, setPayoutInvoiceUrl] = useState<string | null>(null);
  const [sendingPayout, setSendingPayout] = useState(false);
  const fetchResources = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("affiliate_marketing_resources")
      .select("*")
      .eq("affiliate_id", affiliateId)
      .order("created_at", { ascending: false });
    if (data) setResources(data);
  }, [affiliateId]);

  const fetchPayouts = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("affiliate_payouts")
      .select("*")
      .eq("affiliate_id", affiliateId)
      .order("created_at", { ascending: false });
    if (data) setPayouts(data);
  }, [affiliateId]);

  const fetchNotifications = useCallback(async () => {
    const targetUserId = affiliate?.user_id;
    if (!targetUserId) return;
    const { data } = await (supabase as any)
      .from("affiliate_notifications")
      .select("*")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });
    if (data) setNotifications(data);
  }, [affiliate?.user_id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: aff, error: ae } = await (supabase as any)
        .from("affiliates")
        .select("id, code, name, email, commission_percent, is_active, user_id")
        .eq("id", affiliateId)
        .maybeSingle();
      if (ae) throw ae;
      if (!aff) {
        setAffiliate(null);
        toast.error("Affiliate not found or no access.");
        return;
      }
      setAffiliate(aff);

      const [{ data: v }, { data: su }, { data: sub }, { data: pay }] = await Promise.all([
        (supabase as any)
          .from("affiliate_visitors")
          .select("visitor_ip, visited_at")
          .eq("affiliate_id", affiliateId)
          .order("visited_at", { ascending: false }),
        (supabase as any)
          .from("user_signup_profiles")
          .select("user_id, email, full_name, phone, country, referral_code_at_signup, created_at")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("contact_submissions")
          .select("id, name, email, phone, telegram_id, referral_code, created_at")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: false }),
        (supabase as any)
          .from("user_payments")
          .select("id, amount, currency, commission_amount, status, payout_status, created_at, plan_id")
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: false }),
      ]);

      const signupList = (su ?? []) as SignupRow[];
      const userIds = signupList.map((r) => r.user_id).filter(Boolean);
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

      setVisitors(v ?? []);
      setSignups(
        signupList.map((s) => ({
          ...s,
          subscription: subByUser[s.user_id] ?? null,
        })),
      );
      setSubmissions(sub ?? []);
      setPayments(pay ?? []);
      await fetchResources();
      await fetchNotifications();
      await fetchPayouts();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load affiliate");
      setAffiliate(null);
    } finally {
      setLoading(false);
    }
  }, [affiliateId, fetchResources, fetchNotifications, fetchPayouts]);

  useEffect(() => {
    load();
  }, [load]);

  const addResource = async () => {
    if (!newResource.title || !newResource.content) {
      toast.error("Please fill in both title and content");
      return;
    }
    setAddingRes(true);
    const { error } = await (supabase as any).from("affiliate_marketing_resources").insert({
      affiliate_id: affiliateId,
      title: newResource.title,
      type: newResource.type,
      content_url: newResource.type === "video" ? newResource.content : null,
      content_text: newResource.type === "script" ? newResource.content : null
    });
    setAddingRes(false);
    if (error) {
      toast.error("Failed to add resource");
    } else {
      toast.success("Resource added");
      setNewResource({ title: "", type: "video", content: "" });
      setUploadedUrl(null);
      fetchResources();
    }
  };

  const sendNotification = async () => {
    if (!newNotification.title || !newNotification.message) {
      toast.error("Please fill in both title and message");
      return;
    }

    const { data: affData } = await (supabase as any).from("affiliates").select("user_id").eq("id", affiliateId).single();
    if (!affData?.user_id) {
      toast.error("Could not find user associated with this affiliate");
      return;
    }

    try {
      setSendingNotif(true);
      const { error } = await (supabase as any)
        .from("affiliate_notifications")
        .insert({
          user_id: affData.user_id,
          type: newNotification.type,
          title: newNotification.title,
          message: newNotification.message,
          is_read: false
        });

      if (error) throw error;
      toast.success("Notification sent!");
      setNewNotification({ title: "", message: "", type: "system" });
      fetchNotifications();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingNotif(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    if (!file) return;
    setUploadingVideo(true);
    try {
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      const filePath = `${affiliateId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('affiliate-resources')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('affiliate-resources')
        .getPublicUrl(filePath);

      setUploadedUrl(publicUrl);
      setNewResource(prev => ({ ...prev, content: publicUrl }));
      toast.success("Video uploaded successfully");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleInvoiceUpload = async (file: File) => {
    if (!file) return;
    setUploadingPayoutInvoice(true);
    try {
      const fileName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      const filePath = `${affiliateId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('affiliate-payouts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('affiliate-payouts')
        .getPublicUrl(filePath);

      setPayoutInvoiceUrl(publicUrl);
      toast.success("Invoice uploaded successfully");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingPayoutInvoice(false);
    }
  };

  const sendPayout = async () => {
    if (!newPayout.amount || isNaN(Number(newPayout.amount))) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      setSendingPayout(true);
      const { data: affData } = await (supabase as any).from("affiliates").select("user_id").eq("id", affiliateId).single();
      
      const { error } = await (supabase as any)
        .from("affiliate_payouts")
        .insert({
          affiliate_id: affiliateId,
          amount: Number(newPayout.amount),
          currency: newPayout.currency,
          notes: newPayout.notes,
          invoice_url: payoutInvoiceUrl,
          created_by: (await supabase.auth.getUser()).data.user?.id
        });

      if (error) throw error;

      // Notify the affiliate
      if (affData?.user_id) {
        await (supabase as any)
          .from("affiliate_notifications")
          .insert({
            user_id: affData.user_id,
            type: "payout",
            title: "Money Received!",
            message: `Admin has sent you ${newPayout.currency} ${newPayout.amount}. Check the Money Received tab for details.`
          });
        fetchNotifications();
      }

      toast.success("Payout recorded and affiliate notified");
      setNewPayout({ amount: "", currency: "INR", notes: "" });
      setPayoutInvoiceUrl(null);
      fetchPayouts();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingPayout(false);
    }
  };

  const deleteResource = async (id: string) => {
    const { error } = await (supabase as any).from("affiliate_marketing_resources").delete().eq("id", id);
    if (error) toast.error("Failed to delete");
    else {
      toast.success("Deleted");
      fetchResources();
    }
  };

  const markAsPaid = async (paymentId: string) => {
    try {
      const { error } = await (supabase as any)
        .from("user_payments")
        .update({ 
          payout_status: "paid",
          payout_at: new Date().toISOString()
        })
        .eq("id", paymentId);
        
      if (error) throw error;
      toast.success("Payment marked as paid");
      load();
      
      // Notify the affiliate
      if (affiliate) {
        const { data: affData } = await (supabase as any).from("affiliates").select("user_id").eq("id", affiliateId).single();
        if (affData?.user_id) {
          await (supabase as any)
            .from("affiliate_notifications")
            .insert({
              user_id: affData.user_id,
              type: "payout",
              title: "Payout Confirmed",
              message: `A commission of ₹${payments.find(p => p.id === paymentId)?.commission_amount.toFixed(2)} has been marked as paid.`
            });
          fetchNotifications();
        }
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const linkUrl = affiliate ? `${window.location.origin}/?ref=${encodeURIComponent(affiliate.code)}` : "";
  const totalComm = payments.reduce((sum, p) => sum + Number(p.commission_amount ?? 0), 0);
  const paidComm = payments
    .filter(p => p.payout_status === "paid")
    .reduce((sum, p) => sum + Number(p.commission_amount ?? 0), 0);
  const pendingComm = totalComm - paidComm;

  const shell =
    surface === "wl"
      ? "min-h-screen bg-black text-white"
      : "text-foreground";

  if (loading && !affiliate) {
    return (
      <div className={shell}>
        <div className="space-y-4 max-w-6xl mx-auto">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!affiliate) {
    return (
      <div className={shell}>
        <Button variant="outline" size="sm" onClick={onBack} className="mb-4 border-white/10">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {backLabel}
        </Button>
        <p className="text-muted-foreground">Affiliate not found.</p>
      </div>
    );
  }

  const cardClass =
    surface === "wl"
      ? "glass-panel border-white/10 bg-white/5"
      : "glass-panel border-white/10";



  return (
    <div className={shell}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className={surface === "wl" ? "border-white/10 text-zinc-300 hover:bg-white/10" : ""}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backLabel}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className={surface === "wl" ? "border-white/10" : ""}>
            Refresh
          </Button>
        </div>

        <div>
          <h1 className={`text-2xl font-bold ${surface === "wl" ? "text-white" : ""}`}>{affiliate.name}</h1>
          <div className={`text-sm ${surface === "wl" ? "text-zinc-500" : "text-muted-foreground"}`}>
            {affiliate.email} · {affiliate.commission_percent}% commission ·{" "}
            <Badge variant={affiliate.is_active ? "default" : "secondary"} className="text-xs">
              {affiliate.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        <Card className={cardClass}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-base flex items-center gap-2 ${surface === "wl" ? "text-white" : ""}`}>
              <Link2 className="h-4 w-4 text-cyan-400" />
              Affiliate link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <code className={`text-sm font-mono break-all ${surface === "wl" ? "text-cyan-300" : "text-primary"}`}>
              {linkUrl}
            </code>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Unique visitors", value: visitors.length, color: "text-blue-400", icon: Users },
            { label: "Sign-ups", value: signups.length, color: "text-sky-400", icon: UserPlus },
            { label: "Form submissions", value: submissions.length, color: "text-amber-400", icon: FileText },
            { label: "Active Referrals", value: signups.filter(s => s.subscription?.status === 'active').length, color: "text-green-400", icon: CheckCircle2 },
            { label: "Paid Earnings", value: `₹${paidComm.toFixed(0)}`, color: "text-emerald-400", icon: DollarSign },
            { label: "Pending Payout", value: `₹${pendingComm.toFixed(0)}`, color: "text-amber-400", icon: Clock },
            { label: "Total Commission", value: `₹${totalComm.toFixed(0)}`, color: "text-purple-400", icon: Percent },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-lg p-3 border ${surface === "wl" ? "bg-white/5 border-white/10" : "bg-muted/30 border-border"}`}
            >
              <div className={`flex items-center gap-1.5 mb-1 ${s.color}`}>
                <s.icon className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase text-muted-foreground font-medium">{s.label}</span>
              </div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
          <TabsList
            className={
              surface === "wl"
                ? "bg-zinc-900/80 border border-white/10 flex-wrap h-auto gap-1 py-1 w-full justify-start"
                : "flex-wrap h-auto gap-1 py-1 w-full justify-start"
            }
          >
            <TabsTrigger value="visitors" className="text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Unique visitors ({visitors.length})
            </TabsTrigger>
            <TabsTrigger value="signups" className="text-xs gap-1.5">
              <UserPlus className="h-3.5 w-3.5" />
              Sign-ups ({signups.length})
            </TabsTrigger>
            <TabsTrigger value="forms" className="text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Forms ({submissions.length})
            </TabsTrigger>
            <TabsTrigger value="payments" className="text-xs gap-1.5">
              <DollarSign className="h-3.5 w-3.5" />
              Money earned ({payments.length})
            </TabsTrigger>
            {surface === "admin" && (
              <>
                <TabsTrigger value="resources" className="text-xs gap-1.5">
                  <Video className="h-3.5 w-3.5 text-purple-400" />
                  Resources
                </TabsTrigger>
                <TabsTrigger value="payouts" className="text-xs gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-green-400" />
                  Money Send
                </TabsTrigger>
                <TabsTrigger value="announcements" className="text-xs gap-1.5">
                  <Bell className="h-3.5 w-3.5 text-amber-400" />
                  Announcements
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="visitors">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                  Distinct IPs ({visitors.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {visitors.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No visitors yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>IP</TableHead>
                          <TableHead>First visited</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visitors.slice((vPage - 1) * pageSize, vPage * pageSize).map((row, i) => (
                          <TableRow key={`${row.visitor_ip}-${i}`}>
                            <TableCell className="font-mono text-xs">{row.visitor_ip}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(row.visited_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {visitors.length > pageSize && (
                      <Pager page={vPage} setPage={setVPage} total={visitors.length} pageSize={pageSize} />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signups">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                  Referred accounts ({signups.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {signups.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No sign-ups yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead>Ref code</TableHead>
                          <TableHead>Billing</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Signed up</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {signups.slice((sPage - 1) * pageSize, sPage * pageSize).map((s) => {
                          const d = describeReferredUserSubscription(s.subscription ?? null);
                          return (
                            <TableRow key={s.user_id}>
                              <TableCell className="text-sm">{s.full_name || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{s.email || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{s.phone || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{s.country || "—"}</TableCell>
                              <TableCell className="font-mono text-xs">{s.referral_code_at_signup || "—"}</TableCell>
                              <TableCell>
                                <Badge variant={d.billing === "Paid" ? "default" : "secondary"} className="text-xs">
                                  {d.billing}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs max-w-[200px]">{d.planLine}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(s.created_at).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {signups.length > pageSize && (
                      <Pager page={sPage} setPage={setSPage} total={signups.length} pageSize={pageSize} />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forms">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                  Form submissions ({submissions.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {submissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">None yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Referral code</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {submissions.slice((fPage - 1) * pageSize, fPage * pageSize).map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-sm">{s.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{s.phone}</TableCell>
                            <TableCell className="text-xs">{s.referral_code || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(s.created_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {submissions.length > pageSize && (
                      <Pager page={fPage} setPage={setFPage} total={submissions.length} pageSize={pageSize} />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payments">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                  Payments & commission ({payments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No payments yet.</p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Amount</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Payout Status</TableHead>
                          <TableHead>Commission</TableHead>
                          <TableHead>Date</TableHead>
                          {surface === "admin" && <TableHead className="text-right">Action</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.slice((pPage - 1) * pageSize, pPage * pageSize).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm">
                              {p.currency} {Number(p.amount).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-xs">{planIdToDisplayName(p.plan_id)}</TableCell>
                            <TableCell>
                              <Badge variant={p.status === "completed" ? "default" : "secondary"} className="text-xs">
                                {p.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={p.payout_status === "paid" ? "default" : "outline"} 
                                className={cn("text-xs", p.payout_status === "paid" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20")}
                              >
                                {p.payout_status || "pending"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-green-600 text-sm font-medium">
                              ₹{Number(p.commission_amount ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString()}
                            </TableCell>
                            {surface === "admin" && (
                              <TableCell className="text-right">
                                {p.payout_status !== "paid" && p.status === "completed" && (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 text-[10px] border-green-500/20 hover:bg-green-500/10 text-green-400"
                                    onClick={() => markAsPaid(p.id)}
                                  >
                                    Mark Paid
                                  </Button>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {payments.length > pageSize && (
                      <Pager page={pPage} setPage={setPPage} total={payments.length} pageSize={pageSize} />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resources">
            <Card className={cardClass}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Video className="h-4 w-4 text-purple-400" />
                  Marketing Resources
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 border border-white/10 rounded-xl bg-white/5 space-y-4">
                  <p className="text-xs font-medium text-zinc-400">Add unique video or script for this affiliate</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-500 uppercase">Title</label>
                      <input 
                        className="w-full h-9 bg-zinc-950 border border-white/10 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                        placeholder="e.g. Intro Training Video"
                        value={newResource.title}
                        onChange={e => setNewResource({...newResource, title: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-zinc-500 uppercase">Type</label>
                      <select 
                        className="w-full h-9 bg-zinc-950 border border-white/10 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                        value={newResource.type}
                        onChange={e => setNewResource({...newResource, type: e.target.value as any})}
                      >
                        <option value="video">Video URL</option>
                        <option value="script">Training Script</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase">
                      {newResource.type === "video" ? "Video Content" : "Script Content"}
                    </label>
                    {newResource.type === "video" ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <input 
                            className="flex-1 h-9 bg-zinc-950 border border-white/10 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            placeholder="Paste YouTube/Vimeo URL..."
                            value={newResource.content}
                            onChange={e => {
                              setNewResource({...newResource, content: e.target.value});
                              setUploadedUrl(null);
                            }}
                          />
                          <div className="text-zinc-500 text-xs">or</div>
                          <label className="cursor-pointer">
                            <Button asChild variant="outline" size="sm" className="h-9 border-white/10 bg-white/5 hover:bg-white/10" disabled={uploadingVideo}>
                              <span>
                                {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                                Upload File
                              </span>
                            </Button>
                            <input 
                              type="file" 
                              accept="video/*" 
                              className="hidden" 
                              onChange={e => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
                            />
                          </label>
                        </div>
                        {uploadedUrl && (
                          <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>File ready: {uploadedUrl.split('/').pop()}</span>
                          </div>
                        )}
                        <p className="text-[10px] text-zinc-500">Provide a URL from YouTube/Vimeo or upload a direct video file.</p>
                      </div>
                    ) : (
                      <textarea 
                        className="w-full h-24 bg-zinc-950 border border-white/10 rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                        placeholder="Write your script here..."
                        value={newResource.content}
                        onChange={e => setNewResource({...newResource, content: e.target.value})}
                      />
                    )}
                  </div>
                  <Button 
                    className="w-full bg-purple-600 hover:bg-purple-500 h-9 text-xs" 
                    onClick={addResource}
                    disabled={addingRes}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    {addingRes ? "Adding..." : "Add Resource"}
                  </Button>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-300">Existing Resources</h4>
                  {resources.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic py-4 text-center">No resources added yet.</p>
                  ) : (
                    <div className="grid gap-3">
                      {resources.map(res => (
                        <div key={res.id} className="flex items-center justify-between p-3 border border-white/5 rounded-lg bg-zinc-950/50 group">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${res.type === 'video' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                              {res.type === 'video' ? <Video className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{res.title}</p>
                              <p className="text-[10px] text-zinc-500 truncate max-w-[200px] sm:max-w-md">
                                {res.type === 'video' ? res.content_url : res.content_text}
                              </p>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteResource(res.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="payouts">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className={`${cardClass} lg:col-span-1`}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-400" />
                    Record New Payout
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase">Amount & Currency</label>
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        className="flex-1 h-9 bg-zinc-950 border border-white/10 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50 text-white"
                        placeholder="0.00"
                        value={newPayout.amount}
                        onChange={e => setNewPayout({...newPayout, amount: e.target.value})}
                      />
                      <select 
                        className="w-24 h-9 bg-zinc-950 border border-white/10 rounded-md px-2 text-sm focus:outline-none text-white"
                        value={newPayout.currency}
                        onChange={e => setNewPayout({...newPayout, currency: e.target.value})}
                      >
                        <option value="INR">INR</option>
                        <option value="USD">USD</option>
                        <option value="USDT">USDT</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase">Internal Notes</label>
                    <textarea 
                      className="w-full h-20 bg-zinc-950 border border-white/10 rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/50 text-white"
                      placeholder="Transaction ID, bank details, etc..."
                      value={newPayout.notes}
                      onChange={e => setNewPayout({...newPayout, notes: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase">Upload Invoice / Receipt</label>
                    <div className="flex flex-col gap-3">
                      <label className="cursor-pointer">
                        <Button asChild variant="outline" size="sm" className="w-full h-9 border-white/10 bg-white/5 hover:bg-white/10" disabled={uploadingPayoutInvoice}>
                          <span>
                            {uploadingPayoutInvoice ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            {payoutInvoiceUrl ? "Change Invoice" : "Select Invoice File"}
                          </span>
                        </Button>
                        <input 
                          type="file" 
                          accept="image/*,application/pdf" 
                          className="hidden" 
                          onChange={e => e.target.files?.[0] && handleInvoiceUpload(e.target.files[0])}
                        />
                      </label>
                      {payoutInvoiceUrl && (
                        <div className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/5 p-2 rounded border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="truncate flex-1">Invoice uploaded and ready</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    className="w-full bg-green-600 hover:bg-green-500 h-10 mt-2" 
                    disabled={sendingPayout || !newPayout.amount}
                    onClick={sendPayout}
                  >
                    {sendingPayout ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Confirm & Send Money
                  </Button>
                </CardContent>
              </Card>

              <Card className={`${cardClass} lg:col-span-2`}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-blue-400" />
                    Payout History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="text-zinc-500 text-[10px] uppercase">Date</TableHead>
                          <TableHead className="text-zinc-500 text-[10px] uppercase">Amount</TableHead>
                          <TableHead className="text-zinc-500 text-[10px] uppercase">Notes</TableHead>
                          <TableHead className="text-zinc-500 text-[10px] uppercase text-right">Invoice</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payouts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-32 text-center text-zinc-600 italic text-sm">
                              No manual payouts recorded yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          payouts.map((p) => (
                            <TableRow key={p.id} className="border-white/5 hover:bg-white/5">
                              <TableCell className="text-xs text-zinc-400">
                                {new Date(p.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-sm font-bold text-white">
                                {p.currency} {Number(p.amount).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-xs text-zinc-500 max-w-[200px] truncate">
                                {p.notes || "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {p.invoice_url ? (
                                  <Button 
                                    className="h-7 text-[10px] bg-white/5 border-white/10 hover:bg-white/10" 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => window.open(p.invoice_url, '_blank')}
                                  >
                                    View Invoice
                                  </Button>
                                ) : (
                                  <span className="text-[10px] text-zinc-700">No invoice</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="announcements">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className={cardClass}>
                <CardHeader>
                  <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                    Send Announcement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase">Notification Type</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'system', label: 'System', icon: Bell, color: 'text-zinc-400' },
                        { id: 'payout', label: 'Payout', icon: DollarSign, color: 'text-amber-400' },
                        { id: 'referral', label: 'Referral', icon: UserPlus, color: 'text-blue-400' },
                        { id: 'conversion', label: 'Conversion', icon: Zap, color: 'text-green-400' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          className={cn(
                            "flex flex-col items-center justify-center p-2 rounded-lg border transition-all gap-1",
                            newNotification.type === t.id 
                              ? "bg-purple-600/10 border-purple-500/50 text-purple-400" 
                              : "bg-zinc-950 border-white/5 text-zinc-500 hover:bg-white/5"
                          )}
                          onClick={() => setNewNotification({ ...newNotification, type: t.id as any })}
                        >
                          <t.icon className={cn("h-4 w-4", newNotification.type === t.id ? t.color : "text-zinc-500")} />
                          <span className="text-[10px] font-medium">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase">Title</label>
                    <input 
                      className="w-full h-9 bg-zinc-950 border border-white/10 rounded-md px-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-white placeholder:text-zinc-700"
                      placeholder="e.g. Bonus Added, Support Update..."
                      value={newNotification.title}
                      onChange={e => setNewNotification({...newNotification, title: e.target.value})}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase">Message</label>
                    <textarea 
                      className="w-full h-24 bg-zinc-950 border border-white/10 rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-white placeholder:text-zinc-700"
                      placeholder="Type your message to the affiliate..."
                      value={newNotification.message}
                      onChange={e => setNewNotification({...newNotification, message: e.target.value})}
                    />
                  </div>

                  <Button 
                    className="w-full bg-purple-600 hover:bg-purple-500 h-10" 
                    disabled={sendingNotif}
                    onClick={sendNotification}
                  >
                    {sendingNotif ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Send Announcement
                  </Button>
                </CardContent>
              </Card>

              <Card className={cardClass}>
                <CardHeader>
                  <CardTitle className={surface === "wl" ? "text-white text-base" : "text-base"}>
                    Announcement History
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[500px] overflow-y-auto overflow-x-hidden">
                    {notifications.length === 0 ? (
                      <div className="py-20 text-center text-zinc-600 space-y-2">
                        <Bell className="h-8 w-8 mx-auto opacity-20" />
                        <p className="text-xs italic">No announcements sent to this affiliate yet.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {notifications.map((n) => (
                          <div key={n.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-start justify-between gap-3 mb-1">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "p-1 rounded bg-white/5",
                                  n.type === 'referral' ? "text-blue-400" :
                                  n.type === 'conversion' ? "text-green-400" :
                                  n.type === 'payout' ? "text-amber-400" : "text-zinc-400"
                                )}>
                                  {n.type === 'referral' ? <UserPlus className="h-3 w-3" /> :
                                   n.type === 'conversion' ? <Zap className="h-3 w-3" /> :
                                   n.type === 'payout' ? <DollarSign className="h-3 w-3" /> :
                                   <Bell className="h-3 w-3" />}
                                </span>
                                <h5 className="text-xs font-semibold text-zinc-200">{n.title}</h5>
                              </div>
                              <span className="text-[9px] text-zinc-600 whitespace-nowrap mt-0.5">
                                {new Date(n.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 leading-relaxed pl-7">{n.message}</p>
                            {!n.is_read && (
                              <div className="mt-2 pl-7">
                                <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-none text-[8px] px-1.5 h-4">Not Read Yet</Badge>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Pager({
  page,
  setPage,
  total,
  pageSize,
}: {
  page: number;
  setPage: (n: number) => void;
  total: number;
  pageSize: number;
}) {
  const max = Math.ceil(total / pageSize);
  return (
    <div className="flex justify-end items-center gap-2 pt-4 text-xs text-muted-foreground">
      <span>
        Page {page} of {max}
      </span>
      <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>
        Prev
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7"
        disabled={page * pageSize >= total}
        onClick={() => setPage(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
