import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      if (authLoading) {
        setLoading(true);
        return;
      }

      if (!user) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_roles" as any)
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Admin check error:", error);
          setIsAdmin(false);
          setIsSuperAdmin(false);
        } else {
          const role = (data as any)?.role as string | undefined;
          setIsSuperAdmin(role === "super_admin");
          // Both admin and super_admin can access admin panel
          // (super_admin is the master; regular 'admin' is a WL partner)
          setIsAdmin(role === "admin" || role === "super_admin");
        }
      } catch (error) {
        console.error("Admin check failed:", error);
        setIsAdmin(false);
        setIsSuperAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [user, authLoading]);

  return { isAdmin, isSuperAdmin, loading };
};
