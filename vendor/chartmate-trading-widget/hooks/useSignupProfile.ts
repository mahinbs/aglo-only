import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type SignupProfileRow = {
  user_id: string;
  email: string | null;
  full_name: string;
  date_of_birth: string | null;
  age_at_signup: number | null;
  phone: string | null;
  country: string | null;
};

export function useSignupProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SignupProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("user_signup_profiles")
      .select(
        "user_id,email,full_name,date_of_birth,age_at_signup,phone,country",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error && data) setProfile(data as SignupProfileRow);
    else setProfile(null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const displayName = useMemo(() => {
    const fromProfile = profile?.full_name?.trim();
    if (fromProfile) return fromProfile;
    const fromMeta = String(
      (user?.user_metadata as Record<string, unknown> | undefined)?.full_name ?? "",
    ).trim();
    if (fromMeta) return fromMeta;
    const em = user?.email?.split("@")[0];
    return em || "User";
  }, [profile?.full_name, user?.user_metadata, user?.email]);

  return { profile, loading, displayName, refresh };
}
