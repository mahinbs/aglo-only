#!/usr/bin/env node
/**
 * Before `vite build` on Vercel: clone chartmate-trading-widget if missing.
 * Set env CHARTMATE_WIDGET_REPO (e.g. https://github.com/yourorg/chartmate-trading-widget.git)
 * Private repos: https://<GITHUB_TOKEN>@github.com/yourorg/chartmate-trading-widget.git
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const siblingSrc = path.resolve(root, "../chartmate-trading-widget/src");
const vendorRoot = path.join(root, "vendor", "chartmate-trading-widget");
const vendorSrc = path.join(vendorRoot, "src");

if (fs.existsSync(siblingSrc)) {
  console.log("[ensure-widget] Using sibling ../chartmate-trading-widget/src");
  process.exit(0);
}
if (fs.existsSync(vendorSrc)) {
  console.log("[ensure-widget] Using vendor/chartmate-trading-widget/src");
  process.exit(0);
}

const repo = process.env.CHARTMATE_WIDGET_REPO?.trim();
if (!repo) {
  console.error(
    "[ensure-widget] chartmate-trading-widget not found.\n" +
      "For Vercel: add env CHARTMATE_WIDGET_REPO with the git clone URL of chartmate-trading-widget (see README).",
  );
  process.exit(1);
}

fs.mkdirSync(path.join(root, "vendor"), { recursive: true });
console.log("[ensure-widget] Cloning chartmate-trading-widget into vendor/ …");
execSync(`git clone --depth 1 "${repo}" "${vendorRoot}"`, { cwd: root, stdio: "inherit" });
if (!fs.existsSync(vendorSrc)) {
  console.error(`[ensure-widget] Clone succeeded but missing src: ${vendorSrc}`);
  process.exit(1);
}
console.log("[ensure-widget] Done.");
