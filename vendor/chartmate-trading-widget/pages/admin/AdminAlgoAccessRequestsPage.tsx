import { useEffect, useState } from "react";
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
import { RefreshCw, Search, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdmin } from "@/hooks/useAdmin";
import { Navigate } from "react-router-dom";

interface AccessRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

export default function AdminAlgoAccessRequestsPage() {
  const { isSuperAdmin, loading: adminLoading } = useAdmin();
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("get-algo-access-requests", {
        body: {},
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const data = (res.data as { rows?: AccessRow[] } | null)?.rows ?? [];
      setRows(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!adminLoading && isSuperAdmin) void load();
  }, [adminLoading, isSuperAdmin]);

  if (!adminLoading && !isSuperAdmin) {
    return <Navigate to="/home" replace />;
  }

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.full_name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      (r.phone ?? "").includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
          />
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading} className="border-white/10 hover:bg-white/5">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-cyan-400" />
            Algo-only access requests
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Submissions from the TradingSmart request-access wizard (public, no ChartMate account required).
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Created</TableHead>
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                <TableHead className="text-muted-foreground">Phone</TableHead>
                <TableHead className="text-muted-foreground">Location</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className="border-white/10">
                  <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-white">{r.full_name}</TableCell>
                  <TableCell className="text-cyan-300/90">{r.email}</TableCell>
                  <TableCell className="text-muted-foreground">{r.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {[r.city, r.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-200 text-[10px]">
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No rows yet. Run the DB migration and deploy edge functions, then submit from algo-only /request-access.
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
