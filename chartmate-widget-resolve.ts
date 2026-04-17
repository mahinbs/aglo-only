import fs from "node:fs";
import path from "node:path";

/**
 * Resolve chartmate-trading-widget `src` directory for Vite aliases and Tailwind content.
 * - Local monorepo: ../chartmate-trading-widget/src
 * - CI / Vercel: vendor/chartmate-trading-widget/src (after clone or submodule)
 * - Override: CHARTMATE_WIDGET_SRC=/abs/path/to/chartmate-trading-widget/src
 */
export function getChartmateWidgetSrc(rootDir: string): string {
  const env = process.env.CHARTMATE_WIDGET_SRC?.trim();
  if (env) {
    const abs = path.resolve(env);
    if (fs.existsSync(abs)) return abs;
    throw new Error(`CHARTMATE_WIDGET_SRC is set but path does not exist: ${abs}`);
  }
  const candidates = [
    path.resolve(rootDir, "../chartmate-trading-widget/src"),
    path.resolve(rootDir, "vendor/chartmate-trading-widget/src"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    "chartmate-trading-widget/src not found. Options:\n" +
      "  • In monorepo: keep chartmate-trading-widget next to algo-only.\n" +
      "  • On Vercel: set CHARTMATE_WIDGET_REPO to a git URL and run the prebuild clone script, or add a submodule at vendor/chartmate-trading-widget.\n" +
      "  • Or set CHARTMATE_WIDGET_SRC to an absolute path to the widget's src folder.",
  );
}
