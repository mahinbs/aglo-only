import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RefreshCw, PlusCircle, Pencil, Link2, Copy, Check, Trash2, Ban, RotateCcw, Eye, Users, FileText, DollarSign, Percent, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AffiliateDetailModal } from "@/components/affiliate/AffiliateDetailModal";

interface AffiliateRow {
  id: string;
  code: string;
  name: string;
  email: string;
  commission_percent: number;
  is_active: boolean;
  created_at: string;
  unique_visitors: number;
  referred_signups: number;
  form_submissions: number;
  total_commission: number;
  payments_count: number;
  phone?: string;
  commission_type?: string;
  fixed_amount?: number;
  tier_config?: any;
  recurring_config?: any;
}

const defaultForm = {
  code: "",
  name: "",
  email: "",
  phone: "",
  commission_percent: 10,
  commission_type: "percentage",
  fixed_amount: 0,
  tier_config: [],
  recurring_config: {},
  is_active: true
};

export default function AdminAffiliatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const detailAffiliateId = searchParams.get("view");
  const closeAffiliateDetail = () => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.delete("view");
        return n;
      },
      { replace: true },
    );
  };
  const openAffiliateDetail = (id: string) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("view", id);
        return n;
      },
      { replace: true },
    );
  };
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<{ email: string; temp_password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const { data: affiliates, error: e1 } = await (supabase as any)
        .from("affiliates")
        .select("id, code, name, email, phone, commission_percent, commission_type, fixed_amount, tier_config, recurring_config, is_active, created_at")
        .order("created_at", { ascending: false });

      if (e1) throw e1;

      const list: AffiliateRow[] = (affiliates ?? []).map((a: any) => ({
        ...a,
        unique_visitors: 0,
        referred_signups: 0,
        form_submissions: 0,
        total_commission: 0,
        payments_count: 0,
      }));

      const ids = list.map((a) => a.id);
      if (ids.length === 0) {
        setRows(list);
        setLoading(false);
        return;
      }

      const { data: visitors } = await (supabase as any)
        .from("affiliate_visitors")
        .select("affiliate_id");
      const visitorCount: Record<string, number> = {};
      (visitors ?? []).forEach((v: any) => {
        visitorCount[v.affiliate_id] = (visitorCount[v.affiliate_id] ?? 0) + 1;
      });

      const { data: signups } = await (supabase as any)
        .from("user_signup_profiles")
        .select("affiliate_id")
        .in("affiliate_id", ids);
      const signupCount: Record<string, number> = {};
      (signups ?? []).forEach((row: any) => {
        if (row.affiliate_id) signupCount[row.affiliate_id] = (signupCount[row.affiliate_id] ?? 0) + 1;
      });

      const { data: submissions } = await (supabase as any)
        .from("contact_submissions")
        .select("affiliate_id")
        .in("affiliate_id", ids);
      const submissionCount: Record<string, number> = {};
      (submissions ?? []).forEach((s: any) => {
        if (s.affiliate_id) submissionCount[s.affiliate_id] = (submissionCount[s.affiliate_id] ?? 0) + 1;
      });

      const { data: payments } = await (supabase as any)
        .from("user_payments")
        .select("affiliate_id, commission_amount")
        .in("affiliate_id", ids);
      const commissionSum: Record<string, number> = {};
      const paymentCount: Record<string, number> = {};
      (payments ?? []).forEach((p: any) => {
        if (p.affiliate_id) {
          commissionSum[p.affiliate_id] = (commissionSum[p.affiliate_id] ?? 0) + Number(p.commission_amount ?? 0);
          paymentCount[p.affiliate_id] = (paymentCount[p.affiliate_id] ?? 0) + 1;
        }
      });

      list.forEach((a) => {
        a.unique_visitors = visitorCount[a.id] ?? 0;
        a.referred_signups = signupCount[a.id] ?? 0;
        a.form_submissions = submissionCount[a.id] ?? 0;
        a.total_commission = commissionSum[a.id] ?? 0;
        a.payments_count = paymentCount[a.id] ?? 0;
      });

      setRows(list);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load affiliates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(defaultForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (r: AffiliateRow) => {
    setForm({
      code: r.code,
      name: r.name,
      email: r.email,
      phone: r.phone || "",
      commission_percent: r.commission_percent,
      commission_type: r.commission_type || "percentage",
      fixed_amount: r.fixed_amount || 0,
      tier_config: r.tier_config || [],
      recurring_config: r.recurring_config || {},
      is_active: r.is_active,
    });
    setEditingId(r.id);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.email.trim()) {
      toast.error("Code, name and email are required");
      return;
    }
    setSaving(true);
    setTempPasswordResult(null);
    try {
      if (editingId) {
        const { error } = await (supabase as any)
          .from("affiliates")
          .update({
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            commission_percent: form.commission_type === "percentage" || form.commission_type === "recurring" 
              ? (Number(form.commission_percent) || 0) 
              : 0,
            commission_type: form.commission_type,
            fixed_amount: form.commission_type === "fixed" ? (Number(form.fixed_amount) || 0) : 0,
            tier_config: form.tier_config,
            recurring_config: form.recurring_config,
            is_active: form.is_active,
          })
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Affiliate updated");
        setDialogOpen(false);
      } else {
        const { data, error } = await supabase.functions.invoke("admin-create-affiliate", {
          body: {
            code: form.code.trim().toLowerCase().replace(/\s+/g, ""),
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            commission_percent: form.commission_type === "percentage" || form.commission_type === "recurring" 
              ? (Number(form.commission_percent) || 0) 
              : 0,
            commission_type: form.commission_type,
            fixed_amount: form.commission_type === "fixed" ? (Number(form.fixed_amount) || 0) : 0,
            tier_config: form.tier_config,
            recurring_config: form.recurring_config,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Affiliate created. Share the temporary password with the affiliate.");
        setDialogOpen(false);
        setTempPasswordResult({ email: data.email ?? form.email, temp_password: data.temp_password ?? "" });
      }
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const copyTempPassword = () => {
    if (!tempPasswordResult) return;
    const text = `Email: ${tempPasswordResult.email}\nTemporary password: ${tempPasswordResult.temp_password}\n(They must change this on first login.)`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const linkUrl = (code: string) => {
    const base = window.location.origin;
    return `${base}/?ref=${encodeURIComponent(code)}`;
  };

  const resetAffiliatePassword = async (affiliateId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-reset-affiliate-password", {
        body: { affiliate_id: affiliateId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTempPasswordResult({
        email: data.email,
        temp_password: data.temp_password,
      });
      toast.success("Temporary password generated. Share it with the affiliate.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to reset password");
    }
  };

  const toggleAffiliateActive = async (row: AffiliateRow) => {
    try {
      const next = !row.is_active;
      const { error } = await (supabase as any)
        .from("affiliates")
        .update({ is_active: next })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(next ? "Affiliate activated" : "Affiliate suspended");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update status");
    }
  };

  const deleteAffiliate = async (row: AffiliateRow) => {
    const ok = window.confirm(
      `Delete affiliate "${row.name}" (${row.code})?\nThis will remove their affiliate record and stats, but not their Supabase auth user.`,
    );
    if (!ok) return;
    try {
      const { error } = await (supabase as any)
        .from("affiliates")
        .delete()
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Affiliate deleted");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete affiliate");
    }
  };

  const totalVisitors = rows.reduce((s, r) => s + r.unique_visitors, 0);
  const totalSignups = rows.reduce((s, r) => s + r.referred_signups, 0);
  const totalSubmissions = rows.reduce((s, r) => s + r.form_submissions, 0);
  const totalPayments = rows.reduce((s, r) => s + r.payments_count, 0);
  const totalCommission = rows.reduce((s, r) => s + r.total_commission, 0);

  return (
    <div className="space-y-6">
      {/* Overall summary */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-blue-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Total unique visitors</span></div>
              <p className="text-2xl font-bold text-white">{totalVisitors}</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><UserPlus className="h-4 w-4 text-sky-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Referred sign-ups</span></div>
              <p className="text-2xl font-bold text-white">{totalSignups}</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><FileText className="h-4 w-4 text-amber-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Form submissions</span></div>
              <p className="text-2xl font-bold text-white">{totalSubmissions}</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Total payments</span></div>
              <p className="text-2xl font-bold text-white">{totalPayments}</p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-white/10 col-span-2 lg:col-span-1">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1"><Percent className="h-4 w-4 text-purple-400" /><span className="text-xs text-muted-foreground uppercase tracking-wide">Total commission owed</span></div>
              <p className="text-2xl font-bold text-green-400">₹{totalCommission.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-between items-center flex-wrap gap-2">
        <Button variant="outline" onClick={load} disabled={loading} className="border-white/10 hover:bg-white/5">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-500 text-white">
          <PlusCircle className="h-4 w-4 mr-2" />
          Add affiliate
        </Button>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Affiliates ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Code / Link</TableHead>
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Commission </TableHead>
                <TableHead className="text-muted-foreground">Unique visitors (IPs)</TableHead>
                <TableHead className="text-muted-foreground">Sign-ups</TableHead>
                <TableHead className="text-muted-foreground">Form submissions</TableHead>
                <TableHead className="text-muted-foreground">Payments</TableHead>
                <TableHead className="text-muted-foreground">Commission earned</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="border-white/5 hover:bg-white/5">
                  <TableCell className="font-mono text-cyan-400 text-xs">
                    <a href={linkUrl(r.code)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {r.code}
                    </a>
                  </TableCell>
                  <TableCell className="text-zinc-300">{r.name}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{r.email}</TableCell>
                  <TableCell className="font-medium">
                    {r.commission_type === "fixed" ? (
                      <span className="text-zinc-300">₹{r.fixed_amount} <span className="text-[10px] text-zinc-500 uppercase ml-1">(Fixed)</span></span>
                    ) : r.commission_type === "tier" ? (
                      <span className="text-zinc-300">Tiered <span className="text-[10px] text-zinc-500 uppercase ml-1">(System)</span></span>
                    ) : (
                      <span className="text-zinc-300">{r.commission_percent}% <span className="text-[10px] text-zinc-500 uppercase ml-1">({r.commission_type || "Percent"})</span></span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-white">{r.unique_visitors}</TableCell>
                  <TableCell className="font-medium text-sky-300">{r.referred_signups}</TableCell>
                  <TableCell>{r.form_submissions}</TableCell>
                  <TableCell>{r.payments_count}</TableCell>
                  <TableCell className="text-green-400">
                    {r.total_commission > 0 ? `₹${Number(r.total_commission).toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "secondary"} className="border-white/10">
                      {r.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAffiliateDetail(r.id)}
                      className="hover:bg-white/10 text-cyan-400"
                      title="Open affiliate detail"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(r)}
                      className="hover:bg-white/10"
                      title="Edit affiliate details"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resetAffiliatePassword(r.id)}
                      className="hover:bg-white/10"
                      title="Reset affiliate password"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAffiliateActive(r)}
                      className="hover:bg-white/10"
                      title={r.is_active ? "Suspend affiliate" : "Activate affiliate"}
                    >
                      <Ban className={`h-3.5 w-3.5 ${r.is_active ? "text-amber-400" : "text-emerald-400"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAffiliate(r)}
                      className="hover:bg-white/10 text-red-400"
                      title="Delete affiliate"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                    No affiliates yet. Add one to start tracking links and commissions.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit affiliate" : "Add affiliate"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Code (used in ?ref=)</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. john2024"
                className="bg-white/5 border-white/10"
                disabled={!!editingId}
              />
              {!editingId && (
                <p className="text-xs text-zinc-500">Link: {window.location.origin}/?ref={form.code || "CODE"}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Affiliate name"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="affiliate@example.com"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <Label>Phone Number</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+91 98765 43210"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="grid gap-2">
              <Label>Commission System</Label>
              <Select
                value={form.commission_type}
                onValueChange={(v) => setForm((f) => ({ ...f, commission_type: v }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-white/10 text-white">
                  <SelectItem value="percentage">Percentage commission</SelectItem>
                  <SelectItem value="fixed">Fixed commission</SelectItem>
                  <SelectItem value="tier">Tier-based commission</SelectItem>
                  <SelectItem value="recurring">Recurring commission</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.commission_type === "percentage" && (
              <div className="grid gap-2">
                <Label>Commission % (when their referred user pays)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.commission_percent}
                  onChange={(e) => setForm((f) => ({ ...f, commission_percent: Number(e.target.value) || 0 }))}
                  className="bg-white/5 border-white/10"
                />
              </div>
            )}

            {form.commission_type === "fixed" && (
              <div className="grid gap-2">
                <Label>Fixed Commission Amount (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.fixed_amount}
                  onChange={(e) => setForm((f) => ({ ...f, fixed_amount: Number(e.target.value) || 0 }))}
                  placeholder="e.g. 500"
                  className="bg-white/5 border-white/10"
                />
              </div>
            )}

            {form.commission_type === "tier" && (
              <div className="space-y-4 p-3 border border-white/10 rounded-lg bg-white/5">
                <Label className="text-sm font-medium">Tier Configuration</Label>
                <p className="text-[10px] text-zinc-500">Define tiers based on sales volume.</p>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Threshold (e.g. 10)" className="h-8 bg-zinc-950/50 border-white/10 text-xs" />
                    <Input placeholder="Rate % (e.g. 15)" className="h-8 bg-zinc-950/50 border-white/10 text-xs" />
                    <Button size="sm" className="h-8 bg-white/10 hover:bg-white/20">Add</Button>
                  </div>
                  {/* Tier list would go here */}
                  <p className="text-[10px] text-zinc-600 italic">Advanced tier management coming soon in detail view.</p>
                </div>
              </div>
            )}

            {form.commission_type === "recurring" && (
              <div className="grid gap-2">
                <Label>Recurring Commission %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.commission_percent}
                  onChange={(e) => setForm((f) => ({ ...f, commission_percent: Number(e.target.value) || 0 }))}
                  placeholder="e.g. 10"
                  className="bg-white/5 border-white/10"
                />
                <p className="text-[10px] text-zinc-500 italic">This percentage will be paid for every renewal.</p>
              </div>
            )}
            {editingId && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-white/20"
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-white/10">
              Cancel
            </Button>
            <Button onClick={save} disabled={saving} className="bg-cyan-600 hover:bg-cyan-500">
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AffiliateDetailModal
        open={!!detailAffiliateId}
        onOpenChange={(open) => {
          if (!open) closeAffiliateDetail();
        }}
        affiliateId={detailAffiliateId}
        surface="admin"
        backLabel="Back to affiliates"
      />

      <Dialog open={!!tempPasswordResult} onOpenChange={(open) => !open && setTempPasswordResult(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Affiliate created — share these credentials</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 mb-4">
            The affiliate must sign in with this temporary password, then they will be asked to set a new password on first login.
          </p>
          {tempPasswordResult && (
            <div className="space-y-2 rounded-lg bg-white/5 p-4 font-mono text-sm">
              <p><span className="text-zinc-500">Email:</span> {tempPasswordResult.email}</p>
              <p><span className="text-zinc-500">Temporary password:</span> {tempPasswordResult.temp_password}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={copyTempPassword} className="border-white/10">
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied" : "Copy to clipboard"}
            </Button>
            <Button onClick={() => setTempPasswordResult(null)} className="bg-cyan-600 hover:bg-cyan-500">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
