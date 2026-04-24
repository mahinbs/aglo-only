import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/lib/supabase";

type Sub = {
  plan_id: string;
  status: string;
  current_period_end: string | null;
};

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSub] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSub(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("user_subscriptions")
      .select("plan_id, status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setSub(data ?? null);
        setLoading(false);
      });
  }, [user?.id, authLoading]);

  const hasAlgoAccess = (() => {
    if (!subscription) return false;
    const s = subscription.status;
    if (s !== "active" && s !== "trialing" && s !== "pro_trial") return false;
    if (subscription.current_period_end) {
      const graceMs =
        new Date(subscription.current_period_end).getTime() + 24 * 60 * 60 * 1000;
      if (graceMs < Date.now()) return false;
    }
    return true;
  })();

  return { subscription, loading, hasAlgoAccess };
}
