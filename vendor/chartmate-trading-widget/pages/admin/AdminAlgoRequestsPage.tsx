import { useEffect, useState } from "react";
import { ALL_BROKERS } from "@/components/trading/BrokerSyncSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Zap, CheckCircle2, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OnboardingRow {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  broker: string;
  broker_client_id: string | null;
  capital_amount: number | null;
  capital_currency: string | null;
  risk_level: string;
  trade_type: string | null;
  trading_experience: string | null;
  preferred_timeframe: string | null;
  target_profit_pct: number | null;
  stop_loss_pct: number | null;
  max_drawdown_pct: number | null;
  leverage_preference: string | null;
  custom_leverage: string | null;
  trading_goal: string | null;
  trading_frequency: string | null;
  risk_acknowledged: boolean | null;
  strategy_pref: string | null;
  custom_strategy: string | null;
  notes: string | null;
  plan_id: string;
  status: string;
  provisioned_at: string | null;
  created_at: string;
  email?: string;
}

function fmtCapital(amount: number | null, currency: string | null) {
  if (!amount) return "—";
  const sym = (currency ?? "INR") === "USD" ? "$" : "₹";
  return `${sym}${Number(amount).toLocaleString()}`;
}

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  pending:     { label: "Pending",     class: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  provisioned: { label: "Provisioned", class: "bg-teal-500/20 text-teal-400 border-teal-500/40" },
  active:      { label: "Active",      class: "bg-green-500/20 text-green-400 border-green-500/40" },
  cancelled:   { label: "Cancelled",   class: "bg-red-500/20 text-red-400 border-red-500/40" },
};

const BROKER_LABELS: Record<string, string> = Object.fromEntries(
  ALL_BROKERS.map(b => [b.value, b.label])
);

export default function AdminAlgoRequestsPage() {
  const [rows, setRows] = useState<OnboardingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "provisioned">("pending");

  // Provision dialog
  const [selected, setSelected] = useState<OnboardingRow | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-algo-requests", {
        body: {},
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = (res.data as { rows?: any[] } | null)?.rows ?? [];
      const error = res.error;

      if (error) throw error;

      // Fetch emails from auth (via admin-users function pattern — use supabase admin)
      // We'll fetch from user_subscriptions to get at least plan context;
      // email comes from the session's user metadata or we show user_id
      const userIds = (data ?? []).map((r: any) => r.user_id);
      let emailMap: Record<string, string> = {};

      if (userIds.length > 0) {
        // Get emails via user_roles join on auth isn't possible from frontend;
        // use contact_submissions as a fallback, then recent_subscribers
        const { data: subs } = await (supabase as any)
          .from("user_subscriptions")
          .select("user_id, plan_id")
          .in("user_id", userIds);

        // Try to get emails from contact_submissions (users often contact first)
        // This is the best available table linking email to user_id via current schema
        (subs ?? []).forEach((_s: any) => {
          // email not available from user_subscriptions, placeholder
        });
      }

      setRows(
        (data ?? []).map((r: any) => ({
          ...r,
          email: emailMap[r.user_id] ?? null,
        }))
      );
    } catch (e: any) {
      toast.error("Failed to load requests: " + (e.message ?? "unknown error"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openProvisionDialog = (row: OnboardingRow) => {
    setSelected(row);
  };

  const handleProvision = async () => {
    if (!selected) return;

    setProvisioning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-provision-algo", {
        body: { onboarding_id: selected.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      const result = res.data as { success?: boolean; error?: string; openalgo_username?: string } | null;
      if (res.error || result?.error) {
        toast.error(result?.error ?? res.error?.message ?? "Provisioning failed");
        return;
      }

      const usernameNote = result?.openalgo_username ? ` (OpenAlgo: ${result.openalgo_username})` : "";
      toast.success(`${selected.full_name} provisioned successfully!${usernameNote}`);
      setSelected(null);
      await load();
    } catch (e: any) {
      toast.error("Error: " + (e.message ?? "unknown"));
    } finally {
      setProvisioning(false);
    }
  };

  const filtered = rows.filter((r) => {
    const matchStatus = filter === "all" || r.status === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      r.full_name?.toLowerCase().includes(q) ||
      r.broker?.toLowerCase().includes(q) ||
      r.broker_client_id?.toLowerCase().includes(q) ||
      r.plan_id?.toLowerCase().includes(q) ||
      r.user_id?.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="h-5 w-5 text-teal-400" />
            Algo Onboarding Requests
            {pendingCount > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 border text-xs ml-1">
                {pendingCount} pending
              </Badge>
            )}
          </h2>
          <p className="text-zinc-400 text-sm mt-0.5">
            Provision OpenAlgo API keys for users who completed the onboarding form after payment.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          disabled={loading}
          className="border-zinc-700 hover:bg-zinc-800"
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Search name, broker, plan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 bg-zinc-800 border-zinc-700 text-white text-sm"
          />
        </div>
        <div className="flex gap-1">
          {(["pending", "provisioned", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className={filter === f
                ? "bg-teal-600 hover:bg-teal-700 text-white text-xs"
                : "border-zinc-700 hover:bg-zinc-800 text-zinc-400 text-xs"}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-zinc-500">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm">
                {filter === "pending" ? "No pending requests — all caught up!" : "No records found."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 text-xs">Name</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Broker</TableHead>
                  <TableHead className="text-zinc-400 text-xs hidden sm:table-cell">Client ID</TableHead>
                  <TableHead className="text-zinc-400 text-xs hidden md:table-cell">Capital</TableHead>
                  <TableHead className="text-zinc-400 text-xs hidden lg:table-cell">Risk / Strategy</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Plan</TableHead>
                  <TableHead className="text-zinc-400 text-xs">Status</TableHead>
                  <TableHead className="text-zinc-400 text-xs hidden md:table-cell">Submitted</TableHead>
                  <TableHead className="text-zinc-400 text-xs text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-800/40">
                    <TableCell className="text-white text-sm font-medium">
                      <div>{row.full_name}</div>
                      {row.phone && (
                        <div className="text-xs text-zinc-500">{row.phone}</div>
                      )}
                      <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{row.user_id.slice(0, 8)}…</div>
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm">
                      {BROKER_LABELS[row.broker] ?? row.broker}
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm hidden sm:table-cell">
                      {row.broker_client_id ?? <span className="text-zinc-600">—</span>}
                    </TableCell>
                    <TableCell className="text-zinc-400 text-sm hidden md:table-cell">
                      {fmtCapital(row.capital_amount, row.capital_currency)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="text-xs text-zinc-400 capitalize">{row.risk_level}</div>
                      <div className="text-xs text-zinc-600 capitalize">{row.strategy_pref ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge className="text-[10px] bg-zinc-800 text-zinc-300 border-zinc-700">
                        {row.plan_id}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-[10px] border ${STATUS_BADGE[row.status]?.class ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
                      >
                        {STATUS_BADGE[row.status]?.label ?? row.status}
                      </Badge>
                      {row.provisioned_at && (
                        <div className="text-[10px] text-zinc-600 mt-0.5">
                          {new Date(row.provisioned_at).toLocaleDateString()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500 text-xs hidden md:table-cell">
                      {new Date(row.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status === "pending" ? (
                        <Button
                          size="sm"
                          onClick={() => openProvisionDialog(row)}
                          className="bg-teal-600 hover:bg-teal-500 text-white text-xs px-3"
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          Provision
                        </Button>
                      ) : (
                        <span className="text-xs text-zinc-600 flex items-center justify-end gap-1">
                          <CheckCircle2 className="h-3 w-3 text-teal-600" />
                          Done
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Notes column shown below table on mobile */}
      {filtered.some((r) => r.notes) && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-zinc-300">User Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {filtered.filter((r) => r.notes).map((r) => (
              <div key={r.id} className="text-xs text-zinc-400 border border-zinc-800 rounded-lg p-3">
                <span className="text-zinc-200 font-medium">{r.full_name}: </span>
                {r.notes}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Provision dialog — full form view */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5 text-teal-400" />
              Provision — {selected?.full_name}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-sm">
              Review the user's onboarding details, then click Provision — their OpenAlgo account will be created automatically.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 py-1">

              {/* ── Identity ───────────────────────────────────────────── */}
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">User Identity</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Full Name</p>
                    <p className="text-white font-semibold text-sm">{selected.full_name}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Phone</p>
                    <p className="text-white text-sm">{selected.phone ?? <span className="text-zinc-600">—</span>}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">User ID</p>
                    <p className="text-zinc-400 font-mono text-xs break-all">{selected.user_id}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Submitted</p>
                    <p className="text-white text-sm">{new Date(selected.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* ── Broker ────────────────────────────────────────────── */}
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Broker Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Broker</p>
                    <p className="text-white font-semibold text-sm">
                      {BROKER_LABELS[selected.broker] ?? selected.broker}
                    </p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Broker Client ID</p>
                    <p className="text-white text-sm font-mono">
                      {selected.broker_client_id ?? <span className="text-zinc-600">Not provided</span>}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Capital & Risk ─────────────────────────────────────── */}
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Capital & Risk</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Capital</p>
                    <p className="text-white font-semibold text-sm">
                      {fmtCapital(selected.capital_amount, selected.capital_currency)}
                    </p>
                    <p className="text-zinc-600 text-[10px]">{selected.capital_currency ?? "INR"}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Risk Level</p>
                    <p className="text-white font-semibold text-sm capitalize">{selected.risk_level}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Plan</p>
                    <p className="text-teal-400 font-semibold text-sm">{selected.plan_id}</p>
                  </div>
                </div>
              </div>

              {/* ── Trading Profile ─────────────────────────────────────── */}
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Trading Profile</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Trade Type</p>
                    <p className="text-white text-sm capitalize">{selected.trade_type ?? <span className="text-zinc-600">—</span>}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Experience</p>
                    <p className="text-white text-sm capitalize">{selected.trading_experience ?? <span className="text-zinc-600">—</span>}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Timeframe</p>
                    <p className="text-white text-sm capitalize">{selected.preferred_timeframe ?? <span className="text-zinc-600">—</span>}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Target Profit</p>
                    <p className="text-white text-sm">{selected.target_profit_pct != null ? `${selected.target_profit_pct}%` : <span className="text-zinc-600">—</span>}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Stop Loss</p>
                    <p className="text-white text-sm">{selected.stop_loss_pct != null ? `${selected.stop_loss_pct}%` : <span className="text-zinc-600">—</span>}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Max Drawdown</p>
                    <p className="text-white text-sm">{selected.max_drawdown_pct != null ? `${selected.max_drawdown_pct}%` : <span className="text-zinc-600">—</span>}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Leverage</p>
                    <p className="text-white text-sm capitalize">
                      {selected.leverage_preference ?? <span className="text-zinc-600">—</span>}
                      {selected.custom_leverage ? ` (${selected.custom_leverage})` : ""}
                    </p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Trading Goal</p>
                    <p className="text-white text-sm capitalize">{selected.trading_goal ?? <span className="text-zinc-600">—</span>}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <p className="text-zinc-500 text-xs mb-0.5">Frequency</p>
                    <p className="text-white text-sm capitalize">{selected.trading_frequency ?? <span className="text-zinc-600">—</span>}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-xs">
                    Risk Acknowledgement:{" "}
                    {selected.risk_acknowledged
                      ? <span className="text-green-400 font-semibold">Accepted</span>
                      : <span className="text-amber-400">Not recorded</span>}
                  </p>
                </div>
              </div>

              {/* ── Strategy ──────────────────────────────────────────── */}
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Strategy</p>
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-0.5">Preferred Strategy</p>
                  <p className="text-white text-sm capitalize font-medium">
                    {selected.strategy_pref ?? <span className="text-zinc-600">Not specified</span>}
                  </p>
                  {selected.custom_strategy && (
                    <div className="mt-2 border-t border-zinc-700 pt-2">
                      <p className="text-zinc-500 text-xs mb-1">Custom Strategy Description</p>
                      <p className="text-zinc-300 text-sm leading-relaxed">{selected.custom_strategy}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Notes ─────────────────────────────────────────────── */}
              {selected.notes && (
                <div>
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">User Notes</p>
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-sm text-zinc-300 leading-relaxed">
                    {selected.notes}
                  </div>
                </div>
              )}

              {/* ── Auto-provision info ────────────────────────────────── */}
              <div className="border-t border-zinc-800 pt-4">
                <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg p-3 flex items-start gap-3">
                  <Zap className="h-4 w-4 text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-teal-300 text-sm font-semibold">Fully automatic — no manual steps</p>
                    <p className="text-zinc-400 text-xs mt-0.5">
                      Clicking Provision will automatically create this user's OpenAlgo account,
                      generate their unique API key, and attach it to their ChartMate profile.
                      You don't need to log in to OpenAlgo at all.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setSelected(null)}
              className="border-zinc-700 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleProvision}
              disabled={provisioning}
              className="bg-teal-600 hover:bg-teal-500 text-white font-bold"
            >
              {provisioning ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Provisioning…</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Provision & Activate</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
