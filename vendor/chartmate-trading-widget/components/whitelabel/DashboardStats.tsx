import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, DollarSign, Percent } from "lucide-react";
import { AffiliateRow } from "@/hooks/useWhitelabelAffiliates";

interface DashboardStatsProps {
  affiliates: AffiliateRow[];
}

export function DashboardStats({ affiliates }: DashboardStatsProps) {
  const totalVisitors = affiliates.reduce((s, r) => s + r.unique_visitors, 0);
  const totalSubmissions = affiliates.reduce((s, r) => s + r.form_submissions, 0);
  const totalPayments = affiliates.reduce((s, r) => s + r.payments_count, 0);
  const totalCommission = affiliates.reduce((s, r) => s + r.total_commission, 0);

  const stats = [
    { label: "Total unique visitors", value: totalVisitors, clr: "text-blue-400", icon: Users },
    { label: "Form submissions", value: totalSubmissions, clr: "text-amber-400", icon: FileText },
    { label: "Total payments", value: totalPayments, clr: "text-green-400", icon: DollarSign },
    { label: "Total commission", value: `₹${totalCommission.toFixed(2)}`, clr: "text-purple-400", icon: Percent, isCurrency: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.label} className="glass-panel border-white/10 bg-white/5 backdrop-blur-sm">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-4 w-4 ${s.clr}`} />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold ${s.isCurrency ? "text-green-400" : "text-white"}`}>{s.value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
