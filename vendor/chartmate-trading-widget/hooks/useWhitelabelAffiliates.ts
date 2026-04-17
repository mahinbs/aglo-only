import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AffiliateRow {
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
}

export function useWhitelabelAffiliates(userId: string | undefined, tenantId: string | undefined, isWLAdmin: boolean, isDummy: boolean) {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAffiliates = useCallback(async () => {
    if (!userId || !tenantId || !isWLAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (isDummy) {
        const dummyAffs: AffiliateRow[] = [
          { id: "1", code: "alpha", name: "John Alpha", email: "john@alpha.com", commission_percent: 15, is_active: true, created_at: new Date().toISOString(), unique_visitors: 124, referred_signups: 8, form_submissions: 12, total_commission: 4500, payments_count: 5 },
          { id: "2", code: "beta", name: "Sarah Beta", email: "sarah@beta.com", commission_percent: 10, is_active: true, created_at: new Date().toISOString(), unique_visitors: 89, referred_signups: 3, form_submissions: 4, total_commission: 1200, payments_count: 2 },
          { id: "3", code: "gamma", name: "Mark Gamma", email: "mark@gamma.com", commission_percent: 10, is_active: false, created_at: new Date().toISOString(), unique_visitors: 342, referred_signups: 22, form_submissions: 28, total_commission: 9800, payments_count: 14 },
        ];
        setAffiliates(dummyAffs);
        return;
      }

      const { data: affData, error: e1 } = await (supabase as any)
        .from("affiliates")
        .select("id, code, name, email, commission_percent, is_active, created_at")
        .eq("created_by", userId)
        .order("created_at", { ascending: false });
      if (e1) throw e1;

      const list: AffiliateRow[] = (affData ?? []).map((a: any) => ({
        ...a,
        unique_visitors: 0,
        referred_signups: 0,
        form_submissions: 0,
        total_commission: 0,
        payments_count: 0,
      }));

      const ids = list.map((a) => a.id);
      if (ids.length > 0) {
        const [visitorsRes, signupsRes, submissionsRes, paymentsRes] = await Promise.all([
          (supabase as any).from("affiliate_visitors").select("affiliate_id").in("affiliate_id", ids),
          (supabase as any).from("user_signup_profiles").select("affiliate_id").in("affiliate_id", ids),
          (supabase as any).from("contact_submissions").select("affiliate_id").in("affiliate_id", ids),
          (supabase as any).from("user_payments").select("affiliate_id, commission_amount").in("affiliate_id", ids)
        ]);

        const visitorCount: Record<string, number> = {};
        (visitorsRes.data ?? []).forEach((v: any) => {
          visitorCount[v.affiliate_id] = (visitorCount[v.affiliate_id] ?? 0) + 1;
        });

        const signupCount: Record<string, number> = {};
        (signupsRes.data ?? []).forEach((row: any) => {
          if (row.affiliate_id) signupCount[row.affiliate_id] = (signupCount[row.affiliate_id] ?? 0) + 1;
        });

        const submissionCount: Record<string, number> = {};
        (submissionsRes.data ?? []).forEach((s: any) => {
          if (s.affiliate_id) submissionCount[s.affiliate_id] = (submissionCount[s.affiliate_id] ?? 0) + 1;
        });

        const commissionSum: Record<string, number> = {};
        const paymentCount: Record<string, number> = {};
        (paymentsRes.data ?? []).forEach((p: any) => {
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
      }
      setAffiliates(list);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load affiliates");
    } finally {
      setLoading(false);
    }
  }, [userId, tenantId, isWLAdmin, isDummy]);

  useEffect(() => {
    loadAffiliates();
  }, [loadAffiliates]);

  return { affiliates, loading, refresh: loadAffiliates };
}
