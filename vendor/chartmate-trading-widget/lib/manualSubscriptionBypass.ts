/**
 * Client + gate bypass for specific accounts (complimentary / QA).
 * Keep in sync with manual DB entitlements in supabase/migrations.
 */
const MANUAL_FULL_ACCESS_EMAILS = new Set(
  ["ginevra89@tiffincrane.com", "pbrginevra89@tiffincrane.com"].map((e) => e.toLowerCase()),
);

export function isManualFullAccessEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return MANUAL_FULL_ACCESS_EMAILS.has(email.trim().toLowerCase());
}

/**
 * Emails that get access to New Analysis (/predict) and Past Analyses (/predictions).
 * These pages are not yet rolled out to all users — only exception accounts can see them.
 */
const ANALYSIS_EXCEPTION_EMAILS = new Set(
  ["sahasraedu77@gmail.com"].map((e) => e.toLowerCase()),
);

export function isAnalysisExceptionEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ANALYSIS_EXCEPTION_EMAILS.has(email.trim().toLowerCase());
}
