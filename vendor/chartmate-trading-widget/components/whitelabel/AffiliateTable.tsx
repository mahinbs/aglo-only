import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Eye, Pencil, RotateCcw, Ban, Trash2, Check, UserPlus } from "lucide-react";
import { AffiliateRow } from "@/hooks/useWhitelabelAffiliates";
import { useState } from "react";
import { toast } from "sonner";

interface AffiliateTableProps {
  affiliates: AffiliateRow[];
  onViewDetail: (aff: AffiliateRow) => void;
  onEdit: (aff: AffiliateRow) => void;
  onResetPassword: (id: string) => void;
  onToggleActive: (aff: AffiliateRow) => void;
  onDelete: (aff: AffiliateRow) => void;
}

export function AffiliateTable({
  affiliates,
  onViewDetail,
  onEdit,
  onResetPassword,
  onToggleActive,
  onDelete
}: AffiliateTableProps) {
  const [linkCopiedId, setLinkCopiedId] = useState<string | null>(null);

  const copyLink = (code: string, id: string) => {
    const url = `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopiedId(id);
      toast.success("Affiliate link copied!");
      setTimeout(() => setLinkCopiedId(null), 2000);
    });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <Table>
        <TableHeader className="bg-white/5">
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-muted-foreground font-medium text-xs">Code / Link</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs">Name</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs">Email</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs">Commission %</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs">Visitors</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs">Sign-ups</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {affiliates.map((r) => (
            <TableRow key={r.id} className="border-white/5 hover:bg-white/5 transition-colors">
              <TableCell className="font-mono text-cyan-400 text-xs">
                <button
                  className="hover:underline flex items-center gap-1.5 group"
                  onClick={() => copyLink(r.code, r.id)}
                >
                  {r.code}
                  {linkCopiedId === r.id ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
                </button>
              </TableCell>
              <TableCell className="text-zinc-300 font-medium">{r.name}</TableCell>
              <TableCell className="text-zinc-400 text-xs">{r.email}</TableCell>
              <TableCell className="text-zinc-300">{r.commission_percent}%</TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px] px-1.5 py-0 h-5">
                  {r.unique_visitors}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/20 text-[10px] px-1.5 py-0 h-5 gap-0.5 inline-flex items-center">
                  <UserPlus className="h-2.5 w-2.5" />
                  {r.referred_signups}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onViewDetail(r)} className="h-8 w-8 hover:bg-white/10 text-cyan-400">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onEdit(r)} className="h-8 w-8 hover:bg-white/10 text-zinc-400">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onResetPassword(r.id)} className="h-8 w-8 hover:bg-white/10 text-zinc-400">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onToggleActive(r)} className={`h-8 w-8 hover:bg-white/10 ${r.is_active ? "text-amber-400" : "text-emerald-400"}`}>
                    <Ban className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(r)} className="h-8 w-8 hover:bg-white/10 text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
