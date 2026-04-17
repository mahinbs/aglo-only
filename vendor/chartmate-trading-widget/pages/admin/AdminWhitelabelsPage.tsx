import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { PlusCircle, Pencil, Power, Users, Link2, CalendarDays, Loader2, AlertTriangle, CheckCircle2, SendHorizonal, Copy, KeyRound } from "lucide-react";
import { daysRemaining } from "@/hooks/useWhitelabel";
import type { WhitelabelTenant } from "@/hooks/useWhitelabel";
import { useAdmin } from "@/hooks/useAdmin";

const EMPTY: Partial<WhitelabelTenant> & { password?: string } = {
  slug: "",
  brand_name: "",
  brand_logo_url: "",
  brand_primary_color: "#6366f1",
  brand_tagline: "",
  owner_email: "",
  subscription_plan: "1_year",
  starts_on: new Date().toISOString().slice(0, 10),
  ends_on: "",
  status: "active",
};

function planEndsOn(startsOn: string, plan: string): string {
  const d = new Date(startsOn);
  d.setFullYear(d.getFullYear() + (plan === "2_year" ? 2 : 1));
  return d.toISOString().slice(0, 10);
}

function statusBadge(row: WhitelabelTenant) {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === "suspended") return <Badge variant="destructive">Suspended</Badge>;
  if (today > row.ends_on) return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/40 border">Expired</Badge>;
  const days = daysRemaining(row.ends_on);
  if (days <= 30) return <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/40 border">Expires in {days}d</Badge>;
  return <Badge className="bg-green-500/20 text-green-600 border-green-500/40 border">Active</Badge>;
}

export default function AdminWhitelabelsPage() {
  const { isSuperAdmin } = useAdmin();
  const [tenants, setTenants] = useState<WhitelabelTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [isEdit, setIsEdit] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<Record<string, number>>({});

  // 5-year payment link dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSending, setLinkSending] = useState(false);
  const [linkForm, setLinkForm] = useState({ email: "", brand_name: "", slug: "" });
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [ownerTempCredentials, setOwnerTempCredentials] = useState<{ email: string; temp_password: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("white_label_tenants").select("*").order("created_at", { ascending: false });
    const rows: WhitelabelTenant[] = data ?? [];
    setTenants(rows);

    // Fetch user counts per tenant
    const { data: userRows } = await (supabase as any).from("white_label_tenant_users").select("tenant_id");
    const counts: Record<string, number> = {};
    (userRows ?? []).forEach((r: any) => { counts[r.tenant_id] = (counts[r.tenant_id] ?? 0) + 1; });
    setTenantUsers(counts);

    // Auto-expire tenants whose ends_on has passed
    const today = new Date().toISOString().slice(0, 10);
    const toExpire = rows.filter((t) => t.status === "active" && today > t.ends_on);
    for (const t of toExpire) {
      await (supabase as any).from("white_label_tenants").update({ status: "expired" }).eq("id", t.id);
      await (supabase as any).from("white_label_tenant_users").update({ status: "suspended" }).eq("tenant_id", t.id);
    }
    if (toExpire.length) setTenants((prev) => prev.map((t) => toExpire.find((e) => e.id === t.id) ? { ...t, status: "expired" } : t));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    const starts = new Date().toISOString().slice(0, 10);
    setForm({ ...EMPTY, starts_on: starts, ends_on: planEndsOn(starts, "1_year") });
    setIsEdit(false);
    setOpen(true);
  };

  const openEdit = (t: WhitelabelTenant) => {
    setForm({ ...t });
    setIsEdit(true);
    setOpen(true);
  };

  const handlePlanChange = (plan: string) => {
    setForm((f) => ({ ...f, subscription_plan: plan, ends_on: planEndsOn(f.starts_on ?? new Date().toISOString().slice(0, 10), plan) }));
  };

  const handleStartChange = (starts: string) => {
    setForm((f) => ({ ...f, starts_on: starts, ends_on: planEndsOn(starts, f.subscription_plan ?? "1_year") }));
  };

  const save = async () => {
    if (!form.slug?.trim() || !form.brand_name?.trim()) {
      toast.error("Slug and brand name are required"); return;
    }
    if (!isEdit && !form.owner_email?.trim()) {
      toast.error("Owner email is required"); return;
    }
    if (isEdit && (!form.starts_on || !form.ends_on)) {
      toast.error("Start and end dates are required for existing tenants"); return;
    }
    setSaving(true);
    try {
      const payload = {
        slug: form.slug!.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-"),
        brand_name: form.brand_name!.trim(),
        brand_logo_url: form.brand_logo_url || null,
        brand_primary_color: form.brand_primary_color || "#6366f1",
        brand_tagline: form.brand_tagline || null,
        owner_email: form.owner_email || null,
        subscription_plan: form.subscription_plan || "1_year",
        starts_on: form.starts_on,
        ends_on: form.ends_on,
        status: form.status || "active",
        updated_at: new Date().toISOString(),
      };

      if (isEdit && form.id) {
        const { error } = await (supabase as any).from("white_label_tenants").update(payload).eq("id", form.id);
        if (error) throw error;

        // If owner email provided and changed, find user and upsert membership as admin
        if (form.owner_email) {
          const { data: profile } = await supabase.from("watchlists" as any).select("user_id").limit(1); // dummy to keep ts happy
          // Use auth admin via edge function instead — just store owner_email for reference
        }
        toast.success("White-label tenant updated");
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await supabase.functions.invoke("admin-create-whitelabel-tenant", {
          body: payload,
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (res.error) throw new Error(res.error.message ?? "Create failed");
        const data = res.data as { email?: string; temp_password?: string; error?: string };
        if (data.error) throw new Error(data.error);
        if (!data.email || !data.temp_password) throw new Error("Temporary credentials were not returned");
        setOwnerTempCredentials({ email: data.email, temp_password: data.temp_password });
        toast.success("White-label user created. Share temporary credentials.");
      }
      setOpen(false);
      load();
    } catch (e: any) {
      const msg = e?.message || "Save failed";
      if (/Failed to fetch|CORS|Edge Function/i.test(msg)) {
        toast.error("Edge function not reachable. Deploy `admin-create-whitelabel-tenant` and retry.");
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (t: WhitelabelTenant) => {
    const next = t.status === "suspended" ? "active" : "suspended";
    await (supabase as any).from("white_label_tenants").update({ status: next }).eq("id", t.id);
    // Also suspend/restore all tenant users
    await (supabase as any).from("white_label_tenant_users").update({ status: next === "suspended" ? "suspended" : "active" }).eq("tenant_id", t.id);
    toast.success(`Tenant ${next === "suspended" ? "suspended" : "re-activated"}`);
    load();
  };

  const appUrl = window.location.origin;

  const handleSendLink = async () => {
    if (!linkForm.email.trim() || !linkForm.brand_name.trim() || !linkForm.slug.trim()) {
      toast.error("Email, brand name, and slug are all required"); return;
    }
    setLinkSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("create-wl-payment-link", {
        body: {
          email:      linkForm.email.trim().toLowerCase(),
          brand_name: linkForm.brand_name.trim(),
          slug:       linkForm.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message ?? "Failed");
      const data = res.data as { payment_url?: string; error?: string };
      if (data.error) throw new Error(data.error);
      setGeneratedLink(data.payment_url ?? null);
      toast.success("Payment link generated!");
    } catch (e: any) {
      toast.error(e?.message || "Failed to generate link");
    } finally {
      setLinkSending(false);
    }
  };

  const handleResetOwnerPassword = async (tenantId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-reset-whitelabel-password", {
        body: { tenant_id: tenantId },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message ?? "Failed");
      const data = res.data as { email?: string; temp_password?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.email || !data.temp_password) throw new Error("Temporary credentials were not returned");
      setOwnerTempCredentials({ email: data.email, temp_password: data.temp_password });
      toast.success("Temporary owner password generated");
    } catch (e: any) {
      const msg = e?.message || "Password reset failed";
      if (/Failed to fetch|CORS|Edge Function/i.test(msg)) {
        toast.error("Edge function not reachable. Deploy `admin-reset-whitelabel-password` and retry.");
      } else {
        toast.error(msg);
      }
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-bold text-white">Super Admin Only</h2>
        <p className="text-zinc-400 text-sm max-w-sm">
          White-label tenant management is restricted to the platform super-admin. You do not have access to this section.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">White-label Partners</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage reseller / white-label tenants. Each gets a branded login page and their own dashboard.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10" onClick={() => { setLinkForm({ email: "", brand_name: "", slug: "" }); setGeneratedLink(null); setLinkOpen(true); }}>
            <SendHorizonal className="h-4 w-4" /> Send 5yr Payment Link
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <PlusCircle className="h-4 w-4" /> New White-label
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: tenants.length, icon: Users },
          { label: "Active", value: tenants.filter((t) => t.status === "active" && new Date().toISOString().slice(0, 10) <= t.ends_on).length, icon: CheckCircle2 },
          { label: "Expired", value: tenants.filter((t) => t.status === "expired" || (t.status === "active" && new Date().toISOString().slice(0, 10) > t.ends_on)).length, icon: CalendarDays },
          { label: "Suspended", value: tenants.filter((t) => t.status === "suspended").length, icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="glass-panel">
            <CardContent className="pt-4 flex items-center gap-3">
              <Icon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold text-white">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white text-base">All Tenants</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 py-10 text-muted-foreground justify-center">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : tenants.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">No white-label tenants yet. Create one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Brand</TableHead>
                  <TableHead className="text-muted-foreground">Login Link</TableHead>
                  <TableHead className="text-muted-foreground">Plan</TableHead>
                  <TableHead className="text-muted-foreground">Dates</TableHead>
                  <TableHead className="text-muted-foreground">Users</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.id} className="border-white/5 hover:bg-white/5">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {t.brand_logo_url && <img src={t.brand_logo_url} alt="" className="h-6 w-6 rounded object-contain bg-white/10" />}
                        <div>
                          <p className="font-medium text-zinc-200">{t.brand_name}</p>
                          <p className="text-xs text-muted-foreground">{t.owner_email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        className="flex items-center gap-1 text-xs text-primary hover:underline font-mono"
                        onClick={() => { navigator.clipboard.writeText(`${appUrl}/wl/${t.slug}`); toast.success("Link copied!"); }}
                      >
                        <Link2 className="h-3 w-3" />
                        /wl/{t.slug}
                      </button>
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm">{t.subscription_plan === "2_year" ? "2 Years" : "1 Year"}</TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {t.starts_on} → {t.ends_on}
                    </TableCell>
                    <TableCell className="text-zinc-300">{tenantUsers[t.id] ?? 0}</TableCell>
                    <TableCell>{statusBadge(t)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-blue-400 hover:text-blue-300" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-7 px-2 ${t.status === "suspended" ? "text-green-400 hover:text-green-300" : "text-red-400 hover:text-red-300"}`}
                          onClick={() => toggleStatus(t)}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-cyan-400 hover:text-cyan-300"
                          onClick={() => handleResetOwnerPassword(t.id)}
                          title="Reset white-label owner password"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 5-year payment link dialog */}
      <Dialog open={linkOpen} onOpenChange={(v) => { setLinkOpen(v); if (!v) setGeneratedLink(null); }}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <SendHorizonal className="h-4 w-4 text-cyan-400" />
              Send 5-Year WL Payment Link
            </DialogTitle>
          </DialogHeader>
          {!generatedLink ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-zinc-400">
                Generate a single-use $3,399 payment link for a specific partner.
                Only that partner's email can complete the payment.
              </p>
              <div>
                <Label className="text-zinc-300">Partner Email *</Label>
                <Input
                  type="email"
                  placeholder="partner@example.com"
                  value={linkForm.email}
                  onChange={(e) => setLinkForm((f) => ({ ...f, email: e.target.value }))}
                  className="bg-zinc-900 border-white/10 mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-300">Brand Name *</Label>
                <Input
                  placeholder="Acme Trading"
                  value={linkForm.brand_name}
                  onChange={(e) => setLinkForm((f) => ({ ...f, brand_name: e.target.value }))}
                  className="bg-zinc-900 border-white/10 mt-1"
                />
              </div>
              <div>
                <Label className="text-zinc-300">URL Slug * <span className="text-xs text-muted-foreground">(e.g. acme-trading)</span></Label>
                <Input
                  placeholder="acme-trading"
                  value={linkForm.slug}
                  onChange={(e) => setLinkForm((f) => ({ ...f, slug: e.target.value }))}
                  className="bg-zinc-900 border-white/10 mt-1 font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-0.5">{appUrl}/wl/{linkForm.slug || "slug"}</p>
              </div>
              <div className="rounded-lg bg-cyan-950/40 border border-cyan-500/30 px-4 py-3 text-xs text-cyan-400">
                🔒 The link will only work for <strong>{linkForm.email || "the specified email"}</strong>.
                Any other logged-in user will be blocked from paying.
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">Link generated!</span>
              </div>
              <p className="text-sm text-zinc-400">Share this link with <strong className="text-white">{linkForm.email}</strong>. It expires in 7 days.</p>
              <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2">
                <span className="text-xs text-cyan-400 font-mono flex-1 truncate">{generatedLink}</span>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 px-2 text-zinc-400 hover:text-white shrink-0"
                  onClick={() => { navigator.clipboard.writeText(generatedLink!); toast.success("Copied!"); }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                The link is valid for 7 days. Once paid it cannot be reused.
                You can view pending requests in your database under <code className="text-zinc-400">wl_payment_requests</code>.
              </p>
            </div>
          )}
          <DialogFooter>
            {!generatedLink ? (
              <>
                <Button variant="outline" onClick={() => setLinkOpen(false)} className="border-white/10">Cancel</Button>
                <Button
                  onClick={handleSendLink}
                  disabled={linkSending || !linkForm.email || !linkForm.brand_name || !linkForm.slug}
                  className="bg-cyan-600 hover:bg-cyan-500"
                >
                  {linkSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <SendHorizonal className="h-4 w-4 mr-2" />}
                  Generate Link
                </Button>
              </>
            ) : (
              <Button onClick={() => setLinkOpen(false)} className="w-full">Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg bg-zinc-950 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">{isEdit ? "Edit White-label Tenant" : "New White-label User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">Brand Name *</Label>
                <Input value={form.brand_name ?? ""} onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))} placeholder="Acme Trading" className="bg-zinc-900 border-white/10 mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">URL Slug * <span className="text-xs text-muted-foreground">(login URL key)</span></Label>
                <Input value={form.slug ?? ""} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="acme-trading" className="bg-zinc-900 border-white/10 mt-1 font-mono" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{appUrl}/wl/{form.slug || "slug"}</p>
              </div>
            </div>

            <div>
              <Label className="text-zinc-300">Tagline</Label>
              <Input value={form.brand_tagline ?? ""} onChange={(e) => setForm((f) => ({ ...f, brand_tagline: e.target.value }))} placeholder="Smart trading for everyone" className="bg-zinc-900 border-white/10 mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-zinc-300">Logo URL</Label>
                <Input value={form.brand_logo_url ?? ""} onChange={(e) => setForm((f) => ({ ...f, brand_logo_url: e.target.value }))} placeholder="https://…" className="bg-zinc-900 border-white/10 mt-1" />
              </div>
              <div>
                <Label className="text-zinc-300">Brand Color</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={form.brand_primary_color ?? "#6366f1"} onChange={(e) => setForm((f) => ({ ...f, brand_primary_color: e.target.value }))} className="h-9 w-10 rounded border border-white/10 bg-transparent cursor-pointer" />
                  <Input value={form.brand_primary_color ?? ""} onChange={(e) => setForm((f) => ({ ...f, brand_primary_color: e.target.value }))} className="bg-zinc-900 border-white/10 font-mono text-sm" />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-zinc-300">Owner Email <span className="text-xs text-muted-foreground">(white-label admin's email)</span></Label>
              <Input value={form.owner_email ?? ""} onChange={(e) => setForm((f) => ({ ...f, owner_email: e.target.value }))} placeholder="partner@example.com" className="bg-zinc-900 border-white/10 mt-1" />
            </div>

            {isEdit && (
              <>
                <div>
                  <Label className="text-zinc-300">Subscription Plan</Label>
                  <Select value={form.subscription_plan ?? "1_year"} onValueChange={handlePlanChange}>
                    <SelectTrigger className="bg-zinc-900 border-white/10 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1_year">1 Year</SelectItem>
                      <SelectItem value="2_year">2 Years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-zinc-300">Starts On (date)</Label>
                    <Input type="date" value={form.starts_on ?? ""} onChange={(e) => handleStartChange(e.target.value)} className="bg-zinc-900 border-white/10 mt-1" />
                  </div>
                  <div>
                    <Label className="text-zinc-300">Ends On (date) — auto-set</Label>
                    <Input type="date" value={form.ends_on ?? ""} onChange={(e) => setForm((f) => ({ ...f, ends_on: e.target.value }))} className="bg-zinc-900 border-white/10 mt-1" />
                  </div>
                </div>
              </>
            )}

            {!isEdit && (
              <div className="rounded-lg bg-cyan-950/40 border border-cyan-500/30 px-4 py-3 text-xs text-cyan-400">
                This creates the white-label login user and temporary password first.
                Generate the 5-year payment link separately after form review.
              </div>
            )}

            {isEdit && (
              <div>
                <Label className="text-zinc-300">Status</Label>
                <Select value={form.status ?? "active"} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-white/10 mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="border-white/10">Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isEdit ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ownerTempCredentials && (
        <Dialog open={!!ownerTempCredentials} onOpenChange={(o) => !o && setOwnerTempCredentials(null)}>
          <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Owner Temporary Credentials
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p className="text-sm text-zinc-400">Share this with the white-label owner. They must reset it on first login.</p>
              <div className="bg-black/40 p-4 rounded-xl border border-white/10 font-mono text-sm space-y-2">
                <p><span className="text-zinc-500">Email:</span> {ownerTempCredentials.email}</p>
                <p><span className="text-zinc-500">Pass:</span> {ownerTempCredentials.temp_password}</p>
              </div>
              <Button
                className="w-full bg-cyan-600 h-10"
                onClick={() => {
                  navigator.clipboard.writeText(`Email: ${ownerTempCredentials.email}\nPass: ${ownerTempCredentials.temp_password}`);
                  toast.success("Copied to clipboard");
                }}
              >
                Copy Credentials
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
