import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type SignUpProfileData = {
  full_name: string;
  date_of_birth: string; // YYYY-MM-DD
  phone?: string;
  country?: string;
  /** Persisted to auth metadata → signup profile trigger (validated server-side). */
  affiliate_id?: string | null;
  referral_code?: string | null;
};

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    profile?: SignUpProfileData,
  ) => {
    const redirectUrl = `${window.location.origin}/`;

    const meta: Record<string, string> = profile
      ? {
          full_name: profile.full_name.trim(),
          date_of_birth: profile.date_of_birth,
          phone: (profile.phone ?? "").trim(),
          country: (profile.country ?? "").trim(),
        }
      : {};

    if (profile?.affiliate_id?.trim()) {
      meta.affiliate_id = profile.affiliate_id.trim();
    }
    if (profile?.referral_code?.trim()) {
      meta.referral_code = profile.referral_code.trim();
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: Object.keys(meta).length ? meta : undefined,
      },
    });
    return { data, error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  };
};