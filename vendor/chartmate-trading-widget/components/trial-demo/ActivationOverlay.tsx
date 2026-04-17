import "./trial-demo.css";

type Props = {
  progress: number;
  statusLine: string;
};

export function ActivationOverlay({ progress, statusLine }: Props) {
  const filled = Math.min(10, Math.max(0, Math.round(progress / 10)));
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  return (
    <div className="trial-activation-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="trial-activation-inner">
        <div className="trial-activation-title">Initializing Trading Engine...</div>
        <div className="trial-activation-line">{statusLine}</div>
        <div className="trial-activation-bar-wrap">
          <div className="trial-activation-bar">{bar}</div>
          <div className="trial-activation-pct">{Math.round(progress)}%</div>
        </div>
      </div>
    </div>
  );
}
