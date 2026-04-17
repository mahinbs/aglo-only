import "./trial-demo.css";

type Props = {
  latencyMs: number;
  executionActive: boolean;
  brokerConnected: boolean;
  riskFiltersEnabled: boolean;
};

export function SystemHealthStrip({
  latencyMs,
  executionActive,
  brokerConnected,
  riskFiltersEnabled,
}: Props) {
  return (
    <div className="trial-health-strip" aria-label="System health">
      <span className="trial-health-item">
        <span className="trial-health-dot" aria-hidden />
        <span>
          Execution Status:{" "}
          <span className="trial-health-val">{executionActive ? "ACTIVE" : "STANDBY"}</span>
        </span>
      </span>
      <span className="trial-health-item">
        Latency: <span className="trial-health-val">{latencyMs}ms</span>
      </span>
      <span className="trial-health-item">
        Risk Filters:{" "}
        <span className="trial-health-val">{riskFiltersEnabled ? "ENABLED" : "OFF"}</span>
      </span>
      <span className="trial-health-item">
        Broker Sync:{" "}
        <span className="trial-health-val">{brokerConnected ? "CONNECTED" : "RECONNECTING"}</span>
      </span>
    </div>
  );
}
