import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, FileText, DollarSign, Percent, Eye, UserPlus } from "lucide-react";
import { AffiliateRow } from "@/hooks/useWhitelabelAffiliates";

interface AffiliateDetail {
  affiliate: AffiliateRow;
  visitors: { visitor_ip: string; visited_at: string }[];
  signups: {
    user_id: string;
    email: string | null;
    full_name: string;
    phone: string | null;
    country: string | null;
    referral_code_at_signup: string | null;
    created_at: string;
  }[];
  submissions: { id: string; name: string; email: string; phone: string; telegram_id?: string; description?: string; referral_code?: string; created_at: string }[];
  payments: { id: string; amount: number; currency: string; commission_amount: number; status: string; created_at: string }[];
}

interface AffiliateDetailDialogProps {
  detail: AffiliateDetail | null;
  loading: boolean;
  onClose: () => void;
}

export function AffiliateDetailDialog({ detail, loading, onClose }: AffiliateDetailDialogProps) {
  return (
    <Dialog open={!!detail || loading} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-zinc-900 border-white/10 text-white max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-cyan-400" />
            {detail?.affiliate.name} — Affiliate Stats
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="text-muted-foreground text-sm py-12 text-center animate-pulse">Loading detailed statistics...</div>}

        {detail && !loading && (
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6 py-2">
              {/* Summary chips */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: "Unique visitors", value: detail.visitors.length, clr: "text-blue-400", icon: Users },
                  { label: "Sign-ups", value: detail.signups.length, clr: "text-sky-400", icon: UserPlus },
                  { label: "Form submissions", value: detail.submissions.length, clr: "text-amber-400", icon: FileText },
                  { label: "Payments", value: detail.payments.length, clr: "text-green-400", icon: DollarSign },
                  { label: `Commission (${detail.affiliate.commission_percent}%)`, value: `₹${detail.payments.reduce((s, p) => s + Number(p.commission_amount ?? 0), 0).toFixed(2)}`, clr: "text-purple-400", icon: Percent },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-white/5 p-3 border border-white/5">
                    <div className={`flex items-center gap-1.5 mb-1 ${s.clr}`}>
                      <s.icon className="h-3.5 w-3.5" />
                      <span className="text-[10px] text-muted-foreground font-medium uppercase">{s.label}</span>
                    </div>
                    <p className={`text-xl font-bold ${s.clr}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Visitors */}
              <Section title={`Unique visitors (${detail.visitors.length})`} icon={<Users className="h-3.5 w-3.5 text-blue-400" />}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-muted-foreground text-[10px] h-8">IP Address</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">First Visited</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.visitors.map((v, i) => (
                      <TableRow key={i} className="border-white/5 hover:bg-white/5 h-8">
                        <TableCell className="font-mono text-[10px] text-zinc-400 py-1">{v.visitor_ip}</TableCell>
                        <TableCell className="text-[10px] text-zinc-500 py-1">{new Date(v.visited_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {detail.visitors.length === 0 && (
                      <TableRow><TableCell colSpan={2} className="text-center text-zinc-500 text-[10px] py-4">No visitors recorded yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Section>

              {/* Sign-ups */}
              <Section title={`Account sign-ups (${detail.signups.length})`} icon={<UserPlus className="h-3.5 w-3.5 text-sky-400" />}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-muted-foreground text-[10px] h-8">Name</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">Email</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">Ref code</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.signups.map((s) => (
                      <TableRow key={s.user_id} className="border-white/5 hover:bg-white/5 h-8">
                        <TableCell className="text-[10px] text-zinc-300 py-1">{s.full_name || "—"}</TableCell>
                        <TableCell className="text-[10px] text-zinc-500 py-1">{s.email || "—"}</TableCell>
                        <TableCell className="font-mono text-[10px] text-zinc-500 py-1">{s.referral_code_at_signup || "—"}</TableCell>
                        <TableCell className="text-[10px] text-zinc-500 py-1">{new Date(s.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {detail.signups.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 text-[10px] py-4">No sign-ups yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Section>

              {/* Form submissions */}
              <Section title={`Form submissions (${detail.submissions.length})`} icon={<FileText className="h-3.5 w-3.5 text-amber-400" />}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-muted-foreground text-[10px] h-8">Name / Email</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">Phone / Telegram</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.submissions.map((s) => (
                      <TableRow key={s.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="py-2">
                          <div className="text-[11px] text-zinc-300 font-medium">{s.name}</div>
                          <div className="text-[10px] text-zinc-500">{s.email}</div>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="text-[11px] text-zinc-400">{s.phone}</div>
                          <div className="text-[10px] text-zinc-500">{s.telegram_id || "—"}</div>
                        </TableCell>
                        <TableCell className="text-[10px] text-zinc-500 py-2">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                    {detail.submissions.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center text-zinc-500 text-[10px] py-4">No submissions yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Section>

              {/* Payments */}
              <Section title={`Payments & commission (${detail.payments.length})`} icon={<DollarSign className="h-3.5 w-3.5 text-green-400" />}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-muted-foreground text-[10px] h-8">Amount</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">Status</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">Commission</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] h-8">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.payments.map((p) => (
                      <TableRow key={p.id} className="border-white/5 hover:bg-white/5">
                        <TableCell className="text-[10px] text-zinc-300 py-1">
                          {p.currency} {Number(p.amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="py-1">
                          <Badge variant={p.status === "completed" ? "default" : "secondary"} className="text-[10px] h-5">
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] text-green-400 py-1">₹{Number(p.commission_amount ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-[10px] text-zinc-500 py-1">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                    {detail.payments.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-zinc-500 text-[10px] py-4">No payments yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Section>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="mt-4 border-t border-white/5 pt-4">
          <Button onClick={onClose} className="bg-zinc-800 hover:bg-zinc-700 h-9 transition-colors">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-2 px-1">
        {icon}
        {title}
      </h3>
      <div className="rounded-xl border border-white/5 bg-black/20 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
