import { useEffect, useState } from "react";
import "./trial-demo.css";
import { TRIAL_EXECUTION_STEPS } from "@/lib/trialDemoConstants";
import { playDemoTick } from "@/lib/playDemoTick";

type Props = {
  open: boolean;
  reducedMotion: boolean;
  onComplete: () => void;
};

export function ExecutionClimaxOverlay({ open, reducedMotion, onComplete }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (!open) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    const stepMs = reducedMotion ? 200 : 750;
    let i = 0;
    const timers: number[] = [];
    const runStep = () => {
      i += 1;
      setVisibleCount(i);
      if (i === TRIAL_EXECUTION_STEPS.length) {
        if (!reducedMotion) playDemoTick();
        const done = window.setTimeout(() => {
          onComplete();
        }, reducedMotion ? 400 : 900);
        timers.push(done);
        return;
      }
      timers.push(window.setTimeout(runStep, stepMs));
    };
    timers.push(window.setTimeout(runStep, reducedMotion ? 0 : 400));
    return () => timers.forEach(clearTimeout);
  }, [open, reducedMotion, onComplete]);

  if (!open) return null;

  return (
    <div className="trial-climax-overlay" role="dialog" aria-modal="true" aria-labelledby="trial-climax-title">
      <div className="trial-climax-card">
        <div id="trial-climax-title" className="trial-climax-title">
          ⚡ Strategy Trigger Identified
        </div>
        {TRIAL_EXECUTION_STEPS.map((line, idx) => {
          const show = idx < visibleCount;
          if (!show) return null;
          return (
            <div
              key={line}
              className={`trial-climax-step ${idx === visibleCount - 1 ? "trial-climax-step--active" : ""}`}
            >
              → {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}
