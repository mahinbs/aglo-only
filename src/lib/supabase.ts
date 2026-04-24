import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.warn("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — login disabled until configured.");
}

/** VAPT: do not persist Supabase JWT in localStorage / sessionStorage */
const memoryStorage = (() => {
  const m = new Map<string, string>();
  return {
    getItem: (key: string) => m.get(key) ?? null,
    setItem: (key: string, value: string) => {
      m.set(key, value);
    },
    removeItem: (key: string) => {
      m.delete(key);
    },
  };
})();

export const supabase = createClient(url ?? "", anon ?? "", {
  auth: {
    storage: memoryStorage,
    persistSession: true,
    autoRefreshToken: true,
    flowType: "pkce",
  },
});
