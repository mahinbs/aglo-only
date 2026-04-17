import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { TenantUser } from "@/hooks/useWhitelabelUsers";

interface UserTableProps {
  users: TenantUser[];
  loading: boolean;
}

export function UserTable({ users, loading }: UserTableProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground justify-center text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-10 text-sm bg-black/20 rounded-xl border border-white/5">
        No users yet. Share your login link to get started.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <Table>
        <TableHeader className="bg-white/5">
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-muted-foreground font-medium text-xs">User ID</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs">Role</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs">Status</TableHead>
            <TableHead className="text-muted-foreground font-medium text-xs">Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id} className="border-white/5 hover:bg-white/5 transition-colors">
              <TableCell className="font-mono text-[10px] text-muted-foreground">
                {u.user_id}
              </TableCell>
              <TableCell>
                <Badge variant={u.role === "admin" ? "default" : "outline"} className="text-[10px] h-5 px-1.5 font-medium">
                  {u.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={`text-[10px] h-5 px-1.5 font-medium ${
                    u.status === "active" ? "border-green-500/50 text-green-500 bg-green-500/5" : "border-red-500/50 text-red-500 bg-red-500/5"
                  }`}
                >
                  {u.status}
                </Badge>
              </TableCell>
              <TableCell className="text-[11px] text-zinc-500">
                {new Date(u.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
