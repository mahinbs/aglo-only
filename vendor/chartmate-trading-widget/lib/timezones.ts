/**
 * IANA timezones + entry-digest scheduling copy (uses same clock as Edge job).
 */
import {
  formatDigestClockNowLine,
  getDigestClockContext,
  normalizeTimezoneForDigest,
  parseNotifyTimeForDigest,
} from "../../supabase/functions/_shared/digestClock.ts";

export {
  formatDigestClockNowLine,
  getDigestClockContext,
  normalizeTimezoneForDigest as normalizeTimezoneId,
  parseNotifyTimeForDigest,
};

/** All IANA zones the browser exposes (~400+). Falls back to a short list if unsupported. */
export function getAllTimeZoneIdentifiers(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === "function") {
      const raw = intl.supportedValuesOf("timeZone");
      const skip = new Set(["Asia/Calcutta"]);
      const filtered = raw.filter((z) => !skip.has(z));
      return [...new Set(filtered)].sort((a, b) => a.localeCompare(b));
    }
  } catch {
    /* ignore */
  }
  return [
    "UTC",
    "Asia/Kolkata",
    "Asia/Dubai",
    "Asia/Singapore",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
  ];
}

export type ScheduleModeLite = "all_days" | "weekdays" | "custom" | "tomorrow_once";

export function scheduleAllowsAt(
  mode: ScheduleModeLite,
  weekday: number,
  dateKey: string,
  oneOff: string | null,
  customDays: number[],
): boolean {
  if (mode === "tomorrow_once") {
    const one = (oneOff ?? "").trim();
    return one.length > 0 && one === dateKey;
  }
  if (mode === "weekdays") return weekday >= 1 && weekday <= 5;
  if (mode === "custom") {
    const days = Array.isArray(customDays) ? customDays : [];
    if (days.length === 0) return false;
    return days.includes(weekday);
  }
  return true;
}

/** Human-readable "next notification" line — same `getDigestClockContext` as the digest job. */
export function describeNextNotification(args: {
  timezone: string;
  notifyTimeHHmm: string;
  schedule_mode: ScheduleModeLite;
  days_of_week: number[];
  one_off_local_date: string | null;
}): string {
  const tz = normalizeTimezoneForDigest(args.timezone);
  const parsed = parseNotifyTimeForDigest(args.notifyTimeHHmm.replace(/\s/g, ""));
  const th = parsed.h;
  const tm = parsed.m;
  const mode = args.schedule_mode || "all_days";

  if (mode === "tomorrow_once" && args.one_off_local_date) {
    return `Next notification: ${args.one_off_local_date} at ${args.notifyTimeHHmm} (${tz}) — one-time alarm.`;
  }

  const now = new Date();
  for (let i = 0; i < 60 * 24 * 21; i++) {
    const t = new Date(now.getTime() + i * 60_000);
    const ctx = getDigestClockContext(t, tz);
    if (ctx.h !== th || ctx.m !== tm) continue;

    if (
      !scheduleAllowsAt(
        mode,
        ctx.weekday,
        ctx.dateKey,
        args.one_off_local_date,
        args.days_of_week ?? [],
      )
    ) {
      continue;
    }

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "short",
      day: "numeric",
    }).formatToParts(t);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const pretty = `${ctx.weekdayName}, ${get("month")} ${get("day")}, ${get("year")} · ${args.notifyTimeHHmm}`;
    return `Next notification: ${pretty} (${tz}). Same digest clock as the server (see live clock below).`;
  }

  return "";
}
