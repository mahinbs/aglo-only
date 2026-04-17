import { supabase } from "@/integrations/supabase/client";

const FLAG_KEY = "chartmate_robot_experience_v1";
const MOTION_KEY = "chartmate_robot_motion";
const SOUND_KEY = "chartmate_robot_sound";
const METRIC_KEY = "chartmate_robot_metrics";

type RobotMetricName =
  | "boot_seen"
  | "dashboard_engaged"
  | "strategy_activated"
  | "broker_reconnect_click"
  | "live_order_confirmed";

export function isRobotExperienceEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const qs = new URLSearchParams(window.location.search);
  const qp = (qs.get("robotExperience") ?? "").toLowerCase();
  if (qp === "off" || qp === "0" || qp === "false") return false;
  if (qp === "on" || qp === "1" || qp === "true") return true;
  const stored = localStorage.getItem(FLAG_KEY);
  if (stored == null) return true;
  return stored === "1";
}

export function setRobotExperienceEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FLAG_KEY, enabled ? "1" : "0");
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const explicit = localStorage.getItem(MOTION_KEY);
  if (explicit != null) return explicit === "0";
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export function setReducedMotionPreference(reduce: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MOTION_KEY, reduce ? "0" : "1");
}

export function isRobotSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SOUND_KEY) === "1";
}

export function setRobotSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
}

export function getRobotExperimentVariant(enabled: boolean): "control" | "robot_v1" {
  return enabled ? "robot_v1" : "control";
}

export function readRobotMetricsSnapshot(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(METRIC_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export async function trackRobotMetric(name: RobotMetricName) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(METRIC_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    parsed[name] = (parsed[name] ?? 0) + 1;
    parsed.last_event_at = Date.now();
    localStorage.setItem(METRIC_KEY, JSON.stringify(parsed));
  } catch {
    // no-op
  }

  try {
    await supabase.functions.invoke("track-dashboard-experience", {
      body: {
        experiment: "robot_experience_v1",
        metric: name,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Optional telemetry endpoint; ignore failures.
  }
}
