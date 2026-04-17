import { useEffect, useMemo, useState } from "react";
import { Cpu, CheckCircle2, Loader2, Radio } from "lucide-react";
import { ALGO_ROBOT_COPY, ALGO_ROBOT_EVENT_NAME, type AlgoRobotEventDetail } from "@/lib/algoRobotMessaging";
import { trackRobotMetric } from "@/lib/algoRobotExperience";

interface BootSequenceProps {
  enabled: boolean;
  reduceMotion: boolean;
}

export function EngineBootSequence({ enabled, reduceMotion }: BootSequenceProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const steps = ALGO_ROBOT_COPY.activationSteps;

  useEffect(() => {
    if (!enabled) return;
    const onceKey = "chartmate_robot_boot_seen";
    if (sessionStorage.getItem(onceKey) === "1") return;
    setVisible(true);
    void trackRobotMetric("boot_seen");

    if (reduceMotion) {
      const t = window.setTimeout(() => {
        sessionStorage.setItem(onceKey, "1");
        setVisible(false);
      }, 900);
      return () => window.clearTimeout(t);
    }

    const id = window.setInterval(() => {
      setStep((s) => Math.min(s + 1, steps.length - 1));
    }, 520);
    const finish = window.setTimeout(() => {
      sessionStorage.setItem(onceKey, "1");
      setVisible(false);
    }, 3600);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(finish);
    };
  }, [enabled, reduceMotion, steps.length]);

  if (!visible) return null;
  const progress = Math.round(((step + 1) / steps.length) * 100);

  return (
    <div className="fixed inset-0 z-[90] bg-black/95 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-xl border border-teal-500/30 rounded-2xl bg-zinc-950 p-5 space-y-4">
        <p className="text-xs tracking-[0.18em] uppercase text-zinc-500">ChartMate execution system</p>
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-teal-400" />
          <p className="text-lg font-semibold text-white">AI Trading Engine Boot Sequence</p>
        </div>
        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div className="h-full bg-teal-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-zinc-500">Progress: {progress}%</p>
        <div className="space-y-1.5">
          {steps.map((line, idx) => (
            <div key={line} className="flex items-center gap-2 text-sm">
              {idx <= step ? (
                <CheckCircle2 className="h-4 w-4 text-teal-400" />
              ) : (
                <Loader2 className={`h-4 w-4 text-zinc-600 ${idx === step + 1 ? "animate-spin" : ""}`} />
              )}
              <span className={idx <= step ? "text-zinc-200" : "text-zinc-500"}>{line}</span>
            </div>
          ))}
        </div>
        {step >= steps.length - 1 && (
          <p className="text-sm text-emerald-400 font-medium">{ALGO_ROBOT_COPY.readyLine}</p>
        )}
      </div>
    </div>
  );
}

export function ExecutionEventFeed({ enabled }: { enabled: boolean }) {
  const [events, setEvents] = useState<AlgoRobotEventDetail[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const onEvent = (evt: Event) => {
      const custom = evt as CustomEvent<AlgoRobotEventDetail>;
      if (!custom.detail) return;
      setEvents((prev) => [custom.detail, ...prev].slice(0, 6));
      void trackRobotMetric("dashboard_engaged");
    };
    window.addEventListener(ALGO_ROBOT_EVENT_NAME, onEvent as EventListener);
    return () => window.removeEventListener(ALGO_ROBOT_EVENT_NAME, onEvent as EventListener);
  }, [enabled]);

  const hasEvents = events.length > 0;
  const panelClass = useMemo(
    () =>
      `rounded-xl border p-3 bg-zinc-900/70 ${
        hasEvents ? "border-teal-500/25" : "border-zinc-800"
      }`,
    [hasEvents],
  );

  if (!enabled) return null;
  return (
    <div className={panelClass}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">Execution feed</p>
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
          <Radio className="h-3 w-3 animate-pulse" />
          Live
        </span>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-zinc-500 mt-2">
          System is listening. Strategy and order milestones will appear here.
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {events.map((evt, idx) => (
            <div key={`${evt.timestamp}-${idx}`} className="text-xs border border-zinc-800 rounded-md px-2 py-1.5">
              <p className="text-zinc-200 font-medium">{evt.title}</p>
              <p className="text-zinc-400">{evt.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
