import "./trial-demo.css";
import { TRIAL_INTEL_LINES } from "@/lib/trialDemoConstants";

export type StrategyBrainRow = {
  name: string;
  stage: number;
  subLine: number;
  status: string;
};

type Props = {
  row: StrategyBrainRow;
};

export function StrategyIntelCell({ row }: Props) {
  const lines = TRIAL_INTEL_LINES[row.stage] ?? TRIAL_INTEL_LINES[1];
  const line = lines[Math.min(row.subLine, lines.length - 1)] ?? "";
  const dotClass =
    row.stage === 1
      ? "trial-stage-1"
      : row.stage === 2
        ? "trial-stage-2"
        : row.stage === 3
          ? "trial-stage-3"
          : "trial-stage-4";

  const stageLabel =
    row.stage === 1 ? "SCAN" : row.stage === 2 ? "SETUP" : row.stage === 3 ? "VALIDATE" : "READY";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`trial-stage-dot ${dotClass}`} title={stageLabel} />
        <span className="strategy-name">{row.name}</span>
      </div>
      <div className="trial-strategy-intel">
        <div className="trial-strategy-intel-line">
          <span aria-hidden>●</span> {line}
        </div>
        {row.status === "paused" ? (
          <div className="trial-strategy-intel-line" style={{ opacity: 0.7 }}>
            <span aria-hidden>○</span> Awaiting your rules — idle
          </div>
        ) : null}
      </div>
    </div>
  );
}
