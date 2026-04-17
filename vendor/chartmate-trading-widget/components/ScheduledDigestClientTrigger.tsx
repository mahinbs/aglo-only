import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  getDigestClockContext,
  normalizeTimezoneId,
  parseNotifyTimeForDigest,
  scheduleAllowsAt,
  type ScheduleModeLite,
} from "@/lib/timezones";

type TrackerRow = {
  id: string;
  notify_time: string;
  timezone: string;
  last_digest_on: string | null;
  schedule_mode: string;
  days_of_week: number[] | null;
  one_off_local_date: string | null;
};

/**
 * While the app is open and you are signed in, checks wall clock every few seconds against
 * `live_entry_trackers` and invokes `entry-point-daily-digest` with your JWT at the scheduled
 * minute so the result row hits `entry_point_alerts` (bell only) without waiting for server cron.
 * Cron remains the backup when the tab is closed.
 */
export function ScheduledDigestClientTrigger() {
  const { user } = useAuth();
  const firedMinuteKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || (typeof document !== "undefined" && document.hidden)) return;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const { data, error } = await (supabase as any)
          .from("live_entry_trackers")
          .select("id,notify_time,timezone,last_digest_on,schedule_mode,days_of_week,one_off_local_date")
          .eq("user_id", user.id)
          .eq("enabled", true);

        if (error || !data?.length) return;

        const now = new Date();
        for (const raw of data as TrackerRow[]) {
          const tz = normalizeTimezoneId(raw.timezone);
          const ctx = getDigestClockContext(now, tz);
          if (raw.last_digest_on === ctx.dateKey) continue;

          const { h: nh, m: nm } = parseNotifyTimeForDigest(raw.notify_time);
          if (ctx.h !== nh || ctx.m !== nm) continue;

          const mode = (raw.schedule_mode || "all_days") as ScheduleModeLite;
          if (
            !scheduleAllowsAt(
              mode,
              ctx.weekday,
              ctx.dateKey,
              raw.one_off_local_date,
              raw.days_of_week ?? [],
            )
          ) {
            continue;
          }

          const minuteKey = `${raw.id}:${ctx.dateKey}:${nh * 60 + nm}`;
          if (firedMinuteKeysRef.current.has(minuteKey)) continue;
          firedMinuteKeysRef.current.add(minuteKey);

          const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
            "entry-point-daily-digest",
            {
              body: { trackerId: raw.id },
              headers: { Authorization: `Bearer ${session.access_token}` },
            },
          );

          if (invokeErr) {
            firedMinuteKeysRef.current.delete(minuteKey);
            return;
          }

          const outcome = (invokeData as { outcome?: string })?.outcome;
          if (outcome === "not_due" || outcome === "skipped") {
            firedMinuteKeysRef.current.delete(minuteKey);
          }
        }
      } catch {
        /* ignore */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 8000);

    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id]);

  return null;
}
