import { useEffect, useMemo, useState } from "react";
import {
  TRIAL_DEMO_PHASES,
  TRIAL_NEXT_PHASE,
  TRIAL_PHASE_TIMINGS_MS,
  type TrialDemoPhase,
} from "@/lib/trialDemoConstants";

type Opts = {
  active: boolean;
  initialPhase?: TrialDemoPhase;
};

export function useTrialPhaseMachine({ active, initialPhase = "activation" }: Opts) {
  const [phase, setPhase] = useState<TrialDemoPhase>(initialPhase);

  useEffect(() => {
    if (!active) return;
    if (phase === "activation") return;
    const next = TRIAL_NEXT_PHASE[phase];
    if (!next) return;
    const ms = TRIAL_PHASE_TIMINGS_MS[phase];
    if (!ms || ms <= 0) return;
    const id = window.setTimeout(() => setPhase(next), ms);
    return () => window.clearTimeout(id);
  }, [active, phase]);

  const phaseIndex = useMemo(() => TRIAL_DEMO_PHASES.indexOf(phase), [phase]);
  const isAtLeast = (target: TrialDemoPhase) =>
    phaseIndex >= TRIAL_DEMO_PHASES.indexOf(target);

  return {
    phase,
    setPhase,
    phaseIndex,
    isAtLeast,
  };
}
