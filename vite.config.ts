import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
const widget = path.resolve(__dirname, "vendor/chartmate-trading-widget");
const algoOnly = path.resolve(__dirname, "src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // ── algo-only local files (must come before the widget catch-all) ──
      { find: /^@\/pages\/DashboardPage$/, replacement: path.resolve(algoOnly, "pages/DashboardPage.tsx") },
      { find: /^@\/pages\/LoginPage$/, replacement: path.resolve(algoOnly, "pages/LoginPage.tsx") },
      { find: /^@\/pages\/AccessRequestPage$/, replacement: path.resolve(algoOnly, "pages/AccessRequestPage.tsx") },
      { find: /^@\/pages\/BrokerConnectPage$/, replacement: path.resolve(algoOnly, "pages/BrokerConnectPage.tsx") },
      { find: /^@\/pages\/BrokerCallbackPage$/, replacement: path.resolve(algoOnly, "pages/BrokerCallbackPage.tsx") },
      { find: /^@\/components\/RequireAuth$/, replacement: path.resolve(algoOnly, "components/RequireAuth.tsx") },
      { find: /^@\/components\/RequireBrokerConnected$/, replacement: path.resolve(algoOnly, "components/RequireBrokerConnected.tsx") },
      { find: /^@\/hooks\/useAuth$/, replacement: path.resolve(algoOnly, "hooks/useAuth.ts") },
      { find: /^@\/hooks\/useBrokerIntegration$/, replacement: path.resolve(algoOnly, "hooks/useBrokerIntegration.ts") },
      { find: /^@\/lib\/supabase$/, replacement: path.resolve(algoOnly, "lib/supabase.ts") },
      { find: /^@\/lib\/zerodhaOAuth$/, replacement: path.resolve(algoOnly, "lib/zerodhaOAuth.ts") },
      { find: /^@\/lib\/brokerIntegration$/, replacement: path.resolve(algoOnly, "lib/brokerIntegration.ts") },
      { find: /^@\/lib\/api$/, replacement: path.resolve(algoOnly, "lib/api.ts") },
      { find: /^@\/integrations\/supabase\/client$/, replacement: path.resolve(algoOnly, "lib/supabase.ts") },
      { find: /^@\/styles\/(.*)$/, replacement: path.resolve(algoOnly, "styles/$1") },

      // ── stubs for ChartMate hooks/components that don't apply in algo-only ──
      { find: /^@\/hooks\/useSubscription$/, replacement: path.resolve(algoOnly, "stubs/useSubscription.ts") },
      { find: /^@\/hooks\/usePaperTrades$/, replacement: path.resolve(algoOnly, "stubs/usePaperTrades.ts") },
      { find: /^@\/components\/layout\/DashboardSidebar$/, replacement: path.resolve(algoOnly, "stubs/DashboardSidebar.tsx") },

      // ChartMate global CSS from vendored widget source
      { find: "chartmate-widget-entry", replacement: path.join(widget, "index.css") },

      // ── catch-all: everything else (@/) resolves into the ChartMate widget ──
      { find: "@", replacement: widget },
    ],
  },
});
