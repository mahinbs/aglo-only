/** Supabase / GoTrue email (and related) throttling. */
export function isAuthEmailRateLimitError(
  err: { message?: string; code?: string; status?: number } | null | undefined,
): boolean {
  const c = String(err?.code ?? "").toLowerCase();
  if (c === "over_email_send_rate_limit" || c === "over_request_rate_limit") return true;
  const m = (err?.message ?? "").toLowerCase();
  return (
    m.includes("rate limit") ||
    m.includes("over_email_send_rate_limit") ||
    (m.includes("too many") && m.includes("email")) ||
    (err?.status === 429 && (m.includes("email") || m.includes("security purposes")))
  );
}

const SECONDS_CLAMP = { min: 1, max: 24 * 60 * 60 };

/**
 * GoTrue often returns messages like:
 * "For security purposes, you can only request this after 42 seconds."
 * The JS client only exposes message/status/code — not JSON extras — so we parse the message.
 */
export function parseAuthRateLimitWaitSeconds(
  err: { message?: string } | null | undefined,
): number | null {
  const msg = err?.message ?? "";
  if (!msg.trim()) return null;

  const trySeconds = (n: number): number | null => {
    if (!Number.isFinite(n)) return null;
    const s = Math.floor(n);
    if (s < SECONDS_CLAMP.min || s > SECONDS_CLAMP.max) return null;
    return s;
  };

  const patterns: RegExp[] = [
    /only request this after (\d+)\s*seconds?/i,
    /after (\d+)\s*seconds?/i,
    /try again (?:in|after) (\d+)\s*seconds?/i,
    /wait (\d+)\s*seconds?/i,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m) {
      const parsed = trySeconds(Number(m[1]));
      if (parsed != null) return parsed;
    }
  }

  const minPatterns = [/after (\d+)\s*minutes?/i, /in (\d+)\s*minutes?/i];
  for (const re of minPatterns) {
    const m = msg.match(re);
    if (m) {
      const parsed = trySeconds(Number(m[1]) * 60);
      if (parsed != null) return parsed;
    }
  }

  return null;
}
