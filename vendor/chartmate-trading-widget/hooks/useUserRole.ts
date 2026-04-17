import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserRole = "super_admin" | "admin" | "affiliate" | "user" | null;

export const useUserRole = () => {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) { setLoading(true); return; }
    if (!user) { setRole(null); setLoading(false); return; }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setRole((data?.role as UserRole) ?? "user");
      } catch {
        if (!cancelled) setRole("user");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  return {
    role,
    loading,
    isAdmin: role === "admin",
    isAffiliate: role === "affiliate",
    isNormalUser: role === "user" || role === null,
  };
};
