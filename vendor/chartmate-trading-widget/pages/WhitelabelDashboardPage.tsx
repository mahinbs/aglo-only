import { useEffect, useState } from "react";
import { useParams, useNavigate, Link, Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle, Users, CalendarDays, LogOut, ArrowRight, Copy,
  CheckCircle2, PlusCircle, RefreshCw, Link2, Zap
} from "lucide-react";

/* ── Hooks ── */
import { useWhitelabelTenant, isTenantExpired, daysRemaining } from "@/hooks/useWhitelabel";
import { useAuth } from "@/hooks/useAuth";
import { useWhitelabelAffiliates, AffiliateRow } from "@/hooks/useWhitelabelAffiliates";
import { useWhitelabelUsers } from "@/hooks/useWhitelabelUsers";
import { toast } from "sonner";

/* ── Components ── */
import { DashboardStats } from "@/components/whitelabel/DashboardStats";
import { AffiliateTable } from "@/components/whitelabel/AffiliateTable";
import { BrandedLinkBoard } from "@/components/whitelabel/BrandedLinkBoard";
import { UserTable } from "@/components/whitelabel/UserTable";
import { CreateAffiliateDialog } from "@/components/whitelabel/CreateAffiliateDialog";
import { AffiliateDetailModal } from "@/components/affiliate/AffiliateDetailModal";

const defaultAffForm = { code: "", name: "", email: "", commission_percent: 10, is_active: true };

export default function WhitelabelDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: realUser, loading: authLoading } = useAuth();
  const { tenant, loading: tenantLoading } = useWhitelabelTenant(slug);

  /* ── Access State ── */
  const user = realUser;
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipRole, setMembershipRole] = useState<"admin" | "user" | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [hasPaidAccess, setHasPaidAccess] = useState(false);
  const [paymentToken, setPaymentToken] = useState<string | null>(null);
  const [paymentCheckLoading, setPaymentCheckLoading] = useState(true);
  const isWLAdmin = membershipRole === "admin" && membershipStatus === "active";

  /* ── Data Hooks ── */
  const { affiliates, loading: loadingAffiliates, refresh: refreshAffiliates } = useWhitelabelAffiliates(user?.id, tenant?.id, isWLAdmin, false);
  const { users, loading: loadingUsers } = useWhitelabelUsers(tenant?.id, isWLAdmin, false);

  /* ── UI State ── */
  const [mainTab, setMainTab] = useState<"overview" | "affiliates">("overview");
  const affiliateViewId = searchParams.get("view");

  useEffect(() => {
    if (searchParams.get("tab") === "affiliates") setMainTab("affiliates");
    if (searchParams.get("view")) setMainTab("affiliates");
  }, [searchParams]);

  const openAffiliateDetail = (id: string) => {
    if (!slug) return;
    setMainTab("affiliates");
    navigate(`/wl/${slug}/dashboard?tab=affiliates&view=${encodeURIComponent(id)}`, { replace: true });
  };

  const closeAffiliateDetail = () => {
    if (!slug) return;
    navigate(`/wl/${slug}/dashboard?tab=affiliates`, { replace: true });
  };
  const [affDialogOpen, setAffDialogOpen] = useState(false);
  const [affSaving, setAffSaving] = useState(false);
  const [affEditingId, setAffEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState(defaultAffForm);
  const [tempCredentials, setTempCredentials] = useState<{ email: string; temp_password: string } | null>(null);
  const [algoRows, setAlgoRows] = useState<any[]>([]);
  const [algoLoading, setAlgoLoading] = useState(false);

  const expired = isTenantExpired(tenant);
  const days = tenant ? daysRemaining(tenant.ends_on) : 0;
  const color = tenant?.brand_primary_color ?? "#06b6d4";

  useEffect(() => {
    const checkMembership = async () => {
      if (!tenant?.id || !user?.id) {
        setMembershipRole(null);
        setMembershipStatus(null);
        setMembershipLoading(false);
        return;
      }
      setMembershipLoading(true);
      const { data } = await (supabase as any)
        .from("white_label_tenant_users")
        .select("role,status")
        .eq("tenant_id", tenant.id)
        .eq("user_id", user.id)
        .maybeSingle();
      setMembershipRole((data?.role as "admin" | "user" | undefined) ?? null);
      setMembershipStatus((data?.status as string | undefined) ?? null);
      setMembershipLoading(false);
    };
    checkMembership();
  }, [tenant?.id, user?.id]);

  useEffect(() => {
    const checkPayment = async () => {
      if (!tenant || !user?.email) {
        setHasPaidAccess(false);
        setPaymentToken(null);
        setPaymentCheckLoading(false);
        return;
      }
      setPaymentCheckLoading(true);
      // Active tenant status OR stripe subscription both mean paid access
      if (tenant.status === "active" || Boolean((tenant as any).stripe_subscription_id)) {
        setHasPaidAccess(true);
        setPaymentToken(null);
        setPaymentCheckLoading(false);
        return;
      }

      const { data } = await (supabase as any)
        .from("wl_payment_requests")
        .select("token,status,expires_at")
        .eq("slug", tenant.slug)
        .eq("email", (user.email ?? "").toLowerCase())
        .order("created_at", { ascending: false });
      const rows = Array.isArray(data) ? data : [];
      const paid = rows.some((r: any) => r.status === "paid");
      const now = new Date();
      const pending = rows.find((r: any) => r.status === "pending" && new Date(r.expires_at) > now);

      setHasPaidAccess(paid);
      setPaymentToken(pending?.token ?? null);
      setPaymentCheckLoading(false);
    };
    checkPayment();
  }, [tenant, user?.email]);

  const loadAlgoRequests = async () => {
    if (!tenant?.id || !user?.id) return;
    setAlgoLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-algo-requests", {
        body: { tenant_id: tenant.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw res.error;
      setAlgoRows(((res.data as { rows?: any[] } | null)?.rows) ?? []);
    } catch {
      setAlgoRows([]);
    } finally {
      setAlgoLoading(false);
    }
  };

  useEffect(() => {
    loadAlgoRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, user?.id]);

  /* ── Authentication & Security Guard ── */
  if (authLoading || tenantLoading || membershipLoading || paymentCheckLoading) {
    return (
      <div className="min-h-screen bg-background p-8 space-y-6">
        <div className="flex justify-between items-center"><Skeleton className="h-10 w-48" /><Skeleton className="h-10 w-32" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" /></div>
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-center px-4">
        <div className="space-y-4 max-w-sm">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold text-white">Partner portal not found</h1>
          <p className="text-muted-foreground text-sm">The white-label link is invalid or the portal has been deactivated. Please contact support.</p>
          <Button asChild variant="outline" className="mt-4"><Link to="/">Back to Home</Link></Button>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to={`/wl/${slug}`} replace />;
  if ((user as any).user_metadata?.need_password_reset) {
    return <Navigate to={`/auth/change-password?redirect=${encodeURIComponent(`/wl/${slug}/dashboard`)}`} replace />;
  }

  if (!membershipRole || membershipStatus !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-center px-4">
        <div className="space-y-4 max-w-md">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-white">Access Restricted</h1>
          <p className="text-sm text-muted-foreground">
            Your account is not an active member of this white-label tenant.
          </p>
          <Button asChild variant="outline"><Link to={`/wl/${slug}`}>Back to login</Link></Button>
        </div>
      </div>
    );
  }

  if (!hasPaidAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-center px-4">
        <div className="space-y-4 max-w-md">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-white">Dashboard Locked</h1>
          <p className="text-sm text-muted-foreground">
            Your white-label admin panel unlocks after payment is completed.
          </p>
          <div className="flex items-center justify-center gap-2">
            {paymentToken ? (
              <Button className="bg-cyan-600 hover:bg-cyan-500" onClick={() => navigate(`/wl-checkout/${paymentToken}`)}>
                Pay and Unlock
              </Button>
            ) : (
              <Button className="bg-cyan-600 hover:bg-cyan-500" onClick={() => navigate("/white-label#pricing")}>
                Go to Pricing
              </Button>
            )}
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate(`/wl/${slug}`); }}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Business Logic Handlers ── */
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate(`/wl/${slug}`);
  };

  const handleSaveAffiliate = async (formData: typeof defaultAffForm) => {
    setAffSaving(true);
    try {
      if (affEditingId) {
        const { error } = await (supabase as any).from("affiliates").update(formData).eq("id", affEditingId);
        if (error) throw error;
        toast.success("Affiliate updated successfully");
      } else {
        const { data, error } = await supabase.functions.invoke("wl-create-affiliate", {
          body: { ...formData, tenant_id: tenant!.id, code: formData.code.toLowerCase().replace(/\s+/g, "") }
        });
        if (error) throw error;
        setTempCredentials({ email: data.email, temp_password: data.temp_password });
        toast.success("Affiliate created successfully");
      }
      setAffDialogOpen(false);
      refreshAffiliates();
    } catch (err: any) {
      toast.error(err.message || "Operation failed");
    } finally {
      setAffSaving(false);
    }
  };

  const handleResetPassword = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("wl-reset-affiliate-password", { body: { affiliate_id: id } });
      if (error) throw error;
      setTempCredentials({ email: data.email, temp_password: data.temp_password });
      toast.success("Temporary password generated");
    } catch (err: any) {
      toast.error("Password reset failed");
    }
  };

  const handleToggleActive = async (aff: AffiliateRow) => {
    try {
      const { error } = await (supabase as any).from("affiliates").update({ is_active: !aff.is_active }).eq("id", aff.id);
      if (error) throw error;
      toast.success(!aff.is_active ? "Affiliate activated" : "Affiliate suspended");
      refreshAffiliates();
    } catch (err: any) {
      toast.error("Failed to update status");
    }
  };

  const handleDeleteAffiliate = async (aff: AffiliateRow) => {
    if (!window.confirm(`Are you sure you want to delete ${aff.name}?`)) return;
    try {
      const { error } = await (supabase as any).from("affiliates").delete().eq("id", aff.id);
      if (error) throw error;
      toast.success("Affiliate removed");
      refreshAffiliates();
    } catch (err: any) {
      toast.error("Failed to delete affiliate");
    }
  };

  /* ── UI Render Bits ── */
  return (
    <div className="min-h-screen bg-black text-white selection:bg-cyan-500/30">
      {/* Top Navigation */}
      <nav className="border-b border-white/5 bg-zinc-950/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {tenant?.brand_logo_url ? <img src={tenant.brand_logo_url} className="h-8 object-contain" /> : <div className="h-8 w-8 rounded-lg flex items-center justify-center font-bold" style={{ background: color }}>{tenant?.brand_name.charAt(0)}</div>}
            <span className="font-bold text-lg tracking-tight" style={{ color }}>{tenant?.brand_name} <span className="text-zinc-500 font-medium ml-1">Portal</span></span>
          </div>
          <div className="flex items-center gap-4">
             <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-zinc-500 hover:text-white gap-2 transition-colors"><LogOut className="h-4 w-4" /> Sign out</Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Alerts & Notifications */}
        {expired && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 flex items-start gap-4 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="space-y-1">
              <p className="font-bold text-red-400">{tenant?.status === "suspended" ? "Portal Suspended" : "Subscription Expired"}</p>
              <p className="text-sm text-zinc-400">Please contact support to renew your partner subscription for {tenant?.brand_name}.</p>
            </div>
          </div>
        )}

        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)} className="space-y-8">
          <TabsList className="bg-zinc-900/50 border border-white/5 p-1 rounded-xl">
            <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-cyan-600 data-[state=active]:text-white transition-all text-xs font-medium px-6"><CalendarDays className="h-3.5 w-3.5 mr-2" /> Overview</TabsTrigger>
            <TabsTrigger value="affiliates" className="rounded-lg data-[state=active]:bg-cyan-600 data-[state=active]:text-white transition-all text-xs font-medium px-6"><Users className="h-3.5 w-3.5 mr-2" /> Affiliate Management</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <BrandedLinkBoard slug={slug!} brandName={tenant?.brand_name!} brandColor={color} />
                <Card className="glass-panel border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-bold text-base flex items-center gap-2"><Users className="h-4 w-4 text-cyan-400" /> Users List</h3>
                    <Badge variant="outline" className="border-cyan-500/20 text-cyan-400">{users.length} Total</Badge>
                  </div>
                  <UserTable users={users} loading={loadingUsers} />
                </Card>

                <Card className="glass-panel border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
                  <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-bold text-base flex items-center gap-2"><Zap className="h-4 w-4 text-cyan-400" /> Algo Onboarding</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-cyan-500/20 text-cyan-400">{algoRows.length} Requests</Badge>
                      <Button variant="ghost" size="sm" onClick={loadAlgoRequests} className="text-zinc-500 hover:text-cyan-300">
                        <RefreshCw className={`h-3.5 w-3.5 ${algoLoading ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </div>
                  <CardContent className="p-0">
                    {algoLoading ? (
                      <div className="p-6 text-sm text-zinc-500">Loading onboarding requests…</div>
                    ) : algoRows.length === 0 ? (
                      <div className="p-6 text-sm text-zinc-500">No onboarding forms yet from your users.</div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {algoRows.slice(0, 10).map((row) => (
                          <div key={row.id} className="px-6 py-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-white">{row.full_name}</p>
                              <p className="text-xs text-zinc-500">
                                {row.broker} · {row.strategy_pref ?? "no strategy"} · {new Date(row.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge className={`text-[10px] border ${
                              row.status === "pending"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                : row.status === "provisioned" || row.status === "active"
                                  ? "bg-teal-500/20 text-teal-300 border-teal-500/40"
                                  : "bg-zinc-800 text-zinc-300 border-zinc-700"
                            }`}>
                              {row.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              <div className="space-y-6">
                <Card className="glass-panel border-white/10 bg-white/5 p-6 space-y-4">
                  <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Subscription Details</h4>
                  <div className="space-y-4">
                    <DetailItem label="Current Plan" value={tenant?.subscription_plan === "2_year" ? "Platinum (2 Year)" : "Standard (1 Year)"} />
                    <DetailItem label="Start Date" value={new Date(tenant?.starts_on!).toLocaleDateString()} />
                    <DetailItem label="Expiry Date" value={new Date(tenant?.ends_on!).toLocaleDateString()} />
                    <DetailItem label="Status" value={<Badge className="bg-green-500/10 text-green-500 border-green-500/20">{tenant?.status}</Badge>} />
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="affiliates" className="space-y-8">
            <DashboardStats affiliates={affiliates} />
            <div className="flex justify-between items-center bg-zinc-900/40 p-3 rounded-2xl border border-white/5 backdrop-blur-sm">
                <Button variant="ghost" onClick={refreshAffiliates} size="sm" className="text-zinc-500 hover:text-cyan-400 transition-colors">
                  <RefreshCw className={`h-4 w-4 mr-2 ${loadingAffiliates ? "animate-spin" : ""}`} /> Refresh Data
                </Button>
                <Button onClick={() => { setAffEditingId(null); setEditingData(defaultAffForm); setAffDialogOpen(true); }} className="bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/20 gap-2">
                  <PlusCircle className="h-4 w-4" /> Add New Affiliate
                </Button>
            </div>
            <AffiliateTable
              affiliates={affiliates}
              onViewDetail={(aff) => openAffiliateDetail(aff.id)}
              onEdit={(aff) => { setAffEditingId(aff.id); setEditingData({ ...aff }); setAffDialogOpen(true); }}
              onResetPassword={handleResetPassword}
              onToggleActive={handleToggleActive}
              onDelete={handleDeleteAffiliate}
            />
          </TabsContent>
        </Tabs>
      </main>

      {isWLAdmin && slug ? (
        <AffiliateDetailModal
          open={!!affiliateViewId}
          onOpenChange={(open) => {
            if (!open) closeAffiliateDetail();
          }}
          affiliateId={affiliateViewId}
          surface="wl"
          backLabel="Back to affiliates"
        />
      ) : null}

      {/* Modular Dialogs */}
      <CreateAffiliateDialog
        open={affDialogOpen}
        onOpenChange={setAffDialogOpen}
        editingId={affEditingId}
        initialData={editingData}
        onSave={handleSaveAffiliate}
        saving={affSaving}
      />
      {/* Temp Credentials Dialog */}
      {tempCredentials && (
        <Dialog open={!!tempCredentials} onOpenChange={(o) => !o && setTempCredentials(null)}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
             <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-500" /> Success</DialogTitle></DialogHeader>
             <div className="py-4 space-y-4">
                <p className="text-sm text-zinc-400">Please share these temporary credentials with the affiliate:</p>
                <div className="bg-black/40 p-4 rounded-xl border border-white/10 font-mono text-sm space-y-2">
                   <p><span className="text-zinc-500">Email:</span> {tempCredentials.email}</p>
                   <p><span className="text-zinc-500">Pass:</span> {tempCredentials.temp_password}</p>
                </div>
                <Button className="w-full bg-cyan-600 h-10" onClick={() => { navigator.clipboard.writeText(`Email: ${tempCredentials.email}\nPass: ${tempCredentials.temp_password}`); toast.success("Copied to clipboard"); }}>Copy Credentials</Button>
             </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{label}</span>
      <span className="text-sm font-medium text-zinc-200">{value}</span>
    </div>
  );
}
