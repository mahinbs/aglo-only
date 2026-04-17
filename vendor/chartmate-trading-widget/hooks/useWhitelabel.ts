import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WhitelabelTenant {
  id: string;
  slug: string;
  brand_name: string;
  brand_logo_url: string | null;
  brand_primary_color: string;
  brand_tagline: string | null;
  owner_user_id: string | null;
  owner_email: string | null;
  subscription_plan: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  starts_on: string;
  ends_on: string;
  status: string;
  created_at: string;
}

export function useWhitelabelTenant(slug: string | undefined) {
  const [tenant, setTenant] = useState<WhitelabelTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      const { data, error: err } = await (supabase as any)
        .from("white_label_tenants")
        .select("*")
        .eq("slug", slug.toLowerCase())
        .maybeSingle();
      if (err) { setError(err.message); setLoading(false); return; }
      setTenant(data ?? null);
      setLoading(false);
    };
    load();
  }, [slug]);

  return { tenant, loading, error };
}

/** Returns the current user's tenant membership (if any) */
export function useMyTenantMembership(userId: string | undefined) {
  const [membership, setMembership] = useState<{ tenant_id: string; role: string; status: string; tenant: WhitelabelTenant } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const load = async () => {
      const { data } = await (supabase as any)
        .from("white_label_tenant_users")
        .select("tenant_id, role, status, white_label_tenants(*)")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        setMembership({
          tenant_id: data.tenant_id,
          role: data.role,
          status: data.status,
          tenant: data.white_label_tenants,
        });
      }
      setLoading(false);
    };
    load();
  }, [userId]);

  return { membership, loading };
}

/** Check if a tenant's subscription is expired (date-based) */
export function isTenantExpired(tenant: WhitelabelTenant | null): boolean {
  if (!tenant) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > tenant.ends_on || tenant.status === "suspended" || tenant.status === "expired";
}

/** Human-readable days remaining */
export function daysRemaining(endsOn: string): number {
  const diff = new Date(endsOn).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86_400_000);
}
