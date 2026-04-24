import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { bffAuthExchange, bffConfigured, bffLogout } from "@/lib/api";

async function syncBffCookie(accessToken: string | undefined) {
  if (!accessToken || !bffConfigured()) return;
  try {
    await bffAuthExchange(accessToken);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("BFF session exchange failed:", e);
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.access_token) await syncBffCookie(sess.access_token);
      setLoading(false);
    });
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      void syncBffCookie(s?.access_token);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session?.access_token) {
      await syncBffCookie(data.session.access_token);
    }
    return { error };
  };

  const signOut = async () => {
    await bffLogout();
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return { user, session, loading, signIn, signOut };
}
