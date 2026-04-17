import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Mail, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContactRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  telegram_id: string | null;
  description: string | null;
  created_at: string;
  affiliate_id: string | null;
  referral_code: string | null;
  affiliate_code: string | null;
  affiliate_name: string | null;
}

export default function AdminContactsPage() {
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data: submissions, error } = await (supabase as any)
        .from("contact_submissions")
        .select("id, name, email, phone, telegram_id, description, created_at, affiliate_id, referral_code")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const affIds = [...new Set((submissions ?? []).filter((s: any) => s.affiliate_id).map((s: any) => s.affiliate_id))];
      let affiliateMap: Record<string, { code: string; name: string }> = {};

      if (affIds.length > 0) {
        const { data: affiliates } = await (supabase as any)
          .from("affiliates")
          .select("id, code, name")
          .in("id", affIds);
        (affiliates ?? []).forEach((a: any) => {
          affiliateMap[a.id] = { code: a.code, name: a.name };
        });
      }

      setRows(
        (submissions ?? []).map((s: any) => ({
          ...s,
          affiliate_code: s.affiliate_id ? (affiliateMap[s.affiliate_id]?.code ?? null) : null,
          affiliate_name: s.affiliate_id ? (affiliateMap[s.affiliate_id]?.name ?? null) : (s.referral_code ? null : null),
        }))
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      (r.affiliate_code ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, referral..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
          />
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="border-white/10 hover:bg-white/5">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Form submissions ({filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground">Telegram</TableHead>
                <TableHead className="text-muted-foreground">Description / Plan</TableHead>
                <TableHead className="text-muted-foreground">Referred by</TableHead>
                <TableHead className="text-muted-foreground">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="border-white/5 hover:bg-white/5 align-top">
                  <TableCell className="font-medium text-zinc-300 whitespace-nowrap">{r.name}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{r.email}</TableCell>
                  <TableCell className="text-zinc-400 text-sm whitespace-nowrap">{r.phone}</TableCell>
                  <TableCell className="text-zinc-500 text-sm">{r.telegram_id || "—"}</TableCell>
                  <TableCell className="text-zinc-400 text-xs max-w-[200px]">
                    <span className="line-clamp-3">{r.description || "—"}</span>
                  </TableCell>
                  <TableCell>
                    {r.affiliate_code ? (
                      <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 text-xs whitespace-nowrap">
                        {r.affiliate_code}
                        {r.affiliate_name && <span className="ml-1 text-zinc-500">({r.affiliate_name})</span>}
                      </Badge>
                    ) : r.referral_code ? (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs whitespace-nowrap" title="Manually entered — not yet matched to an affiliate">
                        {r.referral_code} <span className="ml-1 text-zinc-500">(manual)</span>
                      </Badge>
                    ) : (
                      <span className="text-zinc-600 text-xs">Direct</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {rows.length === 0 ? "No submissions yet." : "No results match your search."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
