import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — login disabled until configured.");
}

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    // Keep session across refresh in the same tab, but avoid long-lived localStorage persistence.
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    flowType: "pkce",
  },
});
