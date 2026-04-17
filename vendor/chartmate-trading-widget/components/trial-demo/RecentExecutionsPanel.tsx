import "./trial-demo.css";
import { TRIAL_RECENT_EXECUTIONS } from "@/lib/trialDemoConstants";

export function RecentExecutionsPanel() {
  return (
    <div className="card trial-recent-exec">
      <div className="card-header">
        <div className="card-title">
          <span
            className="card-title-icon"
            style={{ background: "rgba(52,211,153,0.1)", color: "var(--accent-green)" }}
          >
            ✓
          </span>
          Recent System Executions
        </div>
        <span className="card-badge badge-green">Logged</span>
      </div>
      <div>
        {TRIAL_RECENT_EXECUTIONS.map((t) => (
          <div className="trial-recent-row" key={t.id}>
            <span className="trial-recent-id">Trade {t.id}</span>
            <span className="trial-recent-strat">Strategy: {t.strategy}</span>
            <span>Entry: {t.entry}</span>
            <span>Exit: {t.exit}</span>
            <span style={{ color: t.positive ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 700 }}>
              Result: {t.result}
            </span>
          </div>
        ))}
        <p className="trial-recent-foot">All trades are logged, tracked, and analyzed.</p>
      </div>
    </div>
  );
}
