import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TenantUser {
  id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  email?: string;
}

export function useWhitelabelUsers(tenantId: string | undefined, isWLAdmin: boolean, isDummy: boolean) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId || !isWLAdmin) {
      setLoading(false);
      return;
    }

    if (isDummy) {
      setUsers([
        { id: "d1", user_id: "demo-user-1", role: "user", status: "active", created_at: new Date().toISOString(), email: "user1@demo.com" },
        { id: "d2", user_id: "demo-user-2", role: "user", status: "active", created_at: new Date().toISOString(), email: "user2@demo.com" },
      ]);
      setLoading(false);
      return;
    }

    const loadUsers = async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("white_label_tenant_users")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      setUsers(data ?? []);
      setLoading(false);
    };

    loadUsers();
  }, [tenantId, isWLAdmin, isDummy]);

  return { users, loading };
}
