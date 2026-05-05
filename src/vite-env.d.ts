/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_ALGO_ONLY_BFF_URL?: string;
  readonly VITE_ALGO_ONLY_BFF_URL_SECONDARY?: string;
  readonly VITE_ALGO_ONLY_BFF_SECONDARY_USER_IDS?: string;
  readonly VITE_ALGO_ONLY_BFF_SECONDARY_USER_EMAILS?: string;
  readonly VITE_ALGO_ONLY_BFF_SECONDARY_EMAIL_DOMAINS?: string;
  readonly VITE_OPTIONS_API_URL?: string;
  readonly VITE_OPTIONS_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
